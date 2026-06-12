import { createFileRoute } from "@tanstack/react-router";
import { CampaignDetailPage } from "@/features/active-campaigns/CampaignDetail";

export const Route = createFileRoute("/active-campaigns/$campaignId")({
  component: CampaignDetailRoute,
});

function CampaignDetailRoute() {
  const { campaignId } = Route.useParams();
  return <CampaignDetailPage campaignId={campaignId} />;
}
