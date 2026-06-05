import { createFileRoute } from "@tanstack/react-router";
import { LayoutDashboard, Users, Briefcase, Send, CalendarDays } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

function Dashboard() {
  const stats = [
    { label: "Active talent", value: "—", icon: Users },
    { label: "Open deals", value: "—", icon: Briefcase },
    { label: "Outreach sent", value: "—", icon: Send },
    { label: "Upcoming posts", value: "—", icon: CalendarDays },
  ];

  return (
    <div className="px-10 py-8 max-w-6xl">
      <PageHeader
        title="Dashboard"
        subtitle="Overview of your roster, deals, and outreach activity."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {stats.map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{label}</span>
              <Icon className="size-4 text-muted-foreground" />
            </div>
            <div className="mt-3 text-2xl font-semibold tracking-tight">{value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-dashed border-border bg-card/40 px-8 py-16 text-center">
        <LayoutDashboard className="mx-auto size-5 text-muted-foreground" />
        <h3 className="mt-3 text-sm font-semibold">No activity yet</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Recent deals, messages, and content milestones will appear here.
        </p>
      </div>
    </div>
  );
}
