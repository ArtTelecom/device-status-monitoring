"""
Business: Админ-панель агентов — список, статусы, отправка команд, загрузка новой версии scanner.py. Только admin.
Args: event с httpMethod GET/POST/PATCH, headers (X-Auth-Token), body
Returns: JSON со списком агентов / результатом
"""

import hashlib
import json
import os
import re
import psycopg2

SALT = "pp_salt_v1"


def cors_headers():
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
        'Content-Type': 'application/json',
    }


def esc(s) -> str:
    return str(s if s is not None else '').replace("'", "''")


def get_admin(cur, token):
    if not token:
        return None
    safe = re.sub(r"[^a-zA-Z0-9]", "", token)[:64]
    if not safe:
        return None
    cur.execute(
        f"SELECT u.id, u.email, u.role FROM user_sessions s JOIN users u ON u.id = s.user_id "
        f"WHERE s.token = '{safe}' AND s.expires_at > CURRENT_TIMESTAMP AND u.role = 'admin' AND u.is_active = TRUE"
    )
    r = cur.fetchone()
    return {'id': r[0], 'email': r[1], 'role': r[2]} if r else None


ALLOWED_COMMANDS = {
    'restart', 'self_update', 'rescan_now', 'set_interval', 'set_subnet',
    'set_credentials', 'reload_config', 'shutdown', 'run_shell',
    'snmp_poll', 'add_subnet',
}


def handler(event: dict, context) -> dict:
    """Управление агентами — для админа сайта"""
    method = event.get('httpMethod', 'GET')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': cors_headers(), 'body': ''}

    dsn = os.environ.get('DATABASE_URL', '')
    conn = psycopg2.connect(dsn)
    conn.autocommit = True
    cur = conn.cursor()

    try:
        headers = event.get('headers') or {}
        token = headers.get('X-Auth-Token') or headers.get('x-auth-token') or ''
        admin = get_admin(cur, token)
        if not admin:
            return {'statusCode': 403, 'headers': cors_headers(),
                    'body': json.dumps({'success': False, 'message': 'Только для администратора'})}

        params = event.get('queryStringParameters') or {}
        action = params.get('action', '')

        if method == 'GET' and action == 'list':
            cur.execute(
                "SELECT a.id, a.agent_id, a.name, a.hostname, a.os, a.version, a.ip, a.status, "
                "a.last_seen, a.registered_at, a.config_json, a.notes, "
                "(SELECT COUNT(*) FROM agent_commands c WHERE c.agent_id = a.agent_id AND c.status = 'pending') "
                "FROM agents a ORDER BY a.last_seen DESC NULLS LAST"
            )
            items = []
            for r in cur.fetchall():
                items.append({
                    'id': r[0], 'agent_id': r[1], 'name': r[2], 'hostname': r[3], 'os': r[4],
                    'version': r[5], 'ip': r[6], 'status': r[7],
                    'last_seen': r[8].isoformat() if r[8] else None,
                    'registered_at': r[9].isoformat() if r[9] else None,
                    'config_json': r[10] or '{}', 'notes': r[11] or '',
                    'pending_commands': r[12],
                })
            cur.execute("SELECT version, notes, uploaded_at FROM agent_versions WHERE is_current = TRUE ORDER BY version DESC LIMIT 1")
            v = cur.fetchone()
            current_version = {'version': v[0], 'notes': v[1] or '', 'uploaded_at': v[2].isoformat() if v[2] else None} if v else None
            return {'statusCode': 200, 'headers': cors_headers(),
                    'body': json.dumps({'success': True, 'items': items, 'current_version': current_version}, ensure_ascii=False)}

        if method == 'GET' and action == 'commands':
            agent_id = re.sub(r"[^a-zA-Z0-9_-]", "", params.get('agent_id') or '')[:64]
            if not agent_id:
                return {'statusCode': 400, 'headers': cors_headers(), 'body': json.dumps({'success': False})}
            cur.execute(
                f"SELECT id, command, payload, status, result, created_at, completed_at FROM agent_commands "
                f"WHERE agent_id = '{agent_id}' ORDER BY id DESC LIMIT 50"
            )
            cmds = []
            for r in cur.fetchall():
                cmds.append({
                    'id': r[0], 'command': r[1], 'payload': r[2], 'status': r[3], 'result': r[4],
                    'created_at': r[5].isoformat() if r[5] else None,
                    'completed_at': r[6].isoformat() if r[6] else None,
                })
            return {'statusCode': 200, 'headers': cors_headers(),
                    'body': json.dumps({'success': True, 'items': cmds}, ensure_ascii=False)}

        if method == 'POST' and action == 'command':
            body = json.loads(event.get('body') or '{}')
            agent_id = re.sub(r"[^a-zA-Z0-9_-]", "", body.get('agent_id') or '')[:64]
            cmd = body.get('command', '')
            if cmd not in ALLOWED_COMMANDS:
                return {'statusCode': 400, 'headers': cors_headers(),
                        'body': json.dumps({'success': False, 'message': f'Неизвестная команда: {cmd}'})}
            payload = json.dumps(body.get('payload', {}))
            if agent_id == '*' or agent_id == 'all':
                # Для всех агентов
                cur.execute("SELECT agent_id FROM agents")
                count = 0
                for r in cur.fetchall():
                    cur.execute(
                        f"INSERT INTO agent_commands (agent_id, command, payload) VALUES "
                        f"('{esc(r[0])}', '{esc(cmd)}', '{esc(payload)}')"
                    )
                    count += 1
                return {'statusCode': 200, 'headers': cors_headers(),
                        'body': json.dumps({'success': True, 'queued': count})}
            cur.execute(
                f"INSERT INTO agent_commands (agent_id, command, payload) VALUES "
                f"('{esc(agent_id)}', '{esc(cmd)}', '{esc(payload)}') RETURNING id"
            )
            cmd_id = cur.fetchone()[0]
            return {'statusCode': 200, 'headers': cors_headers(),
                    'body': json.dumps({'success': True, 'command_id': cmd_id})}

        if method == 'POST' and action == 'upload_version':
            body = json.loads(event.get('body') or '{}')
            source = body.get('source', '')
            notes = esc(body.get('notes', ''))
            if not source or len(source) < 100:
                return {'statusCode': 400, 'headers': cors_headers(),
                        'body': json.dumps({'success': False, 'message': 'source обязателен'})}
            # Определяем следующий номер версии
            cur.execute("SELECT COALESCE(MAX(version), 0) + 1 FROM agent_versions")
            new_v = cur.fetchone()[0]
            src_esc = esc(source)
            cur.execute("UPDATE agent_versions SET is_current = FALSE")
            cur.execute(
                f"INSERT INTO agent_versions (version, source, notes, uploaded_by, is_current) "
                f"VALUES ({new_v}, '{src_esc}', '{notes}', {admin['id']}, TRUE)"
            )
            return {'statusCode': 200, 'headers': cors_headers(),
                    'body': json.dumps({'success': True, 'version': new_v})}

        if method == 'PATCH':
            body = json.loads(event.get('body') or '{}')
            agent_id = re.sub(r"[^a-zA-Z0-9_-]", "", body.get('agent_id') or '')[:64]
            if not agent_id:
                return {'statusCode': 400, 'headers': cors_headers(), 'body': json.dumps({'success': False})}
            sets = []
            if 'name' in body:
                sets.append(f"name = '{esc(body['name'])}'")
            if 'notes' in body:
                sets.append(f"notes = '{esc(body['notes'])}'")
            if not sets:
                return {'statusCode': 400, 'headers': cors_headers(), 'body': json.dumps({'success': False})}
            cur.execute(f"UPDATE agents SET {', '.join(sets)} WHERE agent_id = '{agent_id}'")
            return {'statusCode': 200, 'headers': cors_headers(), 'body': json.dumps({'success': True})}

        if method == 'DELETE':
            agent_id = re.sub(r"[^a-zA-Z0-9_-]", "", params.get('agent_id') or '')[:64]
            if not agent_id:
                return {'statusCode': 400, 'headers': cors_headers(), 'body': json.dumps({'success': False})}
            cur.execute(f"DELETE FROM agent_commands WHERE agent_id = '{agent_id}'")
            cur.execute(f"DELETE FROM agents WHERE agent_id = '{agent_id}'")
            return {'statusCode': 200, 'headers': cors_headers(), 'body': json.dumps({'success': True})}

        return {'statusCode': 400, 'headers': cors_headers(),
                'body': json.dumps({'success': False, 'message': 'Неизвестное действие'})}
    finally:
        cur.close()
        conn.close()