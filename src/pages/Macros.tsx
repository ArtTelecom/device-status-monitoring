import { useState } from "react";
import Icon from "@/components/ui/icon";
import PageHeader from "@/components/common/PageHeader";
import { MACROS } from "@/lib/mock-data";

export default function Macros() {
  const [running, setRunning] = useState<number | null>(null);

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader
        title="Макросы / CLI команды"
        description="Шаблоны команд для оборудования C-DATA и других OLT"
        actions={
          <button className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2">
            <Icon name="Plus" size={14} />Создать макрос
          </button>
        }
      />

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-7 space-y-3">
          {MACROS.map((m) => {
            const catColor = m.category === "diagnostic" ? "hsl(210 100% 56%)" : m.category === "config" ? "hsl(280 70% 60%)" : "hsl(38 92% 50%)";
            const catLabel = m.category === "diagnostic" ? "Диагностика" : m.category === "config" ? "Конфигурация" : "Сервис";
            return (
              <div key={m.id} className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{m.name}</h3>
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: `${catColor}22`, color: catColor }}>{catLabel}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{m.description}</p>
                  </div>
                  <button
                    onClick={() => setRunning(m.id)}
                    className="h-8 px-3 rounded bg-primary text-primary-foreground text-xs flex items-center gap-1"
                  >
                    <Icon name="Play" size={12} />Запустить
                  </button>
                </div>
                <div className="bg-black/40 border border-border rounded p-2.5 mt-3 font-mono-data text-xs space-y-0.5">
                  {m.commands.map((c, i) => (
                    <div key={i}><span className="text-green-400">{">"}</span> {c}</div>
                  ))}
                </div>
                <div className="flex items-center justify-between mt-3 text-[10px] text-muted-foreground">
                  <span>Переменные: {m.variables.length > 0 ? m.variables.map((v) => `{${v}}`).join(", ") : "нет"}</span>
                  <span>Запусков: {m.runCount} · последний: {m.lastRun}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="col-span-12 lg:col-span-5">
          <div className="bg-card border border-border rounded-lg p-5 sticky top-20">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Icon name="Terminal" size={16} />Живой CLI</h3>
            <div className="space-y-2 mb-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Устройство</label>
                <select className="w-full h-9 px-3 bg-secondary border border-border rounded text-sm">
                  <option>OLT-Центр-01 (192.168.10.10)</option>
                  <option>OLT-Север-02 (192.168.10.20)</option>
                  <option>OLT-Юг-03 (192.168.10.30)</option>
                </select>
              </div>
            </div>
            <div className="bg-black border border-border rounded p-3 h-64 overflow-y-auto font-mono-data text-xs space-y-0.5">
              <div className="text-green-400">OLT-Центр-01# show version</div>
              <div className="text-muted-foreground">C-DATA EPON OLT FD1104SN-R1</div>
              <div className="text-muted-foreground">Software Version: V2.1.03 Build 240106</div>
              <div className="text-muted-foreground">Hardware Version: V1.0</div>
              <div className="text-muted-foreground">Uptime: 47 days, 12 hours, 33 minutes</div>
              <div className="text-green-400 mt-2">OLT-Центр-01# show epon interface epon 0/1 onu all</div>
              <div className="text-muted-foreground">LLID  MAC                Status   Distance  Rx Power</div>
              <div className="text-muted-foreground">1     AA:BB:CC:11:22:33  online   0.34 km   -18.4</div>
              <div className="text-muted-foreground">2     AA:BB:CC:11:22:34  online   1.12 km   -21.2</div>
              <div className="text-muted-foreground">3     AA:BB:CC:11:22:35  warning  3.85 km   -27.8</div>
              <div className="text-green-400 mt-2 flex items-center">OLT-Центр-01# <span className="ml-1 w-2 h-3.5 bg-green-400 animate-pulse" /></div>
            </div>
            <input
              placeholder="Введите команду..."
              className="w-full mt-2 h-9 px-3 bg-secondary border border-border rounded font-mono-data text-sm"
            />
          </div>
        </div>
      </div>

      {running && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setRunning(null)}>
          <div className="bg-card border border-border rounded-lg p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-3">Запуск макроса</h3>
            <p className="text-sm text-muted-foreground mb-4">{MACROS.find((m) => m.id === running)?.name}</p>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">OLT</label>
                <select className="w-full h-9 px-3 bg-secondary border border-border rounded text-sm">
                  <option>OLT-Центр-01</option><option>OLT-Север-02</option>
                </select>
              </div>
              {MACROS.find((m) => m.id === running)?.variables.map((v) => (
                <div key={v}>
                  <label className="text-xs text-muted-foreground mb-1 block">{v}</label>
                  <input className="w-full h-9 px-3 bg-secondary border border-border rounded font-mono-data text-sm" />
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setRunning(null)} className="flex-1 h-9 bg-primary text-primary-foreground rounded text-sm font-medium">Выполнить</button>
              <button onClick={() => setRunning(null)} className="h-9 px-4 bg-secondary border border-border rounded text-sm">Отмена</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
