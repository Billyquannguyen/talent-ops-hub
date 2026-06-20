import { getAppSetting, readOutreachTemplates } from "@/storage/appRepository";
import type { OutreachTemplateRecord } from "@/storage/schema";

import { createId, extractTemplateFields } from "./messageComposer";
import {
  channelTypes,
  katlasBuddyDatabaseName,
  katlasBuddyWorksheetNames,
  outreachLanguages,
  templateCategories,
  type ChannelType,
  type KatlasBuddyDatabase,
  type OutreachSettings,
  type OutreachTemplate,
  type TemplateCategory,
} from "./types";

export function loadKatlasBuddyDatabase(): KatlasBuddyDatabase {
  if (typeof window === "undefined") return createDefaultDatabase();
  const defaultDatabase = createDefaultDatabase();
  const records = readOutreachTemplates();
  const templates = records.length
    ? records.map((record) =>
        normalizeTemplate({
          id: record.templateId,
          templateName: record.templateName,
          channelType: record.type,
          body: record.body,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        }),
      )
    : defaultDatabase.worksheets.Templates;
  const database = {
    databaseName: katlasBuddyDatabaseName,
    worksheets: {
      Templates: templates,
      Settings: {
        ...defaultDatabase.worksheets.Settings,
        defaultSource:
          getAppSetting(
            "outreach.defaultSource",
            defaultDatabase.worksheets.Settings.defaultSource,
          ) === "Email"
            ? "Email"
            : "DM",
        defaultTargetLanguage: normalizeLanguage(
          getAppSetting(
            "outreach.defaultTargetLanguage",
            defaultDatabase.worksheets.Settings.defaultTargetLanguage,
          ),
        ),
      },
    },
  };
  return normalizeDatabase(database);
}

export function saveKatlasBuddyDatabase(database: KatlasBuddyDatabase) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    "katlas-outreach-settings-v1",
    JSON.stringify(database.worksheets.Settings),
  );
}

export function createOutreachDatabaseFromRecords(
  records: OutreachTemplateRecord[],
): KatlasBuddyDatabase {
  const defaultDatabase = createDefaultDatabase();

  return {
    databaseName: katlasBuddyDatabaseName,
    worksheets: {
      Templates: records.map(outreachTemplateRecordToTemplate),
      Settings: defaultDatabase.worksheets.Settings,
    },
  };
}

export function outreachTemplateRecordToTemplate(record: OutreachTemplateRecord): OutreachTemplate {
  return normalizeTemplate({
    id: record.templateId,
    templateName: record.templateName,
    channelType: record.type,
    body: record.body,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export function outreachTemplateToRecord(template: OutreachTemplate): OutreachTemplateRecord {
  return {
    templateId: template.id,
    templateName: template.templateName,
    type: template.channelType === "Email" ? "Email" : "DM",
    body: template.body,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
}

export function createDefaultDatabase(): KatlasBuddyDatabase {
  const now = new Date().toISOString();
  return {
    databaseName: katlasBuddyDatabaseName,
    worksheets: {
      Templates: createStarterTemplates(now),
      Settings: {
        defaultSource: "DM",
        defaultTargetLanguage: "thai",
        databaseName: katlasBuddyDatabaseName,
        worksheetNames: [...katlasBuddyWorksheetNames],
        updatedAt: now,
      },
    },
  };
}

export function normalizeImportedTemplates(value: unknown): OutreachTemplate[] {
  const source = findTemplatePayload(value);
  if (!Array.isArray(source)) return [];
  return source.map(normalizeTemplate).filter((template) => template.body.trim());
}

function normalizeDatabase(value: unknown): KatlasBuddyDatabase {
  const database = isRecord(value) ? value : {};
  const worksheets = isRecord(database.worksheets) ? database.worksheets : {};
  const defaultDatabase = createDefaultDatabase();
  const templates = normalizeTemplateArray(
    worksheets.Templates,
    defaultDatabase.worksheets.Templates,
  );
  const settings = normalizeSettings(worksheets.Settings, defaultDatabase.worksheets.Settings);

  return {
    databaseName: katlasBuddyDatabaseName,
    worksheets: {
      Templates: templates,
      Settings: settings,
    },
  };
}

function createStarterTemplates(now: string): OutreachTemplate[] {
  return [
    starterTemplate({
      now,
      category: "Initial Outreach",
      templateName: "Simple DM Reply",
      channelType: "DM",
      body: "Hi {{field}},\n\n{{field_1}}\n\nThank you.",
      requiredFields: [],
    }),
    starterTemplate({
      now,
      category: "Follow Up",
      templateName: "Simple DM Follow Up",
      channelType: "DM",
      body: "Hi {{field}},\n\nJust following up on this.\n\n{{field_1}}\n\nThank you.",
      requiredFields: [],
    }),
    starterTemplate({
      now,
      category: "Initial Outreach",
      templateName: "Simple Email Reply",
      channelType: "Email",
      body: "Hi {{field}},\n\n{{field_1}}\n\nBest,\n{{field_2}}",
      requiredFields: [],
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
  const body = normalizeTemplateBody(stringValue(template.body) || "Hi {{field}},\n\nThank you.");
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
    fields: extractTemplateFields(body),
    requiredFields: [],
    notes: "",
    createdAt,
    updatedAt: stringValue(template.updatedAt) || createdAt,
  };
}

function normalizeTemplateBody(body: string): string {
  const fieldMap = new Map<string, string>();
  let fieldIndex = 0;

  return body.replace(/\{\{?([a-z0-9_]+)\}?\}/gi, (_match, rawKey: string) => {
    const key = rawKey.toLowerCase();
    if (/^field(_\d+)?$/.test(key)) return `{{${key}}}`;
    const existing = fieldMap.get(key);
    if (existing) return `{{${existing}}}`;

    const nextField = fieldIndex === 0 ? "field" : `field_${fieldIndex}`;
    fieldMap.set(key, nextField);
    fieldIndex += 1;
    return `{{${nextField}}}`;
  });
}

function normalizeSettings(value: unknown, fallback: OutreachSettings): OutreachSettings {
  const settings = isRecord(value) ? value : {};

  return {
    defaultSource: normalizeCreatorMessageSource(settings.defaultSource, fallback.defaultSource),
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
  return channelTypes.includes(value as ChannelType) ? (value as ChannelType) : "DM";
}

function normalizeCreatorMessageSource(
  value: unknown,
  fallback: OutreachSettings["defaultSource"],
) {
  const source = stringValue(value);
  if (source === "Email") return "Email";
  if (source === "DM") return "DM";
  if (["Instagram", "LINE", "WhatsApp", "TikTok", "Facebook"].includes(source)) return "DM";
  return fallback;
}

function normalizeLanguage(value: unknown) {
  return outreachLanguages.some((language) => language.code === value)
    ? (value as (typeof outreachLanguages)[number]["code"])
    : "english";
}

function stringValue(value: unknown): string {
  return value == null ? "" : String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
