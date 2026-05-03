import { useEffect, useState, useRef } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
} from "recharts";
import Icon from "@/components/ui/icon";
import { fetchMikrotik, fmtBytes, fmtBytesExact, fmtBps, parseUptimeFull, MikrotikData, MikrotikInterface } from "@/lib/mikrotik-api";

const REAL_PHOTO = "https://cdn.poehali.dev/projects/4e28f997-118c-46af-9ba3-05afe46c8699/files/63330f23-43fd-46d3-89b1-914eaa853751.jpg";

function MetricRing({
  value,
  label,
  unit,
  color,
  size = 88,
  precision = 1,
  subText,
}: {
  value: number;
  label: string;
  unit: string;
  color: string;
  size?: number;
  precision?: number;
  subText?: string;
}) {
  const data = [{ name: label, value, fill: color }];
  return (
    <div className="relative flex flex-col items-center" style={{ width: size }}>
      <div style={{ width: size, height: size }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%"
            cy="50%"
            innerRadius="72%"
            outerRadius="100%"
            startAngle={90}
            endAngle={-270}
            data={data}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
            <RadialBar background={{ fill: "#1e2530" }} dataKey="value" cornerRadius={6} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ width: size, height: size }}>
          <div className="font-mono-data text-lg font-bold leading-none" style={{ color }}>
            {value.toFixed(precision)}
            <span className="text-[9px] ml-0.5">{unit}</span>
          </div>
          {subText && <div className="text-[8px] text-muted-foreground mt-0.5 font-mono-data">{subText}</div>}
        </div>
      </div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

function PortRow({
  iface,
  speedIn,
  speedOut,
}: {
  iface: MikrotikInterface;
  speedIn: number;
  speedOut: number;
}) {
  const status = iface.disabled ? "disabled" : iface.running ? "up" : "down";
  const statusColor = status === "up" ? "#22c55e" : status === "disabled" ? "#6b7280" : "#ef4444";
  const max = 1_000_000_000;
  const inPct = Math.min(100, (speedIn / max) * 100);
  const outPct = Math.min(100, (speedOut / max) * 100);
  const isUplink =
    iface.comment?.toLowerCase().includes("uplink") ||
    iface.comment?.toLowerCase().includes("rt-") ||
    iface.name.toLowerCase().startsWith("ether1");

  return (
    <div className="grid grid-cols-12 gap-3 items-center py-2 px-3 hover:bg-secondary/40 rounded text-xs border-b border-border/50">
      <div className="col-span-2 flex items-center gap-2">
        <span className="relative flex">
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: statusColor, boxShadow: `0 0 8px ${statusColor}` }}
          />
          {status === "up" && (
            <span
              className="absolute inset-0 w-2 h-2 rounded-full animate-ping"
              style={{ background: statusColor, opacity: 0.4 }}
            />
          )}
        </span>
        <div>
          <div className="font-mono-data font-semibold">{iface.name}</div>
          <div className="text-[9px] text-muted-foreground">{iface.type}</div>
        </div>
      </div>

      <div className="col-span-3 truncate text-muted-foreground">
        {isUplink && (
          <span className="text-[9px] px-1 py-0.5 mr-1 rounded bg-primary/15 text-primary">UP</span>
        )}
        {iface.comment || "—"}
      </div>

      <div className="col-span-3">
        <div className="flex items-center gap-1.5 mb-1" title={`${speedIn.toFixed(0)} бит/с`}>
          <Icon name="ArrowDown" size={10} className="text-blue-400" />
          <span className="font-mono-data text-[10px] text-blue-400 w-28 truncate">{fmtBps(speedIn, 3)}</span>
          <div className="flex-1 h-1 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${inPct}%`,
                background: "linear-gradient(90deg, #1e40af, #3b82f6, #60a5fa)",
                boxShadow: "0 0 6px #3b82f6",
              }}
            />
          </div>
        </div>
        <div className="flex items-center gap-1.5" title={`${speedOut.toFixed(0)} бит/с`}>
          <Icon name="ArrowUp" size={10} className="text-purple-400" />
          <span className="font-mono-data text-[10px] text-purple-400 w-28 truncate">{fmtBps(speedOut, 3)}</span>
          <div className="flex-1 h-1 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${outPct}%`,
                background: "linear-gradient(90deg, #6b21a8, #a855f7, #c084fc)",
                boxShadow: "0 0 6px #a855f7",
              }}
            />
          </div>
        </div>
      </div>

      <div className="col-span-2 font-mono-data text-[10px] text-muted-foreground">
        <div title={fmtBytesExact(iface.rx_bytes)}>Σ ↓ {fmtBytes(iface.rx_bytes, 3)}</div>
        <div title={fmtBytesExact(iface.tx_bytes)}>Σ ↑ {fmtBytes(iface.tx_bytes, 3)}</div>
        <div className="text-muted-foreground/60 text-[9px] mt-0.5">
          {iface.rx_packets.toLocaleString("ru-RU")} / {iface.tx_packets.toLocaleString("ru-RU")} пак.
        </div>
      </div>

      <div className="col-span-2 font-mono-data text-[10px] text-muted-foreground">
        Ошибки:{" "}
        <span style={{ color: iface.rx_errors + iface.tx_errors > 100 ? "#f59e0b" : "inherit" }}>
          {iface.rx_errors + iface.tx_errors}
        </span>
      </div>
    </div>
  );
}

export default function RealMikrotikCard() {
  const [data, setData] = useState<MikrotikData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"ports" | "performance">("ports");
  const [trafficHistory, setTrafficHistory] = useState<{ time: string; in: number; out: number }[]>([]);
  const prevSnapshot = useRef<{ ts: number; data: MikrotikData | null }>({ ts: 0, data: null });
  const [portSpeeds, setPortSpeeds] = useState<Record<string, { in: number; out: number }>>({});

  const load = async () => {
    try {
      const json = await fetchMikrotik();
      if (!json.success) {
        setErr(json.message || json.error || "Ошибка");
        setLoading(false);
        return;
      }

      // Считаем скорость в bps по разнице с прошлым опросом
      const now = Date.now();
      if (prevSnapshot.current.data && prevSnapshot.current.ts) {
        const dt = (now - prevSnapshot.current.ts) / 1000;
        if (dt > 0) {
          const speeds: Record<string, { in: number; out: number }> = {};
          let totalIn = 0;
          let totalOut = 0;
          json.interfaces.list.forEach((cur) => {
            const prev = prevSnapshot.current.data!.interfaces.list.find((p) => p.name === cur.name);
            if (prev) {
              const inBps = Math.max(0, ((cur.rx_bytes - prev.rx_bytes) * 8) / dt);
              const outBps = Math.max(0, ((cur.tx_bytes - prev.tx_bytes) * 8) / dt);
              speeds[cur.name] = { in: inBps, out: outBps };
              if (cur.running) {
                totalIn += inBps;
                totalOut += outBps;
              }
            }
          });
          setPortSpeeds(speeds);
          setTrafficHistory((h) => [
            ...h.slice(-29),
            {
              time: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
              in: Number((totalIn / 1_000_000).toFixed(3)),
              out: Number((totalOut / 1_000_000).toFixed(3)),
            },
          ]);
        }
      }
      prevSnapshot.current = { ts: now, data: json };

      setData(json);
      setErr(null);
      setLoading(false);
    } catch (e) {
      setErr(String(e));
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 flex items-center justify-center">
        <Icon name="Loader" size={20} className="animate-spin mr-2 text-primary" />
        <span className="text-muted-foreground">Подключаюсь к MikroTik по API-SSL...</span>
      </div>
    );
  }

  if (err || !data) {
    return (
      <div className="bg-card border border-destructive/30 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-2">
          <Icon name="AlertCircle" size={20} className="text-destructive" />
          <h3 className="text-lg font-semibold">MikroTik недоступен</h3>
        </div>
        <p className="text-sm text-muted-foreground">{err}</p>
        <button onClick={load} className="mt-3 h-8 px-3 bg-secondary border border-border rounded text-xs">
          Повторить
        </button>
      </div>
    );
  }

  const totalInBps = Object.values(portSpeeds).reduce((s, p) => s + p.in, 0);
  const totalOutBps = Object.values(portSpeeds).reduce((s, p) => s + p.out, 0);
  const portsUp = data.interfaces.running;
  const totalErrors = data.interfaces.list.reduce((s, p) => s + p.rx_errors + p.tx_errors, 0);
  const totalIn = data.interfaces.list.reduce((s, p) => s + p.rx_bytes, 0);
  const totalOut = data.interfaces.list.reduce((s, p) => s + p.tx_bytes, 0);
  const totalPackets = data.interfaces.list.reduce((s, p) => s + p.rx_packets + p.tx_packets, 0);
  const uptime = parseUptimeFull(data.system.uptime);
  const tempC = parseFloat(data.health.temperature || "0");
  const voltageV = parseFloat(data.health.voltage || "0");

  return (
    <div
      className="bg-card border border-border rounded-xl overflow-hidden relative"
      style={{ boxShadow: "0 0 0 1px #22c55e22, 0 0 30px #22c55e15" }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-1"
        style={{
          background: "linear-gradient(90deg, #22c55e00, #22c55e, #22c55e00)",
          backgroundSize: "200% 100%",
          animation: "shimmer 3s linear infinite",
        }}
      />

      <div className="grid grid-cols-12 gap-0">
        <div className="col-span-12 lg:col-span-4 relative overflow-hidden">
          <div className="aspect-[4/3] lg:aspect-auto lg:h-full relative">
            <img src={REAL_PHOTO} alt={data.identity.name} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
            <div
              className="absolute inset-0"
              style={{ background: "linear-gradient(135deg, transparent 30%, rgba(10,14,20,0.85) 100%)" }}
            />
            <div className="absolute top-3 left-3 flex items-center gap-2 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur border border-white/10">
              <span className="relative flex">
                <span className="w-2 h-2 rounded-full" style={{ background: "#22c55e", boxShadow: "0 0 8px #22c55e" }} />
                <span className="absolute w-2 h-2 rounded-full animate-ping" style={{ background: "#22c55e", opacity: 0.5 }} />
              </span>
              <span className="text-[10px] uppercase tracking-wider font-semibold text-white">REAL · LIVE</span>
            </div>
            <div className="absolute top-3 right-3 px-2 py-1 rounded bg-emerald-500/30 backdrop-blur text-white text-[10px] font-bold tracking-wide border border-emerald-400/40">
              MIKROTIK
            </div>
            <div className="absolute bottom-0 left-0 right-0 p-4">
              <div className="text-emerald-300/80 text-[10px] uppercase tracking-wider mb-1">Магистральный · BGP/OSPF</div>
              <h2 className="text-2xl font-bold text-white mb-1">{data.identity.name}</h2>
              <div className="text-white/70 text-xs">
                {data.routerboard.model} · {data.system.architecture.toUpperCase()}
              </div>
            </div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-8 p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <Icon name="MapPin" size={12} />
                <span>ArtTelecom Core · {data.host}</span>
              </div>
              <div className="flex items-center gap-3 text-xs flex-wrap">
                <span className="text-muted-foreground">
                  RouterOS: <span className="font-mono-data text-foreground">{data.system.version}</span>
                </span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">
                  S/N: <span className="font-mono-data text-foreground">{data.routerboard.serial}</span>
                </span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground" title={`Точно: ${data.system.uptime}`}>
                  Uptime: <span className="font-mono-data text-foreground">{uptime.pretty}</span>
                </span>
              </div>
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={load}
                className="w-8 h-8 rounded-md bg-secondary hover:bg-accent text-muted-foreground flex items-center justify-center"
                title="Обновить"
              >
                <Icon name="RefreshCw" size={14} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
            <MetricRing
              value={data.resources.cpu_load}
              label="CPU"
              unit="%"
              precision={0}
              subText={`${data.resources.cpu_count}×${data.resources.cpu_frequency}MHz`}
              color={data.resources.cpu_load > 70 ? "#ef4444" : data.resources.cpu_load > 50 ? "#f59e0b" : "#3b82f6"}
            />
            <MetricRing
              value={data.resources.memory_pct}
              label="RAM"
              unit="%"
              precision={2}
              subText={`${data.resources.memory_used_mb.toFixed(1)}/${data.resources.memory_total_mb.toFixed(0)}МБ`}
              color={data.resources.memory_pct > 75 ? "#ef4444" : data.resources.memory_pct > 60 ? "#f59e0b" : "#a855f7"}
            />
            <MetricRing
              value={data.resources.storage_pct}
              label="Диск"
              unit="%"
              precision={2}
              subText={`${data.resources.storage_used_mb.toFixed(1)}/${data.resources.storage_total_mb.toFixed(0)}МБ`}
              color="#10b981"
            />
            <MetricRing
              value={tempC}
              label="Темп."
              unit="°C"
              precision={1}
              color={tempC > 60 ? "#ef4444" : "#06b6d4"}
            />
            <MetricRing
              value={voltageV}
              label="Питание"
              unit="В"
              precision={1}
              color="#f59e0b"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div
              className="rounded-lg p-3 relative overflow-hidden"
              style={{
                background: "linear-gradient(135deg, hsl(217 91% 25% / 0.4), hsl(217 91% 35% / 0.15))",
                border: "1px solid hsl(217 91% 60% / 0.3)",
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <div className="w-7 h-7 rounded-full bg-blue-500/30 flex items-center justify-center">
                  <Icon name="ArrowDown" size={14} className="text-blue-300" />
                </div>
                <span className="text-[10px] uppercase tracking-wider text-blue-300">Скорость входящего</span>
              </div>
              <div className="font-mono-data text-2xl font-bold text-blue-300" title={`${totalInBps.toFixed(0)} бит/с`}>
                {fmtBps(totalInBps, 3)}
              </div>
              <div className="text-[10px] text-blue-300/70" title={fmtBytesExact(totalIn)}>
                Σ скачано: <span className="font-mono-data">{fmtBytes(totalIn, 3)}</span>
              </div>
              <div className="text-[9px] text-blue-300/50 font-mono-data mt-0.5">
                {fmtBytesExact(totalIn)}
              </div>
              <div className="absolute right-2 top-2 opacity-20">
                <Icon name="Download" size={48} className="text-blue-400" />
              </div>
            </div>
            <div
              className="rounded-lg p-3 relative overflow-hidden"
              style={{
                background: "linear-gradient(135deg, hsl(280 70% 25% / 0.4), hsl(280 70% 35% / 0.15))",
                border: "1px solid hsl(280 70% 60% / 0.3)",
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <div className="w-7 h-7 rounded-full bg-purple-500/30 flex items-center justify-center">
                  <Icon name="ArrowUp" size={14} className="text-purple-300" />
                </div>
                <span className="text-[10px] uppercase tracking-wider text-purple-300">Скорость исходящего</span>
              </div>
              <div className="font-mono-data text-2xl font-bold text-purple-300" title={`${totalOutBps.toFixed(0)} бит/с`}>
                {fmtBps(totalOutBps, 3)}
              </div>
              <div className="text-[10px] text-purple-300/70" title={fmtBytesExact(totalOut)}>
                Σ отдано: <span className="font-mono-data">{fmtBytes(totalOut, 3)}</span>
              </div>
              <div className="text-[9px] text-purple-300/50 font-mono-data mt-0.5">
                {fmtBytesExact(totalOut)} · {portsUp}/{data.interfaces.count}
              </div>
              <div className="absolute right-2 top-2 opacity-20">
                <Icon name="Upload" size={48} className="text-purple-400" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 mb-5">
            {[
              { l: "Интерфейсы", v: `${portsUp}/${data.interfaces.count}`, i: "Cable", c: "#22c55e" },
              { l: "BGP active", v: data.routing.bgp_active, i: "Globe", c: "#06b6d4" },
              { l: "Маршруты", v: data.routing.routes_count.toLocaleString("ru-RU"), i: "Route", c: "#3b82f6" },
              {
                l: "Ошибки",
                v: totalErrors,
                i: "AlertCircle",
                c: totalErrors > 1000 ? "#ef4444" : "#6b7280",
              },
            ].map((s) => (
              <div key={s.l} className="bg-secondary/40 rounded-md p-2 flex items-center gap-2">
                <Icon name={s.i} size={14} style={{ color: s.c }} />
                <div>
                  <div className="font-mono-data text-sm font-semibold">{s.v}</div>
                  <div className="text-[9px] text-muted-foreground uppercase">{s.l}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-1 border-b border-border mb-3">
            {[
              { v: "ports" as const, label: `Порты (${data.interfaces.count})`, icon: "Cable" },
              { v: "performance" as const, label: "Производительность", icon: "Activity" },
            ].map((t) => (
              <button
                key={t.v}
                onClick={() => setTab(t.v)}
                className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px flex items-center gap-1.5 ${
                  tab === t.v
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon name={t.icon} size={12} />
                {t.label}
              </button>
            ))}
          </div>

          {tab === "ports" && (
            <div className="space-y-0 max-h-[400px] overflow-y-auto pr-1">
              <div className="grid grid-cols-12 gap-3 px-3 pb-2 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                <div className="col-span-2">Порт</div>
                <div className="col-span-3">Описание</div>
                <div className="col-span-3">Скорость IN/OUT</div>
                <div className="col-span-2">Накоплено</div>
                <div className="col-span-2">Состояние</div>
              </div>
              {data.interfaces.list
                .filter((p) => !p.disabled)
                .sort((a, b) => (b.running ? 1 : 0) - (a.running ? 1 : 0))
                .map((p) => (
                  <PortRow
                    key={p.name}
                    iface={p}
                    speedIn={portSpeeds[p.name]?.in ?? 0}
                    speedOut={portSpeeds[p.name]?.out ?? 0}
                  />
                ))}
            </div>
          )}

          {tab === "performance" && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                Трафик в реальном времени (опрос каждые 5 сек)
              </div>
              {trafficHistory.length < 2 ? (
                <div className="h-[200px] flex items-center justify-center text-xs text-muted-foreground">
                  Сбор данных... первые точки появятся через 5-10 секунд
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={trafficHistory}>
                    <defs>
                      <linearGradient id="g-real-in" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="g-real-out" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#a855f7" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#a855f7" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 12% 18%)" />
                    <XAxis dataKey="time" stroke="hsl(215 14% 50%)" fontSize={10} />
                    <YAxis stroke="hsl(215 14% 50%)" fontSize={10} />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(220 14% 11%)",
                        border: "1px solid hsl(220 12% 18%)",
                        borderRadius: 6,
                      }}
                    />
                    <Area type="monotone" dataKey="in" stroke="#3b82f6" strokeWidth={2} fill="url(#g-real-in)" name="↓ Мбит/с" />
                    <Area type="monotone" dataKey="out" stroke="#a855f7" strokeWidth={2} fill="url(#g-real-out)" name="↑ Мбит/с" />
                  </AreaChart>
                </ResponsiveContainer>
              )}

              <div className="grid grid-cols-3 gap-3 mt-4">
                <div className="bg-secondary/40 rounded-md p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">CPU</div>
                  <div className="font-mono-data text-base">
                    {data.resources.cpu_count}× {data.resources.cpu_frequency} МГц
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    Загрузка: <span className="font-mono-data">{data.resources.cpu_load}%</span>
                  </div>
                </div>
                <div className="bg-secondary/40 rounded-md p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">RAM</div>
                  <div className="font-mono-data text-base">
                    {data.resources.memory_used_mb.toFixed(2)} / {data.resources.memory_total_mb.toFixed(2)} МБ
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1 font-mono-data">
                    {data.resources.memory_pct.toFixed(2)}%
                  </div>
                </div>
                <div className="bg-secondary/40 rounded-md p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Диск</div>
                  <div className="font-mono-data text-base">
                    {data.resources.storage_used_mb.toFixed(2)} / {data.resources.storage_total_mb.toFixed(2)} МБ
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1 font-mono-data">
                    {data.resources.storage_pct.toFixed(2)}%
                  </div>
                </div>
                <div className="bg-secondary/40 rounded-md p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Температура</div>
                  <div className="font-mono-data text-base">{tempC.toFixed(1)} °C</div>
                </div>
                <div className="bg-secondary/40 rounded-md p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Питание</div>
                  <div className="font-mono-data text-base">{voltageV.toFixed(2)} В</div>
                </div>
                <div className="bg-secondary/40 rounded-md p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Пакеты</div>
                  <div className="font-mono-data text-base">{totalPackets.toLocaleString("ru-RU")}</div>
                  <div className="text-[10px] text-muted-foreground mt-1">всего IN+OUT</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}