import { createFileRoute } from "@tanstack/react-router";
import { LifeBuoy } from "lucide-react";
import { ToolPageShell } from "@/components/ToolPageShell";

export const Route = createFileRoute("/help")({
  component: () => (
    <ToolPageShell
      eyebrow="Help & Support"
      title="We're here when you need us."
      description="Browse the playbook, reach out to support, or share feedback to shape what we build next."
      icon={LifeBuoy}
      actionLabel="Contact support"
    />
  ),
});
