import { useState, useEffect } from "react";
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
import PageHeader from "@/components/common/PageHeader";
import RealMikrotikCard from "@/components/RealMikrotikCard";
import { CORE_ROUTERS, generateCoreTraffic } from "@/lib/mock-data";

function fmtBytes(mbps: number) {
  if (mbps >= 1000) return `${(mbps / 1000).toFixed(2)} Гбит/с`;
  return `${mbps.toFixed(0)} Мбит/с`;
}

function fmtNumber(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function MetricRing({
  value,
  label,
  unit,
  color,
  size = 100,
}: {
  value: number;
  label: string;
  unit: string;
  color: string;
  size?: number;
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
          <div className="font-mono-data text-xl font-bold" style={{ color }}>
            {value}
            <span className="text-xs ml-0.5">{unit}</span>
          </div>
        </div>
      </div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

function PortRow({ port }: { port: typeof CORE_ROUTERS[0]["ports"][0] }) {
  const max = 10000;
  const inPct = Math.min(100, (port.trafficIn / max) * 100);
  const outPct = Math.min(100, (port.trafficOut / max) * 100);
  const statusColor =
    port.status === "up" ? "#22c55e" : port.status === "warning" ? "#f59e0b" : "#6b7280";

  return (
    <div className="grid grid-cols-12 gap-3 items-center py-2 px-3 hover:bg-secondary/40 rounded text-xs border-b border-border/50">
      <div className="col-span-2 flex items-center gap-2">
        <span className="relative flex">
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: statusColor, boxShadow: `0 0 8px ${statusColor}` }}
          />
          {port.status === "up" && (
            <span
              className="absolute inset-0 w-2 h-2 rounded-full animate-ping"
              style={{ background: statusColor, opacity: 0.4 }}
            />
          )}
        </span>
        <div>
          <div className="font-mono-data font-semibold">{port.name}</div>
          <div className="text-[9px] text-muted-foreground">{port.type} · {port.speed}G</div>
        </div>
      </div>

      <div className="col-span-3 truncate text-muted-foreground">
        {port.uplink && <span className="text-[9px] px-1 py-0.5 mr-1 rounded bg-primary/15 text-primary">UP</span>}
        {port.description}
      </div>

      <div className="col-span-3">
        <div className="flex items-center gap-1.5 mb-1">
          <Icon name="ArrowDown" size={10} className="text-blue-400" />
          <span className="font-mono-data text-[10px] text-blue-400 w-20">{fmtBytes(port.trafficIn)}</span>
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
        <div className="flex items-center gap-1.5">
          <Icon name="ArrowUp" size={10} className="text-purple-400" />
          <span className="font-mono-data text-[10px] text-purple-400 w-20">{fmtBytes(port.trafficOut)}</span>
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
        Ошибки: <span style={{ color: port.errors > 100 ? "#f59e0b" : "inherit" }}>{port.errors}</span>
      </div>

      <div className="col-span-2 flex justify-end gap-1">
        <button className="w-7 h-7 rounded hover:bg-secondary text-muted-foreground" title="График"><Icon name="LineChart" size={12} /></button>
        <button className="w-7 h-7 rounded hover:bg-secondary text-muted-foreground" title="Shutdown"><Icon name="Power" size={12} /></button>
        <button className="w-7 h-7 rounded hover:bg-secondary text-muted-foreground" title="Подробнее"><Icon name="MoreHorizontal" size={12} /></button>
      </div>
    </div>
  );
}

function CoreRouterCard({ router }: { router: typeof CORE_ROUTERS[0] }) {
  const [traffic, setTraffic] = useState(() => generateCoreTraffic(30));
  const [tab, setTab] = useState<"ports" | "performance">("ports");

  // Live update every 3s
  useEffect(() => {
    const t = setInterval(() => setTraffic(generateCoreTraffic(30)), 3000);
    return () => clearInterval(t);
  }, []);

  const totalIn = router.ports.reduce((s, p) => s + p.trafficIn, 0);
  const totalOut = router.ports.reduce((s, p) => s + p.trafficOut, 0);
  const portsUp = router.ports.filter((p) => p.status === "up").length;
  const totalErrors = router.ports.reduce((s, p) => s + p.errors, 0);

  const statusGlow =
    router.status === "online" ? "#22c55e" : router.status === "warning" ? "#f59e0b" : "#ef4444";

  return (
    <div
      className="bg-card border border-border rounded-xl overflow-hidden relative"
      style={{
        boxShadow: `0 0 0 1px ${statusGlow}22, 0 0 30px ${statusGlow}15`,
      }}
    >
      {/* Animated gradient background top */}
      <div
        className="absolute top-0 left-0 right-0 h-1"
        style={{
          background: `linear-gradient(90deg, ${statusGlow}00, ${statusGlow}, ${statusGlow}00)`,
          backgroundSize: "200% 100%",
          animation: "shimmer 3s linear infinite",
        }}
      />

      <div className="grid grid-cols-12 gap-0">
        {/* PHOTO */}
        <div className="col-span-12 lg:col-span-4 relative overflow-hidden">
          <div className="aspect-[4/3] lg:aspect-auto lg:h-full relative">
            <img
              src={router.photo}
              alt={router.name}
              className="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
            />
            {/* Overlay gradient */}
            <div
              className="absolute inset-0"
              style={{
                background: "linear-gradient(135deg, transparent 30%, rgba(10,14,20,0.85) 100%)",
              }}
            />
            {/* Live indicator */}
            <div className="absolute top-3 left-3 flex items-center gap-2 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur border border-white/10">
              <span className="relative flex">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: statusGlow, boxShadow: `0 0 8px ${statusGlow}` }}
                />
                <span
                  className="absolute w-2 h-2 rounded-full animate-ping"
                  style={{ background: statusGlow, opacity: 0.5 }}
                />
              </span>
              <span className="text-[10px] uppercase tracking-wider font-semibold text-white">
                {router.status === "online" ? "LIVE" : router.status === "warning" ? "ALERT" : "DOWN"}
              </span>
            </div>
            {/* Vendor badge */}
            <div className="absolute top-3 right-3 px-2 py-1 rounded bg-black/60 backdrop-blur text-white text-[10px] font-bold tracking-wide">
              {router.vendor}
            </div>
            {/* Bottom info on photo */}
            <div className="absolute bottom-0 left-0 right-0 p-4">
              <div className="text-white/60 text-[10px] uppercase tracking-wider mb-1">{router.role}</div>
              <h2 className="text-2xl font-bold text-white mb-1">{router.name}</h2>
              <div className="text-white/70 text-xs">{router.model}</div>
            </div>
          </div>
        </div>

        {/* CONTENT */}
        <div className="col-span-12 lg:col-span-8 p-5">
          {/* Top: location & quick info */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <Icon name="MapPin" size={12} />
                <span>{router.location}</span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-muted-foreground">IP: <span className="font-mono-data text-foreground">{router.ip}</span></span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">FW: <span className="font-mono-data text-foreground">{router.firmware}</span></span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">Uptime: <span className="font-mono-data text-foreground">{router.uptime}</span></span>
              </div>
            </div>
            <div className="flex gap-1.5">
              <button className="w-8 h-8 rounded-md bg-secondary hover:bg-accent text-muted-foreground flex items-center justify-center" title="Терминал">
                <Icon name="Terminal" size={14} />
              </button>
              <button className="w-8 h-8 rounded-md bg-secondary hover:bg-accent text-muted-foreground flex items-center justify-center" title="Настройки">
                <Icon name="Settings" size={14} />
              </button>
              <button className="w-8 h-8 rounded-md bg-destructive/15 hover:bg-destructive/25 text-destructive flex items-center justify-center" title="Перезагрузка">
                <Icon name="RotateCw" size={14} />
              </button>
            </div>
          </div>

          {/* RESOURCE RINGS */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
            <MetricRing value={router.cpu} label="CPU" unit="%" color={router.cpu > 70 ? "#ef4444" : router.cpu > 50 ? "#f59e0b" : "#3b82f6"} size={88} />
            <MetricRing value={router.ram} label="RAM" unit="%" color={router.ram > 75 ? "#ef4444" : router.ram > 60 ? "#f59e0b" : "#a855f7"} size={88} />
            <MetricRing value={router.storage} label="Диск" unit="%" color="#10b981" size={88} />
            <MetricRing value={router.temperature} label="Темп." unit="°C" color={router.temperature > 60 ? "#ef4444" : router.temperature > 50 ? "#f59e0b" : "#06b6d4"} size={88} />
            <MetricRing value={router.powerLoad} label="Питание" unit="%" color="#f59e0b" size={88} />
          </div>

          {/* TOTAL TRAFFIC HERO */}
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
                <span className="text-[10px] uppercase tracking-wider text-blue-300">Входящий трафик</span>
              </div>
              <div className="font-mono-data text-2xl font-bold text-blue-300">{fmtBytes(totalIn)}</div>
              <div className="text-[10px] text-blue-300/60">по {router.ports.length} портам</div>
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
                <span className="text-[10px] uppercase tracking-wider text-purple-300">Исходящий трафик</span>
              </div>
              <div className="font-mono-data text-2xl font-bold text-purple-300">{fmtBytes(totalOut)}</div>
              <div className="text-[10px] text-purple-300/60">{portsUp}/{router.ports.length} портов активно</div>
              <div className="absolute right-2 top-2 opacity-20">
                <Icon name="Upload" size={48} className="text-purple-400" />
              </div>
            </div>
          </div>

          {/* Quick Stats Row */}
          <div className="grid grid-cols-4 gap-2 mb-5">
            {[
              { l: "BGP пиров", v: router.bgpPeers, i: "Globe", c: "#22c55e" },
              { l: "OSPF", v: router.ospfNeighbors, i: "Network", c: "#06b6d4" },
              { l: "IPv4 маршр.", v: fmtNumber(router.routesIpv4), i: "Route", c: "#3b82f6" },
              { l: "Ошибки", v: totalErrors, i: "AlertCircle", c: totalErrors > 1000 ? "#ef4444" : "#6b7280" },
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

          {/* TABS */}
          <div className="flex gap-1 border-b border-border mb-3">
            {[
              { v: "ports" as const, label: "Порты и трафик", icon: "Cable" },
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
            <div className="space-y-0 max-h-[280px] overflow-y-auto pr-1">
              <div className="grid grid-cols-12 gap-3 px-3 pb-2 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                <div className="col-span-2">Порт</div>
                <div className="col-span-3">Назначение</div>
                <div className="col-span-3">Трафик IN/OUT</div>
                <div className="col-span-2">Состояние</div>
                <div className="col-span-2 text-right">Действия</div>
              </div>
              {router.ports.map((p) => (
                <PortRow key={p.id} port={p} />
              ))}
            </div>
          )}

          {tab === "performance" && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                Трафик за 30 минут (LIVE)
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={traffic}>
                  <defs>
                    <linearGradient id={`g-in-${router.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id={`g-out-${router.id}`} x1="0" y1="0" x2="0" y2="1">
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
                  <Area
                    type="monotone"
                    dataKey="in"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fill={`url(#g-in-${router.id})`}
                    name="Входящий, Мбит/с"
                  />
                  <Area
                    type="monotone"
                    dataKey="out"
                    stroke="#a855f7"
                    strokeWidth={2}
                    fill={`url(#g-out-${router.id})`}
                    name="Исходящий, Мбит/с"
                  />
                </AreaChart>
              </ResponsiveContainer>

              <div className="grid grid-cols-2 gap-3 mt-4">
                <div className="bg-secondary/40 rounded-md p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Блоки питания</div>
                  <div className="space-y-2">
                    {router.powerSupplies.map((ps) => (
                      <div key={ps.id} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <Icon name="Plug" size={12} style={{ color: ps.status === "ok" ? "#22c55e" : "#ef4444" }} />
                          <span>PSU-{ps.id}</span>
                        </div>
                        <div className="font-mono-data text-xs">
                          <span style={{ color: ps.status === "ok" ? "#22c55e" : "#ef4444" }}>
                            {ps.status === "ok" ? "✓ OK" : "✗ FAIL"}
                          </span>
                          <span className="text-muted-foreground ml-2">{ps.power}W</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-secondary/40 rounded-md p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Охлаждение</div>
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Icon name="Fan" size={28} className="text-cyan-400 animate-spin" style={{ animationDuration: "2s" }} />
                    </div>
                    <div>
                      <div className="font-mono-data text-lg font-bold text-cyan-400">{router.fanSpeed}</div>
                      <div className="text-[10px] text-muted-foreground">RPM · {router.temperature}°C</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CoreRouters() {
  const totalInAll = CORE_ROUTERS.reduce(
    (s, r) => s + r.ports.reduce((a, p) => a + p.trafficIn, 0),
    0
  );
  const totalOutAll = CORE_ROUTERS.reduce(
    (s, r) => s + r.ports.reduce((a, p) => a + p.trafficOut, 0),
    0
  );
  const totalPorts = CORE_ROUTERS.reduce((s, r) => s + r.ports.length, 0);
  const totalUp = CORE_ROUTERS.reduce(
    (s, r) => s + r.ports.filter((p) => p.status === "up").length,
    0
  );

  return (
    <div className="space-y-5 animate-fade-in">
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      <PageHeader
        title="Головные роутеры"
        description="Мониторинг ядра сети в режиме реального времени"
        actions={
          <div className="flex gap-2">
            <button className="h-9 px-3 rounded-md bg-secondary border border-border text-sm flex items-center gap-2">
              <Icon name="Maximize2" size={14} />
              На весь экран
            </button>
            <button className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2">
              <Icon name="Plus" size={14} />
              Добавить роутер
            </button>
          </div>
        }
      />

      {/* GLOBAL HERO STATS */}
      <div
        className="rounded-xl p-5 relative overflow-hidden border border-border"
        style={{
          background:
            "radial-gradient(ellipse at top left, hsl(217 91% 30% / 0.25), transparent 60%), radial-gradient(ellipse at bottom right, hsl(280 70% 30% / 0.25), transparent 60%), hsl(220 14% 9%)",
        }}
      >
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 relative z-10">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
              <Icon name="Server" size={11} />
              Активных роутеров
            </div>
            <div className="font-mono-data text-3xl font-bold">{CORE_ROUTERS.length}</div>
            <div className="text-[10px] text-green-400 mt-1">
              <span className="status-dot status-online inline-block mr-1" />
              {CORE_ROUTERS.filter((r) => r.status === "online").length} онлайн
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-blue-300/80 mb-1 flex items-center gap-1">
              <Icon name="ArrowDown" size={11} />
              Общий входящий
            </div>
            <div className="font-mono-data text-3xl font-bold text-blue-300">{fmtBytes(totalInAll)}</div>
            <div className="text-[10px] text-blue-300/60 mt-1">все интерфейсы</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-purple-300/80 mb-1 flex items-center gap-1">
              <Icon name="ArrowUp" size={11} />
              Общий исходящий
            </div>
            <div className="font-mono-data text-3xl font-bold text-purple-300">{fmtBytes(totalOutAll)}</div>
            <div className="text-[10px] text-purple-300/60 mt-1">все интерфейсы</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
              <Icon name="Cable" size={11} />
              Активных портов
            </div>
            <div className="font-mono-data text-3xl font-bold">
              {totalUp}<span className="text-muted-foreground text-lg">/{totalPorts}</span>
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">
              {Math.round((totalUp / totalPorts) * 100)}% загружено
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
              <Icon name="TrendingUp" size={11} />
              Суммарная пропускная
            </div>
            <div className="font-mono-data text-3xl font-bold text-emerald-400">
              {fmtBytes(totalInAll + totalOutAll)}
            </div>
            <div className="text-[10px] text-emerald-400/60 mt-1">пиковая в моменте</div>
          </div>
        </div>
      </div>

      {/* REAL MIKROTIK */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="relative flex">
            <span className="w-2 h-2 rounded-full bg-emerald-500" style={{ boxShadow: "0 0 8px #22c55e" }} />
            <span className="absolute w-2 h-2 rounded-full bg-emerald-500 animate-ping opacity-50" />
          </span>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-emerald-400">
            Реальное оборудование · Live API
          </h2>
        </div>
        <RealMikrotikCard />
      </div>

      {/* DEMO ROUTER CARDS */}
      <div>
        <div className="flex items-center gap-2 mb-3 mt-8">
          <Icon name="Box" size={14} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Демо-карточки (мок-данные)
          </h2>
        </div>
        <div className="space-y-5">
          {CORE_ROUTERS.map((r) => (
            <CoreRouterCard key={r.id} router={r} />
          ))}
        </div>
      </div>
    </div>
  );
}