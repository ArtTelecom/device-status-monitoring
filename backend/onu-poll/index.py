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

# CData GPON ONU OIDs
OID_CDATA_ONU_STATE = '1.3.6.1.4.1.34592.1.3.5.1.1.5'
OID_CDATA_ONU_MAC   = '1.3.6.1.4.1.34592.1.3.5.1.1.3'
OID_CDATA_ONU_SN    = '1.3.6.1.4.1.34592.1.3.5.1.1.2'
OID_CDATA_ONU_RX    = '1.3.6.1.4.1.34592.1.3.5.1.1.8'
OID_CDATA_ONU_TX    = '1.3.6.1.4.1.34592.1.3.5.1.1.9'
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


def snmp_walk(community, host, port, base_oid, timeout=3, max_rows=512):
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
            idx = suffix.split('.')[-1]
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

    errors = {}
    try:
        states = snmp_walk(community, host, port, OID_CDATA_ONU_STATE)
        logger.warning(f"states: {len(states)} rows")

        macs = snmp_walk(community, host, port, OID_CDATA_ONU_MAC)
        rxs  = snmp_walk(community, host, port, OID_CDATA_ONU_RX)
        txs  = snmp_walk(community, host, port, OID_CDATA_ONU_TX)
        sns  = snmp_walk(community, host, port, OID_CDATA_ONU_SN)

        onu_list = []

        if states:
            for idx, state_val in states.items():
                try:
                    state_int = int(state_val)
                except Exception:
                    state_int = 0

                if state_int == 1:
                    status = 'online'
                elif state_int == 2:
                    status = 'offline'
                else:
                    status = 'unknown'

                try:
                    rx_int = int(rxs.get(idx, 0))
                    rx = round(rx_int / 1000.0, 2) if rx_int != 0 else None
                except Exception:
                    rx = None

                try:
                    tx_int = int(txs.get(idx, 0))
                    tx = round(tx_int / 1000.0, 2) if tx_int != 0 else None
                except Exception:
                    tx = None

                if status == 'online' and rx is not None and rx < -28:
                    status = 'warning'

                mac_raw = macs.get(idx)
                mac = format_mac(mac_raw) if mac_raw else ''
                sn  = str(sns.get(idx, ''))

                onu_list.append({
                    'id':     f'ONU-{str(idx).zfill(3)}',
                    'index':  idx,
                    'mac':    mac,
                    'sn':     sn,
                    'status': status,
                    'signal': rx,
                    'tx':     tx,
                    'olt':    'OLT-01',
                    'port':   f'1/1/{idx}',
                    'ip':     '',
                    'uptime': '',
                    'model':  'CData OLT',
                })
        else:
            errors['cdata'] = 'CData OID пустой, пробуем ifOperStatus'
            if_status = snmp_walk(community, host, port, OID_IF_OPER_STATUS)
            if_descr  = snmp_walk(community, host, port, OID_IF_DESCR)
            logger.warning(f"fallback ifOperStatus: {len(if_status)} rows")
            for idx, val in if_status.items():
                descr = str(if_descr.get(idx, ''))
                if 'onu' not in descr.lower() and 'gpon' not in descr.lower() and 'epon' not in descr.lower():
                    continue
                st = 'online' if int(val) == 1 else 'offline'
                onu_list.append({
                    'id':     f'ONU-{str(idx).zfill(3)}',
                    'index':  idx,
                    'mac':    '', 'sn': '',
                    'status': st,
                    'signal': None, 'tx': None,
                    'olt':    'OLT-01',
                    'port':   descr,
                    'ip':     '', 'uptime': '',
                    'model':  'CData OLT',
                })

        return {
            'statusCode': 200,
            'headers': HEADERS,
            'body': json.dumps({
                'onu_list':  onu_list,
                'total':     len(onu_list),
                'online':    sum(1 for o in onu_list if o['status'] == 'online'),
                'offline':   sum(1 for o in onu_list if o['status'] == 'offline'),
                'warning':   sum(1 for o in onu_list if o['status'] == 'warning'),
                'host':      host,
                'snmp_port': port,
                'errors':    errors,
            })
        }

    except Exception as e:
        logger.warning(f"handler error: {e}")
        return {
            'statusCode': 500,
            'headers': HEADERS,
            'body': json.dumps({'error': str(e), 'onu_list': [], 'host': host})
        }