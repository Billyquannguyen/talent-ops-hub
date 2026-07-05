import type { CampaignProfileRecord } from "./schema";

export type CampaignProfileCleanupResult = {
  records: CampaignProfileRecord[];
  removedCount: number;
  duplicateIdCount: number;
  emptyRecordCount: number;
};

export function cleanupCampaignProfileRecords(
  records: CampaignProfileRecord[],
): CampaignProfileCleanupResult {
  const validRecords = records
    .filter((record) => record.campaignId.trim() && record.campaignName.trim())
    .map(normalizeCampaignProfileRecord);
  const emptyRecordCount = records.length - validRecords.length;
  const removedIndexes = new Set<number>();
  let duplicateIdCount = 0;

  for (const group of groupRecordIndexes(validRecords, (record) => record.campaignId)) {
    if (group.length <= 1) continue;
    const keepIndex = getLatestRecordIndex(validRecords, group);
    group.forEach((index) => {
      if (index === keepIndex) return;
      removedIndexes.add(index);
      duplicateIdCount += 1;
    });
  }

  return {
    records: validRecords.filter((_, index) => !removedIndexes.has(index)),
    removedCount: emptyRecordCount + duplicateIdCount,
    duplicateIdCount,
    emptyRecordCount,
  };
}

export function upsertCampaignProfileRecord(
  records: CampaignProfileRecord[],
  record: CampaignProfileRecord,
): CampaignProfileCleanupResult {
  const cleaned = cleanupCampaignProfileRecords(records).records;
  const nextRecord = normalizeCampaignProfileRecord(record);
  const sameIdIndex = cleaned.findIndex((item) => item.campaignId === nextRecord.campaignId);

  if (sameIdIndex < 0) {
    return cleanupCampaignProfileRecords([...cleaned, nextRecord]);
  }

  const nextRecords = cleaned.map((item, index) => {
    if (index !== sameIdIndex) return item;
    return {
      ...nextRecord,
      createdAt: item.createdAt || nextRecord.createdAt,
    };
  });

  return cleanupCampaignProfileRecords(nextRecords);
}

export function removeCampaignProfileRecord(
  records: CampaignProfileRecord[],
  campaignId: string,
): CampaignProfileCleanupResult {
  const nextRecords = cleanupCampaignProfileRecords(records).records.filter(
    (record) => record.campaignId !== campaignId,
  );
  return cleanupCampaignProfileRecords(nextRecords);
}

function normalizeCampaignProfileRecord(record: CampaignProfileRecord): CampaignProfileRecord {
  const now = new Date().toISOString();
  const createdAt = stringValue(record.createdAt) || now;

  return {
    campaignId: stringValue(record.campaignId),
    campaignName: stringValue(record.campaignName),
    campaignCode: stringValue(record.campaignCode),
    country: stringValue(record.country),
    preferredLanguages: stringValue(record.preferredLanguages),
    status: stringValue(record.status) || "Active",
    createdAt,
    updatedAt: stringValue(record.updatedAt) || createdAt,
  };
}

function groupRecordIndexes(
  records: CampaignProfileRecord[],
  getKey: (record: CampaignProfileRecord) => string,
): number[][] {
  const groups = new Map<string, number[]>();
  records.forEach((record, index) => {
    const key = getKey(record);
    if (!key) return;
    groups.set(key, [...(groups.get(key) ?? []), index]);
  });
  return Array.from(groups.values());
}

function getLatestRecordIndex(records: CampaignProfileRecord[], indexes: number[]): number {
  return indexes.reduce((latestIndex, index) => {
    const latestScore = getRecordTimestamp(records[latestIndex]);
    const score = getRecordTimestamp(records[index]);
    return score >= latestScore ? index : latestIndex;
  }, indexes[0]);
}

function getRecordTimestamp(record: CampaignProfileRecord): number {
  return Date.parse(record.updatedAt) || Date.parse(record.createdAt) || 0;
}

function stringValue(value: unknown): string {
  return value == null ? "" : String(value);
}
