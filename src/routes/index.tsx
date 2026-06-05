import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import {
  Plus,
  Settings2,
  Lightbulb,
  Mic,
  ArrowUp,
  ArrowUpRight,
  Sparkles,
  Users,
  Briefcase,
  Send,
} from "lucide-react";
import { TopBar } from "@/components/TopBar";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

const quickActions = [
  {
    to: "/roster",
    icon: Users,
    title: "Build your roster",
    desc: "Add creators, track their platforms, audience, and rate cards.",
  },
  {
    to: "/outreach",
    icon: Send,
    title: "Draft brand outreach",
    desc: "Pitch your talent to relevant brands with AI-assisted templates.",
  },
  {
    to: "/deals",
    icon: Briefcase,
    title: "Manage deals",
    desc: "Move partnerships from negotiation to delivery without losing a thread.",
  },
] as const;

function Dashboard() {
  return (
    <div className="relative h-full flex flex-col">
      <TopBar />

      {/* Hero glow */}
      <div className="absolute inset-x-0 top-0 h-[420px] bg-hero-glow pointer-events-none" />

      <div className="relative flex-1 flex flex-col items-center px-6 pt-14 pb-8">
        {/* Welcome */}
        <div className="flex flex-col items-center text-center max-w-2xl">
          <div className="size-20 rounded-full bg-orb shadow-[0_0_60px_-10px_var(--glow)] mb-6" />
          <p className="text-[11px] tracking-[0.3em] text-muted-foreground uppercase">
            Welcome back
          </p>
          <h1 className="mt-2 text-3xl md:text-4xl font-medium tracking-tight">
            Run your roster from one quiet place.
          </h1>
        </div>

        {/* Chat input */}
        <div className="mt-10 w-full max-w-3xl">
          <div className="rounded-2xl border border-border bg-card/70 backdrop-blur-sm px-4 pt-3 pb-2.5">
            <div className="flex items-start gap-2">
              <Sparkles className="size-4 mt-1 text-muted-foreground" />
              <input
                placeholder="Ask anything — draft a pitch, summarize a deal, plan a campaign..."
                className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground/70 outline-none py-1"
              />
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button className="grid size-7 place-items-center rounded-full border border-border text-muted-foreground hover:text-foreground">
                  <Plus className="size-3.5" />
                </button>
                <Pill icon={Settings2} label="Tools" />
                <Pill icon={Lightbulb} label="Deep Think" />
              </div>
              <div className="flex items-center gap-2">
                <button className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground">
                  <Mic className="size-3.5" /> Voice
                </button>
                <button className="grid size-8 place-items-center rounded-full bg-foreground text-background hover:opacity-90">
                  <ArrowUp className="size-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Quick action cards */}
        <div className="mt-6 w-full max-w-3xl grid grid-cols-1 md:grid-cols-3 gap-3">
          {quickActions.map(({ to, icon: Icon, title, desc }) => (
            <Link
              key={to}
              to={to}
              className="group relative rounded-2xl border border-border bg-card/60 p-4 hover:bg-card transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="grid size-8 place-items-center rounded-lg border border-border bg-background/40">
                  <Icon className="size-4 text-muted-foreground" />
                </div>
                <ArrowUpRight className="size-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              </div>
              <h3 className="mt-6 text-sm font-medium">{title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function Pill({ icon: Icon, label }: { icon: typeof Plus; label: string }) {
  return (
    <button className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-foreground/80 hover:bg-accent">
      <Icon className="size-3.5 text-muted-foreground" />
      {label}
    </button>
  );
}
