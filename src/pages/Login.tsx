import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import Icon from "@/components/ui/icon";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export default function Login() {
  const { login, user } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const r = await login(email, password);
    setLoading(false);
    if (r.ok) {
      toast.success("Добро пожаловать!");
      nav("/dashboard");
    } else {
      toast.error(r.message || "Ошибка");
    }
  };

  return (
    <div className="min-h-screen bg-[hsl(220_13%_9%)] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,hsl(217_91%_60%/0.1),transparent_60%)]" />
      <Link to="/" className="absolute top-6 left-6 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <Icon name="ArrowLeft" size={14} /> На главную
      </Link>

      <div className="w-full max-w-md bg-card border border-border rounded-2xl p-8 relative">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center text-primary">
            <Icon name="LogIn" size={20} />
          </div>
          <div>
            <div className="font-semibold text-lg">Вход в систему</div>
            <div className="text-xs text-muted-foreground">PON Monitor</div>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              className="w-full mt-1 h-10 px-3 bg-secondary border border-border rounded-md text-sm focus:border-primary outline-none"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Пароль</label>
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
            {loading ? <Icon name="Loader2" size={16} className="animate-spin" /> : <Icon name="LogIn" size={16} />}
            Войти
          </button>
        </form>

        <div className="text-xs text-center text-muted-foreground mt-6">
          Нет аккаунта?{" "}
          <Link to="/register" className="text-primary hover:underline">Создать</Link>
        </div>

        <div className="mt-4 p-3 bg-secondary/40 border border-border rounded text-[10px] text-muted-foreground">
          <b className="text-foreground">Демо-доступ администратора:</b><br />
          Email: <code className="font-mono-data text-foreground">admin@local</code><br />
          Пароль: <code className="font-mono-data text-foreground">admin123</code>
        </div>
      </div>
    </div>
  );
}
