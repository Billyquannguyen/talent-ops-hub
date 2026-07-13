import type { CampaignProfileRecord } from "@/storage/schema";

export const campaignActiveStatus = "Active";
export const campaignHiddenStatus = "Hidden";

const hiddenCampaignStatuses = new Set(["hidden", "archived", "deleted", "inactive"]);

export function isCampaignHiddenStatus(status: string): boolean {
  return hiddenCampaignStatuses.has(status.trim().toLowerCase());
}

export function isVisibleCampaignProfile(campaign: CampaignProfileRecord): boolean {
  return !isCampaignHiddenStatus(campaign.status);
}

export function filterVisibleCampaignProfiles(
  campaigns: CampaignProfileRecord[],
): CampaignProfileRecord[] {
  return campaigns.filter(isVisibleCampaignProfile);
}
