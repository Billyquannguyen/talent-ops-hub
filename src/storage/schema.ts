export const centralDatabaseName = "Katlas Buddy Database";

export const centralWorksheetNames = [
  "CampaignProfiles",
  "SourcingTemplates",
  "OutreachTemplates",
  "CampaignMemoryCards",
  "ActiveCampaignCreators",
  "PerformanceBenchmarks",
  "PerformanceWeeklyInputs",
  "AgencyDatabase",
  "CreatorDatabase",
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

export type PerformanceBenchmarkRecord = {
  benchmarkId: string;
  campaignId: string;
  includeInPerformance: string;
  teamSize: number;
  targetDailyOutreach: number;
  teamOutreachExcludingMe: number;
  teamSubmissionsExcludingMe: number;
  teamApprovalsExcludingMe: number;
  createdAt: string;
  updatedAt: string;
};

export type PerformanceWeeklyInputRecord = {
  inputId: string;
  month: string;
  weekStart: string;
  campaignId: string;
  myOutreachVolume: number;
  myCreatorSubmissions: number;
  myCreatorApprovals: number;
  myCampaignExecutions: number;
  expectedProfit: number;
  actualProfit: number;
  outreachScore: number;
  submissionScore: number;
  approvalScore: number;
  executionScore: number;
  weeklyScore: number;
  createdAt: string;
  updatedAt: string;
};

export type AgencyDatabaseRecord = {
  id: string;
  agencyName: string;
  contactName: string;
  contactRole: string;
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
    PerformanceBenchmarks: PerformanceBenchmarkRecord[];
    PerformanceWeeklyInputs: PerformanceWeeklyInputRecord[];
    AgencyDatabase: AgencyDatabaseRecord[];
    CreatorDatabase: CreatorDatabaseRecord[];
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
  PerformanceBenchmarks: [
    "benchmarkId",
    "campaignId",
    "includeInPerformance",
    "teamSize",
    "targetDailyOutreach",
    "teamOutreachExcludingMe",
    "teamSubmissionsExcludingMe",
    "teamApprovalsExcludingMe",
    "createdAt",
    "updatedAt",
  ],
  PerformanceWeeklyInputs: [
    "inputId",
    "month",
    "weekStart",
    "campaignId",
    "myOutreachVolume",
    "myCreatorSubmissions",
    "myCreatorApprovals",
    "myCampaignExecutions",
    "expectedProfit",
    "actualProfit",
    "outreachScore",
    "submissionScore",
    "approvalScore",
    "executionScore",
    "weeklyScore",
    "createdAt",
    "updatedAt",
  ],
  AgencyDatabase: [
    "id",
    "agencyName",
    "contactName",
    "contactRole",
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
  benchmarkId: ["id", "benchmark id", "benchmark_id"],
  includeInPerformance: ["include in performance", "include_in_performance", "performance enabled"],
  teamSize: ["team size", "team_size", "members", "number of members"],
  targetDailyOutreach: ["target daily outreach", "target outreach", "target_daily_outreach"],
  teamOutreachExcludingMe: ["team outreach excluding me", "team outreach"],
  teamSubmissionsExcludingMe: ["team submissions excluding me", "team submissions"],
  teamApprovalsExcludingMe: ["team approvals excluding me", "team approvals"],
  inputId: ["id", "input id", "input_id"],
  weekStart: ["week start", "week_start"],
  myOutreachVolume: ["my outreach volume", "my outreach"],
  myCreatorSubmissions: ["my creator submissions", "my submissions"],
  myCreatorApprovals: ["my creator approvals", "my approvals"],
  myCampaignExecutions: ["my campaign executions", "my executions"],
  expectedProfit: ["expected profit", "expected_profit"],
  actualProfit: ["actual profit", "actual_profit"],
  outreachScore: ["outreach score", "outreach_score"],
  submissionScore: ["submission score", "submission_score"],
  approvalScore: ["approval score", "approval_score"],
  executionScore: ["execution score", "execution_score"],
  weeklyScore: ["weekly score", "weekly_score", "snapshot score"],
  agencyName: ["agency name", "agency_name"],
  contactName: ["contact name", "contact_name"],
  contactRole: ["contact role", "role", "contact_role"],
  profileUrl: ["profile url", "url", "profile_url"],
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
      PerformanceBenchmarks: [],
      PerformanceWeeklyInputs: [],
      AgencyDatabase: [],
      CreatorDatabase: [],
      AppSettings: [],
    },
  };
}
