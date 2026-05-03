import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { Link } from "react-router-dom";
import Icon from "@/components/ui/icon";
import KpiCard from "@/components/common/KpiCard";
import StatusBadge from "@/components/common/StatusBadge";
import SignalIndicator from "@/components/common/SignalIndicator";
import PageHeader from "@/components/common/PageHeader";
import {
  ONUS,
  OLTS,
  EVENTS,
  generateOnuStatusHistory,
  generateTrafficHistory,
} from "@/lib/mock-data";

const statusHistory = generateOnuStatusHistory(24);
const trafficHistory = generateTrafficHistory(24);

export default function Dashboard() {
  const total = ONUS.length;
  const online = ONUS.filter((o) => o.status === "online").length;
  const warning = ONUS.filter((o) => o.status === "warning").length;
  const offline = ONUS.filter((o) => o.status === "offline" || o.status === "los").length;

  const distribution = [
    { name: "В сети", value: online, color: "hsl(142 76% 44%)" },
    { name: "Внимание", value: warning, color: "hsl(38 92% 50%)" },
    { name: "Офлайн", value: offline, color: "hsl(0 72% 51%)" },
  ];

  const problematic = [...ONUS]
    .filter((o) => o.rxPower !== null)
    .sort((a, b) => (a.rxPower ?? 0) - (b.rxPower ?? 0))
    .slice(0, 5);

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Дашборд"
        description="Обзор состояния PON-сети в реальном времени"
        actions={
          <button className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2 hover:bg-primary/90">
            <Icon name="RefreshCw" size={14} />
            Обновить
          </button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Всего ONU" value={total} icon="Router" color="hsl(210 100% 56%)" sub="зарегистрировано" />
        <KpiCard
          label="В сети"
          value={online}
          icon="CheckCircle2"
          color="hsl(142 76% 44%)"
          sub={`${Math.round((online / total) * 100)}% доступность`}
          trend={{ value: 2.4, label: "+2.4% за сутки" }}
        />
        <KpiCard
          label="Требуют внимания"
          value={warning}
          icon="AlertTriangle"
          color="hsl(38 92% 50%)"
          sub="слабый сигнал"
        />
        <KpiCard
          label="Аварии"
          value={offline}
          icon="XCircle"
          color="hsl(0 72% 51%)"
          sub="нет связи / LOS"
          trend={{ value: -1, label: "-1 за час" }}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-card border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold">Статусы ONU за 24 часа</h3>
              <p className="text-xs text-muted-foreground">Динамика online/warning/offline</p>
            </div>
            <select className="h-8 px-2 bg-secondary border border-border rounded text-xs">
              <option>24 часа</option>
              <option>7 дней</option>
              <option>30 дней</option>
            </select>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={statusHistory}>
              <defs>
                <linearGradient id="g-on" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(142 76% 44%)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="hsl(142 76% 44%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="g-w" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(38 92% 50%)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="hsl(38 92% 50%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="g-o" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(0 72% 51%)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="hsl(0 72% 51%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 12% 18%)" />
              <XAxis dataKey="time" stroke="hsl(215 14% 50%)" fontSize={11} />
              <YAxis stroke="hsl(215 14% 50%)" fontSize={11} />
              <Tooltip
                contentStyle={{ background: "hsl(220 14% 11%)", border: "1px solid hsl(220 12% 18%)", borderRadius: 6 }}
              />
              <Area type="monotone" dataKey="online" stackId="1" stroke="hsl(142 76% 44%)" fill="url(#g-on)" />
              <Area type="monotone" dataKey="warning" stackId="1" stroke="hsl(38 92% 50%)" fill="url(#g-w)" />
              <Area type="monotone" dataKey="offline" stackId="1" stroke="hsl(0 72% 51%)" fill="url(#g-o)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-sm font-semibold mb-1">Распределение статусов</h3>
          <p className="text-xs text-muted-foreground mb-3">Прямо сейчас</p>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={distribution} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={2} dataKey="value">
                {distribution.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: "hsl(220 14% 11%)", border: "1px solid hsl(220 12% 18%)", borderRadius: 6 }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-2">
            {distribution.map((d) => (
              <div key={d.name} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                  {d.name}
                </span>
                <span className="font-mono-data">{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-card border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold">Трафик uplink за 24 часа</h3>
              <p className="text-xs text-muted-foreground">Суммарно по всем OLT, Мбит/с</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={trafficHistory}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 12% 18%)" />
              <XAxis dataKey="time" stroke="hsl(215 14% 50%)" fontSize={11} />
              <YAxis stroke="hsl(215 14% 50%)" fontSize={11} />
              <Tooltip contentStyle={{ background: "hsl(220 14% 11%)", border: "1px solid hsl(220 12% 18%)", borderRadius: 6 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="in" name="Входящий" fill="hsl(210 100% 56%)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="out" name="Исходящий" fill="hsl(280 70% 60%)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Состояние OLT</h3>
            <Link to="/devices" className="text-xs text-primary hover:underline">Все →</Link>
          </div>
          <div className="space-y-3">
            {OLTS.map((olt) => (
              <div key={olt.id} className="border border-border rounded-md p-3 hover:border-primary/40 transition">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="text-sm font-medium">{olt.name}</div>
                    <div className="text-[10px] text-muted-foreground">{olt.model}</div>
                  </div>
                  <StatusBadge status={olt.status} />
                </div>
                <div className="grid grid-cols-3 gap-2 text-[10px]">
                  <div>
                    <div className="text-muted-foreground">CPU</div>
                    <div className="font-mono-data text-xs">{olt.cpu}%</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">RAM</div>
                    <div className="font-mono-data text-xs">{olt.ram}%</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Темп</div>
                    <div className="font-mono-data text-xs">{olt.temperature}°C</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Топ-5 проблемных ONU</h3>
            <Link to="/onu" className="text-xs text-primary hover:underline">Все ONU →</Link>
          </div>
          <div className="space-y-2">
            {problematic.map((onu) => (
              <Link
                key={onu.id}
                to={`/onu/${onu.id}`}
                className="flex items-center justify-between p-2 rounded hover:bg-secondary transition"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon name="Router" size={14} className="text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="text-sm font-mono-data">{onu.id}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{onu.address}</div>
                  </div>
                </div>
                <SignalIndicator value={onu.rxPower} />
              </Link>
            ))}
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Лента событий</h3>
            <Link to="/events" className="text-xs text-primary hover:underline">Все события →</Link>
          </div>
          <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
            {EVENTS.slice(0, 8).map((e) => {
              const colorMap: Record<string, string> = {
                error: "hsl(0 72% 51%)",
                warning: "hsl(38 92% 50%)",
                info: "hsl(210 100% 56%)",
                success: "hsl(142 76% 44%)",
              };
              const iconMap: Record<string, string> = {
                error: "XCircle",
                warning: "AlertTriangle",
                info: "Info",
                success: "CheckCircle2",
              };
              return (
                <div key={e.id} className="flex items-start gap-2 p-2 rounded hover:bg-secondary text-xs">
                  <Icon name={iconMap[e.type]} size={14} style={{ color: colorMap[e.type], flexShrink: 0, marginTop: 2 }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono-data text-[10px] text-muted-foreground">{e.time}</span>
                      <span className="font-medium truncate">{e.source}</span>
                    </div>
                    <div className="text-muted-foreground mt-0.5 truncate">{e.message}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
