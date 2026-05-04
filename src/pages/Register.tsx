import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import Icon from "@/components/ui/icon";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export default function Register() {
  const { register, user } = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Пароль минимум 6 символов");
      return;
    }
    setLoading(true);
    const r = await register(email, password, name);
    setLoading(false);
    if (r.ok) {
      toast.success("Аккаунт создан!");
      nav("/dashboard");
    } else {
      toast.error(r.message || "Ошибка регистрации");
    }
  };

  return (
    <div className="min-h-screen bg-[hsl(220_13%_9%)] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,hsl(142_76%_44%/0.1),transparent_60%)]" />
      <Link to="/" className="absolute top-6 left-6 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <Icon name="ArrowLeft" size={14} /> На главную
      </Link>

      <div className="w-full max-w-md bg-card border border-border rounded-2xl p-8 relative">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-400">
            <Icon name="UserPlus" size={20} />
          </div>
          <div>
            <div className="font-semibold text-lg">Создание аккаунта</div>
            <div className="text-xs text-muted-foreground">PON Monitor</div>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground">Имя</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="w-full mt-1 h-10 px-3 bg-secondary border border-border rounded-md text-sm focus:border-primary outline-none"
              placeholder="Иван Иванов"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full mt-1 h-10 px-3 bg-secondary border border-border rounded-md text-sm focus:border-primary outline-none"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Пароль (от 6 символов)</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full mt-1 h-10 px-3 bg-secondary border border-border rounded-md text-sm focus:border-primary outline-none"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full h-10 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Icon name="Loader2" size={16} className="animate-spin" /> : <Icon name="UserPlus" size={16} />}
            Создать аккаунт
          </button>
        </form>

        <div className="text-xs text-center text-muted-foreground mt-6">
          Уже есть аккаунт?{" "}
          <Link to="/login" className="text-primary hover:underline">Войти</Link>
        </div>
      </div>
    </div>
  );
}
