"""
Business: Авто-построение топологии из LLDP-соседей. Сопоставляет соседей с найденными устройствами по MAC/IP, создаёт map_devices (если ещё нет) и map_links с привязкой к интерфейсам и включённым auto_traffic.
Args: event с httpMethod POST; context с request_id
Returns: JSON с результатом — сколько добавлено устройств и линий
"""

import json
import os
import math
import psycopg2


def cors_headers():
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json',
    }


def esc(s) -> str:
    return str(s if s is not None else '').replace("'", "''")


def norm_mac(s: str) -> str:
    if not s:
        return ''
    s = s.lower().replace('-', ':').replace(' ', '')
    if ':' not in s and len(s) == 12:
        s = ':'.join(s[i:i+2] for i in range(0, 12, 2))
    return s


def detect_type(sys_descr: str, vendor: str) -> str:
    s = (sys_descr + ' ' + vendor).lower()
    if 'olt' in s:
        return 'olt'
    if 'onu' in s or 'epon' in s or 'gpon' in s:
        return 'onu'
    if 'switch' in s or 'eltex' in s:
        return 'switch'
    if 'routeros' in s or 'mikrotik' in s or 'router' in s:
        return 'router'
    if 'server' in s or 'linux' in s or 'windows' in s:
        return 'server'
    return 'router'


def detect_icon(t: str) -> str:
    return {
        'olt': 'HardDrive', 'onu': 'Wifi', 'switch': 'Network',
        'router': 'Router', 'server': 'Server',
    }.get(t, 'Box')


def handler(event: dict, context) -> dict:
    """Авто-построение топологии"""
    method = event.get('httpMethod', 'POST')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': cors_headers(), 'body': ''}
    if method != 'POST':
        return {'statusCode': 405, 'headers': cors_headers(), 'body': json.dumps({'success': False})}

    body = json.loads(event.get('body') or '{}')
    clear_first = bool(body.get('clear', False))

    dsn = os.environ.get('DATABASE_URL', '')
    conn = psycopg2.connect(dsn)
    conn.autocommit = True
    cur = conn.cursor()

    try:
        # Все обнаруженные устройства
        cur.execute("SELECT id, ip, mac, hostname, vendor, sys_descr FROM discovered_devices")
        disc = {}
        by_mac = {}
        by_ip = {}
        by_name = {}
        for r in cur.fetchall():
            did, ip, mac, host, vendor, descr = r
            disc[did] = {
                'id': did, 'ip': ip, 'mac': norm_mac(mac or ''),
                'hostname': host or '', 'vendor': vendor or '', 'sys_descr': descr or '',
            }
            if mac:
                by_mac[norm_mac(mac)] = did
            if ip:
                by_ip[ip] = did
            if host:
                by_name[host.lower()] = did

        # Существующие map_devices, индекс по discovered_id (через name match)
        cur.execute("SELECT id, name, device_type, x, y FROM map_devices")
        map_dev_by_name = {}
        max_x, max_y = 0, 0
        for r in cur.fetchall():
            map_dev_by_name[(r[1] or '').lower()] = {'id': r[0], 'type': r[2], 'x': r[3] or 0, 'y': r[4] or 0}
            max_x = max(max_x, r[3] or 0)
            max_y = max(max_y, r[4] or 0)

        # Привязка discovered_id -> map_device_id
        disc_to_map = {}

        if clear_first:
            cur.execute("DELETE FROM map_links")

        def ensure_map_device(did):
            """Создаёт map_devices если нет, возвращает map_id."""
            if did in disc_to_map:
                return disc_to_map[did]
            d = disc[did]
            name = d['hostname'] or d['ip']
            key = name.lower()
            if key in map_dev_by_name:
                mid = map_dev_by_name[key]['id']
                disc_to_map[did] = mid
                return mid
            # Создаём
            t = detect_type(d['sys_descr'], d['vendor'])
            icon = detect_icon(t)
            # Расположим по сетке
            n = len(disc_to_map) + len(map_dev_by_name)
            x = 200 + (n % 6) * 220
            y = 150 + (n // 6) * 180
            cur.execute(
                f"INSERT INTO map_devices (device_type, name, lat, lng, status, comment, icon, x, y) "
                f"VALUES ('{t}', '{esc(name)}', 0, 0, 'online', "
                f"'{esc(d['ip'])}{(' · ' + d['mac']) if d['mac'] else ''}', '{icon}', {x}, {y}) "
                f"RETURNING id"
            )
            mid = cur.fetchone()[0]
            map_dev_by_name[key] = {'id': mid, 'type': t, 'x': x, 'y': y}
            disc_to_map[did] = mid
            return mid

        # Все соседи + локальные интерфейсы (для если нужен local_if_index)
        cur.execute(
            "SELECT n.device_id, n.local_if_index, n.local_if_name, "
            "n.remote_chassis_id, n.remote_port_id, n.remote_port_descr, "
            "n.remote_sys_name, n.remote_mgmt_ip "
            "FROM lldp_neighbors n"
        )
        neigh_rows = cur.fetchall()

        # Для каждого соседа найти remote device_id (discovered)
        link_pairs = {}  # ключ (frozenset {a,b}, src_if, tgt_if) -> {src,tgt,src_if,tgt_if,src_port,tgt_port}
        unmatched = 0
        for row in neigh_rows:
            local_did, local_if_idx, local_if_name, rch, rport, rdescr, rsys, rip = row
            local_if_idx = int(local_if_idx or 0)
            # Ищем remote
            remote_did = None
            if rip and rip in by_ip:
                remote_did = by_ip[rip]
            if not remote_did and rch:
                rch_n = norm_mac(rch)
                if rch_n in by_mac:
                    remote_did = by_mac[rch_n]
            if not remote_did and rsys and rsys.lower() in by_name:
                remote_did = by_name[rsys.lower()]
            if not remote_did:
                unmatched += 1
                continue
            if remote_did == local_did:
                continue
            # Найдём if_index у remote по rport (если рport — имя интерфейса)
            remote_if_idx = 0
            if rport:
                cur.execute(
                    f"SELECT if_index FROM interface_counters "
                    f"WHERE device_id = {remote_did} AND (if_name = '{esc(rport)}' OR if_name = '{esc(rdescr)}') LIMIT 1"
                )
                rr = cur.fetchone()
                if rr:
                    remote_if_idx = rr[0]
            # Канонизируем пару (меньший discovered_id первым)
            a, b = sorted([local_did, remote_did])
            if a == local_did:
                src_did, tgt_did = local_did, remote_did
                src_if, tgt_if = local_if_idx, remote_if_idx
                src_port, tgt_port = local_if_name, (rport or rdescr or '')
            else:
                src_did, tgt_did = remote_did, local_did
                src_if, tgt_if = remote_if_idx, local_if_idx
                src_port, tgt_port = (rport or rdescr or ''), local_if_name
            key = (a, b, src_if, tgt_if)
            link_pairs[key] = {
                'src_did': src_did, 'tgt_did': tgt_did,
                'src_if': src_if, 'tgt_if': tgt_if,
                'src_port': src_port or '', 'tgt_port': tgt_port or '',
            }

        # Создаём map_devices и map_links
        created_links = 0
        for k, v in link_pairs.items():
            src_map = ensure_map_device(v['src_did'])
            tgt_map = ensure_map_device(v['tgt_did'])
            # Проверим что такой линии ещё нет
            cur.execute(
                f"SELECT id FROM map_links WHERE "
                f"((source_id = {src_map} AND target_id = {tgt_map}) OR "
                f" (source_id = {tgt_map} AND target_id = {src_map})) AND "
                f"source_if_index = {v['src_if']} AND target_if_index = {v['tgt_if']}"
            )
            if cur.fetchone():
                # Обновим привязку
                cur.execute(
                    f"UPDATE map_links SET auto_traffic = TRUE, "
                    f"source_discovered_id = {v['src_did']}, target_discovered_id = {v['tgt_did']}, "
                    f"source_if_index = {v['src_if']}, target_if_index = {v['tgt_if']}, "
                    f"source_port = '{esc(v['src_port'])}', target_port = '{esc(v['tgt_port'])}' "
                    f"WHERE source_id = {src_map} AND target_id = {tgt_map}"
                )
                continue
            cur.execute(
                f"INSERT INTO map_links (source_id, target_id, source_port, target_port, "
                f"bandwidth_mbps, current_mbps, color, waypoints, label, "
                f"source_discovered_id, target_discovered_id, source_if_index, target_if_index, auto_traffic) "
                f"VALUES ({src_map}, {tgt_map}, '{esc(v['src_port'])}', '{esc(v['tgt_port'])}', "
                f"1000, 0, '#22c55e', '[]', '', "
                f"{v['src_did']}, {v['tgt_did']}, {v['src_if']}, {v['tgt_if']}, TRUE)"
            )
            created_links += 1

        # Раскладываем устройства аккуратно: круг по типам
        if disc_to_map:
            # Простая радиальная раскладка вокруг центра
            mids = list(disc_to_map.values())
            # Группируем по типу
            cur.execute(f"SELECT id, device_type FROM map_devices WHERE id IN ({','.join(str(m) for m in mids)})")
            type_map = {r[0]: r[1] for r in cur.fetchall()}
            type_order = ['server', 'olt', 'switch', 'router', 'onu', 'other']
            grouped = {}
            for mid in mids:
                grouped.setdefault(type_map.get(mid, 'other'), []).append(mid)
            cx, cy = 600, 400
            ring = 0
            for t in type_order:
                items = grouped.get(t, [])
                if not items:
                    continue
                radius = 150 + ring * 180
                for i, mid in enumerate(items):
                    angle = 2 * math.pi * i / max(1, len(items)) - math.pi / 2
                    x = cx + radius * math.cos(angle)
                    y = cy + radius * math.sin(angle)
                    cur.execute(f"UPDATE map_devices SET x = {x:.0f}, y = {y:.0f} WHERE id = {mid}")
                ring += 1

        return {
            'statusCode': 200,
            'headers': cors_headers(),
            'body': json.dumps({
                'success': True,
                'created_devices': len(disc_to_map),
                'created_links': created_links,
                'unmatched_neighbors': unmatched,
                'total_neighbors': len(neigh_rows),
            }),
        }
    finally:
        cur.close()
        conn.close()
