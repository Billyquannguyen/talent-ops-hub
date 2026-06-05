import { Link, useRouterState } from "@tanstack/react-router";
import {
  Plus,
  Search,
  Users,
  Briefcase,
  Send,
  CalendarDays,
  BarChart3,
  Inbox,
  Sparkles,
} from "lucide-react";

const features = [
  { to: "/roster", label: "Roster", icon: Users },
  { to: "/deals", label: "Deals", icon: Briefcase },
  { to: "/outreach", label: "Outreach", icon: Send },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/inbox", label: "Inbox", icon: Inbox },
] as const;

const recentChats = [
  "Draft Q3 outreach to Glossier",
  "Renegotiate Nike contract terms",
  "Brief for Maya — Sephora collab",
  "Pull engagement report — July",
  "Shortlist beauty brands for Lila",
  "Follow-up: Adidas creative review",
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside className="fixed inset-y-3 left-3 z-10 flex w-64 flex-col rounded-2xl border border-sidebar-border bg-sidebar text-sidebar-foreground overflow-hidden">
      {/* Brand + search */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <div className="size-7 rounded-full bg-orb shadow-inner" />
          <span className="text-sm font-semibold tracking-tight">Talent OS</span>
        </div>
        <button className="grid size-7 place-items-center rounded-full text-muted-foreground hover:text-foreground hover:bg-sidebar-accent">
          <Search className="size-3.5" />
        </button>
      </div>

      {/* New chat */}
      <div className="px-3 pb-2">
        <button className="w-full flex items-center gap-2 rounded-xl bg-sidebar-accent/70 hover:bg-sidebar-accent px-3 py-2.5 text-sm font-medium ring-1 ring-sidebar-border">
          <Plus className="size-4" />
          New Chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-5">
        {/* Features */}
        <div>
          <p className="px-2 pt-3 pb-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
            Features
          </p>
          <div className="space-y-0.5">
            {features.map(({ to, label, icon: Icon }) => {
              const active = pathname === to;
              return (
                <Link
                  key={to}
                  to={to}
                  className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                  }`}
                >
                  <Icon className="size-4 opacity-80" />
                  {label}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Your chats */}
        <div>
          <p className="px-2 pb-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
            Your Chats
          </p>
          <div className="space-y-0.5">
            {recentChats.map((c) => (
              <button
                key={c}
                className="w-full text-left truncate rounded-lg px-2.5 py-1.5 text-[13px] text-sidebar-foreground/65 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Upgrade card */}
      <div className="m-3 mt-0 rounded-xl border border-sidebar-border bg-sidebar-accent/40 p-3">
        <div className="flex items-center gap-2">
          <div className="grid size-7 place-items-center rounded-full bg-orb">
            <Sparkles className="size-3.5 text-background" />
          </div>
          <span className="text-sm font-medium">Upgrade to Pro</span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          Unlimited deals, AI outreach drafts, and analytics across your full roster.
        </p>
        <div className="mt-2 flex items-baseline gap-1">
          <span className="text-lg font-semibold">$49</span>
          <span className="text-[11px] text-muted-foreground">/month</span>
        </div>
        <button className="mt-2 w-full rounded-lg bg-foreground text-background text-xs font-medium py-1.5 inline-flex items-center justify-center gap-1.5 hover:opacity-90">
          <Plus className="size-3.5" /> Upgrade Now
        </button>
      </div>
    </aside>
  );
}
