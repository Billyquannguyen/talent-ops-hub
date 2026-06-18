import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronDown, LockKeyhole } from "lucide-react";

import { lockPasswordGate } from "@/lib/passwordGate";

const navItems = [
  { to: "/", label: "AI Slave" },
  { to: "/campaign-profiles", label: "Campaign Profiles" },
  { to: "/employee-profile", label: "Employee Profile" },
  { to: "/about-katlas-media", label: "About Katlas Media" },
] as const;

export function TopBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="flex items-center justify-between px-6 pt-5">
      <Link
        to="/settings"
        className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1.5 text-xs font-medium text-foreground/90 hover:bg-card"
      >
        <span className="size-1.5 rounded-full bg-emerald-400" />
        Katlas Ops v1.0
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </Link>

      <div className="flex min-w-0 items-center gap-5">
        <nav className="flex max-w-[70vw] items-center gap-5 overflow-x-auto text-sm">
          {navItems.map((n) => {
            const active = pathname === n.to;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`relative pb-1 transition-colors ${
                  active
                    ? "text-foreground after:absolute after:-bottom-0.5 after:left-0 after:right-0 after:h-px after:bg-foreground"
                    : "text-muted-foreground hover:text-foreground"
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
          className="grid size-8 place-items-center rounded-full border border-border bg-card/60 text-muted-foreground transition hover:bg-card hover:text-foreground"
        >
          <LockKeyhole className="size-3.5" />
        </button>
        <div className="size-8 rounded-full bg-accent grid place-items-center text-[11px] font-semibold ring-1 ring-border">
          KM
        </div>
      </div>
    </div>
  );
}
