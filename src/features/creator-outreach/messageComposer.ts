import type { OutreachTemplate, TemplateCategory } from "./types";

export function extractTemplateFields(body: string): string[] {
  return Array.from(body.matchAll(/\{\{([a-z0-9_]+)\}\}|\{([a-z0-9_]+)\}/gi))
    .map((match) => (match[1] ?? match[2]).toLowerCase())
    .filter((value, index, values) => values.indexOf(value) === index);
}

export function createBlankTemplate(category: TemplateCategory): OutreachTemplate {
  const now = new Date().toISOString();
  return {
    id: createId("template"),
    templateName: "New Template",
    category,
    channelType: "DM",
    body: "Hi {{field}},\n\n{{field_1}}\n\nThank you.",
    fields: ["field", "field_1"],
    requiredFields: [],
    notes: "",
    createdAt: now,
    updatedAt: now,
  };
}

export function createId(prefix: string): string {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
