import { createFileRoute } from "@tanstack/react-router";
import { CreatorOutreachPages } from "@/features/creator-outreach/CreatorOutreachPages";

export const Route = createFileRoute("/creator-outreach")({
  component: CreatorOutreachPages,
});
