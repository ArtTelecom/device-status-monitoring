import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import Icon from "@/components/ui/icon";
import StatusBadge from "@/components/common/StatusBadge";
import KpiCard from "@/components/common/KpiCard";
import PageHeader from "@/components/common/PageHeader";
import { ROUTERS, OLTS } from "@/lib/mock-data";

const VENDOR_COLORS: Record<string, string> = {
  MikroTik: "#293239",
  Keenetic: "#0066b3",
  "TP-Link": "#4acbd6",
  Huawei: "#c7000b",
  Asus: "#262626",
  "D-Link": "#0066a1",
};

export default function RouterList() {
  const [search, setSearch] = useState("");
  const [vendor, setVendor] = useState("all");
  const [status, setStatus] = useState("all");
  const [protocol, setProtocol] = useState("all");
  const [page, setPage] = useState(1);
  const perPage = 25;

  const filtered = useMemo(() => {
    return ROUTERS.filter((r) => {
      if (vendor !== "all" && r.vendor !== vendor) return false;
      if (status !== "all" && r.status !== status) return false;
      if (protocol !== "all" && r.protocol !== protocol) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !r.id.toLowerCase().includes(q) &&
          !r.mac.toLowerCase().includes(q) &&
          !r.ip.toLowerCase().includes(q) &&
          !r.model.toLowerCase().includes(q) &&
          !(r.pppUser ?? "").toLowerCase().includes(q) &&
          !r.address.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [search, vendor, status, protocol]);

  const paged = filtered.slice((page - 1) * perPage, page * perPage);
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));

  const stats = {
    total: ROUTERS.length,
    online: ROUTERS.filter((r) => r.status === "online").length,
    warning: ROUTERS.filter((r) => r.status === "warning").length,
    offline: ROUTERS.filter((r) => r.status === "offline").length,
    clients: ROUTERS.reduce((s, r) => s + r.clientsConnected, 0),
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader
        title="Роутеры абонентов"
        description={`Мониторинг CPE-оборудования: ${ROUTERS.length} устройств`}
        actions={
          <div className="flex gap-2">
            <button className="h-9 px-3 rounded-md bg-secondary border border-border text-sm flex items-center gap-2">
              <Icon name="Download" size={14} />Excel
            </button>
            <button className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2">
              <Icon name="RefreshCw" size={14} />Опросить
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard label="Всего роутеров" value={stats.total} icon="Wifi" color="hsl(210 100% 56%)" sub="Под мониторингом" />
        <KpiCard label="В сети" value={stats.online} icon="CheckCircle2" color="hsl(142 76% 44%)" sub={`${Math.round((stats.online / stats.total) * 100)}%`} />
        <KpiCard label="Внимание" value={stats.warning} icon="AlertTriangle" color="hsl(38 92% 50%)" sub="Высокая нагрузка" />
        <KpiCard label="Офлайн" value={stats.offline} icon="XCircle" color="hsl(0 72% 51%)" sub="Нет связи" />
        <KpiCard label="Клиентов Wi-Fi" value={stats.clients} icon="Users" color="hsl(280 70% 60%)" sub="Подключено" />
      </div>

      <div className="bg-card border border-border rounded-lg p-3 flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[200px] relative">
          <Icon name="Search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск: ID, MAC, IP, модель, PPP-логин, адрес..."
            className="w-full h-9 pl-9 pr-3 bg-secondary border border-border rounded text-sm"
          />
        </div>
        <select value={vendor} onChange={(e) => setVendor(e.target.value)} className="h-9 px-2 bg-secondary border border-border rounded text-sm">
          <option value="all">Все производители</option>
          <option>MikroTik</option>
          <option>Keenetic</option>
          <option>TP-Link</option>
          <option>Huawei</option>
          <option>Asus</option>
          <option>D-Link</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 px-2 bg-secondary border border-border rounded text-sm">
          <option value="all">Все статусы</option>
          <option value="online">В сети</option>
          <option value="warning">Внимание</option>
          <option value="offline">Офлайн</option>
        </select>
        <select value={protocol} onChange={(e) => setProtocol(e.target.value)} className="h-9 px-2 bg-secondary border border-border rounded text-sm">
          <option value="all">Все протоколы</option>
          <option>SNMP</option>
          <option>TR-069</option>
          <option>API</option>
          <option>SSH</option>
        </select>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-secondary/40 text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2.5">ID</th>
                <th className="text-left px-3 py-2.5">Производитель / модель</th>
                <th className="text-left px-3 py-2.5">IP / MAC</th>
                <th className="text-left px-3 py-2.5">PPP-логин</th>
                <th className="text-left px-3 py-2.5">Статус</th>
                <th className="text-left px-3 py-2.5">CPU/RAM</th>
                <th className="text-left px-3 py-2.5">Клиенты</th>
                <th className="text-left px-3 py-2.5">Трафик</th>
                <th className="text-left px-3 py-2.5">Прот.</th>
                <th className="text-left px-3 py-2.5">Связан с ONU</th>
                <th className="text-left px-3 py-2.5">Действия</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-secondary/30">
                  <td className="px-3 py-2">
                    <Link to={`/routers/${r.id}`} className="font-mono-data text-primary hover:underline">{r.id}</Link>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-1.5 h-5 rounded-sm"
                        style={{ background: VENDOR_COLORS[r.vendor] ?? "#888" }}
                      />
                      <div>
                        <div className="font-medium">{r.vendor}</div>
                        <div className="text-[10px] text-muted-foreground">{r.model.replace(`${r.vendor} `, "")}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono-data">
                    <div>{r.ip}</div>
                    <div className="text-muted-foreground text-[10px]">{r.mac}</div>
                  </td>
                  <td className="px-3 py-2 font-mono-data text-[11px]">{r.pppUser ?? "—"}</td>
                  <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                  <td className="px-3 py-2 font-mono-data">
                    {r.status === "offline" ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <>
                        <span style={{ color: r.cpu > 70 ? "hsl(0 72% 60%)" : r.cpu > 50 ? "hsl(38 92% 55%)" : "inherit" }}>
                          {r.cpu}%
                        </span>{" "}
                        <span className="text-muted-foreground">/</span>{" "}
                        <span style={{ color: r.ram > 75 ? "hsl(0 72% 60%)" : r.ram > 60 ? "hsl(38 92% 55%)" : "inherit" }}>
                          {r.ram}%
                        </span>
                      </>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5 font-mono-data">
                      <Icon name="Wifi" size={11} className="text-muted-foreground" />
                      {r.clientsConnected}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      2.4: {r.wifi24Clients} · 5: {r.wifi5Clients} · LAN: {r.ethClients}
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono-data text-[11px]">
                    <div>↓ {r.trafficIn} Мбит</div>
                    <div className="text-muted-foreground">↑ {r.trafficOut} Мбит</div>
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary">{r.protocol}</span>
                  </td>
                  <td className="px-3 py-2 font-mono-data text-[11px]">
                    {r.onuId ? (
                      <Link to={`/onu/${r.onuId}`} className="text-primary hover:underline">{r.onuId}</Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <button title="Подробнее" className="w-7 h-7 rounded hover:bg-secondary text-muted-foreground"><Icon name="Eye" size={12} /></button>
                      <button title="Перезагрузить" className="w-7 h-7 rounded hover:bg-secondary text-muted-foreground"><Icon name="RotateCw" size={12} /></button>
                      <button title="Web-интерфейс" className="w-7 h-7 rounded hover:bg-secondary text-muted-foreground"><Icon name="ExternalLink" size={12} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-border flex items-center justify-between text-xs">
          <div className="text-muted-foreground">
            Показано {filtered.length === 0 ? 0 : (page - 1) * perPage + 1}–{Math.min(page * perPage, filtered.length)} из {filtered.length}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="h-7 w-7 rounded border border-border disabled:opacity-30 hover:bg-secondary flex items-center justify-center"
            >
              <Icon name="ChevronLeft" size={14} />
            </button>
            <span className="px-3 font-mono-data">{page} / {totalPages}</span>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="h-7 w-7 rounded border border-border disabled:opacity-30 hover:bg-secondary flex items-center justify-center"
            >
              <Icon name="ChevronRight" size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
