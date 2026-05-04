"""
Business: CRUD устройств на карте — добавление, получение списка, удаление пользовательских маркеров (OLT/ONU/роутеры).
Args: event с httpMethod (GET/POST/DELETE) и body; context с request_id
Returns: HTTP-ответ со списком устройств или результатом операции
"""

import json
import os
import psycopg2


def cors_headers():
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json',
    }


def esc(s: str) -> str:
    return str(s).replace("'", "''")


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
                "SELECT id, device_type, name, lat, lng, status, comment, created_at "
                "FROM map_devices ORDER BY id DESC"
            )
            rows = cur.fetchall()
            items = [
                {
                    'id': r[0],
                    'device_type': r[1],
                    'name': r[2],
                    'lat': float(r[3]),
                    'lng': float(r[4]),
                    'status': r[5],
                    'comment': r[6] or '',
                    'created_at': r[7].isoformat() if r[7] else None,
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
            lat = float(body.get('lat', 0))
            lng = float(body.get('lng', 0))
            status = esc(body.get('status', 'online'))
            comment = esc(body.get('comment', ''))

            if device_type not in ('olt', 'onu', 'router'):
                return {
                    'statusCode': 400,
                    'headers': cors_headers(),
                    'body': json.dumps({'success': False, 'message': 'device_type должен быть olt/onu/router'}),
                }

            cur.execute(
                f"INSERT INTO map_devices (device_type, name, lat, lng, status, comment) "
                f"VALUES ('{device_type}', '{name}', {lat}, {lng}, '{status}', '{comment}') "
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
                        'lat': lat,
                        'lng': lng,
                        'status': body.get('status', 'online'),
                        'comment': body.get('comment', ''),
                        'created_at': row[1].isoformat() if row[1] else None,
                    },
                }, ensure_ascii=False),
            }

        if method == 'DELETE':
            params = event.get('queryStringParameters') or {}
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
