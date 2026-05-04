import { useEffect, useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import Icon from "@/components/ui/icon";
import PageHeader from "@/components/common/PageHeader";

const DEVICES_URL = "https://functions.poehali.dev/f7c8b99c-b2f6-45f1-b756-2afe78cdc1d5";
const LINKS_URL = "https://functions.poehali.dev/5d8489ec-523b-4377-9fc9-376a1506440d";

type DevType = "olt" | "onu" | "router" | "server" | "switch" | "other";

interface Device {
  id: number;
  device_type: DevType;
  name: string;
  status: string;
  comment: string;
  icon: string;
  x: number;
  y: number;
  lat: number;
  lng: number;
}

interface Waypoint {
  x: number;
  y: number;
}

interface Link {
  id: number;
  source_id: number;
  target_id: number;
  source_port: string;
  target_port: string;
  bandwidth_mbps: number;
  current_mbps: number;
  color: string;
  waypoints: Waypoint[];
  label: string;
}

const DEVICE_PRESETS: { type: DevType; label: string; icon: string; color: string }[] = [
  { type: "server", label: "Сервер", icon: "Server", color: "#a78bfa" },
  { type: "olt", label: "OLT", icon: "HardDrive", color: "#60a5fa" },
  { type: "switch", label: "Коммутатор", icon: "Network", color: "#34d399" },
  { type: "router", label: "Роутер", icon: "Router", color: "#f59e0b" },
  { type: "onu", label: "ONU (EPON)", icon: "Wifi", color: "#22d3ee" },
  { type: "other", label: "Другое", icon: "Box", color: "#94a3b8" },
];

function getPreset(type: DevType) {
  return DEVICE_PRESETS.find((p) => p.type === type) || DEVICE_PRESETS[5];
}

function statusColor(s: string) {
  if (s === "warning") return "#f59e0b";
  if (s === "offline" || s === "los") return "#ef4444";
  return "#22c55e";
}

function buildPath(start: Waypoint, end: Waypoint, mids: Waypoint[]): string {
  const pts = [start, ...mids, end];
  if (pts.length === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    const cx = (prev.x + cur.x) / 2;
    const cy = (prev.y + cur.y) / 2;
    d += ` Q ${prev.x} ${prev.y} ${cx} ${cy}`;
    if (i === pts.length - 1) d += ` T ${cur.x} ${cur.y}`;
  }
  return d;
}

export default function Topology() {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [tool, setTool] = useState<"select" | "link">("select");
  const [linkFrom, setLinkFrom] = useState<number | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<number | null>(null);
  const [selectedLink, setSelectedLink] = useState<number | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [draggingWp, setDraggingWp] = useState<{ linkId: number; idx: number } | null>(null);
  const [dragOffset, setDragOffset] = useState<Waypoint>({ x: 0, y: 0 });
  const [showAdd, setShowAdd] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Waypoint>({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const [panStart, setPanStart] = useState<Waypoint>({ x: 0, y: 0 });

  const load = useCallback(async () => {
    try {
      const [d, l] = await Promise.all([fetch(DEVICES_URL), fetch(LINKS_URL)]);
      const dj = await d.json();
      const lj = await l.json();
      if (dj.success) {
        const items: Device[] = (dj.items || []).map((it: Device, i: number) => ({
          ...it,
          x: it.x || 100 + (i % 5) * 180,
          y: it.y || 100 + Math.floor(i / 5) * 140,
        }));
        setDevices(items);
      }
      if (lj.success) setLinks(lj.items || []);
    } catch {
      toast.error("Ошибка загрузки топологии");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const screenToSvg = (clientX: number, clientY: number): Waypoint => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const r = svgRef.current.getBoundingClientRect();
    return {
      x: (clientX - r.left - pan.x) / zoom,
      y: (clientY - r.top - pan.y) / zoom,
    };
  };

  const handleDeviceMouseDown = (e: React.MouseEvent, dev: Device) => {
    e.stopPropagation();
    if (tool === "link") {
      if (linkFrom === null) {
        setLinkFrom(dev.id);
      } else if (linkFrom !== dev.id) {
        createLink(linkFrom, dev.id);
        setLinkFrom(null);
      }
      return;
    }
    setSelectedDevice(dev.id);
    setSelectedLink(null);
    const p = screenToSvg(e.clientX, e.clientY);
    setDragOffset({ x: p.x - dev.x, y: p.y - dev.y });
    setDraggingId(dev.id);
  };

  const handleSvgMouseMove = (e: React.MouseEvent) => {
    if (draggingId !== null) {
      const p = screenToSvg(e.clientX, e.clientY);
      setDevices((d) =>
        d.map((x) => (x.id === draggingId ? { ...x, x: p.x - dragOffset.x, y: p.y - dragOffset.y } : x))
      );
    } else if (draggingWp) {
      const p = screenToSvg(e.clientX, e.clientY);
      setLinks((ls) =>
        ls.map((l) => {
          if (l.id !== draggingWp.linkId) return l;
          const wps = [...l.waypoints];
          wps[draggingWp.idx] = p;
          return { ...l, waypoints: wps };
        })
      );
    } else if (panning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    }
  };

  const handleSvgMouseUp = async () => {
    if (draggingId !== null) {
      const dev = devices.find((d) => d.id === draggingId);
      if (dev) {
        await fetch(DEVICES_URL, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: dev.id, x: dev.x, y: dev.y }),
        });
      }
      setDraggingId(null);
    }
    if (draggingWp) {
      const link = links.find((l) => l.id === draggingWp.linkId);
      if (link) {
        await fetch(LINKS_URL, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: link.id, waypoints: link.waypoints }),
        });
      }
      setDraggingWp(null);
    }
    if (panning) setPanning(false);
  };

  const handleSvgMouseDown = (e: React.MouseEvent) => {
    if ((e.target as Element).tagName === "svg" || (e.target as Element).id === "topo-bg") {
      setSelectedDevice(null);
      setSelectedLink(null);
      if (e.button === 0 && tool === "select") {
        setPanning(true);
        setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      }
    }
  };

  const handleSvgWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.001;
    setZoom((z) => Math.max(0.3, Math.min(3, z + delta)));
  };

  const createLink = async (sourceId: number, targetId: number) => {
    const r = await fetch(LINKS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_id: sourceId,
        target_id: targetId,
        bandwidth_mbps: 1000,
        current_mbps: 100,
        color: "#22c55e",
      }),
    });
    const j = await r.json();
    if (j.success) {
      setLinks((ls) => [...ls, j.item]);
      toast.success("Связь создана");
    } else toast.error(j.message || "Ошибка");
  };

  const addDevice = async (preset: typeof DEVICE_PRESETS[number]) => {
    const cx = -pan.x / zoom + 400 / zoom;
    const cy = -pan.y / zoom + 300 / zoom;
    const r = await fetch(DEVICES_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        device_type: preset.type,
        name: preset.label,
        x: cx + Math.random() * 100,
        y: cy + Math.random() * 100,
        status: "online",
        icon: preset.icon,
      }),
    });
    const j = await r.json();
    if (j.success) {
      setDevices((d) => [...d, j.item]);
      setShowAdd(false);
      toast.success(`${preset.label} добавлен`);
    } else toast.error(j.message);
  };

  const deleteDevice = async (id: number) => {
    if (!confirm("Удалить устройство и все его связи?")) return;
    const r = await fetch(`${DEVICES_URL}?id=${id}`, { method: "DELETE" });
    const j = await r.json();
    if (j.success) {
      setDevices((d) => d.filter((x) => x.id !== id));
      setLinks((ls) => ls.filter((l) => l.source_id !== id && l.target_id !== id));
      setSelectedDevice(null);
      toast.success("Удалено");
    }
  };

  const deleteAll = async () => {
    if (!confirm("Удалить ВСЕ устройства и связи? Это необратимо.")) return;
    const r = await fetch(`${DEVICES_URL}?all=1`, { method: "DELETE" });
    const j = await r.json();
    if (j.success) {
      setDevices([]);
      setLinks([]);
      setSelectedDevice(null);
      setSelectedLink(null);
      toast.success("Топология очищена");
    }
  };

  const deleteLink = async (id: number) => {
    const r = await fetch(`${LINKS_URL}?id=${id}`, { method: "DELETE" });
    const j = await r.json();
    if (j.success) {
      setLinks((ls) => ls.filter((l) => l.id !== id));
      setSelectedLink(null);
      toast.success("Связь удалена");
    }
  };

  const updateDevice = async (id: number, patch: Partial<Device>) => {
    setDevices((d) => d.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    await fetch(DEVICES_URL, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
  };

  const updateLink = async (id: number, patch: Partial<Link>) => {
    setLinks((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    await fetch(LINKS_URL, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
  };

  const addWaypoint = (link: Link, e: React.MouseEvent) => {
    e.stopPropagation();
    const p = screenToSvg(e.clientX, e.clientY);
    const newWps = [...link.waypoints, p];
    updateLink(link.id, { waypoints: newWps });
  };

  const removeWaypoint = (link: Link, idx: number) => {
    const wps = link.waypoints.filter((_, i) => i !== idx);
    updateLink(link.id, { waypoints: wps });
  };

  const selDev = devices.find((d) => d.id === selectedDevice) || null;
  const selLink = links.find((l) => l.id === selectedLink) || null;

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader
        title="Топология сети"
        description="Схема оборудования и связей. Перетаскивай устройства, гни линии, привязывай порты и скорости."
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => setShowAdd((v) => !v)}
              className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2 hover:bg-primary/90"
            >
              <Icon name="Plus" size={14} />
              Добавить
            </button>
            <button
              onClick={() => {
                setTool((t) => (t === "link" ? "select" : "link"));
                setLinkFrom(null);
              }}
              className={`h-9 px-3 rounded-md text-sm font-medium flex items-center gap-2 border ${
                tool === "link"
                  ? "bg-amber-500/20 border-amber-500/50 text-amber-300"
                  : "bg-secondary border-border hover:bg-accent"
              }`}
            >
              <Icon name="Spline" size={14} />
              {tool === "link" ? (linkFrom !== null ? "Выбери второе" : "Выбери первое") : "Связь"}
            </button>
            <button
              onClick={deleteAll}
              className="h-9 px-3 rounded-md bg-destructive/15 border border-destructive/40 text-destructive text-sm font-medium flex items-center gap-2 hover:bg-destructive/25"
            >
              <Icon name="Trash2" size={14} />
              Очистить всё
            </button>
          </div>
        }
      />

      {showAdd && (
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-xs uppercase text-muted-foreground mb-3 font-semibold">
            Выбери тип оборудования
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {DEVICE_PRESETS.map((p) => (
              <button
                key={p.type}
                onClick={() => addDevice(p)}
                className="flex flex-col items-center gap-2 p-4 rounded-lg border border-border bg-secondary/40 hover:bg-secondary hover:border-primary/40 transition-all"
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ background: `${p.color}20`, color: p.color }}
                >
                  <Icon name={p.icon} size={26} />
                </div>
                <span className="text-xs font-medium">{p.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-4">
        <div className="flex-1 bg-card border border-border rounded-lg overflow-hidden relative" style={{ height: "calc(100vh - 240px)", minHeight: 500 }}>
          <div className="absolute top-3 left-3 z-10 flex gap-1 bg-card/90 backdrop-blur rounded-md border border-border p-1">
            <button onClick={() => setZoom((z) => Math.min(3, z + 0.2))} className="w-8 h-8 rounded hover:bg-secondary flex items-center justify-center">
              <Icon name="ZoomIn" size={14} />
            </button>
            <button onClick={() => setZoom((z) => Math.max(0.3, z - 0.2))} className="w-8 h-8 rounded hover:bg-secondary flex items-center justify-center">
              <Icon name="ZoomOut" size={14} />
            </button>
            <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="w-8 h-8 rounded hover:bg-secondary flex items-center justify-center">
              <Icon name="Maximize2" size={14} />
            </button>
            <span className="text-xs px-2 self-center text-muted-foreground font-mono-data">
              {Math.round(zoom * 100)}%
            </span>
          </div>
          <div className="absolute top-3 right-3 z-10 text-[10px] text-muted-foreground bg-card/80 backdrop-blur rounded px-2 py-1 border border-border">
            {tool === "link" ? "Клик по двум устройствам — создать связь" : "Тащи устройства · Колесо — масштаб · ПКМ — панорама"}
          </div>

          <svg
            ref={svgRef}
            className="w-full h-full select-none"
            style={{ cursor: panning ? "grabbing" : tool === "link" ? "crosshair" : "default", background: "hsl(220 13% 9%)" }}
            onMouseDown={handleSvgMouseDown}
            onMouseMove={handleSvgMouseMove}
            onMouseUp={handleSvgMouseUp}
            onMouseLeave={handleSvgMouseUp}
            onWheel={handleSvgWheel}
          >
            <defs>
              <pattern id="topo-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="hsl(220 13% 14%)" strokeWidth="1" />
              </pattern>
              <radialGradient id="dev-glow">
                <stop offset="0%" stopColor="white" stopOpacity="0.3" />
                <stop offset="100%" stopColor="white" stopOpacity="0" />
              </radialGradient>
            </defs>

            <rect id="topo-bg" width="100%" height="100%" fill="url(#topo-grid)" />

            <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
              {/* Линии связи */}
              {links.map((link) => {
                const src = devices.find((d) => d.id === link.source_id);
                const tgt = devices.find((d) => d.id === link.target_id);
                if (!src || !tgt) return null;
                const start = { x: src.x, y: src.y };
                const end = { x: tgt.x, y: tgt.y };
                const path = buildPath(start, end, link.waypoints);
                const load = link.bandwidth_mbps > 0 ? link.current_mbps / link.bandwidth_mbps : 0;
                const speed = Math.max(0.4, Math.min(4, load * 4));
                const isSel = selectedLink === link.id;
                return (
                  <g key={link.id}>
                    {/* Невидимая широкая линия для удобного клика */}
                    <path
                      d={path}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={16}
                      style={{ cursor: "pointer" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedLink(link.id);
                        setSelectedDevice(null);
                      }}
                      onDoubleClick={(e) => addWaypoint(link, e)}
                    />
                    {/* Базовая линия */}
                    <path
                      d={path}
                      fill="none"
                      stroke={link.color}
                      strokeOpacity={isSel ? 0.5 : 0.3}
                      strokeWidth={isSel ? 5 : 3}
                      strokeLinecap="round"
                      style={{ pointerEvents: "none" }}
                    />
                    {/* Пульс — бегущие штрихи */}
                    {load > 0.01 && (
                      <path
                        d={path}
                        fill="none"
                        stroke={link.color}
                        strokeWidth={isSel ? 5 : 3}
                        strokeLinecap="round"
                        strokeDasharray="12 18"
                        style={{
                          pointerEvents: "none",
                          animation: `dashflow ${(2 / speed).toFixed(2)}s linear infinite`,
                          filter: `drop-shadow(0 0 ${4 + load * 6}px ${link.color})`,
                        }}
                      />
                    )}
                    {/* Подпись */}
                    {(link.label || link.current_mbps > 0) && (
                      <g style={{ pointerEvents: "none" }}>
                        {(() => {
                          const mid = link.waypoints.length > 0
                            ? link.waypoints[Math.floor(link.waypoints.length / 2)]
                            : { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
                          const txt = link.label || `${link.current_mbps.toFixed(0)}/${link.bandwidth_mbps} Мбит`;
                          return (
                            <>
                              <rect x={mid.x - 50} y={mid.y - 10} width={100} height={20} rx={4} fill="hsl(220 13% 9%)" stroke={link.color} strokeOpacity={0.5} />
                              <text x={mid.x} y={mid.y + 4} textAnchor="middle" fill={link.color} fontSize={10} fontFamily="monospace">
                                {txt}
                              </text>
                            </>
                          );
                        })()}
                      </g>
                    )}
                    {/* Точки изгиба */}
                    {isSel && link.waypoints.map((wp, i) => (
                      <circle
                        key={i}
                        cx={wp.x}
                        cy={wp.y}
                        r={6}
                        fill={link.color}
                        stroke="white"
                        strokeWidth={2}
                        style={{ cursor: "move" }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setDraggingWp({ linkId: link.id, idx: i });
                        }}
                        onDoubleClick={(e) => { e.stopPropagation(); removeWaypoint(link, i); }}
                      />
                    ))}
                  </g>
                );
              })}

              {/* Устройства */}
              {devices.map((dev) => {
                const preset = getPreset(dev.device_type);
                const isSel = selectedDevice === dev.id;
                const isLinkFrom = linkFrom === dev.id;
                const sColor = statusColor(dev.status);
                return (
                  <g
                    key={dev.id}
                    transform={`translate(${dev.x},${dev.y})`}
                    style={{ cursor: tool === "link" ? "crosshair" : "move" }}
                    onMouseDown={(e) => handleDeviceMouseDown(e, dev)}
                  >
                    {(isSel || isLinkFrom) && (
                      <circle r={42} fill="url(#dev-glow)" />
                    )}
                    <circle
                      r={32}
                      fill={preset.color}
                      fillOpacity={0.18}
                      stroke={isLinkFrom ? "#fbbf24" : isSel ? "#fff" : preset.color}
                      strokeWidth={isSel || isLinkFrom ? 3 : 2}
                    />
                    <circle r={26} fill="hsl(220 13% 11%)" />
                    <foreignObject x={-14} y={-14} width={28} height={28}>
                      <div className="w-full h-full flex items-center justify-center" style={{ color: preset.color }}>
                        <Icon name={dev.icon || preset.icon} size={22} />
                      </div>
                    </foreignObject>
                    <circle cx={20} cy={-20} r={5} fill={sColor} stroke="hsl(220 13% 9%)" strokeWidth={2} />
                    <text x={0} y={50} textAnchor="middle" fill="hsl(0 0% 95%)" fontSize={11} fontWeight={500}>
                      {dev.name}
                    </text>
                    {dev.comment && (
                      <text x={0} y={64} textAnchor="middle" fill="hsl(0 0% 55%)" fontSize={9}>
                        {dev.comment.length > 30 ? dev.comment.slice(0, 30) + "…" : dev.comment}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
        </div>

        {/* Боковая панель свойств */}
        <div className="w-80 shrink-0 bg-card border border-border rounded-lg p-4 overflow-y-auto" style={{ maxHeight: "calc(100vh - 240px)" }}>
          {!selDev && !selLink && (
            <div className="text-center text-muted-foreground py-12">
              <Icon name="MousePointer2" size={32} className="mx-auto mb-2 opacity-50" />
              <div className="text-sm">Выбери устройство или линию</div>
              <div className="text-xs mt-2 opacity-70">
                Двойной клик по линии — добавить точку изгиба.<br />
                Двойной клик по точке — удалить.
              </div>
            </div>
          )}

          {selDev && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs uppercase text-muted-foreground font-semibold">Устройство</div>
                <button onClick={() => deleteDevice(selDev.id)} className="text-xs text-destructive hover:underline flex items-center gap-1">
                  <Icon name="Trash2" size={11} />
                  Удалить
                </button>
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Название</label>
                <input
                  value={selDev.name}
                  onChange={(e) => setDevices((d) => d.map((x) => x.id === selDev.id ? { ...x, name: e.target.value } : x))}
                  onBlur={(e) => updateDevice(selDev.id, { name: e.target.value })}
                  className="w-full mt-1 h-8 px-2 bg-secondary border border-border rounded text-sm"
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Тип / Иконка</label>
                <div className="grid grid-cols-3 gap-1 mt-1">
                  {DEVICE_PRESETS.map((p) => (
                    <button
                      key={p.type}
                      onClick={() => updateDevice(selDev.id, { device_type: p.type, icon: p.icon })}
                      className={`flex flex-col items-center gap-1 p-2 rounded border text-[10px] ${
                        selDev.device_type === p.type
                          ? "border-primary bg-primary/10"
                          : "border-border bg-secondary/40 hover:bg-secondary"
                      }`}
                      style={selDev.device_type === p.type ? { color: p.color } : {}}
                    >
                      <Icon name={p.icon} size={18} />
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Статус</label>
                <div className="grid grid-cols-3 gap-1 mt-1">
                  {(["online", "warning", "offline"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => updateDevice(selDev.id, { status: s })}
                      className={`h-8 rounded text-xs font-medium border ${
                        selDev.status === s ? "border-primary" : "border-border bg-secondary/40"
                      }`}
                      style={{ color: statusColor(s) }}
                    >
                      {s === "online" ? "Online" : s === "warning" ? "Warning" : "Offline"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Комментарий</label>
                <textarea
                  value={selDev.comment}
                  onChange={(e) => setDevices((d) => d.map((x) => x.id === selDev.id ? { ...x, comment: e.target.value } : x))}
                  onBlur={(e) => updateDevice(selDev.id, { comment: e.target.value })}
                  rows={3}
                  className="w-full mt-1 p-2 bg-secondary border border-border rounded text-sm resize-none"
                />
              </div>
            </div>
          )}

          {selLink && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs uppercase text-muted-foreground font-semibold">Связь</div>
                <button onClick={() => deleteLink(selLink.id)} className="text-xs text-destructive hover:underline flex items-center gap-1">
                  <Icon name="Trash2" size={11} />
                  Удалить
                </button>
              </div>

              <div className="text-xs bg-secondary/50 rounded p-2 border border-border">
                <div>{devices.find((d) => d.id === selLink.source_id)?.name || "—"}</div>
                <div className="text-center text-muted-foreground my-1">↕</div>
                <div>{devices.find((d) => d.id === selLink.target_id)?.name || "—"}</div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">Порт A</label>
                  <input
                    value={selLink.source_port}
                    onChange={(e) => setLinks((ls) => ls.map((l) => l.id === selLink.id ? { ...l, source_port: e.target.value } : l))}
                    onBlur={(e) => updateLink(selLink.id, { source_port: e.target.value })}
                    placeholder="ether1"
                    className="w-full mt-1 h-8 px-2 bg-secondary border border-border rounded text-sm font-mono-data"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Порт B</label>
                  <input
                    value={selLink.target_port}
                    onChange={(e) => setLinks((ls) => ls.map((l) => l.id === selLink.id ? { ...l, target_port: e.target.value } : l))}
                    onBlur={(e) => updateLink(selLink.id, { target_port: e.target.value })}
                    placeholder="GE0/1"
                    className="w-full mt-1 h-8 px-2 bg-secondary border border-border rounded text-sm font-mono-data"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">Канал, Мбит/с</label>
                  <input
                    type="number"
                    value={selLink.bandwidth_mbps}
                    onChange={(e) => setLinks((ls) => ls.map((l) => l.id === selLink.id ? { ...l, bandwidth_mbps: Number(e.target.value) } : l))}
                    onBlur={(e) => updateLink(selLink.id, { bandwidth_mbps: Number(e.target.value) })}
                    className="w-full mt-1 h-8 px-2 bg-secondary border border-border rounded text-sm font-mono-data"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Загрузка, Мбит/с</label>
                  <input
                    type="number"
                    value={selLink.current_mbps}
                    onChange={(e) => setLinks((ls) => ls.map((l) => l.id === selLink.id ? { ...l, current_mbps: Number(e.target.value) } : l))}
                    onBlur={(e) => updateLink(selLink.id, { current_mbps: Number(e.target.value) })}
                    className="w-full mt-1 h-8 px-2 bg-secondary border border-border rounded text-sm font-mono-data"
                  />
                </div>
              </div>
              <div className="text-[10px] text-muted-foreground">
                Загрузка {Math.round((selLink.current_mbps / Math.max(1, selLink.bandwidth_mbps)) * 100)}% — линия пульсирует быстрее при росте трафика.
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Цвет</label>
                <div className="flex gap-1 mt-1">
                  {["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#a78bfa", "#22d3ee"].map((c) => (
                    <button
                      key={c}
                      onClick={() => updateLink(selLink.id, { color: c })}
                      className="w-7 h-7 rounded border-2"
                      style={{ background: c, borderColor: selLink.color === c ? "#fff" : "transparent" }}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Подпись (необязательно)</label>
                <input
                  value={selLink.label}
                  onChange={(e) => setLinks((ls) => ls.map((l) => l.id === selLink.id ? { ...l, label: e.target.value } : l))}
                  onBlur={(e) => updateLink(selLink.id, { label: e.target.value })}
                  placeholder="auto: 100/1000 Мбит"
                  className="w-full mt-1 h-8 px-2 bg-secondary border border-border rounded text-sm"
                />
              </div>

              <div className="text-[10px] text-muted-foreground p-2 bg-secondary/40 rounded">
                <Icon name="Info" size={10} className="inline mr-1" />
                Двойной клик по линии — добавить точку изгиба. Двойной клик по точке — удалить.
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes dashflow {
          to { stroke-dashoffset: -30; }
        }
      `}</style>
    </div>
  );
}
