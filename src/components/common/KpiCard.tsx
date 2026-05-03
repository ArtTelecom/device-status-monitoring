import Icon from "@/components/ui/icon";

interface Props {
  label: string;
  value: string | number;
  icon: string;
  color: string;
  sub?: string;
  trend?: { value: number; label: string };
}

export default function KpiCard({ label, value, icon, color, sub, trend }: Props) {
  return (
    <div className="card-hover bg-card border border-border rounded-lg p-4">
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
        <div
          className="w-8 h-8 rounded-md flex items-center justify-center"
          style={{ background: `${color}1f`, color }}
        >
          <Icon name={icon} size={16} />
        </div>
      </div>
      <div className="font-mono-data text-2xl font-semibold mb-1">{value}</div>
      <div className="flex items-center justify-between">
        {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
        {trend && (
          <span
            className="text-xs font-medium flex items-center gap-1"
            style={{ color: trend.value >= 0 ? "hsl(142 76% 50%)" : "hsl(0 72% 60%)" }}
          >
            <Icon name={trend.value >= 0 ? "TrendingUp" : "TrendingDown"} size={12} />
            {trend.label}
          </span>
        )}
      </div>
    </div>
  );
}
