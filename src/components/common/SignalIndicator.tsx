interface Props {
  value: number | null;
  size?: "sm" | "md";
}

export default function SignalIndicator({ value, size = "sm" }: Props) {
  if (value === null || value === undefined) {
    return <span className="font-mono-data text-muted-foreground text-xs">—</span>;
  }
  const pct = Math.max(0, Math.min(100, ((value + 35) / 25) * 100));
  const color =
    value > -25 ? "hsl(142 76% 44%)" : value > -28 ? "hsl(38 92% 50%)" : "hsl(0 72% 51%)";
  const w = size === "md" ? 80 : 60;
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono-data text-xs shrink-0" style={{ color, minWidth: 56 }}>
        {value.toFixed(1)} дБм
      </span>
      <div
        className="h-1.5 bg-secondary rounded-full overflow-hidden shrink-0"
        style={{ width: w }}
      >
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}
