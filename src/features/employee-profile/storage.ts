import type { EmployeeProfileRecord } from "@/storage/schema";
import type { EmployeeAccountCategory, EmployeeAccountLink, EmployeeProfile } from "./types";

export const employeeProfileStorageKey = "katlas-employee-profile-v1";
export const employeeProfileUpdatedEvent = "katlas-employee-profile-updated";
export const employeeProfileRecordId = "employee-profile-default";

export const employeeAccountServices: Array<{
  serviceId: string;
  label: string;
  category: EmployeeAccountCategory;
}> = [
  { serviceId: "slack", label: "Slack", category: "Communication" },
  { serviceId: "whatsapp", label: "WhatsApp", category: "Communication" },
  { serviceId: "line", label: "LINE", category: "Communication" },
  { serviceId: "telegram", label: "Telegram", category: "Communication" },
  { serviceId: "viber", label: "Viber", category: "Communication" },
  { serviceId: "discord", label: "Discord", category: "Communication" },
  { serviceId: "instagram", label: "Instagram", category: "Social" },
  { serviceId: "tiktok", label: "TikTok", category: "Social" },
  { serviceId: "facebook", label: "Facebook", category: "Social" },
  { serviceId: "threads", label: "Threads", category: "Social" },
  { serviceId: "outlook", label: "Outlook", category: "Workspace" },
  { serviceId: "google-drive", label: "Google Drive", category: "Workspace" },
  { serviceId: "notion", label: "Notion", category: "Workspace" },
  { serviceId: "calendly", label: "Calendly", category: "Workspace" },
];

export function loadEmployeeProfile(): EmployeeProfile {
  if (typeof window === "undefined") return createDefaultEmployeeProfile();

  try {
    const raw = window.localStorage.getItem(employeeProfileStorageKey);
    if (!raw) return createDefaultEmployeeProfile();
    return normalizeProfile(JSON.parse(raw));
  } catch {
    return createDefaultEmployeeProfile();
  }
}

export function saveEmployeeProfile(profile: EmployeeProfile) {
  if (typeof window === "undefined") return;
  const normalized = normalizeProfile(profile);
  window.localStorage.setItem(employeeProfileStorageKey, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent(employeeProfileUpdatedEvent, { detail: normalized }));
}

export function employeeProfileToRecord(profile: EmployeeProfile): EmployeeProfileRecord {
  const now = new Date().toISOString();
  return {
    profileId: employeeProfileRecordId,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    joiningDate: profile.joiningDate,
    monthlySalary: profile.monthlySalary,
    currency: profile.currency,
    notes: profile.notes,
    accountsJson: JSON.stringify(parseEmployeeAccounts(profile.accounts)),
    createdAt: now,
    updatedAt: profile.updatedAt || now,
  };
}

export function employeeProfileFromRecord(record: EmployeeProfileRecord): EmployeeProfile {
  return normalizeProfile({
    displayName: record.displayName,
    avatarUrl: record.avatarUrl,
    joiningDate: record.joiningDate,
    monthlySalary: record.monthlySalary,
    currency: record.currency,
    notes: record.notes,
    accounts: parseEmployeeAccounts(record.accountsJson),
    updatedAt: record.updatedAt,
  });
}

export function createDefaultEmployeeProfile(): EmployeeProfile {
  return {
    displayName: "Billy Nguyen",
    avatarUrl: "",
    joiningDate: "",
    monthlySalary: 0,
    currency: "USD",
    notes: "",
    accounts: createDefaultEmployeeAccounts(),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeProfile(value: unknown): EmployeeProfile {
  const profile = isRecord(value) ? value : {};
  return {
    displayName: stringValue(profile.displayName) || "Billy Nguyen",
    avatarUrl: stringValue(profile.avatarUrl),
    joiningDate: stringValue(profile.joiningDate),
    monthlySalary: numberValue(profile.monthlySalary),
    currency: stringValue(profile.currency) || "USD",
    notes: stringValue(profile.notes),
    accounts: parseEmployeeAccounts(profile.accounts),
    updatedAt: stringValue(profile.updatedAt) || new Date().toISOString(),
  };
}

export function createDefaultEmployeeAccounts(): EmployeeAccountLink[] {
  return employeeAccountServices.map((service) => ({ ...service, url: "" }));
}

export function parseEmployeeAccounts(value: unknown): EmployeeAccountLink[] {
  let parsedValue = value;

  if (typeof value === "string" && value.trim()) {
    try {
      parsedValue = JSON.parse(value) as unknown;
    } catch {
      parsedValue = [];
    }
  }

  const savedAccounts = Array.isArray(parsedValue) ? parsedValue : [];
  const savedById = new Map<string, Record<string, unknown>>();

  for (const item of savedAccounts) {
    if (!isRecord(item)) continue;
    const serviceId = stringValue(item.serviceId);
    if (serviceId) savedById.set(serviceId, item);
  }

  return employeeAccountServices.map((service) => {
    const saved = savedById.get(service.serviceId);
    return {
      ...service,
      url: saved ? stringValue(saved.url) : "",
    };
  });
}

function stringValue(value: unknown): string {
  return value == null ? "" : String(value);
}

function numberValue(value: unknown): number {
  const parsed =
    typeof value === "number" ? value : Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
