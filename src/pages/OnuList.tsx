import { useState, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Icon from "@/components/ui/icon";
import StatusBadge from "@/components/common/StatusBadge";
import SignalIndicator from "@/components/common/SignalIndicator";
import PageHeader from "@/components/common/PageHeader";
import { ONUS, OLTS } from "@/lib/mock-data";

export default function OnuList() {
  const [params] = useSearchParams();
  const [search, setSearch] = useState("");
  const [oltFilter, setOltFilter] = useState(params.get("olt") || "all");
  const [ponFilter, setPonFilter] = useState(params.get("pon") || "all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [signalFilter, setSignalFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const perPage = 25;

  const filtered = useMemo(() => {
    return ONUS.filter((o) => {
      if (oltFilter !== "all" && o.oltId !== oltFilter) return false;
      if (ponFilter !== "all" && o.pon !== Number(ponFilter)) return false;
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (signalFilter === "good" && (o.rxPower === null || o.rxPower < -25)) return false;
      if (signalFilter === "warn" && (o.rxPower === null || o.rxPower > -25 || o.rxPower < -28)) return false;
      if (signalFilter === "bad" && (o.rxPower === null || o.rxPower > -28)) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !o.id.toLowerCase().includes(q) &&
          !o.mac.toLowerCase().includes(q) &&
          !o.sn.toLowerCase().includes(q) &&
          !o.name.toLowerCase().includes(q) &&
          !o.address.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [search, oltFilter, ponFilter, statusFilter, signalFilter]);

  const paged = filtered.slice((page - 1) * perPage, page * perPage);
  const totalPages = Math.ceil(filtered.length / perPage);

  const toggleAll = () => {
    if (selected.size === paged.length) setSelected(new Set());
    else setSelected(new Set(paged.map((o) => o.id)));
  };

  const toggle = (id: string) => {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setSelected(s);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader
        title="ONU / Абоненты"
        description={`Всего ${ONUS.length} устройств · показано ${filtered.length}`}
        actions={
          <div className="flex gap-2">
            <button className="h-9 px-3 rounded-md bg-secondary border border-border text-sm flex items-center gap-2">
              <Icon name="Download" size={14} />Excel
            </button>
            <button className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2">
              <Icon name="RefreshCw" size={14} />Обновить
            </button>
          </div>
        }
      />

      <div className="bg-card border border-border rounded-lg p-3 flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[200px] relative">
          <Icon name="Search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск: ID, MAC, SN, имя, адрес..."
            className="w-full h-9 pl-9 pr-3 bg-secondary border border-border rounded text-sm"
          />
        </div>
        <select value={oltFilter} onChange={(e) => setOltFilter(e.target.value)} className="h-9 px-2 bg-secondary border border-border rounded text-sm">
          <option value="all">Все OLT</option>
          {OLTS.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
        <select value={ponFilter} onChange={(e) => setPonFilter(e.target.value)} className="h-9 px-2 bg-secondary border border-border rounded text-sm">
          <option value="all">Все PON</option>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map((p) => (
            <option key={p} value={p}>PON {p}</option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-9 px-2 bg-secondary border border-border rounded text-sm">
          <option value="all">Все статусы</option>
          <option value="online">В сети</option>
          <option value="warning">Внимание</option>
          <option value="offline">Офлайн</option>
          <option value="los">LOS</option>
        </select>
        <select value={signalFilter} onChange={(e) => setSignalFilter(e.target.value)} className="h-9 px-2 bg-secondary border border-border rounded text-sm">
          <option value="all">Любой сигнал</option>
          <option value="good">Норма (&gt; -25)</option>
          <option value="warn">Слабый (-25..-28)</option>
          <option value="bad">Критичный (&lt; -28)</option>
        </select>
      </div>

      {selected.size > 0 && (
        <div className="bg-primary/10 border border-primary/30 rounded-lg p-3 flex items-center gap-3">
          <span className="text-sm font-medium">Выбрано: {selected.size}</span>
          <div className="flex gap-2 ml-auto">
            <button className="h-8 px-3 bg-secondary border border-border rounded text-xs flex items-center gap-1">
              <Icon name="RotateCw" size={12} />Перезагрузить
            </button>
            <button className="h-8 px-3 bg-secondary border border-border rounded text-xs flex items-center gap-1">
              <Icon name="Tag" size={12} />Назначить профиль
            </button>
            <button className="h-8 px-3 bg-destructive/15 text-destructive border border-destructive/30 rounded text-xs flex items-center gap-1">
              <Icon name="Trash2" size={12} />Дерегистрация
            </button>
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-secondary/40 text-muted-foreground">
              <tr>
                <th className="w-8 px-3 py-2.5">
                  <input type="checkbox" onChange={toggleAll} checked={paged.length > 0 && selected.size === paged.length} className="accent-primary" />
                </th>
                <th className="text-left px-3 py-2.5">ID</th>
                <th className="text-left px-3 py-2.5">OLT / PON</th>
                <th className="text-left px-3 py-2.5">MAC</th>
                <th className="text-left px-3 py-2.5">Серийник</th>
                <th className="text-left px-3 py-2.5">Абонент / адрес</th>
                <th className="text-left px-3 py-2.5">Статус</th>
                <th className="text-left px-3 py-2.5">Rx сигнал</th>
                <th className="text-left px-3 py-2.5">Расст.</th>
                <th className="text-left px-3 py-2.5">Аптайм</th>
                <th className="text-left px-3 py-2.5">Действия</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((o) => (
                <tr key={o.id} className="border-t border-border hover:bg-secondary/30">
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} className="accent-primary" />
                  </td>
                  <td className="px-3 py-2">
                    <Link to={`/onu/${o.id}`} className="font-mono-data text-primary hover:underline">{o.id}</Link>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {OLTS.find((x) => x.id === o.oltId)?.name.replace("OLT-", "")}/<span className="font-mono-data">P{o.pon}/L{o.llid}</span>
                  </td>
                  <td className="px-3 py-2 font-mono-data">{o.mac}</td>
                  <td className="px-3 py-2 font-mono-data">{o.sn}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{o.name}</div>
                    <div className="text-muted-foreground text-[10px]">{o.address}</div>
                  </td>
                  <td className="px-3 py-2"><StatusBadge status={o.status} /></td>
                  <td className="px-3 py-2"><SignalIndicator value={o.rxPower} /></td>
                  <td className="px-3 py-2 font-mono-data">{o.distance} км</td>
                  <td className="px-3 py-2 font-mono-data text-muted-foreground">{o.uptime}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <button title="Подробнее" className="w-7 h-7 rounded hover:bg-secondary text-muted-foreground"><Icon name="Eye" size={12} /></button>
                      <button title="Перезагрузить" className="w-7 h-7 rounded hover:bg-secondary text-muted-foreground"><Icon name="RotateCw" size={12} /></button>
                      <button title="Терминал" className="w-7 h-7 rounded hover:bg-secondary text-muted-foreground"><Icon name="Terminal" size={12} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-border flex items-center justify-between text-xs">
          <div className="text-muted-foreground">
            Показано {(page - 1) * perPage + 1}–{Math.min(page * perPage, filtered.length)} из {filtered.length}
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
