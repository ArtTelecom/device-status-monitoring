"""Содержимое файлов агента для упаковки в ZIP."""

SCANNER_PY = r'''"""Windows-агент для сканирования локальной сети.
Поддержка: ICMP, ARP, SNMP v1/v2c, SSH, Telnet, HTTP/HTTPS API (MikroTik REST, Ubiquiti, generic).
+ Heartbeat, выполнение команд из админки, самообновление.
"""

AGENT_VERSION = 6
CONTROL_URL = "https://functions.poehali.dev/cfa102a8-741d-4190-b2da-e58a2ed0e3b3"

import base64
import configparser
import ipaddress
import json
import os
import platform
import re
import socket
import ssl
import subprocess
import sys
import time
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

try:
    import paramiko
    SSH_AVAILABLE = True
except Exception:
    SSH_AVAILABLE = False

# telnetlib удалён в Python 3.13 — пробуем разные варианты
TELNET_AVAILABLE = False
telnetlib = None
try:
    import telnetlib  # type: ignore
    TELNET_AVAILABLE = True
except Exception:
    try:
        import telnetlib3  # пакет-замена
        TELNET_AVAILABLE = True
    except Exception:
        TELNET_AVAILABLE = False

# pysnmp v4/v5/v6/lextudio — у каждой свой импорт. Пробуем все варианты.
SNMP_AVAILABLE = False
SnmpEngine = CommunityData = UdpTransportTarget = ContextData = None
ObjectType = ObjectIdentity = getCmd = nextCmd = None
for mod_path in ("pysnmp.hlapi", "pysnmp.hlapi.v3arch", "pysnmp.hlapi.asyncio"):
    try:
        _m = __import__(mod_path, fromlist=["*"])
        SnmpEngine = getattr(_m, "SnmpEngine", None)
        CommunityData = getattr(_m, "CommunityData", None)
        UdpTransportTarget = getattr(_m, "UdpTransportTarget", None)
        ContextData = getattr(_m, "ContextData", None)
        ObjectType = getattr(_m, "ObjectType", None)
        ObjectIdentity = getattr(_m, "ObjectIdentity", None)
        getCmd = getattr(_m, "getCmd", None)
        nextCmd = getattr(_m, "nextCmd", None)
        if all([SnmpEngine, CommunityData, UdpTransportTarget, getCmd]):
            SNMP_AVAILABLE = True
            break
    except Exception:
        continue


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

# === Активные подключения по логину/паролю ===
# Если SNMP недоступен — попробуем SSH/Telnet/HTTP API
# Учётки берутся из credentials.json (см. credentials.example.json)
ssh_enabled = true
ssh_timeout = 5
telnet_enabled = true
telnet_timeout = 5
http_api_enabled = true
http_api_timeout = 6
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


# ============= АКТИВНЫЕ ПОДКЛЮЧЕНИЯ ПО ЛОГИНУ/ПАРОЛЮ =============

def load_credentials():
    """Читает credentials.json — список учёток для активных опросов."""
    p = Path("credentials.json")
    if not p.exists():
        return []
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception as e:
        print(f"[!] Ошибка credentials.json: {e}")
        return []


def cred_match(cred, ip, vendor=""):
    """Проверяет подходит ли учётка к IP/вендору."""
    nets = cred.get("networks", [])
    if nets:
        ok = False
        try:
            ip_obj = ipaddress.ip_address(ip)
            for n in nets:
                try:
                    if ip_obj in ipaddress.ip_network(n, strict=False):
                        ok = True
                        break
                except ValueError:
                    if n == ip:
                        ok = True
                        break
        except ValueError:
            pass
        if not ok:
            return False
    vend = cred.get("vendor", "")
    if vend and vend.lower() not in vendor.lower():
        return False
    return True


def ssh_run(ip, user, password, commands, port=22, timeout=5):
    """Выполняет команды по SSH, возвращает {cmd: output}."""
    if not SSH_AVAILABLE:
        return {}
    out = {}
    try:
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(
            ip, port=port, username=user, password=password,
            timeout=timeout, banner_timeout=timeout, auth_timeout=timeout,
            allow_agent=False, look_for_keys=False,
        )
        for cmd in commands:
            try:
                _stdin, stdout, _stderr = client.exec_command(cmd, timeout=timeout)
                out[cmd] = stdout.read().decode("utf-8", errors="replace")
            except Exception as e:
                out[cmd] = f"[err: {e}]"
        client.close()
    except Exception:
        return {}
    return out


def telnet_run(ip, user, password, commands, port=23, timeout=5, prompt=br"[#$>]\s*$"):
    """Выполняет команды по Telnet — просто и грубо."""
    if not TELNET_AVAILABLE:
        return {}
    out = {}
    try:
        tn = telnetlib.Telnet(ip, port, timeout)
        # Login
        tn.read_until(b"login:", timeout)
        tn.write(user.encode() + b"\n")
        tn.read_until(b"assword:", timeout)
        tn.write(password.encode() + b"\n")
        tn.read_until(b"\n", timeout)
        time.sleep(0.5)
        tn.read_very_eager()
        for cmd in commands:
            tn.write(cmd.encode() + b"\n")
            time.sleep(1.0)
            data = tn.read_very_eager()
            out[cmd] = data.decode("utf-8", errors="replace")
        try:
            tn.write(b"exit\n")
        except Exception:
            pass
        tn.close()
    except Exception:
        return {}
    return out


def http_get(url, user="", password="", timeout=6, verify_ssl=False):
    """HTTP GET с Basic Auth, возвращает text или None."""
    try:
        req = urllib.request.Request(url)
        if user:
            token = base64.b64encode(f"{user}:{password}".encode()).decode()
            req.add_header("Authorization", f"Basic {token}")
        ctx = None
        if url.startswith("https"):
            ctx = ssl.create_default_context()
            if not verify_ssl:
                ctx.check_hostname = False
                ctx.verify_mode = ssl.CERT_NONE
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
            return r.read().decode("utf-8", errors="replace")
    except Exception:
        return None


# === Парсеры для разных вендоров ===

def parse_mikrotik_ssh(outputs):
    """Парсит вывод MikroTik команд."""
    info = {}
    # /system resource print
    res = outputs.get("/system resource print", "") or outputs.get("system resource print", "")
    if res:
        m = re.search(r"cpu-load:\s*(\d+)", res)
        if m: info["cpu_load"] = int(m.group(1))
        m = re.search(r"free-memory:\s*([\d.]+)([KMG]?i?B)", res)
        m2 = re.search(r"total-memory:\s*([\d.]+)([KMG]?i?B)", res)
        def to_kb(v, u):
            v = float(v)
            return int(v * (1 if "K" in u else 1024 if "M" in u else 1024*1024 if "G" in u else 1/1024))
        if m and m2:
            info["mem_total"] = to_kb(m2.group(1), m2.group(2))
            info["mem_used"] = info["mem_total"] - to_kb(m.group(1), m.group(2))
        m = re.search(r"uptime:\s*(\S+)", res)
        if m: info["uptime"] = m.group(1)
        m = re.search(r"version:\s*(\S+)", res)
        if m: info["sys_descr"] = f"MikroTik RouterOS {m.group(1)}"
    # /interface print stats
    iflist = []
    iface_out = outputs.get("/interface print stats without-paging", "") or outputs.get("/interface print", "")
    if iface_out:
        for line in iface_out.split("\n"):
            m = re.match(r"\s*(\d+)\s+([RXASD]+)?\s*([\w-]+)\s+(\S+)\s+(\d+)\s+(\d+)", line)
            if m:
                iflist.append({
                    "if_index": int(m.group(1)) + 1,
                    "if_name": m.group(3),
                    "oper_status": "up" if "R" in (m.group(2) or "") else "down",
                    "in_octets": int(m.group(5)),
                    "out_octets": int(m.group(6)),
                    "speed_mbps": 1000,
                })
    return info, iflist


def tcp_port_open(ip, port, timeout=1.5):
    """Проверка TCP-порта."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(timeout)
        r = s.connect_ex((ip, port))
        s.close()
        return r == 0
    except Exception:
        return False


def http_banner(ip, timeout=3):
    """Достаёт title/server из HTTP/HTTPS — часто видно вендора OLT."""
    for scheme in ("http", "https"):
        for path in ("/", "/login.html", "/cgi-bin/luci"):
            try:
                ctx = None
                if scheme == "https":
                    ctx = ssl.create_default_context()
                    ctx.check_hostname = False
                    ctx.verify_mode = ssl.CERT_NONE
                with urllib.request.urlopen(f"{scheme}://{ip}{path}", timeout=timeout, context=ctx) as r:
                    headers = dict(r.headers)
                    body = r.read(4096).decode("utf-8", errors="replace")
                    title = ""
                    m = re.search(r"<title[^>]*>([^<]+)</title>", body, re.I)
                    if m: title = m.group(1).strip()
                    return {"server": headers.get("Server", ""), "title": title, "body": body[:1500]}
            except Exception:
                continue
    return None


# === C-Data OLT парсер ===
CDATA_DEFAULT_USERS = [
    ("admin", "admin"),
    ("admin", "epon@admin"),
    ("admin", "Xpon@Admin#"),
    ("root", "admin"),
    ("guest", "guest"),
]


def parse_cdata_olt(outputs):
    """Парсит вывод C-Data OLT команд."""
    info = {"vendor": "C-Data", "is_olt": True, "sys_descr": "C-Data GPON/EPON OLT"}
    onus = []
    ver = outputs.get("show version", "") or outputs.get("show system", "")
    if ver:
        info["sys_descr"] = ("C-Data " + ver.split("\n")[0])[:200].strip()
        m = re.search(r"uptime[:\s]+(.+)", ver, re.I)
        if m: info["uptime"] = m.group(1).strip()
        m = re.search(r"hardware[:\s]+(.+)", ver, re.I)
        if m: info["model"] = m.group(1).strip()
    cpu = outputs.get("show cpu", "") or outputs.get("show cpu utilization", "")
    if cpu:
        m = re.search(r"(\d+)\s*%", cpu)
        if m: info["cpu_load"] = int(m.group(1))
    mem = outputs.get("show memory", "")
    if mem:
        m = re.search(r"(\d+)\s*%", mem)
        if m: info["mem_load"] = int(m.group(1))
    # ONU список: show onu-information / show gpon onu state / show onu all
    onu_text = ""
    for k in ("show gpon onu state all", "show onu-information all", "show onu all", "show pon onu all"):
        if outputs.get(k):
            onu_text = outputs[k]; break
    if onu_text:
        for line in onu_text.split("\n"):
            # Типичные форматы: "1/1/1:1  ONU-1234567890ab  online  -25.5/-3.2"
            m = re.match(
                r"\s*(\d+)[/:](\d+)[/:](\d+)[/:.](\d+)\s+([\w-]+)\s+(\S+)(?:\s+([-\d.]+)/([-\d.]+))?",
                line)
            if m:
                onus.append({
                    "frame": int(m.group(1)), "slot": int(m.group(2)),
                    "port": int(m.group(3)), "onu_id": int(m.group(4)),
                    "serial": m.group(5),
                    "status": m.group(6).lower(),
                    "rx_dbm": float(m.group(7)) if m.group(7) else None,
                    "tx_dbm": float(m.group(8)) if m.group(8) else None,
                })
    return info, [], onus


def collect_cdata_via_web(ip, creds_extra, timeout=8):
    """Парсинг C-Data OLT через веб-морду /cgi/index.php (PHP-based)."""
    import http.cookiejar
    import urllib.parse

    candidates = list(creds_extra) + [
        {"user": u, "password": p} for u, p in CDATA_DEFAULT_USERS
    ]

    for cred in candidates:
        try:
            cj = http.cookiejar.CookieJar()
            opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
            opener.addheaders = [
                ("User-Agent", "Mozilla/5.0"),
                ("Accept", "text/html,application/json"),
            ]

            base = f"http://{ip}"

            # 1) Открываем главную, получаем CSRF/cookie
            try:
                opener.open(f"{base}/cgi/index.php", timeout=timeout).read()
            except Exception:
                pass

            # 2) Логинимся (типичные варианты для C-Data PHP)
            login_data = urllib.parse.urlencode({
                "username": cred["user"],
                "password": cred["password"],
                "Username": cred["user"],
                "Password": cred["password"],
                "user": cred["user"],
                "passwd": cred["password"],
                "login": "Login",
                "submit": "Login",
            }).encode()

            login_urls = [
                f"{base}/cgi/login.cgi",
                f"{base}/cgi-bin/login.cgi",
                f"{base}/cgi/index.php?action=login",
                f"{base}/login.cgi",
            ]
            logged_in = False
            for lu in login_urls:
                try:
                    req = urllib.request.Request(lu, data=login_data, method="POST")
                    resp = opener.open(req, timeout=timeout)
                    body = resp.read().decode("utf-8", errors="replace")
                    if "logout" in body.lower() or "welcome" in body.lower() or any(
                        c.name.lower() in ("sessionid", "phpsessid", "session") for c in cj
                    ):
                        logged_in = True
                        break
                except Exception:
                    continue

            if not logged_in:
                # Пробуем Basic Auth
                token = base64.b64encode(f"{cred['user']}:{cred['password']}".encode()).decode()
                opener.addheaders.append(("Authorization", f"Basic {token}"))
                try:
                    body = opener.open(f"{base}/cgi/index.php", timeout=timeout).read().decode("utf-8", errors="replace")
                    if "login" in body.lower() and "password" in body.lower() and len(body) < 3000:
                        continue
                    logged_in = True
                except Exception:
                    continue

            if not logged_in:
                continue

            # 3) Системная инфа
            info = {"vendor": "C-Data", "is_olt": True, "sys_descr": "C-Data GPON/EPON OLT"}
            for path in ("/cgi/index.php?action=sysinfo", "/cgi/sys_info.cgi", "/cgi/index.php?page=system",
                         "/cgi/get_sysinfo.cgi", "/cgi/index.php"):
                try:
                    txt = opener.open(f"{base}{path}", timeout=timeout).read().decode("utf-8", errors="replace")
                    # JSON-вариант
                    if txt.strip().startswith("{"):
                        try:
                            j = json.loads(txt)
                            info["model"] = str(j.get("model", j.get("Model", "")))
                            info["sys_descr"] = f"C-Data {info['model']} {j.get('version', j.get('Version', ''))}"
                            info["uptime"] = str(j.get("uptime", j.get("Uptime", "")))
                            if "cpu" in str(j).lower():
                                m = re.search(r'"cpu[^"]*"\s*:\s*"?(\d+)', txt, re.I)
                                if m: info["cpu_load"] = int(m.group(1))
                            break
                        except Exception:
                            pass
                    # HTML — выдираем характерные поля
                    m = re.search(r"(?:Model|Модель|Hardware)[\s:<>/\w]*?([A-Z]{2,5}\d{3,5}[A-Z\-]*)", txt, re.I)
                    if m: info["model"] = m.group(1)
                    m = re.search(r"(?:Version|Firmware|Прошивка)[\s:<>/\w]*?([\d.]+(?:[a-z]\d*)?)", txt, re.I)
                    if m: info["sys_descr"] = f"C-Data {info.get('model','OLT')} v{m.group(1)}"
                    m = re.search(r"(?:Uptime|Время работы)[\s:<>/\w]*?(\d+\s*(?:days?|дн|часов|hours?|h)[^<]*)", txt, re.I)
                    if m: info["uptime"] = m.group(1).strip()
                    m = re.search(r"CPU[^<\d]{0,30}(\d{1,3})\s*%", txt, re.I)
                    if m: info["cpu_load"] = int(m.group(1))
                    if info.get("model"): break
                except Exception:
                    continue

            # 4) ONU список
            onus = []
            for path in (
                "/cgi/index.php?action=onuinfo",
                "/cgi/index.php?action=onu_list",
                "/cgi/index.php?page=onu",
                "/cgi/onu_info.cgi",
                "/cgi/get_onu.cgi",
                "/cgi/index.php?action=getonuinfo",
            ):
                try:
                    txt = opener.open(f"{base}{path}", timeout=timeout).read().decode("utf-8", errors="replace")
                    # JSON
                    if txt.strip().startswith(("{", "[")):
                        try:
                            j = json.loads(txt)
                            arr = j if isinstance(j, list) else j.get("data", j.get("onus", j.get("list", [])))
                            for o in arr if isinstance(arr, list) else []:
                                onus.append({
                                    "frame": int(o.get("frame", 1)),
                                    "slot": int(o.get("slot", 1)),
                                    "port": int(o.get("port", o.get("pon_port", 0))),
                                    "onu_id": int(o.get("onu_id", o.get("id", 0))),
                                    "serial": str(o.get("sn", o.get("serial", o.get("mac", "")))),
                                    "status": str(o.get("status", o.get("state", "online"))).lower(),
                                    "rx_dbm": float(o["rx_power"]) if o.get("rx_power") not in (None, "", "-") else None,
                                    "tx_dbm": float(o["tx_power"]) if o.get("tx_power") not in (None, "", "-") else None,
                                    "distance_m": int(o.get("distance", 0) or 0),
                                })
                            if onus: break
                        except Exception:
                            pass
                    # HTML-таблица
                    rows = re.findall(r"<tr[^>]*>(.*?)</tr>", txt, re.I | re.S)
                    for row in rows:
                        cells = re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row, re.I | re.S)
                        cells = [re.sub(r"<[^>]+>", "", c).strip() for c in cells]
                        if len(cells) < 4:
                            continue
                        # Ищем серийник (ONU SN — обычно 12 hex или ALCL/HWTC и т.д.)
                        sn_idx = None
                        for i, c in enumerate(cells):
                            if re.match(r"^[A-Z0-9]{8,16}$", c) or re.match(r"^[A-Z]{4}[0-9A-Fa-f]{8}$", c):
                                sn_idx = i; break
                        if sn_idx is None:
                            continue
                        # Пробуем достать port:onu_id из первой ячейки
                        m = re.match(r"(\d+)[/:](\d+)[/:](\d+)(?:[:.](\d+))?", cells[0])
                        frame = slot = port = onu_id = 0
                        if m:
                            frame = int(m.group(1)); slot = int(m.group(2))
                            port = int(m.group(3)); onu_id = int(m.group(4) or 0)
                        # RX/TX — числа со знаком и .
                        rx = tx = None
                        for c in cells:
                            mm = re.match(r"^(-?\d+\.?\d*)\s*$", c)
                            if mm:
                                v = float(mm.group(1))
                                if -40 < v < 0:
                                    if rx is None: rx = v
                                    elif tx is None: tx = v
                        status = "online"
                        for c in cells:
                            cl = c.lower()
                            if cl in ("online", "offline", "los", "lof", "dying", "active", "inactive"):
                                status = cl; break
                        onus.append({
                            "frame": frame, "slot": slot, "port": port, "onu_id": onu_id,
                            "serial": cells[sn_idx], "status": status,
                            "rx_dbm": rx, "tx_dbm": tx,
                        })
                    if onus: break
                except Exception:
                    continue

            print(f"  [C-Data WEB] {ip} OK ({cred['user']}/{cred['password']}) — модель: {info.get('model','?')}, ONU: {len(onus)}")
            return info, [], onus

        except Exception as e:
            print(f"  [C-Data WEB] {ip} попытка {cred['user']}: {e}")
            continue

    return {}, [], []


def collect_cdata_via_telnet(ip, creds_extra, timeout=8):
    """Активный опрос C-Data по Telnet — пробует все учётки."""
    if not TELNET_AVAILABLE:
        return {}, [], []
    cmds = [
        "enable",
        "terminal length 0",
        "show version",
        "show cpu",
        "show memory",
        "show gpon onu state all",
        "show onu all",
    ]
    # Сначала из credentials.json (cred_match), потом дефолтные
    candidates = list(creds_extra) + [
        {"user": u, "password": p, "type": "telnet"} for u, p in CDATA_DEFAULT_USERS
    ]
    for cred in candidates:
        try:
            tn = telnetlib.Telnet(ip, 23, timeout)
            tn.read_until(b"sername:", timeout)
            tn.write(cred["user"].encode() + b"\n")
            tn.read_until(b"assword:", timeout)
            tn.write(cred["password"].encode() + b"\n")
            time.sleep(1.0)
            data = tn.read_very_eager().decode("utf-8", errors="replace")
            if "incorrect" in data.lower() or "fail" in data.lower() or "denied" in data.lower():
                tn.close(); continue
            outputs = {}
            for cmd in cmds:
                tn.write(cmd.encode() + b"\n")
                time.sleep(1.5)
                # Несколько итераций — иногда вывод длинный
                buf = b""
                for _ in range(5):
                    try:
                        chunk = tn.read_very_eager()
                        if not chunk:
                            time.sleep(0.4)
                            continue
                        buf += chunk
                    except Exception:
                        break
                outputs[cmd] = buf.decode("utf-8", errors="replace")
            try: tn.write(b"exit\n"); tn.close()
            except Exception: pass
            print(f"  [C-Data Telnet] {ip} OK ({cred['user']}/{cred['password']})")
            return parse_cdata_olt(outputs)
        except Exception:
            continue
    return {}, [], []


def collect_cdata_via_ssh(ip, creds_extra, timeout=8):
    """Активный опрос C-Data по SSH."""
    if not SSH_AVAILABLE:
        return {}, [], []
    cmds = ["show version", "show cpu", "show memory", "show gpon onu state all", "show onu all"]
    candidates = list(creds_extra) + [
        {"user": u, "password": p, "type": "ssh"} for u, p in CDATA_DEFAULT_USERS
    ]
    for cred in candidates:
        out = ssh_run(ip, cred["user"], cred["password"], cmds, port=22, timeout=timeout)
        if out and any(out.values()):
            joined = " ".join(out.values()).lower()
            if "c-data" in joined or "gpon" in joined or "onu" in joined or "epon" in joined:
                print(f"  [C-Data SSH] {ip} OK ({cred['user']})")
                return parse_cdata_olt(out)
    return {}, [], []


def is_likely_cdata_olt(ip, http_info=None):
    """Эвристика: похоже ли устройство на C-Data OLT."""
    if http_info:
        text = (http_info.get("title", "") + " " + http_info.get("server", "") + " " + http_info.get("body", "")).lower()
        if "c-data" in text or "cdata" in text or "gpon olt" in text or "epon olt" in text:
            return True
    # Открыт telnet + не открыт SMB/RDP — высокая вероятность сетевая железка
    return tcp_port_open(ip, 23, 1.0)


def parse_cisco_eltex_ssh(outputs):
    """Eltex/Cisco show running/show interfaces."""
    info = {}
    ver = outputs.get("show version", "")
    if ver:
        info["sys_descr"] = ver.split("\n")[0][:200]
        m = re.search(r"uptime is (.+)", ver)
        if m: info["uptime"] = m.group(1).strip()
    cpu = outputs.get("show processes cpu", "") or outputs.get("show cpu", "")
    if cpu:
        m = re.search(r"(\d+)%", cpu)
        if m: info["cpu_load"] = int(m.group(1))
    return info, []


def collect_via_ssh(ip, vendor, sys_descr, creds, timeout):
    """Подбирает учётку и команды по вендору, возвращает (info, ifaces)."""
    if not SSH_AVAILABLE:
        return {}, []
    s = (vendor + " " + sys_descr).lower()
    if "mikrotik" in s or "routeros" in s:
        cmds = ["/system resource print", "/system identity print", "/interface print stats without-paging"]
        parser = parse_mikrotik_ssh
    elif "eltex" in s or "cisco" in s or "huawei" in s:
        cmds = ["show version", "show processes cpu", "show interfaces"]
        parser = parse_cisco_eltex_ssh
    else:
        cmds = ["uname -a", "uptime", "cat /proc/loadavg"]
        parser = lambda o: ({"sys_descr": o.get("uname -a", "").strip()[:200]}, [])
    for cred in creds:
        if not cred_match(cred, ip, vendor):
            continue
        if cred.get("type") and cred["type"] not in ("ssh", "any"):
            continue
        port = cred.get("ssh_port", 22)
        out = ssh_run(ip, cred["user"], cred["password"], cmds, port=port, timeout=timeout)
        if out:
            print(f"  [SSH] {ip} OK ({cred['user']})")
            return parser(out)
    return {}, []


def collect_via_telnet(ip, vendor, sys_descr, creds, timeout):
    if not TELNET_AVAILABLE:
        return {}, []
    s = (vendor + " " + sys_descr).lower()
    if "huawei" in s:
        cmds = ["display version", "display cpu-usage", "display memory-usage"]
    elif "eltex" in s or "zte" in s:
        cmds = ["show version", "show interfaces"]
    else:
        cmds = ["show version"]
    for cred in creds:
        if not cred_match(cred, ip, vendor):
            continue
        if cred.get("type") and cred["type"] not in ("telnet", "any"):
            continue
        port = cred.get("telnet_port", 23)
        out = telnet_run(ip, cred["user"], cred["password"], cmds, port=port, timeout=timeout)
        if out:
            print(f"  [Telnet] {ip} OK ({cred['user']})")
            info = {"sys_descr": (out.get(cmds[0], "") or "")[:200].strip()}
            return info, []
    return {}, []


def collect_via_http_api(ip, vendor, creds, timeout):
    """REST API: MikroTik (https://ip/rest), Ubiquiti UNMS, generic."""
    s = vendor.lower()
    for cred in creds:
        if not cred_match(cred, ip, vendor):
            continue
        if cred.get("type") and cred["type"] not in ("http", "https", "api", "any"):
            continue
        # MikroTik REST API
        if "mikrotik" in s or cred.get("vendor", "").lower() == "mikrotik":
            for scheme in ("https", "http"):
                txt = http_get(f"{scheme}://{ip}/rest/system/resource", cred["user"], cred["password"], timeout)
                if txt and txt.startswith("{"):
                    try:
                        data = json.loads(txt)
                        info = {
                            "cpu_load": int(data.get("cpu-load", 0)),
                            "uptime": data.get("uptime", ""),
                            "sys_descr": f"MikroTik {data.get('board-name','')} {data.get('version','')}",
                        }
                        ifaces_txt = http_get(f"{scheme}://{ip}/rest/interface", cred["user"], cred["password"], timeout)
                        ifaces = []
                        if ifaces_txt:
                            try:
                                arr = json.loads(ifaces_txt)
                                for i, it in enumerate(arr if isinstance(arr, list) else []):
                                    ifaces.append({
                                        "if_index": i + 1,
                                        "if_name": it.get("name", ""),
                                        "oper_status": "up" if it.get("running") == "true" else "down",
                                        "in_octets": int(it.get("rx-byte", 0) or 0),
                                        "out_octets": int(it.get("tx-byte", 0) or 0),
                                        "speed_mbps": 1000,
                                    })
                            except Exception:
                                pass
                        print(f"  [HTTP-API] {ip} MikroTik OK ({cred['user']})")
                        return info, ifaces
                    except Exception:
                        pass
        # Generic JSON endpoint
        url = cred.get("api_url", "")
        if url:
            txt = http_get(url.replace("{ip}", ip), cred["user"], cred["password"], timeout)
            if txt:
                print(f"  [HTTP-API] {ip} OK")
                return {"sys_descr": txt[:200]}, []
    return {}, []


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
    ssh_on = cfg.get("ssh_enabled", "true").lower() == "true"
    ssh_to = int(cfg.get("ssh_timeout", "5"))
    telnet_on = cfg.get("telnet_enabled", "true").lower() == "true"
    telnet_to = int(cfg.get("telnet_timeout", "5"))
    http_on = cfg.get("http_api_enabled", "true").lower() == "true"
    http_to = int(cfg.get("http_api_timeout", "6"))
    creds = load_credentials()

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

        # === C-Data OLT: активный опрос (WEB → Telnet → SSH) с дефолтными учётками ===
        # Запускается даже без credentials.json — пробует "admin/admin" и др.
        if not is_olt:
            hb = None
            if http_on:
                hb = http_banner(ip, timeout=3)
            cdata_creds = [c for c in creds if "c-data" in (c.get("vendor", "").lower()) or "cdata" in (c.get("vendor", "").lower())]
            try_cdata = bool(cdata_creds) or is_likely_cdata_olt(ip, hb) or (hb is not None)
            if try_cdata:
                print(f"[*] {ip}: пробуем как C-Data OLT...")
                ainfo, aif, aonus = ({}, [], [])
                # 1) ВЕБ-МОРДА (приоритет — у C-Data это самый надёжный способ)
                if http_on:
                    ainfo, aif, aonus = collect_cdata_via_web(ip, cdata_creds, http_to + 4)
                # 2) Telnet
                if not ainfo and telnet_on:
                    ainfo, aif, aonus = collect_cdata_via_telnet(ip, cdata_creds, telnet_to + 3)
                # 3) SSH
                if not ainfo and ssh_on:
                    ainfo, aif, aonus = collect_cdata_via_ssh(ip, cdata_creds, ssh_to + 3)
                if ainfo:
                    sys_descr = ainfo.get("sys_descr", "C-Data OLT")
                    vendor = "C-Data"
                    is_olt = True
                    if "cpu_load" in ainfo: cpu = ainfo["cpu_load"]
                    if "uptime" in ainfo: uptime = ainfo["uptime"]
                    if aonus:
                        onus = aonus

        # Fallback: если SNMP не дал инфы — пробуем активные методы
        if creds and not sys_descr:
            if http_on:
                ainfo, aifaces = collect_via_http_api(ip, vendor, creds, http_to)
                if ainfo:
                    sys_descr = ainfo.get("sys_descr", sys_descr)
                    cpu = ainfo.get("cpu_load", cpu)
                    mem_used = ainfo.get("mem_used", mem_used)
                    mem_total = ainfo.get("mem_total", mem_total)
                    uptime = ainfo.get("uptime", uptime)
                    if aifaces:
                        ifaces = aifaces
            if ssh_on and not sys_descr:
                ainfo, aifaces = collect_via_ssh(ip, vendor, sys_descr, creds, ssh_to)
                if ainfo:
                    sys_descr = ainfo.get("sys_descr", sys_descr)
                    cpu = ainfo.get("cpu_load", cpu)
                    mem_used = ainfo.get("mem_used", mem_used)
                    mem_total = ainfo.get("mem_total", mem_total)
                    uptime = ainfo.get("uptime", uptime)
                    if aifaces:
                        ifaces = aifaces
            if telnet_on and not sys_descr:
                ainfo, aifaces = collect_via_telnet(ip, vendor, sys_descr, creds, telnet_to)
                if ainfo:
                    sys_descr = ainfo.get("sys_descr", sys_descr)
                    if aifaces:
                        ifaces = aifaces
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


def heartbeat(cfg):
    """Регистрация + забор pending-команд."""
    token = cfg.get("token", "").strip()
    if not token or token.startswith("ВСТАВЬ"):
        return None
    payload = {
        "agent_id": cfg.get("agent_id", "agent"),
        "hostname": socket.gethostname(),
        "os": platform.platform(),
        "version": AGENT_VERSION,
        "config": {
            "subnet": cfg.get("subnet", ""),
            "interval": cfg.get("interval", "60"),
            "snmp_enabled": cfg.get("snmp_enabled", "true"),
        },
    }
    try:
        req = urllib.request.Request(
            CONTROL_URL + "?action=heartbeat",
            data=json.dumps(payload).encode(),
            method="POST",
            headers={"Content-Type": "application/json", "X-Agent-Token": token},
        )
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception as e:
        print(f"[!] heartbeat: {e}")
        return None


def report_command(cfg, cmd_id, status, result):
    token = cfg.get("token", "").strip()
    if not token:
        return
    try:
        body = json.dumps({"command_id": cmd_id, "status": status, "result": str(result)[:2000]}).encode()
        req = urllib.request.Request(
            CONTROL_URL + "?action=result", data=body, method="POST",
            headers={"Content-Type": "application/json", "X-Agent-Token": token},
        )
        urllib.request.urlopen(req, timeout=10).read()
    except Exception:
        pass


def fetch_new_script(cfg):
    """Скачивает актуальный scanner.py с сервера."""
    token = cfg.get("token", "").strip()
    if not token:
        return None
    try:
        req = urllib.request.Request(
            CONTROL_URL + "?action=script", method="GET",
            headers={"X-Agent-Token": token},
        )
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.loads(r.read().decode("utf-8"))
            if data.get("success"):
                return data.get("source", ""), int(data.get("version", 0))
    except Exception as e:
        print(f"[!] update: {e}")
    return None


def self_update(cfg):
    """Скачивает новую версию scanner.py, заменяет себя и перезапускается."""
    res = fetch_new_script(cfg)
    if not res:
        return False
    src, new_v = res
    if new_v <= AGENT_VERSION or len(src) < 200:
        print(f"[*] Обновление не требуется (server v{new_v}, local v{AGENT_VERSION})")
        return False
    me = Path(sys.argv[0]).resolve()
    if not me.exists() or me.suffix not in (".py", ""):
        print("[!] Самообновление поддерживается только при запуске из .py")
        return False
    backup = me.with_suffix(".py.bak")
    try:
        backup.write_text(me.read_text(encoding="utf-8"), encoding="utf-8")
        me.write_text(src, encoding="utf-8")
        print(f"[OK] Обновлено до v{new_v}, перезапускаю...")
        os.execv(sys.executable, [sys.executable, str(me)])
    except Exception as e:
        print(f"[!] Не удалось применить обновление: {e}")
        try:
            me.write_text(backup.read_text(encoding="utf-8"), encoding="utf-8")
        except Exception:
            pass
    return False


def update_config_value(cfg_path, section, key, value):
    cp = configparser.ConfigParser()
    cp.read(cfg_path, encoding="utf-8")
    if section not in cp:
        cp[section] = {}
    cp[section][key] = str(value)
    with open(cfg_path, "w", encoding="utf-8") as f:
        cp.write(f)


def execute_command(cfg, cmd_id, command, payload_str):
    """Выполняет команду от админа."""
    try:
        payload = json.loads(payload_str) if payload_str else {}
    except Exception:
        payload = {}
    print(f"[CMD] {command} {payload}")
    if command == "rescan_now":
        return "scheduled"
    if command == "set_interval":
        v = int(payload.get("interval", 60))
        update_config_value(CONFIG_FILE, "agent", "interval", v)
        return f"interval={v}"
    if command == "set_subnet":
        s = payload.get("subnet", "")
        update_config_value(CONFIG_FILE, "agent", "subnet", s)
        return f"subnet={s}"
    if command == "set_credentials":
        creds = payload.get("credentials", [])
        Path("credentials.json").write_text(json.dumps(creds, indent=2, ensure_ascii=False), encoding="utf-8")
        return f"credentials updated ({len(creds)})"
    if command == "reload_config":
        return "ok (will be applied on next cycle)"
    if command == "self_update":
        ok = self_update(cfg)
        return "updated" if ok else "no update / failed"
    if command == "restart":
        report_command(cfg, cmd_id, "done", "restarting")
        os.execv(sys.executable, [sys.executable, sys.argv[0]])
    if command == "shutdown":
        report_command(cfg, cmd_id, "done", "shutting down")
        sys.exit(0)
    if command == "run_shell":
        cmd_str = payload.get("cmd", "")
        if not cmd_str:
            return "empty cmd"
        try:
            r = subprocess.run(cmd_str, shell=True, capture_output=True, timeout=30,
                               creationflags=CREATE_NO_WINDOW)
            out = _decode_bytes(r.stdout) + "\n" + _decode_bytes(r.stderr)
            return out[:1500]
        except Exception as e:
            return f"err: {e}"
    return f"unknown command: {command}"


def main():
    print("=" * 60)
    print(f"  Network Scanner Agent v{AGENT_VERSION} для Windows")
    print("=" * 60)
    cfg = load_config()
    interval = int(cfg.get("interval", "60"))
    print(f"[info] SNMP: {'OK' if SNMP_AVAILABLE else 'выкл (pysnmp не загружен)'} | "
          f"SSH: {'OK' if SSH_AVAILABLE else 'выкл'} | "
          f"Telnet: {'OK' if TELNET_AVAILABLE else 'выкл (Python 3.13+ — поставь telnetlib3 или используй веб-парсинг)'}")

    while True:
        # 1) Heartbeat и получение команд
        try:
            hb = heartbeat(cfg)
            if hb and hb.get("success"):
                if hb.get("update_available"):
                    print(f"[*] Доступно обновление до v{hb.get('current_version')} — применяю...")
                    self_update(cfg)
                for c in hb.get("commands", []):
                    cid = c.get("id")
                    cmd = c.get("command", "")
                    pld = c.get("payload", "{}")
                    try:
                        result = execute_command(cfg, cid, cmd, pld)
                        report_command(cfg, cid, "done", result)
                    except SystemExit:
                        raise
                    except Exception as e:
                        report_command(cfg, cid, "error", str(e))
        except KeyboardInterrupt:
            return
        except Exception as e:
            print(f"[!] heartbeat-loop: {e}")

        # 2) Сканирование
        try:
            cfg = load_config()  # подхватываем изменения config.ini
            interval = int(cfg.get("interval", "60"))
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


АКТИВНЫЕ ПОДКЛЮЧЕНИЯ ПО ЛОГИНУ/ПАРОЛЮ (SSH/Telnet/HTTP API)
============================================================
Если устройство НЕ отдаёт SNMP — агент попробует подключиться по логину/паролю.
Поддержка: MikroTik (SSH/REST API), Eltex/Cisco (SSH), Huawei (Telnet),
Linux (SSH), любой другой — generic команды.

Шаги:
1) Скопируй credentials.example.json в credentials.json
2) Открой в Блокноте, впиши свои логины/пароли:
   - vendor: "mikrotik" / "eltex" / "cisco" / "huawei" / "linux" / ""
   - type:   "ssh" / "telnet" / "http" / "any"
   - networks: список подсетей где использовать эти учётки
   - user / password: как обычно

Например, чтобы агент логинился на все MikroTik с логином monitor:
[
  {
    "vendor": "mikrotik", "type": "any",
    "user": "monitor", "password": "MyPass123",
    "networks": ["192.168.0.0/16"]
  }
]

ВАЖНО: credentials.json хранится локально на твоём ПК с агентом.
Логины/пароли НИКУДА не отправляются — на сайт уходит только результат опроса.


СБОРКА В EXE (без Python)
=========================
build_exe.bat -> готовый dist\\scanner.exe
"""

CREDENTIALS_EXAMPLE = """[
  {
    "name": "C-Data OLT",
    "vendor": "c-data",
    "type": "telnet",
    "user": "admin",
    "password": "admin",
    "networks": ["10.255.230.0/24"],
    "telnet_port": 23
  },
  {
    "name": "MikroTik routers",
    "vendor": "mikrotik",
    "type": "any",
    "user": "monitor",
    "password": "ВСТАВЬ_ПАРОЛЬ",
    "networks": ["192.168.88.0/24"],
    "ssh_port": 22,
    "telnet_port": 23
  },
  {
    "name": "Eltex switches via SSH",
    "vendor": "eltex",
    "type": "ssh",
    "user": "admin",
    "password": "admin",
    "networks": ["10.0.0.0/24"]
  },
  {
    "name": "Huawei OLT via Telnet",
    "vendor": "huawei",
    "type": "telnet",
    "user": "root",
    "password": "ВСТАВЬ_ПАРОЛЬ",
    "networks": ["10.10.0.0/16"]
  }
]
"""

REQUIREMENTS_TXT = """# Сетевой агент — зависимости
# Без cryptography (требует Visual C++). Только pure-python.
pyasn1>=0.4.8
pysnmp>=6.0.0
telnetlib3>=2.0.4 ; python_version >= "3.13"
"""

INSTALL_DEPS_BAT = """@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================================
echo  Network Scanner Agent - установка зависимостей
echo ============================================================
echo.

where python >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Python не найден в PATH.
    echo Установи Python 3.10-3.12 с https://python.org с галкой "Add to PATH".
    pause
    exit /b 1
)

echo [1/5] Версия Python:
python --version
python -c "import sys; sys.exit(0 if sys.version_info[:2] >= (3,10) and sys.version_info[:2] <= (3,12) else 1)"
if errorlevel 1 (
    echo.
    echo [WARN] Рекомендуется Python 3.10/3.11/3.12.
    echo На 3.13+ и альфа-версиях (3.15a) нет готовых wheels — будет компиляция.
    echo Лучше поставь Python 3.12 с https://python.org/downloads/release/python-3128/
    echo Установка продолжится, но может упасть.
    echo.
    timeout /t 5 >nul
)

echo.
echo [2/5] Обновляю pip...
python -m pip install --upgrade pip
echo.

echo [3/5] Удаляю старые версии pysnmp и paramiko...
python -m pip uninstall -y pysnmp pysnmp-lextudio paramiko cryptography cffi pysnmpcrypto 2>nul
echo.

echo [4/6] Ставлю pyasn1 + pysnmp...
python -m pip install --upgrade --only-binary=:all: pyasn1
if errorlevel 1 python -m pip install --upgrade pyasn1
python -m pip install --upgrade pysnmp
if errorlevel 1 (
    echo [WARN] Новый pysnmp не поставился, пробую старый pure-python...
    python -m pip install --upgrade pysnmp==4.4.12 --no-deps
)
echo.

echo [5/6] Ставлю telnetlib3 (на случай Python 3.13+)...
python -m pip install --upgrade telnetlib3 2>nul
echo.

echo [6/6] Ставлю paramiko (SSH с логином/паролем)...
python -m pip install --upgrade bcrypt --only-binary=:all: 2>nul
python -m pip install --upgrade pynacl --only-binary=:all: 2>nul
python -m pip install --upgrade --no-deps paramiko 2>nul
if errorlevel 1 (
    echo [INFO] paramiko не поставился — это норма на Python 3.15a. SSH работать не будет.
    echo        Веб-парсинг C-Data и SNMP всё равно работают.
)

echo.
echo ============================================================
echo  Готово! Проверка импорта:
echo ============================================================
python -c "from pysnmp.hlapi import getCmd; print('  [OK] pysnmp работает')" 2>nul || python -c "from pysnmp.hlapi.v3arch import getCmd; print('  [OK] pysnmp v6 работает')" 2>nul || echo   [!] pysnmp НЕ загрузился
python -c "import paramiko; print('  [OK] paramiko работает (SSH)')" 2>nul || echo   [INFO] SSH выкл (норма для Python 3.15a)
python -c "import telnetlib; print('  [OK] telnet (встроенный) работает')" 2>nul || python -c "import telnetlib3; print('  [OK] telnetlib3 работает')" 2>nul || echo   [INFO] Telnet выкл — будет использован только веб-парсинг для C-Data
python -c "import urllib.request; print('  [OK] urllib (для веб-парсинга C-Data) работает')"
echo.
echo Теперь можно запустить run.bat
echo.
echo Если pysnmp не загрузился, проверь:
echo   1. Python должен быть 3.10/3.11/3.12 (не 3.13+ и не альфа)
echo   2. Запусти от администратора
echo   3. На python 3.13+ pysnmp может не работать — поставь 3.12
pause
"""

BUILD_EXE_BAT = """@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Установка зависимостей для сборки...
python -m pip install --upgrade pyinstaller pysnmp-lextudio pyasn1 paramiko
echo.
echo Сборка scanner.exe...
pyinstaller --onefile --name scanner --hidden-import pysnmp.smi.mibs.SNMPv2-MIB scanner.py
echo.
echo Готово: dist\\scanner.exe
pause
"""

AGENT_FILES = {
    "scanner.py": SCANNER_PY,
    "requirements.txt": REQUIREMENTS_TXT,
    "run.bat": '@echo off\r\nchcp 65001 >nul\r\ncd /d "%~dp0"\r\npython scanner.py\r\npause\r\n',
    "install_deps.bat": INSTALL_DEPS_BAT.replace("\n", "\r\n"),
    "build_exe.bat": BUILD_EXE_BAT.replace("\n", "\r\n"),
    "credentials.example.json": CREDENTIALS_EXAMPLE,
    "README.txt": README_TXT,
}