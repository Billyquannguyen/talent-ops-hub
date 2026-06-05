import { createFileRoute } from "@tanstack/react-router";
import { Send } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";

export const Route = createFileRoute("/outreach")({ component: Page });

function Page() {
  return (
    <div className="px-10 py-8 max-w-6xl">
      <PageHeader title="Outreach" subtitle="Pitch your talent to brands at scale." />
      <EmptyState
        icon={Send}
        title="No outreach campaigns"
        description="Build target brand lists, draft pitch templates, and track open and reply rates from every campaign you send."
        actionLabel="Start a campaign"
      />
    </div>
  );
}
