import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";
import { RouterSettings, updateRouter } from "@/lib/mikrotik-stats";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  router: RouterSettings | null;
  detectedModel?: string;
}

export default function RouterSettingsModal({ open, onClose, onSaved, router, detectedModel }: Props) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [location, setLocation] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [autoPhoto, setAutoPhoto] = useState(true);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(router?.custom_name ?? "");
      setRole(router?.role ?? "");
      setLocation(router?.location ?? "");
      setPhotoUrl(router?.photo_url ?? "");
      setAutoPhoto(router?.auto_photo ?? true);
      setNotes(router?.notes ?? "");
    }
  }, [open, router]);

  if (!open) return null;

  const save = async () => {
    setSaving(true);
    await updateRouter({
      custom_name: name,
      role,
      location,
      photo_url: photoUrl || null,
      auto_photo: autoPhoto,
      notes,
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
          <h3 className="text-lg font-semibold">Настройка роутера</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <Icon name="X" size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Название</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="R4 ArtTelecom"
              className="w-full h-9 px-3 bg-secondary border border-border rounded text-sm"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Роль</label>
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Магистральный маршрутизатор · BGP/OSPF"
              className="w-full h-9 px-3 bg-secondary border border-border rounded text-sm"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Локация</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="ЦОД / стойка"
              className="w-full h-9 px-3 bg-secondary border border-border rounded text-sm"
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm cursor-pointer px-2 py-1.5 bg-secondary border border-border rounded">
              <input
                type="checkbox"
                checked={autoPhoto}
                onChange={(e) => setAutoPhoto(e.target.checked)}
                className="accent-primary"
              />
              <span>Автоматически подбирать фото по модели</span>
              {detectedModel && (
                <span className="ml-auto text-xs text-muted-foreground font-mono-data">
                  модель: {detectedModel}
                </span>
              )}
            </label>
          </div>

          {!autoPhoto && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Своё фото (URL)</label>
              <input
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
                placeholder="https://..."
                className="w-full h-9 px-3 bg-secondary border border-border rounded text-sm font-mono-data"
              />
            </div>
          )}

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Заметки</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 bg-secondary border border-border rounded text-sm resize-none"
            />
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
