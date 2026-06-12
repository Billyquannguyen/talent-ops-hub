import { createFileRoute } from "@tanstack/react-router";
import { CreatorOutreachAssistant } from "@/features/creator-outreach/CreatorOutreachAssistant";

export const Route = createFileRoute("/creator-outreach")({
  component: CreatorOutreachAssistant,
});
