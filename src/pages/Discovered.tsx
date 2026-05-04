import { useEffect, useState } from "react";
import { toast } from "sonner";
import Icon from "@/components/ui/icon";
import PageHeader from "@/components/common/PageHeader";

const DISCOVERED_URL = "https://functions.poehali.dev/abad93d7-09ca-427b-aa2a-54953ec499b8";
const MAP_DEVICES_URL = "https://functions.poehali.dev/f7c8b99c-b2f6-45f1-b756-2afe78cdc1d5";

interface Discovered {
  id: number;
  ip: string;
  mac: string;
  hostname: string;
  vendor: string;
  model: string;
  sys_descr: string;
  uptime: string;
  status: string;
  agent_id: string;
  first_seen: string | null;
  last_seen: string | null;
  on_map: boolean;
}

function timeAgo(iso: string | null) {
  if (!iso) return "—";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)} сек назад`;
  if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`;
  return `${Math.floor(diff / 86400)} дн назад`;
}

export default function Discovered() {
  const [items, setItems] = useState<Discovered[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  const load = async () => {
    try {
      const r = await fetch(DISCOVERED_URL);
      const j = await r.json();
      if (j.success) setItems(j.items || []);
    } catch {
      toast.error("Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm("Удалить запись?")) return;
    const r = await fetch(`${DISCOVERED_URL}?id=${id}`, { method: "DELETE" });
    const j = await r.json();
    if (j.success) {
      setItems((x) => x.filter((d) => d.id !== id));
      toast.success("Удалено");
    } else toast.error(j.message || "Ошибка");
  };

  const handleAddToMap = async (d: Discovered) => {
    const lat = 55.7558 + (Math.random() - 0.5) * 0.02;
    const lng = 37.6173 + (Math.random() - 0.5) * 0.02;
    const deviceType =
      /routeros|mikrotik/i.test(d.sys_descr + d.vendor)
        ? "router"
        : /onu|gpon|epon/i.test(d.sys_descr + d.model)
          ? "onu"
          : /olt/i.test(d.sys_descr + d.model)
            ? "olt"
            : "router";
    const r = await fetch(MAP_DEVICES_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        device_type: deviceType,
        name: d.hostname || d.ip,
        lat,
        lng,
        status: d.status,
        comment: `${d.ip}${d.mac ? " · " + d.mac : ""}${d.vendor ? " · " + d.vendor : ""}`,
      }),
    });
    const j = await r.json();
    if (j.success) {
      await fetch(DISCOVERED_URL, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: d.id, on_map: true }),
      });
      setItems((x) => x.map((it) => (it.id === d.id ? { ...it, on_map: true } : it)));
      toast.success(`«${d.hostname || d.ip}» добавлено на карту`);
    } else {
      toast.error(j.message || "Ошибка");
    }
  };

  const filtered = items.filter((d) => {
    if (!filter) return true;
    const f = filter.toLowerCase();
    return (
      d.ip.includes(f) ||
      d.mac.toLowerCase().includes(f) ||
      d.hostname.toLowerCase().includes(f) ||
      d.vendor.toLowerCase().includes(f) ||
      d.model.toLowerCase().includes(f)
    );
  });

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader
        title="Найденное оборудование"
        description="Устройства, обнаруженные Windows-агентом в локальной сети"
        actions={
          <button
            onClick={load}
            className="h-9 px-3 rounded-md bg-secondary border border-border text-sm font-medium flex items-center gap-2 hover:bg-accent"
          >
            <Icon name="RefreshCw" size={14} />
            Обновить
          </button>
        }
      />

      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-md">
            <Icon
              name="Search"
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Поиск по IP, MAC, hostname, vendor..."
              className="w-full h-9 pl-9 pr-3 bg-secondary border border-border rounded text-sm"
            />
          </div>
          <div className="text-xs text-muted-foreground">
            Всего: <span className="font-mono-data text-foreground">{items.length}</span>
            {" · "}На карте:{" "}
            <span className="font-mono-data text-primary">{items.filter((i) => i.on_map).length}</span>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Загрузка...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Icon name="SearchX" size={32} className="mx-auto mb-2 opacity-50" />
            <div className="text-sm">
              {items.length === 0
                ? "Агент ещё не присылал данные. Запусти scanner.exe в локальной сети."
                : "Ничего не найдено"}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground uppercase border-b border-border">
                <tr>
                  <th className="text-left font-medium py-2 px-2">Статус</th>
                  <th className="text-left font-medium py-2 px-2">IP</th>
                  <th className="text-left font-medium py-2 px-2">MAC</th>
                  <th className="text-left font-medium py-2 px-2">Hostname</th>
                  <th className="text-left font-medium py-2 px-2">Vendor</th>
                  <th className="text-left font-medium py-2 px-2">Модель / Описание</th>
                  <th className="text-left font-medium py-2 px-2">Аптайм</th>
                  <th className="text-left font-medium py-2 px-2">Последний раз</th>
                  <th className="text-right font-medium py-2 px-2">Действия</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr key={d.id} className="border-b border-border/50 hover:bg-secondary/40">
                    <td className="py-2 px-2">
                      <span
                        className="inline-block w-2 h-2 rounded-full"
                        style={{
                          background:
                            d.status === "online"
                              ? "hsl(142 76% 44%)"
                              : d.status === "warning"
                                ? "hsl(38 92% 50%)"
                                : "hsl(0 72% 51%)",
                        }}
                      />
                    </td>
                    <td className="py-2 px-2 font-mono-data">{d.ip}</td>
                    <td className="py-2 px-2 font-mono-data text-xs text-muted-foreground">
                      {d.mac || "—"}
                    </td>
                    <td className="py-2 px-2">{d.hostname || "—"}</td>
                    <td className="py-2 px-2">{d.vendor || "—"}</td>
                    <td className="py-2 px-2 max-w-xs truncate" title={d.sys_descr || d.model}>
                      {d.model || d.sys_descr || "—"}
                    </td>
                    <td className="py-2 px-2 text-xs text-muted-foreground">{d.uptime || "—"}</td>
                    <td className="py-2 px-2 text-xs text-muted-foreground">{timeAgo(d.last_seen)}</td>
                    <td className="py-2 px-2 text-right">
                      <div className="flex justify-end gap-1">
                        {d.on_map ? (
                          <span className="text-xs px-2 py-1 rounded bg-primary/15 text-primary">
                            <Icon name="MapPin" size={11} className="inline mr-1" />
                            На карте
                          </span>
                        ) : (
                          <button
                            onClick={() => handleAddToMap(d)}
                            className="text-xs px-2 py-1 rounded bg-secondary border border-border hover:bg-accent flex items-center gap-1"
                          >
                            <Icon name="MapPin" size={11} />
                            На карту
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(d.id)}
                          className="text-xs px-2 py-1 rounded bg-secondary border border-border hover:bg-destructive/20 hover:text-destructive"
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
        )}
      </div>

      <div className="bg-card border border-border rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <Icon name="Terminal" size={14} />
          Как подключить агент
        </h3>
        <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
          <li>Скачай папку <code className="font-mono-data text-foreground">agent/</code> из проекта на Windows-машину в локальной сети.</li>
          <li>Запусти один раз <code className="font-mono-data text-foreground">scanner.py</code> или <code className="font-mono-data text-foreground">run.bat</code> — создастся <code className="font-mono-data text-foreground">config.ini</code>.</li>
          <li>Открой <code className="font-mono-data text-foreground">config.ini</code> и впиши: <code className="font-mono-data text-foreground">token</code> (значение секрета AGENT_TOKEN) и <code className="font-mono-data text-foreground">subnet</code> (свою подсеть).</li>
          <li>Запусти ещё раз. Каждые 60 сек найденное появится в этой таблице. Подробности — в <code className="font-mono-data text-foreground">agent/README.md</code>.</li>
        </ol>
      </div>
    </div>
  );
}
