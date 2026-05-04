export const MIKROTIK_API_URL = "https://functions.poehali.dev/0791debc-4b91-47c3-95aa-7a34a8b2e271";
export const MIKROTIK_CLIENTS_URL = "https://functions.poehali.dev/b1b8dc44-fdff-4212-9f68-9aa1ed50a3c2";

export interface MikrotikClient {
  mac: string;
  ip: string;
  hostname: string;
  server: string;
  status: string;
  last_seen: string;
  dynamic: boolean;
  blocked: boolean;
  disabled: boolean;
  expires_after: string;
  comment: string;
  source: "dhcp" | "arp";
  interface: string;
  reachable: boolean;
}

export interface MikrotikClientsResponse {
  success: boolean;
  total: number;
  online: number;
  bound: number;
  clients: MikrotikClient[];
  message?: string;
}

export async function fetchMikrotikClients(): Promise<MikrotikClientsResponse> {
  const res = await fetch(MIKROTIK_CLIENTS_URL);
  return res.json();
}

export interface MikrotikInterface {
  index: number;
  name: string;
  type: string;
  mtu: string;
  mac: string;
  running: boolean;
  disabled: boolean;
  comment: string;
  rx_bytes: number;
  tx_bytes: number;
  rx_packets: number;
  tx_packets: number;
  rx_errors: number;
  tx_errors: number;
  rx_drops: number;
  tx_drops: number;
  last_link_up: string;
}

export interface MikrotikData {
  success: boolean;
  host: string;
  identity: { name: string };
  system: {
    version: string;
    build_time: string;
    platform: string;
    board_name: string;
    architecture: string;
    uptime: string;
  };
  routerboard: {
    model: string;
    serial: string;
    firmware_type: string;
    current_firmware: string;
    upgrade_firmware: string;
  };
  resources: {
    cpu_load: number;
    cpu_count: number;
    cpu_frequency: number;
    memory_total_mb: number;
    memory_used_mb: number;
    memory_pct: number;
    storage_total_mb: number;
    storage_used_mb: number;
    storage_pct: number;
  };
  health: { voltage?: string; temperature?: string };
  interfaces: { count: number; running: number; list: MikrotikInterface[] };
  routing: {
    bgp_peers: number;
    bgp_active: number;
    ospf_neighbors: number;
    ospf_full: number;
    routes_count: number;
  };
  error?: string;
  message?: string;
}

export async function fetchMikrotik(): Promise<MikrotikData> {
  const res = await fetch(MIKROTIK_API_URL);
  return res.json();
}

export function parseUptimeRouterOS(s: string): string {
  if (!s) return "—";
  const m: Record<string, string> = { w: "н", d: "д", h: "ч", m: "м", s: "с" };
  return s.replace(/(\d+)([wdhms])/g, (_, n, u) => `${n}${m[u]} `).trim();
}

export function fmtBytes(bytes: number, precision = 2): string {
  if (!bytes) return "0 Б";
  const units = ["Б", "КБ", "МБ", "ГБ", "ТБ", "ПБ"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(precision)} ${units[i]}`;
}

export function fmtBytesExact(bytes: number): string {
  return `${bytes.toLocaleString("ru-RU")} Б`;
}

export function fmtBps(bps: number, precision = 2): string {
  if (bps >= 1_000_000_000) return `${(bps / 1_000_000_000).toFixed(precision)} Гбит/с`;
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(precision)} Мбит/с`;
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(precision)} Кбит/с`;
  return `${bps.toFixed(0)} бит/с`;
}

export function parseUptimeFull(s: string): { days: number; hours: number; minutes: number; seconds: number; weeks: number; pretty: string } {
  if (!s) return { days: 0, hours: 0, minutes: 0, seconds: 0, weeks: 0, pretty: "—" };
  const m = (s.match(/(\d+)([wdhms])/g) || []).reduce((acc: Record<string, number>, x) => {
    const n = parseInt(x);
    const u = x.replace(/\d/g, "");
    acc[u] = n;
    return acc;
  }, {});
  const weeks = m.w || 0;
  const days = m.d || 0;
  const hours = m.h || 0;
  const minutes = m.m || 0;
  const seconds = m.s || 0;
  const parts = [];
  if (weeks) parts.push(`${weeks}н`);
  if (days) parts.push(`${days}д`);
  parts.push(`${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`);
  return { weeks, days, hours, minutes, seconds, pretty: parts.join(" ") };
}