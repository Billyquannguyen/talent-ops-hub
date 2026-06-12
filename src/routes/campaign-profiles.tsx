import { createFileRoute } from "@tanstack/react-router";
import { CampaignProfiles } from "@/features/campaign-profiles/CampaignProfiles";

export const Route = createFileRoute("/campaign-profiles")({
  component: CampaignProfiles,
});
