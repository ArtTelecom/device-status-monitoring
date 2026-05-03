import Icon from "@/components/ui/icon";
import PageHeader from "@/components/common/PageHeader";
import StatusBadge from "@/components/common/StatusBadge";
import { USERS } from "@/lib/mock-data";

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  admin: { label: "Администратор", color: "hsl(0 72% 60%)" },
  engineer: { label: "Инженер", color: "hsl(210 100% 60%)" },
  operator: { label: "Оператор", color: "hsl(38 92% 55%)" },
  viewer: { label: "Просмотр", color: "hsl(215 14% 60%)" },
};

export default function Users() {
  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader
        title="Пользователи и доступ"
        description="Управление учётными записями, ролями и правами"
        actions={
          <button className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2">
            <Icon name="UserPlus" size={14} />Добавить пользователя
          </button>
        }
      />

      <div className="grid grid-cols-4 gap-3">
        {[
          { l: "Всего пользователей", v: USERS.length, c: "hsl(210 100% 60%)", i: "Users" },
          { l: "Активных", v: USERS.filter((u) => u.status === "active").length, c: "hsl(142 76% 50%)", i: "UserCheck" },
          { l: "С 2FA", v: USERS.filter((u) => u.twoFa).length, c: "hsl(280 70% 60%)", i: "ShieldCheck" },
          { l: "Заблокированных", v: USERS.filter((u) => u.status === "blocked").length, c: "hsl(0 72% 60%)", i: "UserX" },
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

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/40 text-xs text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2.5">Пользователь</th>
              <th className="text-left px-4 py-2.5">Email</th>
              <th className="text-left px-4 py-2.5">Роль</th>
              <th className="text-left px-4 py-2.5">Группа доступа</th>
              <th className="text-left px-4 py-2.5">2FA</th>
              <th className="text-left px-4 py-2.5">Последний вход</th>
              <th className="text-left px-4 py-2.5">Статус</th>
              <th className="text-left px-4 py-2.5">Действия</th>
            </tr>
          </thead>
          <tbody>
            {USERS.map((u) => {
              const role = ROLE_LABELS[u.role];
              return (
                <tr key={u.id} className="border-t border-border hover:bg-secondary/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-semibold">
                        {u.fullName.split(" ").map((s) => s[0]).slice(0, 2).join("")}
                      </div>
                      <div>
                        <div className="font-medium">{u.fullName}</div>
                        <div className="text-xs text-muted-foreground font-mono-data">@{u.username}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono-data text-xs">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: `${role.color}22`, color: role.color }}>{role.label}</span>
                  </td>
                  <td className="px-4 py-3 text-xs">{u.group}</td>
                  <td className="px-4 py-3">
                    {u.twoFa ? (
                      <span className="text-xs text-green-500 flex items-center gap-1"><Icon name="ShieldCheck" size={12} />Включена</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono-data text-xs text-muted-foreground">{u.lastLogin}</td>
                  <td className="px-4 py-3"><StatusBadge status={u.status} /></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button title="Изменить" className="w-7 h-7 rounded hover:bg-secondary text-muted-foreground"><Icon name="Pencil" size={12} /></button>
                      <button title="Журнал действий" className="w-7 h-7 rounded hover:bg-secondary text-muted-foreground"><Icon name="History" size={12} /></button>
                      <button title={u.status === "active" ? "Заблокировать" : "Разблокировать"} className="w-7 h-7 rounded hover:bg-secondary text-muted-foreground">
                        <Icon name={u.status === "active" ? "Lock" : "Unlock"} size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="bg-card border border-border rounded-lg p-5">
        <h3 className="text-sm font-semibold mb-3">Матрица прав по ролям</h3>
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="text-left py-2">Действие</th>
              <th className="text-center py-2">Админ</th>
              <th className="text-center py-2">Инженер</th>
              <th className="text-center py-2">Оператор</th>
              <th className="text-center py-2">Просмотр</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["Просмотр сети и устройств", true, true, true, true],
              ["Перезагрузка ONU", true, true, true, false],
              ["Изменение конфигурации OLT", true, true, false, false],
              ["Регистрация новых ONU", true, true, true, false],
              ["Управление пользователями", true, false, false, false],
              ["Просмотр CLI / макросы", true, true, false, false],
              ["Восстановление из бэкапа", true, true, false, false],
              ["Удаление устройств", true, false, false, false],
            ].map((row, i) => (
              <tr key={i} className="border-t border-border">
                <td className="py-2">{row[0]}</td>
                {[1, 2, 3, 4].map((col) => (
                  <td key={col} className="text-center py-2">
                    {row[col] ? <Icon name="Check" size={14} className="inline text-green-500" /> : <Icon name="X" size={14} className="inline text-muted-foreground" />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
