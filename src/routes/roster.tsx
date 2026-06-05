import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";

export const Route = createFileRoute("/roster")({ component: Page });

function Page() {
  return (
    <div className="px-10 py-8 max-w-6xl">
      <PageHeader title="Roster" subtitle="Your stable of creators and their key stats." />
      <EmptyState
        icon={Users}
        title="No talent added yet"
        description="Add the creators you represent to track their platforms, audience, rates, and active campaigns in one place."
        actionLabel="Add talent"
      />
    </div>
  );
}
