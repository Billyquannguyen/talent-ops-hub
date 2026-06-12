export const katlasBuddyDatabaseName = "Katlas Buddy Database";

export const katlasBuddyWorksheetNames = [
  "Templates",
  "Projects",
  "Project_Fields",
  "Settings",
] as const;

export type KatlasBuddyWorksheetName = (typeof katlasBuddyWorksheetNames)[number];

export const outreachLanguages = [
  { code: "english", label: "English" },
  { code: "thai", label: "Thai" },
  { code: "vietnamese", label: "Vietnamese" },
  { code: "filipino", label: "Filipino" },
  { code: "spanish", label: "Spanish" },
] as const;

export type OutreachLanguage = (typeof outreachLanguages)[number]["code"];

export const creatorMessageSources = [
  "Instagram",
  "LINE",
  "WhatsApp",
  "TikTok",
  "Email",
  "Facebook",
] as const;

export type CreatorMessageSource = (typeof creatorMessageSources)[number];

export const templateCategories = [
  "Initial Outreach",
  "Follow Up",
  "Rate Collection",
  "Negotiation",
  "Briefing",
  "Production",
  "Approval",
  "Posting",
  "Campaign Closing",
  "Internal",
] as const;

export type TemplateCategory = (typeof templateCategories)[number];

export const channelTypes = ["DM", "Email", "Universal", "Internal"] as const;

export type ChannelType = (typeof channelTypes)[number];

export const projectFieldDefinitions = [
  { key: "brand_name", label: "Brand Name" },
  { key: "deliverables", label: "Deliverables" },
  { key: "usage_rights", label: "Usage Rights" },
  { key: "campaign_brief", label: "Campaign Brief" },
  { key: "reference_link", label: "Reference Link" },
  { key: "payment_terms", label: "Payment Terms" },
  { key: "talking_points", label: "Talking Points" },
] as const;

export type ProjectFieldKey = (typeof projectFieldDefinitions)[number]["key"];

export type CustomProjectField = {
  id: string;
  label: string;
  key: string;
  value: string;
};

export type OutreachProject = {
  id: string;
  projectName: string;
  brandName: string;
  country: string;
  primaryLanguage: OutreachLanguage;
  createdAt: string;
  updatedAt: string;
};

export type OutreachProjectFields = {
  id: string;
  projectId: string;
  deliverables: string;
  talkingPoints: string;
  usageRights: string;
  paymentTerms: string;
  campaignBrief: string;
  referenceLinks: string;
  notes: string;
  customFields: CustomProjectField[];
  updatedAt: string;
};

export type OutreachTemplate = {
  id: string;
  templateName: string;
  category: TemplateCategory;
  channelType: ChannelType;
  body: string;
  fields: string[];
  requiredFields: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type OutreachSettings = {
  activeProjectId: string;
  defaultSource: CreatorMessageSource;
  defaultTargetLanguage: OutreachLanguage;
  databaseName: typeof katlasBuddyDatabaseName;
  worksheetNames: KatlasBuddyWorksheetName[];
  updatedAt: string;
};

export type KatlasBuddyDatabase = {
  databaseName: typeof katlasBuddyDatabaseName;
  worksheets: {
    Templates: OutreachTemplate[];
    Projects: OutreachProject[];
    Project_Fields: OutreachProjectFields[];
    Settings: OutreachSettings;
  };
};

export type GeneratedOutreachReply = {
  original: string;
  translation: string;
  targetLanguage: OutreachLanguage;
};
