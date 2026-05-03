import { useParams, Link } from "react-router-dom";
import { useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import Icon from "@/components/ui/icon";
import StatusBadge from "@/components/common/StatusBadge";
import PageHeader from "@/components/common/PageHeader";
import { ROUTERS, ONUS, OLTS } from "@/lib/mock-data";

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function makeHistory(points: number, baseCpu: number, baseRam: number, traffIn: number, traffOut: number) {
  const arr = [];
  for (let i = 0; i < points; i++) {
    const t = new Date(Date.now() - (points - i) * 60 * 60 * 1000);
    arr.push({
      time: t.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
      cpu: Math.max(1, Math.round(baseCpu + rand(-12, 12))),
      ram: Math.max(10, Math.round(baseRam + rand(-7, 7))),
      in: Math.max(0, Number((traffIn + rand(-15, 25)).toFixed(1))),
      out: Math.max(0, Number((traffOut + rand(-50, 90)).toFixed(1))),
    });
  }
  return arr;
}

export default function RouterDetail() {
  const { id } = useParams();
  const router = ROUTERS.find((r) => r.id === id);
  const [tab, setTab] = useState<"overview" | "performance" | "wifi" | "clients" | "logs">("overview");
  if (!router) return <div className="p-6">Роутер не найден</div>;

  const onu = ONUS.find((o) => o.id === router.onuId);
  const olt = OLTS.find((o) => o.id === router.oltId);
  const history = makeHistory(24, router.cpu, router.ram, router.trafficIn, router.trafficOut);

  const wifiClients = Array.from({ length: router.clientsConnected }).map((_, i) => ({
    id: i,
    name: `Устройство ${i + 1}`,
    mac: `${Math.random().toString(16).slice(2, 4).toUpperCase()}:${Math.random().toString(16).slice(2, 4).toUpperCase()}:${Math.random().toString(16).slice(2, 4).toUpperCase()}:${Math.random().toString(16).slice(2, 4).toUpperCase()}:${Math.random().toString(16).slice(2, 4).toUpperCase()}:${Math.random().toString(16).slice(2, 4).toUpperCase()}`,
    ip: `192.168.1.${Math.floor(Math.random() * 250) + 2}`,
    band: i < router.wifi24Clients ? "2.4 ГГц" : i < router.wifi24Clients + router.wifi5Clients ? "5 ГГц" : "Ethernet",
    rssi: Math.floor(rand(-75, -35)),
    speed: Math.floor(rand(50, 866)),
    online: `${Math.floor(rand(1, 480))} мин`,
  }));

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link to="/routers" className="hover:text-foreground">Роутеры</Link>
        <Icon name="ChevronRight" size={12} />
        <span className="font-mono-data">{router.id}</span>
      </div>

      <PageHeader
        title={`${router.id} — ${router.model}`}
        description={router.address}
        actions={
          <div className="flex gap-2">
            <button className="h-9 px-3 rounded-md bg-secondary border border-border text-sm flex items-center gap-2"><Icon name="ExternalLink" size={14} />Web</button>
            <button className="h-9 px-3 rounded-md bg-secondary border border-border text-sm flex items-center gap-2"><Icon name="Terminal" size={14} />SSH</button>
            <button className="h-9 px-3 rounded-md bg-secondary border border-border text-sm flex items-center gap-2"><Icon name="Wifi" size={14} />Пинг</button>
            <button className="h-9 px-3 rounded-md bg-destructive/15 text-destructive text-sm flex items-center gap-2"><Icon name="RotateCw" size={14} />Рестарт</button>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-[10px] text-muted-foreground uppercase mb-1">Статус</div>
          <StatusBadge status={router.status} />
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-[10px] text-muted-foreground uppercase mb-1">Аптайм</div>
          <div className="font-mono-data text-sm">{router.uptime}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-[10px] text-muted-foreground uppercase mb-1">CPU</div>
          <div className="font-mono-data text-sm">{router.cpu}%</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-[10px] text-muted-foreground uppercase mb-1">RAM</div>
          <div className="font-mono-data text-sm">{router.ram}%</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-[10px] text-muted-foreground uppercase mb-1">Темп.</div>
          <div className="font-mono-data text-sm">{router.temperature}°C</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-[10px] text-muted-foreground uppercase mb-1">Клиенты</div>
          <div className="font-mono-data text-sm">{router.clientsConnected}</div>
        </div>
      </div>

      <div className="border-b border-border flex gap-1 flex-wrap">
        {[
          { v: "overview", label: "Обзор", icon: "Info" },
          { v: "performance", label: "Производительность", icon: "Activity" },
          { v: "wifi", label: "Wi-Fi сети", icon: "Wifi" },
          { v: "clients", label: `Клиенты (${router.clientsConnected})`, icon: "Users" },
          { v: "logs", label: "Журнал", icon: "FileText" },
        ].map((t) => (
          <button
            key={t.v}
            onClick={() => setTab(t.v as typeof tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-2 ${
              tab === t.v ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon name={t.icon} size={14} />{t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-card border border-border rounded-lg p-5">
            <h3 className="text-sm font-semibold mb-3">Идентификация</h3>
            <div className="space-y-2 text-sm">
              {[
                ["ID", router.id, true],
                ["Производитель", router.vendor, false],
                ["Модель", router.model, false],
                ["Прошивка", router.firmware, true],
                ["MAC", router.mac, true],
                ["LAN IP", router.ip, true],
                ["Внешний IP", router.externalIp, true],
                ["PPP логин", router.pppUser ?? "—", true],
              ].map(([k, v, mono]) => (
                <div key={k as string} className="flex justify-between border-b border-border pb-2">
                  <span className="text-muted-foreground">{k}</span>
                  <span className={mono ? "font-mono-data" : ""}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-5">
            <h3 className="text-sm font-semibold mb-3">Связь с сетью</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">Связан с ONU</span>
                {router.onuId ? (
                  <Link to={`/onu/${router.onuId}`} className="font-mono-data text-primary hover:underline">{router.onuId}</Link>
                ) : (
                  <span>—</span>
                )}
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">Через OLT</span>
                <span>{olt?.name ?? "—"}</span>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">Адрес</span>
                <span className="text-right">{router.address}</span>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">Сигнал ONU (Rx)</span>
                <span className="font-mono-data">{onu?.rxPower ?? "—"} дБм</span>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">Протокол управления</span>
                <span>{router.protocol}</span>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">Последняя активность</span>
                <span>{router.lastSeen}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "performance" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-card border border-border rounded-lg p-5">
            <h3 className="text-sm font-semibold mb-3">CPU и память (24ч)</h3>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={history}>
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
            <h3 className="text-sm font-semibold mb-3">Трафик (24ч), Мбит/с</h3>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={history}>
                <defs>
                  <linearGradient id="r-in" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(210 100% 56%)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="hsl(210 100% 56%)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="r-out" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(280 70% 60%)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="hsl(280 70% 60%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 12% 18%)" />
                <XAxis dataKey="time" stroke="hsl(215 14% 50%)" fontSize={10} />
                <YAxis stroke="hsl(215 14% 50%)" fontSize={10} />
                <Tooltip contentStyle={{ background: "hsl(220 14% 11%)", border: "1px solid hsl(220 12% 18%)" }} />
                <Area type="monotone" dataKey="in" stroke="hsl(210 100% 56%)" fill="url(#r-in)" name="↓ In" />
                <Area type="monotone" dataKey="out" stroke="hsl(280 70% 60%)" fill="url(#r-out)" name="↑ Out" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {tab === "wifi" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[
            { band: "2.4 ГГц", ssid: router.ssid24, clients: router.wifi24Clients, signal: router.signalWifi24, channel: 6, color: "hsl(38 92% 55%)" },
            { band: "5 ГГц", ssid: router.ssid5, clients: router.wifi5Clients, signal: router.signalWifi5, channel: 36, color: "hsl(210 100% 56%)" },
          ].map((w) => (
            <div key={w.band} className="bg-card border border-border rounded-lg p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-xs text-muted-foreground">Wi-Fi {w.band}</div>
                  <h3 className="text-lg font-semibold">{w.ssid}</h3>
                </div>
                <div className="w-10 h-10 rounded-md flex items-center justify-center" style={{ background: w.color + "22", color: w.color }}>
                  <Icon name="Wifi" size={20} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-secondary rounded p-3 text-center">
                  <div className="font-mono-data text-xl font-semibold">{w.clients}</div>
                  <div className="text-[10px] text-muted-foreground mt-1">Клиентов</div>
                </div>
                <div className="bg-secondary rounded p-3 text-center">
                  <div className="font-mono-data text-xl font-semibold">{w.signal}</div>
                  <div className="text-[10px] text-muted-foreground mt-1">Сигнал dBm</div>
                </div>
                <div className="bg-secondary rounded p-3 text-center">
                  <div className="font-mono-data text-xl font-semibold">{w.channel}</div>
                  <div className="text-[10px] text-muted-foreground mt-1">Канал</div>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button className="flex-1 h-8 bg-secondary border border-border rounded text-xs">Сменить пароль</button>
                <button className="flex-1 h-8 bg-secondary border border-border rounded text-xs">Сменить канал</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "clients" && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2.5">Устройство</th>
                <th className="text-left px-4 py-2.5">MAC</th>
                <th className="text-left px-4 py-2.5">IP</th>
                <th className="text-left px-4 py-2.5">Подключение</th>
                <th className="text-left px-4 py-2.5">RSSI</th>
                <th className="text-left px-4 py-2.5">Скорость</th>
                <th className="text-left px-4 py-2.5">Время онлайн</th>
              </tr>
            </thead>
            <tbody>
              {wifiClients.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-muted-foreground py-6">Нет подключённых клиентов</td>
                </tr>
              )}
              {wifiClients.map((c) => (
                <tr key={c.id} className="border-t border-border hover:bg-secondary/30">
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 font-mono-data text-xs">{c.mac}</td>
                  <td className="px-4 py-3 font-mono-data text-xs">{c.ip}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded bg-secondary">{c.band}</span>
                  </td>
                  <td className="px-4 py-3 font-mono-data" style={{ color: c.rssi > -55 ? "hsl(142 76% 50%)" : c.rssi > -70 ? "hsl(38 92% 55%)" : "hsl(0 72% 60%)" }}>
                    {c.rssi} dBm
                  </td>
                  <td className="px-4 py-3 font-mono-data">{c.speed} Мбит</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{c.online}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "logs" && (
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-sm font-semibold mb-3">Журнал устройства</h3>
          <div className="bg-black/40 border border-border rounded p-3 font-mono-data text-xs space-y-0.5 h-96 overflow-y-auto">
            {Array.from({ length: 30 }).map((_, i) => {
              const types = ["[INFO]", "[WARN]", "[ERR]"];
              const type = types[Math.floor(Math.random() * 3)];
              const messages = [
                "DHCP: assigned 192.168.1.103 to client",
                "WiFi: client connected on 5GHz",
                "WAN: PPPoE session established",
                "Firewall: blocked TCP 22 from external",
                "WiFi: client disconnected",
                "System: backup configuration saved",
              ];
              const time = new Date(Date.now() - i * 60000).toLocaleTimeString("ru-RU");
              return (
                <div key={i}>
                  <span className="text-muted-foreground">{time}</span>{" "}
                  <span style={{ color: type === "[ERR]" ? "hsl(0 72% 60%)" : type === "[WARN]" ? "hsl(38 92% 55%)" : "hsl(142 76% 50%)" }}>{type}</span>{" "}
                  <span>{messages[Math.floor(Math.random() * messages.length)]}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
