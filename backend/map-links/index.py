"""
Business: CRUD связей между устройствами на топологии — порты, скорость, цвет, точки изгиба линии.
Args: event с httpMethod (GET/POST/PATCH/DELETE) и body; context с request_id
Returns: HTTP-ответ со списком связей или результатом операции
"""

import json
import os
import psycopg2


def cors_headers():
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json',
    }


def esc(s) -> str:
    return str(s if s is not None else '').replace("'", "''")


def parse_waypoints(raw):
    if not raw:
        return []
    try:
        v = json.loads(raw)
        return v if isinstance(v, list) else []
    except Exception:
        return []


def handler(event: dict, context) -> dict:
    """Связи топологии: создание, чтение, обновление, удаление"""
    method = event.get('httpMethod', 'GET')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': cors_headers(), 'body': ''}

    dsn = os.environ.get('DATABASE_URL', '')
    conn = psycopg2.connect(dsn)
    conn.autocommit = True
    cur = conn.cursor()

    try:
        if method == 'GET':
            cur.execute(
                "SELECT id, source_id, target_id, source_port, target_port, "
                "bandwidth_mbps, current_mbps, color, waypoints, label, created_at "
                "FROM map_links ORDER BY id"
            )
            items = []
            for r in cur.fetchall():
                items.append({
                    'id': r[0],
                    'source_id': r[1],
                    'target_id': r[2],
                    'source_port': r[3] or '',
                    'target_port': r[4] or '',
                    'bandwidth_mbps': r[5],
                    'current_mbps': float(r[6]) if r[6] is not None else 0,
                    'color': r[7] or '#22c55e',
                    'waypoints': parse_waypoints(r[8]),
                    'label': r[9] or '',
                    'created_at': r[10].isoformat() if r[10] else None,
                })
            return {
                'statusCode': 200,
                'headers': cors_headers(),
                'body': json.dumps({'success': True, 'items': items}, ensure_ascii=False),
            }

        if method == 'POST':
            body = json.loads(event.get('body') or '{}')
            source_id = int(body.get('source_id') or 0)
            target_id = int(body.get('target_id') or 0)
            if not source_id or not target_id or source_id == target_id:
                return {
                    'statusCode': 400,
                    'headers': cors_headers(),
                    'body': json.dumps({'success': False, 'message': 'source_id и target_id обязательны и различны'}),
                }
            source_port = esc(body.get('source_port', ''))
            target_port = esc(body.get('target_port', ''))
            bandwidth = int(body.get('bandwidth_mbps', 1000) or 1000)
            current = float(body.get('current_mbps', 0) or 0)
            color = esc(body.get('color', '#22c55e'))
            label = esc(body.get('label', ''))
            wps = body.get('waypoints', [])
            wps_str = esc(json.dumps(wps if isinstance(wps, list) else []))

            cur.execute(
                f"INSERT INTO map_links (source_id, target_id, source_port, target_port, "
                f"bandwidth_mbps, current_mbps, color, waypoints, label) "
                f"VALUES ({source_id}, {target_id}, '{source_port}', '{target_port}', "
                f"{bandwidth}, {current}, '{color}', '{wps_str}', '{label}') "
                f"RETURNING id, created_at"
            )
            row = cur.fetchone()
            return {
                'statusCode': 200,
                'headers': cors_headers(),
                'body': json.dumps({
                    'success': True,
                    'item': {
                        'id': row[0],
                        'source_id': source_id, 'target_id': target_id,
                        'source_port': body.get('source_port', ''),
                        'target_port': body.get('target_port', ''),
                        'bandwidth_mbps': bandwidth,
                        'current_mbps': current,
                        'color': body.get('color', '#22c55e'),
                        'waypoints': wps if isinstance(wps, list) else [],
                        'label': body.get('label', ''),
                        'created_at': row[1].isoformat() if row[1] else None,
                    },
                }, ensure_ascii=False),
            }

        if method == 'PATCH':
            body = json.loads(event.get('body') or '{}')
            lid = body.get('id')
            if lid is None:
                return {
                    'statusCode': 400,
                    'headers': cors_headers(),
                    'body': json.dumps({'success': False, 'message': 'id обязателен'}),
                }
            try:
                lid = int(lid)
            except ValueError:
                return {
                    'statusCode': 400,
                    'headers': cors_headers(),
                    'body': json.dumps({'success': False, 'message': 'id должен быть числом'}),
                }
            sets = []
            if 'source_port' in body:
                sets.append(f"source_port = '{esc(body['source_port'])}'")
            if 'target_port' in body:
                sets.append(f"target_port = '{esc(body['target_port'])}'")
            if 'bandwidth_mbps' in body:
                sets.append(f"bandwidth_mbps = {int(body['bandwidth_mbps'])}")
            if 'current_mbps' in body:
                sets.append(f"current_mbps = {float(body['current_mbps'])}")
            if 'color' in body:
                sets.append(f"color = '{esc(body['color'])}'")
            if 'label' in body:
                sets.append(f"label = '{esc(body['label'])}'")
            if 'waypoints' in body:
                wps = body['waypoints']
                wps_str = esc(json.dumps(wps if isinstance(wps, list) else []))
                sets.append(f"waypoints = '{wps_str}'")
            if not sets:
                return {
                    'statusCode': 400,
                    'headers': cors_headers(),
                    'body': json.dumps({'success': False, 'message': 'нет полей для обновления'}),
                }
            cur.execute(f"UPDATE map_links SET {', '.join(sets)} WHERE id = {lid}")
            return {
                'statusCode': 200,
                'headers': cors_headers(),
                'body': json.dumps({'success': True, 'updated': lid}),
            }

        if method == 'DELETE':
            params = event.get('queryStringParameters') or {}
            if params.get('all') in ('1', 'true', 'yes'):
                cur.execute("DELETE FROM map_links")
                return {
                    'statusCode': 200,
                    'headers': cors_headers(),
                    'body': json.dumps({'success': True, 'deleted_all': True}),
                }
            lid = params.get('id')
            if not lid:
                body = json.loads(event.get('body') or '{}')
                lid = body.get('id')
            if not lid:
                return {
                    'statusCode': 400,
                    'headers': cors_headers(),
                    'body': json.dumps({'success': False, 'message': 'id обязателен'}),
                }
            try:
                lid = int(lid)
            except ValueError:
                return {
                    'statusCode': 400,
                    'headers': cors_headers(),
                    'body': json.dumps({'success': False, 'message': 'id должен быть числом'}),
                }
            cur.execute(f"DELETE FROM map_links WHERE id = {lid}")
            return {
                'statusCode': 200,
                'headers': cors_headers(),
                'body': json.dumps({'success': True, 'deleted': lid}),
            }

        return {
            'statusCode': 405,
            'headers': cors_headers(),
            'body': json.dumps({'success': False, 'message': 'Method not allowed'}),
        }
    finally:
        cur.close()
        conn.close()
