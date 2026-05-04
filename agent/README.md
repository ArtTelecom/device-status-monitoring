# Network Scanner Agent (Windows)

Агент сканирует локальную сеть (ARP + ping + SNMP) и отправляет найденное оборудование на сайт. Появляется в разделе **«Найденное оборудование»**, откуда можно одной кнопкой добавить устройство на карту.

## Быстрый старт (через Python)

1. Установи Python 3.9+ с [python.org](https://www.python.org/downloads/) (галочка «Add Python to PATH»).
2. В папке `agent`:
   ```
   pip install -r requirements.txt
   ```
3. Запусти первый раз:
   ```
   python scanner.py
   ```
   Создастся `config.ini` — открой его и впиши:
   - `token` — значение секрета **AGENT_TOKEN** с сайта (Ядро → Секреты)
   - `subnet` — твоя подсеть, например `192.168.88.0/24`
4. Запусти ещё раз: `python scanner.py` или двойной клик на `run.bat`.

Каждые 60 секунд агент сканирует сеть и шлёт данные на сайт. Окно консоли можно свернуть — оно должно быть открыто, пока работает агент.

## Сборка `.exe` (один файл, без Python)

В папке `agent`:
```
build_exe.bat
```
Готовый файл будет в `dist\scanner.exe`. Кладёшь его и `config.ini` в одну папку — и можно запускать на любом Windows без Python.

## Автозапуск как служба Windows

Через [NSSM](https://nssm.cc/download):
```
nssm install NetScanner C:\path\to\scanner.exe
nssm set NetScanner AppDirectory C:\path\to
nssm start NetScanner
```

## Что собирается

- **IP** — все живые адреса в подсети (по ping).
- **MAC** — из ARP-таблицы Windows.
- **Hostname** — обратный DNS.
- **Vendor** — по OUI (первые 3 байта MAC), встроенная база на основные бренды (MikroTik, Huawei, ZTE, TP-Link, Ubiquiti и т.д.).
- **Модель/описание/аптайм** — через SNMP `public` (если устройство поддерживает).

## Параметры `config.ini`

| Параметр | По умолчанию | Что делает |
|---|---|---|
| `subnet` | `192.168.1.0/24` | Какую подсеть сканировать |
| `interval` | `60` | Пауза между сканами (сек) |
| `threads` | `64` | Параллельных ping |
| `ping_timeout` | `800` | Таймаут одного ping (мс) |
| `snmp_enabled` | `true` | Опрашивать SNMP |
| `snmp_community` | `public` | SNMP community |
| `agent_id` | `office-1` | Метка агента (если их несколько) |

## Безопасность

- Токен `AGENT_TOKEN` храни как пароль — кто его знает, тот может писать в твою БД.
- Ping и SNMP — read-only, не вносят изменений в опрашиваемое оборудование.
- Backend принимает только POST с правильным токеном (401 без него).
