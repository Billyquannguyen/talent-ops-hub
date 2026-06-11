import { createFileRoute } from "@tanstack/react-router";
import { CreatorSourcingAssistant } from "@/features/creator-sourcing/CreatorSourcingAssistant";

export const Route = createFileRoute("/creator-sourcing")({
  component: CreatorSourcingAssistant,
});
