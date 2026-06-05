import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { ToolPageShell } from "@/components/ToolPageShell";

export const Route = createFileRoute("/roster")({
  component: () => (
    <ToolPageShell
      eyebrow="Roster"
      title="Your stable of creators, organized."
      description="Add the talent you represent to track platforms, audience demographics, rate cards, and active campaigns in one quiet view."
      icon={Users}
      actionLabel="Add talent"
    />
  ),
});
