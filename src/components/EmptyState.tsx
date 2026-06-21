import type { LucideIcon } from "lucide-react";

interface Props {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
}

export function EmptyState({ icon: Icon, title, description, actionLabel }: Props) {
  return (
    <div className="rounded-xl border border-dashed border-border/80 bg-card/45 px-8 py-16 shadow-inner">
      <div className="mx-auto flex max-w-md flex-col items-center text-center">
        <div className="mb-4 grid size-11 place-items-center rounded-lg border border-border/80 bg-background/70">
          <Icon className="size-5 text-muted-foreground" />
        </div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p>
        {actionLabel && (
          <button
            disabled
            className="mt-5 inline-flex items-center rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background opacity-60"
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
