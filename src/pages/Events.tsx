import { useState } from "react";
import Icon from "@/components/ui/icon";
import PageHeader from "@/components/common/PageHeader";
import { EVENTS } from "@/lib/mock-data";

const COLORS: Record<string, { c: string; bg: string; icon: string }> = {
  error: { c: "hsl(0 72% 60%)", bg: "hsl(0 72% 51% / 0.12)", icon: "XCircle" },
  warning: { c: "hsl(38 92% 55%)", bg: "hsl(38 92% 50% / 0.12)", icon: "AlertTriangle" },
  info: { c: "hsl(210 100% 60%)", bg: "hsl(210 100% 56% / 0.12)", icon: "Info" },
  success: { c: "hsl(142 76% 50%)", bg: "hsl(142 76% 44% / 0.12)", icon: "CheckCircle2" },
};

const CATEGORIES = [
  { v: "all", label: "Все категории" },
  { v: "los", label: "LOS" },
  { v: "link", label: "Связь" },
  { v: "signal", label: "Сигнал" },
  { v: "config", label: "Конфигурация" },
  { v: "auth", label: "Авторизация" },
  { v: "system", label: "Система" },
];

export default function Events() {
  const [type, setType] = useState("all");
  const [cat, setCat] = useState("all");
  const [onlyOpen, setOnlyOpen] = useState(false);

  const filtered = EVENTS.filter((e) => {
    if (type !== "all" && e.type !== type) return false;
    if (cat !== "all" && e.category !== cat) return false;
    if (onlyOpen && e.acknowledged) return false;
    return true;
  });

  const stats = {
    total: EVENTS.length,
    error: EVENTS.filter((e) => e.type === "error").length,
    warning: EVENTS.filter((e) => e.type === "warning").length,
    open: EVENTS.filter((e) => !e.acknowledged).length,
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader title="События и алерты" description="Лента всех событий PON-сети" />

      <div className="grid grid-cols-4 gap-3">
        {[
          { l: "Всего", v: stats.total, c: "hsl(210 16% 70%)", i: "Bell" },
          { l: "Аварии", v: stats.error, c: "hsl(0 72% 60%)", i: "XCircle" },
          { l: "Предупреждения", v: stats.warning, c: "hsl(38 92% 55%)", i: "AlertTriangle" },
          { l: "Открытые", v: stats.open, c: "hsl(280 70% 60%)", i: "CircleDashed" },
        ].map((s) => (
          <div key={s.l} className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground uppercase">{s.l}</span>
              <Icon name={s.i} size={14} style={{ color: s.c }} />
            </div>
            <div className="font-mono-data text-2xl font-semibold">{s.v}</div>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-lg p-3 flex flex-wrap items-center gap-2">
        <select value={type} onChange={(e) => setType(e.target.value)} className="h-9 px-3 bg-secondary border border-border rounded text-sm">
          <option value="all">Все типы</option>
          <option value="error">Ошибки</option>
          <option value="warning">Предупреждения</option>
          <option value="info">Информация</option>
          <option value="success">Успех</option>
        </select>
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="h-9 px-3 bg-secondary border border-border rounded text-sm">
          {CATEGORIES.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm px-3 py-1.5 bg-secondary border border-border rounded cursor-pointer">
          <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} className="accent-primary" />
          Только открытые
        </label>
        <div className="ml-auto flex gap-2">
          <button className="h-9 px-3 rounded-md bg-secondary border border-border text-sm flex items-center gap-2"><Icon name="Download" size={14} />Экспорт</button>
          <button className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2"><Icon name="CheckCircle2" size={14} />Закрыть все</button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {filtered.map((e, i) => {
          const c = COLORS[e.type];
          return (
            <div key={e.id} className={`flex items-start gap-3 px-4 py-3 hover:bg-secondary/30 ${i > 0 ? "border-t border-border" : ""}`}>
              <div className="w-8 h-8 rounded flex items-center justify-center shrink-0" style={{ background: c.bg, color: c.c }}>
                <Icon name={c.icon} size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="font-medium">{e.source}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{e.category}</span>
                  {e.acknowledged && <span className="text-xs text-green-500 flex items-center gap-1"><Icon name="Check" size={11} />подтверждено</span>}
                </div>
                <div className="text-sm text-muted-foreground mt-1">{e.message}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-mono-data text-xs">{e.time}</div>
                <div className="text-[10px] text-muted-foreground">{e.date}</div>
              </div>
              <div className="flex gap-1 shrink-0">
                {!e.acknowledged && <button title="Подтвердить" className="w-7 h-7 rounded hover:bg-secondary text-muted-foreground"><Icon name="Check" size={12} /></button>}
                <button title="Подробнее" className="w-7 h-7 rounded hover:bg-secondary text-muted-foreground"><Icon name="ExternalLink" size={12} /></button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
