import Icon from "@/components/ui/icon";
import PageHeader from "@/components/common/PageHeader";
import { GROUPS, OLTS, ONUS, USERS } from "@/lib/mock-data";

export default function Groups() {
  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader
        title="Группы оборудования"
        description="Логические группы для разграничения доступа и удобной навигации"
        actions={
          <button className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2">
            <Icon name="Plus" size={14} />Создать группу
          </button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {GROUPS.map((g) => {
          const olts = OLTS.filter((_, i) => i === g.id - 1);
          const onuCount = ONUS.filter((o) => olts.find((ol) => ol.id === o.oltId)).length;
          return (
            <div key={g.id} className="bg-card border border-border rounded-lg p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-md flex items-center justify-center" style={{ background: g.color + "22", color: g.color }}>
                    <Icon name="Boxes" size={20} />
                  </div>
                  <div>
                    <h3 className="font-semibold">{g.name}</h3>
                    <div className="text-xs text-muted-foreground">{g.description}</div>
                  </div>
                </div>
                <button className="text-muted-foreground hover:text-foreground"><Icon name="MoreVertical" size={16} /></button>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="bg-secondary rounded p-2 text-center">
                  <div className="font-mono-data text-lg font-semibold">{olts.length}</div>
                  <div className="text-[10px] text-muted-foreground">OLT</div>
                </div>
                <div className="bg-secondary rounded p-2 text-center">
                  <div className="font-mono-data text-lg font-semibold">{onuCount}</div>
                  <div className="text-[10px] text-muted-foreground">ONU</div>
                </div>
                <div className="bg-secondary rounded p-2 text-center">
                  <div className="font-mono-data text-lg font-semibold">{g.userCount}</div>
                  <div className="text-[10px] text-muted-foreground">польз.</div>
                </div>
              </div>
              <div className="text-xs text-muted-foreground mb-2">Устройства:</div>
              <div className="space-y-1">
                {olts.map((o) => (
                  <div key={o.id} className="flex items-center justify-between text-xs px-2 py-1.5 bg-secondary/50 rounded">
                    <span>{o.name}</span>
                    <span className="font-mono-data text-muted-foreground">{o.ip}</span>
                  </div>
                ))}
              </div>
              <div className="text-xs text-muted-foreground mb-2 mt-3">Пользователи с доступом:</div>
              <div className="flex -space-x-2">
                {USERS.filter((u) => u.group === g.name).slice(0, 5).map((u) => (
                  <div key={u.id} title={u.fullName} className="w-7 h-7 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-semibold border-2 border-card">
                    {u.fullName.split(" ").map((s) => s[0]).slice(0, 2).join("")}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
