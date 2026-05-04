"""
Business: CRUD устройств на карте — создание, чтение, обновление (позиция/иконка/статус), удаление одного или всех.
Args: event с httpMethod (GET/POST/PATCH/DELETE) и body; context с request_id
Returns: HTTP-ответ со списком устройств или результатом операции
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


def handler(event: dict, context) -> dict:
    """Управление устройствами на карте"""
    method = event.get('httpMethod', 'GET')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': cors_headers(), 'body': ''}

    dsn = os.environ.get('DATABASE_URL', '')
    if not dsn:
        return {
            'statusCode': 500,
            'headers': cors_headers(),
            'body': json.dumps({'success': False, 'message': 'DATABASE_URL не настроен'}),
        }

    conn = psycopg2.connect(dsn)
    conn.autocommit = True
    cur = conn.cursor()

    try:
        if method == 'GET':
            cur.execute(
                "SELECT id, device_type, name, lat, lng, status, comment, "
                "COALESCE(icon, '') as icon, COALESCE(x, 0) as x, COALESCE(y, 0) as y, "
                "created_at FROM map_devices ORDER BY id DESC"
            )
            rows = cur.fetchall()
            items = [
                {
                    'id': r[0],
                    'device_type': r[1],
                    'name': r[2],
                    'lat': float(r[3]) if r[3] is not None else 0,
                    'lng': float(r[4]) if r[4] is not None else 0,
                    'status': r[5],
                    'comment': r[6] or '',
                    'icon': r[7] or '',
                    'x': float(r[8]) if r[8] is not None else 0,
                    'y': float(r[9]) if r[9] is not None else 0,
                    'created_at': r[10].isoformat() if r[10] else None,
                }
                for r in rows
            ]
            return {
                'statusCode': 200,
                'headers': cors_headers(),
                'body': json.dumps({'success': True, 'items': items}, ensure_ascii=False),
            }

        if method == 'POST':
            body = json.loads(event.get('body') or '{}')
            device_type = esc(body.get('device_type', 'router'))
            name = esc(body.get('name', 'Устройство'))
            lat = float(body.get('lat', 0) or 0)
            lng = float(body.get('lng', 0) or 0)
            x = float(body.get('x', 0) or 0)
            y = float(body.get('y', 0) or 0)
            status = esc(body.get('status', 'online'))
            comment = esc(body.get('comment', ''))
            icon = esc(body.get('icon', ''))

            if device_type not in ('olt', 'onu', 'router', 'server', 'switch', 'other'):
                return {
                    'statusCode': 400,
                    'headers': cors_headers(),
                    'body': json.dumps({'success': False, 'message': 'неизвестный device_type'}),
                }

            cur.execute(
                f"INSERT INTO map_devices (device_type, name, lat, lng, status, comment, icon, x, y) "
                f"VALUES ('{device_type}', '{name}', {lat}, {lng}, '{status}', '{comment}', '{icon}', {x}, {y}) "
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
                        'device_type': body.get('device_type'),
                        'name': body.get('name'),
                        'lat': lat, 'lng': lng, 'x': x, 'y': y,
                        'status': body.get('status', 'online'),
                        'comment': body.get('comment', ''),
                        'icon': body.get('icon', ''),
                        'created_at': row[1].isoformat() if row[1] else None,
                    },
                }, ensure_ascii=False),
            }

        if method == 'PATCH':
            body = json.loads(event.get('body') or '{}')
            did = body.get('id')
            if did is None:
                return {
                    'statusCode': 400,
                    'headers': cors_headers(),
                    'body': json.dumps({'success': False, 'message': 'id обязателен'}),
                }
            try:
                did = int(did)
            except ValueError:
                return {
                    'statusCode': 400,
                    'headers': cors_headers(),
                    'body': json.dumps({'success': False, 'message': 'id должен быть числом'}),
                }
            sets = []
            if 'name' in body:
                sets.append(f"name = '{esc(body['name'])}'")
            if 'device_type' in body:
                sets.append(f"device_type = '{esc(body['device_type'])}'")
            if 'status' in body:
                sets.append(f"status = '{esc(body['status'])}'")
            if 'comment' in body:
                sets.append(f"comment = '{esc(body['comment'])}'")
            if 'icon' in body:
                sets.append(f"icon = '{esc(body['icon'])}'")
            if 'lat' in body:
                sets.append(f"lat = {float(body['lat'])}")
            if 'lng' in body:
                sets.append(f"lng = {float(body['lng'])}")
            if 'x' in body:
                sets.append(f"x = {float(body['x'])}")
            if 'y' in body:
                sets.append(f"y = {float(body['y'])}")
            if not sets:
                return {
                    'statusCode': 400,
                    'headers': cors_headers(),
                    'body': json.dumps({'success': False, 'message': 'нет полей для обновления'}),
                }
            cur.execute(f"UPDATE map_devices SET {', '.join(sets)} WHERE id = {did}")
            return {
                'statusCode': 200,
                'headers': cors_headers(),
                'body': json.dumps({'success': True, 'updated': did}),
            }

        if method == 'DELETE':
            params = event.get('queryStringParameters') or {}
            if params.get('all') in ('1', 'true', 'yes'):
                cur.execute("DELETE FROM map_links")
                cur.execute("DELETE FROM map_devices")
                return {
                    'statusCode': 200,
                    'headers': cors_headers(),
                    'body': json.dumps({'success': True, 'deleted_all': True}),
                }
            device_id = params.get('id')
            if not device_id:
                body = json.loads(event.get('body') or '{}')
                device_id = body.get('id')
            if not device_id:
                return {
                    'statusCode': 400,
                    'headers': cors_headers(),
                    'body': json.dumps({'success': False, 'message': 'id обязателен'}),
                }
            try:
                did = int(device_id)
            except ValueError:
                return {
                    'statusCode': 400,
                    'headers': cors_headers(),
                    'body': json.dumps({'success': False, 'message': 'id должен быть числом'}),
                }
            cur.execute(f"DELETE FROM map_links WHERE source_id = {did} OR target_id = {did}")
            cur.execute(f"DELETE FROM map_devices WHERE id = {did}")
            return {
                'statusCode': 200,
                'headers': cors_headers(),
                'body': json.dumps({'success': True, 'deleted': did}),
            }

        return {
            'statusCode': 405,
            'headers': cors_headers(),
            'body': json.dumps({'success': False, 'message': 'Method not allowed'}),
        }
    finally:
        cur.close()
        conn.close()
