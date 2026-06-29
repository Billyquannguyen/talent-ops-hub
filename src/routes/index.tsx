import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { ArrowUpRight, ChevronDown, Lock, LockKeyhole } from "lucide-react";

import { EmployeeProfileBadge } from "@/components/EmployeeProfileBadge";
import { lockPasswordGate } from "@/lib/passwordGate";
import { workflowCards } from "@/lib/workflows";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

const homeNavItems = [
  { to: "/", label: "AI Slave" },
  { to: "/campaign-profiles", label: "Campaign Profiles" },
  { to: "/employee-profile", label: "Employee Profile" },
  { to: "/about-katlas-media", label: "About Katlas Media" },
] as const;

function Dashboard() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <DashboardTopBar />
      <div className="absolute inset-x-0 top-0 h-[420px] bg-hero-glow pointer-events-none" />

      <main className="relative mx-auto flex w-full max-w-6xl flex-col px-6 pb-10 pt-14">
        <section className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <div className="mb-6 size-16 rounded-full bg-orb shadow-[0_0_60px_-10px_var(--glow)]" />
          <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
            KATLAS BUDDY
          </p>
          <h1 className="mt-3 text-3xl font-medium tracking-tight md:text-5xl">
            Unlock global markets with local voices
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
            A companion for creator sourcing, outreach, campaign tracking, and the everyday ops that
            help Katlas move faster.
          </p>
        </section>

        <section className="mt-10 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {workflowCards.map((card) => {
            const Icon = card.icon;
            const body = (
              <>
                <div className="flex items-start justify-between">
                  <div className="grid size-9 place-items-center rounded-lg border border-border bg-background/40">
                    <Icon className="size-4 text-muted-foreground" />
                  </div>
                  {card.status === "ready" ? (
                    <ArrowUpRight className="size-4 text-muted-foreground transition-colors group-hover:text-foreground" />
                  ) : (
                    <Lock className="size-4 text-muted-foreground" />
                  )}
                </div>
                <div className="mt-7">
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                      card.status === "ready"
                        ? "bg-foreground text-background"
                        : "border border-border text-muted-foreground"
                    }`}
                  >
                    {card.status === "ready" ? "Ready" : "Placeholder"}
                  </span>
                  <h2 className="mt-4 text-sm font-medium">{card.title}</h2>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    {card.description}
                  </p>
                </div>
              </>
            );

            if (card.status === "ready" && card.route) {
              return (
                <Link
                  key={card.id}
                  to={card.route}
                  className="group rounded-2xl border border-border bg-card/60 p-4 transition-colors hover:bg-card"
                >
                  {body}
                </Link>
              );
            }

            return (
              <div
                key={card.id}
                className="rounded-2xl border border-dashed border-border bg-card/40 p-4 opacity-80"
              >
                {body}
              </div>
            );
          })}
        </section>
      </main>
    </div>
  );
}

function DashboardTopBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="relative z-50 flex items-center justify-between px-6 pt-5">
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
          {homeNavItems.map((item) => {
            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`relative pb-1 transition-colors ${
                  active
                    ? "text-foreground after:absolute after:-bottom-0.5 after:left-0 after:right-0 after:h-px after:bg-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.label}
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
        <EmployeeProfileBadge size="sm" className="border-border bg-accent" />
      </div>
    </div>
  );
}
