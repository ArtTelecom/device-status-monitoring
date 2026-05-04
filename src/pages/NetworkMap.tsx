import { useState, useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import { toast } from "sonner";
import Icon from "@/components/ui/icon";
import PageHeader from "@/components/common/PageHeader";

const MAP_DEVICES_URL = "https://functions.poehali.dev/f7c8b99c-b2f6-45f1-b756-2afe78cdc1d5";
const LINKS_URL = "https://functions.poehali.dev/5d8489ec-523b-4377-9fc9-376a1506440d";
const TRAFFIC_URL = "https://functions.poehali.dev/1687d84b-471e-4ed5-8f23-1ee841698a9c";
const DISCOVERED_URL = "https://functions.poehali.dev/abad93d7-09ca-427b-aa2a-54953ec499b8";
const AUTOBUILD_URL = "https://functions.poehali.dev/7a43803f-93f5-4e5e-9047-f39101e88322";

type DevType = "olt" | "onu" | "router" | "server" | "switch" | "other";

interface MapDevice {
  id: number;
  device_type: DevType;
  name: string;
  lat: number;
  lng: number;
  status: string;
  comment: string;
  icon: string;
}

interface MapLink {
  id: number;
  source_id: number;
  target_id: number;
  source_port: string;
  target_port: string;
  bandwidth_mbps: number;
  current_mbps: number;
  color: string;
  label: string;
  source_discovered_id?: number;
  target_discovered_id?: number;
  source_if_index?: number;
  target_if_index?: number;
  auto_traffic?: boolean;
}

const TILE_URLS: Record<string, string> = {
  dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  light: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
  sat: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
};

const DEVICE_PRESETS: { type: DevType; label: string; icon: string; color: string }[] = [
  { type: "server", label: "Сервер", icon: "Server", color: "#a78bfa" },
  { type: "olt", label: "OLT", icon: "HardDrive", color: "#60a5fa" },
  { type: "switch", label: "Коммутатор", icon: "Network", color: "#34d399" },
  { type: "router", label: "Роутер", icon: "Router", color: "#f59e0b" },
  { type: "onu", label: "ONU", icon: "Wifi", color: "#22d3ee" },
  { type: "other", label: "Другое", icon: "Box", color: "#94a3b8" },
];

function getPreset(type: DevType) {
  return DEVICE_PRESETS.find((p) => p.type === type) || DEVICE_PRESETS[5];
}

const SVG_ICONS: Record<string, string> = {
  Server: '<rect x="3" y="3" width="18" height="8" rx="1"/><rect x="3" y="13" width="18" height="8" rx="1"/><circle cx="7" cy="7" r="0.5"/><circle cx="7" cy="17" r="0.5"/>',
  HardDrive: '<line x1="22" x2="2" y1="12" y2="12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><circle cx="6" cy="16" r="1"/>',
  Network: '<rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3M12 12V8"/>',
  Router: '<rect x="2" y="14" width="20" height="8" rx="2"/><circle cx="6.5" cy="18" r="0.5"/><circle cx="9.5" cy="18" r="0.5"/><path d="M8 8L4 4M16 8l4-4M12 4v4"/>',
  Wifi: '<path d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/>',
  Box: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>',
};

function makeDeviceIcon(d: MapDevice, isSelected: boolean, isLinkSrc: boolean): L.DivIcon {
  const preset = getPreset(d.device_type);
  const statusCol =
    d.status === "online" ? "#22c55e" : d.status === "warning" ? "#f59e0b" : "#ef4444";
  const ring = isLinkSrc ? "#fbbf24" : isSelected ? "#fff" : preset.color;
  const ringWidth = isSelected || isLinkSrc ? 3 : 2;
  const iconSvg = SVG_ICONS[d.icon || preset.icon] || SVG_ICONS[preset.icon] || SVG_ICONS.Box;
  return L.divIcon({
    className: "device-marker",
    html: `
      <div style="position:relative;display:flex;flex-direction:column;align-items:center;cursor:pointer;">
        <div style="width:48px;height:48px;border-radius:50%;background:rgba(20,22,28,0.95);border:${ringWidth}px solid ${ring};display:flex;align-items:center;justify-content:center;box-shadow:0 0 12px ${preset.color}66;color:${preset.color};position:relative;">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconSvg}</svg>
          <span style="position:absolute;top:-2px;right:-2px;width:10px;height:10px;border-radius:50%;background:${statusCol};border:2px solid rgba(20,22,28,0.95);"></span>
        </div>
        <div style="margin-top:2px;padding:1px 6px;background:rgba(20,22,28,0.85);border:1px solid rgba(255,255,255,0.1);border-radius:4px;font-size:10px;font-weight:500;color:#fff;white-space:nowrap;max-width:140px;overflow:hidden;text-overflow:ellipsis;">${d.name}</div>
      </div>
    `,
    iconSize: [48, 64],
    iconAnchor: [24, 24],
  });
}

function statusColor(s: string) {
  return s === "online" ? "#22c55e" : s === "warning" ? "#f59e0b" : "#ef4444";
}

export default function NetworkMap() {
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const markersRef = useRef<Record<number, L.Marker>>({});
  const linkPolylinesRef = useRef<Record<number, { base: L.Polyline; pulse: L.Polyline }>>({});
  const tempLineRef = useRef<L.Polyline | null>(null);

  const [devices, setDevices] = useState<MapDevice[]>([]);
  const [links, setLinks] = useState<MapLink[]>([]);
  const [tileStyle, setTileStyle] = useState<"dark" | "light" | "sat">("dark");
  const [tool, setTool] = useState<"select" | "link" | "place">("select");
  const [placeType, setPlaceType] = useState<DevType>("router");
  const [linkFrom, setLinkFrom] = useState<number | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<number | null>(null);
  const [selectedLink, setSelectedLink] = useState<number | null>(null);
  const [editMode, setEditMode] = useState(true);
  const [showPalette, setShowPalette] = useState(false);
  const [autobuilding, setAutobuilding] = useState(false);
  const [discoveredList, setDiscoveredList] = useState<{ id: number; ip: string; hostname: string }[]>([]);
  const [srcIfaces, setSrcIfaces] = useState<{ if_index: number; if_name: string; speed_mbps: number; oper_status: string }[]>([]);
  const [tgtIfaces, setTgtIfaces] = useState<{ if_index: number; if_name: string; speed_mbps: number; oper_status: string }[]>([]);

  // Загрузка
  const loadAll = useCallback(async () => {
    try {
      const [d, l] = await Promise.all([fetch(MAP_DEVICES_URL), fetch(LINKS_URL)]);
      const dj = await d.json();
      const lj = await l.json();
      if (dj.success) setDevices(dj.items || []);
      if (lj.success) setLinks(lj.items || []);
    } catch {
      toast.error("Ошибка загрузки карты");
    }
  }, []);

  useEffect(() => {
    loadAll();
    fetch(DISCOVERED_URL)
      .then((r) => r.json())
      .then((j) => j.success && setDiscoveredList((j.items || []).map((x: { id: number; ip: string; hostname: string }) => ({ id: x.id, ip: x.ip, hostname: x.hostname }))))
      .catch(() => {});
  }, [loadAll]);

  // Инициализация Leaflet
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [55.7558, 37.6173],
      zoom: 11,
      zoomControl: false,
    });
    L.control.zoom({ position: "topright" }).addTo(map);
    const tl = L.tileLayer(TILE_URLS[tileStyle], {
      maxZoom: 20,
      subdomains: "abcd",
      attribution: '© OSM contributors',
    });
    tl.addTo(map);
    tileLayerRef.current = tl;
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Смена тайлов
  useEffect(() => {
    if (!mapRef.current || !tileLayerRef.current) return;
    mapRef.current.removeLayer(tileLayerRef.current);
    const tl = L.tileLayer(TILE_URLS[tileStyle], {
      maxZoom: 20,
      subdomains: "abcd",
    });
    tl.addTo(mapRef.current);
    tileLayerRef.current = tl;
  }, [tileStyle]);

  // Клик по карте — добавляет устройство в режиме place
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const handler = async (e: L.LeafletMouseEvent) => {
      if (tool !== "place") return;
      const preset = DEVICE_PRESETS.find((p) => p.type === placeType) || DEVICE_PRESETS[3];
      const r = await fetch(MAP_DEVICES_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          device_type: placeType,
          name: preset.label,
          lat: e.latlng.lat,
          lng: e.latlng.lng,
          status: "online",
          icon: preset.icon,
        }),
      });
      const j = await r.json();
      if (j.success) {
        setDevices((d) => [...d, j.item]);
        toast.success(`${preset.label} добавлен`);
      }
    };
    map.on("click", handler);
    return () => {
      map.off("click", handler);
    };
  }, [tool, placeType]);

  // Рендер маркеров
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Удалить старые
    Object.values(markersRef.current).forEach((m) => m.remove());
    markersRef.current = {};

    devices.forEach((d) => {
      const isSel = selectedDevice === d.id;
      const isLinkSrc = linkFrom === d.id;
      const marker = L.marker([d.lat, d.lng], {
        icon: makeDeviceIcon(d, isSel, isLinkSrc),
        draggable: editMode && tool === "select",
        autoPan: true,
      }).addTo(map);
      marker.on("click", (ev: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(ev);
        if (tool === "link") {
          if (linkFrom === null) {
            setLinkFrom(d.id);
          } else if (linkFrom !== d.id) {
            createLink(linkFrom, d.id);
            setLinkFrom(null);
          }
        } else {
          setSelectedDevice(d.id);
          setSelectedLink(null);
        }
      });
      marker.on("dragend", async (ev) => {
        const ll = (ev.target as L.Marker).getLatLng();
        await fetch(MAP_DEVICES_URL, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: d.id, lat: ll.lat, lng: ll.lng }),
        });
        setDevices((arr) => arr.map((x) => (x.id === d.id ? { ...x, lat: ll.lat, lng: ll.lng } : x)));
      });
      markersRef.current[d.id] = marker;
    });
     
  }, [devices, editMode, tool, selectedDevice, linkFrom]);

  // Рендер линий
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    Object.values(linkPolylinesRef.current).forEach((p) => {
      p.base.remove();
      p.pulse.remove();
    });
    linkPolylinesRef.current = {};

    links.forEach((l) => {
      const src = devices.find((d) => d.id === l.source_id);
      const tgt = devices.find((d) => d.id === l.target_id);
      if (!src || !tgt) return;
      const isSel = selectedLink === l.id;
      const load = l.bandwidth_mbps > 0 ? l.current_mbps / l.bandwidth_mbps : 0;
      const speed = Math.max(0.5, Math.min(4, load * 4));

      const base = L.polyline(
        [
          [src.lat, src.lng],
          [tgt.lat, tgt.lng],
        ],
        {
          color: l.color || "#22c55e",
          weight: isSel ? 6 : 4,
          opacity: isSel ? 0.7 : 0.45,
          interactive: true,
        }
      ).addTo(map);
      base.on("click", (ev) => {
        L.DomEvent.stopPropagation(ev);
        setSelectedLink(l.id);
        setSelectedDevice(null);
      });

      // Пульс
      const pulse = L.polyline(
        [
          [src.lat, src.lng],
          [tgt.lat, tgt.lng],
        ],
        {
          color: l.color || "#22c55e",
          weight: isSel ? 6 : 4,
          opacity: load > 0.01 ? 1 : 0,
          dashArray: "12 18",
          className: load > 0.01 ? `link-pulse pulse-${l.id}` : "",
        }
      ).addTo(map);

      // Анимация скорости через CSS-переменную
      const el = pulse.getElement() as SVGElement | null;
      if (el && load > 0.01) {
        el.style.animationDuration = `${(2 / speed).toFixed(2)}s`;
        el.style.filter = `drop-shadow(0 0 ${4 + load * 6}px ${l.color || "#22c55e"})`;
      }

      linkPolylinesRef.current[l.id] = { base, pulse };
    });

    // Подписи (popup при селекте)
    if (selectedLink !== null) {
      const link = links.find((x) => x.id === selectedLink);
      if (link) {
        const src = devices.find((d) => d.id === link.source_id);
        const tgt = devices.find((d) => d.id === link.target_id);
        if (src && tgt) {
          const mid: [number, number] = [(src.lat + tgt.lat) / 2, (src.lng + tgt.lng) / 2];
          L.popup({ closeButton: false, autoClose: false, closeOnClick: false, className: "link-popup" })
            .setLatLng(mid)
            .setContent(
              `<div style="font-family:monospace;font-size:11px;color:${link.color}">
                ${link.current_mbps.toFixed(1)} / ${link.bandwidth_mbps} Мбит/с
                ${link.label ? `<br/><span style="color:#aaa">${link.label}</span>` : ""}
              </div>`
            )
            .openOn(map);
        }
      }
    }
  }, [links, devices, selectedLink]);

  // Полилиния-предпросмотр при рисовании связи
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (tempLineRef.current) {
      tempLineRef.current.remove();
      tempLineRef.current = null;
    }
    if (tool !== "link" || linkFrom === null) return;
    const src = devices.find((d) => d.id === linkFrom);
    if (!src) return;
    const moveHandler = (e: L.LeafletMouseEvent) => {
      if (!tempLineRef.current) {
        tempLineRef.current = L.polyline(
          [
            [src.lat, src.lng],
            [e.latlng.lat, e.latlng.lng],
          ],
          { color: "#fbbf24", weight: 2, dashArray: "6 8", opacity: 0.7 }
        ).addTo(map);
      } else {
        tempLineRef.current.setLatLngs([
          [src.lat, src.lng],
          [e.latlng.lat, e.latlng.lng],
        ]);
      }
    };
    map.on("mousemove", moveHandler);
    return () => {
      map.off("mousemove", moveHandler);
      if (tempLineRef.current) {
        tempLineRef.current.remove();
        tempLineRef.current = null;
      }
    };
  }, [tool, linkFrom, devices]);

  // Живая пульсация — обновление трафика каждые 5 сек
  useEffect(() => {
    const tick = async () => {
      try {
        const r = await fetch(TRAFFIC_URL);
        const j = await r.json();
        if (j.success && j.items) {
          setLinks((prev) =>
            prev.map((l) => {
              const t = j.items.find((x: { id: number; current_mbps: number; bandwidth_mbps: number }) => x.id === l.id);
              return t ? { ...l, current_mbps: t.current_mbps, bandwidth_mbps: t.bandwidth_mbps || l.bandwidth_mbps } : l;
            })
          );
        }
      } catch {
        /* ignore */
      }
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, []);

  // Подгрузка интерфейсов выбранной линии
  useEffect(() => {
    const sel = links.find((l) => l.id === selectedLink);
    if (!sel) {
      setSrcIfaces([]);
      setTgtIfaces([]);
      return;
    }
    const loadIf = async (did: number, setter: (v: { if_index: number; if_name: string; speed_mbps: number; oper_status: string }[]) => void) => {
      if (!did) {
        setter([]);
        return;
      }
      const r = await fetch(`${DISCOVERED_URL}?id=${did}`);
      const j = await r.json();
      if (j.success && j.item) setter(j.item.interfaces || []);
    };
    loadIf(sel.source_discovered_id || 0, setSrcIfaces);
    loadIf(sel.target_discovered_id || 0, setTgtIfaces);
  }, [selectedLink, links]);

  const createLink = async (sourceId: number, targetId: number) => {
    const r = await fetch(LINKS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_id: sourceId,
        target_id: targetId,
        bandwidth_mbps: 1000,
        current_mbps: 0,
        color: "#22c55e",
      }),
    });
    const j = await r.json();
    if (j.success) {
      setLinks((ls) => [...ls, j.item]);
      toast.success("Связь создана");
    }
  };

  const deleteDevice = async (id: number) => {
    if (!confirm("Удалить устройство и все его связи?")) return;
    const r = await fetch(`${MAP_DEVICES_URL}?id=${id}`, { method: "DELETE" });
    const j = await r.json();
    if (j.success) {
      setDevices((d) => d.filter((x) => x.id !== id));
      setLinks((ls) => ls.filter((l) => l.source_id !== id && l.target_id !== id));
      setSelectedDevice(null);
      toast.success("Удалено");
    }
  };

  const deleteAll = async () => {
    if (!confirm("Удалить ВСЕ устройства и связи с карты? Это необратимо.")) return;
    const r = await fetch(`${MAP_DEVICES_URL}?all=1`, { method: "DELETE" });
    const j = await r.json();
    if (j.success) {
      setDevices([]);
      setLinks([]);
      setSelectedDevice(null);
      setSelectedLink(null);
      toast.success("Карта очищена");
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

  const updateDevice = async (id: number, patch: Partial<MapDevice>) => {
    setDevices((d) => d.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    await fetch(MAP_DEVICES_URL, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
  };

  const updateLink = async (id: number, patch: Partial<MapLink>) => {
    setLinks((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    await fetch(LINKS_URL, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
  };

  const autoBuild = async (clear: boolean) => {
    if (clear && !confirm("Очистить связи и построить заново из найденных OLT/LLDP?")) return;
    setAutobuilding(true);
    try {
      const r = await fetch(AUTOBUILD_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clear }),
      });
      const j = await r.json();
      if (j.success) {
        toast.success(
          `Создано: ${j.created_links} связей (OLT-ONU: ${j.olt_onu_links || 0}), ${j.created_devices} устройств`
        );
        await loadAll();
      } else {
        toast.error("Ошибка авто-построения");
      }
    } finally {
      setAutobuilding(false);
    }
  };

  const selDev = devices.find((d) => d.id === selectedDevice) || null;
  const selLink = links.find((l) => l.id === selectedLink) || null;

  return (
    <div className="space-y-3 animate-fade-in">
      <PageHeader
        title="Карта сети"
        description="Перетаскивай устройства, рисуй связи. OLT и привязанные ONU добавляются автоматически из агента."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setEditMode((v) => !v)}
              className={`h-9 px-3 rounded-md text-sm font-medium flex items-center gap-2 border ${editMode ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300" : "bg-secondary border-border"}`}
            >
              <Icon name={editMode ? "Pencil" : "Lock"} size={14} />
              {editMode ? "Редактирование" : "Просмотр"}
            </button>
            <button
              onClick={() => setShowPalette((v) => !v)}
              className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2 hover:bg-primary/90"
            >
              <Icon name="Plus" size={14} />
              Добавить устройство
            </button>
            <button
              onClick={() => {
                setTool((t) => (t === "link" ? "select" : "link"));
                setLinkFrom(null);
              }}
              className={`h-9 px-3 rounded-md text-sm font-medium flex items-center gap-2 border ${tool === "link" ? "bg-red-500/20 border-red-500/50 text-red-300" : "bg-secondary border-border hover:bg-accent"}`}
            >
              <Icon name="Spline" size={14} />
              {tool === "link" ? (linkFrom !== null ? "Выбери второе" : "Выбери первое") : "Связь"}
            </button>
            <button
              onClick={() => autoBuild(false)}
              disabled={autobuilding}
              className="h-9 px-3 rounded-md bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-sm font-medium flex items-center gap-2 hover:bg-emerald-500/25 disabled:opacity-50"
              title="OLT-ONU + LLDP"
            >
              <Icon name={autobuilding ? "Loader2" : "Sparkles"} size={14} className={autobuilding ? "animate-spin" : ""} />
              Авто
            </button>
            <button
              onClick={deleteAll}
              className="h-9 px-3 rounded-md bg-destructive/15 border border-destructive/40 text-destructive text-sm font-medium flex items-center gap-2 hover:bg-destructive/25"
            >
              <Icon name="Trash2" size={14} />
              Очистить
            </button>
            <div className="flex bg-secondary rounded-md border border-border overflow-hidden">
              {(["dark", "light", "sat"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTileStyle(t)}
                  className={`h-9 px-3 text-xs font-medium ${tileStyle === t ? "bg-accent" : "hover:bg-accent/50"}`}
                >
                  {t === "dark" ? "Тёмная" : t === "light" ? "Светлая" : "Спутник"}
                </button>
              ))}
            </div>
          </div>
        }
      />

      {showPalette && (
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-2 flex items-center gap-2">
            <Icon name="Info" size={12} />
            Выбери тип, потом кликни в нужное место на карте
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            {DEVICE_PRESETS.map((p) => (
              <button
                key={p.type}
                onClick={() => {
                  setPlaceType(p.type);
                  setTool("place");
                  setShowPalette(false);
                  toast.info(`Кликни на карту чтобы поставить «${p.label}»`);
                }}
                className="flex flex-col items-center gap-1 p-3 rounded-lg border border-border bg-secondary/40 hover:border-primary/40"
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${p.color}20`, color: p.color }}>
                  <Icon name={p.icon} size={22} />
                </div>
                <span className="text-xs">{p.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <div className="flex-1 bg-card border border-border rounded-lg overflow-hidden relative" style={{ height: "calc(100vh - 240px)", minHeight: 500 }}>
          {tool === "place" && (
            <div className="absolute top-3 left-3 z-[1000] bg-red-500/20 border border-red-500/40 text-red-300 rounded px-3 py-1.5 text-xs font-medium flex items-center gap-2 backdrop-blur">
              <Icon name="MapPin" size={12} />
              Кликни на карту чтобы поставить «{getPreset(placeType).label}»
              <button onClick={() => setTool("select")} className="ml-2 hover:text-white">
                <Icon name="X" size={12} />
              </button>
            </div>
          )}
          {tool === "link" && (
            <div className="absolute top-3 left-3 z-[1000] bg-red-500/20 border border-red-500/40 text-red-300 rounded px-3 py-1.5 text-xs font-medium flex items-center gap-2 backdrop-blur">
              <Icon name="Spline" size={12} />
              {linkFrom !== null ? "Кликни второе устройство" : "Кликни первое устройство"}
              <button onClick={() => { setTool("select"); setLinkFrom(null); }} className="ml-2 hover:text-white">
                <Icon name="X" size={12} />
              </button>
            </div>
          )}
          <div ref={containerRef} className="w-full h-full" style={{ background: "#0b0d12" }} />
        </div>

        <div className="w-80 shrink-0 bg-card border border-border rounded-lg p-4 overflow-y-auto" style={{ maxHeight: "calc(100vh - 240px)" }}>
          {!selDev && !selLink && (
            <div className="text-center text-muted-foreground py-12">
              <Icon name="MousePointer2" size={32} className="mx-auto mb-2 opacity-50" />
              <div className="text-sm font-medium">Карта</div>
              <div className="text-xs mt-2 opacity-70">
                Устройств: {devices.length}<br />
                Связей: {links.length}
              </div>
              <div className="text-[10px] mt-4 text-muted-foreground/80 leading-relaxed">
                Кликни по устройству или линии чтобы редактировать.<br /><br />
                <b>Автоматика:</b> запусти агент в локальной сети, OLT и его ONU появятся сами с реальными сигналами и пульсацией.
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
                <label className="text-xs text-muted-foreground">Тип / иконка</label>
                <div className="grid grid-cols-3 gap-1 mt-1">
                  {DEVICE_PRESETS.map((p) => (
                    <button
                      key={p.type}
                      onClick={() => updateDevice(selDev.id, { device_type: p.type, icon: p.icon })}
                      className={`flex flex-col items-center gap-1 p-2 rounded border text-[10px] ${selDev.device_type === p.type ? "border-primary bg-primary/10" : "border-border bg-secondary/40 hover:bg-secondary"}`}
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
                      className={`h-8 rounded text-xs font-medium border ${selDev.status === s ? "border-primary" : "border-border bg-secondary/40"}`}
                      style={{ color: statusColor(s) }}
                    >
                      {s === "online" ? "Online" : s === "warning" ? "Warning" : "Offline"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Координаты</label>
                <div className="text-[10px] font-mono-data text-muted-foreground mt-1">
                  {selDev.lat.toFixed(6)}, {selDev.lng.toFixed(6)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">Перетащи маркер на карте чтобы изменить</div>
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
                  <label className="text-[10px] text-muted-foreground">Порт A</label>
                  <input
                    value={selLink.source_port}
                    onChange={(e) => setLinks((ls) => ls.map((l) => l.id === selLink.id ? { ...l, source_port: e.target.value } : l))}
                    onBlur={(e) => updateLink(selLink.id, { source_port: e.target.value })}
                    placeholder="ether1"
                    className="w-full mt-1 h-8 px-2 bg-secondary border border-border rounded text-sm font-mono-data"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Порт B</label>
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
                  <label className="text-[10px] text-muted-foreground">Канал, Мбит/с</label>
                  <input
                    type="number"
                    value={selLink.bandwidth_mbps}
                    onChange={(e) => setLinks((ls) => ls.map((l) => l.id === selLink.id ? { ...l, bandwidth_mbps: Number(e.target.value) } : l))}
                    onBlur={(e) => updateLink(selLink.id, { bandwidth_mbps: Number(e.target.value) })}
                    className="w-full mt-1 h-8 px-2 bg-secondary border border-border rounded text-sm font-mono-data"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Загрузка, Мбит/с</label>
                  <input
                    type="number"
                    value={selLink.current_mbps}
                    onChange={(e) => setLinks((ls) => ls.map((l) => l.id === selLink.id ? { ...l, current_mbps: Number(e.target.value) } : l))}
                    onBlur={(e) => updateLink(selLink.id, { current_mbps: Number(e.target.value) })}
                    className="w-full mt-1 h-8 px-2 bg-secondary border border-border rounded text-sm font-mono-data"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] text-muted-foreground">Цвет</label>
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

              <div className="border-t border-border pt-3 mt-3">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">
                    Авто-трафик (живая пульсация)
                  </label>
                  <button
                    onClick={() => updateLink(selLink.id, { auto_traffic: !selLink.auto_traffic })}
                    className={`relative w-10 h-5 rounded-full transition-colors ${selLink.auto_traffic ? "bg-emerald-500" : "bg-border"}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${selLink.auto_traffic ? "translate-x-5" : ""}`} />
                  </button>
                </div>
                {selLink.auto_traffic && (
                  <div className="space-y-2">
                    <div>
                      <label className="text-[10px] text-muted-foreground">Источник (агент)</label>
                      <select
                        value={selLink.source_discovered_id || 0}
                        onChange={(e) => updateLink(selLink.id, { source_discovered_id: Number(e.target.value), source_if_index: 0 })}
                        className="w-full mt-1 h-8 px-2 bg-secondary border border-border rounded text-xs"
                      >
                        <option value={0}>— не выбрано —</option>
                        {discoveredList.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.hostname || d.ip} ({d.ip})
                          </option>
                        ))}
                      </select>
                    </div>
                    {srcIfaces.length > 0 && (
                      <div>
                        <label className="text-[10px] text-muted-foreground">Порт источника</label>
                        <select
                          value={selLink.source_if_index || 0}
                          onChange={(e) => updateLink(selLink.id, { source_if_index: Number(e.target.value) })}
                          className="w-full mt-1 h-8 px-2 bg-secondary border border-border rounded text-xs font-mono-data"
                        >
                          <option value={0}>— выбери порт —</option>
                          {srcIfaces.map((i) => (
                            <option key={i.if_index} value={i.if_index}>
                              {i.if_name} {i.speed_mbps ? `· ${i.speed_mbps}M` : ""} · {i.oper_status}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="text-[10px] text-emerald-400 bg-emerald-500/10 rounded p-2 border border-emerald-500/30">
                      <Icon name="Activity" size={10} className="inline mr-1" />
                      Обновляется каждые 5 сек по реальным счётчикам SNMP
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .leaflet-container { background: #0b0d12 !important; }
        .device-marker { background: transparent !important; border: none !important; }
        .link-popup .leaflet-popup-content-wrapper { background: rgba(20,22,28,0.95); border: 1px solid rgba(255,255,255,0.1); padding: 4px 8px; border-radius: 6px; }
        .link-popup .leaflet-popup-tip { display: none; }
        .link-popup .leaflet-popup-content { margin: 4px 6px; }
        @keyframes leaflet-dashflow {
          to { stroke-dashoffset: -30; }
        }
        .link-pulse {
          animation: leaflet-dashflow 2s linear infinite;
        }
      `}</style>
    </div>
  );
}