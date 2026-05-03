export type OnuStatus = "online" | "offline" | "warning" | "los";

export interface Onu {
  id: string;
  oltId: string;
  pon: number;
  llid: number;
  mac: string;
  sn: string;
  name: string;
  address: string;
  status: OnuStatus;
  rxPower: number | null;
  txPower: number | null;
  distance: number;
  uptime: string;
  lastSeen: string;
  model: string;
  firmware: string;
  vlan: number;
  profile: string;
  lat: number;
  lng: number;
  trafficIn: number;
  trafficOut: number;
}

export interface Olt {
  id: string;
  name: string;
  model: string;
  ip: string;
  firmware: string;
  serial: string;
  status: "online" | "offline" | "warning";
  uptime: string;
  cpu: number;
  ram: number;
  temperature: number;
  ponPorts: number;
  uplinkPorts: number;
  trafficIn: number;
  trafficOut: number;
  lat: number;
  lng: number;
  vendor: string;
  location: string;
}

export interface NetworkEvent {
  id: number;
  time: string;
  date: string;
  type: "error" | "warning" | "info" | "success";
  source: string;
  category: "los" | "link" | "signal" | "config" | "auth" | "system";
  message: string;
  acknowledged: boolean;
}

export type RouterStatus = "online" | "offline" | "warning";
export type RouterVendor = "MikroTik" | "Keenetic" | "TP-Link" | "Huawei" | "Asus" | "D-Link";

export interface RouterDevice {
  id: string;
  onuId: string | null;
  oltId: string;
  name: string;
  vendor: RouterVendor;
  model: string;
  firmware: string;
  ip: string;
  mac: string;
  status: RouterStatus;
  uptime: string;
  cpu: number;
  ram: number;
  temperature: number;
  clientsConnected: number;
  wifi24Clients: number;
  wifi5Clients: number;
  ethClients: number;
  trafficIn: number;
  trafficOut: number;
  signalWifi24: number;
  signalWifi5: number;
  ssid24: string;
  ssid5: string;
  protocol: "SNMP" | "TR-069" | "API" | "SSH";
  pppUser: string | null;
  externalIp: string;
  lat: number;
  lng: number;
  lastSeen: string;
  address: string;
}

export interface CoreRouterPort {
  id: number;
  name: string;
  type: "SFP+" | "SFP" | "RJ45" | "QSFP+";
  speed: 1 | 10 | 25 | 40 | 100;
  status: "up" | "down" | "warning";
  description: string;
  trafficIn: number;
  trafficOut: number;
  errors: number;
  uplink: boolean;
}

export interface CoreRouter {
  id: string;
  name: string;
  vendor: string;
  model: string;
  role: string;
  location: string;
  photo: string;
  ip: string;
  mgmtMac: string;
  serial: string;
  firmware: string;
  uptime: string;
  status: "online" | "warning" | "offline";
  cpu: number;
  ram: number;
  storage: number;
  temperature: number;
  fanSpeed: number;
  powerLoad: number;
  powerSupplies: { id: number; status: "ok" | "fail"; power: number }[];
  ports: CoreRouterPort[];
  bgpPeers: number;
  ospfNeighbors: number;
  routesIpv4: number;
  routesIpv6: number;
}

export interface UnregisteredOnu {
  id: string;
  oltId: string;
  pon: number;
  mac: string;
  sn: string;
  vendor: string;
  detectedAt: string;
  rxPower: number;
}

export interface User {
  id: number;
  username: string;
  email: string;
  fullName: string;
  role: "admin" | "engineer" | "operator" | "viewer";
  lastLogin: string;
  status: "active" | "blocked";
  twoFa: boolean;
  group: string;
}

export interface Macro {
  id: number;
  name: string;
  description: string;
  category: "diagnostic" | "config" | "service";
  commands: string[];
  variables: string[];
  lastRun: string;
  runCount: number;
}

export interface ConfigBackup {
  id: number;
  oltId: string;
  oltName: string;
  date: string;
  size: number;
  type: "auto" | "manual";
  user: string;
  hash: string;
}

export interface DeviceGroup {
  id: number;
  name: string;
  description: string;
  deviceCount: number;
  userCount: number;
  color: string;
}

export const OLTS: Olt[] = [
  {
    id: "olt-1",
    name: "OLT-Центр-01",
    model: "C-DATA FD1104SN-R1",
    ip: "192.168.10.10",
    firmware: "V2.1.03",
    serial: "CDFD1104SN240156",
    status: "online",
    uptime: "47д 12ч 33м",
    cpu: 24,
    ram: 41,
    temperature: 48,
    ponPorts: 4,
    uplinkPorts: 4,
    trafficIn: 412,
    trafficOut: 1840,
    lat: 55.7558,
    lng: 37.6173,
    vendor: "C-DATA",
    location: "ЦОД Центральный, ул. Тверская 7",
  },
  {
    id: "olt-2",
    name: "OLT-Север-02",
    model: "C-DATA FD1216S",
    ip: "192.168.10.20",
    firmware: "V3.0.11",
    serial: "CDFD1216S230872",
    status: "online",
    uptime: "12д 4ч 18м",
    cpu: 38,
    ram: 56,
    temperature: 52,
    ponPorts: 16,
    uplinkPorts: 4,
    trafficIn: 1240,
    trafficOut: 4280,
    lat: 55.8304,
    lng: 37.5858,
    vendor: "C-DATA",
    location: "Узел Северный, Дмитровское ш. 89",
  },
  {
    id: "olt-3",
    name: "OLT-Юг-03",
    model: "C-DATA FD1608GS",
    ip: "192.168.10.30",
    firmware: "V3.0.11",
    serial: "CDFD1608GS240044",
    status: "warning",
    uptime: "2д 8ч 51м",
    cpu: 71,
    ram: 78,
    temperature: 67,
    ponPorts: 16,
    uplinkPorts: 8,
    trafficIn: 2180,
    trafficOut: 6720,
    lat: 55.6504,
    lng: 37.6553,
    vendor: "C-DATA",
    location: "Узел Южный, Каширское ш. 41",
  },
];

const VENDORS = ["ZTE", "Huawei", "TP-Link", "C-DATA", "BDCom"];
const MODELS: Record<string, string[]> = {
  ZTE: ["F670L", "F660", "F601"],
  Huawei: ["HG8310M", "HG8546M", "EG8145V5"],
  "TP-Link": ["XC220-G3v", "XZ000-G3"],
  "C-DATA": ["FD511GW", "FD600"],
  BDCom: ["GP1700", "GP3600"],
};
const STREETS = [
  "Тверская", "Арбат", "Ленинский пр.", "Кутузовский пр.", "Новый Арбат",
  "Лубянка", "Покровка", "Маросейка", "Большая Никитская", "Пятницкая",
  "Ордынка", "Якиманка", "Бауманская", "Сретенка", "Цветной бульвар",
];

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function randInt(min: number, max: number) {
  return Math.floor(rand(min, max + 1));
}

function generateOnus(): Onu[] {
  const onus: Onu[] = [];
  let counter = 1;

  OLTS.forEach((olt) => {
    const onuPerPon = olt.id === "olt-1" ? 12 : olt.id === "olt-2" ? 6 : 4;
    for (let pon = 1; pon <= olt.ponPorts; pon++) {
      const onCount = onuPerPon + randInt(-3, 5);
      for (let llid = 1; llid <= Math.max(1, onCount); llid++) {
        const vendor = VENDORS[randInt(0, VENDORS.length - 1)];
        const model = MODELS[vendor][randInt(0, MODELS[vendor].length - 1)];
        const r = Math.random();
        const status: OnuStatus =
          r < 0.78 ? "online" : r < 0.88 ? "warning" : r < 0.96 ? "offline" : "los";
        const rx = status === "offline" || status === "los" ? null : -15 - rand(0, 15);
        const tx = status === "offline" || status === "los" ? null : 0 + rand(0, 3);

        onus.push({
          id: `ONU-${String(counter).padStart(4, "0")}`,
          oltId: olt.id,
          pon,
          llid,
          mac: `${Math.random().toString(16).slice(2, 4).toUpperCase()}:${Math.random()
            .toString(16)
            .slice(2, 4)
            .toUpperCase()}:${Math.random()
            .toString(16)
            .slice(2, 4)
            .toUpperCase()}:${Math.random()
            .toString(16)
            .slice(2, 4)
            .toUpperCase()}:${Math.random()
            .toString(16)
            .slice(2, 4)
            .toUpperCase()}:${Math.random()
            .toString(16)
            .slice(2, 4)
            .toUpperCase()}`,
          sn: `${vendor.slice(0, 4).toUpperCase()}${Math.random().toString(16).slice(2, 10).toUpperCase()}`,
          name: `Абонент ${counter}`,
          address: `ул. ${STREETS[randInt(0, STREETS.length - 1)]}, д. ${randInt(1, 99)}, кв. ${randInt(1, 250)}`,
          status,
          rxPower: rx ? Number(rx.toFixed(1)) : null,
          txPower: tx ? Number(tx.toFixed(1)) : null,
          distance: Number(rand(0.05, 18).toFixed(2)),
          uptime: status === "offline" || status === "los" ? "—" : `${randInt(1, 90)}д ${randInt(0, 23)}ч`,
          lastSeen: status === "online" ? "только что" : `${randInt(1, 240)} мин назад`,
          model: `${vendor} ${model}`,
          firmware: `V${randInt(1, 4)}.${randInt(0, 9)}.${randInt(1, 30)}`,
          vlan: randInt(100, 4000),
          profile: ["Internet-100", "Internet-300", "Internet-500", "Internet-1G"][randInt(0, 3)],
          lat: olt.lat + rand(-0.04, 0.04),
          lng: olt.lng + rand(-0.06, 0.06),
          trafficIn: status === "online" ? Number(rand(0, 50).toFixed(1)) : 0,
          trafficOut: status === "online" ? Number(rand(0, 200).toFixed(1)) : 0,
        });
        counter++;
      }
    }
  });
  return onus;
}

export const ONUS: Onu[] = generateOnus();

const ROUTER_VENDORS: { vendor: RouterVendor; models: string[] }[] = [
  { vendor: "MikroTik", models: ["hAP ac²", "hAP ax³", "RB951Ui-2HnD", "RB4011iGS+"] },
  { vendor: "Keenetic", models: ["Giga (KN-1011)", "Hopper (KN-3810)", "Viva (KN-1912)", "Speedster (KN-3010)"] },
  { vendor: "TP-Link", models: ["Archer C6", "Archer AX23", "Archer C80"] },
  { vendor: "Huawei", models: ["AX3 Pro", "WS7200"] },
  { vendor: "Asus", models: ["RT-AX55", "RT-AC68U"] },
  { vendor: "D-Link", models: ["DIR-825", "DIR-878"] },
];

const PROTOCOLS: Array<"SNMP" | "TR-069" | "API" | "SSH"> = ["SNMP", "TR-069", "API", "SSH"];

function generateRouters(): RouterDevice[] {
  const arr: RouterDevice[] = [];
  let counter = 1;
  // Каждый второй ONU имеет за собой роутер абонента
  ONUS.forEach((onu) => {
    if (Math.random() > 0.55) return;
    const v = ROUTER_VENDORS[randInt(0, ROUTER_VENDORS.length - 1)];
    const model = v.models[randInt(0, v.models.length - 1)];
    const onuOnline = onu.status === "online" || onu.status === "warning";
    const r = Math.random();
    const status: RouterStatus = !onuOnline ? "offline" : r < 0.85 ? "online" : r < 0.94 ? "warning" : "offline";
    const wifi24 = status === "online" ? randInt(0, 12) : 0;
    const wifi5 = status === "online" ? randInt(0, 8) : 0;
    const eth = status === "online" ? randInt(0, 4) : 0;
    arr.push({
      id: `RTR-${String(counter).padStart(4, "0")}`,
      onuId: onu.id,
      oltId: onu.oltId,
      name: `Роутер ${onu.name}`,
      vendor: v.vendor,
      model: `${v.vendor} ${model}`,
      firmware: `${randInt(6, 7)}.${randInt(0, 49)}.${randInt(1, 9)}`,
      ip: `10.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(2, 254)}`,
      mac: `${Math.random().toString(16).slice(2, 4).toUpperCase()}:${Math.random().toString(16).slice(2, 4).toUpperCase()}:${Math.random().toString(16).slice(2, 4).toUpperCase()}:${Math.random().toString(16).slice(2, 4).toUpperCase()}:${Math.random().toString(16).slice(2, 4).toUpperCase()}:${Math.random().toString(16).slice(2, 4).toUpperCase()}`,
      status,
      uptime: status === "offline" ? "—" : `${randInt(1, 60)}д ${randInt(0, 23)}ч`,
      cpu: status === "online" ? randInt(2, 65) : 0,
      ram: status === "online" ? randInt(15, 80) : 0,
      temperature: status === "offline" ? 0 : randInt(35, 75),
      clientsConnected: wifi24 + wifi5 + eth,
      wifi24Clients: wifi24,
      wifi5Clients: wifi5,
      ethClients: eth,
      trafficIn: status === "online" ? Number(rand(0.1, 80).toFixed(1)) : 0,
      trafficOut: status === "online" ? Number(rand(0.5, 350).toFixed(1)) : 0,
      signalWifi24: status === "online" ? randInt(-75, -35) : 0,
      signalWifi5: status === "online" ? randInt(-78, -38) : 0,
      ssid24: `ISP_${randInt(1000, 9999)}_2G`,
      ssid5: `ISP_${randInt(1000, 9999)}_5G`,
      protocol: PROTOCOLS[randInt(0, PROTOCOLS.length - 1)],
      pppUser: Math.random() > 0.4 ? `user${counter}@isp.ru` : null,
      externalIp: `188.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(2, 254)}`,
      lat: onu.lat + rand(-0.001, 0.001),
      lng: onu.lng + rand(-0.001, 0.001),
      lastSeen: status === "online" ? "только что" : `${randInt(1, 120)} мин назад`,
      address: onu.address,
    });
    counter++;
  });
  return arr;
}

export const ROUTERS: RouterDevice[] = generateRouters();

function generateCorePorts(count: number, uplinkCount: number, baseTraffic: number): CoreRouterPort[] {
  const ports: CoreRouterPort[] = [];
  const types: ("SFP+" | "SFP" | "RJ45" | "QSFP+")[] = ["SFP+", "SFP+", "RJ45", "SFP+"];
  const descriptions = [
    "Uplink → Транзит TransTeleCom",
    "Uplink → Транзит Ростелеком",
    "OLT-Центр-01 (PON-агрегация)",
    "OLT-Север-02 (PON-агрегация)",
    "OLT-Юг-03 (PON-агрегация)",
    "Линк к ядру MX-960",
    "Резервный канал → MSK-IX",
    "Линк к L3-коммутатору",
    "Управляющий VLAN",
    "Биллинг / RADIUS",
    "Мониторинг (SNMP)",
    "DMZ → веб-сервисы",
    "Резерв",
    "Не используется",
    "Линк к Wi-Fi контроллеру",
    "Корпоративный сегмент",
  ];
  for (let i = 0; i < count; i++) {
    const isUplink = i < uplinkCount;
    const r = Math.random();
    const status: "up" | "down" | "warning" = i >= count - 2 ? "down" : r < 0.9 ? "up" : "warning";
    const speed = isUplink ? 10 : i < uplinkCount + 4 ? 10 : 1;
    ports.push({
      id: i + 1,
      name: speed >= 10 ? `Te0/${i + 1}` : `Gi0/${i + 1}`,
      type: speed >= 10 ? "SFP+" : i % 3 === 0 ? "RJ45" : "SFP",
      speed: speed as 1 | 10,
      status,
      description: descriptions[i] || `Порт ${i + 1}`,
      trafficIn:
        status === "down"
          ? 0
          : isUplink
            ? Number((baseTraffic * rand(0.4, 1.2)).toFixed(0))
            : Number((baseTraffic * rand(0.05, 0.5)).toFixed(0)),
      trafficOut:
        status === "down"
          ? 0
          : isUplink
            ? Number((baseTraffic * rand(0.6, 1.5)).toFixed(0))
            : Number((baseTraffic * rand(0.1, 0.7)).toFixed(0)),
      errors: status === "warning" ? randInt(50, 5000) : status === "up" ? randInt(0, 20) : 0,
      uplink: isUplink,
    });
  }
  return ports;
}

export const CORE_ROUTERS: CoreRouter[] = [
  {
    id: "core-1",
    name: "CORE-MSK-01",
    vendor: "Cisco",
    model: "ASR 9001",
    role: "Магистральный маршрутизатор · BGP/OSPF",
    location: "ЦОД Центральный, стойка A12",
    photo: "https://cdn.poehali.dev/projects/4e28f997-118c-46af-9ba3-05afe46c8699/files/36bbe27c-ddb8-4166-bbd2-a2c9365b06e1.jpg",
    ip: "10.0.0.1",
    mgmtMac: "00:1A:2B:3C:4D:01",
    serial: "FOX2348N0KP",
    firmware: "IOS XR 7.5.2",
    uptime: "184д 7ч 42м",
    status: "online",
    cpu: 28,
    ram: 47,
    storage: 34,
    temperature: 42,
    fanSpeed: 4200,
    powerLoad: 62,
    powerSupplies: [
      { id: 1, status: "ok", power: 245 },
      { id: 2, status: "ok", power: 240 },
    ],
    ports: generateCorePorts(16, 2, 800),
    bgpPeers: 12,
    ospfNeighbors: 6,
    routesIpv4: 945672,
    routesIpv6: 187432,
  },
  {
    id: "core-2",
    name: "CORE-MSK-02",
    vendor: "Juniper",
    model: "MX204",
    role: "Резервный маршрутизатор · BGP",
    location: "ЦОД Центральный, стойка A14",
    photo: "https://cdn.poehali.dev/projects/4e28f997-118c-46af-9ba3-05afe46c8699/files/6edebf55-843c-4bcf-ae62-52a5f5c92f94.jpg",
    ip: "10.0.0.2",
    mgmtMac: "00:1A:2B:3C:4D:02",
    serial: "JN1184729AC",
    firmware: "Junos 21.4R3",
    uptime: "92д 14ч 11м",
    status: "warning",
    cpu: 71,
    ram: 68,
    storage: 52,
    temperature: 58,
    fanSpeed: 5400,
    powerLoad: 78,
    powerSupplies: [
      { id: 1, status: "ok", power: 310 },
      { id: 2, status: "fail", power: 0 },
    ],
    ports: generateCorePorts(12, 2, 1200),
    bgpPeers: 8,
    ospfNeighbors: 4,
    routesIpv4: 942103,
    routesIpv6: 184872,
  },
  {
    id: "core-3",
    name: "BORDER-RT-01",
    vendor: "MikroTik",
    model: "CCR2004-1G-12S+2XS",
    role: "Граничный маршрутизатор · NAT/QoS",
    location: "ЦОД Центральный, стойка B07",
    photo: "https://cdn.poehali.dev/projects/4e28f997-118c-46af-9ba3-05afe46c8699/files/63330f23-43fd-46d3-89b1-914eaa853751.jpg",
    ip: "10.0.0.3",
    mgmtMac: "00:1A:2B:3C:4D:03",
    serial: "HFX98K4LPM2",
    firmware: "RouterOS 7.13.4",
    uptime: "47д 22ч 03м",
    status: "online",
    cpu: 35,
    ram: 41,
    storage: 18,
    temperature: 51,
    fanSpeed: 3800,
    powerLoad: 45,
    powerSupplies: [
      { id: 1, status: "ok", power: 95 },
      { id: 2, status: "ok", power: 92 },
    ],
    ports: generateCorePorts(14, 2, 600),
    bgpPeers: 4,
    ospfNeighbors: 3,
    routesIpv4: 134522,
    routesIpv6: 28100,
  },
];

export function generateCoreTraffic(points = 60) {
  const arr = [];
  for (let i = 0; i < points; i++) {
    const time = new Date(Date.now() - (points - i) * 60 * 1000);
    arr.push({
      time: time.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
      in: Number((rand(800, 2400) + Math.sin(i / 6) * 600).toFixed(0)),
      out: Number((rand(2000, 6500) + Math.sin(i / 6) * 1800).toFixed(0)),
    });
  }
  return arr;
}

export const EVENTS: NetworkEvent[] = [
  { id: 1, time: "10:42:18", date: "03.05.2026", type: "error", source: "ONU-0024", category: "los", message: "Потеря оптического сигнала (LOS)", acknowledged: false },
  { id: 2, time: "10:38:55", date: "03.05.2026", type: "warning", source: "ONU-0107", category: "signal", message: "Уровень сигнала ниже нормы: -28.6 дБм", acknowledged: false },
  { id: 3, time: "10:31:02", date: "03.05.2026", type: "info", source: "ONU-0188", category: "auth", message: "Успешная регистрация на OLT-Север-02 / PON 5", acknowledged: true },
  { id: 4, time: "10:15:44", date: "03.05.2026", type: "warning", source: "ONU-0044", category: "signal", message: "Уровень сигнала ниже нормы: -27.8 дБм", acknowledged: false },
  { id: 5, time: "09:58:30", date: "03.05.2026", type: "error", source: "ONU-0091", category: "link", message: "Потеря связи: устройство недоступно", acknowledged: false },
  { id: 6, time: "09:44:17", date: "03.05.2026", type: "success", source: "OLT-Центр-01", category: "config", message: "Бэкап конфигурации создан успешно", acknowledged: true },
  { id: 7, time: "09:30:05", date: "03.05.2026", type: "info", source: "ONU-0212", category: "config", message: "Обновление прошивки до версии V3.21.10", acknowledged: true },
  { id: 8, time: "08:55:12", date: "03.05.2026", type: "error", source: "OLT-Юг-03", category: "system", message: "Высокая температура: 67°C — рекомендуется проверка", acknowledged: false },
  { id: 9, time: "08:42:21", date: "03.05.2026", type: "warning", source: "ONU-0156", category: "link", message: "Частые отключения: 3 раза за час", acknowledged: false },
  { id: 10, time: "08:18:00", date: "03.05.2026", type: "info", source: "Система", category: "system", message: "Плановый опрос оборудования завершён за 4.2 сек", acknowledged: true },
];

export const UNREGISTERED: UnregisteredOnu[] = [
  { id: "u-1", oltId: "olt-1", pon: 2, mac: "00:1A:2B:3C:4D:5E", sn: "ZTEGC0001234", vendor: "ZTE", detectedAt: "10:38:12", rxPower: -22.4 },
  { id: "u-2", oltId: "olt-1", pon: 4, mac: "00:1A:2B:3C:4D:5F", sn: "HWTC0005678", vendor: "Huawei", detectedAt: "10:22:55", rxPower: -19.8 },
  { id: "u-3", oltId: "olt-2", pon: 7, mac: "00:1A:2B:3C:4D:60", sn: "TPLG0009876", vendor: "TP-Link", detectedAt: "09:55:01", rxPower: -24.1 },
  { id: "u-4", oltId: "olt-3", pon: 11, mac: "00:1A:2B:3C:4D:61", sn: "BDCM0001122", vendor: "BDCom", detectedAt: "09:12:33", rxPower: -26.0 },
];

export const USERS: User[] = [
  { id: 1, username: "admin", email: "admin@isp.ru", fullName: "Системный администратор", role: "admin", lastLogin: "03.05.2026 10:15", status: "active", twoFa: true, group: "Все группы" },
  { id: 2, username: "ivanov", email: "ivanov@isp.ru", fullName: "Иванов Иван Иванович", role: "engineer", lastLogin: "03.05.2026 09:48", status: "active", twoFa: true, group: "Центр" },
  { id: 3, username: "petrov", email: "petrov@isp.ru", fullName: "Петров Пётр Петрович", role: "engineer", lastLogin: "02.05.2026 18:22", status: "active", twoFa: false, group: "Север" },
  { id: 4, username: "operator1", email: "op1@isp.ru", fullName: "Сидорова Анна", role: "operator", lastLogin: "03.05.2026 08:05", status: "active", twoFa: false, group: "Все группы" },
  { id: 5, username: "viewer", email: "v@isp.ru", fullName: "Просмотр (отчёты)", role: "viewer", lastLogin: "01.05.2026 14:00", status: "active", twoFa: false, group: "Все группы" },
  { id: 6, username: "subcontract", email: "sub@partner.ru", fullName: "Субподрядчик ООО Связь", role: "viewer", lastLogin: "никогда", status: "blocked", twoFa: false, group: "Юг" },
];

export const MACROS: Macro[] = [
  { id: 1, name: "Перезагрузить ONU", description: "Мягкий рестарт абонентского устройства", category: "service", commands: ["epon onu reboot {pon} {llid}"], variables: ["pon", "llid"], lastRun: "03.05.2026 10:30", runCount: 47 },
  { id: 2, name: "Диагностика оптики ONU", description: "Полная информация по уровням сигнала", category: "diagnostic", commands: ["show epon interface epon 0/{pon} onu {llid} optical-transceiver-diagnosis"], variables: ["pon", "llid"], lastRun: "03.05.2026 10:42", runCount: 312 },
  { id: 3, name: "Сменить VLAN абонента", description: "Перенастройка тарифа/VLAN на абонентской ONU", category: "config", commands: ["epon onu service-port {port}", "vlan {vlan}", "exit"], variables: ["port", "vlan"], lastRun: "02.05.2026 16:11", runCount: 18 },
  { id: 4, name: "Показать MAC-адреса PON", description: "Список всех MAC-адресов на PON-порту", category: "diagnostic", commands: ["show mac address-table interface epon 0/{pon}"], variables: ["pon"], lastRun: "03.05.2026 09:55", runCount: 89 },
  { id: 5, name: "Сохранить конфигурацию", description: "Запись текущей конфигурации в flash", category: "service", commands: ["write memory"], variables: [], lastRun: "03.05.2026 09:44", runCount: 22 },
];

export const BACKUPS: ConfigBackup[] = [
  { id: 1, oltId: "olt-1", oltName: "OLT-Центр-01", date: "03.05.2026 04:00", size: 48512, type: "auto", user: "Система", hash: "a3f7b2c8" },
  { id: 2, oltId: "olt-2", oltName: "OLT-Север-02", date: "03.05.2026 04:00", size: 89231, type: "auto", user: "Система", hash: "b8e1c4d5" },
  { id: 3, oltId: "olt-3", oltName: "OLT-Юг-03", date: "03.05.2026 04:00", size: 102443, type: "auto", user: "Система", hash: "c1d2e3f4" },
  { id: 4, oltId: "olt-1", oltName: "OLT-Центр-01", date: "02.05.2026 18:32", size: 48498, type: "manual", user: "ivanov", hash: "d5f6a7b8" },
  { id: 5, oltId: "olt-1", oltName: "OLT-Центр-01", date: "02.05.2026 04:00", size: 48498, type: "auto", user: "Система", hash: "e9a0b1c2" },
];

export const GROUPS: DeviceGroup[] = [
  { id: 1, name: "Центр", description: "Центральный округ Москвы", deviceCount: 1, userCount: 3, color: "#3b82f6" },
  { id: 2, name: "Север", description: "Северный округ Москвы", deviceCount: 1, userCount: 2, color: "#10b981" },
  { id: 3, name: "Юг", description: "Южный округ Москвы (включая субподряд)", deviceCount: 1, userCount: 2, color: "#f59e0b" },
];

export function generateSignalHistory(currentRx: number | null, points = 48) {
  const arr = [];
  for (let i = 0; i < points; i++) {
    const time = new Date(Date.now() - (points - i) * 30 * 60 * 1000);
    const rx = currentRx === null ? null : Number((currentRx + rand(-1.5, 1.5)).toFixed(1));
    const tx = currentRx === null ? null : Number((2 + rand(-0.5, 0.5)).toFixed(1));
    arr.push({
      time: time.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
      rx,
      tx,
    });
  }
  return arr;
}

export function generateTrafficHistory(points = 24) {
  const arr = [];
  for (let i = 0; i < points; i++) {
    const time = new Date(Date.now() - (points - i) * 60 * 60 * 1000);
    arr.push({
      time: time.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
      in: Number((rand(200, 1500) + Math.sin(i / 4) * 400).toFixed(0)),
      out: Number((rand(800, 4000) + Math.sin(i / 4) * 1500).toFixed(0)),
    });
  }
  return arr;
}

export function generateOltMetricsHistory(points = 24) {
  const arr = [];
  for (let i = 0; i < points; i++) {
    const time = new Date(Date.now() - (points - i) * 60 * 60 * 1000);
    arr.push({
      time: time.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
      cpu: Number((rand(15, 70)).toFixed(0)),
      ram: Number((rand(30, 75)).toFixed(0)),
      temp: Number((rand(40, 60)).toFixed(0)),
    });
  }
  return arr;
}

export function generateOnuStatusHistory(points = 24) {
  const arr = [];
  const total = ONUS.length;
  for (let i = 0; i < points; i++) {
    const time = new Date(Date.now() - (points - i) * 60 * 60 * 1000);
    const offline = randInt(2, 12);
    const warning = randInt(3, 18);
    arr.push({
      time: time.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
      online: total - offline - warning,
      warning,
      offline,
    });
  }
  return arr;
}