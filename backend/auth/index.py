"""
Business: Авторизация пользователей — регистрация, вход, выход, проверка сессии.
Args: event с httpMethod, body, headers; context с request_id
Returns: JSON с токеном/пользователем или ошибкой
"""

import hashlib
import json
import os
import re
import secrets
import psycopg2

SALT = "pp_salt_v1"
SESSION_TTL_DAYS = 14


def cors_headers():
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
        'Content-Type': 'application/json',
    }


def hash_password(password: str) -> str:
    h = hashlib.sha256(f"{password}{SALT}".encode()).hexdigest()
    return f"{SALT}${h}"


def check_password(password: str, stored: str) -> bool:
    expected = hash_password(password)
    return secrets.compare_digest(expected, stored)


def esc(s) -> str:
    return str(s if s is not None else '').replace("'", "''")


def get_user_by_token(cur, token: str):
    if not token:
        return None
    safe = re.sub(r"[^a-zA-Z0-9]", "", token)[:64]
    if not safe:
        return None
    cur.execute(
        f"SELECT u.id, u.email, u.name, u.role, u.is_active "
        f"FROM user_sessions s JOIN users u ON u.id = s.user_id "
        f"WHERE s.token = '{safe}' AND s.expires_at > CURRENT_TIMESTAMP"
    )
    r = cur.fetchone()
    if not r:
        return None
    return {'id': r[0], 'email': r[1], 'name': r[2], 'role': r[3], 'is_active': r[4]}


def handler(event: dict, context) -> dict:
    """Логин / регистрация / проверка сессии"""
    method = event.get('httpMethod', 'GET')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': cors_headers(), 'body': ''}

    dsn = os.environ.get('DATABASE_URL', '')
    conn = psycopg2.connect(dsn)
    conn.autocommit = True
    cur = conn.cursor()

    try:
        params = event.get('queryStringParameters') or {}
        action = params.get('action', '')
        headers = event.get('headers') or {}
        token = headers.get('X-Auth-Token') or headers.get('x-auth-token') or ''

        # Гарантируем admin@local / admin123 если хэш некорректный или маркер сброса
        admin_correct = hash_password('admin123').replace("'", "''")
        cur.execute(
            f"UPDATE users SET password_hash = '{admin_correct}' "
            f"WHERE email = 'admin@local' AND "
            f"(password_hash = 'NEEDS_RESET' OR password_hash NOT LIKE '{SALT}$%')"
        )

        if method == 'GET' and action == 'me':
            user = get_user_by_token(cur, token)
            if not user:
                return {'statusCode': 401, 'headers': cors_headers(), 'body': json.dumps({'success': False, 'message': 'Не авторизован'})}
            return {'statusCode': 200, 'headers': cors_headers(), 'body': json.dumps({'success': True, 'user': user})}

        if method == 'POST' and action == 'register':
            body = json.loads(event.get('body') or '{}')
            email = (body.get('email') or '').strip().lower()
            password = body.get('password') or ''
            name = (body.get('name') or '').strip()
            if not email or not password or len(password) < 6:
                return {'statusCode': 400, 'headers': cors_headers(),
                        'body': json.dumps({'success': False, 'message': 'Email и пароль (от 6 символов) обязательны'})}
            if not re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', email):
                return {'statusCode': 400, 'headers': cors_headers(),
                        'body': json.dumps({'success': False, 'message': 'Некорректный email'})}
            cur.execute(f"SELECT id FROM users WHERE email = '{esc(email)}'")
            if cur.fetchone():
                return {'statusCode': 409, 'headers': cors_headers(),
                        'body': json.dumps({'success': False, 'message': 'Пользователь с таким email уже существует'})}
            ph = hash_password(password)
            cur.execute(
                f"INSERT INTO users (email, password_hash, name, role) VALUES "
                f"('{esc(email)}', '{esc(ph)}', '{esc(name or email)}', 'user') RETURNING id, email, name, role, is_active"
            )
            r = cur.fetchone()
            user = {'id': r[0], 'email': r[1], 'name': r[2], 'role': r[3], 'is_active': r[4]}
            new_token = secrets.token_hex(32)
            ip = (event.get('requestContext') or {}).get('identity', {}).get('sourceIp', '')
            ua = headers.get('User-Agent', headers.get('user-agent', ''))[:500]
            cur.execute(
                f"INSERT INTO user_sessions (token, user_id, expires_at, ip, user_agent) VALUES "
                f"('{new_token}', {user['id']}, CURRENT_TIMESTAMP + INTERVAL '{SESSION_TTL_DAYS} days', "
                f"'{esc(ip)}', '{esc(ua)}')"
            )
            return {'statusCode': 200, 'headers': cors_headers(),
                    'body': json.dumps({'success': True, 'user': user, 'token': new_token})}

        if method == 'POST' and action == 'login':
            body = json.loads(event.get('body') or '{}')
            email = (body.get('email') or '').strip().lower()
            password = body.get('password') or ''
            cur.execute(f"SELECT id, email, password_hash, name, role, is_active FROM users WHERE email = '{esc(email)}'")
            r = cur.fetchone()
            if not r or not check_password(password, r[2]):
                return {'statusCode': 401, 'headers': cors_headers(),
                        'body': json.dumps({'success': False, 'message': 'Неверный email или пароль'})}
            if not r[5]:
                return {'statusCode': 403, 'headers': cors_headers(),
                        'body': json.dumps({'success': False, 'message': 'Аккаунт заблокирован'})}
            user = {'id': r[0], 'email': r[1], 'name': r[3], 'role': r[4], 'is_active': r[5]}
            new_token = secrets.token_hex(32)
            ip = (event.get('requestContext') or {}).get('identity', {}).get('sourceIp', '')
            ua = headers.get('User-Agent', headers.get('user-agent', ''))[:500]
            cur.execute(
                f"INSERT INTO user_sessions (token, user_id, expires_at, ip, user_agent) VALUES "
                f"('{new_token}', {user['id']}, CURRENT_TIMESTAMP + INTERVAL '{SESSION_TTL_DAYS} days', "
                f"'{esc(ip)}', '{esc(ua)}')"
            )
            cur.execute(f"UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = {user['id']}")
            cur.execute("DELETE FROM user_sessions WHERE expires_at < CURRENT_TIMESTAMP")
            return {'statusCode': 200, 'headers': cors_headers(),
                    'body': json.dumps({'success': True, 'user': user, 'token': new_token})}

        if method == 'DELETE' and action == 'logout':
            if token:
                safe = re.sub(r"[^a-zA-Z0-9]", "", token)[:64]
                cur.execute(f"DELETE FROM user_sessions WHERE token = '{safe}'")
            return {'statusCode': 200, 'headers': cors_headers(), 'body': json.dumps({'success': True})}

        return {'statusCode': 400, 'headers': cors_headers(),
                'body': json.dumps({'success': False, 'message': 'Неизвестное действие'})}
    finally:
        cur.close()
        conn.close()