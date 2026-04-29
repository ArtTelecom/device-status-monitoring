import { useState, useEffect, useCallback } from "react";
import Icon from "@/components/ui/icon";
type IconName = string;

const ONU_POLL_URL = "https://functions.poehali.dev/86548b0d-d3e0-43fb-ae33-103f945e7664";

interface OnuDevice {
  id: string;
  index: string;
  mac: string;
  sn: string;
  status: string;
  signal: number | null;
  tx: number | null;
  olt: string;
  port: string;
  ip: string;
  uptime: string;
  model: string;
}

interface PollResult {
  onu_list: OnuDevice[];
  total: number;
  online: number;
  offline: number;
  warning: number;
  host: string;
  error?: string;
}

type Section = "dashboard" | "devices" | "signals" | "events" | "analytics" | "settings";

const NAV_ITEMS = [
  { id: "dashboard", label: "Главная",    icon: "LayoutDashboard" },
  { id: "devices",   label: "Устройства", icon: "Router" },
  { id: "signals",   label: "Сигналы",    icon: "Activity" },
  { id: "events",    label: "События",    icon: "Bell" },
  { id: "analytics", label: "Аналитика",  icon: "BarChart3" },
  { id: "settings",  label: "Настройки",  icon: "Settings" },
] as const;

const ONU_DATA = [
  { id: "ONU-001", mac: "AA:BB:CC:11:22:33", ip: "192.168.1.101", olt: "OLT-01", port: "1/1/1", status: "online",  signal: -18.4, uptime: "14д 6ч",  model: "ZTE F670L" },
  { id: "ONU-002", mac: "AA:BB:CC:11:22:34", ip: "192.168.1.102", olt: "OLT-01", port: "1/1/2", status: "online",  signal: -21.2, uptime: "7д 2ч",   model: "Huawei HG8310M" },
  { id: "ONU-003", mac: "AA:BB:CC:11:22:35", ip: "192.168.1.103", olt: "OLT-02", port: "1/2/1", status: "warning", signal: -27.8, uptime: "2д 14ч",  model: "ZTE F660" },
  { id: "ONU-004", mac: "AA:BB:CC:11:22:36", ip: "192.168.1.104", olt: "OLT-01", port: "1/1/4", status: "offline", signal: null,  uptime: "—",       model: "TP-Link XC220-G3v" },
  { id: "ONU-005", mac: "AA:BB:CC:11:22:37", ip: "192.168.1.105", olt: "OLT-03", port: "1/3/1", status: "online",  signal: -19.1, uptime: "30д 1ч",  model: "ZTE F670L" },
  { id: "ONU-006", mac: "AA:BB:CC:11:22:38", ip: "192.168.1.106", olt: "OLT-02", port: "1/2/3", status: "online",  signal: -22.0, uptime: "5д 11ч",  model: "Huawei HG8310M" },
  { id: "ONU-007", mac: "AA:BB:CC:11:22:39", ip: "192.168.1.107", olt: "OLT-01", port: "1/1/6", status: "warning", signal: -29.3, uptime: "1д 3ч",   model: "ZTE F660" },
  { id: "ONU-008", mac: "AA:BB:CC:11:22:40", ip: "192.168.1.108", olt: "OLT-03", port: "1/3/2", status: "offline", signal: null,  uptime: "—",       model: "ZTE F670L" },
  { id: "ONU-009", mac: "AA:BB:CC:11:22:41", ip: "192.168.1.109", olt: "OLT-02", port: "1/2/5", status: "online",  signal: -20.5, uptime: "9д 22ч",  model: "TP-Link XC220-G3v" },
  { id: "ONU-010", mac: "AA:BB:CC:11:22:42", ip: "192.168.1.110", olt: "OLT-01", port: "1/1/8", status: "online",  signal: -17.9, uptime: "21д 5ч",  model: "Huawei HG8310M" },
];

const EVENTS_DATA = [
  { id: 1, time: "10:42:18", date: "29.04.2026", type: "error",   device: "ONU-004", message: "Устройство недоступно — нет оптического сигнала" },
  { id: 2, time: "10:38:55", date: "29.04.2026", type: "warning", device: "ONU-007", message: "Уровень сигнала ниже нормы: -29.3 дБм" },
  { id: 3, time: "10:31:02", date: "29.04.2026", type: "info",    device: "ONU-005", message: "Устройство авторизовано на OLT-03 / порт 1/3/1" },
  { id: 4, time: "10:15:44", date: "29.04.2026", type: "warning", device: "ONU-003", message: "Уровень сигнала ниже нормы: -27.8 дБм" },
  { id: 5, time: "09:58:30", date: "29.04.2026", type: "error",   device: "ONU-008", message: "Потеря связи — последний отклик 09:52" },
  { id: 6, time: "09:44:17", date: "29.04.2026", type: "info",    device: "ONU-010", message: "Плановая перезагрузка завершена успешно" },
  { id: 7, time: "09:30:05", date: "29.04.2026", type: "info",    device: "ONU-002", message: "Обновление прошивки до версии V3.21.10" },
  { id: 8, time: "08:55:12", date: "29.04.2026", type: "error",   device: "ONU-004", message: "Первичная потеря соединения" },
];

const SIGNAL_DATA = [
  { id: "ONU-001", model: "ZTE F670L",         olt: "OLT-01", rx: -18.4, tx: 2.1, ber: "1e-9", quality: "excellent" },
  { id: "ONU-002", model: "Huawei HG8310M",    olt: "OLT-01", rx: -21.2, tx: 1.8, ber: "1e-9", quality: "good" },
  { id: "ONU-003", model: "ZTE F660",          olt: "OLT-02", rx: -27.8, tx: 0.9, ber: "1e-7", quality: "poor" },
  { id: "ONU-005", model: "ZTE F670L",         olt: "OLT-03", rx: -19.1, tx: 2.0, ber: "1e-9", quality: "excellent" },
  { id: "ONU-006", model: "Huawei HG8310M",    olt: "OLT-02", rx: -22.0, tx: 1.7, ber: "1e-9", quality: "good" },
  { id: "ONU-007", model: "ZTE F660",          olt: "OLT-01", rx: -29.3, tx: 0.6, ber: "1e-6", quality: "poor" },
  { id: "ONU-009", model: "TP-Link XC220-G3v", olt: "OLT-02", rx: -20.5, tx: 1.9, ber: "1e-9", quality: "good" },
  { id: "ONU-010", model: "Huawei HG8310M",    olt: "OLT-01", rx: -17.9, tx: 2.3, ber: "1e-9", quality: "excellent" },
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; dotCls: string; color: string }> = {
    online:  { label: "В сети",     dotCls: "status-online",  color: "hsl(142 76% 44%)" },
    offline: { label: "Офлайн",     dotCls: "status-offline", color: "hsl(0 72% 60%)" },
    warning: { label: "Внимание",   dotCls: "status-warning", color: "hsl(38 92% 55%)" },
    unknown: { label: "Неизвестно", dotCls: "status-unknown", color: "hsl(215 14% 55%)" },
  };
  const s = map[status] ?? map.unknown;
  return (
    <span className="flex items-center gap-1.5">
      <span className={`status-dot ${s.dotCls}`} />
      <span className="text-xs font-medium" style={{ color: s.color }}>{s.label}</span>
    </span>
  );
}

function QualityBadge({ q }: { q: string }) {
  const map: Record<string, { label: string; color: string }> = {
    excellent: { label: "Отлично", color: "hsl(142 76% 44%)" },
    good:      { label: "Хорошо",  color: "hsl(195 80% 50%)" },
    poor:      { label: "Слабый",  color: "hsl(38 92% 55%)" },
  };
  const s = map[q] ?? { label: q, color: "gray" };
  return <span className="text-xs font-medium" style={{ color: s.color }}>{s.label}</span>;
}

function SignalBar({ value }: { value: number | null }) {
  if (value === null) return <span className="font-mono-data text-muted-foreground text-xs">—</span>;
  const pct = Math.max(0, Math.min(100, ((value + 35) / 20) * 100));
  const color = value > -25 ? "hsl(142 76% 44%)" : value > -28 ? "hsl(38 92% 50%)" : "hsl(0 72% 51%)";
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono-data text-xs w-16 shrink-0" style={{ color }}>{value} дБм</span>
      <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden" style={{ minWidth: 40 }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function EventIcon({ type }: { type: string }) {
  const map: Record<string, { icon: string; color: string }> = {
    error:   { icon: "XCircle",      color: "hsl(0 72% 51%)" },
    warning: { icon: "AlertTriangle", color: "hsl(38 92% 50%)" },
    info:    { icon: "Info",          color: "hsl(210 100% 56%)" },
  };
  const s = map[type] ?? { icon: "Circle", color: "gray" };
  return <Icon name={s.icon as IconName} size={14} style={{ color: s.color, flexShrink: 0 }} />;
}

// ─── SECTIONS ────────────────────────────────────────────────────────────────

function Dashboard({ onu, loading }: { onu: OnuDevice[]; loading: boolean }) {
  const online  = onu.filter(d => d.status === "online").length;
  const offline = onu.filter(d => d.status === "offline").length;
  const warning = onu.filter(d => d.status === "warning").length;
  const total   = onu.length;

  const kpis = [
    { label: "Всего устройств", value: total,   icon: "Router",        color: "hsl(210 100% 56%)", sub: "ONU зарегистрировано" },
    { label: "В сети",          value: online,  icon: "CheckCircle2",  color: "hsl(142 76% 44%)", sub: total > 0 ? `${Math.round(online/total*100)}% доступность` : "—" },
    { label: "Внимание",        value: warning, icon: "AlertTriangle", color: "hsl(38 92% 50%)",  sub: "Слабый сигнал" },
    { label: "Офлайн",          value: offline, icon: "XCircle",       color: "hsl(0 72% 51%)",   sub: "Нет связи" },
  ];

  // OLT stats grouped from live data
  const oltNames = [...new Set(onu.map(d => d.olt))].sort();
  const oltStats = oltNames.map(name => {
    const devices = onu.filter(d => d.olt === name);
    const on = devices.filter(d => d.status === "online").length;
    const load = devices.length > 0 ? Math.round((on / devices.length) * 100) : 0;
    return { name, total: devices.length, online: on, load };
  });

  return (
    <div className="animate-fade-in space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k, i) => (
          <div key={i} className="bg-card border border-border rounded-lg p-4 card-hover">
            <div className="flex items-start justify-between mb-3">
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider leading-tight">{k.label}</span>
              <div className="p-1.5 rounded-md shrink-0" style={{ background: `color-mix(in srgb, ${k.color} 12%, transparent)` }}>
                <Icon name={k.icon as IconName} size={14} style={{ color: k.color }} />
              </div>
            </div>
            <div className="text-3xl font-semibold font-mono-data" style={{ color: k.color }}>{k.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-4">Состояние OLT</div>
          <div className="space-y-5">
            {oltStats.map(olt => (
              <div key={olt.name}>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-semibold">{olt.name}</span>
                  <span className="text-xs text-muted-foreground font-mono-data">{olt.online}/{olt.total}</span>
                </div>
                <div className="h-1.5 bg-secondary rounded-full overflow-hidden mb-1">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${olt.load}%`,
                      background: olt.load > 85
                        ? "hsl(0 72% 51%)"
                        : olt.load > 70
                        ? "hsl(38 92% 50%)"
                        : "hsl(210 100% 56%)",
                    }}
                  />
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground">Загрузка портов</span>
                  <span className="text-xs font-mono-data">{olt.load}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-5 col-span-2">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-4">Последние события</div>
          <div className="space-y-0">
            {EVENTS_DATA.slice(0, 5).map(ev => (
              <div key={ev.id} className="flex items-start gap-3 py-2.5 border-b border-border last:border-0">
                <EventIcon type={ev.type} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-semibold font-mono-data text-primary">{ev.device}</span>
                    <span className="text-xs text-muted-foreground">{ev.time}</span>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{ev.message}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Проблемные устройства</div>
          <span className="text-xs text-primary cursor-pointer hover:underline">Показать все →</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr>
              {["ID", "Статус", "OLT / Порт", "Сигнал", "Модель"].map(h => (
                <th key={h} className="text-left pb-2.5 text-xs text-muted-foreground uppercase tracking-wider font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {onu.filter(d => d.status !== "online").map(d => (
              <tr key={d.id} className="border-t border-border">
                <td className="py-3 font-mono-data text-xs font-medium text-primary">{d.id}</td>
                <td className="py-3"><StatusBadge status={d.status} /></td>
                <td className="py-3 text-xs text-muted-foreground">{d.olt} / {d.port}</td>
                <td className="py-3"><SignalBar value={d.signal} /></td>
                <td className="py-3 text-xs text-muted-foreground">{d.model}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Devices({ onu, loading }: { onu: OnuDevice[]; loading: boolean }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const filtered = onu.filter(d => {
    const q = search.toLowerCase();
    const matchSearch = !q || d.id.toLowerCase().includes(q) || (d.ip || '').includes(q) || d.mac.toLowerCase().includes(q) || d.model.toLowerCase().includes(q) || d.sn.toLowerCase().includes(q);
    const matchFilter = filter === "all" || d.status === filter;
    return matchSearch && matchFilter;
  });

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Icon name="Search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            className="w-full bg-card border border-border rounded-md pl-8 pr-3 py-2 text-sm outline-none focus:border-primary/60 transition-colors"
            placeholder="Поиск по ID, IP, MAC, модели..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1">
          {[["all","Все"],["online","В сети"],["warning","Внимание"],["offline","Офлайн"]].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setFilter(val)}
              className={`px-3 py-1.5 text-xs rounded-md font-medium transition-all ${filter === val ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">{filtered.length} устройств</span>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {["ID устройства","MAC-адрес","IP-адрес","OLT","Порт","Статус","Сигнал","Аптайм","Модель"].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(d => (
                <tr key={d.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors cursor-pointer">
                  <td className="px-4 py-3 font-mono-data text-xs font-semibold text-primary">{d.id}</td>
                  <td className="px-4 py-3 font-mono-data text-xs text-muted-foreground">{d.mac}</td>
                  <td className="px-4 py-3 font-mono-data text-xs">{d.ip}</td>
                  <td className="px-4 py-3 text-xs">{d.olt}</td>
                  <td className="px-4 py-3 font-mono-data text-xs text-muted-foreground">{d.port}</td>
                  <td className="px-4 py-3"><StatusBadge status={d.status} /></td>
                  <td className="px-4 py-3 min-w-40"><SignalBar value={d.signal} /></td>
                  <td className="px-4 py-3 font-mono-data text-xs text-muted-foreground whitespace-nowrap">{d.uptime}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{d.model}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Signals({ onu, loading }: { onu: OnuDevice[]; loading: boolean }) {
  const withSignal = onu.filter(d => d.signal !== null);
  const validRx = withSignal.map(d => d.signal as number);
  const avg    = validRx.length ? (validRx.reduce((a, b) => a + b, 0) / validRx.length).toFixed(1) : "—";
  const validTx = onu.filter(d => d.tx !== null).map(d => d.tx as number);
  const avgTx  = validTx.length ? (validTx.reduce((a, b) => a + b, 0) / validTx.length).toFixed(1) : "—";
  const poor   = onu.filter(d => d.signal !== null && (d.signal as number) < -28).length;

  const getQuality = (rx: number | null) => {
    if (rx === null) return "unknown";
    if (rx > -25) return "excellent";
    if (rx > -28) return "good";
    return "poor";
  };

  return (
    <div className="animate-fade-in space-y-4">
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Среднее Rx",    value: validRx.length ? `${avg} дБм` : "—", icon: "ArrowDown",     color: "hsl(195 80% 50%)" },
          { label: "Среднее Tx",    value: validTx.length ? `+${avgTx} дБм` : "—", icon: "ArrowUp",    color: "hsl(142 76% 44%)" },
          { label: "Слабых линков", value: poor,                                    icon: "AlertTriangle", color: "hsl(38 92% 50%)" },
        ].map((k, i) => (
          <div key={i} className="bg-card border border-border rounded-lg p-4 card-hover">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">{k.label}</span>
              <Icon name={k.icon as IconName} size={14} style={{ color: k.color }} />
            </div>
            <div className="text-2xl font-semibold font-mono-data" style={{ color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Уровень сигнала ONU</span>
          {loading && <span className="text-xs text-muted-foreground animate-pulse">Обновление...</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {["ONU ID","SN","OLT","Rx (дБм)","Tx (дБм)","Уровень","Качество"].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {withSignal.map(d => (
                <tr key={d.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-mono-data text-xs font-semibold text-primary">{d.id}</td>
                  <td className="px-4 py-3 font-mono-data text-xs text-muted-foreground">{d.sn || d.mac || "—"}</td>
                  <td className="px-4 py-3 text-xs">{d.olt}</td>
                  <td className="px-4 py-3 min-w-44"><SignalBar value={d.signal} /></td>
                  <td className="px-4 py-3 font-mono-data text-xs" style={{ color: "hsl(195 80% 55%)" }}>
                    {d.tx !== null ? `+${d.tx}` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, (((d.signal ?? -35) + 35) / 20) * 100))}%` }} />
                    </div>
                  </td>
                  <td className="px-4 py-3"><QualityBadge q={getQuality(d.signal)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Events() {
  const [typeFilter, setTypeFilter] = useState("all");

  const filtered = EVENTS_DATA.filter(e => typeFilter === "all" || e.type === typeFilter);

  const typeColors: Record<string, string> = {
    error: "hsl(0 72% 60%)", warning: "hsl(38 92% 55%)", info: "hsl(210 100% 56%)"
  };
  const typeLabels: Record<string, string> = {
    error: "Ошибка", warning: "Предупреждение", info: "Информация"
  };

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex items-center gap-2">
        {[["all","Все"],["error","Ошибки"],["warning","Предупреждения"],["info","Информация"]].map(([val, label]) => (
          <button
            key={val}
            onClick={() => setTypeFilter(val)}
            className={`px-3 py-1.5 text-xs rounded-md font-medium transition-all ${typeFilter === val ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground"}`}
          >
            {label}
          </button>
        ))}
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} событий</span>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {["Время","Дата","Тип","Устройство","Сообщение"].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(ev => (
                <tr key={ev.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-mono-data text-xs">{ev.time}</td>
                  <td className="px-4 py-3 font-mono-data text-xs text-muted-foreground">{ev.date}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5">
                      <EventIcon type={ev.type} />
                      <span className="text-xs font-medium" style={{ color: typeColors[ev.type] }}>{typeLabels[ev.type]}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono-data text-xs font-semibold text-primary">{ev.device}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{ev.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Analytics({ onu }: { onu: OnuDevice[] }) {
  const allModels = [...new Set(onu.map(d => d.model))].filter(Boolean);
  const modelCounts = allModels.map(m => ({ name: m, count: onu.filter(d => d.model === m).length }));
  const maxCount = modelCounts.length ? Math.max(...modelCounts.map(m => m.count)) : 1;

  const weekData = [
    { day: "Пн", on: 9, off: 1 },
    { day: "Вт", on: 8, off: 2 },
    { day: "Ср", on: 10, off: 0 },
    { day: "Чт", on: 9, off: 1 },
    { day: "Пт", on: 7, off: 3 },
    { day: "Сб", on: 10, off: 0 },
    { day: "Вс", on: 8, off: 2 },
  ];
  const maxW = 10;

  return (
    <div className="animate-fade-in space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-5">Доступность за неделю</div>
          <div className="flex items-end gap-2 h-32 mb-3">
            {weekData.map(d => {
              const h = 128;
              const onH = Math.round((d.on / maxW) * h);
              const offH = Math.round((d.off / maxW) * h);
              return (
                <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                  <div className="flex flex-col-reverse w-full gap-0.5" style={{ height: h }}>
                    <div className="w-full rounded-t-sm" style={{ height: onH, background: "hsl(210 100% 56%)" }} />
                    {d.off > 0 && <div className="w-full rounded-t-sm" style={{ height: offH, background: "hsl(0 72% 51%)" }} />}
                  </div>
                  <span className="text-xs text-muted-foreground">{d.day}</span>
                </div>
              );
            })}
          </div>
          <div className="flex gap-4">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-2 h-2 rounded-sm bg-primary inline-block" />В сети
            </span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-2 h-2 rounded-sm inline-block" style={{ background: "hsl(0 72% 51%)" }} />Офлайн
            </span>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-5">Распределение по моделям</div>
          <div className="space-y-4">
            {modelCounts.map((m, i) => (
              <div key={m.name}>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-xs font-medium">{m.name}</span>
                  <span className="font-mono-data text-xs text-muted-foreground">{m.count} шт.</span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(m.count / maxCount) * 100}%`,
                      background: ["hsl(210 100% 56%)","hsl(195 80% 50%)","hsl(260 70% 60%)","hsl(142 76% 44%)"][i],
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-5">
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-4">Сводная статистика по OLT</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {["OLT","Устройств","В сети","Офлайн","Внимание","Ср. сигнал","Доступность"].map(h => (
                <th key={h} className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...new Set(onu.map(d => d.olt))].sort().map(olt => {
              const devices = onu.filter(d => d.olt === olt);
              const on   = devices.filter(d => d.status === "online").length;
              const off  = devices.filter(d => d.status === "offline").length;
              const warn = devices.filter(d => d.status === "warning").length;
              const sigs = devices.filter(d => d.signal !== null).map(d => d.signal as number);
              const avgSig = sigs.length ? (sigs.reduce((a,b) => a+b,0)/sigs.length).toFixed(1) : "—";
              const avail  = Math.round((on / devices.length) * 100);
              return (
                <tr key={olt} className="border-b border-border last:border-0 hover:bg-muted/20">
                  <td className="px-3 py-3 font-semibold text-sm">{olt}</td>
                  <td className="px-3 py-3 font-mono-data text-xs">{devices.length}</td>
                  <td className="px-3 py-3 font-mono-data text-xs" style={{ color: "hsl(142 76% 44%)" }}>{on}</td>
                  <td className="px-3 py-3 font-mono-data text-xs" style={{ color: "hsl(0 72% 60%)" }}>{off}</td>
                  <td className="px-3 py-3 font-mono-data text-xs" style={{ color: "hsl(38 92% 55%)" }}>{warn}</td>
                  <td className="px-3 py-3 font-mono-data text-xs text-muted-foreground">{avgSig} дБм</td>
                  <td className="px-3 py-3">
                    <span className="font-mono-data text-xs font-semibold" style={{ color: avail >= 80 ? "hsl(142 76% 44%)" : "hsl(38 92% 55%)" }}>{avail}%</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Toggle({ on, toggle }: { on: boolean; toggle: () => void }) {
  return (
    <button
      onClick={toggle}
      className="relative inline-flex h-5 w-9 rounded-full transition-colors shrink-0"
      style={{ background: on ? "hsl(210 100% 56%)" : "hsl(var(--secondary))" }}
    >
      <span
        className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform"
        style={{ transform: on ? "translateX(16px)" : "translateX(0)" }}
      />
    </button>
  );
}

function Settings({ onRefresh, loading, lastUpdated }: { onRefresh: () => void; loading: boolean; lastUpdated: Date | null }) {
  const [notifyOffline, setNotifyOffline]   = useState(true);
  const [notifyWeak, setNotifyWeak]         = useState(true);
  const [notifyRestore, setNotifyRestore]   = useState(false);
  const [threshold, setThreshold]           = useState("-27");
  const [interval, setIntervalVal]          = useState("60");

  return (
    <div className="animate-fade-in space-y-4 max-w-2xl">
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-4">Оповещения</div>
        <div className="space-y-1">
          {[
            { label: "Устройство офлайн",  desc: "Уведомление при потере связи с ONU",              on: notifyOffline,  toggle: () => setNotifyOffline(!notifyOffline) },
            { label: "Слабый сигнал",      desc: "Уведомление при падении уровня ниже порога",      on: notifyWeak,     toggle: () => setNotifyWeak(!notifyWeak) },
            { label: "Восстановление",     desc: "Уведомление при возвращении устройства в сеть",   on: notifyRestore,  toggle: () => setNotifyRestore(!notifyRestore) },
          ].map((item, i) => (
            <div key={i} className="flex items-center justify-between py-3 border-b border-border last:border-0">
              <div>
                <div className="text-sm font-medium">{item.label}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{item.desc}</div>
              </div>
              <Toggle on={item.on} toggle={item.toggle} />
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-5">
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-4">Параметры мониторинга</div>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground block mb-1.5">Порог слабого сигнала (дБм)</label>
            <input
              value={threshold}
              onChange={e => setThreshold(e.target.value)}
              className="bg-secondary border border-border rounded-md px-3 py-2 text-sm font-mono-data outline-none focus:border-primary/60 transition-colors w-40"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1.5">Интервал опроса (секунд)</label>
            <input
              value={interval}
              onChange={e => setIntervalVal(e.target.value)}
              className="bg-secondary border border-border rounded-md px-3 py-2 text-sm font-mono-data outline-none focus:border-primary/60 transition-colors w-40"
            />
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-5">
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-4">Информация о системе</div>
        <div className="grid grid-cols-2 gap-0">
          {[
            ["Версия ПО",             "1.0.0"],
            ["OLT",                   "CData GPON"],
            ["Последний опрос",       lastUpdated ? lastUpdated.toLocaleTimeString('ru-RU') : "Ожидание..."],
            ["Источник данных",       "SNMP v2c"],
          ].map(([k, v]) => (
            <div key={k} className="py-2.5 border-b border-border pr-4">
              <div className="text-xs text-muted-foreground">{k}</div>
              <div className="text-sm font-mono-data mt-0.5">{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <button className="bg-primary text-primary-foreground px-5 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity">
          Сохранить настройки
        </button>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-2 bg-secondary border border-border text-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
        >
          <Icon name="RefreshCw" size={14} className={loading ? "animate-spin" : ""} />
          {loading ? "Опрос OLT..." : "Обновить данные"}
        </button>
      </div>
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

export default function Index() {
  const [section, setSection]         = useState<Section>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [liveData, setLiveData]       = useState<PollResult | null>(null);
  const [loading, setLoading]         = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchOnu = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(ONU_POLL_URL);
      const data: PollResult = await res.json();
      setLiveData(data);
      setLastUpdated(new Date());
    } catch {
      // keep previous data on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOnu();
    const interval = setInterval(fetchOnu, 60000);
    return () => clearInterval(interval);
  }, [fetchOnu]);

  // Use live data if available, fall back to static demo
  const activeOnu: OnuDevice[] = liveData?.onu_list?.length
    ? liveData.onu_list
    : ONU_DATA.map(d => ({ ...d, index: d.id.replace('ONU-', ''), sn: '', tx: null }));

  const sectionTitles: Record<Section, string> = {
    dashboard: "Главная",
    devices:   "Устройства",
    signals:   "Сигналы",
    events:    "События",
    analytics: "Аналитика",
    settings:  "Настройки",
  };

  const online = activeOnu.filter(d => d.status === "online").length;
  const total  = activeOnu.length;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside
        className="flex flex-col border-r border-border transition-all duration-200 shrink-0"
        style={{ width: sidebarOpen ? 220 : 56, background: "hsl(var(--sidebar-background))" }}
      >
        {/* Logo */}
        <div className="h-14 flex items-center justify-between px-3 border-b border-border shrink-0">
          {sidebarOpen && (
            <div className="flex items-center gap-2 animate-fade-in min-w-0">
              <div className="w-6 h-6 rounded bg-primary flex items-center justify-center shrink-0">
                <Icon name="Wifi" size={12} className="text-primary-foreground" />
              </div>
              <span className="text-sm font-semibold tracking-tight truncate">ONU Monitor</span>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded-md hover:bg-sidebar-accent transition-colors text-muted-foreground hover:text-foreground shrink-0 ml-auto"
          >
            <Icon name={sidebarOpen ? "PanelLeftClose" : "PanelLeftOpen"} size={16} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2 space-y-0.5 overflow-hidden">
          {NAV_ITEMS.map(item => (
            <div
              key={item.id}
              className={`nav-item ${section === item.id ? "active" : ""}`}
              onClick={() => setSection(item.id as Section)}
              title={!sidebarOpen ? item.label : undefined}
            >
              <Icon name={item.icon as IconName} size={16} style={{ flexShrink: 0 }} />
              {sidebarOpen && <span className="animate-fade-in truncate">{item.label}</span>}
            </div>
          ))}
        </nav>

        {/* Online indicator */}
        <div className="p-3 border-t border-border shrink-0">
          {sidebarOpen ? (
            <div className="flex items-center gap-2 animate-fade-in">
              <span className="status-dot status-online" />
              <span className="text-xs text-muted-foreground">{online}/{total} онлайн</span>
            </div>
          ) : (
            <div className="flex justify-center">
              <span className="status-dot status-online" />
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="h-14 flex items-center justify-between px-6 border-b border-border bg-card/40 backdrop-blur-sm shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-base font-semibold">{sectionTitles[section]}</span>
            <span className="text-xs text-muted-foreground hidden sm:block">/ ONU Monitoring System</span>
          </div>
          <div className="flex items-center gap-4">
            {lastUpdated && (
              <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
                <Icon name="Clock" size={12} />
                <span className="font-mono-data">{lastUpdated.toLocaleTimeString('ru-RU')}</span>
              </div>
            )}
            <button
              onClick={fetchOnu}
              disabled={loading}
              title="Обновить данные"
              className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              <Icon name="RefreshCw" size={15} className={loading ? "animate-spin" : ""} />
            </button>
            <div className="flex items-center gap-1.5 bg-secondary rounded-md px-2.5 py-1.5">
              <span className="status-dot status-online" />
              <span className="text-xs font-semibold font-mono-data">{online}/{total}</span>
            </div>
            <button className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground relative">
              <Icon name="Bell" size={16} />
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-destructive" />
            </button>
          </div>
        </header>

        {/* Section content */}
        <main className="flex-1 overflow-y-auto p-6">
          {section === "dashboard"  && <Dashboard onu={activeOnu} loading={loading} />}
          {section === "devices"    && <Devices onu={activeOnu} loading={loading} />}
          {section === "signals"    && <Signals onu={activeOnu} loading={loading} />}
          {section === "events"     && <Events />}
          {section === "analytics"  && <Analytics onu={activeOnu} />}
          {section === "settings"   && <Settings onRefresh={fetchOnu} loading={loading} lastUpdated={lastUpdated} />}
        </main>
      </div>
    </div>
  );
}