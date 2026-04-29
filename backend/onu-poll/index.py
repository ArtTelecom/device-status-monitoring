"""
Опрос ONU устройств с OLT CData через SNMP.
Возвращает список ONU с их статусом, уровнем сигнала и параметрами.
"""
import os
import json
import puresnmp

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
# Fallback standard OIDs
OID_IF_OPER_STATUS  = '1.3.6.1.2.1.2.2.1.8'
OID_IF_DESCR        = '1.3.6.1.2.1.2.2.1.2'


def get_snmp_host():
    host_full = os.environ.get('OLT_HOST', '')
    if ':' in host_full:
        parts = host_full.rsplit(':', 1)
        return parts[0], int(parts[1])
    return host_full, 161


def snmp_walk(community, host, port, oid):
    """Обход SNMP таблицы через puresnmp, возвращает dict {last_index: value}"""
    result = {}
    try:
        rows = puresnmp.bulkwalk(host, community, oid, port=port, timeout=5)
        for varbind in rows:
            oid_str = str(varbind.oid)
            idx = oid_str.split('.')[-1]
            result[idx] = varbind.value
    except Exception:
        pass
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
    """Опрос OLT CData через SNMP, возвращает список ONU с параметрами."""
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': HEADERS, 'body': ''}

    community = os.environ.get('OLT_SNMP_COMMUNITY', 'public')
    host, port = get_snmp_host()

    if not host:
        return {
            'statusCode': 500,
            'headers': HEADERS,
            'body': json.dumps({'error': 'OLT_HOST не настроен', 'onu_list': []})
        }

    try:
        states = snmp_walk(community, host, port, OID_CDATA_ONU_STATE)
        macs   = snmp_walk(community, host, port, OID_CDATA_ONU_MAC)
        rxs    = snmp_walk(community, host, port, OID_CDATA_ONU_RX)
        txs    = snmp_walk(community, host, port, OID_CDATA_ONU_TX)
        sns    = snmp_walk(community, host, port, OID_CDATA_ONU_SN)

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
                    'id':     f'ONU-{idx.zfill(3)}',
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
            # Fallback: стандартный ifOperStatus
            if_status = snmp_walk(community, host, port, OID_IF_OPER_STATUS)
            if_descr  = snmp_walk(community, host, port, OID_IF_DESCR)
            for idx, val in if_status.items():
                descr = str(if_descr.get(idx, ''))
                if 'onu' not in descr.lower() and 'gpon' not in descr.lower() and 'epon' not in descr.lower():
                    continue
                status = 'online' if int(val) == 1 else 'offline'
                onu_list.append({
                    'id':     f'ONU-{idx.zfill(3)}',
                    'index':  idx,
                    'mac':    '',
                    'sn':     '',
                    'status': status,
                    'signal': None,
                    'tx':     None,
                    'olt':    'OLT-01',
                    'port':   descr,
                    'ip':     '',
                    'uptime': '',
                    'model':  'CData OLT',
                })

        return {
            'statusCode': 200,
            'headers': HEADERS,
            'body': json.dumps({
                'onu_list': onu_list,
                'total':   len(onu_list),
                'online':  sum(1 for o in onu_list if o['status'] == 'online'),
                'offline': sum(1 for o in onu_list if o['status'] == 'offline'),
                'warning': sum(1 for o in onu_list if o['status'] == 'warning'),
                'host':    host,
                'snmp_port': port,
            })
        }

    except Exception as e:
        return {
            'statusCode': 500,
            'headers': HEADERS,
            'body': json.dumps({'error': str(e), 'onu_list': [], 'host': host})
        }