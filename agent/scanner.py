"""
Windows-агент для сканирования локальной сети и отправки данных на сайт.
Сканирует ARP-таблицу + ping-sweep подсети, опционально SNMP-опрос.
Отправляет найденное оборудование на backend каждые N секунд.
"""

import configparser
import ipaddress
import json
import os
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
        ObjectType, ObjectIdentity, getCmd
    )
    SNMP_AVAILABLE = True
except ImportError:
    SNMP_AVAILABLE = False


CONFIG_FILE = "config.ini"
DEFAULT_CONFIG = """[agent]
# URL backend-функции (поменяй на свой если будет другой)
api_url = https://functions.poehali.dev/abad93d7-09ca-427b-aa2a-54953ec499b8
# Секретный токен (тот же что в секрете AGENT_TOKEN на сайте)
token = ВСТАВЬ_СЮДА_ТОКЕН
# Идентификатор агента (любая строка, чтобы различать офисы)
agent_id = office-1
# Подсеть для сканирования
subnet = 192.168.1.0/24
# Интервал между сканами (секунды)
interval = 60
# Опрашивать ли SNMP (требует pysnmp)
snmp_enabled = true
# SNMP community
snmp_community = public
# Таймаут ping (мс)
ping_timeout = 800
# Параллельных ping
threads = 64
"""


def load_config():
    if not Path(CONFIG_FILE).exists():
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            f.write(DEFAULT_CONFIG)
        print(f"[!] Создан {CONFIG_FILE}. Открой и впиши token и subnet, затем запусти снова.")
        sys.exit(0)
    cfg = configparser.ConfigParser()
    cfg.read(CONFIG_FILE, encoding="utf-8")
    return cfg["agent"]


def ping(ip, timeout_ms=800):
    """Возвращает True если IP отвечает на ping."""
    is_win = platform.system().lower().startswith("win")
    try:
        if is_win:
            r = subprocess.run(
                ["ping", "-n", "1", "-w", str(timeout_ms), ip],
                capture_output=True, timeout=(timeout_ms / 1000) + 2,
                creationflags=0x08000000,  # CREATE_NO_WINDOW
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
    """Парсит ARP-таблицу Windows. Возвращает {ip: mac}."""
    out = {}
    is_win = platform.system().lower().startswith("win")
    try:
        if is_win:
            r = subprocess.run(
                ["arp", "-a"], capture_output=True, text=True, timeout=10,
                creationflags=0x08000000,
            )
        else:
            r = subprocess.run(["arp", "-a"], capture_output=True, text=True, timeout=10)
        for line in r.stdout.splitlines():
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


# Простая база OUI для определения вендора по MAC (топовые)
OUI_DB = {
    "00:0c:42": "MikroTik", "08:55:31": "MikroTik", "4c:5e:0c": "MikroTik",
    "6c:3b:6b": "MikroTik", "b8:69:f4": "MikroTik", "cc:2d:e0": "MikroTik",
    "d4:ca:6d": "MikroTik", "e4:8d:8c": "MikroTik", "74:4d:28": "MikroTik",
    "00:25:9e": "Huawei", "00:e0:fc": "Huawei", "28:6e:d4": "Huawei",
    "00:1d:73": "Huawei", "78:1d:ba": "ZTE", "00:1e:73": "ZTE",
    "f4:6d:e2": "TP-Link", "50:c7:bf": "TP-Link", "98:da:c4": "TP-Link",
    "1c:bf:ce": "TP-Link", "60:e3:27": "TP-Link",
    "00:11:32": "Synology", "00:50:56": "VMware", "00:0c:29": "VMware",
    "fc:ec:da": "Ubiquiti", "24:5a:4c": "Ubiquiti", "78:8a:20": "Ubiquiti",
    "b4:fb:e4": "Ubiquiti", "00:15:6d": "Ubiquiti",
    "ac:de:48": "Apple", "f0:18:98": "Apple", "3c:22:fb": "Apple",
    "00:1a:11": "Google", "f8:8f:ca": "Google",
}


def vendor_from_mac(mac):
    if not mac:
        return ""
    prefix = mac.lower()[:8]
    return OUI_DB.get(prefix, "")


def snmp_get(ip, community, oid, timeout=2):
    """Возвращает строку или ''. """
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
    """Возвращает (sys_descr, sys_name, uptime)."""
    if not SNMP_AVAILABLE:
        return "", "", ""
    descr = snmp_get(ip, community, "1.3.6.1.2.1.1.1.0")
    name = snmp_get(ip, community, "1.3.6.1.2.1.1.5.0")
    uptime_raw = snmp_get(ip, community, "1.3.6.1.2.1.1.3.0")
    uptime_str = ""
    if uptime_raw and uptime_raw.isdigit():
        ticks = int(uptime_raw)
        seconds = ticks // 100
        days = seconds // 86400
        hours = (seconds % 86400) // 3600
        minutes = (seconds % 3600) // 60
        uptime_str = f"{days}д {hours}ч {minutes}м"
    return descr, name, uptime_str


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


def scan_subnet(subnet, threads, ping_timeout):
    """Сканирует подсеть, возвращает список живых IP."""
    net = ipaddress.ip_network(subnet, strict=False)
    hosts = [str(h) for h in net.hosts()]
    print(f"[*] Сканирую {len(hosts)} адресов в {subnet} (потоков: {threads})...")
    alive = []
    with ThreadPoolExecutor(max_workers=int(threads)) as ex:
        futs = {ex.submit(ping, ip, int(ping_timeout)): ip for ip in hosts}
        for f in as_completed(futs):
            ip = futs[f]
            try:
                if f.result():
                    alive.append(ip)
            except Exception:
                pass
    return sorted(alive, key=lambda x: tuple(int(p) for p in x.split(".")))


def discover(cfg):
    subnet = cfg.get("subnet", "192.168.1.0/24")
    threads = cfg.get("threads", "64")
    ping_timeout = cfg.get("ping_timeout", "800")
    snmp_enabled = cfg.get("snmp_enabled", "true").lower() == "true"
    community = cfg.get("snmp_community", "public")

    alive_ips = scan_subnet(subnet, threads, ping_timeout)
    arp = get_arp_table()
    print(f"[*] Живых хостов: {len(alive_ips)} | ARP-записей: {len(arp)}")

    devices = []
    for ip in alive_ips:
        mac = arp.get(ip, "")
        hostname = reverse_dns(ip)
        vendor = vendor_from_mac(mac)
        sys_descr, sys_name, uptime = ("", "", "")
        if snmp_enabled:
            sys_descr, sys_name, uptime = snmp_probe(ip, community)
            if sys_name and not hostname:
                hostname = sys_name
        model = detect_model(sys_descr, vendor)
        devices.append({
            "ip": ip,
            "mac": mac,
            "hostname": hostname,
            "vendor": vendor,
            "model": model,
            "sys_descr": sys_descr,
            "uptime": uptime,
            "status": "online",
        })
        info = f"  {ip:15s} {mac or '—':17s} {(hostname or vendor or '—')[:30]}"
        if model:
            info += f"  [{model[:40]}]"
        print(info)
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
        url,
        data=payload,
        method="POST",
        headers={"Content-Type": "application/json", "X-Agent-Token": token},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data.get("success"):
                print(f"[OK] Отправлено: добавлено {data.get('inserted', 0)}, обновлено {data.get('updated', 0)}")
                return True
            print(f"[!] Сервер: {data.get('message', 'ошибка')}")
            return False
    except urllib.error.HTTPError as e:
        print(f"[!] HTTP {e.code}: {e.read().decode('utf-8', 'ignore')[:200]}")
        return False
    except Exception as e:
        print(f"[!] Ошибка отправки: {e}")
        return False


def main():
    print("=" * 60)
    print("  Network Scanner Agent для Windows")
    print("=" * 60)
    cfg = load_config()
    interval = int(cfg.get("interval", "60"))
    if not SNMP_AVAILABLE and cfg.get("snmp_enabled", "true").lower() == "true":
        print("[!] pysnmp не установлен — SNMP-опрос пропускается. Установи: pip install pysnmp")
    while True:
        try:
            devices = discover(cfg)
            if devices:
                push(cfg, devices)
            else:
                print("[!] Ничего не найдено")
        except KeyboardInterrupt:
            print("\nВыход.")
            return
        except Exception as e:
            print(f"[!] Ошибка цикла: {e}")
        print(f"[*] Следующий скан через {interval} сек...\n")
        try:
            time.sleep(interval)
        except KeyboardInterrupt:
            print("\nВыход.")
            return


if __name__ == "__main__":
    main()
