import {
  createActiveCampaignCreatorInGoogleSheetsOnly,
  deleteActiveCampaignCreatorFromGoogleSheetsOnly,
  listCampaignProfilesFromGoogleSheetsOnly,
  loadActiveCampaignsBundleFromGoogleSheetsOnly,
  loadAppDatabase,
  listActiveCampaignCreatorsFromGoogleSheetsOnly,
  listCampaignMemoryCardsFromGoogleSheetsOnly,
  replaceCampaignMemoryCardsForCampaignInGoogleSheetsOnly,
  saveAppDatabase,
  updateActiveCampaignCreatorInGoogleSheetsOnly,
} from "@/storage/appRepository";
import type {
  ActiveCampaignCreatorRecord,
  CampaignMemoryCardRecord,
  CentralAppDatabase,
} from "@/storage/schema";

export const selectedCreatorStatuses = [
  "Contract signed",
  "Script",
  "Draft",
  "Posted",
  "Fully paid",
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
  month: string;
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
  script: number;
  draft: number;
  posted: number;
  paymentPending: number;
  fullyPaid: number;
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
    const registry = databaseToCampaignRegistry(database);

    if (!registry.campaigns.length) return loadLegacyCampaignRegistry() ?? registry;
    return registry;
  } catch {
    return loadLegacyCampaignRegistry() ?? { campaigns: [], creatorRecords: [] };
  }
}

export async function loadCampaignRegistryFromGoogleSheetsOnly(options: { reason?: string } = {}) {
  console.info("[CampaignRegistry]", "load-targeted", {
    reason: options.reason ?? "loadCampaignRegistryFromGoogleSheetsOnly",
    at: new Date().toISOString(),
  });
  const [campaignProfiles, memoryResult, creatorResult] = await Promise.all([
    listCampaignProfilesFromGoogleSheetsOnly(),
    listCampaignMemoryCardsFromGoogleSheetsOnly(),
    listActiveCampaignCreatorsFromGoogleSheetsOnly(),
  ]);
  const database = loadAppDatabase();
  database.worksheets.CampaignProfiles = campaignProfiles;
  database.worksheets.CampaignMemoryCards = memoryResult.records;
  database.worksheets.ActiveCampaignCreators = creatorResult.records;
  return databaseToCampaignRegistry(database);
}

export async function loadActiveCampaignRegistryFromGoogleSheetsOnly(
  options: { reason?: string } = {},
) {
  console.info("[CampaignRegistry]", "load-active-campaigns-bundle", {
    reason: options.reason ?? "loadActiveCampaignRegistryFromGoogleSheetsOnly",
    at: new Date().toISOString(),
  });
  const bundle = await loadActiveCampaignsBundleFromGoogleSheetsOnly();
  const database = loadAppDatabase();
  database.worksheets.CampaignProfiles = bundle.campaignProfiles;
  database.worksheets.ActiveCampaignCreators = bundle.activeCampaignCreators;
  return databaseToCampaignRegistry(database);
}

export async function saveCampaignMemoryForCampaign(
  campaign: GlobalCampaign,
): Promise<GlobalCampaignRegistry> {
  const preferredLanguages = campaign.preferredLanguages.join(", ");
  const now = new Date().toISOString();
  const records = campaign.memoryCards
    .filter((card) => card.title.trim() || card.content.trim())
    .map(
      (card, index): CampaignMemoryCardRecord => ({
        cardId: card.id,
        campaignId: campaign.id,
        title: card.title.trim() || `Smart Field ${index + 1}`,
        content: card.content,
        preferredLanguages,
        createdAt: campaign.createdAt || now,
        updatedAt: now,
      }),
    );

  await replaceCampaignMemoryCardsForCampaignInGoogleSheetsOnly({
    campaignId: campaign.id,
    preferredLanguages,
    records,
  });

  return loadCampaignRegistry();
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
  saveAppDatabase(database);
}

export async function loadActiveCampaignCreatorsFromGoogleSheetsOnly(): Promise<
  SelectedCreatorRecord[]
> {
  const result = await listActiveCampaignCreatorsFromGoogleSheetsOnly();
  return activeCampaignCreatorRecordsToSelectedCreatorRecords(result.records);
}

export async function saveSelectedCreatorRecordToGoogleSheets(
  record: SelectedCreatorRecord,
): Promise<SelectedCreatorRecord[]> {
  const storageRecord = selectedCreatorRecordToStorageRecord(record);
  const records = await createActiveCampaignCreatorInGoogleSheetsOnly(storageRecord);
  return activeCampaignCreatorRecordsToSelectedCreatorRecords(records);
}

export async function updateSelectedCreatorRecordInGoogleSheets(
  record: SelectedCreatorRecord,
): Promise<SelectedCreatorRecord[]> {
  const storageRecord = selectedCreatorRecordToStorageRecord(record);
  const records = await updateActiveCampaignCreatorInGoogleSheetsOnly(storageRecord);
  return activeCampaignCreatorRecordsToSelectedCreatorRecords(records);
}

export async function deleteSelectedCreatorRecordFromGoogleSheets(
  recordId: string,
): Promise<SelectedCreatorRecord[]> {
  const records = await deleteActiveCampaignCreatorFromGoogleSheetsOnly(recordId);
  return activeCampaignCreatorRecordsToSelectedCreatorRecords(records);
}

export function selectedCreatorRecordToStorageRecord(
  record: SelectedCreatorRecord,
): ActiveCampaignCreatorRecord {
  const financials = calculateCreatorFinancials(record);
  return {
    recordId: record.id,
    campaignId: record.campaignRegistryId,
    month: record.month,
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
}

function activeCampaignCreatorRecordsToSelectedCreatorRecords(
  records: ActiveCampaignCreatorRecord[],
): SelectedCreatorRecord[] {
  return records.map((record) =>
    normalizeCreatorRecord({
      id: record.recordId,
      campaignRegistryId: record.campaignId,
      month: record.month,
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
  );
}

function databaseToCampaignRegistry(database: CentralAppDatabase): GlobalCampaignRegistry {
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
      month: record.month,
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

  return { campaigns, creatorRecords };
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
    month: getCurrentMonthValue(),
    creatorName: "",
    creatorLink: "",
    avgViews: 0,
    internalQuote: 0,
    externalQuote: 0,
    status: "Contract signed",
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
  const contractSigned = count("Contract signed");
  const script = count("Script");
  const draft = count("Draft");
  const posted = count("Posted");
  const fullyPaid = count("Fully paid");
  const paymentPending = posted;

  return {
    totalCreators: records.length,
    contractSigned,
    script,
    draft,
    posted,
    paymentPending,
    fullyPaid,
    totalSpend,
    totalExternalQuote,
    totalProfit,
    averageMargin,
    statusSummary: buildStatusSummary({
      contractSigned,
      script,
      draft,
      posted,
      fullyPaid,
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
    month: stringValue(record.month) || createdAt.slice(0, 7),
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
    ["Fully paid", counts.fullyPaid],
    ["Posted", counts.posted],
    ["Draft", counts.draft],
    ["Script", counts.script],
    ["Contract signed", counts.contractSigned],
  ].filter(([, count]) => Number(count) > 0);

  if (!visible.length) return "No selected creators";
  return visible
    .slice(0, 3)
    .map(([label, count]) => `${count} ${label}`)
    .join(", ");
}

function normalizeStatus(value: unknown): SelectedCreatorStatus {
  if (selectedCreatorStatuses.includes(value as SelectedCreatorStatus)) {
    return value as SelectedCreatorStatus;
  }

  const status = stringValue(value).toLowerCase();
  if (status.includes("paid") || status.includes("payment")) return "Fully paid";
  if (status.includes("posted") || status.includes("live") || status.includes("completed")) {
    return "Posted";
  }
  if (status.includes("draft")) return "Draft";
  if (status.includes("script")) return "Script";
  return "Contract signed";
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

function getCurrentMonthValue(): string {
  return new Date().toISOString().slice(0, 7);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
