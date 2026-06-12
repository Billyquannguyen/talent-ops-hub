import type {
  OutreachProject,
  OutreachProjectFields,
  OutreachTemplate,
  TemplateCategory,
} from "./types";

export function applyTemplateFields({
  template,
  project,
  projectFields,
  creatorName,
}: {
  template: OutreachTemplate;
  project: OutreachProject;
  projectFields: OutreachProjectFields;
  creatorName: string;
}): string {
  return replaceFields(template.body, buildFieldMap({ project, projectFields, creatorName }));
}

export function replaceFields(body: string, fields: Record<string, string>): string {
  return body.replace(/\{([a-z0-9_]+)\}/gi, (match, rawKey: string) => {
    const key = rawKey.toLowerCase();
    return fields[key] ?? match;
  });
}

export function buildFieldMap({
  project,
  projectFields,
  creatorName,
}: {
  project: OutreachProject;
  projectFields: OutreachProjectFields;
  creatorName: string;
}): Record<string, string> {
  const customFields = Object.fromEntries(
    projectFields.customFields
      .filter((field) => field.key.trim())
      .map((field) => [field.key.trim().toLowerCase(), field.value]),
  );

  return {
    creator_name: creatorName.trim() || "Creator",
    project_name: project.projectName,
    brand_name: project.brandName,
    country: project.country,
    primary_language: project.primaryLanguage,
    deliverables: projectFields.deliverables,
    talking_points: projectFields.talkingPoints,
    usage_rights: projectFields.usageRights,
    payment_terms: projectFields.paymentTerms,
    campaign_brief: projectFields.campaignBrief,
    reference_link: firstLine(projectFields.referenceLinks),
    reference_links: projectFields.referenceLinks,
    notes: projectFields.notes,
    ...customFields,
  };
}

export function extractTemplateFields(body: string): string[] {
  return Array.from(body.matchAll(/\{([a-z0-9_]+)\}/gi))
    .map((match) => match[1].toLowerCase())
    .filter((value, index, values) => values.indexOf(value) === index);
}

export function createBlankTemplate(category: TemplateCategory): OutreachTemplate {
  const now = new Date().toISOString();
  return {
    id: createId("template"),
    templateName: "New Template",
    category,
    channelType: "Universal",
    body: "Hi {creator_name},\n\n{brand_name} would like to share this campaign with you.\n\n{deliverables}\n\nThank you.",
    fields: ["creator_name", "brand_name", "deliverables"],
    requiredFields: ["brand_name", "deliverables"],
    notes: "",
    createdAt: now,
    updatedAt: now,
  };
}

export function slugFieldName(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function createId(prefix: string): string {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function firstLine(value: string): string {
  return (
    value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? ""
  );
}
