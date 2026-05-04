import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";
import PageHeader from "@/components/common/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const ADMIN_URL = "https://functions.poehali.dev/21e3740f-8c6d-490e-b169-0b548d5e9ec6";

interface AdminUser {
  id: number;
  email: string;
  name: string;
  role: "user" | "admin";
  is_active: boolean;
  created_at: string | null;
  last_login: string | null;
  active_sessions: number;
}

function timeAgo(iso: string | null) {
  if (!iso) return "—";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "только что";
  if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`;
  return `${Math.floor(diff / 86400)} дн назад`;
}

export default function Admin() {
  const { user, authFetch } = useAuth();
  const [items, setItems] = useState<AdminUser[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newUser, setNewUser] = useState({ email: "", password: "", name: "", role: "user" });
  const [resetPwId, setResetPwId] = useState<number | null>(null);
  const [resetPw, setResetPw] = useState("");

  const load = async () => {
    const r = await authFetch(ADMIN_URL);
    const j = await r.json();
    if (j.success) setItems(j.items || []);
    else toast.error(j.message || "Ошибка");
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (user?.role !== "admin") {
    return (
      <div className="text-center py-24">
        <Icon name="ShieldAlert" size={48} className="mx-auto mb-4 text-destructive" />
        <div className="text-lg font-semibold">Только для администраторов</div>
      </div>
    );
  }

  const create = async () => {
    if (!newUser.email || newUser.password.length < 6) {
      toast.error("Email и пароль (от 6 символов) обязательны");
      return;
    }
    const r = await authFetch(ADMIN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newUser),
    });
    const j = await r.json();
    if (j.success) {
      toast.success("Пользователь создан");
      setNewUser({ email: "", password: "", name: "", role: "user" });
      setShowAdd(false);
      load();
    } else toast.error(j.message);
  };

  const updateUser = async (id: number, patch: Partial<AdminUser> & { password?: string }) => {
    const r = await authFetch(ADMIN_URL, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    const j = await r.json();
    if (j.success) {
      toast.success("Сохранено");
      load();
    } else toast.error(j.message);
  };

  const remove = async (id: number) => {
    if (!confirm("Удалить пользователя?")) return;
    const r = await authFetch(`${ADMIN_URL}?id=${id}`, { method: "DELETE" });
    const j = await r.json();
    if (j.success) {
      toast.success("Удалено");
      load();
    } else toast.error(j.message);
  };

  const doReset = async () => {
    if (resetPw.length < 6) {
      toast.error("Пароль от 6 символов");
      return;
    }
    if (resetPwId) await updateUser(resetPwId, { password: resetPw });
    setResetPwId(null);
    setResetPw("");
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader
        title="Администрирование"
        description="Управление пользователями системы"
        actions={
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2 hover:bg-primary/90"
          >
            <Icon name="UserPlus" size={14} />
            Создать пользователя
          </button>
        }
      />

      {showAdd && (
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-xs uppercase text-muted-foreground font-semibold mb-3">Новый пользователь</div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input
              placeholder="Email"
              value={newUser.email}
              onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
              className="h-9 px-3 bg-secondary border border-border rounded text-sm"
            />
            <input
              placeholder="Имя"
              value={newUser.name}
              onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
              className="h-9 px-3 bg-secondary border border-border rounded text-sm"
            />
            <input
              type="password"
              placeholder="Пароль"
              value={newUser.password}
              onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
              className="h-9 px-3 bg-secondary border border-border rounded text-sm"
            />
            <select
              value={newUser.role}
              onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
              className="h-9 px-3 bg-secondary border border-border rounded text-sm"
            >
              <option value="user">Пользователь</option>
              <option value="admin">Администратор</option>
            </select>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={create} className="h-9 px-4 rounded bg-primary text-primary-foreground text-sm font-medium">
              Создать
            </button>
            <button onClick={() => setShowAdd(false)} className="h-9 px-4 rounded bg-secondary border border-border text-sm">
              Отмена
            </button>
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground uppercase border-b border-border bg-secondary/40">
              <tr>
                <th className="text-left p-3">ID</th>
                <th className="text-left p-3">Email</th>
                <th className="text-left p-3">Имя</th>
                <th className="text-left p-3">Роль</th>
                <th className="text-left p-3">Статус</th>
                <th className="text-left p-3">Сессий</th>
                <th className="text-left p-3">Создан</th>
                <th className="text-left p-3">Последний вход</th>
                <th className="text-right p-3">Действия</th>
              </tr>
            </thead>
            <tbody>
              {items.map((u) => (
                <tr key={u.id} className="border-b border-border/50 hover:bg-secondary/30">
                  <td className="p-3 font-mono-data text-xs text-muted-foreground">{u.id}</td>
                  <td className="p-3 font-mono-data">{u.email}</td>
                  <td className="p-3">{u.name || "—"}</td>
                  <td className="p-3">
                    <select
                      value={u.role}
                      onChange={(e) => updateUser(u.id, { role: e.target.value as "user" | "admin" })}
                      disabled={u.id === user.id}
                      className="bg-secondary border border-border rounded px-2 py-1 text-xs"
                    >
                      <option value="user">user</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td className="p-3">
                    <button
                      onClick={() => updateUser(u.id, { is_active: !u.is_active })}
                      disabled={u.id === user.id}
                      className={`px-2 py-1 rounded text-[10px] font-medium ${u.is_active ? "bg-emerald-500/20 text-emerald-400" : "bg-destructive/20 text-destructive"}`}
                    >
                      {u.is_active ? "активен" : "заблокирован"}
                    </button>
                  </td>
                  <td className="p-3 text-xs font-mono-data">{u.active_sessions}</td>
                  <td className="p-3 text-xs text-muted-foreground">{timeAgo(u.created_at)}</td>
                  <td className="p-3 text-xs text-muted-foreground">{timeAgo(u.last_login)}</td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => setResetPwId(u.id)}
                        className="text-xs px-2 py-1 rounded bg-secondary border border-border hover:bg-accent flex items-center gap-1"
                        title="Сбросить пароль"
                      >
                        <Icon name="KeyRound" size={11} />
                      </button>
                      <button
                        onClick={() => remove(u.id)}
                        disabled={u.id === user.id}
                        className="text-xs px-2 py-1 rounded bg-secondary border border-border hover:bg-destructive/20 hover:text-destructive disabled:opacity-30"
                        title="Удалить"
                      >
                        <Icon name="Trash2" size={11} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {resetPwId && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setResetPwId(null)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="font-semibold mb-3 flex items-center gap-2">
              <Icon name="KeyRound" size={16} />
              Сброс пароля
            </div>
            <input
              type="password"
              autoFocus
              value={resetPw}
              onChange={(e) => setResetPw(e.target.value)}
              placeholder="Новый пароль (от 6 символов)"
              className="w-full h-10 px-3 bg-secondary border border-border rounded text-sm"
            />
            <div className="flex gap-2 mt-4">
              <button onClick={doReset} className="flex-1 h-9 rounded bg-primary text-primary-foreground text-sm font-medium">
                Сохранить
              </button>
              <button onClick={() => setResetPwId(null)} className="h-9 px-4 rounded bg-secondary border border-border text-sm">
                Отмена
              </button>
            </div>
            <div className="text-[10px] text-muted-foreground mt-3">
              <Icon name="Info" size={10} className="inline mr-1" />
              После сброса все активные сессии пользователя завершатся
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
