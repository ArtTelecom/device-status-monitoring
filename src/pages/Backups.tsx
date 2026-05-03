import Icon from "@/components/ui/icon";
import PageHeader from "@/components/common/PageHeader";
import { BACKUPS, OLTS } from "@/lib/mock-data";

function fmt(b: number) {
  if (b > 1024) return `${(b / 1024).toFixed(1)} КБ`;
  return `${b} Б`;
}

export default function Backups() {
  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader
        title="Бэкапы конфигураций"
        description="Автоматическое резервное копирование настроек OLT"
        actions={
          <button className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2">
            <Icon name="Plus" size={14} />Создать бэкап сейчас
          </button>
        }
      />

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-xs text-muted-foreground mb-1">Расписание</div>
          <div className="font-medium">Ежедневно в 04:00</div>
          <button className="text-xs text-primary mt-1">Изменить →</button>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-xs text-muted-foreground mb-1">Хранение</div>
          <div className="font-medium">30 дней / S3</div>
          <button className="text-xs text-primary mt-1">Настроить →</button>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-xs text-muted-foreground mb-1">Всего бэкапов</div>
          <div className="font-mono-data text-2xl font-semibold">{BACKUPS.length}</div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/40 text-xs text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2.5">Дата</th>
              <th className="text-left px-4 py-2.5">OLT</th>
              <th className="text-left px-4 py-2.5">Тип</th>
              <th className="text-left px-4 py-2.5">Размер</th>
              <th className="text-left px-4 py-2.5">Хеш</th>
              <th className="text-left px-4 py-2.5">Создал</th>
              <th className="text-left px-4 py-2.5">Действия</th>
            </tr>
          </thead>
          <tbody>
            {BACKUPS.map((b) => (
              <tr key={b.id} className="border-t border-border hover:bg-secondary/30">
                <td className="px-4 py-3 font-mono-data text-xs">{b.date}</td>
                <td className="px-4 py-3 font-medium">{b.oltName}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded ${b.type === "auto" ? "bg-primary/15 text-primary" : "bg-secondary"}`}>
                    {b.type === "auto" ? "Авто" : "Ручной"}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono-data">{fmt(b.size)}</td>
                <td className="px-4 py-3 font-mono-data text-xs text-muted-foreground">{b.hash}</td>
                <td className="px-4 py-3 text-xs">{b.user}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <button title="Скачать" className="w-7 h-7 rounded hover:bg-secondary text-muted-foreground"><Icon name="Download" size={12} /></button>
                    <button title="Сравнить" className="w-7 h-7 rounded hover:bg-secondary text-muted-foreground"><Icon name="GitCompareArrows" size={12} /></button>
                    <button title="Восстановить" className="w-7 h-7 rounded hover:bg-secondary text-muted-foreground"><Icon name="Upload" size={12} /></button>
                    <button title="Удалить" className="w-7 h-7 rounded hover:bg-secondary text-destructive"><Icon name="Trash2" size={12} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
