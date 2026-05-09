"""
Business: Управление агентами — регистрация, heartbeat, выдача pending-команд, отдача актуальной версии scanner.py для самообновления.
Args: event с httpMethod GET/POST, headers (X-Agent-Token), body, query
Returns: JSON с command/version_info или OK
"""

import base64
import json
import os
import re
import psycopg2


def cors_headers():
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Agent-Token',
        'Content-Type': 'application/json',
    }


def esc(s) -> str:
    return str(s if s is not None else '').replace("'", "''")


def safe_id(s) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]", "", str(s or ""))[:64]


def handler(event: dict, context) -> dict:
    """Heartbeat агента, выдача команд и обновлений"""
    method = event.get('httpMethod', 'GET')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': cors_headers(), 'body': ''}

    headers = event.get('headers') or {}
    token = headers.get('X-Agent-Token') or headers.get('x-agent-token') or ''
    expected = os.environ.get('AGENT_TOKEN', '')
    if not expected or token != expected:
        return {'statusCode': 401, 'headers': cors_headers(),
                'body': json.dumps({'success': False, 'message': 'Неверный токен'})}

    dsn = os.environ.get('DATABASE_URL', '')
    conn = psycopg2.connect(dsn)
    conn.autocommit = True
    cur = conn.cursor()

    try:
        params = event.get('queryStringParameters') or {}
        action = params.get('action', '')

        # === GET ?action=script — скачать актуальный scanner.py ===
        if method == 'GET' and action == 'script':
            cur.execute("SELECT version, source FROM agent_versions WHERE is_current = TRUE ORDER BY version DESC LIMIT 1")
            row = cur.fetchone()
            if not row:
                return {'statusCode': 404, 'headers': cors_headers(),
                        'body': json.dumps({'success': False, 'message': 'Версия не загружена'})}
            src = row[1] or ''
            if src.startswith('B64:'):
                try:
                    src = base64.b64decode(src[4:].encode('ascii')).decode('utf-8')
                except Exception:
                    pass
            return {
                'statusCode': 200,
                'headers': {**cors_headers(), 'Content-Type': 'application/json'},
                'body': json.dumps({'success': True, 'version': row[0], 'source': src}),
            }

        # === POST heartbeat ===
        if method == 'POST' and action in ('heartbeat', 'register'):
            body = json.loads(event.get('body') or '{}')
            agent_id = safe_id(body.get('agent_id', 'unknown'))
            if not agent_id:
                return {'statusCode': 400, 'headers': cors_headers(),
                        'body': json.dumps({'success': False, 'message': 'agent_id обязателен'})}
            hostname = esc(body.get('hostname', ''))
            os_str = esc(body.get('os', ''))
            version = int(body.get('version', 1) or 1)
            ip = (event.get('requestContext') or {}).get('identity', {}).get('sourceIp', '')
            cfg_json = esc(json.dumps(body.get('config', {})))

            cur.execute(f"SELECT id FROM agents WHERE agent_id = '{agent_id}'")
            row = cur.fetchone()
            if row:
                cur.execute(
                    f"UPDATE agents SET hostname='{hostname}', os='{os_str}', version={version}, "
                    f"ip='{esc(ip)}', status='online', last_seen=CURRENT_TIMESTAMP, "
                    f"config_json='{cfg_json}' WHERE id={row[0]}"
                )
            else:
                cur.execute(
                    f"INSERT INTO agents (agent_id, name, hostname, os, version, ip, status, config_json) "
                    f"VALUES ('{agent_id}', '{agent_id}', '{hostname}', '{os_str}', {version}, "
                    f"'{esc(ip)}', 'online', '{cfg_json}')"
                )

            # Получаем актуальную версию
            cur.execute("SELECT version FROM agent_versions WHERE is_current = TRUE ORDER BY version DESC LIMIT 1")
            curv = cur.fetchone()
            current_version = curv[0] if curv else 0
            update_available = current_version > version

            # Забираем все pending-команды
            cur.execute(
                f"SELECT id, command, payload FROM agent_commands "
                f"WHERE agent_id = '{agent_id}' AND status = 'pending' ORDER BY id LIMIT 10"
            )
            cmds = []
            for c in cur.fetchall():
                cmd_id, cmd, payload = c
                cmds.append({'id': cmd_id, 'command': cmd, 'payload': payload})
                cur.execute(
                    f"UPDATE agent_commands SET status='fetched', fetched_at=CURRENT_TIMESTAMP WHERE id={cmd_id}"
                )

            # Чистим старых агентов (offline > 5 мин)
            cur.execute("UPDATE agents SET status='offline' WHERE last_seen < NOW() - INTERVAL '5 minutes' AND status = 'online'")

            return {
                'statusCode': 200,
                'headers': cors_headers(),
                'body': json.dumps({
                    'success': True,
                    'commands': cmds,
                    'current_version': current_version,
                    'update_available': update_available,
                }),
            }

        # === POST ?action=result — агент рапортует о выполнении команды ===
        if method == 'POST' and action == 'result':
            body = json.loads(event.get('body') or '{}')
            cmd_id = int(body.get('command_id') or 0)
            status = esc(body.get('status', 'done'))
            result = esc(body.get('result', ''))
            if cmd_id:
                cur.execute(
                    f"UPDATE agent_commands SET status='{status}', result='{result}', "
                    f"completed_at=CURRENT_TIMESTAMP WHERE id={cmd_id}"
                )
            return {'statusCode': 200, 'headers': cors_headers(), 'body': json.dumps({'success': True})}

        return {'statusCode': 400, 'headers': cors_headers(),
                'body': json.dumps({'success': False, 'message': 'Неизвестное действие'})}
    finally:
        cur.close()
        conn.close()