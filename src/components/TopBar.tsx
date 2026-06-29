import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronDown, LockKeyhole } from "lucide-react";

import { lockPasswordGate } from "@/lib/passwordGate";
import { EmployeeProfileBadge } from "./EmployeeProfileBadge";

const navItems = [
  { to: "/", label: "AI Slave" },
  { to: "/campaign-profiles", label: "Campaign Profiles" },
  { to: "/employee-profile", label: "Employee Profile" },
  { to: "/about-katlas-media", label: "About Katlas Media" },
] as const;

export function TopBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <header className="relative z-50 px-4 pt-4 sm:px-5">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 rounded-2xl border border-border/70 bg-background/62 px-3 py-3 shadow-[0_18px_60px_rgba(0,0,0,0.22)] backdrop-blur-xl md:flex-row md:items-center md:justify-between md:px-4">
        <Link
          to="/settings"
          className="inline-flex w-fit items-center gap-2 rounded-full border border-border/80 bg-card/70 px-3 py-1.5 text-xs font-medium text-foreground/90 transition hover:border-ring/40 hover:bg-card"
        >
          <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.8)]" />
          Katlas Buddy
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </Link>

        <div className="flex min-w-0 items-center justify-between gap-3 md:justify-end">
          <nav className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-full border border-border/60 bg-card/45 p-1 text-sm">
            {navItems.map((n) => {
              const active = pathname === n.to;
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={`whitespace-nowrap rounded-full px-3 py-1.5 transition-colors ${
                    active
                      ? "bg-foreground text-background shadow-sm"
                      : "text-muted-foreground hover:bg-accent/70 hover:text-foreground"
                  }`}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <button
            type="button"
            onClick={lockPasswordGate}
            title="Lock Katlas Buddy"
            className="grid size-9 shrink-0 place-items-center rounded-full border border-border/80 bg-card/70 text-muted-foreground transition hover:border-ring/40 hover:bg-card hover:text-foreground"
          >
            <LockKeyhole className="size-3.5" />
          </button>
          <EmployeeProfileBadge />
        </div>
      </div>
    </header>
  );
}
