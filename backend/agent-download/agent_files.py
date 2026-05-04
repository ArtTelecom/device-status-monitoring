"""Содержимое файлов агента для упаковки в ZIP."""

SCANNER_PY = r'''"""Windows-агент для сканирования локальной сети с SNMP-метриками."""

import configparser
import ipaddress
import json
import platform
import re
import socket
import subprocess
import sys
import time
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

try:
    from pysnmp.hlapi import (
        SnmpEngine, CommunityData, UdpTransportTarget, ContextData,
        ObjectType, ObjectIdentity, getCmd, nextCmd
    )
    SNMP_AVAILABLE = True
except ImportError:
    SNMP_AVAILABLE = False


CONFIG_FILE = "config.ini"
DEFAULT_CONFIG = """[agent]
# URL backend (не меняй если не знаешь зачем)
api_url = https://functions.poehali.dev/abad93d7-09ca-427b-aa2a-54953ec499b8
# Токен с сайта (значение секрета AGENT_TOKEN)
token = ВСТАВЬ_СЮДА_ТОКЕН
# Имя агента (любое - различает офисы)
agent_id = office-1

# ПОДСЕТИ — несколько через запятую или с новой строки (точка с запятой)
# Примеры:
#   subnet = 192.168.1.0/24
#   subnet = 192.168.1.0/24, 192.168.88.0/24, 10.0.0.0/24
#   subnet = 192.168.1.0/24; 192.168.88.0/24
subnet = 192.168.1.0/24

# Интервал между сканами (сек)
interval = 60
# Параллельных ping
threads = 128
# Таймаут одного ping (мс)
ping_timeout = 600

# SNMP
snmp_enabled = true
snmp_community = public
# Опрашивать таблицу интерфейсов (трафик, скорость, статус)
snmp_interfaces = true
# Опрашивать LLDP-соседей (для авто-построения топологии)
snmp_lldp = true
# Считать дроп пакетов через мини-серию ping (4 пакета)
deep_ping = true
"""


def load_config():
    if not Path(CONFIG_FILE).exists():
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            f.write(DEFAULT_CONFIG)
        print("[!] Создан config.ini. Открой и впиши token и subnet, затем запусти снова.")
        sys.exit(0)
    cfg = configparser.ConfigParser()
    cfg.read(CONFIG_FILE, encoding="utf-8")
    return cfg["agent"]


IS_WIN = platform.system().lower().startswith("win")
CREATE_NO_WINDOW = 0x08000000 if IS_WIN else 0


def _detect_oem_encoding():
    """Определяет OEM-кодировку Windows (cp866 для рус, cp437 для англ и т.д.)."""
    if not IS_WIN:
        return "utf-8"
    try:
        import ctypes
        cp = ctypes.windll.kernel32.GetOEMCP()
        return f"cp{cp}"
    except Exception:
        return "cp866"


OEM_ENCODING = _detect_oem_encoding()


def _decode_bytes(data):
    """Декодирует вывод консольной команды Windows с fallback по кодировкам."""
    if data is None:
        return ""
    if isinstance(data, str):
        return data
    for enc in (OEM_ENCODING, "cp866", "cp1251", "utf-8", "latin-1"):
        try:
            return data.decode(enc)
        except (UnicodeDecodeError, LookupError):
            continue
    return data.decode("utf-8", errors="replace")


def ping(ip, timeout_ms=800):
    try:
        if IS_WIN:
            r = subprocess.run(
                ["ping", "-n", "1", "-w", str(timeout_ms), ip],
                capture_output=True, timeout=(timeout_ms / 1000) + 2,
                creationflags=CREATE_NO_WINDOW,
            )
        else:
            r = subprocess.run(
                ["ping", "-c", "1", "-W", str(max(1, timeout_ms // 1000)), ip],
                capture_output=True, timeout=(timeout_ms / 1000) + 2,
            )
        return r.returncode == 0
    except Exception:
        return False


def get_arp_table():
    out = {}
    try:
        r = subprocess.run(
            ["arp", "-a"],
            capture_output=True, timeout=10,
            creationflags=CREATE_NO_WINDOW,
        )
        text = _decode_bytes(r.stdout)
        for line in text.splitlines():
            m = re.search(r"(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F\-:]{11,17})", line)
            if m:
                ip = m.group(1)
                mac = m.group(2).replace("-", ":").lower()
                if mac != "ff:ff:ff:ff:ff:ff" and not ip.endswith(".255"):
                    out[ip] = mac
    except Exception as e:
        print(f"[!] Ошибка ARP: {e}")
    return out


def reverse_dns(ip):
    try:
        return socket.gethostbyaddr(ip)[0]
    except Exception:
        return ""


OUI_DB = {
    "00:0c:42": "MikroTik", "08:55:31": "MikroTik", "4c:5e:0c": "MikroTik",
    "6c:3b:6b": "MikroTik", "b8:69:f4": "MikroTik", "cc:2d:e0": "MikroTik",
    "d4:ca:6d": "MikroTik", "e4:8d:8c": "MikroTik", "74:4d:28": "MikroTik",
    "00:25:9e": "Huawei", "00:e0:fc": "Huawei", "28:6e:d4": "Huawei",
    "78:1d:ba": "ZTE", "00:1e:73": "ZTE",
    "f4:6d:e2": "TP-Link", "50:c7:bf": "TP-Link", "98:da:c4": "TP-Link",
    "1c:bf:ce": "TP-Link", "60:e3:27": "TP-Link",
    "fc:ec:da": "Ubiquiti", "24:5a:4c": "Ubiquiti", "78:8a:20": "Ubiquiti",
    "ac:de:48": "Apple", "00:50:56": "VMware",
}


def vendor_from_mac(mac):
    if not mac:
        return ""
    return OUI_DB.get(mac.lower()[:8], "")


def snmp_get(ip, community, oid, timeout=2):
    if not SNMP_AVAILABLE:
        return ""
    try:
        iterator = getCmd(
            SnmpEngine(),
            CommunityData(community, mpModel=0),
            UdpTransportTarget((ip, 161), timeout=timeout, retries=0),
            ContextData(),
            ObjectType(ObjectIdentity(oid)),
        )
        errInd, errStat, errIdx, varBinds = next(iterator)
        if errInd or errStat:
            return ""
        for vb in varBinds:
            return str(vb[1])
    except Exception:
        return ""
    return ""


def snmp_probe(ip, community):
    """Базовая системная инфа: descr, name, uptime, contact, location."""
    descr = snmp_get(ip, community, "1.3.6.1.2.1.1.1.0")
    name = snmp_get(ip, community, "1.3.6.1.2.1.1.5.0")
    contact = snmp_get(ip, community, "1.3.6.1.2.1.1.4.0")
    location = snmp_get(ip, community, "1.3.6.1.2.1.1.6.0")
    uptime_raw = snmp_get(ip, community, "1.3.6.1.2.1.1.3.0")
    uptime_str = ""
    if uptime_raw and uptime_raw.isdigit():
        ticks = int(uptime_raw)
        seconds = ticks // 100
        days = seconds // 86400
        hours = (seconds % 86400) // 3600
        minutes = (seconds % 3600) // 60
        uptime_str = f"{days}д {hours}ч {minutes}м"
    return descr, name, uptime_str, contact, location


def snmp_walk(ip, community, oid, timeout=2, max_rows=128):
    """Возвращает список (oid_suffix, value) для подветки."""
    if not SNMP_AVAILABLE:
        return []
    out = []
    try:
        for (errInd, errStat, errIdx, varBinds) in nextCmd(
            SnmpEngine(),
            CommunityData(community, mpModel=0),
            UdpTransportTarget((ip, 161), timeout=timeout, retries=0),
            ContextData(),
            ObjectType(ObjectIdentity(oid)),
            lexicographicMode=False,
        ):
            if errInd or errStat:
                break
            for vb in varBinds:
                full = str(vb[0])
                if not full.startswith(oid):
                    return out
                suffix = full[len(oid):].lstrip(".")
                out.append((suffix, str(vb[1])))
            if len(out) >= max_rows:
                break
    except Exception:
        pass
    return out


def snmp_interfaces(ip, community):
    """Таблица ifTable: index, name, speed, oper, in/out octets."""
    if not SNMP_AVAILABLE:
        return []
    names = dict(snmp_walk(ip, community, "1.3.6.1.2.1.31.1.1.1.1"))   # ifName
    if not names:
        names = dict(snmp_walk(ip, community, "1.3.6.1.2.1.2.2.1.2"))  # ifDescr
    speeds = dict(snmp_walk(ip, community, "1.3.6.1.2.1.31.1.1.1.15"))  # ifHighSpeed (Mbps)
    opers = dict(snmp_walk(ip, community, "1.3.6.1.2.1.2.2.1.8"))       # ifOperStatus
    in_oct = dict(snmp_walk(ip, community, "1.3.6.1.2.1.31.1.1.1.6"))   # ifHCInOctets
    out_oct = dict(snmp_walk(ip, community, "1.3.6.1.2.1.31.1.1.1.10")) # ifHCOutOctets
    if not in_oct:
        in_oct = dict(snmp_walk(ip, community, "1.3.6.1.2.1.2.2.1.10"))
    if not out_oct:
        out_oct = dict(snmp_walk(ip, community, "1.3.6.1.2.1.2.2.1.16"))
    out = []
    for idx, name in names.items():
        try:
            i = int(idx)
        except ValueError:
            continue
        try:
            in_o = int(in_oct.get(idx, "0") or 0)
            out_o = int(out_oct.get(idx, "0") or 0)
            speed_mbps = int(speeds.get(idx, "0") or 0)
            oper_raw = opers.get(idx, "1")
            oper = "up" if str(oper_raw) == "1" else "down"
        except Exception:
            continue
        out.append({
            "if_index": i,
            "if_name": name,
            "in_octets": in_o,
            "out_octets": out_o,
            "speed_mbps": speed_mbps,
            "oper_status": oper,
        })
    return out


def _hex_to_mac(s):
    """Преобразует hex-строку SNMP в MAC."""
    s = s.replace(" ", "").replace("0x", "").replace(":", "").replace("-", "")
    if len(s) == 12 and all(c in "0123456789abcdefABCDEF" for c in s):
        return ":".join(s[i:i+2].lower() for i in range(0, 12, 2))
    return s.lower()


def _hex_to_ip(s):
    """SNMP-вывод IP в hex (4 байта) -> dotted."""
    s = s.replace(" ", "").replace("0x", "")
    if len(s) == 8 and all(c in "0123456789abcdefABCDEF" for c in s):
        try:
            return ".".join(str(int(s[i:i+2], 16)) for i in range(0, 8, 2))
        except Exception:
            return ""
    return s if "." in s else ""


def snmp_lldp(ip, community):
    """Собирает таблицу LLDP-соседей."""
    if not SNMP_AVAILABLE:
        return []
    # lldpRemTable: индекс = lldpRemTimeMark.lldpRemLocalPortNum.lldpRemIndex
    chassis = snmp_walk(ip, community, "1.0.8802.1.1.2.1.4.1.1.5")  # lldpRemChassisId
    port_id = snmp_walk(ip, community, "1.0.8802.1.1.2.1.4.1.1.7")  # lldpRemPortId
    port_descr = dict(snmp_walk(ip, community, "1.0.8802.1.1.2.1.4.1.1.8"))
    sys_name = dict(snmp_walk(ip, community, "1.0.8802.1.1.2.1.4.1.1.9"))
    # lldpRemManAddrTable: индекс начинается с timemark.localport.remindex.addrtype.addrlen.addr
    mgmt_walk = snmp_walk(ip, community, "1.0.8802.1.1.2.1.4.2.1.3", max_rows=256)  # lldpRemManAddrIfId
    # Имена локальных интерфейсов
    if_names = dict(snmp_walk(ip, community, "1.3.6.1.2.1.31.1.1.1.1"))
    if not if_names:
        if_names = dict(snmp_walk(ip, community, "1.3.6.1.2.1.2.2.1.2"))

    # Соберём mgmt IP по (timemark.localport.remindex)
    mgmt_by_key = {}
    for full_idx, _ifid in mgmt_walk:
        parts = full_idx.split(".")
        if len(parts) < 6:
            continue
        # parts: timemark, localport, remindex, addrtype, addrlen, ip-bytes...
        try:
            addr_type = int(parts[3])
            addr_len = int(parts[4])
        except ValueError:
            continue
        if addr_type != 1 or addr_len != 4:  # ipv4
            continue
        ip_parts = parts[5:5 + addr_len]
        if len(ip_parts) != 4:
            continue
        try:
            ip_str = ".".join(str(int(x)) for x in ip_parts)
        except ValueError:
            continue
        key = ".".join(parts[:3])
        mgmt_by_key[key] = ip_str

    out = []
    pid_map = dict(port_id)
    for full_idx, ch_raw in chassis:
        # full_idx: timemark.localport.remindex
        parts = full_idx.split(".")
        if len(parts) != 3:
            continue
        try:
            local_port = int(parts[1])
        except ValueError:
            local_port = 0
        chassis_val = ch_raw
        if "0x" in ch_raw or all(c in "0123456789abcdefABCDEF " for c in ch_raw.strip()):
            mac = _hex_to_mac(ch_raw)
            if len(mac) == 17:
                chassis_val = mac
        rport = pid_map.get(full_idx, "")
        if "0x" in rport or (rport and all(c in "0123456789abcdefABCDEF " for c in rport.strip())):
            maybe_mac = _hex_to_mac(rport)
            if len(maybe_mac) == 17:
                rport = maybe_mac
        out.append({
            "local_if_index": local_port,
            "local_if_name": if_names.get(str(local_port), ""),
            "remote_chassis_id": chassis_val.lower(),
            "remote_port_id": rport,
            "remote_port_descr": port_descr.get(full_idx, ""),
            "remote_sys_name": sys_name.get(full_idx, ""),
            "remote_mgmt_ip": mgmt_by_key.get(full_idx, ""),
            "protocol": "lldp",
        })
    return out


def detect_is_olt(sys_descr, vendor):
    s = (sys_descr + " " + vendor).lower()
    return any(k in s for k in ["olt", "epon", "gpon", "c-data", "cdata", "bdcom", "v-sol", "vsol"])


def snmp_olt_onus(ip, community):
    """
    Опрашивает SNMP таблицы ONU на OLT (поддержка C-DATA / BDCOM EPON и Huawei GPON).
    Возвращает список словарей с ONU.
    """
    if not SNMP_AVAILABLE:
        return []
    onus = []

    # === EPON (C-DATA / BDCOM) ===
    # cdata-epon-mib: oltEponOnuStatus tree (приватный OID 1.3.6.1.4.1.17409 - C-DATA)
    # Универсальный путь: dot3OamPeerVendorOui (1.3.6.1.2.1.158.1.1.1.5)
    # MAC ONU: dot3OamPeerMacAddress (1.3.6.1.2.1.158.1.1.1.4) - не везде есть
    onu_macs = snmp_walk(ip, community, "1.3.6.1.4.1.17409.2.3.4.1.1.4", max_rows=512)
    if not onu_macs:
        onu_macs = snmp_walk(ip, community, "1.3.6.1.4.1.3320.101.10.1.1.3", max_rows=512)  # BDCOM
    onu_status_w = snmp_walk(ip, community, "1.3.6.1.4.1.17409.2.3.4.1.1.5", max_rows=512)
    onu_rx_w = snmp_walk(ip, community, "1.3.6.1.4.1.17409.2.8.4.1.1.4", max_rows=512)  # ONU RX (0.1 dBm)
    onu_tx_w = snmp_walk(ip, community, "1.3.6.1.4.1.17409.2.8.4.1.1.5", max_rows=512)
    olt_rx_w = snmp_walk(ip, community, "1.3.6.1.4.1.17409.2.8.4.1.1.6", max_rows=512)
    onu_temp_w = snmp_walk(ip, community, "1.3.6.1.4.1.17409.2.8.4.1.1.1", max_rows=512)
    onu_dist_w = snmp_walk(ip, community, "1.3.6.1.4.1.17409.2.3.4.1.1.10", max_rows=512)
    onu_descr_w = snmp_walk(ip, community, "1.3.6.1.4.1.17409.2.3.4.1.1.6", max_rows=512)

    def to_dict(rows):
        return {k: v for k, v in rows}

    macs = to_dict(onu_macs)
    statuses = to_dict(onu_status_w)
    rxs = to_dict(onu_rx_w)
    txs = to_dict(onu_tx_w)
    olt_rxs = to_dict(olt_rx_w)
    temps = to_dict(onu_temp_w)
    dists = to_dict(onu_dist_w)
    descrs = to_dict(onu_descr_w)

    for idx, mac_raw in macs.items():
        mac = _hex_to_mac(mac_raw)
        if len(mac) != 17:
            mac = mac_raw
        # idx обычно вида: <ifIndex>.<onuId>
        port_parts = idx.split(".")
        olt_port = port_parts[0] if port_parts else ''
        onu_id_str = port_parts[-1] if port_parts else idx
        try:
            onu_id = int(onu_id_str)
        except ValueError:
            onu_id = 0

        def fnum(s, scale=1.0):
            try:
                return float(s) * scale
            except (ValueError, TypeError):
                return 0.0

        rx = fnum(rxs.get(idx, "0"), 0.1)
        tx = fnum(txs.get(idx, "0"), 0.1)
        olt_rx = fnum(olt_rxs.get(idx, "0"), 0.1)
        temp = fnum(temps.get(idx, "0"), 1.0)
        dist = int(fnum(dists.get(idx, "0")))
        st_raw = statuses.get(idx, "1")
        status = "online" if str(st_raw) in ("1", "3", "registered") else "offline"
        descr = descrs.get(idx, "")

        onus.append({
            "onu_index": onu_id,
            "olt_port": olt_port,
            "mac": mac,
            "name": descr or f"ONU-{onu_id}",
            "rx_power_dbm": round(rx, 2),
            "tx_power_dbm": round(tx, 2),
            "olt_rx_dbm": round(olt_rx, 2),
            "temp_c": round(temp, 1),
            "distance_m": dist,
            "status": status,
        })

    # === Huawei GPON (если C-DATA пусто) ===
    if not onus:
        hw_serials = snmp_walk(ip, community, "1.3.6.1.4.1.2011.6.128.1.1.2.43.1.3", max_rows=512)
        hw_status = to_dict(snmp_walk(ip, community, "1.3.6.1.4.1.2011.6.128.1.1.2.46.1.15", max_rows=512))
        hw_rx = to_dict(snmp_walk(ip, community, "1.3.6.1.4.1.2011.6.128.1.1.2.51.1.4", max_rows=512))
        for idx, sn in hw_serials:
            try:
                rx_v = float(hw_rx.get(idx, "0")) / 100.0
            except ValueError:
                rx_v = 0.0
            st = "online" if str(hw_status.get(idx, "1")) == "1" else "offline"
            parts = idx.split(".")
            olt_port = parts[0] if parts else ''
            onu_id_str = parts[-1] if parts else idx
            try:
                onu_id = int(onu_id_str)
            except ValueError:
                onu_id = 0
            onus.append({
                "onu_index": onu_id,
                "olt_port": olt_port,
                "mac": "",
                "serial": sn,
                "name": f"ONU-{onu_id}",
                "rx_power_dbm": round(rx_v, 2),
                "tx_power_dbm": 0,
                "olt_rx_dbm": 0,
                "temp_c": 0,
                "distance_m": 0,
                "status": st,
            })

    return onus


def snmp_cpu_mem(ip, community):
    """CPU и память — пробуем универсальные OID + специфичные."""
    cpu = 0
    # MikroTik mtxrSystem (KB)
    rows = snmp_walk(ip, community, "1.3.6.1.2.1.25.3.3.1.2", max_rows=8)
    if rows:
        try:
            vals = [int(v) for _, v in rows if v.lstrip("-").isdigit()]
            if vals:
                cpu = sum(vals) // len(vals)
        except Exception:
            pass
    # Память (hrStorageSize/Used)
    mem_used = 0
    mem_total = 0
    sizes = snmp_walk(ip, community, "1.3.6.1.2.1.25.2.3.1.5", max_rows=16)
    used = snmp_walk(ip, community, "1.3.6.1.2.1.25.2.3.1.6", max_rows=16)
    types = snmp_walk(ip, community, "1.3.6.1.2.1.25.2.3.1.2", max_rows=16)
    ram_idx = None
    for k, v in types:
        if v.endswith(".2"):  # hrStorageRam
            ram_idx = k
            break
    if ram_idx:
        for k, v in sizes:
            if k == ram_idx:
                try: mem_total = int(v)
                except: pass
        for k, v in used:
            if k == ram_idx:
                try: mem_used = int(v)
                except: pass
    return cpu, mem_used, mem_total


def detect_model(sys_descr, vendor):
    if not sys_descr:
        return ""
    s = sys_descr.lower()
    if "routeros" in s:
        m = re.search(r"routeros\s+([\d.]+)", s)
        return f"MikroTik RouterOS {m.group(1)}" if m else "MikroTik RouterOS"
    if "huawei" in s:
        return sys_descr.split(",")[0][:200]
    return sys_descr[:200]


def parse_subnets(raw):
    """Поддерживает несколько подсетей через ',' ';' или новую строку."""
    parts = re.split(r"[,;\n\r]+", raw or "")
    return [p.strip() for p in parts if p.strip()]


def deep_ping(ip, count=4, timeout_ms=600):
    """Серия ping для расчёта потерь и среднего RTT."""
    try:
        if IS_WIN:
            r = subprocess.run(
                ["ping", "-n", str(count), "-w", str(timeout_ms), ip],
                capture_output=True, timeout=count * (timeout_ms / 1000) + 3,
                creationflags=CREATE_NO_WINDOW,
            )
        else:
            r = subprocess.run(
                ["ping", "-c", str(count), "-W", str(max(1, timeout_ms // 1000)), ip],
                capture_output=True, timeout=count * (timeout_ms / 1000) + 3,
            )
        text = _decode_bytes(r.stdout)
        # Потери
        loss = 0
        m = re.search(r"(\d+)%\s*(потерь|loss)", text, re.IGNORECASE)
        if m:
            loss = int(m.group(1))
        # Средний RTT
        rtt = 0
        m = re.search(r"(?:Average|Среднее|avg)\s*=?\s*(\d+)\s*ms", text, re.IGNORECASE)
        if m:
            rtt = int(m.group(1))
        else:
            m2 = re.search(r"=\s*[\d./]+/(\d+\.?\d*)/", text)
            if m2:
                rtt = int(float(m2.group(1)))
        return loss, rtt
    except Exception:
        return 100, 0


def scan_subnets(subnets, threads, ping_timeout):
    """Сканит ВСЕ подсети из списка."""
    all_hosts = []
    for sn in subnets:
        try:
            net = ipaddress.ip_network(sn, strict=False)
            all_hosts.extend([str(h) for h in net.hosts()])
        except Exception as e:
            print(f"[!] Подсеть {sn} некорректна: {e}")
    if not all_hosts:
        return []
    print(f"[*] Сканирую {len(all_hosts)} адресов в {len(subnets)} подсетях ({', '.join(subnets)})...")
    alive = []
    with ThreadPoolExecutor(max_workers=int(threads)) as ex:
        futs = {ex.submit(ping, ip, int(ping_timeout)): ip for ip in all_hosts}
        for f in as_completed(futs):
            ip = futs[f]
            try:
                if f.result():
                    alive.append(ip)
            except Exception:
                pass
    return sorted(alive, key=lambda x: tuple(int(p) for p in x.split(".")))


def discover(cfg):
    subnets = parse_subnets(cfg.get("subnet", "192.168.1.0/24"))
    threads = cfg.get("threads", "128")
    ping_timeout = cfg.get("ping_timeout", "600")
    snmp_enabled = cfg.get("snmp_enabled", "true").lower() == "true"
    snmp_ifaces = cfg.get("snmp_interfaces", "true").lower() == "true"
    snmp_lldp_on = cfg.get("snmp_lldp", "true").lower() == "true"
    do_deep = cfg.get("deep_ping", "true").lower() == "true"
    community = cfg.get("snmp_community", "public")

    alive_ips = scan_subnets(subnets, threads, ping_timeout)
    arp = get_arp_table()
    print(f"[*] Живых хостов: {len(alive_ips)} | ARP: {len(arp)}")

    devices = []
    for ip in alive_ips:
        mac = arp.get(ip, "")
        hostname = reverse_dns(ip)
        vendor = vendor_from_mac(mac)
        sys_descr, sys_name, uptime, contact, location = ("", "", "", "", "")
        cpu, mem_used, mem_total = 0, 0, 0
        ifaces = []
        neighbors = []
        onus = []
        is_olt = False
        if snmp_enabled:
            sys_descr, sys_name, uptime, contact, location = snmp_probe(ip, community)
            if sys_name and not hostname:
                hostname = sys_name
            if sys_descr:
                cpu, mem_used, mem_total = snmp_cpu_mem(ip, community)
                if snmp_ifaces:
                    ifaces = snmp_interfaces(ip, community)
                if snmp_lldp_on:
                    neighbors = snmp_lldp(ip, community)
                if detect_is_olt(sys_descr, vendor_from_mac(mac)):
                    is_olt = True
                    onus = snmp_olt_onus(ip, community)
        loss, rtt = (0, 0)
        if do_deep:
            loss, rtt = deep_ping(ip, count=3, timeout_ms=int(ping_timeout))
        model = detect_model(sys_descr, vendor)
        status = "online"
        if loss >= 100:
            status = "offline"
        elif loss >= 25 or rtt > 500:
            status = "warning"
        devices.append({
            "ip": ip, "mac": mac, "hostname": hostname, "vendor": vendor,
            "model": model, "sys_descr": sys_descr, "uptime": uptime, "status": status,
            "contact": contact, "location": location,
            "cpu_load": cpu, "mem_used": mem_used, "mem_total": mem_total,
            "ping_loss": loss, "ping_rtt_ms": rtt,
            "interfaces": ifaces,
            "neighbors": neighbors,
            "is_olt": is_olt,
            "onus": onus,
        })
        extra = []
        if cpu: extra.append(f"CPU {cpu}%")
        if rtt: extra.append(f"RTT {rtt}ms")
        if loss: extra.append(f"loss {loss}%")
        if ifaces: extra.append(f"if:{len(ifaces)}")
        if neighbors: extra.append(f"lldp:{len(neighbors)}")
        if is_olt: extra.append(f"OLT onu:{len(onus)}")
        extras = " · ".join(extra)
        print(f"  {ip:15s} {mac or '-':17s} {(hostname or vendor or '-')[:25]:25s} {extras}")
    return devices


def push(cfg, devices):
    url = cfg.get("api_url")
    token = cfg.get("token", "").strip()
    agent_id = cfg.get("agent_id", "agent")
    if not token or token.startswith("ВСТАВЬ"):
        print("[!] Токен не задан в config.ini")
        return False
    payload = json.dumps({"agent_id": agent_id, "devices": devices}).encode("utf-8")
    req = urllib.request.Request(
        url, data=payload, method="POST",
        headers={"Content-Type": "application/json", "X-Agent-Token": token},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data.get("success"):
                print(f"[OK] добавлено {data.get('inserted', 0)}, обновлено {data.get('updated', 0)}")
                return True
            print(f"[!] Сервер: {data.get('message', 'ошибка')}")
            return False
    except urllib.error.HTTPError as e:
        print(f"[!] HTTP {e.code}")
        return False
    except Exception as e:
        print(f"[!] Ошибка: {e}")
        return False


def main():
    print("=" * 60)
    print("  Network Scanner Agent для Windows")
    print("=" * 60)
    cfg = load_config()
    interval = int(cfg.get("interval", "60"))
    if not SNMP_AVAILABLE:
        print("[!] pysnmp не установлен. Запусти install_deps.bat")
    while True:
        try:
            devices = discover(cfg)
            if devices:
                push(cfg, devices)
        except KeyboardInterrupt:
            return
        except Exception as e:
            print(f"[!] {e}")
        print(f"[*] Следующий скан через {interval} сек\n")
        try:
            time.sleep(interval)
        except KeyboardInterrupt:
            return


if __name__ == "__main__":
    main()
'''

README_TXT = """Network Scanner Agent для Windows
====================================

БЫСТРЫЙ СТАРТ:

1) Установи Python 3.9+ с https://python.org (галочка Add Python to PATH)
2) Двойной клик на install_deps.bat
3) Двойной клик на run.bat — создастся config.ini
4) Открой config.ini в Блокноте, впиши token и subnet
5) Снова двойной клик на run.bat


НЕСКОЛЬКО ПОДСЕТЕЙ
==================
В config.ini в строке subnet перечисли через запятую (или ;):

   subnet = 192.168.1.0/24, 192.168.88.0/24, 10.0.0.0/24

Можно и через перенос строки:
   subnet = 192.168.1.0/24
            192.168.88.0/24
            10.0.0.0/24

Агент пройдёт ping-ом ВСЕ подсети за один цикл.


ЧТО СОБИРАЕТ
============
По каждому живому устройству:
- IP, MAC, Hostname, Vendor (по MAC)
- Модель / описание (SNMP sysDescr)
- Uptime, Contact, Location (SNMP)
- CPU и память (SNMP, для устройств которые поддерживают)
- RTT и потери пакетов (серия ping)
- ВСЕ сетевые интерфейсы:
    * имя, скорость, статус up/down
    * счётчики байт IN/OUT (на сервере считается реальная скорость в Мбит/с)


РЕАЛЬНАЯ ПУЛЬСАЦИЯ ЛИНИЙ НА ТОПОЛОГИИ
=====================================
1) Открой раздел "Найдено в сети" — кликни нужное устройство, "На карту"
2) Перейди в раздел "Топология", нарисуй связь между двумя устройствами
3) В панели справа включи "Авто-трафик" и выбери интерфейс (порт) у каждой стороны
4) Линия начнёт пульсировать в реальном времени по живой статистике SNMP


ПАРАМЕТРЫ config.ini
====================
subnet         — подсети (одна или несколько через запятую)
interval       — пауза между сканами в секундах (по умолч. 60)
threads        — параллельных ping (128 хорошо, для слабого ПК 32)
ping_timeout   — таймаут одного ping в мс (600)
snmp_enabled   — опрашивать SNMP (true)
snmp_community — SNMP community (обычно public)
snmp_interfaces — собирать таблицу интерфейсов (true)
snmp_lldp       — собирать LLDP-соседей для авто-построения топологии (true)
deep_ping       — серия из 3 ping для измерения потерь и RTT (true)


АВТО-ПОСТРОЕНИЕ ТОПОЛОГИИ (LLDP)
================================
Если на сетевом оборудовании включён LLDP, агент сам соберёт информацию
"кто к кому подключён, через какой порт".

На сайте: раздел "Топология" -> кнопка "Авто (LLDP)".
   Сайт сам создаст недостающие устройства и нарисует все связи
   с правильными портами и включённой живой пульсацией.

Для MikroTik: /ip neighbor discovery-settings set discover-interface-list=all
Для Eltex/Cisco: lldp run (глобально)
Для Huawei: lldp enable (глобально)


СБОРКА В EXE (без Python)
=========================
build_exe.bat -> готовый dist\\scanner.exe
"""

AGENT_FILES = {
    "scanner.py": SCANNER_PY,
    "requirements.txt": "pysnmp==4.4.12\n",
    "run.bat": '@echo off\r\ncd /d "%~dp0"\r\npython scanner.py\r\npause\r\n',
    "install_deps.bat": '@echo off\r\necho Installing Python dependencies...\r\npip install -r requirements.txt\r\npause\r\n',
    "build_exe.bat": '@echo off\r\npip install pyinstaller pysnmp==4.4.12\r\npyinstaller --onefile --name scanner scanner.py\r\necho Done: dist\\scanner.exe\r\npause\r\n',
    "README.txt": README_TXT,
}