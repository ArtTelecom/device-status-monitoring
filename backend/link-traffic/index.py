"""
Business: Возвращает текущую загрузку (Mbps) для всех линий топологии, связанных с реальными устройствами и интерфейсами. UI использует это для пульсации.
Args: event с httpMethod GET; context с request_id
Returns: JSON с массивом {id, current_mbps, bandwidth_mbps}
"""

import json
import os
import psycopg2


def cors_headers():
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json',
    }


def handler(event: dict, context) -> dict:
    """Живая загрузка линий из счётчиков SNMP-интерфейсов"""
    method = event.get('httpMethod', 'GET')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': cors_headers(), 'body': ''}

    dsn = os.environ.get('DATABASE_URL', '')
    conn = psycopg2.connect(dsn)
    conn.autocommit = True
    cur = conn.cursor()

    try:
        cur.execute(
            "SELECT id, source_discovered_id, source_if_index, target_discovered_id, target_if_index, "
            "bandwidth_mbps, auto_traffic, current_mbps FROM map_links"
        )
        items = []
        for r in cur.fetchall():
            lid, src_did, src_if, tgt_did, tgt_if, bw, auto, cur_mbps = r
            mbps = float(cur_mbps or 0)
            if auto and src_did and src_if:
                cur.execute(
                    f"SELECT in_bps, out_bps, speed_mbps FROM interface_counters "
                    f"WHERE device_id = {int(src_did)} AND if_index = {int(src_if)}"
                )
                row = cur.fetchone()
                if row:
                    in_bps, out_bps, speed = int(row[0] or 0), int(row[1] or 0), int(row[2] or 0)
                    mbps = max(in_bps, out_bps) / 1_000_000.0
                    if speed and speed != bw:
                        cur.execute(f"UPDATE map_links SET bandwidth_mbps = {speed} WHERE id = {lid}")
                        bw = speed
                    cur.execute(f"UPDATE map_links SET current_mbps = {mbps} WHERE id = {lid}")
            items.append({
                'id': lid,
                'current_mbps': round(mbps, 2),
                'bandwidth_mbps': bw,
            })
        return {'statusCode': 200, 'headers': cors_headers(), 'body': json.dumps({'success': True, 'items': items})}
    finally:
        cur.close()
        conn.close()
