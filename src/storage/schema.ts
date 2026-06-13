export const centralDatabaseName = "Katlas Buddy Database";

export const centralWorksheetNames = [
  "CampaignProfiles",
  "SourcingTemplates",
  "OutreachTemplates",
  "CampaignMemoryCards",
  "ActiveCampaignCreators",
  "PerformanceBenchmarks",
  "PerformanceWeeklyInputs",
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
  templateId: string;
  campaignId: string;
  templateName: string;
  columnsJson: string;
  createdAt: string;
  updatedAt: string;
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
  targetDailyOutreach: number;
  teamOutreachExcludingMe: number;
  teamSubmissionsExcludingMe: number;
  teamApprovalsExcludingMe: number;
  createdAt: string;
  updatedAt: string;
};

export type PerformanceWeeklyInputRecord = {
  inputId: string;
  weekStart: string;
  campaignId: string;
  myOutreachVolume: number;
  myCreatorSubmissions: number;
  myCreatorApprovals: number;
  myCampaignExecutions: number;
  expectedProfit: number;
  actualProfit: number;
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
    "templateId",
    "campaignId",
    "templateName",
    "columnsJson",
    "createdAt",
    "updatedAt",
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
    "targetDailyOutreach",
    "teamOutreachExcludingMe",
    "teamSubmissionsExcludingMe",
    "teamApprovalsExcludingMe",
    "createdAt",
    "updatedAt",
  ],
  PerformanceWeeklyInputs: [
    "inputId",
    "weekStart",
    "campaignId",
    "myOutreachVolume",
    "myCreatorSubmissions",
    "myCreatorApprovals",
    "myCampaignExecutions",
    "expectedProfit",
    "actualProfit",
    "createdAt",
    "updatedAt",
  ],
  AppSettings: ["settingKey", "settingValue", "updatedAt"],
};

export const worksheetHeaderAliases: Partial<Record<string, string[]>> = {
  campaignId: ["id", "campaign id", "campaign_id"],
  campaignName: ["campaign name", "name", "campaign_name"],
  campaignCode: ["campaign code", "campaign id code", "campaign_code"],
  templateId: ["id", "template id", "template_id"],
  templateName: ["template name", "name", "template_name"],
  columnsJson: ["columns", "columns json", "columns_json"],
  cardId: ["id", "card id", "card_id"],
  recordId: ["id", "record id", "record_id"],
  creatorName: ["creator", "creator name", "creator_name"],
  creatorLink: ["creator link", "profile url", "url", "creator_link"],
  avgViews: ["avg views", "average views", "avg_views"],
  internalQuote: ["internal quote", "cost", "internal_quote"],
  externalQuote: ["external quote", "price", "external_quote"],
  profitMargin: ["profit margin", "margin", "profit_margin"],
  benchmarkId: ["id", "benchmark id", "benchmark_id"],
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
      AppSettings: [],
    },
  };
}
