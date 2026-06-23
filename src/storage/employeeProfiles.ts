import type { EmployeeProfileRecord } from "./schema";

type EmployeeProfileCleanupResult = {
  records: EmployeeProfileRecord[];
  removedCount: number;
  duplicateIdCount: number;
  emptyRecordCount: number;
};

export function cleanupEmployeeProfileRecords(
  records: EmployeeProfileRecord[],
): EmployeeProfileCleanupResult {
  const byProfileId = new Map<string, EmployeeProfileRecord>();
  let duplicateIdCount = 0;
  let emptyRecordCount = 0;

  for (const record of records) {
    const nextRecord = normalizeEmployeeProfileRecord(record);
    if (!nextRecord.profileId) {
      emptyRecordCount += 1;
      continue;
    }

    if (byProfileId.has(nextRecord.profileId)) duplicateIdCount += 1;
    byProfileId.set(nextRecord.profileId, nextRecord);
  }

  const cleaned = Array.from(byProfileId.values());
  return {
    records: cleaned,
    removedCount: records.length - cleaned.length,
    duplicateIdCount,
    emptyRecordCount,
  };
}

export function upsertEmployeeProfileRecord(
  records: EmployeeProfileRecord[],
  record: EmployeeProfileRecord,
): EmployeeProfileCleanupResult {
  const nextRecord = normalizeEmployeeProfileRecord(record);
  const currentRecords = records.filter((item) => item.profileId !== nextRecord.profileId);
  return cleanupEmployeeProfileRecords([...currentRecords, nextRecord]);
}

function normalizeEmployeeProfileRecord(record: EmployeeProfileRecord): EmployeeProfileRecord {
  const now = new Date().toISOString();
  const createdAt = stringValue(record.createdAt) || now;

  return {
    profileId: stringValue(record.profileId) || "employee-profile-default",
    displayName: stringValue(record.displayName),
    role: stringValue(record.role),
    avatarUrl: stringValue(record.avatarUrl),
    bio: stringValue(record.bio),
    joiningDate: stringValue(record.joiningDate),
    timezone: stringValue(record.timezone),
    primaryMarkets: stringValue(record.primaryMarkets),
    responsibilities: stringValue(record.responsibilities),
    workEmail: stringValue(record.workEmail),
    phone: stringValue(record.phone),
    lineId: stringValue(record.lineId),
    telegram: stringValue(record.telegram),
    preferredContactMethod: stringValue(record.preferredContactMethod),
    accountsJson: stringValue(record.accountsJson) || "[]",
    createdAt,
    updatedAt: stringValue(record.updatedAt) || createdAt,
  };
}

function stringValue(value: unknown): string {
  return value == null ? "" : String(value);
}
