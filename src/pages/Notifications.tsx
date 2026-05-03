import { useState } from "react";
import Icon from "@/components/ui/icon";
import PageHeader from "@/components/common/PageHeader";

export default function Notifications() {
  const [tab, setTab] = useState<"channels" | "rules" | "recipients">("channels");

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader title="Уведомления" description="Каналы доставки алертов: Telegram, Email, Webhooks" />

      <div className="border-b border-border flex gap-1">
        {[
          { v: "channels", label: "Каналы", icon: "Send" },
          { v: "rules", label: "Правила", icon: "Filter" },
          { v: "recipients", label: "Получатели", icon: "Users" },
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

      {tab === "channels" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {[
            { name: "Telegram-бот", icon: "Send", color: "#229ED9", desc: "Мгновенные уведомления в Telegram", status: "active", info: "@pon_alerts_bot" },
            { name: "Email", icon: "Mail", color: "#EA4335", desc: "Рассылка по email", status: "active", info: "noreply@isp.ru" },
            { name: "Webhook", icon: "Webhook", color: "#10b981", desc: "HTTP POST в внешнюю систему", status: "inactive", info: "—" },
          ].map((c) => (
            <div key={c.name} className="bg-card border border-border rounded-lg p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-md flex items-center justify-center" style={{ background: c.color + "22", color: c.color }}>
                  <Icon name={c.icon} size={20} />
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" defaultChecked={c.status === "active"} className="sr-only peer" />
                  <div className="w-9 h-5 bg-secondary rounded-full peer peer-checked:bg-primary after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition peer-checked:after:translate-x-4" />
                </label>
              </div>
              <h3 className="font-semibold mb-1">{c.name}</h3>
              <p className="text-xs text-muted-foreground mb-3">{c.desc}</p>
              <div className="text-xs font-mono-data bg-secondary px-2 py-1.5 rounded">{c.info}</div>
              <button className="w-full mt-3 h-8 rounded bg-secondary border border-border text-xs hover:bg-accent">Настроить</button>
            </div>
          ))}
        </div>
      )}

      {tab === "rules" && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2.5">Правило</th>
                <th className="text-left px-4 py-2.5">Триггер</th>
                <th className="text-left px-4 py-2.5">Каналы</th>
                <th className="text-left px-4 py-2.5">Получатели</th>
                <th className="text-left px-4 py-2.5">Активно</th>
              </tr>
            </thead>
            <tbody>
              {[
                { name: "ONU потеряла сигнал (LOS)", trig: "событие LOS, сразу", ch: "Telegram, Email", rec: "Дежурные инженеры" },
                { name: "Сигнал ниже -28 дБм", trig: "Rx < -28 дБм > 5 мин", ch: "Telegram", rec: "Группа Север" },
                { name: "OLT недоступен", trig: "OLT offline > 1 мин", ch: "Telegram, Email, Webhook", rec: "Все админы" },
                { name: "Высокая температура OLT", trig: "Temp > 65°C", ch: "Email", rec: "Тех. директор" },
                { name: "Новая ONU обнаружена", trig: "Появилась незарегистрированная ONU", ch: "Telegram", rec: "Монтажники" },
              ].map((r, i) => (
                <tr key={i} className="border-t border-border hover:bg-secondary/30">
                  <td className="px-4 py-3 font-medium">{r.name}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{r.trig}</td>
                  <td className="px-4 py-3 text-xs">{r.ch}</td>
                  <td className="px-4 py-3 text-xs">{r.rec}</td>
                  <td className="px-4 py-3">
                    <input type="checkbox" defaultChecked className="accent-primary" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "recipients" && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2.5">Имя</th>
                <th className="text-left px-4 py-2.5">Telegram</th>
                <th className="text-left px-4 py-2.5">Email</th>
                <th className="text-left px-4 py-2.5">Группа</th>
              </tr>
            </thead>
            <tbody>
              {[
                { n: "Иванов И.И.", tg: "@ivanov_ipsk", em: "ivanov@isp.ru", g: "Дежурные" },
                { n: "Петров П.П.", tg: "@petrov_p", em: "petrov@isp.ru", g: "Север" },
                { n: "Сидорова А.", tg: "—", em: "sidorova@isp.ru", g: "Все админы" },
              ].map((r, i) => (
                <tr key={i} className="border-t border-border hover:bg-secondary/30">
                  <td className="px-4 py-3 font-medium">{r.n}</td>
                  <td className="px-4 py-3 font-mono-data text-xs">{r.tg}</td>
                  <td className="px-4 py-3 font-mono-data text-xs">{r.em}</td>
                  <td className="px-4 py-3"><span className="text-xs bg-primary/15 text-primary px-2 py-0.5 rounded">{r.g}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
