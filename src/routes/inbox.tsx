import { createFileRoute } from "@tanstack/react-router";
import { Inbox } from "lucide-react";
import { ToolPageShell } from "@/components/ToolPageShell";

export const Route = createFileRoute("/inbox")({
  component: () => (
    <ToolPageShell
      eyebrow="Inbox"
      title="One thread for every conversation."
      description="Connect your email and DMs to triage brand inquiries, contract questions, and creator updates in a single view."
      icon={Inbox}
      actionLabel="Connect inbox"
    />
  ),
});
