import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";
import { PortSettings, PORT_ROLES, updatePort } from "@/lib/mikrotik-stats";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  port: PortSettings | null;
  portName: string;
  defaultComment?: string;
}

export default function PortSettingsModal({ open, onClose, onSaved, port, portName, defaultComment }: Props) {
  const [customName, setCustomName] = useState("");
  const [role, setRole] = useState("lan");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("");
  const [isUplink, setIsUplink] = useState(false);
  const [isDownlink, setIsDownlink] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setCustomName(port?.custom_name ?? "");
      setRole(port?.role ?? "lan");
      setDescription(port?.description ?? defaultComment ?? "");
      setColor(port?.color ?? "");
      setIsUplink(port?.is_uplink ?? false);
      setIsDownlink(port?.is_downlink ?? false);
    }
  }, [open, port, defaultComment]);

  if (!open) return null;

  const save = async () => {
    setSaving(true);
    await updatePort({
      port_name: portName,
      custom_name: customName,
      role,
      description,
      color,
      is_uplink: isUplink,
      is_downlink: isDownlink,
    });
    setSaving(false);
    onSaved();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 z-[1000] flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-xl p-6 max-w-lg w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">Настройка порта</h3>
            <div className="text-xs text-muted-foreground font-mono-data">{portName}</div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <Icon name="X" size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Имя порта</label>
            <input
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder={portName}
              className="w-full h-9 px-3 bg-secondary border border-border rounded text-sm"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Роль / назначение</label>
            <div className="grid grid-cols-2 gap-1.5">
              {PORT_ROLES.map((r) => (
                <button
                  key={r.v}
                  onClick={() => {
                    setRole(r.v);
                    setIsUplink(r.v === "uplink");
                    setIsDownlink(r.v === "downlink" || r.v === "olt");
                  }}
                  className={`text-xs px-2 py-2 rounded border text-left flex items-center gap-2 ${
                    role === r.v ? "border-primary bg-primary/10" : "border-border bg-secondary hover:bg-accent"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full" style={{ background: r.color }} />
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer px-2 py-1.5 bg-secondary border border-border rounded">
              <input
                type="checkbox"
                checked={isUplink}
                onChange={(e) => setIsUplink(e.target.checked)}
                className="accent-blue-500"
              />
              <span className="text-blue-400">↓ Считать как ВХОД</span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer px-2 py-1.5 bg-secondary border border-border rounded">
              <input
                type="checkbox"
                checked={isDownlink}
                onChange={(e) => setIsDownlink(e.target.checked)}
                className="accent-purple-500"
              />
              <span className="text-purple-400">↑ Считать как ВЫХОД</span>
            </label>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Описание</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Например: Магистральный канал → провайдер RT-1"
              className="w-full px-3 py-2 bg-secondary border border-border rounded text-sm resize-none"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Цвет (опционально)</label>
            <div className="flex gap-1.5">
              {["", "#3b82f6", "#22c55e", "#f59e0b", "#a855f7", "#06b6d4", "#ec4899", "#ef4444"].map((c) => (
                <button
                  key={c || "none"}
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded border-2 ${color === c ? "border-foreground" : "border-border"}`}
                  style={{ background: c || "transparent" }}
                  title={c || "Без цвета"}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={save}
              disabled={saving}
              className="flex-1 h-9 bg-primary text-primary-foreground rounded font-medium text-sm disabled:opacity-50"
            >
              {saving ? "Сохраняю..." : "Сохранить"}
            </button>
            <button onClick={onClose} className="h-9 px-4 bg-secondary border border-border rounded text-sm">
              Отмена
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
