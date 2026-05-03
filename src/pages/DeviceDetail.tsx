import { useParams, Link } from "react-router-dom";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";
import Icon from "@/components/ui/icon";
import StatusBadge from "@/components/common/StatusBadge";
import PageHeader from "@/components/common/PageHeader";
import { OLTS, ONUS, generateOltMetricsHistory, generateTrafficHistory } from "@/lib/mock-data";

export default function DeviceDetail() {
  const { id } = useParams();
  const olt = OLTS.find((o) => o.id === id);
  if (!olt) return <div>Устройство не найдено</div>;

  const onus = ONUS.filter((o) => o.oltId === olt.id);
  const metrics = generateOltMetricsHistory(24);
  const traffic = generateTrafficHistory(24);

  const ponStats = Array.from({ length: olt.ponPorts }).map((_, i) => {
    const pon = i + 1;
    const list = onus.filter((o) => o.pon === pon);
    const online = list.filter((o) => o.status === "online").length;
    return {
      pon: `PON ${pon}`,
      online,
      offline: list.length - online,
      total: list.length,
    };
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link to="/devices" className="hover:text-foreground">Оборудование</Link>
        <Icon name="ChevronRight" size={12} />
        <span>{olt.name}</span>
      </div>

      <PageHeader
        title={olt.name}
        description={`${olt.model} · ${olt.location}`}
        actions={
          <div className="flex gap-2">
            <button className="h-9 px-3 rounded-md bg-secondary border border-border text-sm flex items-center gap-2"><Icon name="Terminal" size={14} />CLI</button>
            <button className="h-9 px-3 rounded-md bg-secondary border border-border text-sm flex items-center gap-2"><Icon name="Archive" size={14} />Бэкап конфига</button>
            <button className="h-9 px-3 rounded-md bg-destructive/15 text-destructive text-sm flex items-center gap-2"><Icon name="RotateCw" size={14} />Перезагрузить</button>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {[
          { label: "Статус", value: <StatusBadge status={olt.status} />, icon: "Activity" },
          { label: "IP-адрес", value: olt.ip, icon: "Network", mono: true },
          { label: "Прошивка", value: olt.firmware, icon: "Cpu", mono: true },
          { label: "Аптайм", value: olt.uptime, icon: "Clock", mono: true },
          { label: "PON-портов", value: olt.ponPorts, icon: "Cable", mono: true },
          { label: "ONU подключено", value: onus.length, icon: "Router", mono: true },
        ].map((s, i) => (
          <div key={i} className="bg-card border border-border rounded-lg p-3">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase mb-1">
              <Icon name={s.icon} size={11} />
              {s.label}
            </div>
            <div className={`text-sm font-medium ${s.mono ? "font-mono-data" : ""}`}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-sm font-semibold mb-3">CPU и память (24ч)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={metrics}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 12% 18%)" />
              <XAxis dataKey="time" stroke="hsl(215 14% 50%)" fontSize={10} />
              <YAxis stroke="hsl(215 14% 50%)" fontSize={10} />
              <Tooltip contentStyle={{ background: "hsl(220 14% 11%)", border: "1px solid hsl(220 12% 18%)" }} />
              <Line type="monotone" dataKey="cpu" stroke="hsl(210 100% 56%)" strokeWidth={2} dot={false} name="CPU %" />
              <Line type="monotone" dataKey="ram" stroke="hsl(280 70% 60%)" strokeWidth={2} dot={false} name="RAM %" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-sm font-semibold mb-3">Температура (24ч)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={metrics}>
              <defs>
                <linearGradient id="t" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(38 92% 50%)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="hsl(38 92% 50%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 12% 18%)" />
              <XAxis dataKey="time" stroke="hsl(215 14% 50%)" fontSize={10} />
              <YAxis stroke="hsl(215 14% 50%)" fontSize={10} domain={[30, 80]} />
              <Tooltip contentStyle={{ background: "hsl(220 14% 11%)", border: "1px solid hsl(220 12% 18%)" }} />
              <Area type="monotone" dataKey="temp" stroke="hsl(38 92% 50%)" fill="url(#t)" strokeWidth={2} name="°C" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-sm font-semibold mb-3">Трафик uplink</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={traffic.slice(-12)}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 12% 18%)" />
              <XAxis dataKey="time" stroke="hsl(215 14% 50%)" fontSize={10} />
              <YAxis stroke="hsl(215 14% 50%)" fontSize={10} />
              <Tooltip contentStyle={{ background: "hsl(220 14% 11%)", border: "1px solid hsl(220 12% 18%)" }} />
              <Bar dataKey="in" stackId="a" fill="hsl(210 100% 56%)" name="↓" />
              <Bar dataKey="out" stackId="a" fill="hsl(280 70% 60%)" name="↑" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-5">
        <h3 className="text-sm font-semibold mb-4">PON-порты</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {ponStats.map((pon, i) => (
            <Link
              key={i}
              to={`/onu?olt=${olt.id}&pon=${i + 1}`}
              className="border border-border rounded-md p-3 hover:border-primary/40"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold">{pon.pon}</span>
                <span className={`status-dot ${pon.online > 0 ? "status-online" : "status-offline"}`} />
              </div>
              <div className="font-mono-data text-lg">{pon.total}</div>
              <div className="text-[10px] text-muted-foreground">
                {pon.online} в сети{pon.offline > 0 ? ` · ${pon.offline} офлайн` : ""}
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-5">
        <h3 className="text-sm font-semibold mb-3">Информация об устройстве</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-3 text-sm">
          {[
            ["Производитель", olt.vendor],
            ["Модель", olt.model],
            ["Серийный номер", olt.serial],
            ["Прошивка", olt.firmware],
            ["IP-адрес", olt.ip],
            ["PON-порты", `${olt.ponPorts}`],
            ["Uplink-порты", `${olt.uplinkPorts}`],
            ["Расположение", olt.location],
          ].map(([k, v]) => (
            <div key={k}>
              <div className="text-xs text-muted-foreground">{k}</div>
              <div className="font-mono-data text-sm">{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
