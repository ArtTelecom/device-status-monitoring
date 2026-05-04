import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";
import PageHeader from "@/components/common/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const ADMIN_AGENTS_URL = "https://functions.poehali.dev/0b15fa47-7f82-4fc6-aaf5-4a56f9ed828f";
const AGENT_BUILD_URL = "https://functions.poehali.dev/e169029d-d980-4c62-89ad-b59e09fab4bd";

interface Agent {
  id: number;
  agent_id: string;
  name: string;
  hostname: string;
  os: string;
  version: number;
  ip: string;
  status: string;
  last_seen: string | null;
  registered_at: string | null;
  config_json: string;
  notes: string;
  pending_commands: number;
}

interface VersionInfo {
  version: number;
  notes: string;
  uploaded_at: string | null;
}

interface CmdLog {
  id: number;
  command: string;
  payload: string;
  status: string;
  result: string;
  created_at: string | null;
  completed_at: string | null;
}

function timeAgo(iso: string | null) {
  if (!iso) return "—";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)} сек назад`;
  if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`;
  return `${Math.floor(diff / 86400)} дн назад`;
}

const COMMANDS = [
  { id: "rescan_now", label: "Сканировать сейчас", icon: "RefreshCw" },
  { id: "self_update", label: "Обновить агент", icon: "Download" },
  { id: "restart", label: "Перезапустить", icon: "RotateCw" },
  { id: "reload_config", label: "Перечитать config", icon: "FileCog" },
  { id: "shutdown", label: "Остановить", icon: "Power" },
];

export default function Agents() {
  const { user, authFetch } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [currentVersion, setCurrentVersion] = useState<VersionInfo | null>(null);
  const [selected, setSelected] = useState<Agent | null>(null);
  const [logs, setLogs] = useState<CmdLog[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadSource, setUploadSource] = useState("");
  const [uploadNotes, setUploadNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [showShell, setShowShell] = useState(false);
  const [shellCmd, setShellCmd] = useState("");
  const [showCfg, setShowCfg] = useState<"interval" | "subnet" | null>(null);
  const [cfgValue, setCfgValue] = useState("");

  const load = async () => {
    const r = await authFetch(`${ADMIN_AGENTS_URL}?action=list`);
    const j = await r.json();
    if (j.success) {
      setAgents(j.items || []);
      setCurrentVersion(j.current_version || null);
      if (selected) {
        const upd = (j.items || []).find((a: Agent) => a.agent_id === selected.agent_id);
        if (upd) setSelected(upd);
      }
    }
  };

  const loadLogs = async (agent_id: string) => {
    const r = await authFetch(`${ADMIN_AGENTS_URL}?action=commands&agent_id=${agent_id}`);
    const j = await r.json();
    if (j.success) setLogs(j.items || []);
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selected) {
      loadLogs(selected.agent_id);
      const t = setInterval(() => loadLogs(selected.agent_id), 5000);
      return () => clearInterval(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.agent_id]);

  if (user?.role !== "admin") {
    return (
      <div className="text-center py-24">
        <Icon name="ShieldAlert" size={48} className="mx-auto mb-4 text-destructive" />
        <div className="text-lg font-semibold">Только для администраторов</div>
      </div>
    );
  }

  const sendCommand = async (agent_id: string, command: string, payload: object = {}) => {
    if (command === "shutdown" && !confirm("Остановить агент?")) return;
    const r = await authFetch(`${ADMIN_AGENTS_URL}?action=command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_id, command, payload }),
    });
    const j = await r.json();
    if (j.success) {
      toast.success(j.queued ? `Команда отправлена ${j.queued} агентам` : "Команда поставлена в очередь");
      if (selected && (agent_id === selected.agent_id || agent_id === "*")) loadLogs(selected.agent_id);
    } else toast.error(j.message || "Ошибка");
  };

  const removeAgent = async (agent_id: string) => {
    if (!confirm(`Удалить агента «${agent_id}»? История команд тоже будет стёрта.`)) return;
    const r = await authFetch(`${ADMIN_AGENTS_URL}?agent_id=${agent_id}`, { method: "DELETE" });
    const j = await r.json();
    if (j.success) {
      toast.success("Удалено");
      setSelected(null);
      load();
    }
  };

  const uploadVersion = async () => {
    if (uploadSource.length < 200) {
      toast.error("Файл слишком короткий — это точно scanner.py?");
      return;
    }
    setUploading(true);
    const r = await authFetch(`${ADMIN_AGENTS_URL}?action=upload_version`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: uploadSource, notes: uploadNotes }),
    });
    const j = await r.json();
    setUploading(false);
    if (j.success) {
      toast.success(`Версия v${j.version} загружена. Все агенты обновятся при следующем heartbeat.`);
      setShowUpload(false);
      setUploadSource("");
      setUploadNotes("");
      load();
    } else toast.error(j.message);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setUploadSource(String(reader.result || ""));
    reader.readAsText(file);
  };

  const downloadAgentZip = async () => {
    const r = await fetch(AGENT_BUILD_URL);
    const j = await r.json();
    if (j.success && j.url) {
      const a = document.createElement("a");
      a.href = j.url;
      a.download = "network-agent.zip";
      a.click();
      toast.success("Архив скачивается");
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader
        title="Агенты"
        description="Управление Windows-агентами: команды, обновления, мониторинг."
        actions={
          <div className="flex gap-2">
            <button
              onClick={downloadAgentZip}
              className="h-9 px-3 rounded-md bg-secondary border border-border text-sm font-medium flex items-center gap-2 hover:bg-accent"
            >
              <Icon name="Download" size={14} />
              Скачать ZIP
            </button>
            <button
              onClick={() => setShowUpload((v) => !v)}
              className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2 hover:bg-primary/90"
            >
              <Icon name="Upload" size={14} />
              Загрузить новую версию
            </button>
            <button
              onClick={() => sendCommand("*", "self_update")}
              disabled={!agents.length}
              className="h-9 px-3 rounded-md bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-sm font-medium flex items-center gap-2 hover:bg-emerald-500/25 disabled:opacity-50"
            >
              <Icon name="Sparkles" size={14} />
              Обновить всех
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-[10px] uppercase text-muted-foreground">Активная версия</div>
          <div className="text-3xl font-mono-data mt-1 text-primary">v{currentVersion?.version || "—"}</div>
          <div className="text-[10px] text-muted-foreground mt-1">
            {currentVersion?.notes || "версия не загружена"}
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-[10px] uppercase text-muted-foreground">Агентов всего</div>
          <div className="text-3xl font-mono-data mt-1">{agents.length}</div>
          <div className="text-[10px] text-emerald-400 mt-1">
            online: {agents.filter((a) => a.status === "online").length}
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-[10px] uppercase text-muted-foreground">Требуют обновления</div>
          <div className="text-3xl font-mono-data mt-1 text-red-400">
            {agents.filter((a) => currentVersion && a.version < currentVersion.version).length}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">
            обновятся автоматически при heartbeat
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 bg-card border border-border rounded-lg overflow-hidden">
          <div className="p-3 border-b border-border text-xs uppercase text-muted-foreground font-semibold">
            Список агентов
          </div>
          {agents.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <Icon name="Cpu" size={28} className="mx-auto mb-2 opacity-50" />
              Нет зарегистрированных агентов.<br />
              <span className="text-xs">Скачай агент, запусти и впиши токен в config.ini.</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[10px] uppercase text-muted-foreground bg-secondary/40">
                  <tr>
                    <th className="text-left p-2">Статус</th>
                    <th className="text-left p-2">Agent ID / Hostname</th>
                    <th className="text-left p-2">IP</th>
                    <th className="text-left p-2">Версия</th>
                    <th className="text-left p-2">Heartbeat</th>
                    <th className="text-left p-2">Очередь</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {agents.map((a) => {
                    const needsUpd = currentVersion && a.version < currentVersion.version;
                    return (
                      <tr
                        key={a.id}
                        className={`border-t border-border/50 hover:bg-secondary/30 cursor-pointer ${selected?.id === a.id ? "bg-secondary/50" : ""}`}
                        onClick={() => setSelected(a)}
                      >
                        <td className="p-2">
                          <span
                            className="inline-block w-2 h-2 rounded-full"
                            style={{ background: a.status === "online" ? "hsl(142 76% 44%)" : "hsl(0 72% 51%)" }}
                          />
                        </td>
                        <td className="p-2">
                          <div className="font-mono-data text-xs">{a.agent_id}</div>
                          <div className="text-[10px] text-muted-foreground">{a.hostname || "—"}</div>
                        </td>
                        <td className="p-2 font-mono-data text-xs text-muted-foreground">{a.ip || "—"}</td>
                        <td className="p-2">
                          <span className={`font-mono-data text-xs ${needsUpd ? "text-red-400" : ""}`}>
                            v{a.version}
                            {needsUpd && (
                              <span className="ml-1 text-[10px]">→ v{currentVersion?.version}</span>
                            )}
                          </span>
                        </td>
                        <td className="p-2 text-xs text-muted-foreground">{timeAgo(a.last_seen)}</td>
                        <td className="p-2">
                          {a.pending_commands > 0 ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-mono-data">
                              {a.pending_commands}
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">0</span>
                          )}
                        </td>
                        <td className="p-2 text-right">
                          <button
                            onClick={(e) => { e.stopPropagation(); removeAgent(a.agent_id); }}
                            className="text-xs px-2 py-1 rounded hover:bg-destructive/20 hover:text-destructive"
                          >
                            <Icon name="Trash2" size={11} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          {!selected ? (
            <div className="text-center text-muted-foreground py-12">
              <Icon name="MousePointer2" size={28} className="mx-auto mb-2 opacity-50" />
              <div className="text-sm">Выбери агент чтобы управлять</div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <div className="text-xs uppercase text-muted-foreground font-semibold">Агент</div>
                <div className="font-mono-data text-sm mt-1">{selected.agent_id}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {selected.hostname} · {selected.os}
                </div>
              </div>

              <div>
                <div className="text-[10px] text-muted-foreground uppercase mb-2">Команды</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {COMMANDS.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => sendCommand(selected.agent_id, c.id)}
                      className="h-9 rounded-md bg-secondary border border-border hover:bg-accent text-xs flex items-center justify-center gap-1.5"
                    >
                      <Icon name={c.icon} size={12} />
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[10px] text-muted-foreground uppercase mb-2">Изменить настройки</div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => { setShowCfg("interval"); setCfgValue("60"); }}
                    className="h-9 rounded-md bg-secondary border border-border hover:bg-accent text-xs flex items-center justify-center gap-1.5"
                  >
                    <Icon name="Timer" size={12} />
                    Интервал
                  </button>
                  <button
                    onClick={() => { setShowCfg("subnet"); setCfgValue(""); }}
                    className="h-9 rounded-md bg-secondary border border-border hover:bg-accent text-xs flex items-center justify-center gap-1.5"
                  >
                    <Icon name="Globe" size={12} />
                    Подсети
                  </button>
                </div>
              </div>

              <div>
                <button
                  onClick={() => setShowShell(true)}
                  className="w-full h-9 rounded-md bg-red-500/15 border border-red-500/40 text-red-300 text-xs flex items-center justify-center gap-1.5"
                >
                  <Icon name="Terminal" size={12} />
                  Выполнить shell-команду
                </button>
              </div>

              <div>
                <div className="text-[10px] text-muted-foreground uppercase mb-2">История команд</div>
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {logs.length === 0 && <div className="text-xs text-muted-foreground">пусто</div>}
                  {logs.map((l) => (
                    <div key={l.id} className="text-[10px] bg-secondary/40 border border-border rounded p-2">
                      <div className="flex justify-between">
                        <span className="font-mono-data text-foreground">{l.command}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] ${
                            l.status === "done" ? "bg-emerald-500/20 text-emerald-400" :
                            l.status === "error" ? "bg-destructive/20 text-destructive" :
                            "bg-red-500/20 text-red-400"
                          }`}
                        >
                          {l.status}
                        </span>
                      </div>
                      {l.result && (
                        <div className="text-muted-foreground font-mono-data mt-1 break-all">
                          {l.result.slice(0, 200)}
                        </div>
                      )}
                      <div className="text-muted-foreground/70 mt-0.5">{timeAgo(l.created_at)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Модалка загрузки новой версии */}
      {showUpload && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowUpload(false)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="font-semibold flex items-center gap-2">
                <Icon name="Upload" size={16} />
                Загрузить новую версию scanner.py
              </div>
              <button onClick={() => setShowUpload(false)} className="w-8 h-8 rounded hover:bg-secondary flex items-center justify-center">
                <Icon name="X" size={16} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="text-xs text-muted-foreground bg-secondary/40 rounded p-3">
                <Icon name="Info" size={11} className="inline mr-1" />
                Все онлайн-агенты подхватят обновление при следующем heartbeat (15 сек) — скачают новый код, заменят свой scanner.py и перезапустятся.
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Заметки (changelog)</label>
                <input
                  value={uploadNotes}
                  onChange={(e) => setUploadNotes(e.target.value)}
                  placeholder="Что изменено?"
                  className="w-full mt-1 h-9 px-3 bg-secondary border border-border rounded text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Файл scanner.py</label>
                <input
                  type="file"
                  accept=".py,text/plain"
                  onChange={handleFileUpload}
                  className="w-full mt-1 text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-primary file:text-primary-foreground file:cursor-pointer"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Или вставь содержимое сюда</label>
                <textarea
                  value={uploadSource}
                  onChange={(e) => setUploadSource(e.target.value)}
                  rows={12}
                  className="w-full mt-1 p-3 bg-secondary border border-border rounded text-xs font-mono-data resize-none"
                  placeholder='"""Network Scanner Agent..."""'
                />
                <div className="text-[10px] text-muted-foreground mt-1">{uploadSource.length} символов</div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={uploadVersion}
                  disabled={uploading || uploadSource.length < 200}
                  className="flex-1 h-10 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {uploading ? <Icon name="Loader2" size={14} className="animate-spin" /> : <Icon name="Upload" size={14} />}
                  Опубликовать как новую версию
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Shell модалка */}
      {showShell && selected && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowShell(false)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-lg p-4" onClick={(e) => e.stopPropagation()}>
            <div className="font-semibold mb-3 flex items-center gap-2">
              <Icon name="Terminal" size={14} />
              Shell на {selected.agent_id}
            </div>
            <textarea
              autoFocus
              value={shellCmd}
              onChange={(e) => setShellCmd(e.target.value)}
              rows={4}
              placeholder="ipconfig /all"
              className="w-full p-3 bg-secondary border border-border rounded text-sm font-mono-data resize-none"
            />
            <div className="text-[10px] text-red-400 bg-red-500/10 rounded p-2 border border-red-500/30 mt-2">
              <Icon name="AlertTriangle" size={10} className="inline mr-1" />
              Команда выполнится с правами агента. Результат появится в истории.
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => {
                  sendCommand(selected.agent_id, "run_shell", { cmd: shellCmd });
                  setShowShell(false);
                  setShellCmd("");
                }}
                disabled={!shellCmd.trim()}
                className="flex-1 h-9 rounded bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
              >
                Выполнить
              </button>
              <button onClick={() => setShowShell(false)} className="h-9 px-4 rounded bg-secondary border border-border text-sm">
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модалка изменения настройки */}
      {showCfg && selected && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowCfg(null)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-md p-4" onClick={(e) => e.stopPropagation()}>
            <div className="font-semibold mb-3">
              {showCfg === "interval" ? "Изменить интервал сканирования" : "Изменить подсети"}
            </div>
            <input
              autoFocus
              value={cfgValue}
              onChange={(e) => setCfgValue(e.target.value)}
              placeholder={showCfg === "interval" ? "60" : "192.168.1.0/24, 10.0.0.0/24"}
              className="w-full h-10 px-3 bg-secondary border border-border rounded text-sm font-mono-data"
            />
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => {
                  const cmd = showCfg === "interval" ? "set_interval" : "set_subnet";
                  const payload = showCfg === "interval" ? { interval: Number(cfgValue) } : { subnet: cfgValue };
                  sendCommand(selected.agent_id, cmd, payload);
                  setShowCfg(null);
                }}
                disabled={!cfgValue.trim()}
                className="flex-1 h-9 rounded bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
              >
                Применить
              </button>
              <button onClick={() => setShowCfg(null)} className="h-9 px-4 rounded bg-secondary border border-border text-sm">
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}