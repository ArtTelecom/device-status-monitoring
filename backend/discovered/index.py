"""
Business: Приём расширенных данных от Windows-агента — устройства, интерфейсы, метрики. Расчёт bps по дельте счётчиков. Выдача списка для UI с детализацией.
Args: event с httpMethod, headers, body, queryStringParameters; context с request_id
Returns: JSON со списком устройств с интерфейсами и метриками
"""

import json
import os
import time
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


def safe_int(v, d=0):
    try:
        return int(float(v))
    except Exception:
        return d


def update_counters(cur, device_id, ifaces):
    """Обновляет interface_counters, считает bps по дельте."""
    now_ts = time.time()
    total_in = 0
    total_out = 0
    for iface in ifaces:
        if_index = safe_int(iface.get('if_index'))
        if_name = esc(iface.get('if_name', ''))
        in_oct = safe_int(iface.get('in_octets'))
        out_oct = safe_int(iface.get('out_octets'))
        speed = safe_int(iface.get('speed_mbps'))
        oper = esc(iface.get('oper_status', 'up'))

        cur.execute(
            f"SELECT in_octets, out_octets, EXTRACT(EPOCH FROM ts) FROM interface_counters "
            f"WHERE device_id = {device_id} AND if_index = {if_index}"
        )
        prev = cur.fetchone()
        in_bps = 0
        out_bps = 0
        if prev:
            prev_in, prev_out, prev_ts = prev
            dt = max(1.0, now_ts - float(prev_ts))
            din = max(0, in_oct - int(prev_in))
            dout = max(0, out_oct - int(prev_out))
            if din < 4_000_000_000:
                in_bps = int((din * 8) / dt)
            if dout < 4_000_000_000:
                out_bps = int((dout * 8) / dt)
            cur.execute(
                f"UPDATE interface_counters SET if_name='{if_name}', in_octets={in_oct}, out_octets={out_oct}, "
                f"in_bps={in_bps}, out_bps={out_bps}, speed_mbps={speed}, oper_status='{oper}', ts=CURRENT_TIMESTAMP "
                f"WHERE device_id={device_id} AND if_index={if_index}"
            )
        else:
            cur.execute(
                f"INSERT INTO interface_counters (device_id, if_index, if_name, in_octets, out_octets, "
                f"in_bps, out_bps, speed_mbps, oper_status) VALUES "
                f"({device_id}, {if_index}, '{if_name}', {in_oct}, {out_oct}, 0, 0, {speed}, '{oper}')"
            )
        total_in += in_bps
        total_out += out_bps
    return total_in, total_out


def insert_metric(cur, device_id, cpu, mem_pct, rtt, loss, tin, tout):
    cur.execute(
        f"INSERT INTO discovered_metrics (device_id, cpu_load, mem_pct, ping_rtt_ms, ping_loss, total_in_bps, total_out_bps) "
        f"VALUES ({device_id}, {cpu}, {mem_pct}, {rtt}, {loss}, {tin}, {tout})"
    )


def get_interfaces(cur, device_id):
    cur.execute(
        f"SELECT if_index, if_name, in_octets, out_octets, in_bps, out_bps, speed_mbps, oper_status "
        f"FROM interface_counters WHERE device_id = {device_id} ORDER BY if_index"
    )
    out = []
    for r in cur.fetchall():
        out.append({
            'if_index': r[0], 'if_name': r[1] or '',
            'in_octets': int(r[2] or 0), 'out_octets': int(r[3] or 0),
            'in_bps': int(r[4] or 0), 'out_bps': int(r[5] or 0),
            'speed_mbps': int(r[6] or 0), 'oper_status': r[7] or 'up',
        })
    return out


def handler(event: dict, context) -> dict:
    """Агент-сканер: приём и список устройств с метриками"""
    method = event.get('httpMethod', 'GET')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': cors_headers(), 'body': ''}

    dsn = os.environ.get('DATABASE_URL', '')
    conn = psycopg2.connect(dsn)
    conn.autocommit = True
    cur = conn.cursor()

    try:
        if method == 'GET':
            params = event.get('queryStringParameters') or {}
            did = params.get('id')
            if did:
                try:
                    did_i = int(did)
                except ValueError:
                    return {'statusCode': 400, 'headers': cors_headers(), 'body': json.dumps({'success': False})}
                cur.execute(
                    f"SELECT id, ip, mac, hostname, vendor, model, sys_descr, uptime, status, agent_id, "
                    f"first_seen, last_seen, on_map, COALESCE(cpu_load,0), COALESCE(mem_used,0), COALESCE(mem_total,0), "
                    f"COALESCE(ping_loss,0), COALESCE(ping_rtt_ms,0), COALESCE(contact,''), COALESCE(location,'') "
                    f"FROM discovered_devices WHERE id = {did_i}"
                )
                r = cur.fetchone()
                if not r:
                    return {'statusCode': 404, 'headers': cors_headers(), 'body': json.dumps({'success': False, 'message': 'не найдено'})}
                ifs = get_interfaces(cur, did_i)
                cur.execute(
                    f"SELECT EXTRACT(EPOCH FROM ts)::int, cpu_load, mem_pct, ping_rtt_ms, total_in_bps, total_out_bps "
                    f"FROM discovered_metrics WHERE device_id = {did_i} ORDER BY ts DESC LIMIT 60"
                )
                hist = [{'ts': r2[0], 'cpu': r2[1], 'mem': r2[2], 'rtt': r2[3], 'in_bps': int(r2[4] or 0), 'out_bps': int(r2[5] or 0)} for r2 in cur.fetchall()]
                hist.reverse()
                item = {
                    'id': r[0], 'ip': r[1], 'mac': r[2], 'hostname': r[3], 'vendor': r[4],
                    'model': r[5], 'sys_descr': r[6], 'uptime': r[7], 'status': r[8],
                    'agent_id': r[9],
                    'first_seen': r[10].isoformat() if r[10] else None,
                    'last_seen': r[11].isoformat() if r[11] else None,
                    'on_map': r[12], 'cpu_load': r[13], 'mem_used': r[14], 'mem_total': r[15],
                    'ping_loss': r[16], 'ping_rtt_ms': r[17],
                    'contact': r[18], 'location': r[19],
                    'interfaces': ifs, 'history': hist,
                }
                return {'statusCode': 200, 'headers': cors_headers(), 'body': json.dumps({'success': True, 'item': item}, ensure_ascii=False)}

            cur.execute(
                "SELECT id, ip, mac, hostname, vendor, model, sys_descr, uptime, status, agent_id, "
                "first_seen, last_seen, on_map, COALESCE(cpu_load,0), COALESCE(mem_used,0), COALESCE(mem_total,0), "
                "COALESCE(ping_loss,0), COALESCE(ping_rtt_ms,0), COALESCE(contact,''), COALESCE(location,'') "
                "FROM discovered_devices ORDER BY last_seen DESC"
            )
            items = []
            for r in cur.fetchall():
                items.append({
                    'id': r[0], 'ip': r[1], 'mac': r[2], 'hostname': r[3], 'vendor': r[4],
                    'model': r[5], 'sys_descr': r[6], 'uptime': r[7], 'status': r[8],
                    'agent_id': r[9],
                    'first_seen': r[10].isoformat() if r[10] else None,
                    'last_seen': r[11].isoformat() if r[11] else None,
                    'on_map': r[12], 'cpu_load': r[13], 'mem_used': r[14], 'mem_total': r[15],
                    'ping_loss': r[16], 'ping_rtt_ms': r[17],
                    'contact': r[18], 'location': r[19],
                })
            return {'statusCode': 200, 'headers': cors_headers(), 'body': json.dumps({'success': True, 'items': items}, ensure_ascii=False)}

        if method == 'POST':
            headers = event.get('headers') or {}
            token = headers.get('X-Agent-Token') or headers.get('x-agent-token') or ''
            expected = os.environ.get('AGENT_TOKEN', '')
            if not expected or token != expected:
                return {'statusCode': 401, 'headers': cors_headers(), 'body': json.dumps({'success': False, 'message': 'Неверный токен агента'})}
            body = json.loads(event.get('body') or '{}')
            agent_id = esc(body.get('agent_id', 'unknown'))
            devices = body.get('devices', [])
            if not isinstance(devices, list):
                return {'statusCode': 400, 'headers': cors_headers(), 'body': json.dumps({'success': False, 'message': 'devices должен быть массивом'})}
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
                contact = esc(d.get('contact', ''))
                location = esc(d.get('location', ''))
                cpu = safe_int(d.get('cpu_load'))
                mem_used = safe_int(d.get('mem_used'))
                mem_total = safe_int(d.get('mem_total'))
                ping_loss = safe_int(d.get('ping_loss'))
                ping_rtt = safe_int(d.get('ping_rtt_ms'))
                ifaces = d.get('interfaces') or []

                cur.execute(f"SELECT id FROM discovered_devices WHERE ip = '{ip}'")
                row = cur.fetchone()
                if row:
                    did_i = row[0]
                    cur.execute(
                        f"UPDATE discovered_devices SET "
                        f"mac = CASE WHEN '{mac}' <> '' THEN '{mac}' ELSE mac END, "
                        f"hostname = CASE WHEN '{hostname}' <> '' THEN '{hostname}' ELSE hostname END, "
                        f"vendor = CASE WHEN '{vendor}' <> '' THEN '{vendor}' ELSE vendor END, "
                        f"model = CASE WHEN '{model}' <> '' THEN '{model}' ELSE model END, "
                        f"sys_descr = CASE WHEN '{sys_descr}' <> '' THEN '{sys_descr}' ELSE sys_descr END, "
                        f"uptime = '{uptime}', status = '{status}', agent_id = '{agent_id}', "
                        f"cpu_load = {cpu}, mem_used = {mem_used}, mem_total = {mem_total}, "
                        f"ping_loss = {ping_loss}, ping_rtt_ms = {ping_rtt}, "
                        f"contact = CASE WHEN '{contact}' <> '' THEN '{contact}' ELSE contact END, "
                        f"location = CASE WHEN '{location}' <> '' THEN '{location}' ELSE location END, "
                        f"last_seen = CURRENT_TIMESTAMP "
                        f"WHERE id = {did_i}"
                    )
                    updated += 1
                else:
                    cur.execute(
                        f"INSERT INTO discovered_devices "
                        f"(ip, mac, hostname, vendor, model, sys_descr, uptime, status, agent_id, "
                        f"cpu_load, mem_used, mem_total, ping_loss, ping_rtt_ms, contact, location) "
                        f"VALUES ('{ip}', '{mac}', '{hostname}', '{vendor}', '{model}', "
                        f"'{sys_descr}', '{uptime}', '{status}', '{agent_id}', "
                        f"{cpu}, {mem_used}, {mem_total}, {ping_loss}, {ping_rtt}, '{contact}', '{location}') "
                        f"RETURNING id"
                    )
                    did_i = cur.fetchone()[0]
                    inserted += 1

                tin, tout = update_counters(cur, did_i, ifaces) if ifaces else (0, 0)
                mem_pct = int((mem_used * 100) / mem_total) if mem_total > 0 else 0
                insert_metric(cur, did_i, cpu, mem_pct, ping_rtt, ping_loss, tin, tout)

            cur.execute("DELETE FROM discovered_metrics WHERE ts < NOW() - INTERVAL '24 hours'")
            return {'statusCode': 200, 'headers': cors_headers(), 'body': json.dumps({'success': True, 'inserted': inserted, 'updated': updated})}

        if method == 'DELETE':
            params = event.get('queryStringParameters') or {}
            if params.get('all') in ('1', 'true', 'yes'):
                cur.execute("DELETE FROM interface_counters")
                cur.execute("DELETE FROM discovered_metrics")
                cur.execute("DELETE FROM discovered_devices")
                return {'statusCode': 200, 'headers': cors_headers(), 'body': json.dumps({'success': True, 'deleted_all': True})}
            did = params.get('id')
            if not did:
                return {'statusCode': 400, 'headers': cors_headers(), 'body': json.dumps({'success': False, 'message': 'id обязателен'})}
            try:
                did_i = int(did)
            except ValueError:
                return {'statusCode': 400, 'headers': cors_headers(), 'body': json.dumps({'success': False, 'message': 'id должен быть числом'})}
            cur.execute(f"DELETE FROM interface_counters WHERE device_id = {did_i}")
            cur.execute(f"DELETE FROM discovered_metrics WHERE device_id = {did_i}")
            cur.execute(f"DELETE FROM discovered_devices WHERE id = {did_i}")
            return {'statusCode': 200, 'headers': cors_headers(), 'body': json.dumps({'success': True, 'deleted': did_i})}

        if method == 'PATCH':
            body = json.loads(event.get('body') or '{}')
            did = body.get('id')
            on_map = body.get('on_map')
            if did is None:
                return {'statusCode': 400, 'headers': cors_headers(), 'body': json.dumps({'success': False, 'message': 'id обязателен'})}
            try:
                did_i = int(did)
            except ValueError:
                return {'statusCode': 400, 'headers': cors_headers(), 'body': json.dumps({'success': False, 'message': 'id должен быть числом'})}
            on_map_v = 'TRUE' if on_map else 'FALSE'
            cur.execute(f"UPDATE discovered_devices SET on_map = {on_map_v} WHERE id = {did_i}")
            return {'statusCode': 200, 'headers': cors_headers(), 'body': json.dumps({'success': True})}

        return {'statusCode': 405, 'headers': cors_headers(), 'body': json.dumps({'success': False, 'message': 'Method not allowed'})}
    finally:
        cur.close()
        conn.close()
