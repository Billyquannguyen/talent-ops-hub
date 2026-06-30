import type { EmployeeProfileRecord } from "@/storage/schema";
import type { EmployeeProfile } from "./types";

export const employeeProfileStorageKey = "katlas-employee-profile-v1";
export const employeeProfileUpdatedEvent = "katlas-employee-profile-updated";
export const employeeProfileRecordId = "employee-profile-default";

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
    monthlySalary: profile.monthlySalary,
    currency: profile.currency,
    notes: profile.notes,
    createdAt: now,
    updatedAt: profile.updatedAt || now,
  };
}

export function employeeProfileFromRecord(record: EmployeeProfileRecord): EmployeeProfile {
  return normalizeProfile({
    displayName: record.displayName,
    avatarUrl: record.avatarUrl,
    monthlySalary: record.monthlySalary,
    currency: record.currency,
    notes: record.notes,
    updatedAt: record.updatedAt,
  });
}

export function createDefaultEmployeeProfile(): EmployeeProfile {
  return {
    displayName: "Billy Nguyen",
    avatarUrl: "",
    monthlySalary: 0,
    currency: "USD",
    notes: "",
    updatedAt: new Date().toISOString(),
  };
}

function normalizeProfile(value: unknown): EmployeeProfile {
  const profile = isRecord(value) ? value : {};
  return {
    displayName: stringValue(profile.displayName) || "Billy Nguyen",
    avatarUrl: stringValue(profile.avatarUrl),
    monthlySalary: numberValue(profile.monthlySalary),
    currency: stringValue(profile.currency) || "USD",
    notes: stringValue(profile.notes),
    updatedAt: stringValue(profile.updatedAt) || new Date().toISOString(),
  };
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
