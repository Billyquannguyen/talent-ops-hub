import { createFileRoute } from "@tanstack/react-router";
import { ActiveCampaignManagement } from "@/features/active-campaigns/ActiveCampaignManagement";

export const Route = createFileRoute("/active-campaigns/")({
  component: ActiveCampaignManagement,
});
