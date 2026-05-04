import { Link, Navigate } from "react-router-dom";
import Icon from "@/components/ui/icon";
import { useAuth } from "@/contexts/AuthContext";

const FEATURES = [
  { icon: "Radar", title: "Авто-обнаружение", desc: "Агент сам сканирует подсети, находит OLT, ONU, роутеры, серверы. SNMP, SSH, Telnet, REST API — всё подхватывается." },
  { icon: "Map", title: "Карта сети", desc: "Перетаскивай оборудование, рисуй связи, выбирай иконки. Линии пульсируют по реальному трафику." },
  { icon: "Activity", title: "Живые метрики", desc: "CPU, память, RTT, потери пакетов, RX/TX dBm для ONU. Графики за сутки." },
  { icon: "Sparkles", title: "Авто-топология (LLDP)", desc: "Соседи определяются автоматически. Связи OLT→ONU создаются сами." },
  { icon: "ShieldCheck", title: "Безопасность", desc: "Логины/пароли хранятся локально на агенте. На сервер уходит только результат." },
  { icon: "Zap", title: "Просто запускается", desc: "Скачай агент, впиши IP-подсети — через минуту всё оборудование на карте." },
];

export default function Landing() {
  const { user } = useAuth();
  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen bg-[hsl(220_13%_9%)] text-foreground">
      <header className="border-b border-border/50 backdrop-blur sticky top-0 z-10 bg-[hsl(220_13%_9%)]/80">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center text-primary">
              <Icon name="Network" size={20} />
            </div>
            <div>
              <div className="font-semibold">PON Monitor</div>
              <div className="text-[10px] text-muted-foreground">Network observability platform</div>
            </div>
          </div>
          <div className="flex gap-2">
            <Link to="/login" className="h-9 px-4 rounded-md bg-secondary border border-border text-sm font-medium flex items-center hover:bg-accent">
              Войти
            </Link>
            <Link to="/register" className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium flex items-center hover:bg-primary/90">
              Создать аккаунт
            </Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,hsl(217_91%_60%/0.15),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,hsl(142_76%_44%/0.12),transparent_50%)]" />
        <div className="max-w-7xl mx-auto px-6 py-24 relative">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary text-xs font-medium mb-6">
              <Icon name="Sparkles" size={12} />
              Мониторинг для интернет-провайдеров
            </div>
            <h1 className="text-5xl md:text-6xl font-bold leading-tight mb-6">
              Вся твоя сеть<br />
              <span className="bg-gradient-to-r from-primary to-emerald-400 bg-clip-text text-transparent">
                на одной карте
              </span>
            </h1>
            <p className="text-lg text-muted-foreground mb-8 max-w-2xl">
              OLT, коммутаторы, роутеры и абонентские ONU — всё в одном месте, с живой пульсацией трафика, автоматическим обнаружением и тревогами при падении канала.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/register" className="h-12 px-6 rounded-lg bg-primary text-primary-foreground font-medium flex items-center gap-2 hover:bg-primary/90">
                Начать бесплатно
                <Icon name="ArrowRight" size={16} />
              </Link>
              <Link to="/login" className="h-12 px-6 rounded-lg bg-secondary border border-border font-medium flex items-center gap-2 hover:bg-accent">
                <Icon name="LogIn" size={16} />
                У меня уже есть аккаунт
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-6 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <Icon name="Check" size={14} className="text-emerald-400" />
                MikroTik, C-DATA, BDCOM, Huawei, Eltex, Cisco
              </div>
              <div className="flex items-center gap-2">
                <Icon name="Check" size={14} className="text-emerald-400" />
                SNMP / SSH / Telnet / REST
              </div>
              <div className="flex items-center gap-2">
                <Icon name="Check" size={14} className="text-emerald-400" />
                Без облака — данные у тебя
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-card border border-border rounded-xl p-6 hover:border-primary/40 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-primary/15 text-primary flex items-center justify-center mb-4">
                <Icon name={f.icon} size={24} />
              </div>
              <div className="font-semibold mb-2">{f.title}</div>
              <div className="text-sm text-muted-foreground leading-relaxed">{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 py-16">
        <div className="bg-card border border-border rounded-2xl p-8 md:p-12 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,hsl(217_91%_60%/0.15),transparent_60%)]" />
          <div className="relative">
            <h2 className="text-3xl font-bold mb-4">Запусти за 5 минут</h2>
            <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
              Скачаешь агент, впишешь подсети — карта построится сама. Никаких серверов и баз настраивать не нужно.
            </p>
            <Link to="/register" className="inline-flex items-center gap-2 h-12 px-6 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90">
              Создать аккаунт бесплатно
              <Icon name="ArrowRight" size={16} />
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/50 mt-12">
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col md:flex-row justify-between gap-3 text-xs text-muted-foreground">
          <div>© {new Date().getFullYear()} PON Monitor</div>
          <div className="flex gap-4">
            <Link to="/login" className="hover:text-foreground">Вход</Link>
            <Link to="/register" className="hover:text-foreground">Регистрация</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
