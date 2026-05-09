import { useEffect, useState } from "react";
import { toast } from "sonner";
import Icon from "@/components/ui/icon";
import PageHeader from "@/components/common/PageHeader";
import { useAuth } from "@/contexts/AuthContext";

const DISCOVERED_URL = "https://functions.poehali.dev/abad93d7-09ca-427b-aa2a-54953ec499b8";
const MAP_DEVICES_URL = "https://functions.poehali.dev/f7c8b99c-b2f6-45f1-b756-2afe78cdc1d5";
const AGENT_BUILD_URL = "https://functions.poehali.dev/e169029d-d980-4c62-89ad-b59e09fab4bd";
const ADMIN_AGENTS_URL = "https://functions.poehali.dev/0b15fa47-7f82-4fc6-aaf5-4a56f9ed828f";

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
  cpu_load?: number;
  mem_used?: number;
  mem_total?: number;
  ping_loss?: number;
  ping_rtt_ms?: number;
  contact?: string;
  location?: string;
}

interface IfRow {
  if_index: number;
  if_name: string;
  in_octets: number;
  out_octets: number;
  in_bps: number;
  out_bps: number;
  speed_mbps: number;
  oper_status: string;
}

interface DeviceDetail extends Discovered {
  interfaces: IfRow[];
  history: { ts: number; cpu: number; mem: number; rtt: number; in_bps: number; out_bps: number }[];
}

function fmtBps(bps: number): string {
  if (!bps) return "0";
  if (bps > 1_000_000) return (bps / 1_000_000).toFixed(2) + " Мбит/с";
  if (bps > 1_000) return (bps / 1_000).toFixed(1) + " Кбит/с";
  return bps + " бит/с";
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
  const { user, authFetch } = useAuth();
  const [items, setItems] = useState<Discovered[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [detail, setDetail] = useState<DeviceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [agents, setAgents] = useState<{ agent_id: string; status: string; hostname: string }[]>([]);
  const [addIp, setAddIp] = useState("");
  const [addCommunity, setAddCommunity] = useState("public");
  const [addAgent, setAddAgent] = useState("");
  const [addSubnetToo, setAddSubnetToo] = useState(true);
  const [adding, setAdding] = useState(false);

  const isAdmin = user?.role === "admin";

  const loadAgents = async () => {
    if (!isAdmin) return;
    try {
      const r = await authFetch(`${ADMIN_AGENTS_URL}?action=list`);
      const j = await r.json();
      if (j.success) {
        const list = (j.items || []).map((a: { agent_id: string; status: string; hostname?: string }) => ({
          agent_id: a.agent_id,
          status: a.status,
          hostname: a.hostname || "",
        }));
        setAgents(list);
        const online = list.find((a: { status: string }) => a.status === "online");
        if (online && !addAgent) setAddAgent(online.agent_id);
        else if (list.length && !addAgent) setAddAgent(list[0].agent_id);
      }
    } catch {
      // ignore
    }
  };

  const sendAgentCommand = async (agent_id: string, command: string, payload: object) => {
    const r = await authFetch(`${ADMIN_AGENTS_URL}?action=command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_id, command, payload }),
    });
    return r.json();
  };

  const handlePollSnmp = async (ip: string) => {
    if (!isAdmin) {
      toast.error("Только администратор может опрашивать SNMP");
      return;
    }
    if (!agents.length) {
      toast.error("Нет доступных агентов");
      return;
    }
    const onlineAgent = agents.find((a) => a.status === "online")?.agent_id || agents[0].agent_id;
    const community = prompt(`SNMP community для опроса ${ip}:`, "public");
    if (!community) return;
    const j = await sendAgentCommand(onlineAgent, "snmp_poll", { ip, community });
    if (j.success) {
      toast.success(`Команда отправлена агенту ${onlineAgent}. Результат будет через 10–30 сек.`);
      setTimeout(load, 15000);
    } else toast.error(j.message || "Ошибка");
  };

  const handleAddManual = async () => {
    if (!addIp.trim()) {
      toast.error("Укажи IP");
      return;
    }
    if (!addAgent) {
      toast.error("Выбери агента");
      return;
    }
    setAdding(true);
    try {
      if (addSubnetToo) {
        const parts = addIp.split(".");
        if (parts.length === 4) {
          const subnet = `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
          await sendAgentCommand(addAgent, "add_subnet", { subnet });
        }
      }
      const j = await sendAgentCommand(addAgent, "snmp_poll", {
        ip: addIp.trim(),
        community: addCommunity.trim() || "public",
      });
      if (j.success) {
        toast.success("Команда поставлена в очередь. Через 10–30 сек устройство появится.");
        setShowAdd(false);
        setAddIp("");
        setTimeout(load, 15000);
      } else toast.error(j.message || "Ошибка");
    } finally {
      setAdding(false);
    }
  };

  const openDetail = async (id: number) => {
    setDetailLoading(true);
    try {
      const r = await fetch(`${DISCOVERED_URL}?id=${id}`);
      const j = await r.json();
      if (j.success) setDetail(j.item);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDownloadAgent = async () => {
    setDownloading(true);
    try {
      const r = await fetch(AGENT_BUILD_URL);
      const j = await r.json();
      if (j.success && j.url) {
        const a = document.createElement("a");
        a.href = j.url;
        a.download = "network-agent.zip";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        toast.success("Архив скачивается");
      } else {
        toast.error("Не удалось собрать архив");
      }
    } catch {
      toast.error("Ошибка скачивания");
    } finally {
      setDownloading(false);
    }
  };

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
    loadAgents();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          <div className="flex gap-2">
            {isAdmin && (
              <button
                onClick={() => setShowAdd(true)}
                className="h-9 px-3 rounded-md bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-sm font-medium flex items-center gap-2 hover:bg-emerald-500/25"
              >
                <Icon name="Plus" size={14} />
                Добавить устройство
              </button>
            )}
            <button
              onClick={handleDownloadAgent}
              disabled={downloading}
              className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2 hover:bg-primary/90 disabled:opacity-50"
            >
              <Icon name={downloading ? "Loader2" : "Download"} size={14} className={downloading ? "animate-spin" : ""} />
              {downloading ? "Готовлю..." : "Скачать агент"}
            </button>
            <button
              onClick={load}
              className="h-9 px-3 rounded-md bg-secondary border border-border text-sm font-medium flex items-center gap-2 hover:bg-accent"
            >
              <Icon name="RefreshCw" size={14} />
              Обновить
            </button>
          </div>
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
                  <th className="text-left font-medium py-2 px-2">CPU</th>
                  <th className="text-left font-medium py-2 px-2">RTT</th>
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
                    <td className="py-2 px-2 max-w-xs truncate cursor-pointer hover:text-primary" title="Подробности" onClick={() => openDetail(d.id)}>
                      {d.model || d.sys_descr || "—"}
                    </td>
                    <td className="py-2 px-2 text-xs font-mono-data" style={{ color: (d.cpu_load || 0) > 80 ? "hsl(0 72% 60%)" : (d.cpu_load || 0) > 50 ? "hsl(38 92% 60%)" : "inherit" }}>
                      {d.cpu_load ? `${d.cpu_load}%` : "—"}
                    </td>
                    <td className="py-2 px-2 text-xs font-mono-data text-muted-foreground">
                      {d.ping_rtt_ms ? `${d.ping_rtt_ms}ms` : "—"}
                      {d.ping_loss ? <span className="ml-1 text-destructive">·{d.ping_loss}%</span> : null}
                    </td>
                    <td className="py-2 px-2 text-xs text-muted-foreground">{d.uptime || "—"}</td>
                    <td className="py-2 px-2 text-xs text-muted-foreground">{timeAgo(d.last_seen)}</td>
                    <td className="py-2 px-2 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => openDetail(d.id)}
                          className="text-xs px-2 py-1 rounded bg-secondary border border-border hover:bg-accent flex items-center gap-1"
                          title="Подробности"
                        >
                          <Icon name="Eye" size={11} />
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => handlePollSnmp(d.ip)}
                            className="text-xs px-2 py-1 rounded bg-secondary border border-border hover:bg-accent flex items-center gap-1"
                            title="Опросить SNMP через агента"
                          >
                            <Icon name="Radar" size={11} />
                          </button>
                        )}
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
        <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
          <li>Нажми кнопку <b className="text-foreground">«Скачать агент»</b> вверху — получишь <code className="font-mono-data text-foreground">network-agent.zip</code>.</li>
          <li>Распакуй архив на любом Windows-компьютере в нужной локальной сети.</li>
          <li>Установи Python 3.9+ с <a href="https://www.python.org/downloads/" target="_blank" rel="noreferrer" className="text-primary underline">python.org</a> (галочка <b>Add Python to PATH</b>).</li>
          <li>Двойной клик на <code className="font-mono-data text-foreground">install_deps.bat</code> — установит SNMP-библиотеку.</li>
          <li>Двойной клик на <code className="font-mono-data text-foreground">run.bat</code> — создастся <code className="font-mono-data text-foreground">config.ini</code>.</li>
          <li>Открой <code className="font-mono-data text-foreground">config.ini</code> в Блокноте и впиши: <code className="font-mono-data text-foreground">token</code> (значение секрета AGENT_TOKEN с сайта) и <code className="font-mono-data text-foreground">subnet</code> (свою подсеть, например <code className="font-mono-data text-foreground">192.168.88.0/24</code>).</li>
          <li>Снова двойной клик на <code className="font-mono-data text-foreground">run.bat</code>. Окно консоли оставь открытым — каждые 60 сек найденное оборудование появится в этой таблице.</li>
          <li><b className="text-foreground">Несколько подсетей:</b> в <code className="font-mono-data text-foreground">subnet</code> перечисли через запятую: <code className="font-mono-data text-foreground">192.168.1.0/24, 192.168.88.0/24, 10.0.0.0/24</code>.</li>
          <li>(Опционально) Запусти <code className="font-mono-data text-foreground">build_exe.bat</code>, чтобы получить один <code className="font-mono-data text-foreground">scanner.exe</code> без установки Python.</li>
        </ol>
      </div>

      {(detail || detailLoading) && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setDetail(null)}
        >
          <div
            className="bg-card border border-border rounded-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {detailLoading && !detail ? (
              <div className="p-12 text-center text-muted-foreground">Загрузка...</div>
            ) : detail ? (
              <>
                <div className="sticky top-0 bg-card border-b border-border p-4 flex items-center justify-between">
                  <div>
                    <div className="text-lg font-semibold flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{
                          background:
                            detail.status === "online"
                              ? "hsl(142 76% 44%)"
                              : detail.status === "warning"
                                ? "hsl(38 92% 50%)"
                                : "hsl(0 72% 51%)",
                        }}
                      />
                      {detail.hostname || detail.ip}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono-data">
                      {detail.ip} · {detail.mac || "—"} · {detail.vendor || "—"}
                    </div>
                  </div>
                  <button
                    onClick={() => setDetail(null)}
                    className="w-8 h-8 rounded hover:bg-secondary flex items-center justify-center"
                  >
                    <Icon name="X" size={16} />
                  </button>
                </div>

                <div className="p-4 space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-secondary/40 rounded-lg p-3 border border-border">
                      <div className="text-[10px] text-muted-foreground uppercase">CPU</div>
                      <div className="text-2xl font-mono-data mt-1">{detail.cpu_load || 0}%</div>
                      <div className="h-1.5 bg-border rounded mt-2 overflow-hidden">
                        <div
                          className="h-full transition-all"
                          style={{
                            width: `${Math.min(100, detail.cpu_load || 0)}%`,
                            background: (detail.cpu_load || 0) > 80 ? "hsl(0 72% 51%)" : "hsl(142 76% 44%)",
                          }}
                        />
                      </div>
                    </div>
                    <div className="bg-secondary/40 rounded-lg p-3 border border-border">
                      <div className="text-[10px] text-muted-foreground uppercase">Память</div>
                      <div className="text-2xl font-mono-data mt-1">
                        {detail.mem_total
                          ? `${Math.round(((detail.mem_used || 0) / detail.mem_total) * 100)}%`
                          : "—"}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-1">
                        {detail.mem_total
                          ? `${Math.round((detail.mem_used || 0) / 1024)} / ${Math.round(detail.mem_total / 1024)} КБ`
                          : "не доступно"}
                      </div>
                    </div>
                    <div className="bg-secondary/40 rounded-lg p-3 border border-border">
                      <div className="text-[10px] text-muted-foreground uppercase">Ping RTT</div>
                      <div className="text-2xl font-mono-data mt-1">{detail.ping_rtt_ms || 0} <span className="text-sm text-muted-foreground">ms</span></div>
                      <div className="text-[10px] text-muted-foreground mt-1">потери: {detail.ping_loss || 0}%</div>
                    </div>
                    <div className="bg-secondary/40 rounded-lg p-3 border border-border">
                      <div className="text-[10px] text-muted-foreground uppercase">Аптайм</div>
                      <div className="text-base font-mono-data mt-1">{detail.uptime || "—"}</div>
                    </div>
                  </div>

                  {(detail.contact || detail.location) && (
                    <div className="grid grid-cols-2 gap-3">
                      {detail.location && (
                        <div className="bg-secondary/40 rounded p-2 border border-border text-xs">
                          <span className="text-muted-foreground">Расположение: </span>
                          {detail.location}
                        </div>
                      )}
                      {detail.contact && (
                        <div className="bg-secondary/40 rounded p-2 border border-border text-xs">
                          <span className="text-muted-foreground">Контакт: </span>
                          {detail.contact}
                        </div>
                      )}
                    </div>
                  )}

                  {detail.sys_descr && (
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase mb-1">Описание SNMP</div>
                      <div className="text-xs bg-secondary/40 rounded p-2 border border-border font-mono-data whitespace-pre-wrap">
                        {detail.sys_descr}
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="text-xs uppercase text-muted-foreground font-semibold mb-2 flex items-center gap-2">
                      <Icon name="Network" size={12} />
                      Интерфейсы ({detail.interfaces.length})
                    </div>
                    {detail.interfaces.length === 0 ? (
                      <div className="text-xs text-muted-foreground bg-secondary/30 rounded p-3 border border-border">
                        SNMP-интерфейсы не получены. Включи на устройстве SNMP с community <code>public</code> или открой UDP/161.
                      </div>
                    ) : (
                      <div className="overflow-x-auto border border-border rounded">
                        <table className="w-full text-xs">
                          <thead className="bg-secondary/40 text-muted-foreground">
                            <tr>
                              <th className="text-left p-2">#</th>
                              <th className="text-left p-2">Имя</th>
                              <th className="text-left p-2">Статус</th>
                              <th className="text-right p-2">Скорость</th>
                              <th className="text-right p-2">IN</th>
                              <th className="text-right p-2">OUT</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detail.interfaces.map((iface) => (
                              <tr key={iface.if_index} className="border-t border-border/50">
                                <td className="p-2 font-mono-data">{iface.if_index}</td>
                                <td className="p-2 font-mono-data">{iface.if_name}</td>
                                <td className="p-2">
                                  <span
                                    className="px-1.5 py-0.5 rounded text-[10px]"
                                    style={{
                                      background:
                                        iface.oper_status === "up"
                                          ? "hsl(142 76% 44% / 0.2)"
                                          : "hsl(0 72% 51% / 0.2)",
                                      color:
                                        iface.oper_status === "up"
                                          ? "hsl(142 76% 60%)"
                                          : "hsl(0 72% 60%)",
                                    }}
                                  >
                                    {iface.oper_status}
                                  </span>
                                </td>
                                <td className="p-2 text-right font-mono-data text-muted-foreground">
                                  {iface.speed_mbps ? `${iface.speed_mbps} Мбит/с` : "—"}
                                </td>
                                <td className="p-2 text-right font-mono-data text-emerald-400">
                                  {fmtBps(iface.in_bps)}
                                </td>
                                <td className="p-2 text-right font-mono-data text-blue-400">
                                  {fmtBps(iface.out_bps)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {detail.history.length > 1 && (
                    <div>
                      <div className="text-xs uppercase text-muted-foreground font-semibold mb-2 flex items-center gap-2">
                        <Icon name="Activity" size={12} />
                        История трафика (последние {detail.history.length} замеров)
                      </div>
                      <div className="bg-secondary/30 rounded p-3 border border-border">
                        <svg viewBox="0 0 600 120" className="w-full" preserveAspectRatio="none" style={{ height: 120 }}>
                          {(() => {
                            const maxBps = Math.max(...detail.history.map((h) => Math.max(h.in_bps, h.out_bps)), 1);
                            const w = 600;
                            const h = 120;
                            const step = w / Math.max(1, detail.history.length - 1);
                            const points = (key: "in_bps" | "out_bps") =>
                              detail.history
                                .map((p, i) => `${i * step},${h - (p[key] / maxBps) * h * 0.9}`)
                                .join(" ");
                            return (
                              <>
                                <polyline points={points("in_bps")} fill="none" stroke="hsl(142 76% 50%)" strokeWidth={1.5} />
                                <polyline points={points("out_bps")} fill="none" stroke="hsl(217 91% 60%)" strokeWidth={1.5} />
                              </>
                            );
                          })()}
                        </svg>
                        <div className="flex gap-4 text-[10px] text-muted-foreground mt-1">
                          <span><span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1" />IN</span>
                          <span><span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1" />OUT</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}

      {showAdd && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowAdd(false)}
        >
          <div
            className="bg-card border border-border rounded-xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="font-semibold flex items-center gap-2">
                <Icon name="Plus" size={16} />
                Добавить устройство вручную
              </div>
              <button
                onClick={() => setShowAdd(false)}
                className="w-8 h-8 rounded hover:bg-secondary flex items-center justify-center"
              >
                <Icon name="X" size={16} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-[11px] uppercase text-muted-foreground">IP-адрес</label>
                <input
                  value={addIp}
                  onChange={(e) => setAddIp(e.target.value)}
                  placeholder="10.255.230.14"
                  className="w-full h-9 px-3 mt-1 bg-secondary border border-border rounded text-sm font-mono-data"
                />
              </div>
              <div>
                <label className="text-[11px] uppercase text-muted-foreground">SNMP community</label>
                <input
                  value={addCommunity}
                  onChange={(e) => setAddCommunity(e.target.value)}
                  placeholder="public"
                  className="w-full h-9 px-3 mt-1 bg-secondary border border-border rounded text-sm font-mono-data"
                />
              </div>
              <div>
                <label className="text-[11px] uppercase text-muted-foreground">Через какого агента</label>
                <select
                  value={addAgent}
                  onChange={(e) => setAddAgent(e.target.value)}
                  className="w-full h-9 px-2 mt-1 bg-secondary border border-border rounded text-sm"
                >
                  {agents.length === 0 && <option value="">Нет агентов</option>}
                  {agents.map((a) => (
                    <option key={a.agent_id} value={a.agent_id}>
                      {a.agent_id} {a.hostname ? `(${a.hostname})` : ""} — {a.status}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={addSubnetToo}
                  onChange={(e) => setAddSubnetToo(e.target.checked)}
                />
                <span>Добавить подсеть /24 в постоянное сканирование</span>
              </label>
              <div className="text-[11px] text-muted-foreground bg-secondary/40 border border-border rounded p-2">
                Агент опросит устройство по SNMP и сразу пришлёт данные. Если включена опция — подсеть добавится в config.ini, и устройство будет опрашиваться автоматически каждый цикл.
              </div>
            </div>
            <div className="p-4 border-t border-border flex justify-end gap-2">
              <button
                onClick={() => setShowAdd(false)}
                className="h-9 px-3 rounded-md bg-secondary border border-border text-sm hover:bg-accent"
              >
                Отмена
              </button>
              <button
                onClick={handleAddManual}
                disabled={adding || !addIp.trim() || !addAgent}
                className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2 hover:bg-primary/90 disabled:opacity-50"
              >
                {adding && <Icon name="Loader2" size={14} className="animate-spin" />}
                <Icon name={adding ? "Loader2" : "Send"} size={14} className={adding ? "hidden" : ""} />
                Опросить и добавить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}