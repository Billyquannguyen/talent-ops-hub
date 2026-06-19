export const katlasBuddyDatabaseName = "Katlas Buddy Database";

export const katlasBuddyWorksheetNames = ["Templates", "Settings"] as const;

export type KatlasBuddyWorksheetName = (typeof katlasBuddyWorksheetNames)[number];

export const outreachLanguages = [
  { code: "english", label: "English" },
  { code: "thai", label: "Thai" },
  { code: "vietnamese", label: "Vietnamese" },
  { code: "filipino", label: "Filipino" },
  { code: "indonesian", label: "Indonesian" },
  { code: "korean", label: "Korean" },
  { code: "spanish", label: "Spanish" },
] as const;

export type OutreachLanguage = (typeof outreachLanguages)[number]["code"];

export const creatorMessageSources = ["DM", "Email"] as const;

export type CreatorMessageSource = (typeof creatorMessageSources)[number];

export const templateCategories = ["Initial Outreach", "Follow Up"] as const;

export type TemplateCategory = (typeof templateCategories)[number];

export const channelTypes = ["DM", "Email"] as const;

export type ChannelType = (typeof channelTypes)[number];

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
    Settings: OutreachSettings;
  };
};

export type GeneratedOutreachReply = {
  original: string;
  translation: string;
  targetLanguage: OutreachLanguage;
};
