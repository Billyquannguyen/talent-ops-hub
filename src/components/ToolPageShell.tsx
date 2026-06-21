import type { LucideIcon } from "lucide-react";
import { TopBar } from "./TopBar";

interface Props {
  eyebrow?: string;
  title: string;
  description: string;
  icon: LucideIcon;
  actionLabel?: string;
}

export function ToolPageShell({ eyebrow, title, description, icon: Icon, actionLabel }: Props) {
  return (
    <div className="relative h-full flex flex-col">
      <TopBar />
      <div className="absolute inset-x-0 top-0 h-[360px] bg-hero-glow pointer-events-none" />

      <div className="relative flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-6 grid size-14 place-items-center rounded-2xl border border-border/80 bg-card/75 shadow-[0_18px_54px_rgba(0,0,0,0.2)] backdrop-blur-sm">
          <Icon className="size-5 text-muted-foreground" />
        </div>
        {eyebrow && (
          <p className="text-[11px] tracking-[0.3em] text-muted-foreground uppercase mb-2">
            {eyebrow}
          </p>
        )}
        <h1 className="max-w-xl text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
        <p className="mt-3 text-sm text-muted-foreground max-w-md leading-relaxed">{description}</p>
        {actionLabel && (
          <button className="mt-6 rounded-full bg-foreground text-background text-xs font-medium px-4 py-2 hover:opacity-90">
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
