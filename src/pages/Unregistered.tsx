import { useState } from "react";
import Icon from "@/components/ui/icon";
import PageHeader from "@/components/common/PageHeader";
import SignalIndicator from "@/components/common/SignalIndicator";
import { UNREGISTERED, OLTS } from "@/lib/mock-data";

export default function Unregistered() {
  const [registering, setRegistering] = useState<string | null>(null);

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader
        title="Незарегистрированные ONU"
        description="Устройства, обнаруженные на PON-портах, но не зарегистрированные в системе"
        actions={
          <button className="h-9 px-3 rounded-md bg-secondary border border-border text-sm flex items-center gap-2">
            <Icon name="RefreshCw" size={14} />Сканировать заново
          </button>
        }
      />

      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 flex items-center gap-3 text-sm">
        <Icon name="AlertTriangle" size={16} className="text-yellow-500" />
        <span>Найдено <strong>{UNREGISTERED.length}</strong> новых устройств. Зарегистрируйте их с подходящим профилем для активации.</span>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/40 text-xs text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2.5">OLT / PON</th>
              <th className="text-left px-4 py-2.5">MAC-адрес</th>
              <th className="text-left px-4 py-2.5">Серийный номер</th>
              <th className="text-left px-4 py-2.5">Производитель</th>
              <th className="text-left px-4 py-2.5">Сигнал Rx</th>
              <th className="text-left px-4 py-2.5">Обнаружено</th>
              <th className="text-left px-4 py-2.5">Действие</th>
            </tr>
          </thead>
          <tbody>
            {UNREGISTERED.map((u) => (
              <tr key={u.id} className="border-t border-border hover:bg-secondary/30">
                <td className="px-4 py-3">
                  <div className="font-medium">{OLTS.find((o) => o.id === u.oltId)?.name}</div>
                  <div className="text-xs text-muted-foreground font-mono-data">PON {u.pon}</div>
                </td>
                <td className="px-4 py-3 font-mono-data">{u.mac}</td>
                <td className="px-4 py-3 font-mono-data">{u.sn}</td>
                <td className="px-4 py-3">{u.vendor}</td>
                <td className="px-4 py-3"><SignalIndicator value={u.rxPower} /></td>
                <td className="px-4 py-3 font-mono-data text-xs text-muted-foreground">сегодня {u.detectedAt}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => setRegistering(u.id)}
                      className="h-8 px-3 rounded bg-primary text-primary-foreground text-xs font-medium flex items-center gap-1"
                    >
                      <Icon name="UserPlus" size={12} />Зарегистрировать
                    </button>
                    <button className="h-8 px-2 rounded bg-secondary border border-border text-xs">
                      <Icon name="X" size={12} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {registering && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setRegistering(null)}>
          <div className="bg-card border border-border rounded-lg p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Регистрация новой ONU</h3>
              <button onClick={() => setRegistering(null)}><Icon name="X" size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Шаблон / профиль</label>
                <select className="w-full h-9 px-3 bg-secondary border border-border rounded">
                  <option>Internet-100 (стандартный)</option>
                  <option>Internet-300 (премиум)</option>
                  <option>Internet-500</option>
                  <option>IPTV + Internet</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Имя абонента</label>
                <input className="w-full h-9 px-3 bg-secondary border border-border rounded" placeholder="Иванов И.И." />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Адрес</label>
                <input className="w-full h-9 px-3 bg-secondary border border-border rounded" placeholder="ул. Пушкина, д.10, кв.5" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">VLAN</label>
                  <input className="w-full h-9 px-3 bg-secondary border border-border rounded font-mono-data" defaultValue="100" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">LLID</label>
                  <input className="w-full h-9 px-3 bg-secondary border border-border rounded font-mono-data" defaultValue="auto" />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setRegistering(null)} className="flex-1 h-9 bg-primary text-primary-foreground rounded font-medium text-sm">Зарегистрировать</button>
                <button onClick={() => setRegistering(null)} className="h-9 px-4 bg-secondary border border-border rounded text-sm">Отмена</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
