import Icon from "@/components/ui/icon";

export default function Topbar() {
  return (
    <header className="h-14 border-b border-border bg-card/50 backdrop-blur sticky top-0 z-20 flex items-center px-6 gap-4">
      <div className="flex items-center gap-2 flex-1 max-w-md">
        <div className="relative w-full">
          <Icon
            name="Search"
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            placeholder="Поиск ONU, MAC, серийник..."
            className="w-full h-9 pl-9 pr-3 bg-secondary border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground px-3 py-1.5 bg-secondary rounded-md">
          <span className="status-dot status-online" />
          Все системы работают
        </span>
        <button className="w-9 h-9 rounded-md hover:bg-secondary flex items-center justify-center text-muted-foreground relative">
          <Icon name="Bell" size={16} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-destructive" />
        </button>
        <button className="w-9 h-9 rounded-md hover:bg-secondary flex items-center justify-center text-muted-foreground">
          <Icon name="HelpCircle" size={16} />
        </button>
      </div>
    </header>
  );
}
