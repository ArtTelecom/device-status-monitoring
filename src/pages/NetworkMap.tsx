import { useState, useEffect, useRef } from "react";
import L from "leaflet";
import { toast } from "sonner";
import { makeOltIcon, makeOnuIcon, makeRouterIcon } from "@/components/map/leaflet-setup";
import Icon from "@/components/ui/icon";
import PageHeader from "@/components/common/PageHeader";
import { OLTS, ONUS, ROUTERS } from "@/lib/mock-data";

const MAP_DEVICES_URL = "https://functions.poehali.dev/f7c8b99c-b2f6-45f1-b756-2afe78cdc1d5";

interface MapDevice {
  id: number;
  device_type: "olt" | "onu" | "router";
  name: string;
  lat: number;
  lng: number;
  status: string;
  comment: string;
}

type LayerToggle = {
  olts: boolean;
  onus: boolean;
  routers: boolean;
  links: boolean;
  traffic: boolean;
  problems: boolean;
};

const TILE_URLS: Record<string, string> = {
  dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  light: "https://core-renderer-tiles.maps.yandex.net/tiles?l=map&x={x}&y={y}&z={z}&scale=1&lang=ru_RU",
  sat: "https://core-sat.maps.yandex.net/tiles?l=sat&x={x}&y={y}&z={z}&scale=1&lang=ru_RU",
};

function statusBadge(status: string) {
  const map: Record<string, { l: string; c: string }> = {
    online: { l: "В сети", c: "#22c55e" },
    warning: { l: "Внимание", c: "#f59e0b" },
    offline: { l: "Офлайн", c: "#ef4444" },
    los: { l: "LOS", c: "#dc2626" },
  };
  const s = map[status] || { l: status, c: "#6b7280" };
  return `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 6px;border-radius:4px;font-size:10px;background:${s.c}22;color:${s.c}"><span style="width:6px;height:6px;border-radius:50%;background:${s.c}"></span>${s.l}</span>`;
}

function signalBar(value: number | null) {
  if (value === null || value === undefined) return '<span style="color:#888">—</span>';
  const color = value > -25 ? "#22c55e" : value > -28 ? "#f59e0b" : "#ef4444";
  return `<span style="font-family:monospace;color:${color}">${value.toFixed(1)} дБм</span>`;
}

export default function NetworkMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const layerGroupsRef = useRef<{
    olts: L.LayerGroup;
    onus: L.LayerGroup;
    routers: L.LayerGroup;
    links: L.LayerGroup;
    rings: L.LayerGroup;
  } | null>(null);

  const [tileStyle, setTileStyle] = useState<"dark" | "light" | "sat">("dark");
  const [layers, setLayers] = useState<LayerToggle>({
    olts: true,
    onus: true,
    routers: true,
    links: true,
    traffic: true,
    problems: false,
  });
  const [filter, setFilter] = useState<"all" | "online" | "warning" | "offline">("all");
  const [selectedOlt, setSelectedOlt] = useState<string | null>(null);
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [customDevices, setCustomDevices] = useState<MapDevice[]>([]);
  const customGroupRef = useRef<L.LayerGroup | null>(null);
  const [pickMode, setPickMode] = useState(false);
  const [form, setForm] = useState({
    device_type: "router" as "olt" | "onu" | "router",
    name: "",
    lat: "",
    lng: "",
    comment: "",
  });
  const [saving, setSaving] = useState(false);

  const loadDevices = async () => {
    try {
      const r = await fetch(MAP_DEVICES_URL);
      const j = await r.json();
      if (j.success) setCustomDevices(j.items || []);
    } catch (e) {
      toast.error("Не удалось загрузить устройства");
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Удалить устройство «${name}» с карты?`)) return;
    try {
      const r = await fetch(`${MAP_DEVICES_URL}?id=${id}`, { method: "DELETE" });
      const j = await r.json();
      if (j.success) {
        toast.success("Устройство удалено");
        setCustomDevices((d) => d.filter((x) => x.id !== id));
      } else {
        toast.error(j.message || "Ошибка удаления");
      }
    } catch {
      toast.error("Ошибка сети");
    }
  };

  const handleAdd = async () => {
    if (!form.name.trim()) {
      toast.error("Укажите название");
      return;
    }
    const lat = parseFloat(form.lat);
    const lng = parseFloat(form.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      toast.error("Укажите корректные координаты или кликните на карту");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch(MAP_DEVICES_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          device_type: form.device_type,
          name: form.name,
          lat,
          lng,
          status: "online",
          comment: form.comment,
        }),
      });
      const j = await r.json();
      if (j.success && j.item) {
        toast.success("Устройство добавлено");
        setCustomDevices((d) => [j.item, ...d]);
        setShowAddDevice(false);
        setForm({ device_type: "router", name: "", lat: "", lng: "", comment: "" });
        setPickMode(false);
      } else {
        toast.error(j.message || "Ошибка");
      }
    } catch {
      toast.error("Ошибка сети");
    } finally {
      setSaving(false);
    }
  };

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [55.7558, 37.6173],
      zoom: 11,
      zoomControl: true,
      preferCanvas: true,
      attributionControl: false,
    });

    const tile = L.tileLayer(TILE_URLS.dark, {
      maxZoom: 19,
    }).addTo(map);

    const groups = {
      olts: L.layerGroup().addTo(map),
      onus: L.layerGroup().addTo(map),
      routers: L.layerGroup().addTo(map),
      links: L.layerGroup().addTo(map),
      rings: L.layerGroup().addTo(map),
    };
    const customGroup = L.layerGroup().addTo(map);

    mapRef.current = map;
    tileLayerRef.current = tile;
    layerGroupsRef.current = groups;
    customGroupRef.current = customGroup;

    loadDevices();

    setTimeout(() => map.invalidateSize(), 50);
    setTimeout(() => map.invalidateSize(), 250);
    setTimeout(() => map.invalidateSize(), 700);

    return () => {
      map.remove();
      mapRef.current = null;
      tileLayerRef.current = null;
      layerGroupsRef.current = null;
    };
  }, []);

  // Update tile layer
  useEffect(() => {
    if (!tileLayerRef.current) return;
    tileLayerRef.current.setUrl(TILE_URLS[tileStyle]);
  }, [tileStyle]);

  // Render markers when filters/layers change
  useEffect(() => {
    if (!mapRef.current || !layerGroupsRef.current) return;
    const groups = layerGroupsRef.current;

    groups.olts.clearLayers();
    groups.onus.clearLayers();
    groups.routers.clearLayers();
    groups.links.clearLayers();
    groups.rings.clearLayers();

    let onus = ONUS;
    if (selectedOlt) onus = onus.filter((o) => o.oltId === selectedOlt);
    if (filter === "online") onus = onus.filter((o) => o.status === "online");
    else if (filter === "warning") onus = onus.filter((o) => o.status === "warning");
    else if (filter === "offline") onus = onus.filter((o) => o.status === "offline" || o.status === "los");
    if (layers.problems) onus = onus.filter((o) => o.status !== "online");

    let routers = ROUTERS;
    if (selectedOlt) routers = routers.filter((r) => r.oltId === selectedOlt);
    if (filter === "online") routers = routers.filter((r) => r.status === "online");
    else if (filter === "warning") routers = routers.filter((r) => r.status === "warning");
    else if (filter === "offline") routers = routers.filter((r) => r.status === "offline");
    if (layers.problems) routers = routers.filter((r) => r.status !== "online");

    if (layers.links) {
      onus.forEach((onu) => {
        const olt = OLTS.find((o) => o.id === onu.oltId);
        if (!olt) return;
        const color =
          onu.rxPower === null
            ? "#ef4444"
            : onu.rxPower > -25
              ? "#22c55e"
              : onu.rxPower > -28
                ? "#f59e0b"
                : "#ef4444";
        const weight = layers.traffic
          ? Math.max(0.5, Math.min(4, (onu.trafficIn + onu.trafficOut) / 60))
          : 1;
        L.polyline(
          [
            [olt.lat, olt.lng],
            [onu.lat, onu.lng],
          ],
          {
            color,
            weight,
            opacity: 0.55,
            dashArray: onu.status === "offline" || onu.status === "los" ? "4,6" : undefined,
          }
        ).addTo(groups.links);
      });
    }

    if (layers.olts) {
      OLTS.forEach((olt) => {
        const c = olt.status === "online" ? "#22c55e" : olt.status === "warning" ? "#f59e0b" : "#ef4444";
        L.circleMarker([olt.lat, olt.lng], {
          radius: 28,
          color: c,
          fillOpacity: 0.05,
          weight: 1,
        }).addTo(groups.rings);

        const marker = L.marker([olt.lat, olt.lng], { icon: makeOltIcon(olt.status) }).addTo(groups.olts);
        marker.bindPopup(`
          <div style="min-width:240px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <strong style="font-size:13px">${olt.name}</strong>
              ${statusBadge(olt.status)}
            </div>
            <div style="color:#888;font-size:11px;margin-bottom:6px">${olt.model}</div>
            <div style="font-size:11px;line-height:1.6">
              <div>IP: <span style="font-family:monospace">${olt.ip}</span></div>
              <div>Аптайм: <span style="font-family:monospace">${olt.uptime}</span></div>
              <div>CPU: ${olt.cpu}% · RAM: ${olt.ram}% · ${olt.temperature}°C</div>
              <div>↓ ${olt.trafficIn} / ↑ ${olt.trafficOut} Мбит/с</div>
            </div>
            <div style="margin-top:6px"><a href="/devices/${olt.id}" style="color:#3b82f6;font-size:11px">Открыть карточку →</a></div>
          </div>
        `);
      });
    }

    if (layers.onus) {
      onus.forEach((onu) => {
        const marker = L.marker([onu.lat, onu.lng], { icon: makeOnuIcon(onu.status) }).addTo(groups.onus);
        marker.bindPopup(`
          <div style="min-width:220px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
              <strong style="font-family:monospace">${onu.id}</strong>
              ${statusBadge(onu.status)}
            </div>
            <div style="color:#888;font-size:11px;margin-bottom:4px">${onu.address}</div>
            <div style="font-size:11px;line-height:1.6">
              <div>PON: <span style="font-family:monospace">${onu.pon}/${onu.llid}</span></div>
              <div>Сигнал: ${signalBar(onu.rxPower)}</div>
              <div>↓ ${onu.trafficIn} / ↑ ${onu.trafficOut} Мбит/с</div>
            </div>
            <div style="margin-top:6px"><a href="/onu/${onu.id}" style="color:#3b82f6;font-size:11px">Открыть карточку →</a></div>
          </div>
        `);
      });
    }

    if (layers.routers) {
      routers.forEach((r) => {
        const marker = L.marker([r.lat, r.lng], { icon: makeRouterIcon(r.status) }).addTo(groups.routers);
        marker.bindPopup(`
          <div style="min-width:220px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
              <strong style="font-family:monospace">${r.id}</strong>
              ${statusBadge(r.status)}
            </div>
            <div style="font-weight:600;font-size:12px">${r.model}</div>
            <div style="color:#888;font-size:11px;margin-bottom:4px">${r.address}</div>
            <div style="font-size:11px;line-height:1.6">
              <div>IP: <span style="font-family:monospace">${r.ip}</span></div>
              <div>Wi-Fi клиентов: ${r.clientsConnected}</div>
              <div>CPU: ${r.cpu}% · RAM: ${r.ram}%</div>
              <div>↓ ${r.trafficIn} / ↑ ${r.trafficOut} Мбит/с</div>
            </div>
            <div style="margin-top:6px"><a href="/routers/${r.id}" style="color:#a855f7;font-size:11px">Открыть роутер →</a></div>
          </div>
        `);
      });
    }
  }, [layers, filter, selectedOlt]);

  // Render custom devices
  useEffect(() => {
    const cg = customGroupRef.current;
    if (!cg) return;
    cg.clearLayers();
    customDevices.forEach((d) => {
      const icon =
        d.device_type === "olt"
          ? makeOltIcon(d.status || "online")
          : d.device_type === "onu"
            ? makeOnuIcon(d.status || "online")
            : makeRouterIcon(d.status || "online");
      const marker = L.marker([d.lat, d.lng], { icon }).addTo(cg);
      const safeName = d.name.replace(/</g, "&lt;");
      const safeComment = (d.comment || "").replace(/</g, "&lt;");
      marker.bindPopup(`
        <div style="min-width:220px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <strong style="font-size:13px">${safeName}</strong>
            ${statusBadge(d.status || "online")}
          </div>
          <div style="color:#888;font-size:11px;margin-bottom:4px">Тип: ${d.device_type.toUpperCase()}</div>
          ${safeComment ? `<div style="font-size:11px;margin-bottom:6px">${safeComment}</div>` : ""}
          <div style="font-size:10px;color:#888;font-family:monospace">${d.lat.toFixed(5)}, ${d.lng.toFixed(5)}</div>
          <button data-delete-id="${d.id}" data-delete-name="${safeName}"
            style="margin-top:8px;width:100%;padding:6px;background:#ef4444;color:#fff;border:none;border-radius:4px;font-size:11px;cursor:pointer">
            Удалить с карты
          </button>
        </div>
      `);
    });
  }, [customDevices]);

  // Delegate delete button clicks
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      const btn = t.closest("[data-delete-id]") as HTMLElement | null;
      if (btn) {
        const id = parseInt(btn.dataset.deleteId || "0");
        const name = btn.dataset.deleteName || "";
        if (id) handleDelete(id, name);
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  // Pick coordinates by clicking on map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!pickMode) {
      map.getContainer().style.cursor = "";
      return;
    }
    map.getContainer().style.cursor = "crosshair";
    const handler = (e: L.LeafletMouseEvent) => {
      setForm((f) => ({ ...f, lat: e.latlng.lat.toFixed(6), lng: e.latlng.lng.toFixed(6) }));
      setPickMode(false);
      toast.success(`Координаты установлены: ${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`);
    };
    map.on("click", handler);
    return () => {
      map.off("click", handler);
      map.getContainer().style.cursor = "";
    };
  }, [pickMode]);

  // Resize on window/container changes
  useEffect(() => {
    const handler = () => mapRef.current?.invalidateSize();
    window.addEventListener("resize", handler);
    const interval = setInterval(handler, 2000);
    return () => {
      window.removeEventListener("resize", handler);
      clearInterval(interval);
    };
  }, []);

  const totalTraffic = ONUS.reduce((sum, o) => sum + o.trafficIn + o.trafficOut, 0);

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader
        title="Карта сети"
        description="Интерактивная карта оборудования, линий связи и трафика"
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => setShowAddDevice(true)}
              className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2 hover:bg-primary/90"
            >
              <Icon name="Plus" size={14} />
              Добавить устройство
            </button>
            <button className="h-9 px-3 rounded-md bg-secondary border border-border text-sm font-medium flex items-center gap-2 hover:bg-accent">
              <Icon name="Download" size={14} />
              Экспорт
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-3 space-y-3">
          <div className="bg-card border border-border rounded-lg p-4">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Стиль карты</h3>
            <div className="grid grid-cols-3 gap-1">
              {[
                { v: "dark" as const, l: "Тёмная" },
                { v: "light" as const, l: "Светлая" },
                { v: "sat" as const, l: "Спутник" },
              ].map((t) => (
                <button
                  key={t.v}
                  onClick={() => setTileStyle(t.v)}
                  className={`text-xs px-2 py-1.5 rounded border ${
                    tileStyle === t.v ? "bg-primary/15 border-primary text-primary" : "bg-secondary border-border hover:bg-accent"
                  }`}
                >
                  {t.l}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Слои карты</h3>
            <div className="space-y-2">
              {[
                { key: "olts" as const, label: "OLT-устройства", icon: "Server" },
                { key: "onus" as const, label: "Абонентские ONU", icon: "Router" },
                { key: "routers" as const, label: "Роутеры (CPE)", icon: "Wifi" },
                { key: "links" as const, label: "Линии связи (PON)", icon: "GitBranch" },
                { key: "traffic" as const, label: "Толщина = трафик", icon: "Activity" },
                { key: "problems" as const, label: "Только проблемные", icon: "AlertTriangle" },
              ].map((l) => (
                <label
                  key={l.key}
                  className="flex items-center gap-2 text-sm cursor-pointer hover:bg-secondary px-2 py-1.5 rounded"
                >
                  <input
                    type="checkbox"
                    checked={layers[l.key]}
                    onChange={(e) => setLayers({ ...layers, [l.key]: e.target.checked })}
                    className="accent-primary"
                  />
                  <Icon name={l.icon} size={14} className="text-muted-foreground" />
                  <span className="flex-1">{l.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Фильтр статуса</h3>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { v: "all" as const, label: "Все" },
                { v: "online" as const, label: "В сети" },
                { v: "warning" as const, label: "Внимание" },
                { v: "offline" as const, label: "Аварии" },
              ].map((f) => (
                <button
                  key={f.v}
                  onClick={() => setFilter(f.v)}
                  className={`text-xs px-2 py-1.5 rounded border ${
                    filter === f.v ? "bg-primary/15 border-primary text-primary" : "bg-secondary border-border hover:bg-accent"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Оборудование</h3>
            <div className="space-y-1.5">
              <button
                onClick={() => setSelectedOlt(null)}
                className={`w-full text-left text-xs px-2 py-1.5 rounded ${
                  !selectedOlt ? "bg-primary/15 text-primary" : "hover:bg-secondary"
                }`}
              >
                Все OLT ({OLTS.length})
              </button>
              {OLTS.map((olt) => (
                <button
                  key={olt.id}
                  onClick={() => setSelectedOlt(olt.id)}
                  className={`w-full text-left text-xs px-2 py-1.5 rounded flex items-center justify-between ${
                    selectedOlt === olt.id ? "bg-primary/15 text-primary" : "hover:bg-secondary"
                  }`}
                >
                  <span className="truncate">{olt.name}</span>
                  <span
                    className="status-dot shrink-0"
                    style={{
                      background:
                        olt.status === "online"
                          ? "hsl(142 76% 44%)"
                          : olt.status === "warning"
                            ? "hsl(38 92% 50%)"
                            : "hsl(0 72% 51%)",
                    }}
                  />
                </button>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Сводка</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">OLT</span>
                <span className="font-mono-data">{OLTS.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">ONU всего</span>
                <span className="font-mono-data">{ONUS.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Роутеров</span>
                <span className="font-mono-data">{ROUTERS.length}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-2 mt-2">
                <span className="text-muted-foreground">Общий трафик</span>
                <span className="font-mono-data text-primary">{totalTraffic.toFixed(0)} Мбит/с</span>
              </div>
            </div>
          </div>

          {customDevices.length > 0 && (
            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-3">
                Добавленные ({customDevices.length})
              </h3>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {customDevices.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between gap-2 text-xs px-2 py-1.5 rounded hover:bg-secondary group"
                  >
                    <button
                      onClick={() => mapRef.current?.flyTo([d.lat, d.lng], 16)}
                      className="flex items-center gap-1.5 truncate flex-1 text-left"
                    >
                      <Icon
                        name={d.device_type === "olt" ? "Server" : d.device_type === "onu" ? "Router" : "Wifi"}
                        size={12}
                        className="text-muted-foreground shrink-0"
                      />
                      <span className="truncate">{d.name}</span>
                    </button>
                    <button
                      onClick={() => handleDelete(d.id, d.name)}
                      className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100"
                      title="Удалить"
                    >
                      <Icon name="Trash2" size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-card border border-border rounded-lg p-4">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Легенда</h3>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-sm" style={{ background: "#22c55e" }} />
                <span>OLT</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ background: "#22c55e" }} />
                <span>ONU</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm" style={{ background: "#a855f7" }} />
                <span>Роутер CPE</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-6 h-0.5" style={{ background: "#22c55e" }} />
                <span>Хороший сигнал</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-6 h-0.5" style={{ background: "#f59e0b" }} />
                <span>Слабый сигнал</span>
              </div>
            </div>
          </div>
        </div>

        <div
          className="col-span-12 lg:col-span-9 bg-card border border-border rounded-lg overflow-hidden relative"
          style={{ height: "78vh", minHeight: 500 }}
        >
          <div ref={containerRef} style={{ width: "100%", height: "100%", background: "#0a0e14" }} />
        </div>
      </div>

      {pickMode && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[999] bg-primary text-primary-foreground px-4 py-2 rounded-md shadow-lg text-sm flex items-center gap-2">
          <Icon name="MousePointerClick" size={14} />
          Кликните на карту, чтобы выбрать точку
          <button onClick={() => setPickMode(false)} className="ml-2 underline text-xs">Отмена</button>
        </div>
      )}

      {showAddDevice && (
        <div
          className="fixed inset-0 bg-black/60 z-[1000] flex items-center justify-center p-4"
          onClick={() => setShowAddDevice(false)}
        >
          <div
            className="bg-card border border-border rounded-lg p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Добавить устройство на карту</h3>
              <button onClick={() => setShowAddDevice(false)} className="text-muted-foreground hover:text-foreground">
                <Icon name="X" size={18} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Тип устройства</label>
                <select
                  value={form.device_type}
                  onChange={(e) => setForm({ ...form, device_type: e.target.value as typeof form.device_type })}
                  className="w-full h-9 px-3 bg-secondary border border-border rounded"
                >
                  <option value="olt">OLT</option>
                  <option value="onu">ONU</option>
                  <option value="router">Роутер CPE</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Название</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full h-9 px-3 bg-secondary border border-border rounded"
                  placeholder="OLT-Запад-04"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Комментарий</label>
                <input
                  value={form.comment}
                  onChange={(e) => setForm({ ...form, comment: e.target.value })}
                  className="w-full h-9 px-3 bg-secondary border border-border rounded"
                  placeholder="Адрес, IP или примечание"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Широта</label>
                  <input
                    value={form.lat}
                    onChange={(e) => setForm({ ...form, lat: e.target.value })}
                    className="w-full h-9 px-3 bg-secondary border border-border rounded font-mono-data"
                    placeholder="55.7558"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Долгота</label>
                  <input
                    value={form.lng}
                    onChange={(e) => setForm({ ...form, lng: e.target.value })}
                    className="w-full h-9 px-3 bg-secondary border border-border rounded font-mono-data"
                    placeholder="37.6173"
                  />
                </div>
              </div>
              <button
                onClick={() => {
                  setShowAddDevice(false);
                  setPickMode(true);
                }}
                className="w-full h-9 bg-secondary border border-border rounded text-sm flex items-center justify-center gap-2 hover:bg-accent"
              >
                <Icon name="MapPin" size={14} />
                Выбрать точку на карте
              </button>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleAdd}
                  disabled={saving}
                  className="flex-1 h-9 bg-primary text-primary-foreground rounded font-medium text-sm disabled:opacity-50"
                >
                  {saving ? "Сохранение..." : "Добавить"}
                </button>
                <button
                  onClick={() => setShowAddDevice(false)}
                  className="h-9 px-4 bg-secondary border border-border rounded text-sm"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}