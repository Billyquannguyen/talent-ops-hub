import { createFileRoute } from "@tanstack/react-router";
import { Briefcase } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";

export const Route = createFileRoute("/deals")({ component: Page });

function Page() {
  return (
    <div className="px-10 py-8 max-w-6xl">
      <PageHeader title="Deals" subtitle="Brand partnerships from pitch to payment." />
      <EmptyState
        icon={Briefcase}
        title="No deals in the pipeline"
        description="Track brand deals through every stage — negotiation, contract, deliverables, and invoicing — without losing a thread."
        actionLabel="New deal"
      />
    </div>
  );
}
