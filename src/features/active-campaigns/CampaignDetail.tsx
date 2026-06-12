import { ActiveCampaignManagement } from "./ActiveCampaignManagement";

export function CampaignDetailPage({ campaignId }: { campaignId: string }) {
  return <ActiveCampaignManagement initialCampaignId={campaignId} />;
}
