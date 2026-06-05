import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";
import { ToolPageShell } from "@/components/ToolPageShell";

export const Route = createFileRoute("/calendar")({
  component: () => (
    <ToolPageShell
      eyebrow="Content Calendar"
      title="Every post, every platform, one timeline."
      description="Plan, approve, and schedule sponsored content across Instagram, TikTok, and YouTube for your full roster."
      icon={CalendarDays}
      actionLabel="Schedule a post"
    />
  ),
});
