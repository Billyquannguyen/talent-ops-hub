import type { CampaignPromptVaultRecord } from "./schema";

export type CampaignPromptVaultCleanupResult = {
  records: CampaignPromptVaultRecord[];
  removedCount: number;
  duplicateIdCount: number;
  emptyRecordCount: number;
};

export function cleanupCampaignPromptVaultRecords(
  records: CampaignPromptVaultRecord[],
): CampaignPromptVaultCleanupResult {
  const validRecords = records
    .filter((record) => record.promptId.trim())
    .map(normalizeCampaignPromptVaultRecord);
  const emptyRecordCount = records.length - validRecords.length;
  const removedIndexes = new Set<number>();
  let duplicateIdCount = 0;

  for (const group of groupRecordIndexes(validRecords, (record) => record.promptId)) {
    if (group.length <= 1) continue;
    const keepIndex = getLatestRecordIndex(validRecords, group);
    group.forEach((index) => {
      if (index === keepIndex) return;
      removedIndexes.add(index);
      duplicateIdCount += 1;
    });
  }

  const removedCount = emptyRecordCount + duplicateIdCount;

  return {
    records: validRecords.filter((_, index) => !removedIndexes.has(index)),
    removedCount,
    duplicateIdCount,
    emptyRecordCount,
  };
}

export function upsertCampaignPromptVaultRecord(
  records: CampaignPromptVaultRecord[],
  record: CampaignPromptVaultRecord,
): CampaignPromptVaultCleanupResult {
  const cleaned = cleanupCampaignPromptVaultRecords(records).records;
  const nextRecord = normalizeCampaignPromptVaultRecord(record);
  const sameIdIndex = cleaned.findIndex((item) => item.promptId === nextRecord.promptId);

  if (sameIdIndex < 0) {
    return cleanupCampaignPromptVaultRecords([...cleaned, nextRecord]);
  }

  const nextRecords = cleaned.map((item, index) => {
    if (index !== sameIdIndex) return item;
    return {
      ...nextRecord,
      createdAt: item.createdAt || nextRecord.createdAt,
    };
  });

  return cleanupCampaignPromptVaultRecords(nextRecords);
}

export function removeCampaignPromptVaultRecord(
  records: CampaignPromptVaultRecord[],
  promptId: string,
): CampaignPromptVaultCleanupResult {
  const nextRecords = cleanupCampaignPromptVaultRecords(records).records.filter(
    (record) => record.promptId !== promptId,
  );
  return cleanupCampaignPromptVaultRecords(nextRecords);
}

function normalizeCampaignPromptVaultRecord(
  record: CampaignPromptVaultRecord,
): CampaignPromptVaultRecord {
  const now = new Date().toISOString();
  const createdAt = stringValue(record.createdAt) || now;

  return {
    promptId: stringValue(record.promptId) || createId("prompt"),
    campaignId: stringValue(record.campaignId),
    campaignName: stringValue(record.campaignName),
    category: stringValue(record.category) || "Custom",
    title: stringValue(record.title) || "Untitled Prompt",
    content: stringValue(record.content),
    input: stringValue(record.input),
    files: stringValue(record.files),
    createdAt,
    updatedAt: stringValue(record.updatedAt) || createdAt,
  };
}

function groupRecordIndexes(
  records: CampaignPromptVaultRecord[],
  getKey: (record: CampaignPromptVaultRecord) => string,
): number[][] {
  const groups = new Map<string, number[]>();
  records.forEach((record, index) => {
    const key = getKey(record);
    if (!key) return;
    groups.set(key, [...(groups.get(key) ?? []), index]);
  });
  return Array.from(groups.values());
}

function getLatestRecordIndex(records: CampaignPromptVaultRecord[], indexes: number[]): number {
  return indexes.reduce((latestIndex, index) => {
    const latestScore = getRecordTimestamp(records[latestIndex]);
    const score = getRecordTimestamp(records[index]);
    return score >= latestScore ? index : latestIndex;
  }, indexes[0]);
}

function getRecordTimestamp(record: CampaignPromptVaultRecord): number {
  return Date.parse(record.updatedAt) || Date.parse(record.createdAt) || 0;
}

function createId(prefix: string): string {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function stringValue(value: unknown): string {
  return value == null ? "" : String(value);
}
