import type { BulkSenderColumn, BulkSenderRow, BulkSenderWorkspace } from "./types";

export const BULK_SENDER_WORKSPACE_KEY = "katlas-bulk-sender-workspace-v1";
export const BULK_SENDER_WORKSPACE_ID_KEY = "katlas-bulk-sender-workspace-id-v1";
export const DEFAULT_BULK_SENDER_ROWS = 8;

export function createId(prefix: string) {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createDefaultWorkspace(): BulkSenderWorkspace {
  const columns = [
    { id: createId("column"), name: "Creator Name" },
    { id: createId("column"), name: "Creator Email" },
  ];
  return {
    columns,
    rows: Array.from({ length: DEFAULT_BULK_SENDER_ROWS }, () => createEmptyRow(columns)),
    emailColumnId: columns[1].id,
    subject: "A creator partnership for {{creator_name}}",
    bodyHtml:
      "<p>Hi {{creator_name}},</p><p>I’m reaching out from Katlas Media about a potential creator partnership.</p><p>Would you be open to hearing more?</p>",
    updatedAt: new Date().toISOString(),
  };
}

export function createEmptyRow(columns: BulkSenderColumn[]): BulkSenderRow {
  return {
    id: createId("row"),
    values: Object.fromEntries(columns.map((column) => [column.id, ""])),
  };
}

export function columnVariable(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `{{${slug || "field"}}}`;
}

export function personalizeTemplate(
  template: string,
  columns: BulkSenderColumn[],
  row: BulkSenderRow,
) {
  return columns.reduce((result, column) => {
    const variable = columnVariable(column.name);
    return result.split(variable).join(row.values[column.id] ?? "");
  }, template);
}

export function htmlToPlainText(html: string) {
  if (typeof document === "undefined") {
    return html
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .trim();
  }
  const container = document.createElement("div");
  container.innerHTML = html;
  return (container.innerText || container.textContent || "").trim();
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function rowHasContent(row: BulkSenderRow) {
  return Object.values(row.values).some((value) => value.trim());
}

export function getRowIssue(
  row: BulkSenderRow,
  emailColumnId: string,
  duplicateEmails: Set<string>,
) {
  if (!rowHasContent(row)) return "blank" as const;
  const email = (row.values[emailColumnId] ?? "").trim().toLowerCase();
  if (!email) return "missing" as const;
  if (!isValidEmail(email)) return "invalid" as const;
  if (duplicateEmails.has(email)) return "duplicate" as const;
  return null;
}

export function getDuplicateEmails(rows: BulkSenderRow[], emailColumnId: string) {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const email = (row.values[emailColumnId] ?? "").trim().toLowerCase();
    if (email) counts.set(email, (counts.get(email) ?? 0) + 1);
  });
  return new Set([...counts].filter(([, count]) => count > 1).map(([email]) => email));
}

export function parseClipboardGrid(text: string) {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .filter((line, index, lines) => line.length > 0 || index < lines.length - 1)
    .map((line) => line.split("\t"));
}
