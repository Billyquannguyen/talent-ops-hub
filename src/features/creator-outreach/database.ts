import { createId, extractTemplateFields, slugFieldName } from "./messageComposer";
import {
  channelTypes,
  katlasBuddyDatabaseName,
  katlasBuddyWorksheetNames,
  outreachLanguages,
  templateCategories,
  type ChannelType,
  type CustomProjectField,
  type KatlasBuddyDatabase,
  type OutreachProject,
  type OutreachProjectFields,
  type OutreachSettings,
  type OutreachTemplate,
  type TemplateCategory,
} from "./types";

const databaseStorageKey = "katlas-buddy-database-v1";

export function loadKatlasBuddyDatabase(): KatlasBuddyDatabase {
  if (typeof window === "undefined") return createDefaultDatabase();

  try {
    const raw = window.localStorage.getItem(databaseStorageKey);
    if (!raw) return createDefaultDatabase();
    return normalizeDatabase(JSON.parse(raw));
  } catch {
    return createDefaultDatabase();
  }
}

export function saveKatlasBuddyDatabase(database: KatlasBuddyDatabase) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(databaseStorageKey, JSON.stringify(database));
}

export function createDefaultDatabase(): KatlasBuddyDatabase {
  const now = new Date().toISOString();
  const projects = createDefaultProjects(now);
  return {
    databaseName: katlasBuddyDatabaseName,
    worksheets: {
      Templates: createStarterTemplates(now),
      Projects: projects,
      Project_Fields: projects.map((project) => createDefaultProjectFields(project.id, now)),
      Settings: {
        activeProjectId: projects[0]?.id ?? "",
        defaultSource: "Instagram",
        defaultTargetLanguage: projects[0]?.primaryLanguage ?? "thai",
        databaseName: katlasBuddyDatabaseName,
        worksheetNames: [...katlasBuddyWorksheetNames],
        updatedAt: now,
      },
    },
  };
}

export function createBlankProject(): {
  project: OutreachProject;
  fields: OutreachProjectFields;
} {
  const now = new Date().toISOString();
  const project: OutreachProject = {
    id: createId("project"),
    projectName: "New Campaign",
    brandName: "",
    country: "",
    primaryLanguage: "english",
    createdAt: now,
    updatedAt: now,
  };

  return {
    project,
    fields: createDefaultProjectFields(project.id, now),
  };
}

export function normalizeImportedTemplates(value: unknown): OutreachTemplate[] {
  const source = findTemplatePayload(value);
  if (!Array.isArray(source)) return [];
  return source.map(normalizeTemplate).filter((template) => template.body.trim());
}

export function createCustomProjectField(label: string): CustomProjectField {
  return {
    id: createId("custom-field"),
    label,
    key: slugFieldName(label),
    value: "",
  };
}

function normalizeDatabase(value: unknown): KatlasBuddyDatabase {
  const database = isRecord(value) ? value : {};
  const worksheets = isRecord(database.worksheets) ? database.worksheets : {};
  const defaultDatabase = createDefaultDatabase();
  const templates = normalizeTemplateArray(
    worksheets.Templates,
    defaultDatabase.worksheets.Templates,
  );
  const projects = normalizeProjectArray(worksheets.Projects, defaultDatabase.worksheets.Projects);
  const projectFields = normalizeProjectFieldsArray(
    worksheets.Project_Fields,
    projects,
    defaultDatabase.worksheets.Project_Fields,
  );
  const settings = normalizeSettings(
    worksheets.Settings,
    projects,
    defaultDatabase.worksheets.Settings,
  );

  return {
    databaseName: katlasBuddyDatabaseName,
    worksheets: {
      Templates: templates,
      Projects: projects,
      Project_Fields: projectFields,
      Settings: settings,
    },
  };
}

function createDefaultProjects(now: string): OutreachProject[] {
  return [
    {
      id: createId("project"),
      projectName: "Dola Thailand",
      brandName: "Dola AI",
      country: "Thailand",
      primaryLanguage: "thai",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: createId("project"),
      projectName: "Dola Philippines",
      brandName: "Dola AI",
      country: "Philippines",
      primaryLanguage: "filipino",
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function createDefaultProjectFields(projectId: string, now: string): OutreachProjectFields {
  return {
    id: createId("project-fields"),
    projectId,
    deliverables: "1 TikTok video\n60 day ad code",
    talkingPoints: "Free\nAd free\nUnlimited uploads",
    usageRights: "60 day ad usage",
    paymentTerms: "Payment after content approval",
    campaignBrief: "",
    referenceLinks: "",
    notes: "",
    customFields: [],
    updatedAt: now,
  };
}

function createStarterTemplates(now: string): OutreachTemplate[] {
  return [
    starterTemplate({
      now,
      category: "Initial Outreach",
      templateName: "Simple DM Outreach",
      channelType: "DM",
      body: "Hi {creator_name},\n\nWe are reaching out for {brand_name}. We would like to share this campaign with you.\n\nDeliverables:\n{deliverables}\n\nThank you.",
      requiredFields: ["brand_name", "deliverables"],
    }),
    starterTemplate({
      now,
      category: "Rate Collection",
      templateName: "Ask For Rate Card",
      channelType: "Universal",
      body: "Hi {creator_name},\n\nCould you please share your rate card for this project?\n\nDeliverables:\n{deliverables}\n\nThank you.",
      requiredFields: ["deliverables"],
    }),
    starterTemplate({
      now,
      category: "Negotiation",
      templateName: "Rate Negotiation",
      channelType: "Universal",
      body: "Hi {creator_name},\n\nThank you for sharing your rate.\n\nFor {brand_name}, our current budget is a bit lower. Is there room to adjust the rate?\n\nThank you.",
      requiredFields: ["brand_name"],
    }),
    starterTemplate({
      now,
      category: "Briefing",
      templateName: "Send Brief",
      channelType: "Email",
      body: "Hi {creator_name},\n\nWe would like to confirm the following brief for {brand_name}.\n\nCampaign Brief:\n{campaign_brief}\n\nTalking Points:\n{talking_points}\n\nUsage Rights:\n{usage_rights}\n\nPayment Terms:\n{payment_terms}\n\nReference Link:\n{reference_link}\n\nThank you.",
      requiredFields: ["brand_name", "campaign_brief"],
    }),
  ];
}

function starterTemplate({
  now,
  category,
  templateName,
  channelType,
  body,
  requiredFields,
}: {
  now: string;
  category: TemplateCategory;
  templateName: string;
  channelType: ChannelType;
  body: string;
  requiredFields: string[];
}): OutreachTemplate {
  return {
    id: createId("template"),
    templateName,
    category,
    channelType,
    body,
    fields: extractTemplateFields(body),
    requiredFields,
    notes: "",
    createdAt: now,
    updatedAt: now,
  };
}

function findTemplatePayload(value: unknown): unknown {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return [];
  if (Array.isArray(value.Templates)) return value.Templates;
  if (Array.isArray(value.templates)) return value.templates;
  if (isRecord(value.worksheets) && Array.isArray(value.worksheets.Templates)) {
    return value.worksheets.Templates;
  }
  return [];
}

function normalizeTemplateArray(value: unknown, fallback: OutreachTemplate[]): OutreachTemplate[] {
  if (!Array.isArray(value) || value.length === 0) return fallback;
  return value.map(normalizeTemplate);
}

function normalizeTemplate(value: unknown): OutreachTemplate {
  const template = isRecord(value) ? value : {};
  const now = new Date().toISOString();
  const body = stringValue(template.body) || "Hi {creator_name},\n\nThank you.";
  const category = normalizeCategory(template.category);
  const channelType = normalizeChannelType(template.channelType ?? template.channel_type);
  const createdAt = stringValue(template.createdAt) || now;

  return {
    id: stringValue(template.id) || createId("template"),
    templateName:
      stringValue(template.templateName) ||
      stringValue(template.template_name) ||
      stringValue(template.name) ||
      `${category} Template`,
    category,
    channelType,
    body,
    fields: normalizeStringArray(template.fields, extractTemplateFields(body)),
    requiredFields: normalizeStringArray(template.requiredFields ?? template.required_fields, []),
    notes: stringValue(template.notes),
    createdAt,
    updatedAt: stringValue(template.updatedAt) || createdAt,
  };
}

function normalizeProjectArray(value: unknown, fallback: OutreachProject[]): OutreachProject[] {
  if (!Array.isArray(value) || value.length === 0) return fallback;
  return value.map(normalizeProject);
}

function normalizeProject(value: unknown): OutreachProject {
  const project = isRecord(value) ? value : {};
  const now = new Date().toISOString();
  const createdAt = stringValue(project.createdAt) || now;

  return {
    id: stringValue(project.id) || createId("project"),
    projectName:
      stringValue(project.projectName) ||
      stringValue(project.project_name) ||
      stringValue(project.name) ||
      "Untitled Campaign",
    brandName: stringValue(project.brandName) || stringValue(project.brand_name),
    country: stringValue(project.country),
    primaryLanguage: normalizeLanguage(project.primaryLanguage ?? project.primary_language),
    createdAt,
    updatedAt: stringValue(project.updatedAt) || createdAt,
  };
}

function normalizeProjectFieldsArray(
  value: unknown,
  projects: OutreachProject[],
  fallback: OutreachProjectFields[],
): OutreachProjectFields[] {
  const source = Array.isArray(value) && value.length ? value : fallback;
  const normalized = source.map(normalizeProjectFields);
  const projectIds = new Set(normalized.map((fields) => fields.projectId));
  const now = new Date().toISOString();

  return [
    ...normalized.filter((fields) => projects.some((project) => project.id === fields.projectId)),
    ...projects
      .filter((project) => !projectIds.has(project.id))
      .map((project) => createDefaultProjectFields(project.id, now)),
  ];
}

function normalizeProjectFields(value: unknown): OutreachProjectFields {
  const fields = isRecord(value) ? value : {};
  return {
    id: stringValue(fields.id) || createId("project-fields"),
    projectId: stringValue(fields.projectId) || stringValue(fields.project_id),
    deliverables: stringValue(fields.deliverables),
    talkingPoints: stringValue(fields.talkingPoints) || stringValue(fields.talking_points),
    usageRights: stringValue(fields.usageRights) || stringValue(fields.usage_rights),
    paymentTerms: stringValue(fields.paymentTerms) || stringValue(fields.payment_terms),
    campaignBrief: stringValue(fields.campaignBrief) || stringValue(fields.campaign_brief),
    referenceLinks: stringValue(fields.referenceLinks) || stringValue(fields.reference_links),
    notes: stringValue(fields.notes),
    customFields: Array.isArray(fields.customFields)
      ? fields.customFields.map(normalizeCustomField)
      : [],
    updatedAt: stringValue(fields.updatedAt) || new Date().toISOString(),
  };
}

function normalizeCustomField(value: unknown): CustomProjectField {
  const field = isRecord(value) ? value : {};
  const label = stringValue(field.label) || "Custom Field";
  return {
    id: stringValue(field.id) || createId("custom-field"),
    label,
    key: stringValue(field.key) || slugFieldName(label),
    value: stringValue(field.value),
  };
}

function normalizeSettings(
  value: unknown,
  projects: OutreachProject[],
  fallback: OutreachSettings,
): OutreachSettings {
  const settings = isRecord(value) ? value : {};
  const activeProjectId = stringValue(settings.activeProjectId);
  const resolvedProjectId = projects.some((project) => project.id === activeProjectId)
    ? activeProjectId
    : projects[0]?.id || "";

  return {
    activeProjectId: resolvedProjectId,
    defaultSource:
      stringValue(settings.defaultSource) === "LINE"
        ? "LINE"
        : stringValue(settings.defaultSource) === "WhatsApp"
          ? "WhatsApp"
          : stringValue(settings.defaultSource) === "TikTok"
            ? "TikTok"
            : stringValue(settings.defaultSource) === "Email"
              ? "Email"
              : stringValue(settings.defaultSource) === "Facebook"
                ? "Facebook"
                : fallback.defaultSource,
    defaultTargetLanguage: normalizeLanguage(settings.defaultTargetLanguage),
    databaseName: katlasBuddyDatabaseName,
    worksheetNames: [...katlasBuddyWorksheetNames],
    updatedAt: stringValue(settings.updatedAt) || new Date().toISOString(),
  };
}

function normalizeCategory(value: unknown): TemplateCategory {
  return templateCategories.includes(value as TemplateCategory)
    ? (value as TemplateCategory)
    : "Initial Outreach";
}

function normalizeChannelType(value: unknown): ChannelType {
  return channelTypes.includes(value as ChannelType) ? (value as ChannelType) : "Universal";
}

function normalizeLanguage(value: unknown) {
  return outreachLanguages.some((language) => language.code === value)
    ? (value as (typeof outreachLanguages)[number]["code"])
    : "english";
}

function normalizeStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  return value
    .map(String)
    .map((item) => item.trim())
    .filter(Boolean);
}

function stringValue(value: unknown): string {
  return value == null ? "" : String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
