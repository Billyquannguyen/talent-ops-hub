import { createFileRoute } from "@tanstack/react-router";
import { Briefcase } from "lucide-react";
import { ToolPageShell } from "@/components/ToolPageShell";

export const Route = createFileRoute("/deals")({
  component: () => (
    <ToolPageShell
      eyebrow="Deals"
      title="From pitch to payment, in one pipeline."
      description="Track brand partnerships through every stage — negotiation, contract, deliverables, and invoicing — without losing a thread."
      icon={Briefcase}
      actionLabel="New deal"
    />
  ),
});
