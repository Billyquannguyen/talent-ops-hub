import { createFileRoute } from "@tanstack/react-router";
import { Send } from "lucide-react";
import { ToolPageShell } from "@/components/ToolPageShell";

export const Route = createFileRoute("/outreach")({
  component: () => (
    <ToolPageShell
      eyebrow="Outreach"
      title="Pitch your talent to the right brands."
      description="Build target lists, draft AI-assisted pitches, and track open and reply rates from every campaign you send."
      icon={Send}
      actionLabel="Start a campaign"
    />
  ),
});
