import { useEffect, useState, useRef, useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
  Legend,
} from "recharts";
import Icon from "@/components/ui/icon";
import {
  fetchMikrotik,
  fmtBytes,
  fmtBytesExact,
  fmtBps,
  parseUptimeFull,
  MikrotikData,
  MikrotikInterface,
} from "@/lib/mikrotik-api";
import {
  PortSettings,
  RouterSettings,
  PeakRow,
  HistoryBucket,
  HistoryTotal,
  Period,
  getSettings,
  getPeaks,
  getHistory,
  recordSamples,
  roleColor,
  roleLabel,
} from "@/lib/mikrotik-stats";
import { pickPhotoForModel } from "@/lib/router-photos";
import PortSettingsModal from "./PortSettingsModal";
import RouterSettingsModal from "./RouterSettingsModal";

function MetricRing({
  value,
  label,
  unit,
  color,
  size = 88,
  precision = 1,
  subText,
}: {
  value: number;
  label: string;
  unit: string;
  color: string;
  size?: number;
  precision?: number;
  subText?: string;
}) {
  const data = [{ name: label, value, fill: color }];
  return (
    <div className="relative flex flex-col items-center" style={{ width: size }}>
      <div style={{ width: size, height: size }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart cx="50%" cy="50%" innerRadius="72%" outerRadius="100%" startAngle={90} endAngle={-270} data={data}>
            <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
            <RadialBar background={{ fill: "#1e2530" }} dataKey="value" cornerRadius={6} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ width: size, height: size }}
        >
          <div className="font-mono-data text-lg font-bold leading-none" style={{ color }}>
            {value.toFixed(precision)}
            <span className="text-[9px] ml-0.5">{unit}</span>
          </div>
          {subText && <div className="text-[8px] text-muted-foreground mt-0.5 font-mono-data">{subText}</div>}
        </div>
      </div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

function PortRow({
  iface,
  speedIn,
  speedOut,
  settings,
  peaks,
  onEdit,
}: {
  iface: MikrotikInterface;
  speedIn: number;
  speedOut: number;
  settings?: PortSettings;
  peaks?: { day?: PeakRow };
  onEdit: () => void;
}) {
  const status = iface.disabled ? "disabled" : iface.running ? "up" : "down";
  const statusColor = status === "up" ? "#22c55e" : status === "disabled" ? "#6b7280" : "#ef4444";
  const max = 1_000_000_000;
  const inPct = Math.min(100, (speedIn / max) * 100);
  const outPct = Math.min(100, (speedOut / max) * 100);
  const isUplink = settings?.is_uplink ?? false;
  const isDownlink = settings?.is_downlink ?? false;
  const role = settings?.role ?? "lan";
  const displayName = settings?.custom_name || iface.name;
  const description = settings?.description || iface.comment || "—";

  return (
    <div className="grid grid-cols-12 gap-3 items-center py-2 px-3 hover:bg-secondary/40 rounded text-xs border-b border-border/50 group">
      <div className="col-span-2 flex items-center gap-2">
        <span className="relative flex">
          <span className="w-2 h-2 rounded-full" style={{ background: statusColor, boxShadow: `0 0 8px ${statusColor}` }} />
          {status === "up" && (
            <span className="absolute inset-0 w-2 h-2 rounded-full animate-ping" style={{ background: statusColor, opacity: 0.4 }} />
          )}
        </span>
        <div className="min-w-0">
          <div className="font-mono-data font-semibold truncate" title={iface.name}>
            {displayName}
          </div>
          <div className="text-[9px] text-muted-foreground flex items-center gap-1">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: roleColor(role) }}
            />
            <span>{roleLabel(role)}</span>
          </div>
        </div>
      </div>

      <div className="col-span-3 truncate text-muted-foreground">
        {isUplink && (
          <span className="text-[9px] px-1 py-0.5 mr-1 rounded bg-blue-500/20 text-blue-400 font-semibold">↓ ВХОД</span>
        )}
        {isDownlink && (
          <span className="text-[9px] px-1 py-0.5 mr-1 rounded bg-purple-500/20 text-purple-400 font-semibold">↑ ВЫХОД</span>
        )}
        {description}
      </div>

      <div className="col-span-3">
        <div className="flex items-center gap-1.5 mb-1" title={`${speedIn.toFixed(0)} бит/с`}>
          <Icon name="ArrowDown" size={10} className="text-blue-400" />
          <span className="font-mono-data text-[10px] text-blue-400 w-28 truncate">{fmtBps(speedIn, 3)}</span>
          <div className="flex-1 h-1 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${inPct}%`,
                background: "linear-gradient(90deg, #1e40af, #3b82f6, #60a5fa)",
                boxShadow: "0 0 6px #3b82f6",
              }}
            />
          </div>
        </div>
        <div className="flex items-center gap-1.5" title={`${speedOut.toFixed(0)} бит/с`}>
          <Icon name="ArrowUp" size={10} className="text-purple-400" />
          <span className="font-mono-data text-[10px] text-purple-400 w-28 truncate">{fmtBps(speedOut, 3)}</span>
          <div className="flex-1 h-1 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${outPct}%`,
                background: "linear-gradient(90deg, #6b21a8, #a855f7, #c084fc)",
                boxShadow: "0 0 6px #a855f7",
              }}
            />
          </div>
        </div>
      </div>

      <div className="col-span-2 font-mono-data text-[10px] text-muted-foreground">
        <div title={fmtBytesExact(iface.rx_bytes)}>Σ ↓ {fmtBytes(iface.rx_bytes, 3)}</div>
        <div title={fmtBytesExact(iface.tx_bytes)}>Σ ↑ {fmtBytes(iface.tx_bytes, 3)}</div>
      </div>

      <div className="col-span-1 font-mono-data text-[10px]">
        {peaks?.day ? (
          <>
            <div className="text-blue-400/80" title={`Пик RX за день: ${peaks.day.peak_rx_at}`}>
              ▲ {fmtBps(peaks.day.peak_rx_bps, 1)}
            </div>
            <div className="text-purple-400/80" title={`Пик TX за день: ${peaks.day.peak_tx_at}`}>
              ▲ {fmtBps(peaks.day.peak_tx_bps, 1)}
            </div>
          </>
        ) : (
          <div className="text-muted-foreground/50 text-[9px]">собирается...</div>
        )}
      </div>

      <div className="col-span-1 text-right">
        <button
          onClick={onEdit}
          className="opacity-40 group-hover:opacity-100 w-7 h-7 rounded hover:bg-secondary transition flex items-center justify-center text-muted-foreground"
          title="Настроить порт"
        >
          <Icon name="Settings" size={12} />
        </button>
      </div>
    </div>
  );
}

function ConsumptionTab({
  routerId,
  ports,
  uplinkNames,
  downlinkNames,
}: {
  routerId: string;
  ports: PortSettings[];
  uplinkNames: string[];
  downlinkNames: string[];
}) {
  const [period, setPeriod] = useState<Period>("day");
  const [selectedPort, setSelectedPort] = useState<string>("");
  const [history, setHistory] = useState<HistoryBucket[]>([]);
  const [totals, setTotals] = useState<HistoryTotal[]>([]);
  const [loading, setLoading] = useState(false);

  const periodLabels: Record<Period, string> = {
    day: "Сутки",
    week: "Неделя",
    "15days": "15 дней",
    month: "Месяц",
  };

  const load = async () => {
    setLoading(true);
    try {
      const data = await getHistory(period, routerId, selectedPort);
      setHistory(data.history || []);
      setTotals(data.totals_per_port || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [period, selectedPort, routerId]);

  // Группируем по бакетам, чтобы построить общий график
  const chartData = useMemo(() => {
    const bucketMap: Record<string, { time: string; rx: number; tx: number }> = {};
    history.forEach((h) => {
      const key = h.bucket;
      if (!bucketMap[key]) {
        const d = new Date(h.bucket);
        bucketMap[key] = {
          time:
            period === "day"
              ? d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
              : d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }) +
                " " +
                d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
          rx: 0,
          tx: 0,
        };
      }
      // Если выбран порт — берём только его, иначе суммируем uplink rx и downlink tx
      if (selectedPort) {
        bucketMap[key].rx += Math.max(0, Number(h.rx_consumed) || 0);
        bucketMap[key].tx += Math.max(0, Number(h.tx_consumed) || 0);
      } else {
        if (uplinkNames.includes(h.port_name)) {
          bucketMap[key].rx += Math.max(0, Number(h.rx_consumed) || 0);
        }
        if (downlinkNames.includes(h.port_name)) {
          bucketMap[key].tx += Math.max(0, Number(h.tx_consumed) || 0);
        }
      }
    });
    return Object.values(bucketMap).map((b) => ({
      time: b.time,
      rx_gb: Number((b.rx / 1024 / 1024 / 1024).toFixed(3)),
      tx_gb: Number((b.tx / 1024 / 1024 / 1024).toFixed(3)),
    }));
  }, [history, selectedPort, period, uplinkNames, downlinkNames]);

  const totalRx = useMemo(() => {
    if (selectedPort) {
      const t = totals.find((x) => x.port_name === selectedPort);
      return Number(t?.rx_total || 0);
    }
    return totals
      .filter((t) => uplinkNames.includes(t.port_name))
      .reduce((s, t) => s + Number(t.rx_total || 0), 0);
  }, [totals, selectedPort, uplinkNames]);

  const totalTx = useMemo(() => {
    if (selectedPort) {
      const t = totals.find((x) => x.port_name === selectedPort);
      return Number(t?.tx_total || 0);
    }
    return totals
      .filter((t) => downlinkNames.includes(t.port_name))
      .reduce((s, t) => s + Number(t.tx_total || 0), 0);
  }, [totals, selectedPort, downlinkNames]);

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <div className="flex bg-secondary border border-border rounded-md overflow-hidden">
          {(Object.keys(periodLabels) as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-xs font-medium transition ${
                period === p ? "bg-primary text-primary-foreground" : "hover:bg-accent"
              }`}
            >
              {periodLabels[p]}
            </button>
          ))}
        </div>

        <select
          value={selectedPort}
          onChange={(e) => setSelectedPort(e.target.value)}
          className="h-8 px-2 bg-secondary border border-border rounded text-xs"
        >
          <option value="">Все uplink/downlink</option>
          {ports.map((p) => (
            <option key={p.port_name} value={p.port_name}>
              {p.custom_name || p.port_name} — {roleLabel(p.role)}
            </option>
          ))}
        </select>

        {loading && (
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Icon name="Loader" size={11} className="animate-spin" />
            обновление...
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-lg p-3 bg-blue-500/10 border border-blue-500/20">
          <div className="text-[10px] uppercase tracking-wider text-blue-300 mb-1">
            Потреблено за {periodLabels[period].toLowerCase()} (вход)
          </div>
          <div className="font-mono-data text-2xl font-bold text-blue-300">{fmtBytes(totalRx, 3)}</div>
          <div className="text-[9px] text-blue-300/60 font-mono-data" title={fmtBytesExact(totalRx)}>
            {fmtBytesExact(totalRx)}
          </div>
        </div>
        <div className="rounded-lg p-3 bg-purple-500/10 border border-purple-500/20">
          <div className="text-[10px] uppercase tracking-wider text-purple-300 mb-1">
            Потреблено за {periodLabels[period].toLowerCase()} (выход)
          </div>
          <div className="font-mono-data text-2xl font-bold text-purple-300">{fmtBytes(totalTx, 3)}</div>
          <div className="text-[9px] text-purple-300/60 font-mono-data" title={fmtBytesExact(totalTx)}>
            {fmtBytesExact(totalTx)}
          </div>
        </div>
      </div>

      {chartData.length === 0 ? (
        <div className="h-[240px] flex flex-col items-center justify-center text-xs text-muted-foreground">
          <Icon name="LineChart" size={28} className="mb-2 opacity-40" />
          <div>Нет данных за выбранный период</div>
          <div className="text-[10px] mt-1 opacity-60">Сбор начнётся после первого опроса роутера</div>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 12% 18%)" />
            <XAxis dataKey="time" stroke="hsl(215 14% 50%)" fontSize={10} />
            <YAxis stroke="hsl(215 14% 50%)" fontSize={10} unit=" ГБ" />
            <Tooltip
              contentStyle={{ background: "hsl(220 14% 11%)", border: "1px solid hsl(220 12% 18%)", borderRadius: 6 }}
              formatter={(v: number) => `${v.toFixed(3)} ГБ`}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="rx_gb" name="Входящий" fill="#3b82f6" radius={[3, 3, 0, 0]} />
            <Bar dataKey="tx_gb" name="Исходящий" fill="#a855f7" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}

      <div className="mt-4 grid grid-cols-2 lg:grid-cols-3 gap-2">
        {totals.map((t) => (
          <div key={t.port_name} className="bg-secondary/40 rounded p-2 text-xs">
            <div className="font-mono-data font-semibold mb-0.5">
              {ports.find((p) => p.port_name === t.port_name)?.custom_name || t.port_name}
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-blue-400">↓ {fmtBytes(Number(t.rx_total || 0), 2)}</span>
              <span className="text-purple-400">↑ {fmtBytes(Number(t.tx_total || 0), 2)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PeaksPanel({ peaks, ports }: { peaks: PeakRow[]; ports: PortSettings[] }) {
  const grouped: Record<string, Record<string, PeakRow>> = {};
  peaks.forEach((p) => {
    if (!grouped[p.port_name]) grouped[p.port_name] = {};
    grouped[p.port_name][p.period] = p;
  });

  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
        Зафиксированные максимальные скорости
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {Object.keys(grouped).map((port) => {
          const set = ports.find((p) => p.port_name === port);
          const day = grouped[port]["day"];
          const week = grouped[port]["week"];
          const month = grouped[port]["month"];
          return (
            <div key={port} className="bg-secondary/40 border border-border/50 rounded p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full" style={{ background: roleColor(set?.role || "lan") }} />
                <span className="font-mono-data font-semibold text-sm">{set?.custom_name || port}</span>
                <span className="text-[10px] text-muted-foreground ml-auto">{port}</span>
              </div>
              <table className="w-full text-[10px]">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="text-left font-normal">Период</th>
                    <th className="text-right font-normal">Пик ↓</th>
                    <th className="text-right font-normal">Пик ↑</th>
                  </tr>
                </thead>
                <tbody className="font-mono-data">
                  {[
                    { l: "Сутки", d: day },
                    { l: "Неделя", d: week },
                    { l: "Месяц", d: month },
                  ].map((row) => (
                    <tr key={row.l}>
                      <td className="py-0.5 text-muted-foreground">{row.l}</td>
                      <td className="py-0.5 text-right text-blue-400" title={row.d?.peak_rx_at}>
                        {row.d ? fmtBps(Number(row.d.peak_rx_bps || 0), 2) : "—"}
                      </td>
                      <td className="py-0.5 text-right text-purple-400" title={row.d?.peak_tx_at}>
                        {row.d ? fmtBps(Number(row.d.peak_tx_bps || 0), 2) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
        {Object.keys(grouped).length === 0 && (
          <div className="text-xs text-muted-foreground p-4">Пиковые скорости начнут собираться при первых опросах роутера.</div>
        )}
      </div>
    </div>
  );
}

const ROUTER_ID = "r4-arttelecom";

export default function RealMikrotikCard() {
  const [data, setData] = useState<MikrotikData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"ports" | "consumption" | "peaks" | "performance">("ports");
  const [trafficHistory, setTrafficHistory] = useState<{ time: string; in: number; out: number }[]>([]);
  const prevSnapshot = useRef<{ ts: number; data: MikrotikData | null }>({ ts: 0, data: null });
  const [portSpeeds, setPortSpeeds] = useState<Record<string, { in: number; out: number }>>({});
  const [routerSettings, setRouterSettings] = useState<RouterSettings | null>(null);
  const [portSettings, setPortSettings] = useState<PortSettings[]>([]);
  const [peaks, setPeaks] = useState<PeakRow[]>([]);
  const [editingPort, setEditingPort] = useState<string | null>(null);
  const [routerModalOpen, setRouterModalOpen] = useState(false);

  const portSettingsMap = useMemo(() => {
    const m: Record<string, PortSettings> = {};
    portSettings.forEach((p) => {
      m[p.port_name] = p;
    });
    return m;
  }, [portSettings]);

  const peaksByPort = useMemo(() => {
    const m: Record<string, { day?: PeakRow; week?: PeakRow; month?: PeakRow }> = {};
    peaks.forEach((p) => {
      if (!m[p.port_name]) m[p.port_name] = {};
      (m[p.port_name] as Record<string, PeakRow>)[p.period] = p;
    });
    return m;
  }, [peaks]);

  const uplinkNames = useMemo(() => portSettings.filter((p) => p.is_uplink).map((p) => p.port_name), [portSettings]);
  const downlinkNames = useMemo(() => portSettings.filter((p) => p.is_downlink).map((p) => p.port_name), [portSettings]);

  const reloadSettings = async () => {
    const s = await getSettings(ROUTER_ID);
    setRouterSettings(s.router);
    setPortSettings(s.ports || []);
  };
  const reloadPeaks = async () => {
    const p = await getPeaks(ROUTER_ID);
    setPeaks(p.peaks || []);
  };

  const load = async () => {
    try {
      const json = await fetchMikrotik();
      if (!json.success) {
        setErr(json.message || json.error || "Ошибка");
        setLoading(false);
        return;
      }

      const now = Date.now();
      if (prevSnapshot.current.data && prevSnapshot.current.ts) {
        const dt = (now - prevSnapshot.current.ts) / 1000;
        if (dt > 0) {
          const speeds: Record<string, { in: number; out: number }> = {};
          let totalUplinkIn = 0;
          let totalDownlinkOut = 0;
          const samplesToRecord: {
            port: string;
            rx_bytes: number;
            tx_bytes: number;
            rx_bps: number;
            tx_bps: number;
          }[] = [];
          json.interfaces.list.forEach((cur) => {
            const prev = prevSnapshot.current.data!.interfaces.list.find((p) => p.name === cur.name);
            if (prev) {
              const inBps = Math.max(0, ((cur.rx_bytes - prev.rx_bytes) * 8) / dt);
              const outBps = Math.max(0, ((cur.tx_bytes - prev.tx_bytes) * 8) / dt);
              speeds[cur.name] = { in: inBps, out: outBps };
              if (uplinkNames.includes(cur.name)) totalUplinkIn += inBps;
              if (downlinkNames.includes(cur.name)) totalDownlinkOut += outBps;
              if (cur.running) {
                samplesToRecord.push({
                  port: cur.name,
                  rx_bytes: cur.rx_bytes,
                  tx_bytes: cur.tx_bytes,
                  rx_bps: Math.round(inBps),
                  tx_bps: Math.round(outBps),
                });
              }
            }
          });
          setPortSpeeds(speeds);
          setTrafficHistory((h) => [
            ...h.slice(-29),
            {
              time: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
              in: Number((totalUplinkIn / 1_000_000).toFixed(3)),
              out: Number((totalDownlinkOut / 1_000_000).toFixed(3)),
            },
          ]);
          // Записываем срез в БД для истории и пиков
          if (samplesToRecord.length > 0) {
            recordSamples(samplesToRecord, ROUTER_ID).catch(() => {});
          }
        }
      }
      prevSnapshot.current = { ts: now, data: json };

      setData(json);
      setErr(null);
      setLoading(false);
    } catch (e) {
      setErr(String(e));
      setLoading(false);
    }
  };

  useEffect(() => {
    reloadSettings();
    reloadPeaks();
    load();
    const t1 = setInterval(load, 5000);
    const t2 = setInterval(reloadPeaks, 30_000);
    return () => {
      clearInterval(t1);
      clearInterval(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 flex items-center justify-center">
        <Icon name="Loader" size={20} className="animate-spin mr-2 text-primary" />
        <span className="text-muted-foreground">Подключаюсь к MikroTik по API-SSL...</span>
      </div>
    );
  }

  if (err || !data) {
    return (
      <div className="bg-card border border-destructive/30 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-2">
          <Icon name="AlertCircle" size={20} className="text-destructive" />
          <h3 className="text-lg font-semibold">MikroTik недоступен</h3>
        </div>
        <p className="text-sm text-muted-foreground">{err}</p>
        <button onClick={load} className="mt-3 h-8 px-3 bg-secondary border border-border rounded text-xs">
          Повторить
        </button>
      </div>
    );
  }

  // Скорость и общий трафик с учётом пользовательских ролей
  const totalInBps = uplinkNames.reduce((s, n) => s + (portSpeeds[n]?.in ?? 0), 0);
  const totalOutBps = downlinkNames.reduce((s, n) => s + (portSpeeds[n]?.out ?? 0), 0);
  const portsUp = data.interfaces.running;
  const totalErrors = data.interfaces.list.reduce((s, p) => s + p.rx_errors + p.tx_errors, 0);
  const totalIn = data.interfaces.list
    .filter((i) => uplinkNames.includes(i.name))
    .reduce((s, p) => s + p.rx_bytes, 0);
  const totalOut = data.interfaces.list
    .filter((i) => downlinkNames.includes(i.name))
    .reduce((s, p) => s + p.tx_bytes, 0);
  const totalPackets = data.interfaces.list.reduce((s, p) => s + p.rx_packets + p.tx_packets, 0);
  const uptime = parseUptimeFull(data.system.uptime);
  const tempC = parseFloat(data.health.temperature || "0");
  const voltageV = parseFloat(data.health.voltage || "0");

  // Пиковые скорости за день — для hero
  const peaksByPortDay = peaks.filter((p) => p.period === "day");
  const allDayPeakIn = peaksByPortDay
    .filter((p) => uplinkNames.includes(p.port_name))
    .reduce((m, p) => Math.max(m, Number(p.peak_rx_bps || 0)), 0);
  const allDayPeakOut = peaksByPortDay
    .filter((p) => downlinkNames.includes(p.port_name))
    .reduce((m, p) => Math.max(m, Number(p.peak_tx_bps || 0)), 0);

  const displayedName = routerSettings?.custom_name || data.identity.name;
  const displayedRole = routerSettings?.role || "Магистральный · BGP/OSPF";
  const displayedLocation = routerSettings?.location || "—";
  const photo = routerSettings?.auto_photo
    ? pickPhotoForModel(data.routerboard.model)
    : routerSettings?.photo_url || pickPhotoForModel(data.routerboard.model);

  return (
    <>
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes router-led-blink {
          0%, 80% { opacity: 1; }
          85% { opacity: 0.3; }
          90% { opacity: 1; }
        }
        @keyframes router-pulse {
          0%, 100% { transform: scale(1); opacity: 0.7; }
          50% { transform: scale(1.05); opacity: 1; }
        }
      `}</style>

      <div
        className="bg-card border border-border rounded-xl overflow-hidden relative"
        style={{ boxShadow: "0 0 0 1px #22c55e22, 0 0 30px #22c55e15" }}
      >
        <div
          className="absolute top-0 left-0 right-0 h-1"
          style={{
            background: "linear-gradient(90deg, #22c55e00, #22c55e, #22c55e00)",
            backgroundSize: "200% 100%",
            animation: "shimmer 3s linear infinite",
          }}
        />

        <div className="grid grid-cols-12 gap-0">
          <div className="col-span-12 lg:col-span-4 relative overflow-hidden">
            <div className="aspect-[4/3] lg:aspect-auto lg:h-full relative">
              <img
                src={photo}
                alt={displayedName}
                className="absolute inset-0 w-full h-full object-cover"
                style={{ animation: "router-pulse 8s ease-in-out infinite" }}
                loading="lazy"
              />
              <div
                className="absolute inset-0"
                style={{ background: "linear-gradient(135deg, transparent 30%, rgba(10,14,20,0.85) 100%)" }}
              />

              <div className="absolute top-3 left-3 flex items-center gap-2 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur border border-white/10">
                <span className="relative flex">
                  <span className="w-2 h-2 rounded-full" style={{ background: "#22c55e", boxShadow: "0 0 8px #22c55e" }} />
                  <span
                    className="absolute w-2 h-2 rounded-full animate-ping"
                    style={{ background: "#22c55e", opacity: 0.5 }}
                  />
                </span>
                <span className="text-[10px] uppercase tracking-wider font-semibold text-white">REAL · LIVE</span>
              </div>
              <div className="absolute top-3 right-3 px-2 py-1 rounded bg-emerald-500/30 backdrop-blur text-white text-[10px] font-bold tracking-wide border border-emerald-400/40">
                {data.routerboard.model}
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <div className="text-emerald-300/80 text-[10px] uppercase tracking-wider mb-1">{displayedRole}</div>
                <h2 className="text-2xl font-bold text-white mb-1">{displayedName}</h2>
                <div className="text-white/70 text-xs">
                  {data.routerboard.model} · {data.system.architecture.toUpperCase()}
                </div>
              </div>
            </div>
          </div>

          <div className="col-span-12 lg:col-span-8 p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <Icon name="MapPin" size={12} />
                  <span>
                    {displayedLocation} · {data.host}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs flex-wrap">
                  <span className="text-muted-foreground">
                    RouterOS: <span className="font-mono-data text-foreground">{data.system.version}</span>
                  </span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">
                    S/N: <span className="font-mono-data text-foreground">{data.routerboard.serial}</span>
                  </span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground" title={`Точно: ${data.system.uptime}`}>
                    Uptime: <span className="font-mono-data text-foreground">{uptime.pretty}</span>
                  </span>
                </div>
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setRouterModalOpen(true)}
                  className="w-8 h-8 rounded-md bg-secondary hover:bg-accent text-muted-foreground flex items-center justify-center"
                  title="Настроить роутер"
                >
                  <Icon name="Settings" size={14} />
                </button>
                <button
                  onClick={load}
                  className="w-8 h-8 rounded-md bg-secondary hover:bg-accent text-muted-foreground flex items-center justify-center"
                  title="Обновить"
                >
                  <Icon name="RefreshCw" size={14} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
              <MetricRing
                value={data.resources.cpu_load}
                label="CPU"
                unit="%"
                precision={0}
                subText={`${data.resources.cpu_count}×${data.resources.cpu_frequency}MHz`}
                color={data.resources.cpu_load > 70 ? "#ef4444" : data.resources.cpu_load > 50 ? "#f59e0b" : "#3b82f6"}
              />
              <MetricRing
                value={data.resources.memory_pct}
                label="RAM"
                unit="%"
                precision={2}
                subText={`${data.resources.memory_used_mb.toFixed(1)}/${data.resources.memory_total_mb.toFixed(0)}МБ`}
                color={data.resources.memory_pct > 75 ? "#ef4444" : data.resources.memory_pct > 60 ? "#f59e0b" : "#a855f7"}
              />
              <MetricRing
                value={data.resources.storage_pct}
                label="Диск"
                unit="%"
                precision={2}
                subText={`${data.resources.storage_used_mb.toFixed(1)}/${data.resources.storage_total_mb.toFixed(0)}МБ`}
                color="#10b981"
              />
              <MetricRing value={tempC} label="Темп." unit="°C" precision={1} color={tempC > 60 ? "#ef4444" : "#06b6d4"} />
              <MetricRing value={voltageV} label="Питание" unit="В" precision={1} color="#f59e0b" />
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div
                className="rounded-lg p-3 relative overflow-hidden"
                style={{
                  background: "linear-gradient(135deg, hsl(217 91% 25% / 0.4), hsl(217 91% 35% / 0.15))",
                  border: "1px solid hsl(217 91% 60% / 0.3)",
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-7 h-7 rounded-full bg-blue-500/30 flex items-center justify-center">
                    <Icon name="ArrowDown" size={14} className="text-blue-300" />
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-blue-300">Скорость входящего</span>
                </div>
                <div className="font-mono-data text-2xl font-bold text-blue-300" title={`${totalInBps.toFixed(0)} бит/с`}>
                  {fmtBps(totalInBps, 3)}
                </div>
                <div className="text-[10px] text-blue-300/70 flex items-center gap-2">
                  <span title={fmtBytesExact(totalIn)}>Σ {fmtBytes(totalIn, 3)}</span>
                  <span className="text-blue-300/50">·</span>
                  <span className="text-blue-300/80" title="Пиковая скорость за сутки">
                    ▲ Пик: <span className="font-mono-data">{fmtBps(allDayPeakIn, 2)}</span>
                  </span>
                </div>
                <div className="text-[9px] text-blue-300/50 font-mono-data mt-0.5">
                  rx({uplinkNames.join("+") || "не настроено"})
                </div>
                <div className="absolute right-2 top-2 opacity-20">
                  <Icon name="Download" size={48} className="text-blue-400" />
                </div>
              </div>
              <div
                className="rounded-lg p-3 relative overflow-hidden"
                style={{
                  background: "linear-gradient(135deg, hsl(280 70% 25% / 0.4), hsl(280 70% 35% / 0.15))",
                  border: "1px solid hsl(280 70% 60% / 0.3)",
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-7 h-7 rounded-full bg-purple-500/30 flex items-center justify-center">
                    <Icon name="ArrowUp" size={14} className="text-purple-300" />
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-purple-300">Скорость исходящего</span>
                </div>
                <div className="font-mono-data text-2xl font-bold text-purple-300" title={`${totalOutBps.toFixed(0)} бит/с`}>
                  {fmtBps(totalOutBps, 3)}
                </div>
                <div className="text-[10px] text-purple-300/70 flex items-center gap-2">
                  <span title={fmtBytesExact(totalOut)}>Σ {fmtBytes(totalOut, 3)}</span>
                  <span className="text-purple-300/50">·</span>
                  <span className="text-purple-300/80" title="Пиковая скорость за сутки">
                    ▲ Пик: <span className="font-mono-data">{fmtBps(allDayPeakOut, 2)}</span>
                  </span>
                </div>
                <div className="text-[9px] text-purple-300/50 font-mono-data mt-0.5">
                  tx({downlinkNames.join("+") || "не настроено"})
                </div>
                <div className="absolute right-2 top-2 opacity-20">
                  <Icon name="Upload" size={48} className="text-purple-400" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 mb-5">
              {[
                { l: "Интерфейсы", v: `${portsUp}/${data.interfaces.count}`, i: "Cable", c: "#22c55e" },
                { l: "BGP active", v: data.routing.bgp_active, i: "Globe", c: "#06b6d4" },
                { l: "Маршруты", v: data.routing.routes_count.toLocaleString("ru-RU"), i: "Route", c: "#3b82f6" },
                {
                  l: "Ошибки",
                  v: totalErrors,
                  i: "AlertCircle",
                  c: totalErrors > 1000 ? "#ef4444" : "#6b7280",
                },
              ].map((s) => (
                <div key={s.l} className="bg-secondary/40 rounded-md p-2 flex items-center gap-2">
                  <Icon name={s.i} size={14} style={{ color: s.c }} />
                  <div>
                    <div className="font-mono-data text-sm font-semibold">{s.v}</div>
                    <div className="text-[9px] text-muted-foreground uppercase">{s.l}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-1 border-b border-border mb-3 flex-wrap">
              {[
                { v: "ports" as const, label: `Порты (${data.interfaces.count})`, icon: "Cable" },
                { v: "consumption" as const, label: "Потребление", icon: "BarChart3" },
                { v: "peaks" as const, label: "Пики", icon: "TrendingUp" },
                { v: "performance" as const, label: "Производительность", icon: "Activity" },
              ].map((t) => (
                <button
                  key={t.v}
                  onClick={() => setTab(t.v)}
                  className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px flex items-center gap-1.5 ${
                    tab === t.v
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon name={t.icon} size={12} />
                  {t.label}
                </button>
              ))}
            </div>

            {tab === "ports" && (
              <div className="space-y-0 max-h-[440px] overflow-y-auto pr-1">
                <div className="grid grid-cols-12 gap-3 px-3 pb-2 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                  <div className="col-span-2">Имя / роль</div>
                  <div className="col-span-3">Описание</div>
                  <div className="col-span-3">Скорость IN/OUT</div>
                  <div className="col-span-2">Накоплено</div>
                  <div className="col-span-1">Пик / сутки</div>
                  <div className="col-span-1 text-right">⚙</div>
                </div>
                {data.interfaces.list
                  .filter((p) => !p.disabled)
                  .sort((a, b) => (b.running ? 1 : 0) - (a.running ? 1 : 0))
                  .map((p) => (
                    <PortRow
                      key={p.name}
                      iface={p}
                      speedIn={portSpeeds[p.name]?.in ?? 0}
                      speedOut={portSpeeds[p.name]?.out ?? 0}
                      settings={portSettingsMap[p.name]}
                      peaks={peaksByPort[p.name]}
                      onEdit={() => setEditingPort(p.name)}
                    />
                  ))}
              </div>
            )}

            {tab === "consumption" && (
              <ConsumptionTab routerId={ROUTER_ID} ports={portSettings} uplinkNames={uplinkNames} downlinkNames={downlinkNames} />
            )}

            {tab === "peaks" && <PeaksPanel peaks={peaks} ports={portSettings} />}

            {tab === "performance" && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                  Трафик в реальном времени (опрос каждые 5 сек)
                </div>
                {trafficHistory.length < 2 ? (
                  <div className="h-[200px] flex items-center justify-center text-xs text-muted-foreground">
                    Сбор данных...
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={trafficHistory}>
                      <defs>
                        <linearGradient id="g-real-in" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.5} />
                          <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="g-real-out" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#a855f7" stopOpacity={0.5} />
                          <stop offset="100%" stopColor="#a855f7" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 12% 18%)" />
                      <XAxis dataKey="time" stroke="hsl(215 14% 50%)" fontSize={10} />
                      <YAxis stroke="hsl(215 14% 50%)" fontSize={10} />
                      <Tooltip
                        contentStyle={{ background: "hsl(220 14% 11%)", border: "1px solid hsl(220 12% 18%)", borderRadius: 6 }}
                      />
                      <Area type="monotone" dataKey="in" stroke="#3b82f6" strokeWidth={2} fill="url(#g-real-in)" name="↓ Мбит/с" />
                      <Area type="monotone" dataKey="out" stroke="#a855f7" strokeWidth={2} fill="url(#g-real-out)" name="↑ Мбит/с" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}

                <div className="grid grid-cols-3 gap-3 mt-4">
                  <div className="bg-secondary/40 rounded-md p-3">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">CPU</div>
                    <div className="font-mono-data text-base">
                      {data.resources.cpu_count}× {data.resources.cpu_frequency} МГц
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1">
                      Загрузка: <span className="font-mono-data">{data.resources.cpu_load}%</span>
                    </div>
                  </div>
                  <div className="bg-secondary/40 rounded-md p-3">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">RAM</div>
                    <div className="font-mono-data text-base">
                      {data.resources.memory_used_mb.toFixed(2)} / {data.resources.memory_total_mb.toFixed(2)} МБ
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1 font-mono-data">
                      {data.resources.memory_pct.toFixed(2)}%
                    </div>
                  </div>
                  <div className="bg-secondary/40 rounded-md p-3">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Диск</div>
                    <div className="font-mono-data text-base">
                      {data.resources.storage_used_mb.toFixed(2)} / {data.resources.storage_total_mb.toFixed(2)} МБ
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1 font-mono-data">
                      {data.resources.storage_pct.toFixed(2)}%
                    </div>
                  </div>
                  <div className="bg-secondary/40 rounded-md p-3">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Температура</div>
                    <div className="font-mono-data text-base">{tempC.toFixed(1)} °C</div>
                  </div>
                  <div className="bg-secondary/40 rounded-md p-3">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Питание</div>
                    <div className="font-mono-data text-base">{voltageV.toFixed(2)} В</div>
                  </div>
                  <div className="bg-secondary/40 rounded-md p-3">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Пакеты</div>
                    <div className="font-mono-data text-base">{totalPackets.toLocaleString("ru-RU")}</div>
                    <div className="text-[10px] text-muted-foreground mt-1">всего IN+OUT</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <PortSettingsModal
        open={!!editingPort}
        onClose={() => setEditingPort(null)}
        onSaved={reloadSettings}
        port={editingPort ? portSettingsMap[editingPort] || null : null}
        portName={editingPort || ""}
        defaultComment={editingPort ? data.interfaces.list.find((p) => p.name === editingPort)?.comment : ""}
      />

      <RouterSettingsModal
        open={routerModalOpen}
        onClose={() => setRouterModalOpen(false)}
        onSaved={reloadSettings}
        router={routerSettings}
        detectedModel={data.routerboard.model}
      />
    </>
  );
}