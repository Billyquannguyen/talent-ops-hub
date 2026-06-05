import { createFileRoute } from "@tanstack/react-router";
import { Settings as SettingsIcon } from "lucide-react";
import { ToolPageShell } from "@/components/ToolPageShell";

export const Route = createFileRoute("/settings")({
  component: () => (
    <ToolPageShell
      eyebrow="Settings"
      title="Workspace and integrations."
      description="Manage your agency profile, billing, integrations, and team permissions from here."
      icon={SettingsIcon}
    />
  ),
});
