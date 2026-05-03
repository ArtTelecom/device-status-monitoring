import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, RadialBarChart, RadialBar } from "recharts";
import Icon from "@/components/ui/icon";
import PageHeader from "@/components/common/PageHeader";
import { ONUS, OLTS } from "@/lib/mock-data";

const SIGNAL_BUCKETS = (() => {
  const buckets = [
    { range: "> -20", min: -20, max: 0, count: 0, color: "hsl(142 76% 44%)" },
    { range: "-22 .. -20", min: -22, max: -20, count: 0, color: "hsl(142 76% 50%)" },
    { range: "-25 .. -22", min: -25, max: -22, count: 0, color: "hsl(142 60% 55%)" },
    { range: "-28 .. -25", min: -28, max: -25, count: 0, color: "hsl(38 92% 55%)" },
    { range: "< -28", min: -100, max: -28, count: 0, color: "hsl(0 72% 60%)" },
  ];
  ONUS.forEach((o) => {
    if (o.rxPower === null) return;
    const b = buckets.find((b) => o.rxPower! >= b.min && o.rxPower! < b.max);
    if (b) b.count++;
  });
  return buckets;
})();

const PON_LOAD = OLTS.flatMap((olt) =>
  Array.from({ length: olt.ponPorts }).map((_, i) => ({
    name: `${olt.name.replace("OLT-", "")} P${i + 1}`,
    onu: ONUS.filter((o) => o.oltId === olt.id && o.pon === i + 1).length,
  }))
).slice(0, 16);

const VENDOR_DIST = (() => {
  const map: Record<string, number> = {};
  ONUS.forEach((o) => {
    const v = o.model.split(" ")[0];
    map[v] = (map[v] || 0) + 1;
  });
  return Object.entries(map).map(([name, value]) => ({ name, value }));
})();

const COLORS = ["hsl(210 100% 56%)", "hsl(280 70% 60%)", "hsl(38 92% 50%)", "hsl(142 76% 44%)", "hsl(330 70% 55%)"];

export default function Analytics() {
  const flapping = [...ONUS].filter((o) => o.status === "warning").slice(0, 5);

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader
        title="Аналитика и отчёты"
        description="Статистика и тренды по сети"
        actions={
          <div className="flex gap-2">
            <select className="h-9 px-3 bg-secondary border border-border rounded text-sm">
              <option>Сегодня</option><option>Неделя</option><option>Месяц</option>
            </select>
            <button className="h-9 px-3 rounded-md bg-secondary border border-border text-sm flex items-center gap-2"><Icon name="Download" size={14} />PDF</button>
            <button className="h-9 px-3 rounded-md bg-secondary border border-border text-sm flex items-center gap-2"><Icon name="FileSpreadsheet" size={14} />Excel</button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-sm font-semibold mb-3">Распределение сигналов Rx</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={SIGNAL_BUCKETS}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 12% 18%)" />
              <XAxis dataKey="range" stroke="hsl(215 14% 50%)" fontSize={11} />
              <YAxis stroke="hsl(215 14% 50%)" fontSize={11} />
              <Tooltip contentStyle={{ background: "hsl(220 14% 11%)", border: "1px solid hsl(220 12% 18%)" }} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {SIGNAL_BUCKETS.map((b, i) => <Cell key={i} fill={b.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-sm font-semibold mb-3">Производители ONU</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={VENDOR_DIST} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={(e) => `${e.name}: ${e.value}`}>
                {VENDOR_DIST.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "hsl(220 14% 11%)", border: "1px solid hsl(220 12% 18%)" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-5">
        <h3 className="text-sm font-semibold mb-3">Загрузка PON-портов</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={PON_LOAD}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 12% 18%)" />
            <XAxis dataKey="name" stroke="hsl(215 14% 50%)" fontSize={10} angle={-45} textAnchor="end" height={70} />
            <YAxis stroke="hsl(215 14% 50%)" fontSize={11} />
            <Tooltip contentStyle={{ background: "hsl(220 14% 11%)", border: "1px solid hsl(220 12% 18%)" }} />
            <Bar dataKey="onu" fill="hsl(210 100% 56%)" radius={[4, 4, 0, 0]} name="ONU подключено" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-sm font-semibold mb-3">Топ нестабильных ONU</h3>
          <div className="space-y-2">
            {flapping.map((o, i) => (
              <div key={o.id} className="flex items-center gap-3 p-2 rounded hover:bg-secondary">
                <span className="w-6 h-6 rounded-full bg-destructive/20 text-destructive text-xs flex items-center justify-center font-mono-data">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-mono-data text-sm">{o.id}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{o.address}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono-data text-xs">{o.rxPower} дБм</div>
                  <div className="text-[10px] text-muted-foreground">7 событий за сутки</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-sm font-semibold mb-3">SLA-показатели</h3>
          <div className="space-y-3">
            {[
              { label: "Доступность сети", value: 99.87, target: 99.5 },
              { label: "Среднее время реакции", value: 94, unit: "%", target: 90, sub: "На алерты < 5 мин" },
              { label: "ONU с хорошим сигналом", value: 78, unit: "%", target: 80 },
              { label: "Аптайм OLT", value: 99.99, target: 99.9 },
            ].map((s) => (
              <div key={s.label}>
                <div className="flex justify-between text-sm mb-1">
                  <span>{s.label}</span>
                  <span className="font-mono-data" style={{ color: s.value >= s.target ? "hsl(142 76% 50%)" : "hsl(38 92% 55%)" }}>
                    {s.value}{s.unit ?? "%"}
                  </span>
                </div>
                <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, s.value)}%`, background: s.value >= s.target ? "hsl(142 76% 50%)" : "hsl(38 92% 55%)" }} />
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">SLA: {s.target}{s.unit ?? "%"} {s.sub && `· ${s.sub}`}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
