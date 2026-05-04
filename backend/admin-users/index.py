"""
Business: Админская панель — список пользователей, изменение роли, активность, сброс пароля. Доступно только admin.
Args: event с httpMethod, body, headers (X-Auth-Token); context с request_id
Returns: JSON со списком пользователей или результатом операции
"""

import hashlib
import json
import os
import re
import secrets
import psycopg2

SALT = "pp_salt_v1"


def cors_headers():
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
        'Content-Type': 'application/json',
    }


def hash_password(password: str) -> str:
    h = hashlib.sha256(f"{password}{SALT}".encode()).hexdigest()
    return f"{SALT}${h}"


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


def handler(event: dict, context) -> dict:
    """Управление пользователями"""
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

        if method == 'GET':
            cur.execute(
                "SELECT u.id, u.email, u.name, u.role, u.is_active, u.created_at, u.last_login, "
                "(SELECT COUNT(*) FROM user_sessions s WHERE s.user_id = u.id AND s.expires_at > CURRENT_TIMESTAMP) "
                "FROM users u ORDER BY u.created_at DESC"
            )
            items = []
            for r in cur.fetchall():
                items.append({
                    'id': r[0], 'email': r[1], 'name': r[2], 'role': r[3],
                    'is_active': r[4],
                    'created_at': r[5].isoformat() if r[5] else None,
                    'last_login': r[6].isoformat() if r[6] else None,
                    'active_sessions': r[7],
                })
            return {'statusCode': 200, 'headers': cors_headers(),
                    'body': json.dumps({'success': True, 'items': items}, ensure_ascii=False)}

        if method == 'POST':
            body = json.loads(event.get('body') or '{}')
            email = (body.get('email') or '').strip().lower()
            password = body.get('password') or ''
            name = (body.get('name') or '').strip()
            role = body.get('role', 'user')
            if not email or not password or len(password) < 6:
                return {'statusCode': 400, 'headers': cors_headers(),
                        'body': json.dumps({'success': False, 'message': 'Нужен email и пароль (от 6 символов)'})}
            if role not in ('user', 'admin'):
                role = 'user'
            cur.execute(f"SELECT id FROM users WHERE email = '{esc(email)}'")
            if cur.fetchone():
                return {'statusCode': 409, 'headers': cors_headers(),
                        'body': json.dumps({'success': False, 'message': 'Email занят'})}
            ph = hash_password(password)
            cur.execute(
                f"INSERT INTO users (email, password_hash, name, role) VALUES "
                f"('{esc(email)}', '{esc(ph)}', '{esc(name or email)}', '{esc(role)}') RETURNING id"
            )
            uid = cur.fetchone()[0]
            return {'statusCode': 200, 'headers': cors_headers(),
                    'body': json.dumps({'success': True, 'id': uid})}

        if method == 'PATCH':
            body = json.loads(event.get('body') or '{}')
            uid = int(body.get('id') or 0)
            if not uid:
                return {'statusCode': 400, 'headers': cors_headers(),
                        'body': json.dumps({'success': False, 'message': 'id обязателен'})}
            sets = []
            if 'role' in body and body['role'] in ('user', 'admin'):
                sets.append(f"role = '{esc(body['role'])}'")
            if 'is_active' in body:
                sets.append(f"is_active = {'TRUE' if body['is_active'] else 'FALSE'}")
            if 'name' in body:
                sets.append(f"name = '{esc(body['name'])}'")
            if 'password' in body and body['password']:
                if len(body['password']) < 6:
                    return {'statusCode': 400, 'headers': cors_headers(),
                            'body': json.dumps({'success': False, 'message': 'Пароль от 6 символов'})}
                sets.append(f"password_hash = '{esc(hash_password(body['password']))}'")
                # Сбрасываем все сессии
                cur.execute(f"DELETE FROM user_sessions WHERE user_id = {uid}")
            if not sets:
                return {'statusCode': 400, 'headers': cors_headers(),
                        'body': json.dumps({'success': False, 'message': 'Нечего обновлять'})}
            cur.execute(f"UPDATE users SET {', '.join(sets)} WHERE id = {uid}")
            return {'statusCode': 200, 'headers': cors_headers(), 'body': json.dumps({'success': True})}

        if method == 'DELETE':
            params = event.get('queryStringParameters') or {}
            uid = int(params.get('id') or 0)
            if not uid:
                return {'statusCode': 400, 'headers': cors_headers(),
                        'body': json.dumps({'success': False, 'message': 'id обязателен'})}
            if uid == admin['id']:
                return {'statusCode': 400, 'headers': cors_headers(),
                        'body': json.dumps({'success': False, 'message': 'Нельзя удалить себя'})}
            cur.execute(f"DELETE FROM user_sessions WHERE user_id = {uid}")
            cur.execute(f"DELETE FROM users WHERE id = {uid}")
            return {'statusCode': 200, 'headers': cors_headers(), 'body': json.dumps({'success': True})}

        return {'statusCode': 405, 'headers': cors_headers(), 'body': json.dumps({'success': False})}
    finally:
        cur.close()
        conn.close()
