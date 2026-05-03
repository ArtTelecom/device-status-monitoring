export const MIKROTIK_API_URL = "https://functions.poehali.dev/0791debc-4b91-47c3-95aa-7a34a8b2e271";

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

export function fmtBytes(bytes: number): string {
  if (!bytes) return "0 Б";
  const units = ["Б", "КБ", "МБ", "ГБ", "ТБ"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 ? 2 : n < 100 ? 1 : 0)} ${units[i]}`;
}
