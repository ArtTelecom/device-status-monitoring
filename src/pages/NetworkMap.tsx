import { useState, useMemo, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, useMap } from "react-leaflet";
import { makeOltIcon, makeOnuIcon, makeRouterIcon } from "@/components/map/leaflet-setup";
import Icon from "@/components/ui/icon";
import StatusBadge from "@/components/common/StatusBadge";
import SignalIndicator from "@/components/common/SignalIndicator";
import PageHeader from "@/components/common/PageHeader";
import { OLTS, ONUS, ROUTERS } from "@/lib/mock-data";

type LayerToggle = {
  olts: boolean;
  onus: boolean;
  routers: boolean;
  links: boolean;
  traffic: boolean;
  problems: boolean;
};

function MapResizer() {
  const map = useMap();
  useEffect(() => {
    const t1 = setTimeout(() => map.invalidateSize(), 100);
    const t2 = setTimeout(() => map.invalidateSize(), 400);
    const t3 = setTimeout(() => map.invalidateSize(), 1000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [map]);
  return null;
}

export default function NetworkMap() {
  const [mounted, setMounted] = useState(false);
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

  useEffect(() => {
    setMounted(true);
  }, []);

  const filteredOnus = useMemo(() => {
    let arr = ONUS;
    if (selectedOlt) arr = arr.filter((o) => o.oltId === selectedOlt);
    if (filter === "online") arr = arr.filter((o) => o.status === "online");
    else if (filter === "warning") arr = arr.filter((o) => o.status === "warning");
    else if (filter === "offline") arr = arr.filter((o) => o.status === "offline" || o.status === "los");
    if (layers.problems) arr = arr.filter((o) => o.status !== "online");
    return arr;
  }, [filter, selectedOlt, layers.problems]);

  const filteredRouters = useMemo(() => {
    let arr = ROUTERS;
    if (selectedOlt) arr = arr.filter((r) => r.oltId === selectedOlt);
    if (filter === "online") arr = arr.filter((r) => r.status === "online");
    else if (filter === "warning") arr = arr.filter((r) => r.status === "warning");
    else if (filter === "offline") arr = arr.filter((r) => r.status === "offline");
    if (layers.problems) arr = arr.filter((r) => r.status !== "online");
    return arr;
  }, [filter, selectedOlt, layers.problems]);

  const center: [number, number] = [55.7558, 37.6173];

  const linkColor = (rx: number | null) => {
    if (rx === null) return "#ef4444";
    if (rx > -25) return "#22c55e";
    if (rx > -28) return "#f59e0b";
    return "#ef4444";
  };

  const totalTraffic = ONUS.reduce((sum, o) => sum + o.trafficIn + o.trafficOut, 0);
  const tileUrl =
    tileStyle === "dark"
      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      : tileStyle === "light"
        ? "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

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
                <label key={l.key} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-secondary px-2 py-1.5 rounded">
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
                className={`w-full text-left text-xs px-2 py-1.5 rounded ${!selectedOlt ? "bg-primary/15 text-primary" : "hover:bg-secondary"}`}
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
                        olt.status === "online" ? "hsl(142 76% 44%)" : olt.status === "warning" ? "hsl(38 92% 50%)" : "hsl(0 72% 51%)",
                    }}
                  />
                </button>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Сводка</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">OLT</span><span className="font-mono-data">{OLTS.length}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">ONU</span><span className="font-mono-data">{filteredOnus.length}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Роутеров</span><span className="font-mono-data">{filteredRouters.length}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Линий связи</span><span className="font-mono-data">{filteredOnus.length}</span></div>
              <div className="flex justify-between border-t border-border pt-2 mt-2">
                <span className="text-muted-foreground">Общий трафик</span>
                <span className="font-mono-data text-primary">{totalTraffic.toFixed(0)} Мбит/с</span>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Легенда</h3>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2"><span className="w-4 h-4 rounded-sm" style={{ background: "#22c55e" }} /><span>OLT</span></div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{ background: "#22c55e" }} /><span>ONU</span></div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm" style={{ background: "#a855f7" }} /><span>Роутер CPE</span></div>
              <div className="flex items-center gap-2"><span className="w-6 h-0.5" style={{ background: "#22c55e" }} /><span>Хороший сигнал</span></div>
              <div className="flex items-center gap-2"><span className="w-6 h-0.5" style={{ background: "#f59e0b" }} /><span>Слабый сигнал</span></div>
            </div>
          </div>
        </div>

        <div
          className="col-span-12 lg:col-span-9 bg-card border border-border rounded-lg overflow-hidden relative"
          style={{ height: "78vh", minHeight: 500 }}
        >
          {!mounted ? (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
              <Icon name="Loader" size={20} className="animate-spin mr-2" />
              Загрузка карты...
            </div>
          ) : (
            <MapContainer
              center={center}
              zoom={11}
              style={{ height: "100%", width: "100%", background: "#0a0e14" }}
              scrollWheelZoom={true}
            >
              <MapResizer />
              <TileLayer
                key={tileStyle}
                url={tileUrl}
                attribution="&copy; OpenStreetMap, &copy; CartoDB"
                maxZoom={19}
              />

              {layers.links &&
                filteredOnus.map((onu) => {
                  const olt = OLTS.find((o) => o.id === onu.oltId);
                  if (!olt) return null;
                  const weight = layers.traffic
                    ? Math.max(0.5, Math.min(4, (onu.trafficIn + onu.trafficOut) / 60))
                    : 1;
                  return (
                    <Polyline
                      key={`link-${onu.id}`}
                      positions={[
                        [olt.lat, olt.lng],
                        [onu.lat, onu.lng],
                      ]}
                      pathOptions={{
                        color: linkColor(onu.rxPower),
                        weight,
                        opacity: 0.55,
                        dashArray: onu.status === "offline" || onu.status === "los" ? "4,6" : undefined,
                      }}
                    />
                  );
                })}

              {layers.olts &&
                OLTS.map((olt) => (
                  <CircleMarker
                    key={`ring-${olt.id}`}
                    center={[olt.lat, olt.lng]}
                    radius={28}
                    pathOptions={{
                      color: olt.status === "online" ? "#22c55e" : olt.status === "warning" ? "#f59e0b" : "#ef4444",
                      fillOpacity: 0.05,
                      weight: 1,
                    }}
                  />
                ))}

              {layers.olts &&
                OLTS.map((olt) => (
                  <Marker key={olt.id} position={[olt.lat, olt.lng]} icon={makeOltIcon(olt.status)}>
                    <Popup>
                      <div style={{ minWidth: 240 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <strong>{olt.name}</strong>
                          <StatusBadge status={olt.status} />
                        </div>
                        <div style={{ color: "#888", fontSize: 11 }}>{olt.model}</div>
                        <div style={{ marginTop: 8, fontSize: 11 }}>
                          <div>IP: <span className="font-mono-data">{olt.ip}</span></div>
                          <div>CPU: {olt.cpu}% · RAM: {olt.ram}%</div>
                          <div>Аптайм: {olt.uptime}</div>
                        </div>
                        <a href={`/devices/${olt.id}`} style={{ color: "#3b82f6", fontSize: 11 }}>Открыть карточку →</a>
                      </div>
                    </Popup>
                  </Marker>
                ))}

              {layers.onus &&
                filteredOnus.map((onu) => (
                  <Marker key={onu.id} position={[onu.lat, onu.lng]} icon={makeOnuIcon(onu.status)}>
                    <Popup>
                      <div style={{ minWidth: 220 }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <strong className="font-mono-data">{onu.id}</strong>
                          <StatusBadge status={onu.status} />
                        </div>
                        <div style={{ color: "#888", fontSize: 11 }}>{onu.address}</div>
                        <div style={{ marginTop: 6, fontSize: 11 }}>
                          PON: <span className="font-mono-data">{onu.pon}/{onu.llid}</span>
                        </div>
                        <div style={{ marginTop: 4 }}><SignalIndicator value={onu.rxPower} /></div>
                        <a href={`/onu/${onu.id}`} style={{ color: "#3b82f6", fontSize: 11 }}>Открыть →</a>
                      </div>
                    </Popup>
                  </Marker>
                ))}

              {layers.routers &&
                filteredRouters.map((router) => (
                  <Marker key={router.id} position={[router.lat, router.lng]} icon={makeRouterIcon(router.status)}>
                    <Popup>
                      <div style={{ minWidth: 220 }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <strong className="font-mono-data">{router.id}</strong>
                          <StatusBadge status={router.status} />
                        </div>
                        <div style={{ fontWeight: 600, marginTop: 4 }}>{router.model}</div>
                        <div style={{ color: "#888", fontSize: 11 }}>{router.address}</div>
                        <div style={{ marginTop: 6, fontSize: 11 }}>
                          <div>IP: <span className="font-mono-data">{router.ip}</span></div>
                          <div>Wi-Fi клиентов: {router.clientsConnected}</div>
                          <div>CPU: {router.cpu}% · RAM: {router.ram}%</div>
                          <div>↓{router.trafficIn} / ↑{router.trafficOut} Мбит/с</div>
                        </div>
                        <a href={`/routers/${router.id}`} style={{ color: "#a855f7", fontSize: 11 }}>Открыть роутер →</a>
                      </div>
                    </Popup>
                  </Marker>
                ))}
            </MapContainer>
          )}
        </div>
      </div>

      {showAddDevice && (
        <div className="fixed inset-0 bg-black/60 z-[1000] flex items-center justify-center p-4" onClick={() => setShowAddDevice(false)}>
          <div className="bg-card border border-border rounded-lg p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Добавить устройство на карту</h3>
              <button onClick={() => setShowAddDevice(false)} className="text-muted-foreground hover:text-foreground">
                <Icon name="X" size={18} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Тип устройства</label>
                <select className="w-full h-9 px-3 bg-secondary border border-border rounded">
                  <option>OLT</option>
                  <option>ONU</option>
                  <option>Роутер CPE</option>
                  <option>Сплиттер</option>
                  <option>Муфта</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Название</label>
                <input className="w-full h-9 px-3 bg-secondary border border-border rounded" placeholder="OLT-Запад-04" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">IP-адрес</label>
                <input className="w-full h-9 px-3 bg-secondary border border-border rounded font-mono-data" placeholder="192.168.10.40" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Широта</label>
                  <input className="w-full h-9 px-3 bg-secondary border border-border rounded font-mono-data" placeholder="55.7558" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Долгота</label>
                  <input className="w-full h-9 px-3 bg-secondary border border-border rounded font-mono-data" placeholder="37.6173" />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button className="flex-1 h-9 bg-primary text-primary-foreground rounded font-medium text-sm">Добавить</button>
                <button onClick={() => setShowAddDevice(false)} className="h-9 px-4 bg-secondary border border-border rounded text-sm">Отмена</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
