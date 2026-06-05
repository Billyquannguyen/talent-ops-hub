import { createFileRoute } from "@tanstack/react-router";
import { Inbox } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";

export const Route = createFileRoute("/inbox")({ component: Page });

function Page() {
  return (
    <div className="px-10 py-8 max-w-6xl">
      <PageHeader title="Inbox" subtitle="Unified conversations with brands and talent." />
      <EmptyState
        icon={Inbox}
        title="Inbox zero"
        description="Connect your email and DMs to triage brand inquiries, contract questions, and creator updates in one thread view."
        actionLabel="Connect inbox"
      />
    </div>
  );
}
