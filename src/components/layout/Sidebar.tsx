import { NavLink } from "react-router-dom";
import Icon from "@/components/ui/icon";

const NAV_GROUPS = [
  {
    title: "Мониторинг",
    items: [
      { to: "/", label: "Дашборд", icon: "LayoutDashboard", end: true },
      { to: "/map", label: "Карта сети", icon: "Map" },
      { to: "/topology", label: "Топология", icon: "Workflow" },
      { to: "/events", label: "События", icon: "Bell", badge: 4 },
      { to: "/analytics", label: "Аналитика", icon: "BarChart3" },
    ],
  },
  {
    title: "Оборудование",
    items: [
      { to: "/core-routers", label: "Головные роутеры", icon: "Cpu" },
      { to: "/devices", label: "OLT", icon: "Server" },
      { to: "/onu", label: "ONU / Абоненты", icon: "Router" },
      { to: "/routers", label: "Роутеры", icon: "Wifi" },
      { to: "/unregistered", label: "Незарегистрированные", icon: "CircleHelp", badge: 4 },
      { to: "/discovered", label: "Найдено в сети", icon: "Radar" },
      { to: "/groups", label: "Группы", icon: "Boxes" },
    ],
  },
  {
    title: "Инструменты",
    items: [
      { to: "/macros", label: "Макросы / CLI", icon: "Terminal" },
      { to: "/backups", label: "Бэкапы", icon: "Archive" },
      { to: "/notifications", label: "Уведомления", icon: "Send" },
    ],
  },
  {
    title: "Администрирование",
    items: [
      { to: "/users", label: "Пользователи", icon: "Users" },
      { to: "/settings", label: "Настройки", icon: "Settings" },
    ],
  },
];

export default function Sidebar() {
  return (
    <aside className="w-60 shrink-0 border-r border-border bg-sidebar h-screen sticky top-0 flex flex-col">
      <div className="px-4 h-14 flex items-center gap-2 border-b border-sidebar-border">
        <div className="w-8 h-8 rounded-md bg-primary/15 flex items-center justify-center text-primary">
          <Icon name="Network" size={18} />
        </div>
        <div>
          <div className="text-sm font-semibold leading-tight">PON Monitor</div>
          <div className="text-[10px] text-muted-foreground">v1.0 · OLT C-DATA</div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.title}>
            <div className="px-3 mb-1 text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
              {group.title}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
                >
                  <Icon name={item.icon} size={16} />
                  <span className="flex-1">{item.label}</span>
                  {item.badge && (
                    <span className="text-[10px] font-mono-data px-1.5 py-0.5 rounded bg-destructive/15 text-destructive">
                      {item.badge}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-sidebar-border p-3 flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-semibold">
          АА
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium truncate">Администратор</div>
          <div className="text-[10px] text-muted-foreground truncate">admin@isp.ru</div>
        </div>
        <button className="text-muted-foreground hover:text-foreground">
          <Icon name="LogOut" size={14} />
        </button>
      </div>
    </aside>
  );
}