import { useState } from "react";
import Icon from "@/components/ui/icon";
import PageHeader from "@/components/common/PageHeader";

const SECTIONS = [
  { id: "general", label: "Общие", icon: "Settings" },
  { id: "polling", label: "Опрос оборудования", icon: "RefreshCw" },
  { id: "snmp", label: "SNMP / Telnet", icon: "Network" },
  { id: "thresholds", label: "Пороги алертов", icon: "AlertTriangle" },
  { id: "security", label: "Безопасность", icon: "Shield" },
  { id: "appearance", label: "Внешний вид", icon: "Palette" },
  { id: "api", label: "API / Webhooks", icon: "Webhook" },
  { id: "license", label: "Лицензия", icon: "Award" },
];

export default function SettingsPage() {
  const [section, setSection] = useState("general");

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader title="Настройки системы" description="Конфигурация мониторинга, безопасности и интеграций" />

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-3">
          <div className="bg-card border border-border rounded-lg p-2 space-y-0.5">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded ${
                  section === s.id ? "bg-primary/15 text-primary" : "hover:bg-secondary text-muted-foreground"
                }`}
              >
                <Icon name={s.icon} size={14} />{s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="col-span-12 lg:col-span-9 bg-card border border-border rounded-lg p-6">
          {section === "general" && (
            <div className="space-y-4 max-w-xl">
              <h3 className="text-lg font-semibold mb-3">Общие настройки</h3>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Название организации</label>
                <input defaultValue="ISP «Мой провайдер»" className="w-full h-9 px-3 bg-secondary border border-border rounded" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Часовой пояс</label>
                <select className="w-full h-9 px-3 bg-secondary border border-border rounded">
                  <option>Europe/Moscow (UTC+3)</option>
                  <option>Europe/Kaliningrad (UTC+2)</option>
                  <option>Asia/Yekaterinburg (UTC+5)</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Язык интерфейса</label>
                <select className="w-full h-9 px-3 bg-secondary border border-border rounded">
                  <option>Русский</option><option>English</option>
                </select>
              </div>
            </div>
          )}

          {section === "polling" && (
            <div className="space-y-4 max-w-xl">
              <h3 className="text-lg font-semibold mb-3">Опрос оборудования</h3>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Интервал опроса OLT (секунды)</label>
                <input defaultValue="60" className="w-full h-9 px-3 bg-secondary border border-border rounded font-mono-data" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Интервал опроса ONU (секунды)</label>
                <input defaultValue="300" className="w-full h-9 px-3 bg-secondary border border-border rounded font-mono-data" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Таймаут SNMP-запроса (мс)</label>
                <input defaultValue="5000" className="w-full h-9 px-3 bg-secondary border border-border rounded font-mono-data" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Хранение метрик (дней)</label>
                <input defaultValue="90" className="w-full h-9 px-3 bg-secondary border border-border rounded font-mono-data" />
              </div>
            </div>
          )}

          {section === "snmp" && (
            <div className="space-y-4 max-w-xl">
              <h3 className="text-lg font-semibold mb-3">SNMP и Telnet (учётные данные по умолчанию)</h3>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">SNMP версия</label>
                <select className="w-full h-9 px-3 bg-secondary border border-border rounded">
                  <option>v2c</option><option>v3</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">SNMP community (read)</label>
                <input type="password" defaultValue="••••••••" className="w-full h-9 px-3 bg-secondary border border-border rounded font-mono-data" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Telnet логин</label>
                  <input defaultValue="admin" className="w-full h-9 px-3 bg-secondary border border-border rounded font-mono-data" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Telnet пароль</label>
                  <input type="password" defaultValue="••••••••" className="w-full h-9 px-3 bg-secondary border border-border rounded font-mono-data" />
                </div>
              </div>
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-3 text-xs text-yellow-200">
                <Icon name="ShieldAlert" size={14} className="inline mr-1" />
                Учётные данные хранятся в зашифрованном виде в защищённом хранилище секретов
              </div>
            </div>
          )}

          {section === "thresholds" && (
            <div className="space-y-4 max-w-xl">
              <h3 className="text-lg font-semibold mb-3">Пороги для алертов</h3>
              {[
                ["Сигнал Rx — предупреждение (дБм)", "-25"],
                ["Сигнал Rx — критично (дБм)", "-28"],
                ["Температура OLT — предупреждение (°C)", "60"],
                ["Температура OLT — критично (°C)", "70"],
                ["CPU OLT — предупреждение (%)", "70"],
                ["CPU OLT — критично (%)", "90"],
                ["Время offline для алерта (минут)", "5"],
              ].map(([l, v]) => (
                <div key={l} className="grid grid-cols-2 gap-3 items-center">
                  <label className="text-sm">{l}</label>
                  <input defaultValue={v} className="h-9 px-3 bg-secondary border border-border rounded font-mono-data text-sm" />
                </div>
              ))}
            </div>
          )}

          {section === "security" && (
            <div className="space-y-4 max-w-xl">
              <h3 className="text-lg font-semibold mb-3">Безопасность</h3>
              {[
                { l: "Обязательная 2FA для администраторов", v: true },
                { l: "Защита от брутфорса (блокировка после 5 ошибок)", v: true },
                { l: "Логирование всех действий пользователей", v: true },
                { l: "Доступ только с доверенных IP", v: false },
                { l: "Авто-выход после 30 минут неактивности", v: true },
              ].map((s) => (
                <div key={s.l} className="flex items-center justify-between p-3 border border-border rounded">
                  <span className="text-sm">{s.l}</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" defaultChecked={s.v} className="sr-only peer" />
                    <div className="w-9 h-5 bg-secondary rounded-full peer peer-checked:bg-primary after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition peer-checked:after:translate-x-4" />
                  </label>
                </div>
              ))}
            </div>
          )}

          {section === "appearance" && (
            <div className="space-y-4 max-w-xl">
              <h3 className="text-lg font-semibold mb-3">Внешний вид</h3>
              <div>
                <label className="text-xs text-muted-foreground mb-2 block">Тема</label>
                <div className="grid grid-cols-3 gap-2">
                  <button className="border-2 border-primary rounded p-3 bg-secondary text-sm">Тёмная</button>
                  <button className="border border-border rounded p-3 bg-secondary text-sm">Светлая</button>
                  <button className="border border-border rounded p-3 bg-secondary text-sm">Авто</button>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-2 block">Акцентный цвет</label>
                <div className="flex gap-2">
                  {["#3b82f6", "#10b981", "#a855f7", "#ec4899", "#f59e0b", "#ef4444"].map((c) => (
                    <button key={c} style={{ background: c }} className="w-8 h-8 rounded-full border-2 border-transparent hover:border-foreground" />
                  ))}
                </div>
              </div>
            </div>
          )}

          {section === "api" && (
            <div className="space-y-4 max-w-xl">
              <h3 className="text-lg font-semibold mb-3">API / Webhooks</h3>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">API-ключ</label>
                <div className="flex gap-2">
                  <input readOnly value="pk_live_••••••••••••••••" className="flex-1 h-9 px-3 bg-secondary border border-border rounded font-mono-data text-sm" />
                  <button className="h-9 px-3 bg-secondary border border-border rounded text-sm">Показать</button>
                  <button className="h-9 px-3 bg-secondary border border-border rounded text-sm">Сбросить</button>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Webhook URL</label>
                <input placeholder="https://your-system.com/api/pon-events" className="w-full h-9 px-3 bg-secondary border border-border rounded font-mono-data text-sm" />
              </div>
              <div className="text-xs text-muted-foreground">
                <a href="#" className="text-primary">Документация API →</a>
              </div>
            </div>
          )}

          {section === "license" && (
            <div className="space-y-4 max-w-xl">
              <h3 className="text-lg font-semibold mb-3">Лицензия</h3>
              <div className="border border-border rounded p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">План</span><span className="font-medium">Professional</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Лимит OLT</span><span className="font-mono-data">3 / 10</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Лимит ONU</span><span className="font-mono-data">{Math.floor(Math.random() * 100 + 200)} / 5000</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Действует до</span><span className="font-mono-data">31.12.2026</span></div>
              </div>
              <button className="h-9 px-3 bg-primary text-primary-foreground rounded text-sm font-medium">Расширить лицензию</button>
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-border flex gap-2">
            <button className="h-9 px-4 bg-primary text-primary-foreground rounded text-sm font-medium">Сохранить изменения</button>
            <button className="h-9 px-4 bg-secondary border border-border rounded text-sm">Отмена</button>
          </div>
        </div>
      </div>
    </div>
  );
}
