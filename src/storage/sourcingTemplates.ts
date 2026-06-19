import type { SourcingTemplateRecord } from "./schema";

export type SourcingTemplateCleanupResult = {
  records: SourcingTemplateRecord[];
  inactiveCount: number;
  duplicateIdCount: number;
  duplicateNameCount: number;
};

export function isActiveSourcingTemplateRecord(record: SourcingTemplateRecord): boolean {
  return normalizeActiveFlag(record.isActive);
}

export function cleanupSourcingTemplateRecords(
  records: SourcingTemplateRecord[],
): SourcingTemplateCleanupResult {
  const normalized = records.map((record) => ({
    ...record,
    isActive: normalizeActiveFlag(record.isActive) ? "TRUE" : "FALSE",
  }));
  let duplicateIdCount = 0;
  let duplicateNameCount = 0;

  for (const group of groupRecordIndexes(normalized, (record) => record.id)) {
    const activeIndexes = group.filter((index) =>
      isActiveSourcingTemplateRecord(normalized[index]),
    );
    if (activeIndexes.length <= 1) continue;
    const keepIndex = getLatestRecordIndex(normalized, activeIndexes);
    activeIndexes.forEach((index) => {
      if (index === keepIndex) return;
      normalized[index] = {
        ...normalized[index],
        isActive: "FALSE",
      };
      duplicateIdCount += 1;
    });
  }

  for (const group of groupRecordIndexes(normalized, getCampaignTemplateNameKey)) {
    const activeIndexes = group.filter((index) =>
      isActiveSourcingTemplateRecord(normalized[index]),
    );
    if (activeIndexes.length <= 1) continue;
    const keepIndex = getLatestRecordIndex(normalized, activeIndexes);
    activeIndexes.forEach((index) => {
      if (index === keepIndex) return;
      normalized[index] = {
        ...normalized[index],
        isActive: "FALSE",
      };
      duplicateNameCount += 1;
    });
  }

  return {
    records: normalized,
    inactiveCount: duplicateIdCount + duplicateNameCount,
    duplicateIdCount,
    duplicateNameCount,
  };
}

export function upsertSourcingTemplateRecord(
  records: SourcingTemplateRecord[],
  record: SourcingTemplateRecord,
): SourcingTemplateCleanupResult {
  const cleaned = cleanupSourcingTemplateRecords(records).records;
  const sameIdIndexes = cleaned
    .map((item, index) => (item.id === record.id ? index : -1))
    .filter((index) => index >= 0);

  const activeRecord = {
    ...record,
    isActive: "TRUE",
  };

  if (sameIdIndexes.length === 0) {
    return cleanupSourcingTemplateRecords([...cleaned, activeRecord]);
  }

  const keepIndex = getLatestRecordIndex(cleaned, sameIdIndexes);
  const nextRecords = cleaned.map((item, index) => {
    if (index === keepIndex) {
      return {
        ...activeRecord,
        createdAt: item.createdAt || activeRecord.createdAt,
      };
    }

    if (item.id === record.id) {
      return {
        ...item,
        isActive: "FALSE",
      };
    }

    return item;
  });

  return cleanupSourcingTemplateRecords(nextRecords);
}

export function deactivateSourcingTemplateRecord(
  records: SourcingTemplateRecord[],
  templateId: string,
): SourcingTemplateCleanupResult {
  const nextRecords = records.map((record) =>
    record.id === templateId
      ? {
          ...record,
          isActive: "FALSE",
          updatedAt: new Date().toISOString(),
        }
      : record,
  );

  return cleanupSourcingTemplateRecords(nextRecords);
}

function groupRecordIndexes(
  records: SourcingTemplateRecord[],
  getKey: (record: SourcingTemplateRecord) => string,
): number[][] {
  const groups = new Map<string, number[]>();
  records.forEach((record, index) => {
    const key = getKey(record);
    if (!key) return;
    groups.set(key, [...(groups.get(key) ?? []), index]);
  });
  return Array.from(groups.values());
}

function getCampaignTemplateNameKey(record: SourcingTemplateRecord): string {
  const campaignId = record.campaignId.trim();
  const templateName = record.templateName.trim().toLowerCase();
  if (!campaignId || !templateName) return "";
  return `${campaignId}::${templateName}`;
}

function getLatestRecordIndex(records: SourcingTemplateRecord[], indexes: number[]): number {
  return indexes.reduce((latestIndex, index) => {
    const latestScore = getRecordTimestamp(records[latestIndex]);
    const score = getRecordTimestamp(records[index]);
    return score >= latestScore ? index : latestIndex;
  }, indexes[0]);
}

function getRecordTimestamp(record: SourcingTemplateRecord): number {
  return Date.parse(record.updatedAt) || Date.parse(record.createdAt) || 0;
}

function normalizeActiveFlag(value: unknown): boolean {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!normalized) return true;
  return !["false", "0", "inactive", "deleted", "no"].includes(normalized);
}
