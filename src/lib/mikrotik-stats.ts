export const STATS_API_URL = "https://functions.poehali.dev/9a94de1a-a395-4f8c-899e-4aba0fa7ac08";

export type Period = "day" | "week" | "15days" | "month";

export interface PortSettings {
  id: number;
  router_id: string;
  port_name: string;
  custom_name: string | null;
  role: string;
  description: string | null;
  color: string | null;
  is_uplink: boolean;
  is_downlink: boolean;
}

export interface RouterSettings {
  id: number;
  router_id: string;
  custom_name: string | null;
  role: string | null;
  location: string | null;
  photo_url: string | null;
  auto_photo: boolean;
  notes: string | null;
}

export interface PeakRow {
  port_name: string;
  period: string;
  peak_rx_bps: number;
  peak_tx_bps: number;
  peak_rx_at: string;
  peak_tx_at: string;
}

export interface HistoryBucket {
  bucket: string;
  port_name: string;
  rx_consumed: number;
  tx_consumed: number;
  peak_rx_bps: number;
  peak_tx_bps: number;
  avg_rx_bps: number;
  avg_tx_bps: number;
}

export interface HistoryTotal {
  port_name: string;
  rx_total: number;
  tx_total: number;
}

export async function getSettings(routerId = "r4-arttelecom") {
  const r = await fetch(`${STATS_API_URL}?action=settings&router_id=${routerId}`);
  return r.json() as Promise<{ router: RouterSettings | null; ports: PortSettings[] }>;
}

export async function getPeaks(routerId = "r4-arttelecom") {
  const r = await fetch(`${STATS_API_URL}?action=peaks&router_id=${routerId}`);
  return r.json() as Promise<{ peaks: PeakRow[] }>;
}

export async function getHistory(period: Period, routerId = "r4-arttelecom", port = "") {
  const url = new URL(STATS_API_URL);
  url.searchParams.set("action", "history");
  url.searchParams.set("period", period);
  url.searchParams.set("router_id", routerId);
  if (port) url.searchParams.set("port", port);
  const r = await fetch(url.toString());
  return r.json() as Promise<{ period: string; history: HistoryBucket[]; totals_per_port: HistoryTotal[] }>;
}

export async function recordSamples(
  samples: { port: string; rx_bytes: number; tx_bytes: number; rx_bps: number; tx_bps: number }[],
  routerId = "r4-arttelecom",
) {
  const r = await fetch(`${STATS_API_URL}?action=record`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ router_id: routerId, samples }),
  });
  return r.json();
}

export async function updateRouter(payload: Partial<RouterSettings>) {
  const r = await fetch(`${STATS_API_URL}?action=router`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ router_id: "r4-arttelecom", ...payload }),
  });
  return r.json();
}

export async function updatePort(payload: Partial<PortSettings> & { port_name: string }) {
  const r = await fetch(`${STATS_API_URL}?action=port`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ router_id: "r4-arttelecom", ...payload }),
  });
  return r.json();
}

export const PORT_ROLES = [
  { v: "uplink", label: "Uplink (входящий)", color: "#3b82f6" },
  { v: "downlink", label: "Downlink (исходящий)", color: "#a855f7" },
  { v: "lan", label: "LAN", color: "#22c55e" },
  { v: "management", label: "Управление", color: "#06b6d4" },
  { v: "dmz", label: "DMZ", color: "#f59e0b" },
  { v: "wan-backup", label: "Резервный WAN", color: "#ec4899" },
  { v: "olt", label: "OLT / PON", color: "#8b5cf6" },
  { v: "trunk", label: "Trunk / транзит", color: "#14b8a6" },
  { v: "monitoring", label: "Мониторинг", color: "#64748b" },
  { v: "unused", label: "Не используется", color: "#475569" },
];

export function roleColor(role: string): string {
  return PORT_ROLES.find((r) => r.v === role)?.color ?? "#64748b";
}

export function roleLabel(role: string): string {
  return PORT_ROLES.find((r) => r.v === role)?.label ?? role;
}
