import { ReactNode } from "react";

interface Props {
  title: string;
  description?: string;
  actions?: ReactNode;
  icon?: ReactNode;
}

export default function PageHeader({ title, description, actions }: Props) {
  return (
    <div className="flex items-start justify-between mb-6 pb-4 border-b border-border">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
