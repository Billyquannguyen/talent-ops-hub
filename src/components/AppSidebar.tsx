import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  Briefcase,
  Send,
  CalendarDays,
  BarChart3,
  Inbox,
  Settings,
} from "lucide-react";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/roster", label: "Roster", icon: Users },
  { to: "/deals", label: "Deals", icon: Briefcase },
  { to: "/outreach", label: "Outreach", icon: Send },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/inbox", label: "Inbox", icon: Inbox },
] as const;

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside className="fixed inset-y-0 left-0 z-10 flex w-60 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center gap-2 px-5 border-b border-sidebar-border">
        <div className="size-6 rounded-md bg-foreground text-background grid place-items-center text-[11px] font-semibold">
          T
        </div>
        <span className="text-sm font-semibold tracking-tight">Talent OS</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        <p className="px-2 pb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          Workspace
        </p>
        {nav.map(({ to, label, icon: Icon }) => {
          const active = pathname === to;
          return (
            <Link
              key={to}
              to={to}
              className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors ${
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              }`}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <Link
          to="/settings"
          className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
        >
          <Settings className="size-4" />
          Settings
        </Link>
        <div className="mt-3 flex items-center gap-2.5 px-2 py-1.5">
          <div className="size-7 rounded-full bg-accent grid place-items-center text-xs font-medium">
            AM
          </div>
          <div className="leading-tight">
            <div className="text-xs font-medium">Alex Morgan</div>
            <div className="text-[11px] text-muted-foreground">Talent Manager</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
