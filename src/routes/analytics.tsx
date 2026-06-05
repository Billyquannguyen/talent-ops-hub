import { createFileRoute } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";

export const Route = createFileRoute("/analytics")({ component: Page });

function Page() {
  return (
    <div className="px-10 py-8 max-w-6xl">
      <PageHeader title="Analytics" subtitle="Performance across talent, campaigns, and revenue." />
      <EmptyState
        icon={BarChart3}
        title="No data to report"
        description="Once campaigns go live, you'll see engagement, reach, CPM benchmarks, and revenue per creator here."
      />
    </div>
  );
}
