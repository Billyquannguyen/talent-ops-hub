import { createFileRoute } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";
import { ToolPageShell } from "@/components/ToolPageShell";

export const Route = createFileRoute("/analytics")({
  component: () => (
    <ToolPageShell
      eyebrow="Analytics"
      title="Performance, clearly."
      description="Once campaigns go live, see engagement, reach, CPM benchmarks, and revenue per creator side-by-side."
      icon={BarChart3}
    />
  ),
});
