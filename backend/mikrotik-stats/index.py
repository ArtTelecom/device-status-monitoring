"""
Business: Управление настройками роутера/портов и историей трафика. Запись sample, выдача истории/пиков, изменение имён и ролей.
Args: event с httpMethod (GET для чтения, POST для записи sample, PUT для настроек), queryStringParameters, body
Returns: HTTP-ответ JSON со статистикой/настройками
"""

import json
import os
from datetime import datetime, timedelta
from typing import Any

import psycopg2
from psycopg2.extras import RealDictCursor


def get_conn():
    return psycopg2.connect(os.environ['DATABASE_URL'])


def cors_headers() -> dict:
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
        'Access-Control-Max-Age': '86400',
    }


def ok(body: Any) -> dict:
    return {
        'statusCode': 200,
        'headers': {**cors_headers(), 'Content-Type': 'application/json'},
        'isBase64Encoded': False,
        'body': json.dumps(body, ensure_ascii=False, default=str),
    }


def err(message: str, code: int = 400) -> dict:
    return {
        'statusCode': code,
        'headers': {**cors_headers(), 'Content-Type': 'application/json'},
        'isBase64Encoded': False,
        'body': json.dumps({'error': message}, ensure_ascii=False),
    }


def safe_str(s: Any) -> str:
    return str(s).replace("'", "''") if s is not None else ''


def handle_record_sample(body: dict) -> dict:
    """POST /record — пишет один срез счётчиков по всем портам"""
    router_id = body.get('router_id', 'r4-arttelecom')
    samples = body.get('samples', [])
    if not samples:
        return err('No samples')

    conn = get_conn()
    cur = conn.cursor()
    try:
        ts_now = datetime.utcnow()
        for s in samples:
            port = safe_str(s.get('port', ''))
            rx = int(s.get('rx_bytes', 0))
            tx = int(s.get('tx_bytes', 0))
            rx_bps = int(s.get('rx_bps', 0))
            tx_bps = int(s.get('tx_bps', 0))
            cur.execute(
                f"INSERT INTO port_traffic_samples (router_id, port_name, ts, rx_bytes, tx_bytes, rx_bps, tx_bps) "
                f"VALUES ('{safe_str(router_id)}', '{port}', '{ts_now}', {rx}, {tx}, {rx_bps}, {tx_bps})"
            )
            # Обновляем пики по периодам
            for period, hours in [('day', 24), ('week', 24 * 7), ('month', 24 * 30)]:
                cur.execute(
                    f"INSERT INTO port_peak_speeds (router_id, port_name, period, peak_rx_bps, peak_tx_bps, peak_rx_at, peak_tx_at) "
                    f"VALUES ('{safe_str(router_id)}', '{port}', '{period}', {rx_bps}, {tx_bps}, '{ts_now}', '{ts_now}') "
                    f"ON CONFLICT (router_id, port_name, period) DO UPDATE SET "
                    f"peak_rx_bps = GREATEST(port_peak_speeds.peak_rx_bps, EXCLUDED.peak_rx_bps), "
                    f"peak_tx_bps = GREATEST(port_peak_speeds.peak_tx_bps, EXCLUDED.peak_tx_bps), "
                    f"peak_rx_at = CASE WHEN EXCLUDED.peak_rx_bps > port_peak_speeds.peak_rx_bps THEN EXCLUDED.peak_rx_at ELSE port_peak_speeds.peak_rx_at END, "
                    f"peak_tx_at = CASE WHEN EXCLUDED.peak_tx_bps > port_peak_speeds.peak_tx_bps THEN EXCLUDED.peak_tx_at ELSE port_peak_speeds.peak_tx_at END, "
                    f"updated_at = NOW()"
                )
        # Чистим старые семплы (>40 дней)
        cur.execute("DELETE FROM port_traffic_samples WHERE ts < NOW() - INTERVAL '40 days'")
        conn.commit()
        return ok({'success': True, 'recorded': len(samples)})
    except Exception as e:
        conn.rollback()
        return err(f'DB error: {e}', 500)
    finally:
        cur.close()
        conn.close()


def handle_history(qs: dict) -> dict:
    """GET /history — потребление по периодам"""
    router_id = qs.get('router_id', 'r4-arttelecom')
    period = qs.get('period', 'day')
    port = qs.get('port', '')

    intervals = {
        'day': ('1 day', 60),
        'week': ('7 days', 60 * 6),
        '15days': ('15 days', 60 * 12),
        'month': ('30 days', 60 * 24),
    }
    if period not in intervals:
        return err('Bad period')

    interval_str, bucket_minutes = intervals[period]

    conn = get_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        port_filter = f" AND port_name = '{safe_str(port)}'" if port else ""

        # Агрегация по бакетам
        cur.execute(f"""
            SELECT 
                date_trunc('hour', ts) + 
                INTERVAL '1 minute' * (FLOOR(EXTRACT(MINUTE FROM ts) / {bucket_minutes}) * {bucket_minutes}) AS bucket,
                port_name,
                MAX(rx_bytes) - MIN(rx_bytes) AS rx_consumed,
                MAX(tx_bytes) - MIN(tx_bytes) AS tx_consumed,
                MAX(rx_bps) AS peak_rx_bps,
                MAX(tx_bps) AS peak_tx_bps,
                AVG(rx_bps)::BIGINT AS avg_rx_bps,
                AVG(tx_bps)::BIGINT AS avg_tx_bps
            FROM port_traffic_samples
            WHERE router_id = '{safe_str(router_id)}'
              AND ts >= NOW() - INTERVAL '{interval_str}'
              {port_filter}
            GROUP BY bucket, port_name
            ORDER BY bucket ASC
        """)
        rows = cur.fetchall()

        # Суммарное потребление за период по портам
        cur.execute(f"""
            WITH ranked AS (
                SELECT port_name,
                    rx_bytes, tx_bytes,
                    ROW_NUMBER() OVER (PARTITION BY port_name ORDER BY ts ASC) AS rn_first,
                    ROW_NUMBER() OVER (PARTITION BY port_name ORDER BY ts DESC) AS rn_last
                FROM port_traffic_samples
                WHERE router_id = '{safe_str(router_id)}'
                  AND ts >= NOW() - INTERVAL '{interval_str}'
                  {port_filter}
            )
            SELECT port_name,
                   MAX(CASE WHEN rn_last = 1 THEN rx_bytes END) - MIN(CASE WHEN rn_first = 1 THEN rx_bytes END) AS rx_total,
                   MAX(CASE WHEN rn_last = 1 THEN tx_bytes END) - MIN(CASE WHEN rn_first = 1 THEN tx_bytes END) AS tx_total
            FROM ranked
            GROUP BY port_name
        """)
        totals = cur.fetchall()

        return ok({
            'period': period,
            'router_id': router_id,
            'history': rows,
            'totals_per_port': totals,
        })
    except Exception as e:
        return err(f'Query error: {e}', 500)
    finally:
        cur.close()
        conn.close()


def handle_peaks(qs: dict) -> dict:
    """GET /peaks — максимальные зафиксированные скорости"""
    router_id = qs.get('router_id', 'r4-arttelecom')
    conn = get_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(f"""
            SELECT port_name, period, peak_rx_bps, peak_tx_bps, peak_rx_at, peak_tx_at, updated_at
            FROM port_peak_speeds
            WHERE router_id = '{safe_str(router_id)}'
            ORDER BY port_name, period
        """)
        return ok({'peaks': cur.fetchall()})
    except Exception as e:
        return err(f'DB error: {e}', 500)
    finally:
        cur.close()
        conn.close()


def handle_settings_get(qs: dict) -> dict:
    """GET /settings"""
    router_id = qs.get('router_id', 'r4-arttelecom')
    conn = get_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(f"SELECT * FROM router_settings WHERE router_id = '{safe_str(router_id)}'")
        router = cur.fetchone()
        cur.execute(f"SELECT * FROM port_settings WHERE router_id = '{safe_str(router_id)}' ORDER BY port_name")
        ports = cur.fetchall()
        return ok({'router': router, 'ports': ports})
    except Exception as e:
        return err(f'DB error: {e}', 500)
    finally:
        cur.close()
        conn.close()


def handle_router_update(body: dict) -> dict:
    """PUT /settings/router"""
    router_id = body.get('router_id', 'r4-arttelecom')
    name = safe_str(body.get('custom_name', ''))
    role = safe_str(body.get('role', ''))
    location = safe_str(body.get('location', ''))
    photo_url = body.get('photo_url', None)
    auto_photo = bool(body.get('auto_photo', True))
    notes = safe_str(body.get('notes', ''))

    conn = get_conn()
    cur = conn.cursor()
    try:
        photo_part = f"'{safe_str(photo_url)}'" if photo_url else 'NULL'
        cur.execute(f"""
            INSERT INTO router_settings (router_id, custom_name, role, location, photo_url, auto_photo, notes, updated_at)
            VALUES ('{safe_str(router_id)}', '{name}', '{role}', '{location}', {photo_part}, {auto_photo}, '{notes}', NOW())
            ON CONFLICT (router_id) DO UPDATE SET
                custom_name = EXCLUDED.custom_name,
                role = EXCLUDED.role,
                location = EXCLUDED.location,
                photo_url = EXCLUDED.photo_url,
                auto_photo = EXCLUDED.auto_photo,
                notes = EXCLUDED.notes,
                updated_at = NOW()
        """)
        conn.commit()
        return ok({'success': True})
    except Exception as e:
        conn.rollback()
        return err(f'DB error: {e}', 500)
    finally:
        cur.close()
        conn.close()


def handle_port_update(body: dict) -> dict:
    """PUT /settings/port"""
    router_id = body.get('router_id', 'r4-arttelecom')
    port_name = safe_str(body.get('port_name', ''))
    if not port_name:
        return err('port_name required')
    custom_name = safe_str(body.get('custom_name', ''))
    role = safe_str(body.get('role', 'lan'))
    description = safe_str(body.get('description', ''))
    color = safe_str(body.get('color', ''))
    is_uplink = bool(body.get('is_uplink', False))
    is_downlink = bool(body.get('is_downlink', False))

    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute(f"""
            INSERT INTO port_settings (router_id, port_name, custom_name, role, description, color, is_uplink, is_downlink, updated_at)
            VALUES ('{safe_str(router_id)}', '{port_name}', '{custom_name}', '{role}', '{description}', '{color}', {is_uplink}, {is_downlink}, NOW())
            ON CONFLICT (router_id, port_name) DO UPDATE SET
                custom_name = EXCLUDED.custom_name,
                role = EXCLUDED.role,
                description = EXCLUDED.description,
                color = EXCLUDED.color,
                is_uplink = EXCLUDED.is_uplink,
                is_downlink = EXCLUDED.is_downlink,
                updated_at = NOW()
        """)
        conn.commit()
        return ok({'success': True})
    except Exception as e:
        conn.rollback()
        return err(f'DB error: {e}', 500)
    finally:
        cur.close()
        conn.close()


def handler(event: dict, context) -> dict:
    method = event.get('httpMethod', 'GET')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': cors_headers(), 'body': ''}

    qs = event.get('queryStringParameters') or {}
    action = qs.get('action', 'settings')

    body = {}
    raw_body = event.get('body', '')
    if raw_body:
        try:
            body = json.loads(raw_body)
        except Exception:
            body = {}

    try:
        if method == 'GET':
            if action == 'history':
                return handle_history(qs)
            if action == 'peaks':
                return handle_peaks(qs)
            return handle_settings_get(qs)
        if method == 'POST' and action == 'record':
            return handle_record_sample(body)
        if method == 'PUT':
            if action == 'router':
                return handle_router_update(body)
            if action == 'port':
                return handle_port_update(body)
        return err('Unsupported action', 405)
    except Exception as e:
        return err(f'Internal error: {e}', 500)
