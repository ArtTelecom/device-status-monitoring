"""
Business: Возвращает список клиентов MikroTik — DHCP-лизы + ARP, объединённые по MAC.
Args: event с httpMethod; context с request_id
Returns: HTTP-ответ со списком клиентов (IP, MAC, имя, статус, интерфейс)
"""

import json
import os
import socket
import ssl
import hashlib
from typing import Any


def encode_length(length: int) -> bytes:
    if length < 0x80:
        return bytes([length])
    elif length < 0x4000:
        length |= 0x8000
        return length.to_bytes(2, 'big')
    elif length < 0x200000:
        length |= 0xC00000
        return length.to_bytes(3, 'big')
    elif length < 0x10000000:
        length |= 0xE0000000
        return length.to_bytes(4, 'big')
    else:
        return b'\xF0' + length.to_bytes(4, 'big')


def decode_length(sock: socket.socket) -> int:
    b = sock.recv(1)
    if not b:
        return 0
    first = b[0]
    if first < 0x80:
        return first
    elif first < 0xC0:
        rest = sock.recv(1)
        return ((first & 0x3F) << 8) + rest[0]
    elif first < 0xE0:
        rest = sock.recv(2)
        return ((first & 0x1F) << 16) + (rest[0] << 8) + rest[1]
    elif first < 0xF0:
        rest = sock.recv(3)
        return ((first & 0x0F) << 24) + (rest[0] << 16) + (rest[1] << 8) + rest[2]
    else:
        rest = sock.recv(4)
        return (rest[0] << 24) + (rest[1] << 16) + (rest[2] << 8) + rest[3]


def write_word(sock, word: str):
    data = word.encode('utf-8')
    sock.send(encode_length(len(data)) + data)


def read_word(sock) -> str:
    length = decode_length(sock)
    if length == 0:
        return ''
    buf = b''
    while len(buf) < length:
        chunk = sock.recv(length - len(buf))
        if not chunk:
            break
        buf += chunk
    return buf.decode('utf-8', errors='replace')


def write_sentence(sock, words: list):
    for w in words:
        write_word(sock, w)
    write_word(sock, '')


def read_sentence(sock) -> list:
    words = []
    while True:
        w = read_word(sock)
        if w == '':
            break
        words.append(w)
    return words


def parse_reply(words: list) -> dict:
    result = {'_type': words[0] if words else ''}
    for w in words[1:]:
        if w.startswith('='):
            kv = w[1:].split('=', 1)
            if len(kv) == 2:
                result[kv[0]] = kv[1]
    return result


def login_v6(sock, user: str, password: str):
    write_sentence(sock, ['/login', f'=name={user}', f'=password={password}'])
    while True:
        words = read_sentence(sock)
        if not words:
            return False, 'empty response'
        if words[0] == '!done':
            return True, ''
        if words[0] == '!trap':
            for w in words[1:]:
                if w.startswith('=message='):
                    return False, w[len('=message='):]
            return False, 'login failed'
        if words[0] == '!fatal':
            return False, words[1] if len(words) > 1 else 'fatal'


def login_legacy(sock, user: str, password: str):
    write_sentence(sock, ['/login'])
    words = read_sentence(sock)
    if not words or words[0] != '!done':
        return False, 'no challenge'
    challenge = None
    for w in words[1:]:
        if w.startswith('=ret='):
            challenge = w[len('=ret='):]
    if not challenge:
        return False, 'no challenge token'
    md = hashlib.md5()
    md.update(b'\x00')
    md.update(password.encode())
    md.update(bytes.fromhex(challenge))
    response = '00' + md.hexdigest()
    write_sentence(sock, ['/login', f'=name={user}', f'=response={response}'])
    while True:
        w = read_sentence(sock)
        if not w:
            return False, 'empty'
        if w[0] == '!done':
            return True, ''
        if w[0] == '!trap':
            return False, 'auth failed'


def query(sock, *cmd: str) -> list:
    write_sentence(sock, list(cmd))
    results = []
    while True:
        words = read_sentence(sock)
        if not words:
            break
        if words[0] == '!done':
            break
        if words[0] == '!re':
            results.append(parse_reply(words))
        if words[0] == '!trap':
            break
        if words[0] == '!fatal':
            break
    return results


def handler(event: dict, context) -> dict:
    """Список устройств на MikroTik (DHCP + ARP)"""
    method = event.get('httpMethod', 'GET')
    cors = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    }
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': cors, 'body': ''}

    host = os.environ.get('MIKROTIK_HOST', '')
    ssl_port = os.environ.get('MIKROTIK_API_SSL_PORT', '').strip()
    if ssl_port:
        port = int(ssl_port)
    else:
        port = int(os.environ.get('MIKROTIK_PORT', '8728'))
    user = os.environ.get('MIKROTIK_USER', '')
    password = os.environ.get('MIKROTIK_PASSWORD', '')

    if not host or not user or not password:
        return {
            'statusCode': 200,
            'headers': {**cors, 'Content-Type': 'application/json'},
            'isBase64Encoded': False,
            'body': json.dumps({'success': False, 'message': 'Не заполнены секреты'}, ensure_ascii=False),
        }

    use_tls = port == 8729 or os.environ.get('MIKROTIK_USE_TLS', '').lower() == 'true'

    def make_socket():
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(15.0)
        s.connect((host, port))
        if use_tls:
            ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            ctx.minimum_version = ssl.TLSVersion.TLSv1
            try:
                ctx.set_ciphers('ALL:@SECLEVEL=0')
            except ssl.SSLError:
                pass
            ctx.options &= ~ssl.OP_NO_SSLv3
            s = ctx.wrap_socket(s, server_hostname=None)
        return s

    try:
        sock = make_socket()
        ok, msg = login_v6(sock, user, password)
        if not ok and 'invalid' in msg.lower():
            sock.close()
            sock = make_socket()
            ok, msg = login_legacy(sock, user, password)
        if not ok:
            sock.close()
            return {
                'statusCode': 200,
                'headers': {**cors, 'Content-Type': 'application/json'},
                'isBase64Encoded': False,
                'body': json.dumps({'success': False, 'message': f'Авторизация: {msg}'}, ensure_ascii=False),
            }

        try:
            leases = query(sock, '/ip/dhcp-server/lease/print')
        except Exception:
            leases = []
        try:
            arp = query(sock, '/ip/arp/print')
        except Exception:
            arp = []

        sock.close()

        clients = {}
        for l in leases:
            mac = (l.get('mac-address') or '').upper()
            if not mac:
                continue
            clients[mac] = {
                'mac': mac,
                'ip': l.get('address', ''),
                'hostname': l.get('host-name', '') or l.get('comment', ''),
                'server': l.get('server', ''),
                'status': l.get('status', ''),
                'last_seen': l.get('last-seen', ''),
                'dynamic': l.get('dynamic') == 'true',
                'blocked': l.get('blocked') == 'true',
                'disabled': l.get('disabled') == 'true',
                'expires_after': l.get('expires-after', ''),
                'comment': l.get('comment', ''),
                'source': 'dhcp',
                'interface': '',
                'reachable': False,
            }

        for a in arp:
            mac = (a.get('mac-address') or '').upper()
            if not mac:
                continue
            iface = a.get('interface', '')
            complete = a.get('complete') == 'true'
            ip = a.get('address', '')
            if mac in clients:
                clients[mac]['interface'] = iface
                clients[mac]['reachable'] = complete
                if not clients[mac]['ip']:
                    clients[mac]['ip'] = ip
            else:
                clients[mac] = {
                    'mac': mac,
                    'ip': ip,
                    'hostname': a.get('comment', ''),
                    'server': '',
                    'status': 'arp-only',
                    'last_seen': '',
                    'dynamic': a.get('dynamic') == 'true',
                    'blocked': False,
                    'disabled': a.get('disabled') == 'true',
                    'expires_after': '',
                    'comment': a.get('comment', ''),
                    'source': 'arp',
                    'interface': iface,
                    'reachable': complete,
                }

        result = list(clients.values())
        result.sort(key=lambda x: (not x['reachable'], x['ip']))

        bound_count = sum(1 for c in result if c['status'] == 'bound')
        online_count = sum(1 for c in result if c['reachable'])

        return {
            'statusCode': 200,
            'headers': {**cors, 'Content-Type': 'application/json'},
            'isBase64Encoded': False,
            'body': json.dumps({
                'success': True,
                'total': len(result),
                'online': online_count,
                'bound': bound_count,
                'clients': result,
            }, ensure_ascii=False),
        }
    except Exception as e:
        try:
            sock.close()
        except Exception:
            pass
        return {
            'statusCode': 200,
            'headers': {**cors, 'Content-Type': 'application/json'},
            'isBase64Encoded': False,
            'body': json.dumps({'success': False, 'message': str(e)}, ensure_ascii=False),
        }
