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
import SignalIndicator from "@/components/common/SignalIndicator";
import PageHeader from "@/components/common/PageHeader";
import { ONUS, OLTS, generateSignalHistory } from "@/lib/mock-data";

export default function OnuDetail() {
  const { id } = useParams();
  const onu = ONUS.find((o) => o.id === id);
  const [tab, setTab] = useState<"overview" | "signal" | "traffic" | "history" | "settings">("overview");
  if (!onu) return <div>Не найдено</div>;
  const olt = OLTS.find((o) => o.id === onu.oltId);
  const history = generateSignalHistory(onu.rxPower, 48);

  const linkHistory = [
    { time: "10:42", event: "online", message: "Онлайн" },
    { time: "08:15", event: "offline", message: "Потеря связи (5 мин)" },
    { time: "08:10", event: "online", message: "Онлайн" },
    { time: "вчера 22:30", event: "offline", message: "Потеря связи (3 мин)" },
    { time: "вчера 22:27", event: "online", message: "Регистрация" },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link to="/onu" className="hover:text-foreground">ONU / Абоненты</Link>
        <Icon name="ChevronRight" size={12} />
        <span className="font-mono-data">{onu.id}</span>
      </div>

      <PageHeader
        title={`${onu.id} — ${onu.name}`}
        description={onu.address}
        actions={
          <div className="flex gap-2">
            <button className="h-9 px-3 rounded-md bg-secondary border border-border text-sm flex items-center gap-2"><Icon name="Wifi" size={14} />Пинг</button>
            <button className="h-9 px-3 rounded-md bg-secondary border border-border text-sm flex items-center gap-2"><Icon name="Activity" size={14} />Диагностика</button>
            <button className="h-9 px-3 rounded-md bg-secondary border border-border text-sm flex items-center gap-2"><Icon name="RotateCw" size={14} />Рестарт</button>
            <button className="h-9 px-3 rounded-md bg-destructive/15 text-destructive text-sm flex items-center gap-2"><Icon name="Trash2" size={14} />Дерегистрация</button>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-[10px] text-muted-foreground uppercase mb-1">Статус</div>
          <StatusBadge status={onu.status} />
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-[10px] text-muted-foreground uppercase mb-1">Rx сигнал</div>
          <SignalIndicator value={onu.rxPower} size="md" />
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-[10px] text-muted-foreground uppercase mb-1">Tx сигнал</div>
          <div className="font-mono-data text-sm">{onu.txPower !== null ? `${onu.txPower} дБм` : "—"}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-[10px] text-muted-foreground uppercase mb-1">Расстояние</div>
          <div className="font-mono-data text-sm">{onu.distance} км</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-[10px] text-muted-foreground uppercase mb-1">Аптайм</div>
          <div className="font-mono-data text-sm">{onu.uptime}</div>
        </div>
      </div>

      <div className="border-b border-border flex gap-1">
        {[
          { v: "overview", label: "Обзор", icon: "Info" },
          { v: "signal", label: "Графики сигнала", icon: "Activity" },
          { v: "traffic", label: "Трафик", icon: "BarChart3" },
          { v: "history", label: "История событий", icon: "Clock" },
          { v: "settings", label: "Настройки", icon: "Settings" },
        ].map((t) => (
          <button
            key={t.v}
            onClick={() => setTab(t.v as typeof tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-2 ${
              tab === t.v ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon name={t.icon} size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-card border border-border rounded-lg p-5">
            <h3 className="text-sm font-semibold mb-3">Идентификация</h3>
            <div className="space-y-2 text-sm">
              {[
                ["ID устройства", onu.id, true],
                ["Абонент", onu.name, false],
                ["Адрес", onu.address, false],
                ["MAC", onu.mac, true],
                ["Серийный номер", onu.sn, true],
                ["Модель", onu.model, false],
                ["Прошивка", onu.firmware, true],
              ].map(([k, v, mono]) => (
                <div key={k as string} className="flex justify-between border-b border-border pb-2">
                  <span className="text-muted-foreground">{k}</span>
                  <span className={mono ? "font-mono-data" : ""}>{v}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-card border border-border rounded-lg p-5">
            <h3 className="text-sm font-semibold mb-3">Подключение</h3>
            <div className="space-y-2 text-sm">
              {[
                ["OLT", olt?.name, false],
                ["Модель OLT", olt?.model, false],
                ["PON-порт", `PON ${onu.pon}`, true],
                ["LLID", `${onu.llid}`, true],
                ["VLAN", `${onu.vlan}`, true],
                ["Профиль / тариф", onu.profile, false],
                ["Расстояние от OLT", `${onu.distance} км`, true],
                ["Последняя активность", onu.lastSeen, false],
              ].map(([k, v, mono]) => (
                <div key={k as string} className="flex justify-between border-b border-border pb-2">
                  <span className="text-muted-foreground">{k}</span>
                  <span className={mono ? "font-mono-data" : ""}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "signal" && (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Уровень сигнала за 24 часа</h3>
              <select className="h-8 px-2 bg-secondary border border-border rounded text-xs">
                <option>1 час</option><option>24 часа</option><option>7 дней</option><option>30 дней</option>
              </select>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={history}>
                <defs>
                  <linearGradient id="rx" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(210 100% 56%)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="hsl(210 100% 56%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 12% 18%)" />
                <XAxis dataKey="time" stroke="hsl(215 14% 50%)" fontSize={10} />
                <YAxis stroke="hsl(215 14% 50%)" fontSize={10} domain={[-32, -10]} />
                <Tooltip contentStyle={{ background: "hsl(220 14% 11%)", border: "1px solid hsl(220 12% 18%)" }} />
                <Area type="monotone" dataKey="rx" stroke="hsl(210 100% 56%)" fill="url(#rx)" name="Rx (дБм)" />
                <Line type="monotone" dataKey="tx" stroke="hsl(280 70% 60%)" strokeWidth={1.5} dot={false} name="Tx (дБм)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {tab === "traffic" && (
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-sm font-semibold mb-3">Трафик за 24 часа</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={Array.from({ length: 24 }).map((_, i) => ({
              time: `${i}:00`,
              in: Math.round(Math.random() * 50),
              out: Math.round(Math.random() * 200),
            }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 12% 18%)" />
              <XAxis dataKey="time" stroke="hsl(215 14% 50%)" fontSize={10} />
              <YAxis stroke="hsl(215 14% 50%)" fontSize={10} />
              <Tooltip contentStyle={{ background: "hsl(220 14% 11%)", border: "1px solid hsl(220 12% 18%)" }} />
              <Line type="monotone" dataKey="in" stroke="hsl(210 100% 56%)" strokeWidth={2} dot={false} name="↓ Мбит/с" />
              <Line type="monotone" dataKey="out" stroke="hsl(280 70% 60%)" strokeWidth={2} dot={false} name="↑ Мбит/с" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {tab === "history" && (
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-sm font-semibold mb-3">История link up/down</h3>
          <div className="space-y-2">
            {linkHistory.map((h, i) => (
              <div key={i} className="flex items-center gap-3 p-2 border border-border rounded text-sm">
                <span className={`status-dot ${h.event === "online" ? "status-online" : "status-offline"}`} />
                <span className="font-mono-data text-xs text-muted-foreground w-32">{h.time}</span>
                <span>{h.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "settings" && (
        <div className="bg-card border border-border rounded-lg p-5 space-y-3 max-w-xl">
          <h3 className="text-sm font-semibold mb-3">Настройки ONU</h3>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Имя абонента</label>
            <input defaultValue={onu.name} className="w-full h-9 px-3 bg-secondary border border-border rounded" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Адрес</label>
            <input defaultValue={onu.address} className="w-full h-9 px-3 bg-secondary border border-border rounded" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">VLAN</label>
              <input defaultValue={onu.vlan} className="w-full h-9 px-3 bg-secondary border border-border rounded font-mono-data" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Профиль / тариф</label>
              <select defaultValue={onu.profile} className="w-full h-9 px-3 bg-secondary border border-border rounded">
                <option>Internet-100</option><option>Internet-300</option><option>Internet-500</option><option>Internet-1G</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Широта</label>
              <input defaultValue={onu.lat} className="w-full h-9 px-3 bg-secondary border border-border rounded font-mono-data" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Долгота</label>
              <input defaultValue={onu.lng} className="w-full h-9 px-3 bg-secondary border border-border rounded font-mono-data" />
            </div>
          </div>
          <button className="h-9 px-4 bg-primary text-primary-foreground rounded text-sm font-medium">Сохранить</button>
        </div>
      )}
    </div>
  );
}
