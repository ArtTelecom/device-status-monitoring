"""
Опрос ONU устройств с OLT CData через SNMP v2c (чистый UDP, без внешних зависимостей).
"""
import os
import json
import socket
import struct
import logging

logger = logging.getLogger()

HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-User-Id, X-Auth-Token',
    'Content-Type': 'application/json',
}

# CData GEPON ONU OIDs (таблица 1.3.6.1.4.1.34592.1.3.4.1.1, индекс: .col.1.port.onu)
OID_EPON_BASE   = '1.3.6.1.4.1.34592.1.3.4.1.1'
OID_EPON_MAC    = '1.3.6.1.4.1.34592.1.3.4.1.1.7'   # MAC адрес ONU
OID_EPON_STATUS = '1.3.6.1.4.1.34592.1.3.4.1.1.9'   # Статус: есть=online, нет=offline
OID_EPON_RX     = '1.3.6.1.4.1.34592.1.3.4.1.1.2'   # Uptime/RX
OID_IF_OPER_STATUS  = '1.3.6.1.2.1.2.2.1.8'
OID_IF_DESCR        = '1.3.6.1.2.1.2.2.1.2'

# ─── SNMP BER encoding ────────────────────────────────────────────────────────

def encode_oid(oid_str):
    parts = [int(x) for x in oid_str.strip('.').split('.')]
    first = parts[0] * 40 + parts[1]
    body = [first]
    for p in parts[2:]:
        if p == 0:
            body.append(0)
        else:
            enc = []
            while p:
                enc.append(p & 0x7f)
                p >>= 7
            enc.reverse()
            for i, b in enumerate(enc):
                body.append(b | (0x80 if i < len(enc) - 1 else 0))
    return bytes([0x06, len(body)] + body)


def encode_length(n):
    if n < 0x80:
        return bytes([n])
    b = []
    tmp = n
    while tmp:
        b.append(tmp & 0xff)
        tmp >>= 8
    b.reverse()
    return bytes([0x80 | len(b)] + b)


def encode_sequence(*items):
    body = b''.join(items)
    return bytes([0x30]) + encode_length(len(body)) + body


def encode_int(n):
    if n == 0:
        return bytes([0x02, 0x01, 0x00])
    b = []
    tmp = n if n > 0 else (~n)
    while tmp:
        b.append(tmp & 0xff)
        tmp >>= 8
    if n > 0 and b[-1] & 0x80:
        b.append(0)
    if n < 0 and not (b[-1] & 0x80):
        b.append(0xff)
    b.reverse()
    return bytes([0x02]) + encode_length(len(b)) + bytes(b)


def encode_string(s):
    b = s.encode('latin-1') if isinstance(s, str) else bytes(s)
    return bytes([0x04]) + encode_length(len(b)) + b


def encode_null():
    return bytes([0x05, 0x00])


def build_getnext(community, request_id, oid_str):
    oid = encode_oid(oid_str)
    varbind = encode_sequence(oid, encode_null())
    varbind_list = encode_sequence(varbind)
    pdu = bytes([0xa1]) + encode_length(
        len(encode_int(request_id)) + len(encode_int(0)) + len(encode_int(0)) + len(varbind_list)
    ) + encode_int(request_id) + encode_int(0) + encode_int(0) + varbind_list
    msg = encode_sequence(encode_int(1), encode_string(community), pdu)
    return msg


def decode_length(data, pos):
    b = data[pos]
    if b < 0x80:
        return b, pos + 1
    n = b & 0x7f
    val = 0
    for i in range(n):
        val = (val << 8) | data[pos + 1 + i]
    return val, pos + 1 + n


def decode_oid(data, pos, length):
    end = pos + length
    first = data[pos]
    parts = [first // 40, first % 40]
    pos += 1
    while pos < end:
        val = 0
        while pos < end:
            b = data[pos]; pos += 1
            val = (val << 7) | (b & 0x7f)
            if not (b & 0x80):
                break
        parts.append(val)
    return '.'.join(str(p) for p in parts)


def decode_value(tag, data, pos, length):
    raw = data[pos:pos + length]
    if tag == 0x02:  # INTEGER
        val = 0
        for b in raw:
            val = (val << 8) | b
        if raw and raw[0] & 0x80:
            val -= 1 << (len(raw) * 8)
        return val
    elif tag == 0x04:  # OCTET STRING
        return raw
    elif tag == 0x06:  # OID
        return decode_oid(data, pos, length)
    elif tag in (0x40, 0x41, 0x42, 0x43, 0x44, 0x45, 0x46, 0x47):  # SNMP types
        val = 0
        for b in raw:
            val = (val << 8) | b
        return val
    return raw


def parse_response(data):
    """Извлекает (oid, value) из SNMP GetNext ответа."""
    try:
        pos = 2  # skip outer sequence tag+len (simplified)
        l, pos = decode_length(data, 1)
        # version
        pos += 1; vl, pos = decode_length(data, pos); pos += vl
        # community
        pos += 1; cl, pos = decode_length(data, pos); pos += cl
        # PDU tag
        pos += 1; pl, pos = decode_length(data, pos)
        # request-id, error-status, error-index
        pos += 1; il, pos = decode_length(data, pos); pos += il
        pos += 1; il, pos = decode_length(data, pos); pos += il
        pos += 1; il, pos = decode_length(data, pos); pos += il
        # varbind list
        pos += 1; ll, pos = decode_length(data, pos)
        # varbind
        pos += 1; vbl, pos = decode_length(data, pos)
        # OID
        oid_tag = data[pos]; pos += 1
        oid_len, pos = decode_length(data, pos)
        oid_val = decode_oid(data, pos, oid_len)
        pos += oid_len
        # value
        val_tag = data[pos]; pos += 1
        val_len, pos = decode_length(data, pos)
        val = decode_value(val_tag, data, pos, val_len)
        return oid_val, val
    except Exception as e:
        return None, None


def snmp_walk(community, host, port, base_oid, timeout=3, max_rows=512, full_suffix=False):
    """SNMP walk через чистый UDP сокет."""
    result = {}
    current_oid = base_oid
    req_id = 1

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.settimeout(timeout)

    try:
        while req_id <= max_rows:
            pkt = build_getnext(community, req_id, current_oid)
            sock.sendto(pkt, (host, port))
            try:
                resp, _ = sock.recvfrom(4096)
            except socket.timeout:
                break

            oid_val, value = parse_response(resp)
            if oid_val is None:
                break
            if not oid_val.startswith(base_oid + '.'):
                break

            suffix = oid_val[len(base_oid) + 1:]
            idx = suffix if full_suffix else suffix.split('.')[-1]
            result[idx] = value
            current_oid = oid_val
            req_id += 1
    finally:
        sock.close()

    return result


def format_mac(raw):
    try:
        if isinstance(raw, bytes):
            return ':'.join(f'{b:02X}' for b in raw)
        s = str(raw)
        clean = s.replace('0x', '').replace(':', '').replace('-', '').replace(' ', '')
        if len(clean) == 12:
            return ':'.join(clean[i:i+2] for i in range(0, 12, 2)).upper()
        return s
    except Exception:
        return str(raw)


def handler(event: dict, context) -> dict:
    """Опрос OLT CData через SNMP v2c UDP, возвращает список ONU."""
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': HEADERS, 'body': ''}

    community = os.environ.get('OLT_SNMP_COMMUNITY', 'public')
    host = os.environ.get('OLT_HOST', '83.239.227.75')
    port = int(os.environ.get('OLT_SNMP_PORT', '161'))

    logger.warning(f"SNMP poll start: {host}:{port} community={community}")

    params = event.get('queryStringParameters') or {}
    if params.get('debug') == '1':
        result = {}
        base = '1.3.6.1.4.1.34592.1.3.4.1.1'
        for col in range(1, 12):
            oid = f'{base}.{col}'
            rows = snmp_walk(community, host, port, oid, timeout=5, max_rows=10, full_suffix=True)
            result[f'col{col}'] = {k: (v.hex() if isinstance(v, bytes) else v) for k, v in list(rows.items())[:5]}
        return {'statusCode': 200, 'headers': HEADERS, 'body': json.dumps(result)}

    try:
        # Индекс: 1.PORT.ONU_NUM (PORT=1-4, ONU_NUM=1-64)
        online_keys = snmp_walk(community, host, port, OID_EPON_STATUS, timeout=5, max_rows=512, full_suffix=True)
        macs        = snmp_walk(community, host, port, OID_EPON_MAC,    timeout=5, max_rows=512, full_suffix=True)
        logger.warning(f"EPON online keys: {list(online_keys.keys())[:10]}, macs: {list(macs.keys())[:5]}")

        # Объединяем все найденные ключи
        all_keys = set(online_keys.keys()) | set(macs.keys())
        # Фильтруем только ключи вида 1.PORT.ONU (3 части)
        valid_keys = [k for k in all_keys if len(k.split('.')) == 3 and k.startswith('1.')]

        onu_list = []
        for key in sorted(valid_keys, key=lambda x: [int(i) for i in x.split('.')]):
            parts = key.split('.')
            port_num = parts[1]
            onu_num  = parts[2]
            is_online = key in online_keys
            mac_raw = macs.get(key)
            mac = format_mac(mac_raw) if mac_raw else ''
            status = 'online' if is_online else 'offline'
            onu_list.append({
                'id':     f'P{port_num}-ONU{onu_num.zfill(2)}',
                'index':  key,
                'mac':    mac,
                'sn':     '',
                'status': status,
                'signal': None,
                'tx':     None,
                'olt':    'OLT-01',
                'port':   f'EPON0/{port_num}',
                'ip':     '',
                'uptime': '',
                'model':  'CData GEPON',
            })

        return {
            'statusCode': 200,
            'headers': HEADERS,
            'body': json.dumps({
                'onu_list': onu_list,
                'total':    len(onu_list),
                'online':   sum(1 for o in onu_list if o['status'] == 'online'),
                'offline':  sum(1 for o in onu_list if o['status'] == 'offline'),
                'warning':  0,
                'host':     host,
                'snmp_port': port,
            })
        }

    except Exception as e:
        logger.warning(f"handler error: {e}")
        return {
            'statusCode': 500,
            'headers': HEADERS,
            'body': json.dumps({'error': str(e), 'onu_list': [], 'host': host})
        }