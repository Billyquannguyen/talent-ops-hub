import { createFileRoute } from "@tanstack/react-router";
import { Settings as SettingsIcon } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";

export const Route = createFileRoute("/settings")({ component: Page });

function Page() {
  return (
    <div className="px-10 py-8 max-w-6xl">
      <PageHeader title="Settings" subtitle="Workspace, integrations, and team members." />
      <EmptyState
        icon={SettingsIcon}
        title="Nothing to configure yet"
        description="Manage your agency profile, billing, integrations, and team permissions from here."
      />
    </div>
  );
}
