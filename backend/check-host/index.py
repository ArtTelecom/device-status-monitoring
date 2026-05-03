"""
Business: Проверяет доступность хоста по нескольким TCP-портам и UDP/161 (SNMP), возвращает диагностику.
Args: event с queryStringParameters (host, ports); context с request_id
Returns: HTTP-ответ с JSON, какие порты отвечают, какие нет
"""

import json
import os
import socket
from typing import Any


def check_tcp(host: str, port: int, timeout: float = 3.0) -> dict:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(timeout)
    try:
        sock.connect((host, port))
        return {'port': port, 'protocol': 'tcp', 'open': True, 'error': None}
    except socket.timeout:
        return {'port': port, 'protocol': 'tcp', 'open': False, 'error': 'timeout'}
    except ConnectionRefusedError:
        return {'port': port, 'protocol': 'tcp', 'open': False, 'error': 'refused'}
    except OSError as e:
        return {'port': port, 'protocol': 'tcp', 'open': False, 'error': str(e)}
    finally:
        sock.close()


def check_udp_snmp(host: str, port: int = 161, community: str = 'public', timeout: float = 3.0) -> dict:
    """Шлёт SNMP-GET sysDescr и ждёт ответа"""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.settimeout(timeout)
    try:
        # Минимальный SNMPv2c GET для 1.3.6.1.2.1.1.1.0
        comm = community.encode()
        packet = bytes([
            0x30, 0x29 + len(comm) - 6,
            0x02, 0x01, 0x01,
            0x04, len(comm), *comm,
            0xA0, 0x1C,
            0x02, 0x04, 0x00, 0x00, 0x30, 0x39,
            0x02, 0x01, 0x00,
            0x02, 0x01, 0x00,
            0x30, 0x0E,
            0x30, 0x0C,
            0x06, 0x08, 0x2B, 0x06, 0x01, 0x02, 0x01, 0x01, 0x01, 0x00,
            0x05, 0x00,
        ])
        sock.sendto(packet, (host, port))
        data, _ = sock.recvfrom(4096)
        return {'port': port, 'protocol': 'udp', 'open': True, 'error': None, 'response_bytes': len(data)}
    except socket.timeout:
        return {'port': port, 'protocol': 'udp', 'open': False, 'error': 'timeout (нет ответа)'}
    except Exception as e:
        return {'port': port, 'protocol': 'udp', 'open': False, 'error': str(e)}
    finally:
        sock.close()


def handler(event: dict, context) -> dict:
    """Диагностирует доступность хоста"""
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
    host = params.get('host', '83.239.227.75')
    community = params.get('community', 'monitoring')
    
    # Проверяем популярные порты, чтобы понять, что вообще отвечает
    tcp_ports_to_check = [
        (21, 'FTP'),
        (22, 'SSH'),
        (53, 'DNS'),
        (80, 'HTTP'),
        (443, 'HTTPS'),
        (8291, 'Winbox'),
        (8728, 'MikroTik API'),
        (8729, 'MikroTik API-SSL'),
        (63475, 'Winbox custom'),
    ]
    
    tcp_results = []
    for port, name in tcp_ports_to_check:
        result = check_tcp(host, port, timeout=2.5)
        result['service'] = name
        tcp_results.append(result)
    
    # SNMP UDP/161
    snmp_result = check_udp_snmp(host, 161, community, timeout=4.0)
    snmp_result['service'] = 'SNMP'
    
    open_tcp = [r for r in tcp_results if r['open']]
    
    response = {
        'host': host,
        'community_tested': community,
        'tcp_checks': tcp_results,
        'udp_snmp_check': snmp_result,
        'summary': {
            'reachable_at_all': len(open_tcp) > 0 or snmp_result['open'],
            'open_tcp_ports': [r['port'] for r in open_tcp],
            'snmp_works': snmp_result['open'],
            'verdict': (
                'Хост недоступен — ни один порт не отвечает. Возможно, IP не принадлежит вам или провайдер режет всё.'
                if (len(open_tcp) == 0 and not snmp_result['open']) else
                'SNMP работает!'
                if snmp_result['open'] else
                f'Хост ОТВЕЧАЕТ по портам: {[r["port"] for r in open_tcp]}, но SNMP/161 — НЕТ. Значит IP ваш, но SNMP режется firewall провайдера или не пробрасывается.'
            ),
        }
    }
    
    return {
        'statusCode': 200,
        'headers': {**cors_headers, 'Content-Type': 'application/json'},
        'isBase64Encoded': False,
        'body': json.dumps(response, ensure_ascii=False, indent=2),
    }
