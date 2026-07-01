export const centralDatabaseName = "Katlas Buddy Database";

export const centralWorksheetNames = [
  "CampaignProfiles",
  "SourcingTemplates",
  "OutreachTemplates",
  "CampaignMemoryCards",
  "ActiveCampaignCreators",
  "AgencyDatabase",
  "CreatorDatabase",
  "EmployeeProfiles",
  "CampaignPromptVault",
  "AppSettings",
] as const;

export type CentralWorksheetName = (typeof centralWorksheetNames)[number];

export type CampaignProfileRecord = {
  campaignId: string;
  campaignName: string;
  campaignCode: string;
  country: string;
  preferredLanguages: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type SourcingTemplateRecord = {
  id: string;
  campaignId: string;
  campaignName: string;
  templateName: string;
  columnsJson: string;
  isActive: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

export type OutreachTemplateRecord = {
  templateId: string;
  templateName: string;
  type: "DM" | "Email";
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type CampaignMemoryCardRecord = {
  cardId: string;
  campaignId: string;
  title: string;
  content: string;
  preferredLanguages: string;
  createdAt: string;
  updatedAt: string;
};

export type ActiveCampaignCreatorRecord = {
  recordId: string;
  campaignId: string;
  month: string;
  creatorName: string;
  creatorLink: string;
  avgViews: number;
  internalQuote: number;
  externalQuote: number;
  cpm: number;
  profit: number;
  profitMargin: number;
  status: string;
  draftLink: string;
  liveLink: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type AgencyDatabaseRecord = {
  id: string;
  agencyName: string;
  contactName: string;
  contactRole: string;
  contact: string;
  contactsJson: string;
  email: string;
  line: string;
  instagram: string;
  website: string;
  country: string;
  niche: string;
  notes: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type CreatorDatabaseRecord = {
  id: string;
  creatorName: string;
  handle: string;
  platform: string;
  profileUrl: string;
  country: string;
  language: string;
  niche: string;
  followers: number;
  avgViews: number;
  email: string;
  line: string;
  instagram: string;
  whatsapp: string;
  agencyName: string;
  notes: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type EmployeeProfileRecord = {
  profileId: string;
  displayName: string;
  avatarUrl: string;
  joiningDate: string;
  monthlySalary: number;
  currency: string;
  notes: string;
  accountsJson: string;
  createdAt: string;
  updatedAt: string;
};

export type CampaignPromptVaultRecord = {
  promptId: string;
  campaignId: string;
  campaignName: string;
  category: string;
  title: string;
  content: string;
  input: string;
  files: string;
  createdAt: string;
  updatedAt: string;
};

export type AppSettingRecord = {
  settingKey: string;
  settingValue: string;
  updatedAt: string;
};

export type CentralAppDatabase = {
  databaseName: typeof centralDatabaseName;
  worksheets: {
    CampaignProfiles: CampaignProfileRecord[];
    SourcingTemplates: SourcingTemplateRecord[];
    OutreachTemplates: OutreachTemplateRecord[];
    CampaignMemoryCards: CampaignMemoryCardRecord[];
    ActiveCampaignCreators: ActiveCampaignCreatorRecord[];
    AgencyDatabase: AgencyDatabaseRecord[];
    CreatorDatabase: CreatorDatabaseRecord[];
    EmployeeProfiles: EmployeeProfileRecord[];
    CampaignPromptVault: CampaignPromptVaultRecord[];
    AppSettings: AppSettingRecord[];
  };
};

export type StorageDiagnostic = {
  level: "info" | "warning" | "error";
  worksheet?: CentralWorksheetName;
  message: string;
  missingHeaders?: string[];
};

export type StorageStatus = {
  source: "localStorage" | "googleSheets";
  shared: boolean;
  configured: boolean;
  diagnostics: StorageDiagnostic[];
};

export const requiredWorksheetHeaders: Record<CentralWorksheetName, string[]> = {
  CampaignProfiles: [
    "campaignId",
    "campaignName",
    "campaignCode",
    "country",
    "preferredLanguages",
    "status",
    "createdAt",
    "updatedAt",
  ],
  SourcingTemplates: [
    "id",
    "campaignId",
    "campaignName",
    "templateName",
    "columnsJson",
    "isActive",
    "createdAt",
    "updatedAt",
    "createdBy",
    "updatedBy",
  ],
  OutreachTemplates: ["templateId", "templateName", "type", "body", "createdAt", "updatedAt"],
  CampaignMemoryCards: [
    "cardId",
    "campaignId",
    "title",
    "content",
    "preferredLanguages",
    "createdAt",
    "updatedAt",
  ],
  ActiveCampaignCreators: [
    "recordId",
    "campaignId",
    "month",
    "creatorName",
    "creatorLink",
    "avgViews",
    "internalQuote",
    "externalQuote",
    "cpm",
    "profit",
    "profitMargin",
    "status",
    "draftLink",
    "liveLink",
    "notes",
    "createdAt",
    "updatedAt",
  ],
  AgencyDatabase: [
    "id",
    "agencyName",
    "contactName",
    "contactRole",
    "contact",
    "contactsJson",
    "email",
    "line",
    "instagram",
    "website",
    "country",
    "niche",
    "notes",
    "status",
    "createdAt",
    "updatedAt",
  ],
  CreatorDatabase: [
    "id",
    "creatorName",
    "handle",
    "platform",
    "profileUrl",
    "country",
    "language",
    "niche",
    "followers",
    "avgViews",
    "email",
    "line",
    "instagram",
    "whatsapp",
    "agencyName",
    "notes",
    "status",
    "createdAt",
    "updatedAt",
  ],
  EmployeeProfiles: [
    "profileId",
    "displayName",
    "avatarUrl",
    "joiningDate",
    "monthlySalary",
    "currency",
    "notes",
    "accountsJson",
    "createdAt",
    "updatedAt",
  ],
  CampaignPromptVault: [
    "promptId",
    "campaignId",
    "campaignName",
    "category",
    "title",
    "content",
    "input",
    "files",
    "createdAt",
    "updatedAt",
  ],
  AppSettings: ["settingKey", "settingValue", "updatedAt"],
};

export const worksheetHeaderAliases: Partial<Record<string, string[]>> = {
  campaignId: ["id", "campaign id", "campaign_id"],
  month: ["month", "campaign month", "performance month"],
  campaignName: ["campaign name", "name", "campaign_name"],
  campaignCode: ["campaign code", "campaign id code", "campaign_code"],
  id: ["templateId", "template id", "template_id"],
  templateName: ["template name", "name", "template_name"],
  columnsJson: ["columns", "columns json", "columns_json"],
  isActive: ["active", "is active", "is_active", "status"],
  createdBy: ["created by", "created_by"],
  updatedBy: ["updated by", "updated_by"],
  cardId: ["id", "card id", "card_id"],
  recordId: ["id", "record id", "record_id"],
  creatorName: ["creator", "creator name", "creator_name"],
  creatorLink: ["creator link", "profile url", "url", "creator_link"],
  avgViews: ["avg views", "average views", "avg_views"],
  internalQuote: ["internal quote", "cost", "internal_quote"],
  externalQuote: ["external quote", "price", "external_quote"],
  profitMargin: ["profit margin", "margin", "profit_margin"],
  agencyName: ["agency name", "agency_name"],
  contactName: ["contact name", "contact_name"],
  contactRole: ["contact role", "role", "contact_role"],
  contact: ["contact info", "contact", "contact_info"],
  contactsJson: ["contacts json", "contacts", "contacts_json"],
  profileUrl: ["profile url", "url", "profile_url"],
  profileId: ["profile id", "profile_id", "id"],
  promptId: ["prompt id", "prompt_id", "id"],
  input: ["input", "prompt input", "source input", "attachment input", "context input"],
  files: ["files", "file links", "attachments", "attachment", "notes"],
  displayName: ["display name", "name", "display_name"],
  avatarUrl: ["avatar url", "avatar", "avatar_url"],
  monthlySalary: ["monthly salary", "salary", "monthly_salary"],
  settingKey: ["setting key", "key", "setting_key"],
  settingValue: ["setting value", "value", "setting_value"],
};

export function createEmptyCentralDatabase(): CentralAppDatabase {
  return {
    databaseName: centralDatabaseName,
    worksheets: {
      CampaignProfiles: [],
      SourcingTemplates: [],
      OutreachTemplates: [],
      CampaignMemoryCards: [],
      ActiveCampaignCreators: [],
      AgencyDatabase: [],
      CreatorDatabase: [],
      EmployeeProfiles: [],
      CampaignPromptVault: [],
      AppSettings: [],
    },
  };
}
