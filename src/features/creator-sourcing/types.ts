export const easyKolFields = [
  "Nickname",
  "@Username",
  "Description",
  "Region",
  "Language",
  "Platform",
  "Followers",
  "Avg. Views",
  "Median Views",
  "Crawler Updated At",
  "Avg. Likes",
  "Email",
  "Last Post",
  "Posts (7d)",
  "Posts (30d)",
  "URL",
] as const;

export type EasyKolField = (typeof easyKolFields)[number];

export type CreatorRow = Record<string, string | number | boolean | null | undefined>;

export type UploadedCreator = {
  id: string;
  data: CreatorRow;
};

export type EmailAvailability = "has" | "none";

export type FilterSettings = {
  followersMin: string;
  followersMax: string;
  followerRanges: string[];
  averageViewsMin: string;
  averageViewsMax: string;
  averageViewRanges: string[];
  medianViewsMin: string;
  medianViewsMax: string;
  region: string;
  regions: string[];
  language: string;
  languages: string[];
  platform: string;
  platforms: string[];
  lastPostAfter: string;
  posts7dMin: string;
  posts30dMin: string;
  hasEmail: boolean;
  emailAvailability: "" | "has" | "none";
  emailAvailabilitySelections: EmailAvailability[];
  keyword: string;
};

export type TemplateBlockType = "field" | "contacts" | "blank" | "custom";

export type TemplateColumn = {
  id: string;
  label: string;
  blockType: TemplateBlockType;
  fieldKey?: EasyKolField;
  customValue?: string;
};

export type SourcingTemplate = {
  id: string;
  campaignId: string;
  templateName: string;
  columns: TemplateColumn[];
  createdAt: string;
  updatedAt: string;
};

export type SourcingProject = {
  id: string;
  campaignId: string;
  name: string;
  createdAt: string;
  filters: FilterSettings;
  templates: SourcingTemplate[];
  activeTemplateId: string;
  template: TemplateColumn[];
  templateName: string;
  templateSavedAt?: string;
};

export type ColumnMap = Partial<Record<EasyKolField, string>>;

export type ContactField =
  | "email"
  | "line"
  | "whatsapp"
  | "phone"
  | "instagram"
  | "tiktok"
  | "youtube"
  | "website"
  | "other";

export type ContactDiscovery = {
  field: ContactField;
  value: string;
  source: "Email Column" | "Description" | "URL" | "External Discovery";
  discoveryMethod: "Regex" | "URL Match" | "Not implemented" | "AI Extraction";
  provider: string;
  confidence: number;
  sourceUrl?: string;
};

export type ContactInfo = {
  email?: string;
  line?: string;
  whatsapp?: string;
  instagram?: string;
  sourceUrl?: string;
  confidence: number;
  discoveryMethod: string;
  discoveries: ContactDiscovery[];
  externalDiscoveryStatus?: string;
  phone?: string;
  tiktok?: string;
  youtube?: string;
  website?: string;
  other?: string;
};

export type PreviewRow = {
  id: string;
  values: string[];
  contactInfo: ContactInfo;
};

export type CreatorEnrichmentResult = {
  creatorId: string;
  contactInfo: ContactInfo;
};

export type ContactEnrichmentReport = {
  creatorsProcessed: number;
  emailFound: number;
  lineFound: number;
  whatsappFound: number;
  instagramFound: number;
  creatorsWithContact: number;
  creatorsWithoutContact: number;
};
