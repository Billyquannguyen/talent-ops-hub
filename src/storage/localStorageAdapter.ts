import {
  createEmptyCentralDatabase,
  type ActiveCampaignCreatorRecord,
  type AgencyDatabaseRecord,
  type AppSettingRecord,
  type CampaignMemoryCardRecord,
  type CampaignPromptVaultRecord,
  type CampaignProfileRecord,
  type CentralAppDatabase,
  type CreatorDatabaseRecord,
  type EmployeeProfileRecord,
  type OutreachTemplateRecord,
  type SourcingTemplateRecord,
  type StorageDiagnostic,
} from "./schema";

export const centralLocalStorageKey = "katlas-buddy-central-database-v1";

const legacyCampaignRegistryStorageKey = "katlas-global-campaign-registry-v1";
const legacySourcingStorageKey = "katlas-creator-sourcing-projects-v1";
const legacyOutreachStorageKey = "katlas-buddy-database-v1";

export type LocalStorageLoadResult = {
  database: CentralAppDatabase;
  diagnostics: StorageDiagnostic[];
};

export function loadCentralDatabaseFromLocalStorage(): LocalStorageLoadResult {
  if (typeof window === "undefined") {
    return {
      database: createEmptyCentralDatabase(),
      diagnostics: [
        {
          level: "info",
          message: "localStorage is unavailable during server rendering.",
        },
      ],
    };
  }

  const raw = window.localStorage.getItem(centralLocalStorageKey);
  if (raw) {
    try {
      return {
        database: normalizeCentralDatabase(JSON.parse(raw)),
        diagnostics: [
          {
            level: "info",
            message: "Loaded Katlas Buddy Database from localStorage fallback.",
          },
        ],
      };
    } catch {
      return createLegacyFallback("Central localStorage data was unreadable. Loaded legacy data.");
    }
  }

  return createLegacyFallback("Central localStorage database not found. Loaded legacy data.");
}

export function saveCentralDatabaseToLocalStorage(database: CentralAppDatabase) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    centralLocalStorageKey,
    JSON.stringify(normalizeCentralDatabase(database)),
  );
}

function createLegacyFallback(message: string): LocalStorageLoadResult {
  const database = createEmptyCentralDatabase();
  const now = new Date().toISOString();

  mergeLegacyCampaignRegistry(database, now);
  mergeLegacySourcingTemplates(database, now);
  mergeLegacyOutreachTemplates(database, now);

  return {
    database: normalizeCentralDatabase(database),
    diagnostics: [
      {
        level: "warning",
        message,
      },
    ],
  };
}

function mergeLegacyCampaignRegistry(database: CentralAppDatabase, now: string) {
  const legacy = readJson(legacyCampaignRegistryStorageKey);
  const registry = isRecord(legacy) ? legacy : {};
  const campaigns = Array.isArray(registry.campaigns) ? registry.campaigns : [];
  const creatorRecords = Array.isArray(registry.creatorRecords) ? registry.creatorRecords : [];

  for (const value of campaigns) {
    const campaign = isRecord(value) ? value : {};
    const campaignId = stringValue(campaign.id) || createId("campaign");
    const campaignName = stringValue(campaign.campaignName) || stringValue(campaign.name);
    if (!campaignName.trim()) continue;
    const createdAt = stringValue(campaign.createdAt) || now;
    const updatedAt = stringValue(campaign.updatedAt) || createdAt;
    const preferredLanguages = normalizeStringList(campaign.preferredLanguages);

    database.worksheets.CampaignProfiles.push({
      campaignId,
      campaignName,
      campaignCode:
        stringValue(campaign.campaignCode) ||
        stringValue(campaign.campaignId) ||
        createCampaignCode(campaignName),
      country: stringValue(campaign.country),
      preferredLanguages: preferredLanguages.join(", "),
      status: stringValue(campaign.status) || "Active",
      createdAt,
      updatedAt,
    });

    const memoryCards = Array.isArray(campaign.memoryCards) ? campaign.memoryCards : [];
    for (const cardValue of memoryCards) {
      const card = isRecord(cardValue) ? cardValue : {};
      const title = stringValue(card.title);
      const content = stringValue(card.content);
      if (!title.trim() && !content.trim()) continue;
      database.worksheets.CampaignMemoryCards.push({
        cardId: stringValue(card.id) || createId("memory-card"),
        campaignId,
        title: title || "Memory",
        content,
        preferredLanguages: preferredLanguages.join(", "),
        createdAt,
        updatedAt,
      });
    }
  }

  for (const value of creatorRecords) {
    const record = isRecord(value) ? value : {};
    const campaignId = stringValue(record.campaignRegistryId) || stringValue(record.campaignId);
    if (!campaignId.trim()) continue;
    const avgViews = numberValue(record.avgViews);
    const internalQuote = numberValue(record.internalQuote);
    const externalQuote = numberValue(record.externalQuote);
    const profit = externalQuote - internalQuote;
    const profitMargin = externalQuote > 0 ? profit / externalQuote : 0;
    const createdAt = stringValue(record.createdAt) || now;
    const updatedAt = stringValue(record.updatedAt) || createdAt;

    database.worksheets.ActiveCampaignCreators.push({
      recordId: stringValue(record.id) || createId("creator"),
      campaignId,
      month: stringValue(record.month) || String(updatedAt).slice(0, 7),
      creatorName: stringValue(record.creatorName),
      creatorLink: stringValue(record.creatorLink),
      avgViews,
      internalQuote,
      externalQuote,
      cpm: avgViews > 0 ? externalQuote / avgViews : 0,
      profit,
      profitMargin,
      status: stringValue(record.status) || "Contract Signed",
      draftLink: stringValue(record.draftLink),
      liveLink: stringValue(record.liveLink),
      notes: stringValue(record.notes),
      createdAt,
      updatedAt,
    });
  }
}

function mergeLegacySourcingTemplates(database: CentralAppDatabase, now: string) {
  const projects = readJson(legacySourcingStorageKey);
  if (!Array.isArray(projects)) return;

  for (const value of projects) {
    const project = isRecord(value) ? value : {};
    const campaignName = stringValue(project.name);
    if (!campaignName.trim()) continue;
    const campaignId = stringValue(project.id) || createId("campaign");
    ensureCampaign(database, {
      campaignId,
      campaignName,
      campaignCode: createCampaignCode(campaignName),
      country: "",
      preferredLanguages: "",
      status: "Active",
      createdAt: stringValue(project.createdAt) || now,
      updatedAt: stringValue(project.templateSavedAt) || now,
    });

    const columns = Array.isArray(project.template) ? project.template : [];
    if (!columns.length) continue;
    database.worksheets.SourcingTemplates.push({
      id: createId("sourcing-template"),
      campaignId,
      campaignName,
      templateName: "Default Template",
      columnsJson: JSON.stringify(columns),
      isActive: "TRUE",
      createdAt: stringValue(project.createdAt) || now,
      updatedAt: stringValue(project.templateSavedAt) || now,
      createdBy: "",
      updatedBy: "",
    });

    upsertSetting(
      database,
      `sourcing.filters.${campaignId}`,
      JSON.stringify(project.filters ?? {}),
      now,
    );
  }
}

function mergeLegacyOutreachTemplates(database: CentralAppDatabase, now: string) {
  const legacy = readJson(legacyOutreachStorageKey);
  const worksheets = isRecord(legacy) && isRecord(legacy.worksheets) ? legacy.worksheets : {};
  const templates = Array.isArray(worksheets.Templates) ? worksheets.Templates : [];

  for (const value of templates) {
    const template = isRecord(value) ? value : {};
    const body = stringValue(template.body);
    if (!body.trim()) continue;
    const type = stringValue(template.channelType) === "Email" ? "Email" : "DM";
    const createdAt = stringValue(template.createdAt) || now;
    database.worksheets.OutreachTemplates.push({
      templateId: stringValue(template.id) || createId("outreach-template"),
      templateName:
        stringValue(template.templateName) ||
        stringValue(template.template_name) ||
        stringValue(template.name) ||
        "Outreach Template",
      type,
      body,
      createdAt,
      updatedAt: stringValue(template.updatedAt) || createdAt,
    });
  }
}

function normalizeCentralDatabase(value: unknown): CentralAppDatabase {
  const source = isRecord(value) ? value : {};
  const worksheets = isRecord(source.worksheets) ? source.worksheets : {};

  return {
    databaseName: "Katlas Buddy Database",
    worksheets: {
      CampaignProfiles: normalizeArray(worksheets.CampaignProfiles, normalizeCampaignProfile),
      SourcingTemplates: normalizeArray(worksheets.SourcingTemplates, normalizeSourcingTemplate),
      OutreachTemplates: normalizeArray(worksheets.OutreachTemplates, normalizeOutreachTemplate),
      CampaignMemoryCards: normalizeArray(worksheets.CampaignMemoryCards, normalizeMemoryCard),
      ActiveCampaignCreators: normalizeArray(
        worksheets.ActiveCampaignCreators,
        normalizeActiveCampaignCreator,
      ),
      AgencyDatabase: normalizeArray(worksheets.AgencyDatabase, normalizeAgencyDatabaseRecord),
      CreatorDatabase: normalizeArray(worksheets.CreatorDatabase, normalizeCreatorDatabaseRecord),
      EmployeeProfiles: normalizeArray(worksheets.EmployeeProfiles, normalizeEmployeeProfileRecord),
      CampaignPromptVault: normalizeArray(
        worksheets.CampaignPromptVault,
        normalizeCampaignPromptVaultRecord,
      ),
      AppSettings: normalizeArray(worksheets.AppSettings, normalizeAppSetting),
    },
  };
}

function normalizeCampaignProfile(value: unknown): CampaignProfileRecord {
  const row = isRecord(value) ? value : {};
  const now = new Date().toISOString();
  const campaignName = stringValue(row.campaignName) || "Untitled Campaign";
  const createdAt = stringValue(row.createdAt) || now;
  return {
    campaignId: stringValue(row.campaignId) || stringValue(row.id) || createId("campaign"),
    campaignName,
    campaignCode: stringValue(row.campaignCode) || createCampaignCode(campaignName),
    country: stringValue(row.country),
    preferredLanguages: stringValue(row.preferredLanguages),
    status: stringValue(row.status) || "Active",
    createdAt,
    updatedAt: stringValue(row.updatedAt) || createdAt,
  };
}

function normalizeSourcingTemplate(value: unknown): SourcingTemplateRecord {
  const row = isRecord(value) ? value : {};
  const now = new Date().toISOString();
  const createdAt = stringValue(row.createdAt) || now;
  return {
    id: stringValue(row.id) || stringValue(row.templateId) || createId("sourcing-template"),
    campaignId: stringValue(row.campaignId),
    campaignName: stringValue(row.campaignName),
    templateName: stringValue(row.templateName) || "Default Template",
    columnsJson: stringValue(row.columnsJson) || "[]",
    isActive: stringValue(row.isActive) || "TRUE",
    createdAt,
    updatedAt: stringValue(row.updatedAt) || createdAt,
    createdBy: stringValue(row.createdBy),
    updatedBy: stringValue(row.updatedBy),
  };
}

function normalizeOutreachTemplate(value: unknown): OutreachTemplateRecord {
  const row = isRecord(value) ? value : {};
  const now = new Date().toISOString();
  const createdAt = stringValue(row.createdAt) || now;
  return {
    templateId: stringValue(row.templateId) || stringValue(row.id) || createId("outreach-template"),
    templateName: stringValue(row.templateName) || "Outreach Template",
    type: stringValue(row.type) === "Email" ? "Email" : "DM",
    body: stringValue(row.body),
    createdAt,
    updatedAt: stringValue(row.updatedAt) || createdAt,
  };
}

function normalizeMemoryCard(value: unknown): CampaignMemoryCardRecord {
  const row = isRecord(value) ? value : {};
  const now = new Date().toISOString();
  const createdAt = stringValue(row.createdAt) || now;
  return {
    cardId: stringValue(row.cardId) || stringValue(row.id) || createId("memory-card"),
    campaignId: stringValue(row.campaignId),
    title: stringValue(row.title) || "Memory",
    content: stringValue(row.content),
    preferredLanguages: stringValue(row.preferredLanguages),
    createdAt,
    updatedAt: stringValue(row.updatedAt) || createdAt,
  };
}

function normalizeCampaignPromptVaultRecord(value: unknown): CampaignPromptVaultRecord {
  const row = isRecord(value) ? value : {};
  const now = new Date().toISOString();
  const createdAt = stringValue(row.createdAt) || now;
  return {
    promptId: stringValue(row.promptId) || stringValue(row.id) || createId("prompt"),
    campaignId: stringValue(row.campaignId),
    campaignName: stringValue(row.campaignName),
    category: stringValue(row.category) || "Custom",
    title: stringValue(row.title) || "Untitled Prompt",
    content: stringValue(row.content),
    input: stringValue(row.input),
    files: stringValue(row.files) || stringValue(row.notes),
    createdAt,
    updatedAt: stringValue(row.updatedAt) || createdAt,
  };
}

function normalizeActiveCampaignCreator(value: unknown): ActiveCampaignCreatorRecord {
  const row = isRecord(value) ? value : {};
  const now = new Date().toISOString();
  const createdAt = stringValue(row.createdAt) || now;
  const avgViews = numberValue(row.avgViews);
  const internalQuote = numberValue(row.internalQuote);
  const externalQuote = numberValue(row.externalQuote);
  const profit = externalQuote - internalQuote;
  return {
    recordId: stringValue(row.recordId) || stringValue(row.id) || createId("creator"),
    campaignId: stringValue(row.campaignId),
    month: stringValue(row.month) || createdAt.slice(0, 7),
    creatorName: stringValue(row.creatorName),
    creatorLink: stringValue(row.creatorLink),
    avgViews,
    internalQuote,
    externalQuote,
    cpm: avgViews > 0 ? externalQuote / avgViews : numberValue(row.cpm),
    profit,
    profitMargin: externalQuote > 0 ? profit / externalQuote : numberValue(row.profitMargin),
    status: stringValue(row.status) || "Contract Signed",
    draftLink: stringValue(row.draftLink),
    liveLink: stringValue(row.liveLink),
    notes: stringValue(row.notes),
    createdAt,
    updatedAt: stringValue(row.updatedAt) || createdAt,
  };
}

function normalizeAgencyDatabaseRecord(value: unknown): AgencyDatabaseRecord {
  const row = isRecord(value) ? value : {};
  const now = new Date().toISOString();
  const createdAt = stringValue(row.createdAt) || now;
  return {
    id: stringValue(row.id) || createId("agency"),
    agencyName: stringValue(row.agencyName),
    contactName: stringValue(row.contactName),
    contactRole: stringValue(row.contactRole),
    contact: stringValue(row.contact),
    contactsJson: stringValue(row.contactsJson),
    email: stringValue(row.email),
    line: stringValue(row.line),
    instagram: stringValue(row.instagram),
    website: stringValue(row.website),
    country: stringValue(row.country),
    niche: stringValue(row.niche),
    notes: stringValue(row.notes),
    status: normalizeDatabaseStatus(row.status),
    createdAt,
    updatedAt: stringValue(row.updatedAt) || createdAt,
  };
}

function normalizeCreatorDatabaseRecord(value: unknown): CreatorDatabaseRecord {
  const row = isRecord(value) ? value : {};
  const now = new Date().toISOString();
  const createdAt = stringValue(row.createdAt) || now;
  return {
    id: stringValue(row.id) || createId("creator-db"),
    creatorName: stringValue(row.creatorName),
    handle: stringValue(row.handle),
    platform: stringValue(row.platform),
    profileUrl: stringValue(row.profileUrl),
    country: stringValue(row.country),
    language: stringValue(row.language),
    niche: stringValue(row.niche),
    followers: numberValue(row.followers),
    avgViews: numberValue(row.avgViews),
    email: stringValue(row.email),
    line: stringValue(row.line),
    instagram: stringValue(row.instagram),
    whatsapp: stringValue(row.whatsapp),
    agencyName: stringValue(row.agencyName),
    notes: stringValue(row.notes),
    status: normalizeDatabaseStatus(row.status),
    createdAt,
    updatedAt: stringValue(row.updatedAt) || createdAt,
  };
}

function normalizeEmployeeProfileRecord(value: unknown): EmployeeProfileRecord {
  const row = isRecord(value) ? value : {};
  const now = new Date().toISOString();
  const createdAt = stringValue(row.createdAt) || now;
  return {
    profileId: stringValue(row.profileId) || stringValue(row.id) || "employee-profile-default",
    displayName: stringValue(row.displayName),
    avatarUrl: stringValue(row.avatarUrl),
    joiningDate: stringValue(row.joiningDate),
    monthlySalary: numberValue(row.monthlySalary),
    currency: stringValue(row.currency) || "USD",
    notes: stringValue(row.notes),
    accountsJson: stringValue(row.accountsJson),
    createdAt,
    updatedAt: stringValue(row.updatedAt) || createdAt,
  };
}

function normalizeAppSetting(value: unknown): AppSettingRecord {
  const row = isRecord(value) ? value : {};
  return {
    settingKey: stringValue(row.settingKey),
    settingValue: stringValue(row.settingValue),
    updatedAt: stringValue(row.updatedAt) || new Date().toISOString(),
  };
}

function ensureCampaign(database: CentralAppDatabase, campaign: CampaignProfileRecord) {
  if (
    database.worksheets.CampaignProfiles.some((item) => item.campaignId === campaign.campaignId)
  ) {
    return;
  }
  database.worksheets.CampaignProfiles.push(campaign);
}

function upsertSetting(
  database: CentralAppDatabase,
  settingKey: string,
  settingValue: string,
  updatedAt: string,
) {
  const existing = database.worksheets.AppSettings.find(
    (setting) => setting.settingKey === settingKey,
  );
  if (existing) {
    existing.settingValue = settingValue;
    existing.updatedAt = updatedAt;
    return;
  }
  database.worksheets.AppSettings.push({ settingKey, settingValue, updatedAt });
}

function normalizeArray<T>(value: unknown, normalize: (item: unknown) => T): T[] {
  return Array.isArray(value) ? value.map(normalize) : [];
}

function readJson(key: string): unknown {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value))
    return value
      .map(String)
      .map((item) => item.trim())
      .filter(Boolean);
  return stringValue(value)
    .split(/[,|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeDatabaseStatus(value: unknown) {
  const status = stringValue(value).toLowerCase();
  return ["potential", "contacted", "interested", "rejected", "saved"].includes(status)
    ? status
    : "potential";
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

function normalizeBooleanString(value: unknown, fallback: boolean): string {
  const normalized = stringValue(value).trim().toLowerCase();
  if (["true", "yes", "1", "include", "included"].includes(normalized)) return "TRUE";
  if (["false", "no", "0", "exclude", "excluded", "disabled"].includes(normalized)) {
    return "FALSE";
  }
  return fallback ? "TRUE" : "FALSE";
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
