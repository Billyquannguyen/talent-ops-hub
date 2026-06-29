import {
  employeeAccountCategories,
  type EmployeeAccountCategory,
  type EmployeeAccountLink,
  type EmployeeProfile,
} from "./types";
import type { EmployeeProfileRecord } from "@/storage/schema";

export const employeeProfileStorageKey = "katlas-employee-profile-v1";
export const employeeProfileUpdatedEvent = "katlas-employee-profile-updated";
export const employeeProfileRecordId = "employee-profile-default";

const defaultAccounts: EmployeeAccountLink[] = [
  createAccount("Slack", "Communication", "https://slack.com"),
  createAccount("WhatsApp", "Communication", "https://web.whatsapp.com"),
  createAccount("LINE", "Communication", "https://line.me"),
  createAccount("Telegram", "Communication", "https://web.telegram.org"),
  createAccount("Viber", "Communication", "https://account.viber.com/en/login"),
  createAccount("Discord", "Communication", "https://discord.com/app"),
  createAccount("Instagram", "Social", "https://instagram.com"),
  createAccount("TikTok", "Social", "https://tiktok.com"),
  createAccount("Facebook", "Social", "https://facebook.com"),
  createAccount("Threads", "Social", "https://threads.net"),
  createAccount("Outlook", "Workspace", "https://outlook.office.com/mail"),
  createAccount("Google Drive", "Workspace", "https://drive.google.com"),
  createAccount("Notion", "Workspace", "https://notion.so"),
  createAccount("Calendly", "Workspace", "https://calendly.com"),
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
  window.localStorage.setItem(employeeProfileStorageKey, JSON.stringify(profile));
  window.dispatchEvent(new CustomEvent(employeeProfileUpdatedEvent, { detail: profile }));
}

export function employeeProfileToRecord(profile: EmployeeProfile): EmployeeProfileRecord {
  const now = new Date().toISOString();
  return {
    profileId: employeeProfileRecordId,
    displayName: profile.displayName,
    role: profile.role,
    avatarUrl: profile.avatarUrl,
    bio: profile.bio,
    joiningDate: profile.joiningDate,
    timezone: profile.timezone,
    primaryMarkets: profile.primaryMarkets,
    responsibilities: profile.responsibilities,
    workEmail: profile.workEmail,
    phone: profile.phone,
    lineId: profile.lineId,
    telegram: profile.telegram,
    preferredContactMethod: profile.preferredContactMethod,
    accountsJson: JSON.stringify(profile.accounts ?? []),
    createdAt: now,
    updatedAt: profile.updatedAt || now,
  };
}

export function employeeProfileFromRecord(record: EmployeeProfileRecord): EmployeeProfile {
  const profile = normalizeProfile({
    displayName: record.displayName,
    role: record.role,
    avatarUrl: record.avatarUrl,
    bio: record.bio,
    joiningDate: record.joiningDate,
    timezone: record.timezone,
    primaryMarkets: record.primaryMarkets,
    responsibilities: record.responsibilities,
    workEmail: record.workEmail,
    phone: record.phone,
    lineId: record.lineId,
    telegram: record.telegram,
    preferredContactMethod: record.preferredContactMethod,
    accounts: parseAccountsJson(record.accountsJson),
    updatedAt: record.updatedAt,
  });
  return profile;
}

export function createDefaultEmployeeProfile(): EmployeeProfile {
  return {
    displayName: "Billy Nguyen",
    role: "Katlas Media Operations",
    avatarUrl: "",
    bio: "Creator sourcing, outreach, and campaign operations.",
    joiningDate: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Berlin",
    primaryMarkets: "Thailand, Vietnam, Philippines",
    responsibilities: "Creator sourcing, creator outreach, campaign coordination",
    workEmail: "",
    phone: "",
    lineId: "",
    telegram: "",
    preferredContactMethod: "LINE or WhatsApp",
    accounts: defaultAccounts.map((account) => ({ ...account })),
    updatedAt: new Date().toISOString(),
  };
}

export function createBlankAccount(category: EmployeeAccountCategory = "Communication") {
  return createAccount("", category, "");
}

function createAccount(
  label: string,
  category: EmployeeAccountCategory,
  url: string,
): EmployeeAccountLink {
  return {
    id: createId(),
    label,
    category,
    url,
    handle: "",
    notes: "",
  };
}

function normalizeProfile(value: unknown): EmployeeProfile {
  const profile = isRecord(value) ? value : {};
  return {
    displayName: stringValue(profile.displayName) || "Billy Nguyen",
    role: stringValue(profile.role) || "Katlas Media Operations",
    avatarUrl: stringValue(profile.avatarUrl),
    bio: stringValue(profile.bio),
    joiningDate: stringValue(profile.joiningDate),
    timezone: stringValue(profile.timezone) || "Europe/Berlin",
    primaryMarkets: stringValue(profile.primaryMarkets),
    responsibilities: stringValue(profile.responsibilities),
    workEmail: stringValue(profile.workEmail),
    phone: stringValue(profile.phone),
    lineId: stringValue(profile.lineId),
    telegram: stringValue(profile.telegram),
    preferredContactMethod: stringValue(profile.preferredContactMethod),
    accounts: normalizeAccounts(profile.accounts),
    updatedAt: stringValue(profile.updatedAt) || new Date().toISOString(),
  };
}

function normalizeAccounts(value: unknown): EmployeeAccountLink[] {
  if (!Array.isArray(value)) return defaultAccounts.map((account) => ({ ...account }));
  return value
    .map(normalizeAccount)
    .filter((account) => account.label || account.url || account.handle);
}

function parseAccountsJson(value: string): unknown {
  try {
    return value ? JSON.parse(value) : [];
  } catch {
    return [];
  }
}

function normalizeAccount(value: unknown): EmployeeAccountLink {
  const account = isRecord(value) ? value : {};
  const category = stringValue(account.category);

  return {
    id: stringValue(account.id) || createId(),
    label: stringValue(account.label),
    category: isEmployeeAccountCategory(category) ? category : "Custom",
    url: stringValue(account.url),
    handle: stringValue(account.handle),
    notes: stringValue(account.notes),
  };
}

function isEmployeeAccountCategory(value: string): value is EmployeeAccountCategory {
  return employeeAccountCategories.includes(value as EmployeeAccountCategory);
}

function createId() {
  return `account-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function stringValue(value: unknown): string {
  return value == null ? "" : String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
