import type { CampaignMemoryCardRecord } from "./schema";

export type CampaignMemoryCardCleanupResult = {
  records: CampaignMemoryCardRecord[];
  removedCount: number;
  duplicateIdReassignedCount: number;
  duplicateTitleCount: number;
  emptyRecordCount: number;
};

export function cleanupCampaignMemoryCardRecords(
  records: CampaignMemoryCardRecord[],
): CampaignMemoryCardCleanupResult {
  const validRecords = records
    .filter((record) => record.campaignId.trim() && (record.title.trim() || record.content.trim()))
    .map(normalizeCampaignMemoryCardRecord);
  const emptyRecordCount = records.length - validRecords.length;
  const uniqueIdResult = ensureUniqueCardIds(validRecords);
  const removedIndexes = new Set<number>();
  let duplicateTitleCount = 0;

  for (const group of groupRecordIndexes(uniqueIdResult.records, getCampaignTitleKey)) {
    if (group.length <= 1) continue;
    const keepIndex = getLatestRecordIndex(uniqueIdResult.records, group);
    group.forEach((index) => {
      if (index === keepIndex) return;
      removedIndexes.add(index);
      duplicateTitleCount += 1;
    });
  }

  const removedCount = emptyRecordCount + duplicateTitleCount;

  return {
    records: uniqueIdResult.records.filter((_, index) => !removedIndexes.has(index)),
    removedCount,
    duplicateIdReassignedCount: uniqueIdResult.reassignedCount,
    duplicateTitleCount,
    emptyRecordCount,
  };
}

export function upsertCampaignMemoryCardRecord(
  records: CampaignMemoryCardRecord[],
  record: CampaignMemoryCardRecord,
): CampaignMemoryCardCleanupResult {
  const cleaned = cleanupCampaignMemoryCardRecords(records).records;
  const incomingRecord = normalizeCampaignMemoryCardRecord(record);
  const sameCampaignIdIndex = cleaned.findIndex(
    (item) =>
      item.cardId === incomingRecord.cardId && item.campaignId === incomingRecord.campaignId,
  );
  const sameIdDifferentCampaign = cleaned.some(
    (item) =>
      item.cardId === incomingRecord.cardId && item.campaignId !== incomingRecord.campaignId,
  );
  const nextRecord =
    sameIdDifferentCampaign && sameCampaignIdIndex < 0
      ? { ...incomingRecord, cardId: createId("memory-card") }
      : incomingRecord;

  if (sameCampaignIdIndex < 0) {
    return cleanupCampaignMemoryCardRecords([...cleaned, nextRecord]);
  }

  const nextRecords = cleaned.map((item, index) => {
    if (index !== sameCampaignIdIndex) return item;
    return {
      ...nextRecord,
      createdAt: item.createdAt || nextRecord.createdAt,
    };
  });

  return cleanupCampaignMemoryCardRecords(nextRecords);
}

export function removeCampaignMemoryCardRecord(
  records: CampaignMemoryCardRecord[],
  cardId: string,
): CampaignMemoryCardCleanupResult {
  const nextRecords = cleanupCampaignMemoryCardRecords(records).records.filter(
    (record) => record.cardId !== cardId,
  );
  return cleanupCampaignMemoryCardRecords(nextRecords);
}

export function replaceCampaignMemoryCardsForCampaign(
  records: CampaignMemoryCardRecord[],
  campaignId: string,
  campaignRecords: CampaignMemoryCardRecord[],
): CampaignMemoryCardCleanupResult {
  const cleaned = cleanupCampaignMemoryCardRecords(records).records;
  const incomingRecords = campaignRecords.map((record, index) =>
    normalizeCampaignMemoryCardRecord({
      ...record,
      campaignId,
      title: record.title.trim() || `Smart Field ${index + 1}`,
      cardId: record.cardId || createId("memory-card"),
    }),
  );
  const otherCampaignRecords = cleaned.filter((record) => record.campaignId !== campaignId);
  const nextCampaignRecords = ensureUniqueCardIds(
    incomingRecords,
    new Set(otherCampaignRecords.map((record) => record.cardId)),
  ).records;
  let insertedCampaignRecords = false;
  const nextRecords: CampaignMemoryCardRecord[] = [];

  cleaned.forEach((record) => {
    if (record.campaignId !== campaignId) {
      nextRecords.push(record);
      return;
    }

    if (insertedCampaignRecords) return;
    nextRecords.push(...nextCampaignRecords);
    insertedCampaignRecords = true;
  });

  if (!insertedCampaignRecords) {
    nextRecords.push(...nextCampaignRecords);
  }

  return cleanupCampaignMemoryCardRecords(nextRecords);
}

function normalizeCampaignMemoryCardRecord(
  record: CampaignMemoryCardRecord,
): CampaignMemoryCardRecord {
  const now = new Date().toISOString();
  const createdAt = stringValue(record.createdAt) || now;

  return {
    cardId: stringValue(record.cardId) || createId("memory-card"),
    campaignId: stringValue(record.campaignId),
    title: stringValue(record.title) || "Memory",
    content: stringValue(record.content),
    preferredLanguages: stringValue(record.preferredLanguages),
    createdAt,
    updatedAt: stringValue(record.updatedAt) || createdAt,
  };
}

function ensureUniqueCardIds(
  records: CampaignMemoryCardRecord[],
  reservedIds = new Set<string>(),
): { records: CampaignMemoryCardRecord[]; reassignedCount: number } {
  const seen = new Set(reservedIds);
  let reassignedCount = 0;

  return {
    records: records.map((record) => {
      if (!seen.has(record.cardId)) {
        seen.add(record.cardId);
        return record;
      }

      reassignedCount += 1;
      const nextRecord = {
        ...record,
        cardId: createId("memory-card"),
      };
      seen.add(nextRecord.cardId);
      return nextRecord;
    }),
    reassignedCount,
  };
}

function groupRecordIndexes(
  records: CampaignMemoryCardRecord[],
  getKey: (record: CampaignMemoryCardRecord) => string,
): number[][] {
  const groups = new Map<string, number[]>();
  records.forEach((record, index) => {
    const key = getKey(record);
    if (!key) return;
    groups.set(key, [...(groups.get(key) ?? []), index]);
  });
  return Array.from(groups.values());
}

function getCampaignTitleKey(record: CampaignMemoryCardRecord): string {
  const campaignId = record.campaignId.trim();
  const title = record.title.trim().toLowerCase();
  if (!campaignId || !title) return "";
  return `${campaignId}::${title}`;
}

function getLatestRecordIndex(records: CampaignMemoryCardRecord[], indexes: number[]): number {
  return indexes.reduce((latestIndex, index) => {
    const latestScore = getRecordTimestamp(records[latestIndex]);
    const score = getRecordTimestamp(records[index]);
    return score >= latestScore ? index : latestIndex;
  }, indexes[0]);
}

function getRecordTimestamp(record: CampaignMemoryCardRecord): number {
  return Date.parse(record.updatedAt) || Date.parse(record.createdAt) || 0;
}

function createId(prefix: string): string {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function stringValue(value: unknown): string {
  return value == null ? "" : String(value);
}
