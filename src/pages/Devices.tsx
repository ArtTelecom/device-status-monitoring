import { Link } from "react-router-dom";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import Icon from "@/components/ui/icon";
import StatusBadge from "@/components/common/StatusBadge";
import PageHeader from "@/components/common/PageHeader";
import { OLTS, ONUS, generateOltMetricsHistory } from "@/lib/mock-data";

export default function Devices() {
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Оборудование (OLT)"
        description="Все головные станции в сети"
        actions={
          <button className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2">
            <Icon name="Plus" size={14} />
            Добавить OLT
          </button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {OLTS.map((olt) => {
          const onuCount = ONUS.filter((o) => o.oltId === olt.id).length;
          const onlineCount = ONUS.filter((o) => o.oltId === olt.id && o.status === "online").length;
          const history = generateOltMetricsHistory(12);
          return (
            <Link
              key={olt.id}
              to={`/devices/${olt.id}`}
              className="bg-card border border-border rounded-lg p-5 card-hover block"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold">{olt.name}</h3>
                  <div className="text-xs text-muted-foreground">{olt.model}</div>
                </div>
                <StatusBadge status={olt.status} />
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3 text-xs">
                <div>
                  <div className="text-muted-foreground">IP-адрес</div>
                  <div className="font-mono-data">{olt.ip}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Аптайм</div>
                  <div className="font-mono-data">{olt.uptime}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">PON-портов</div>
                  <div className="font-mono-data">{olt.ponPorts}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">ONU подключено</div>
                  <div className="font-mono-data">
                    <span className="text-foreground">{onuCount}</span>
                    <span className="text-muted-foreground"> ({onlineCount} в сети)</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2 mb-3">
                {[
                  { label: "CPU", value: olt.cpu, color: "hsl(210 100% 56%)" },
                  { label: "RAM", value: olt.ram, color: "hsl(280 70% 60%)" },
                  { label: "Темп. °C", value: olt.temperature, color: "hsl(38 92% 50%)", max: 80 },
                ].map((m) => {
                  const max = m.max ?? 100;
                  const pct = Math.min(100, (m.value / max) * 100);
                  return (
                    <div key={m.label}>
                      <div className="flex justify-between text-[10px] mb-0.5">
                        <span className="text-muted-foreground">{m.label}</span>
                        <span className="font-mono-data">{m.value}{m.label.includes("Темп") ? "°C" : "%"}</span>
                      </div>
                      <div className="h-1 bg-secondary rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: m.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-border pt-3">
                <div className="text-[10px] text-muted-foreground mb-1">Загрузка CPU за 12ч</div>
                <ResponsiveContainer width="100%" height={50}>
                  <LineChart data={history}>
                    <Line type="monotone" dataKey="cpu" stroke="hsl(210 100% 56%)" strokeWidth={1.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="flex items-center justify-between mt-3 text-xs">
                <span className="text-muted-foreground">↓ {olt.trafficIn} / ↑ {olt.trafficOut} Мбит/с</span>
                <span className="text-primary">Открыть →</span>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold">Все OLT — табличный вид</h3>
          <div className="flex gap-2 text-xs">
            <button className="px-2 py-1 rounded hover:bg-secondary"><Icon name="Download" size={12} className="inline mr-1" />Экспорт</button>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-secondary/40 text-xs text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2">Название</th>
              <th className="text-left px-4 py-2">Модель</th>
              <th className="text-left px-4 py-2">IP</th>
              <th className="text-left px-4 py-2">Прошивка</th>
              <th className="text-left px-4 py-2">PON</th>
              <th className="text-left px-4 py-2">ONU</th>
              <th className="text-left px-4 py-2">CPU</th>
              <th className="text-left px-4 py-2">Темп.</th>
              <th className="text-left px-4 py-2">Статус</th>
              <th className="text-left px-4 py-2">Действия</th>
            </tr>
          </thead>
          <tbody>
            {OLTS.map((olt) => {
              const onuCount = ONUS.filter((o) => o.oltId === olt.id).length;
              return (
                <tr key={olt.id} className="border-t border-border hover:bg-secondary/30">
                  <td className="px-4 py-3 font-medium">
                    <Link to={`/devices/${olt.id}`} className="hover:text-primary">{olt.name}</Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{olt.model}</td>
                  <td className="px-4 py-3 font-mono-data text-xs">{olt.ip}</td>
                  <td className="px-4 py-3 font-mono-data text-xs">{olt.firmware}</td>
                  <td className="px-4 py-3 font-mono-data">{olt.ponPorts}</td>
                  <td className="px-4 py-3 font-mono-data">{onuCount}</td>
                  <td className="px-4 py-3 font-mono-data">{olt.cpu}%</td>
                  <td className="px-4 py-3 font-mono-data">{olt.temperature}°C</td>
                  <td className="px-4 py-3"><StatusBadge status={olt.status} /></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button title="Пинг" className="w-7 h-7 rounded hover:bg-secondary text-muted-foreground"><Icon name="Wifi" size={13} /></button>
                      <button title="Терминал" className="w-7 h-7 rounded hover:bg-secondary text-muted-foreground"><Icon name="Terminal" size={13} /></button>
                      <button title="Перезагрузить" className="w-7 h-7 rounded hover:bg-secondary text-muted-foreground"><Icon name="RotateCw" size={13} /></button>
                    </div>
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
