import type { ActiveCampaignCreatorRecord } from "./schema";

export type ActiveCampaignCreatorCleanupResult = {
  records: ActiveCampaignCreatorRecord[];
  removedCount: number;
  duplicateIdCount: number;
  emptyRecordCount: number;
};

export function cleanupActiveCampaignCreatorRecords(
  records: ActiveCampaignCreatorRecord[],
): ActiveCampaignCreatorCleanupResult {
  const validRecords = records
    .filter((record) => record.recordId.trim() && record.campaignId.trim())
    .map(normalizeActiveCampaignCreatorRecord);
  const emptyRecordCount = records.length - validRecords.length;
  const removedIndexes = new Set<number>();
  let duplicateIdCount = 0;

  for (const group of groupRecordIndexes(validRecords, (record) => record.recordId)) {
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

export function upsertActiveCampaignCreatorRecord(
  records: ActiveCampaignCreatorRecord[],
  record: ActiveCampaignCreatorRecord,
): ActiveCampaignCreatorCleanupResult {
  const cleaned = cleanupActiveCampaignCreatorRecords(records).records;
  const nextRecord = normalizeActiveCampaignCreatorRecord(record);
  const sameIdIndex = cleaned.findIndex((item) => item.recordId === nextRecord.recordId);

  if (sameIdIndex < 0) {
    return cleanupActiveCampaignCreatorRecords([...cleaned, nextRecord]);
  }

  const nextRecords = cleaned.map((item, index) => {
    if (index !== sameIdIndex) return item;
    return {
      ...nextRecord,
      createdAt: item.createdAt || nextRecord.createdAt,
    };
  });

  return cleanupActiveCampaignCreatorRecords(nextRecords);
}

export function removeActiveCampaignCreatorRecord(
  records: ActiveCampaignCreatorRecord[],
  recordId: string,
): ActiveCampaignCreatorCleanupResult {
  const nextRecords = cleanupActiveCampaignCreatorRecords(records).records.filter(
    (record) => record.recordId !== recordId,
  );
  return cleanupActiveCampaignCreatorRecords(nextRecords);
}

function normalizeActiveCampaignCreatorRecord(
  record: ActiveCampaignCreatorRecord,
): ActiveCampaignCreatorRecord {
  const now = new Date().toISOString();
  const createdAt = stringValue(record.createdAt) || now;
  const avgViews = numberValue(record.avgViews);
  const internalQuote = numberValue(record.internalQuote);
  const externalQuote = numberValue(record.externalQuote);
  const cpm = avgViews > 0 ? externalQuote / avgViews : 0;
  const profit = externalQuote - internalQuote;
  const profitMargin = externalQuote > 0 ? profit / externalQuote : 0;

  return {
    recordId: stringValue(record.recordId),
    campaignId: stringValue(record.campaignId),
    month: stringValue(record.month) || createdAt.slice(0, 7),
    creatorName: stringValue(record.creatorName),
    creatorLink: stringValue(record.creatorLink),
    avgViews,
    internalQuote,
    externalQuote,
    cpm,
    profit,
    profitMargin,
    status: stringValue(record.status) || "Contract Signed",
    draftLink: stringValue(record.draftLink),
    liveLink: stringValue(record.liveLink),
    notes: stringValue(record.notes),
    createdAt,
    updatedAt: stringValue(record.updatedAt) || createdAt,
  };
}

function groupRecordIndexes(
  records: ActiveCampaignCreatorRecord[],
  getKey: (record: ActiveCampaignCreatorRecord) => string,
): number[][] {
  const groups = new Map<string, number[]>();
  records.forEach((record, index) => {
    const key = getKey(record);
    if (!key) return;
    groups.set(key, [...(groups.get(key) ?? []), index]);
  });
  return Array.from(groups.values());
}

function getLatestRecordIndex(records: ActiveCampaignCreatorRecord[], indexes: number[]): number {
  return indexes.reduce((latestIndex, index) => {
    const latestScore = getRecordTimestamp(records[latestIndex]);
    const score = getRecordTimestamp(records[index]);
    return score >= latestScore ? index : latestIndex;
  }, indexes[0]);
}

function getRecordTimestamp(record: ActiveCampaignCreatorRecord): number {
  return Date.parse(record.updatedAt) || Date.parse(record.createdAt) || 0;
}

function numberValue(value: unknown): number {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function stringValue(value: unknown): string {
  return value == null ? "" : String(value);
}
