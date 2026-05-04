"""
Business: Приём данных от Windows-агента (POST с токеном) и выдача списка найденных устройств для UI (GET). Также поддержка удаления и пометки "на карте".
Args: event с httpMethod, headers, body, queryStringParameters; context с request_id
Returns: JSON со списком устройств или результатом операции
"""

import json
import os
import psycopg2


def cors_headers():
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Agent-Token',
        'Content-Type': 'application/json',
    }


def esc(s) -> str:
    return str(s if s is not None else '').replace("'", "''")


def handler(event: dict, context) -> dict:
    """Агент-сканер: приём и список найденных устройств"""
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
                "SELECT id, ip, mac, hostname, vendor, model, sys_descr, uptime, status, "
                "agent_id, first_seen, last_seen, on_map "
                "FROM discovered_devices ORDER BY last_seen DESC"
            )
            items = []
            for r in cur.fetchall():
                items.append({
                    'id': r[0], 'ip': r[1], 'mac': r[2], 'hostname': r[3],
                    'vendor': r[4], 'model': r[5], 'sys_descr': r[6], 'uptime': r[7],
                    'status': r[8], 'agent_id': r[9],
                    'first_seen': r[10].isoformat() if r[10] else None,
                    'last_seen': r[11].isoformat() if r[11] else None,
                    'on_map': r[12],
                })
            return {
                'statusCode': 200,
                'headers': cors_headers(),
                'body': json.dumps({'success': True, 'items': items}, ensure_ascii=False),
            }

        if method == 'POST':
            headers = event.get('headers') or {}
            token = headers.get('X-Agent-Token') or headers.get('x-agent-token') or ''
            expected = os.environ.get('AGENT_TOKEN', '')
            if not expected or token != expected:
                return {
                    'statusCode': 401,
                    'headers': cors_headers(),
                    'body': json.dumps({'success': False, 'message': 'Неверный токен агента'}),
                }
            body = json.loads(event.get('body') or '{}')
            agent_id = esc(body.get('agent_id', 'unknown'))
            devices = body.get('devices', [])
            if not isinstance(devices, list):
                return {
                    'statusCode': 400,
                    'headers': cors_headers(),
                    'body': json.dumps({'success': False, 'message': 'devices должен быть массивом'}),
                }
            inserted = 0
            updated = 0
            for d in devices:
                ip = esc(d.get('ip', ''))
                if not ip:
                    continue
                mac = esc(d.get('mac', ''))
                hostname = esc(d.get('hostname', ''))
                vendor = esc(d.get('vendor', ''))
                model = esc(d.get('model', ''))
                sys_descr = esc(d.get('sys_descr', ''))
                uptime = esc(d.get('uptime', ''))
                status = esc(d.get('status', 'online'))
                cur.execute(f"SELECT id FROM discovered_devices WHERE ip = '{ip}'")
                row = cur.fetchone()
                if row:
                    cur.execute(
                        f"UPDATE discovered_devices SET "
                        f"mac = CASE WHEN '{mac}' <> '' THEN '{mac}' ELSE mac END, "
                        f"hostname = CASE WHEN '{hostname}' <> '' THEN '{hostname}' ELSE hostname END, "
                        f"vendor = CASE WHEN '{vendor}' <> '' THEN '{vendor}' ELSE vendor END, "
                        f"model = CASE WHEN '{model}' <> '' THEN '{model}' ELSE model END, "
                        f"sys_descr = CASE WHEN '{sys_descr}' <> '' THEN '{sys_descr}' ELSE sys_descr END, "
                        f"uptime = '{uptime}', status = '{status}', agent_id = '{agent_id}', "
                        f"last_seen = CURRENT_TIMESTAMP "
                        f"WHERE id = {row[0]}"
                    )
                    updated += 1
                else:
                    cur.execute(
                        f"INSERT INTO discovered_devices "
                        f"(ip, mac, hostname, vendor, model, sys_descr, uptime, status, agent_id) "
                        f"VALUES ('{ip}', '{mac}', '{hostname}', '{vendor}', '{model}', "
                        f"'{sys_descr}', '{uptime}', '{status}', '{agent_id}')"
                    )
                    inserted += 1
            return {
                'statusCode': 200,
                'headers': cors_headers(),
                'body': json.dumps({'success': True, 'inserted': inserted, 'updated': updated}),
            }

        if method == 'DELETE':
            params = event.get('queryStringParameters') or {}
            did = params.get('id')
            if not did:
                return {
                    'statusCode': 400,
                    'headers': cors_headers(),
                    'body': json.dumps({'success': False, 'message': 'id обязателен'}),
                }
            try:
                did_i = int(did)
            except ValueError:
                return {
                    'statusCode': 400,
                    'headers': cors_headers(),
                    'body': json.dumps({'success': False, 'message': 'id должен быть числом'}),
                }
            cur.execute(f"DELETE FROM discovered_devices WHERE id = {did_i}")
            return {
                'statusCode': 200,
                'headers': cors_headers(),
                'body': json.dumps({'success': True, 'deleted': did_i}),
            }

        if method == 'PATCH':
            body = json.loads(event.get('body') or '{}')
            did = body.get('id')
            on_map = body.get('on_map')
            if did is None:
                return {
                    'statusCode': 400,
                    'headers': cors_headers(),
                    'body': json.dumps({'success': False, 'message': 'id обязателен'}),
                }
            try:
                did_i = int(did)
            except ValueError:
                return {
                    'statusCode': 400,
                    'headers': cors_headers(),
                    'body': json.dumps({'success': False, 'message': 'id должен быть числом'}),
                }
            on_map_v = 'TRUE' if on_map else 'FALSE'
            cur.execute(f"UPDATE discovered_devices SET on_map = {on_map_v} WHERE id = {did_i}")
            return {
                'statusCode': 200,
                'headers': cors_headers(),
                'body': json.dumps({'success': True}),
            }

        return {
            'statusCode': 405,
            'headers': cors_headers(),
            'body': json.dumps({'success': False, 'message': 'Method not allowed'}),
        }
    finally:
        cur.close()
        conn.close()
