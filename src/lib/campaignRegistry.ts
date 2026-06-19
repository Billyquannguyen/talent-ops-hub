import { loadAppDatabase, saveAppDatabase } from "@/storage/appRepository";

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

export const campaignMemoryLanguages = [
  "English",
  "Thai",
  "Filipino",
  "Vietnamese",
  "Indonesian",
  "Korean",
  "Spanish",
] as const;

export type CampaignMemoryLanguage = (typeof campaignMemoryLanguages)[number];

export type CampaignMemoryCard = {
  id: string;
  title: string;
  content: string;
};

export type GlobalCampaign = {
  id: string;
  campaignName: string;
  campaignCode: string;
  preferredLanguages: CampaignMemoryLanguage[];
  memoryCards: CampaignMemoryCard[];
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

const legacyActiveCampaignsStorageKey = "katlas-active-campaigns-v1";

export function loadCampaignRegistry(): GlobalCampaignRegistry {
  if (typeof window === "undefined") return { campaigns: [], creatorRecords: [] };

  try {
    const database = loadAppDatabase();
    const campaigns = database.worksheets.CampaignProfiles.map((campaign) =>
      normalizeCampaign({
        id: campaign.campaignId,
        campaignName: campaign.campaignName,
        campaignCode: campaign.campaignCode,
        country: campaign.country,
        status: campaign.status,
        preferredLanguages: campaign.preferredLanguages,
        memoryCards: database.worksheets.CampaignMemoryCards.filter(
          (card) => card.campaignId === campaign.campaignId,
        ).map((card) => ({
          id: card.cardId,
          title: card.title,
          content: card.content,
        })),
        createdAt: campaign.createdAt,
        updatedAt: campaign.updatedAt,
      }),
    );
    const campaignIds = new Set(campaigns.map((campaign) => campaign.id));
    const creatorRecords = database.worksheets.ActiveCampaignCreators.map((record) =>
      normalizeCreatorRecord({
        id: record.recordId,
        campaignRegistryId: record.campaignId,
        creatorName: record.creatorName,
        creatorLink: record.creatorLink,
        avgViews: record.avgViews,
        internalQuote: record.internalQuote,
        externalQuote: record.externalQuote,
        status: record.status,
        draftLink: record.draftLink,
        liveLink: record.liveLink,
        notes: record.notes,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      }),
    ).filter((record) => campaignIds.has(record.campaignRegistryId));

    if (!campaigns.length) return loadLegacyCampaignRegistry() ?? { campaigns, creatorRecords };
    return { campaigns, creatorRecords };
  } catch {
    return loadLegacyCampaignRegistry() ?? { campaigns: [], creatorRecords: [] };
  }
}

export function saveCampaignRegistry(registry: GlobalCampaignRegistry) {
  if (typeof window === "undefined") return;
  const database = loadAppDatabase();
  const existingProfiles = new Map(
    database.worksheets.CampaignProfiles.map((campaign) => [campaign.campaignId, campaign]),
  );
  database.worksheets.CampaignProfiles = registry.campaigns.map((campaign) => ({
    campaignId: campaign.id,
    campaignName: campaign.campaignName,
    campaignCode: campaign.campaignCode,
    country: existingProfiles.get(campaign.id)?.country ?? "",
    preferredLanguages: campaign.preferredLanguages.join(", "),
    status: existingProfiles.get(campaign.id)?.status ?? "Active",
    createdAt: campaign.createdAt,
    updatedAt: campaign.updatedAt,
  }));
  database.worksheets.CampaignMemoryCards = registry.campaigns.flatMap((campaign) =>
    campaign.memoryCards.map((card) => ({
      cardId: card.id,
      campaignId: campaign.id,
      title: card.title,
      content: card.content,
      preferredLanguages: campaign.preferredLanguages.join(", "),
      createdAt: campaign.createdAt,
      updatedAt: campaign.updatedAt,
    })),
  );
  database.worksheets.ActiveCampaignCreators = registry.creatorRecords.map((record) => {
    const financials = calculateCreatorFinancials(record);
    return {
      recordId: record.id,
      campaignId: record.campaignRegistryId,
      creatorName: record.creatorName,
      creatorLink: record.creatorLink,
      avgViews: record.avgViews,
      internalQuote: record.internalQuote,
      externalQuote: record.externalQuote,
      cpm: financials.cpm,
      profit: financials.profit,
      profitMargin: financials.profitMargin,
      status: record.status,
      draftLink: record.draftLink,
      liveLink: record.liveLink,
      notes: record.notes,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  });
  saveAppDatabase(database);
}

export function createCampaign(campaignName: string, campaignCode: string): GlobalCampaign {
  const now = new Date().toISOString();
  return {
    id: createId("campaign"),
    campaignName: campaignName.trim(),
    campaignCode: campaignCode.trim().toUpperCase(),
    preferredLanguages: inferPreferredLanguages(campaignName),
    memoryCards: createDefaultMemoryCards(),
    createdAt: now,
    updatedAt: now,
  };
}

export function createCampaignMemoryCard(title = "New Memory", content = ""): CampaignMemoryCard {
  return {
    id: createId("memory-card"),
    title,
    content,
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
        preferredLanguages: ["Thai", "English"],
        memoryCards: createDefaultMemoryCards(),
        createdAt: now,
        updatedAt: now,
      },
      {
        id: createId("campaign"),
        campaignName: "Dola Philippines",
        campaignCode: "DOLA-PH",
        preferredLanguages: ["Filipino", "English"],
        memoryCards: createDefaultMemoryCards(),
        createdAt: now,
        updatedAt: now,
      },
      {
        id: createId("campaign"),
        campaignName: "Dola UK",
        campaignCode: "DOLA-UK",
        preferredLanguages: ["English"],
        memoryCards: createDefaultMemoryCards(),
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
          preferredLanguages: normalizePreferredLanguages(
            campaign.preferredLanguages,
            inferPreferredLanguages(name),
          ),
          memoryCards: normalizeMemoryCardsOrDefault(campaign.memoryCards),
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
    preferredLanguages: normalizePreferredLanguages(
      campaign.preferredLanguages,
      inferPreferredLanguages(name),
    ),
    memoryCards: normalizeMemoryCardsOrDefault(campaign.memoryCards),
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

function createDefaultMemoryCards(): CampaignMemoryCard[] {
  return [
    createCampaignMemoryCard("Deliverables", "1 TikTok video\n60-day ad code"),
    createCampaignMemoryCard("Talking Points", "Free\nAd-free\nUnlimited uploads"),
    createCampaignMemoryCard("Payment Terms", "Payment after posting"),
  ];
}

function inferPreferredLanguages(campaignName: string): CampaignMemoryLanguage[] {
  const value = campaignName.toLowerCase();
  if (value.includes("thai") || value.includes("thailand")) return ["Thai", "English"];
  if (value.includes("philippines") || value.includes("filipino")) {
    return ["Filipino", "English"];
  }
  if (value.includes("vietnam")) return ["Vietnamese", "English"];
  if (value.includes("indo")) return ["Indonesian", "English"];
  if (value.includes("korea")) return ["Korean", "English"];
  return ["English"];
}

function normalizePreferredLanguages(
  value: unknown,
  fallback: CampaignMemoryLanguage[],
): CampaignMemoryLanguage[] {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,|]/).map((item) => item.trim())
      : fallback;
  const normalized = source.filter((language): language is CampaignMemoryLanguage =>
    campaignMemoryLanguages.includes(language as CampaignMemoryLanguage),
  );
  return normalized.length ? normalized : fallback;
}

function normalizeMemoryCards(value: unknown): CampaignMemoryCard[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const card = isRecord(item) ? item : {};
      return {
        id: stringValue(card.id) || createId("memory-card"),
        title: stringValue(card.title) || "Memory",
        content: stringValue(card.content),
      };
    })
    .filter((card) => card.title.trim() || card.content.trim());
}

function normalizeMemoryCardsOrDefault(value: unknown): CampaignMemoryCard[] {
  const cards = normalizeMemoryCards(value);
  return cards.length ? cards : createDefaultMemoryCards();
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
