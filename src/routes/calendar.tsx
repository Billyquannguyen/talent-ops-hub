import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";

export const Route = createFileRoute("/calendar")({ component: Page });

function Page() {
  return (
    <div className="px-10 py-8 max-w-6xl">
      <PageHeader title="Content Calendar" subtitle="Publishing schedule across all talent and platforms." />
      <EmptyState
        icon={CalendarDays}
        title="Calendar is empty"
        description="Plan, approve, and schedule sponsored content across Instagram, TikTok, and YouTube — all in one timeline."
        actionLabel="Schedule a post"
      />
    </div>
  );
}
