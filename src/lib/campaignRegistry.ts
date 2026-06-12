export const selectedCreatorStatuses = [
  "Contract Signed",
  "Draft Pending",
  "Draft Submitted",
  "Draft Approved",
  "Content Live",
  "Payment Processed",
  "Completed",
  "Dropped",
] as const;

export type SelectedCreatorStatus = (typeof selectedCreatorStatuses)[number];

export type GlobalCampaign = {
  id: string;
  campaignName: string;
  campaignCode: string;
  createdAt: string;
  updatedAt: string;
};

export type SelectedCreatorRecord = {
  id: string;
  campaignRegistryId: string;
  creatorName: string;
  creatorLink: string;
  avgViews: number;
  internalQuote: number;
  externalQuote: number;
  status: SelectedCreatorStatus;
  draftLink: string;
  liveLink: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type GlobalCampaignRegistry = {
  campaigns: GlobalCampaign[];
  creatorRecords: SelectedCreatorRecord[];
};

export type CampaignSummary = {
  totalCreators: number;
  contractSigned: number;
  draftPending: number;
  draftSubmitted: number;
  draftApproved: number;
  contentLive: number;
  paymentPending: number;
  paymentProcessed: number;
  completed: number;
  dropped: number;
  totalSpend: number;
  totalExternalQuote: number;
  totalProfit: number;
  averageMargin: number;
  statusSummary: string;
};

export type CreatorFinancials = {
  cpm: number;
  profit: number;
  profitMargin: number;
};

const campaignRegistryStorageKey = "katlas-global-campaign-registry-v1";
const legacyActiveCampaignsStorageKey = "katlas-active-campaigns-v1";

export function loadCampaignRegistry(): GlobalCampaignRegistry {
  if (typeof window === "undefined") return createDefaultCampaignRegistry();

  try {
    const raw = window.localStorage.getItem(campaignRegistryStorageKey);
    if (!raw) return loadLegacyCampaignRegistry() ?? createDefaultCampaignRegistry();
    return normalizeCampaignRegistry(JSON.parse(raw));
  } catch {
    return createDefaultCampaignRegistry();
  }
}

export function saveCampaignRegistry(registry: GlobalCampaignRegistry) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(campaignRegistryStorageKey, JSON.stringify(registry));
}

export function createCampaign(campaignName: string, campaignCode: string): GlobalCampaign {
  const now = new Date().toISOString();
  return {
    id: createId("campaign"),
    campaignName: campaignName.trim(),
    campaignCode: campaignCode.trim().toUpperCase(),
    createdAt: now,
    updatedAt: now,
  };
}

export function createSelectedCreatorRecord(campaignRegistryId: string): SelectedCreatorRecord {
  const now = new Date().toISOString();
  return {
    id: createId("creator"),
    campaignRegistryId,
    creatorName: "",
    creatorLink: "",
    avgViews: 0,
    internalQuote: 0,
    externalQuote: 0,
    status: "Contract Signed",
    draftLink: "",
    liveLink: "",
    notes: "",
    createdAt: now,
    updatedAt: now,
  };
}

export function getCampaignCreators(
  registry: GlobalCampaignRegistry,
  campaignRegistryId: string,
): SelectedCreatorRecord[] {
  return registry.creatorRecords.filter(
    (record) => record.campaignRegistryId === campaignRegistryId,
  );
}

export function calculateCreatorFinancials(record: SelectedCreatorRecord): CreatorFinancials {
  const cpm = record.avgViews > 0 ? record.externalQuote / record.avgViews : 0;
  const profit = record.externalQuote - record.internalQuote;
  const profitMargin = record.externalQuote > 0 ? profit / record.externalQuote : 0;
  return { cpm, profit, profitMargin };
}

export function calculateCampaignSummary(records: SelectedCreatorRecord[]): CampaignSummary {
  const totalSpend = records.reduce((sum, record) => sum + record.internalQuote, 0);
  const totalExternalQuote = records.reduce((sum, record) => sum + record.externalQuote, 0);
  const totalProfit = records.reduce(
    (sum, record) => sum + calculateCreatorFinancials(record).profit,
    0,
  );
  const averageMargin = totalExternalQuote > 0 ? totalProfit / totalExternalQuote : 0;
  const count = (status: SelectedCreatorStatus) =>
    records.filter((record) => record.status === status).length;
  const contractSigned = count("Contract Signed");
  const draftPending = count("Draft Pending");
  const draftSubmitted = count("Draft Submitted");
  const draftApproved = count("Draft Approved");
  const contentLive = count("Content Live");
  const paymentProcessed = count("Payment Processed");
  const completed = count("Completed");
  const dropped = count("Dropped");
  const paymentPending = records.filter((record) => record.status === "Content Live").length;

  return {
    totalCreators: records.length,
    contractSigned,
    draftPending,
    draftSubmitted,
    draftApproved,
    contentLive,
    paymentPending,
    paymentProcessed,
    completed,
    dropped,
    totalSpend,
    totalExternalQuote,
    totalProfit,
    averageMargin,
    statusSummary: buildStatusSummary({
      contractSigned,
      draftPending,
      draftSubmitted,
      draftApproved,
      contentLive,
      paymentProcessed,
      completed,
      dropped,
    }),
  };
}

function createDefaultCampaignRegistry(): GlobalCampaignRegistry {
  const now = new Date().toISOString();
  return {
    campaigns: [
      {
        id: createId("campaign"),
        campaignName: "Dola Thailand",
        campaignCode: "DOLA-TH",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: createId("campaign"),
        campaignName: "Dola Philippines",
        campaignCode: "DOLA-PH",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: createId("campaign"),
        campaignName: "Dola UK",
        campaignCode: "DOLA-UK",
        createdAt: now,
        updatedAt: now,
      },
    ],
    creatorRecords: [],
  };
}

function loadLegacyCampaignRegistry(): GlobalCampaignRegistry | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(legacyActiveCampaignsStorageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const now = new Date().toISOString();

    return {
      campaigns: parsed.map((value) => {
        const campaign = isRecord(value) ? value : {};
        const name =
          stringValue(campaign.name) || stringValue(campaign.campaignName) || "Untitled Campaign";

        return {
          id: stringValue(campaign.id) || createId("campaign"),
          campaignName: name,
          campaignCode:
            stringValue(campaign.campaignCode) ||
            stringValue(campaign.campaignId) ||
            createCampaignCode(name),
          createdAt: stringValue(campaign.createdAt) || now,
          updatedAt: stringValue(campaign.updatedAt) || now,
        };
      }),
      creatorRecords: [],
    };
  } catch {
    return null;
  }
}

function normalizeCampaignRegistry(value: unknown): GlobalCampaignRegistry {
  const registry = isRecord(value) ? value : {};
  const fallback = createDefaultCampaignRegistry();
  const campaigns = Array.isArray(registry.campaigns)
    ? registry.campaigns.map(normalizeCampaign)
    : fallback.campaigns;
  const campaignIds = new Set(campaigns.map((campaign) => campaign.id));
  const creatorRecords = Array.isArray(registry.creatorRecords)
    ? registry.creatorRecords
        .map(normalizeCreatorRecord)
        .filter((record) => campaignIds.has(record.campaignRegistryId))
    : [];

  return {
    campaigns,
    creatorRecords,
  };
}

function normalizeCampaign(value: unknown): GlobalCampaign {
  const campaign = isRecord(value) ? value : {};
  const now = new Date().toISOString();
  const createdAt = stringValue(campaign.createdAt) || now;
  const name =
    stringValue(campaign.campaignName) || stringValue(campaign.name) || "Untitled Campaign";
  const code =
    stringValue(campaign.campaignCode) ||
    stringValue(campaign.campaignId) ||
    createCampaignCode(name);

  return {
    id: stringValue(campaign.id) || createId("campaign"),
    campaignName: name,
    campaignCode: code.toUpperCase(),
    createdAt,
    updatedAt: stringValue(campaign.updatedAt) || createdAt,
  };
}

function normalizeCreatorRecord(value: unknown): SelectedCreatorRecord {
  const record = isRecord(value) ? value : {};
  const now = new Date().toISOString();
  const createdAt = stringValue(record.createdAt) || now;

  return {
    id: stringValue(record.id) || createId("creator"),
    campaignRegistryId: stringValue(record.campaignRegistryId),
    creatorName: stringValue(record.creatorName),
    creatorLink: stringValue(record.creatorLink),
    avgViews: numberValue(record.avgViews),
    internalQuote: numberValue(record.internalQuote),
    externalQuote: numberValue(record.externalQuote),
    status: normalizeStatus(record.status),
    draftLink: stringValue(record.draftLink),
    liveLink: stringValue(record.liveLink),
    notes: stringValue(record.notes),
    createdAt,
    updatedAt: stringValue(record.updatedAt) || createdAt,
  };
}

function buildStatusSummary(counts: Record<string, number>): string {
  const visible = [
    ["Live", counts.contentLive],
    ["Draft Pending", counts.draftPending],
    ["Draft Approved", counts.draftApproved],
    ["Completed", counts.completed],
    ["Signed", counts.contractSigned],
    ["Submitted", counts.draftSubmitted],
    ["Payment Processed", counts.paymentProcessed],
    ["Dropped", counts.dropped],
  ].filter(([, count]) => Number(count) > 0);

  if (!visible.length) return "No selected creators";
  return visible
    .slice(0, 3)
    .map(([label, count]) => `${count} ${label}`)
    .join(", ");
}

function normalizeStatus(value: unknown): SelectedCreatorStatus {
  return selectedCreatorStatuses.includes(value as SelectedCreatorStatus)
    ? (value as SelectedCreatorStatus)
    : "Contract Signed";
}

function createCampaignCode(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (!words.length) return "CAMPAIGN";
  return words.map((word) => word.slice(0, 4).toUpperCase()).join("-");
}

function numberValue(value: unknown): number {
  const numeric = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function stringValue(value: unknown): string {
  return value == null ? "" : String(value);
}

function createId(prefix: string): string {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
