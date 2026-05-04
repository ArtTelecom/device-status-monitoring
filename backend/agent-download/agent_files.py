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
        if snmp_enabled:
            sys_descr, sys_name, uptime, contact, location = snmp_probe(ip, community)
            if sys_name and not hostname:
                hostname = sys_name
            if sys_descr:
                cpu, mem_used, mem_total = snmp_cpu_mem(ip, community)
                if snmp_ifaces:
                    ifaces = snmp_interfaces(ip, community)
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
        })
        extra = []
        if cpu: extra.append(f"CPU {cpu}%")
        if rtt: extra.append(f"RTT {rtt}ms")
        if loss: extra.append(f"loss {loss}%")
        if ifaces: extra.append(f"if:{len(ifaces)}")
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
deep_ping      — серия из 3 ping для измерения потерь и RTT (true)


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