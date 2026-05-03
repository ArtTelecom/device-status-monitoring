interface Props {
  status: string;
  label?: string;
}

const MAP: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  online: { label: "В сети", color: "hsl(142 76% 50%)", bg: "hsl(142 76% 44% / 0.12)", dot: "status-online" },
  offline: { label: "Офлайн", color: "hsl(0 72% 60%)", bg: "hsl(0 72% 51% / 0.12)", dot: "status-offline" },
  warning: { label: "Внимание", color: "hsl(38 92% 55%)", bg: "hsl(38 92% 50% / 0.12)", dot: "status-warning" },
  los: { label: "LOS", color: "hsl(0 72% 60%)", bg: "hsl(0 72% 51% / 0.18)", dot: "status-offline" },
  active: { label: "Активен", color: "hsl(142 76% 50%)", bg: "hsl(142 76% 44% / 0.12)", dot: "status-online" },
  blocked: { label: "Заблокирован", color: "hsl(0 72% 60%)", bg: "hsl(0 72% 51% / 0.12)", dot: "status-offline" },
};

export default function StatusBadge({ status, label }: Props) {
  const s = MAP[status] ?? { label: status, color: "gray", bg: "transparent", dot: "status-unknown" };
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium"
      style={{ background: s.bg, color: s.color }}
    >
      <span className={`status-dot ${s.dot}`} />
      {label ?? s.label}
    </span>
  );
}
