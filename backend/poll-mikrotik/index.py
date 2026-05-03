"""
Business: Опрашивает MikroTik роутер по SNMP, возвращает метрики (CPU, RAM, температура, аптайм, трафик по интерфейсам).
Args: event с httpMethod, queryStringParameters (host, community, port); context с request_id
Returns: HTTP-ответ с JSON-метриками роутера или ошибкой проверки доступности
"""

import json
import os
import socket
import struct
from typing import Any


def encode_length(length: int) -> bytes:
    if length < 128:
        return bytes([length])
    if length < 256:
        return bytes([0x81, length])
    return bytes([0x82, (length >> 8) & 0xFF, length & 0xFF])


def encode_oid(oid: str) -> bytes:
    parts = [int(p) for p in oid.split('.') if p]
    encoded = bytes([parts[0] * 40 + parts[1]])
    for p in parts[2:]:
        if p < 128:
            encoded += bytes([p])
        else:
            stack = []
            stack.append(p & 0x7F)
            p >>= 7
            while p:
                stack.append((p & 0x7F) | 0x80)
                p >>= 7
            encoded += bytes(reversed(stack))
    return bytes([0x06]) + encode_length(len(encoded)) + encoded


def encode_int(val: int) -> bytes:
    if val == 0:
        return bytes([0x02, 0x01, 0x00])
    raw = val.to_bytes((val.bit_length() + 8) // 8, 'big', signed=True)
    return bytes([0x02]) + encode_length(len(raw)) + raw


def encode_string(s: bytes) -> bytes:
    return bytes([0x04]) + encode_length(len(s)) + s


def build_snmp_get(community: str, oids: list[str], request_id: int = 1) -> bytes:
    varbinds = b''
    for oid in oids:
        oid_bytes = encode_oid(oid)
        null_val = bytes([0x05, 0x00])
        vb = oid_bytes + null_val
        varbinds += bytes([0x30]) + encode_length(len(vb)) + vb
    varbind_list = bytes([0x30]) + encode_length(len(varbinds)) + varbinds
    pdu_inner = encode_int(request_id) + encode_int(0) + encode_int(0) + varbind_list
    pdu = bytes([0xA0]) + encode_length(len(pdu_inner)) + pdu_inner
    msg = encode_int(1) + encode_string(community.encode()) + pdu
    return bytes([0x30]) + encode_length(len(msg)) + msg


def parse_length(data: bytes, offset: int) -> tuple[int, int]:
    first = data[offset]
    if first < 128:
        return first, offset + 1
    n = first & 0x7F
    length = 0
    for i in range(n):
        length = (length << 8) | data[offset + 1 + i]
    return length, offset + 1 + n


def parse_oid(data: bytes, offset: int, length: int) -> str:
    parts = []
    end = offset + length
    first_byte = data[offset]
    parts.append(str(first_byte // 40))
    parts.append(str(first_byte % 40))
    offset += 1
    while offset < end:
        val = 0
        while offset < end and data[offset] & 0x80:
            val = (val << 7) | (data[offset] & 0x7F)
            offset += 1
        if offset < end:
            val = (val << 7) | data[offset]
            offset += 1
        parts.append(str(val))
    return '.'.join(parts)


def parse_value(data: bytes, offset: int) -> tuple[Any, int]:
    tag = data[offset]
    length, val_offset = parse_length(data, offset + 1)
    end = val_offset + length
    
    if tag == 0x02 or tag == 0x41 or tag == 0x42 or tag == 0x43 or tag == 0x46:
        val = 0
        for i in range(length):
            val = (val << 8) | data[val_offset + i]
        if tag == 0x02 and length > 0 and (data[val_offset] & 0x80):
            val -= 1 << (length * 8)
        return val, end
    elif tag == 0x04:
        try:
            return data[val_offset:end].decode('utf-8', errors='replace'), end
        except Exception:
            return data[val_offset:end].hex(), end
    elif tag == 0x05:
        return None, end
    elif tag == 0x06:
        return parse_oid(data, val_offset, length), end
    elif tag == 0x40:
        return '.'.join(str(b) for b in data[val_offset:end]), end
    elif tag == 0x44:
        return data[val_offset:end].hex(':'), end
    else:
        return data[val_offset:end].hex(), end


def parse_snmp_response(data: bytes) -> dict:
    offset = 0
    if data[offset] != 0x30:
        raise ValueError("Invalid SNMP response")
    _, offset = parse_length(data, offset + 1)
    
    _, offset = parse_value(data, offset)
    
    tag = data[offset]
    length, val_offset = parse_length(data, offset + 1)
    offset = val_offset + length
    
    if data[offset] not in (0xA2, 0xA0):
        offset = val_offset
    else:
        _, offset = parse_length(data, offset + 1)
    
    _, offset = parse_value(data, offset)
    error_status, offset = parse_value(data, offset)
    _, offset = parse_value(data, offset)
    
    if data[offset] != 0x30:
        return {'error_status': error_status, 'values': {}}
    _, offset = parse_length(data, offset + 1)
    
    values = {}
    while offset < len(data):
        if data[offset] != 0x30:
            break
        vb_len, vb_off = parse_length(data, offset + 1)
        vb_end = vb_off + vb_len
        oid, val_off = parse_value(data, vb_off)
        value, _ = parse_value(data, val_off)
        values[oid] = value
        offset = vb_end
    
    return {'error_status': error_status, 'values': values}


def snmp_get(host: str, community: str, oids: list[str], port: int = 161, timeout: float = 5.0) -> dict:
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.settimeout(timeout)
    try:
        packet = build_snmp_get(community, oids, request_id=12345)
        sock.sendto(packet, (host, port))
        data, _ = sock.recvfrom(8192)
        return parse_snmp_response(data)
    finally:
        sock.close()


MIKROTIK_OIDS = {
    'sysDescr': '1.3.6.1.2.1.1.1.0',
    'sysUptime': '1.3.6.1.2.1.1.3.0',
    'sysContact': '1.3.6.1.2.1.1.4.0',
    'sysName': '1.3.6.1.2.1.1.5.0',
    'sysLocation': '1.3.6.1.2.1.1.6.0',
    'cpuLoad': '1.3.6.1.2.1.25.3.3.1.2.1',
    'memTotal': '1.3.6.1.2.1.25.2.3.1.5.65536',
    'memUsed': '1.3.6.1.2.1.25.2.3.1.6.65536',
    'mtxrSerial': '1.3.6.1.4.1.14988.1.1.7.3.0',
    'mtxrFirmware': '1.3.6.1.4.1.14988.1.1.7.4.0',
    'mtxrModel': '1.3.6.1.4.1.14988.1.1.7.8.0',
    'mtxrCpuTemp': '1.3.6.1.4.1.14988.1.1.3.11.0',
    'mtxrBoardTemp': '1.3.6.1.4.1.14988.1.1.3.10.0',
    'mtxrVoltage': '1.3.6.1.4.1.14988.1.1.3.8.0',
    'ifNumber': '1.3.6.1.2.1.2.1.0',
}


def format_uptime(ticks: int) -> str:
    seconds = ticks // 100
    days = seconds // 86400
    hours = (seconds % 86400) // 3600
    minutes = (seconds % 3600) // 60
    return f"{days}д {hours}ч {minutes}м"


def handler(event: dict, context) -> dict:
    """Опрашивает MikroTik по SNMP и возвращает базовые метрики"""
    method = event.get('httpMethod', 'GET')
    
    cors_headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
    }
    
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': cors_headers, 'body': ''}
    
    params = event.get('queryStringParameters') or {}
    host = params.get('host') or os.environ.get('MIKROTIK_HOST', '83.239.227.75')
    community = params.get('community') or os.environ.get('MIKROTIK_COMMUNITY', 'monitoring')
    port = int(params.get('port') or '161')
    
    try:
        oid_keys = list(MIKROTIK_OIDS.keys())
        oid_list = [MIKROTIK_OIDS[k] for k in oid_keys]
        
        result = snmp_get(host, community, oid_list, port=port, timeout=5.0)
        values = result.get('values', {})
        
        oid_to_key = {v: k for k, v in MIKROTIK_OIDS.items()}
        named = {}
        for oid, val in values.items():
            key = oid_to_key.get(oid, oid)
            named[key] = val
        
        try:
            mem_total = int(named.get('memTotal', 0)) if named.get('memTotal') else 0
            mem_used = int(named.get('memUsed', 0)) if named.get('memUsed') else 0
            mem_pct = round(mem_used / mem_total * 100, 1) if mem_total > 0 else None
        except Exception:
            mem_pct = None
        
        uptime_raw = named.get('sysUptime')
        uptime_str = format_uptime(int(uptime_raw)) if isinstance(uptime_raw, int) else str(uptime_raw or '—')
        
        response = {
            'success': True,
            'host': host,
            'port': port,
            'reachable': True,
            'system': {
                'description': named.get('sysDescr', '—'),
                'name': named.get('sysName', '—'),
                'contact': named.get('sysContact', '—'),
                'location': named.get('sysLocation', '—'),
                'uptime': uptime_str,
                'uptime_ticks': uptime_raw,
            },
            'mikrotik': {
                'serial': named.get('mtxrSerial', '—'),
                'firmware': named.get('mtxrFirmware', '—'),
                'model': named.get('mtxrModel', '—'),
            },
            'resources': {
                'cpu_load': named.get('cpuLoad'),
                'memory_total_kb': named.get('memTotal'),
                'memory_used_kb': named.get('memUsed'),
                'memory_pct': mem_pct,
                'cpu_temperature': named.get('mtxrCpuTemp'),
                'board_temperature': named.get('mtxrBoardTemp'),
                'voltage_mv': named.get('mtxrVoltage'),
            },
            'interfaces_count': named.get('ifNumber'),
            'raw': named,
        }
        
        return {
            'statusCode': 200,
            'headers': {**cors_headers, 'Content-Type': 'application/json'},
            'isBase64Encoded': False,
            'body': json.dumps(response, ensure_ascii=False),
        }
    
    except socket.timeout:
        return {
            'statusCode': 200,
            'headers': {**cors_headers, 'Content-Type': 'application/json'},
            'isBase64Encoded': False,
            'body': json.dumps({
                'success': False,
                'host': host,
                'port': port,
                'reachable': False,
                'error': 'timeout',
                'message': f'Нет ответа от {host}:{port} за 5 секунд. Проверьте: SNMP включён, firewall пропускает UDP 161, community правильный.',
            }, ensure_ascii=False),
        }
    except Exception as e:
        return {
            'statusCode': 200,
            'headers': {**cors_headers, 'Content-Type': 'application/json'},
            'isBase64Encoded': False,
            'body': json.dumps({
                'success': False,
                'host': host,
                'port': port,
                'reachable': False,
                'error': type(e).__name__,
                'message': str(e),
            }, ensure_ascii=False),
        }
