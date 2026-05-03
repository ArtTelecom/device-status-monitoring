"""
Business: Подключается к MikroTik по API (порт 8728/8729), забирает системную информацию и список интерфейсов.
Args: event с httpMethod; context с request_id
Returns: HTTP-ответ с реальными метриками роутера или ошибкой подключения
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


def write_word(sock: socket.socket, word: str):
    data = word.encode('utf-8')
    sock.send(encode_length(len(data)) + data)


def read_word(sock: socket.socket) -> str:
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


def write_sentence(sock: socket.socket, words: list[str]):
    for w in words:
        write_word(sock, w)
    write_word(sock, '')


def read_sentence(sock: socket.socket) -> list[str]:
    words = []
    while True:
        w = read_word(sock)
        if w == '':
            break
        words.append(w)
    return words


def parse_reply(words: list[str]) -> dict:
    result = {'_type': words[0] if words else ''}
    for w in words[1:]:
        if w.startswith('='):
            kv = w[1:].split('=', 1)
            if len(kv) == 2:
                result[kv[0]] = kv[1]
    return result


def login_v6(sock: socket.socket, user: str, password: str) -> tuple[bool, str]:
    """Новый метод логина (RouterOS 6.43+) — plain login"""
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


def login_legacy(sock: socket.socket, user: str, password: str) -> tuple[bool, str]:
    """Старый MD5-challenge логин (для древних RouterOS)"""
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


def query(sock: socket.socket, *cmd: str) -> list[dict]:
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
            results.append({'_error': True, **parse_reply(words)})
            break
        if words[0] == '!fatal':
            break
    return results


def fmt_uptime(s: str) -> str:
    """RouterOS uptime: 1w2d3h4m5s -> 1н 2д 3ч"""
    return s


def safe_int(v: Any, default: int = 0) -> int:
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


def handler(event: dict, context) -> dict:
    """Опрос MikroTik по API и возврат живых данных"""
    method = event.get('httpMethod', 'GET')
    cors = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    }
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': cors, 'body': ''}

    host = os.environ.get('MIKROTIK_HOST', '')
    # Приоритет: MIKROTIK_API_SSL_PORT (TLS) > MIKROTIK_PORT
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
            'body': json.dumps({
                'success': False,
                'error': 'config_missing',
                'message': 'Не заполнены секреты MIKROTIK_HOST/USER/PASSWORD',
            }, ensure_ascii=False),
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
    except ssl.SSLError as e:
        return {
            'statusCode': 200,
            'headers': {**cors, 'Content-Type': 'application/json'},
            'isBase64Encoded': False,
            'body': json.dumps({
                'success': False,
                'error': 'tls_handshake_failed',
                'message': f'TLS-рукопожатие провалилось: {e}. Проверьте: на MikroTik сертификат подписан и установлен в /ip service api-ssl certificate=...',
                'host': host,
                'port': port,
            }, ensure_ascii=False),
        }
    except Exception as e:
        return {
            'statusCode': 200,
            'headers': {**cors, 'Content-Type': 'application/json'},
            'isBase64Encoded': False,
            'body': json.dumps({
                'success': False,
                'error': type(e).__name__,
                'message': f'Ошибка подключения: {e}',
                'host': host,
                'port': port,
            }, ensure_ascii=False),
        }

    try:

        # Сначала пробуем новый login (RouterOS 6.43+)
        ok, msg = login_v6(sock, user, password)
        if not ok and 'invalid' in msg.lower():
            # На старых системах используем legacy
            sock.close()
            sock = make_socket()
            ok, msg = login_legacy(sock, user, password)

        if not ok:
            return {
                'statusCode': 200,
                'headers': {**cors, 'Content-Type': 'application/json'},
                'isBase64Encoded': False,
                'body': json.dumps({
                    'success': False,
                    'error': 'auth_failed',
                    'message': f'Авторизация на MikroTik не удалась: {msg}',
                    'host': host,
                    'port': port,
                    'user': user,
                }, ensure_ascii=False),
            }

        # Получаем системные данные
        identity = query(sock, '/system/identity/print')
        resource = query(sock, '/system/resource/print')
        routerboard = query(sock, '/system/routerboard/print')
        health = query(sock, '/system/health/print')
        interfaces = query(sock, '/interface/print')
        ip_addrs = query(sock, '/ip/address/print')

        # BGP / OSPF
        try:
            bgp_peers = query(sock, '/routing/bgp/peer/print')
        except Exception:
            bgp_peers = []
        try:
            ospf_neighbors = query(sock, '/routing/ospf/neighbor/print')
        except Exception:
            ospf_neighbors = []

        # Маршруты
        try:
            routes_v4 = query(sock, '/ip/route/print', '=count-only=')
        except Exception:
            routes_v4 = []

        sock.close()

        res = resource[0] if resource else {}
        ident = identity[0] if identity else {}
        rb = routerboard[0] if routerboard else {}

        # Health (температура, напряжение)
        health_data = {}
        for h in health:
            name = h.get('name', '')
            value = h.get('value', '')
            if name and value:
                health_data[name] = value

        ports = []
        for i, iface in enumerate(interfaces):
            ports.append({
                'index': i + 1,
                'name': iface.get('name', f'port{i}'),
                'type': iface.get('type', 'ether'),
                'mtu': iface.get('mtu', '1500'),
                'mac': iface.get('mac-address', ''),
                'running': iface.get('running') == 'true',
                'disabled': iface.get('disabled') == 'true',
                'comment': iface.get('comment', ''),
                'rx_bytes': safe_int(iface.get('rx-byte', 0)),
                'tx_bytes': safe_int(iface.get('tx-byte', 0)),
                'rx_packets': safe_int(iface.get('rx-packet', 0)),
                'tx_packets': safe_int(iface.get('tx-packet', 0)),
                'rx_errors': safe_int(iface.get('rx-error', 0)),
                'tx_errors': safe_int(iface.get('tx-error', 0)),
                'rx_drops': safe_int(iface.get('rx-drop', 0)),
                'tx_drops': safe_int(iface.get('tx-drop', 0)),
                'last_link_up': iface.get('last-link-up-time', ''),
            })

        addresses = [{'address': a.get('address', ''), 'interface': a.get('interface', '')} for a in ip_addrs]

        total_mem = safe_int(res.get('total-memory', 0))
        free_mem = safe_int(res.get('free-memory', 0))
        used_mem = total_mem - free_mem
        mem_pct = round(used_mem / total_mem * 100, 1) if total_mem > 0 else 0

        total_hdd = safe_int(res.get('total-hdd-space', 0))
        free_hdd = safe_int(res.get('free-hdd-space', 0))
        used_hdd = total_hdd - free_hdd
        hdd_pct = round(used_hdd / total_hdd * 100, 1) if total_hdd > 0 else 0

        bgp_active = sum(1 for p in bgp_peers if p.get('established') == 'true' or p.get('state') == 'established')
        ospf_full = sum(1 for n in ospf_neighbors if 'full' in str(n.get('state', '')).lower())

        response = {
            'success': True,
            'host': host,
            'fetched_at': context.request_id if context else None,
            'identity': {
                'name': ident.get('name', '—'),
            },
            'system': {
                'version': res.get('version', '—'),
                'build_time': res.get('build-time', '—'),
                'platform': res.get('platform', '—'),
                'board_name': res.get('board-name', '—'),
                'architecture': res.get('architecture-name', '—'),
                'uptime': res.get('uptime', '—'),
            },
            'routerboard': {
                'model': rb.get('model', '—'),
                'serial': rb.get('serial-number', '—'),
                'firmware_type': rb.get('firmware-type', '—'),
                'current_firmware': rb.get('current-firmware', '—'),
                'upgrade_firmware': rb.get('upgrade-firmware', '—'),
            },
            'resources': {
                'cpu_load': safe_int(res.get('cpu-load', 0)),
                'cpu_count': safe_int(res.get('cpu-count', 1)),
                'cpu_frequency': safe_int(res.get('cpu-frequency', 0)),
                'memory_total_mb': round(total_mem / 1024 / 1024, 1),
                'memory_used_mb': round(used_mem / 1024 / 1024, 1),
                'memory_pct': mem_pct,
                'storage_total_mb': round(total_hdd / 1024 / 1024, 1),
                'storage_used_mb': round(used_hdd / 1024 / 1024, 1),
                'storage_pct': hdd_pct,
            },
            'health': health_data,
            'interfaces': {
                'count': len(ports),
                'running': sum(1 for p in ports if p['running']),
                'list': ports,
            },
            'addresses': addresses,
            'routing': {
                'bgp_peers': len(bgp_peers),
                'bgp_active': bgp_active,
                'ospf_neighbors': len(ospf_neighbors),
                'ospf_full': ospf_full,
                'routes_count': safe_int(routes_v4[0].get('ret', 0)) if routes_v4 else 0,
            },
        }

        return {
            'statusCode': 200,
            'headers': {**cors, 'Content-Type': 'application/json'},
            'isBase64Encoded': False,
            'body': json.dumps(response, ensure_ascii=False),
        }

    except socket.timeout:
        try:
            sock.close()
        except Exception:
            pass
        return {
            'statusCode': 200,
            'headers': {**cors, 'Content-Type': 'application/json'},
            'isBase64Encoded': False,
            'body': json.dumps({
                'success': False,
                'error': 'timeout',
                'message': f'Таймаут подключения к {host}:{port}',
            }, ensure_ascii=False),
        }
    except ConnectionRefusedError:
        try:
            sock.close()
        except Exception:
            pass
        return {
            'statusCode': 200,
            'headers': {**cors, 'Content-Type': 'application/json'},
            'isBase64Encoded': False,
            'body': json.dumps({
                'success': False,
                'error': 'refused',
                'message': f'Соединение с {host}:{port} отклонено. API отключён или порт не пробрасывается.',
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
            'body': json.dumps({
                'success': False,
                'error': type(e).__name__,
                'message': str(e),
            }, ensure_ascii=False),
        }