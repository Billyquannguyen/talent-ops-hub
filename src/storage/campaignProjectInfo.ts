import type { CampaignProjectInfoRecord } from "./schema";

export type CampaignProjectInfoCleanupResult = {
  records: CampaignProjectInfoRecord[];
  removedCount: number;
  duplicateIdCount: number;
  duplicateCampaignCount: number;
  emptyRecordCount: number;
};

export function cleanupCampaignProjectInfoRecords(
  records: CampaignProjectInfoRecord[],
): CampaignProjectInfoCleanupResult {
  const validRecords = records
    .filter((record) => record.infoId.trim() || record.campaignId.trim())
    .map(normalizeCampaignProjectInfoRecord);
  const emptyRecordCount = records.length - validRecords.length;
  const removedIndexes = new Set<number>();
  let duplicateIdCount = 0;
  let duplicateCampaignCount = 0;

  for (const group of groupRecordIndexes(validRecords, (record) => record.infoId)) {
    if (group.length <= 1) continue;
    const keepIndex = getLatestRecordIndex(validRecords, group);
    group.forEach((index) => {
      if (index === keepIndex) return;
      removedIndexes.add(index);
      duplicateIdCount += 1;
    });
  }

  for (const group of groupRecordIndexes(validRecords, (record) => record.campaignId)) {
    if (group.length <= 1) continue;
    const keepIndex = getLatestRecordIndex(validRecords, group);
    group.forEach((index) => {
      if (index === keepIndex || removedIndexes.has(index)) return;
      removedIndexes.add(index);
      duplicateCampaignCount += 1;
    });
  }

  return {
    records: validRecords.filter((_, index) => !removedIndexes.has(index)),
    removedCount: emptyRecordCount + duplicateIdCount + duplicateCampaignCount,
    duplicateIdCount,
    duplicateCampaignCount,
    emptyRecordCount,
  };
}

export function upsertCampaignProjectInfoRecord(
  records: CampaignProjectInfoRecord[],
  record: CampaignProjectInfoRecord,
): CampaignProjectInfoCleanupResult {
  const cleaned = cleanupCampaignProjectInfoRecords(records).records;
  const nextRecord = normalizeCampaignProjectInfoRecord(record);
  const sameCampaignIndex = cleaned.findIndex((item) => item.campaignId === nextRecord.campaignId);
  const sameIdIndex = cleaned.findIndex((item) => item.infoId === nextRecord.infoId);
  const updateIndex = sameCampaignIndex >= 0 ? sameCampaignIndex : sameIdIndex;

  if (updateIndex < 0) {
    return cleanupCampaignProjectInfoRecords([...cleaned, nextRecord]);
  }

  const nextRecords = cleaned.map((item, index) => {
    if (index !== updateIndex) return item;
    return {
      ...nextRecord,
      infoId: item.infoId || nextRecord.infoId,
      createdAt: item.createdAt || nextRecord.createdAt,
    };
  });

  return cleanupCampaignProjectInfoRecords(nextRecords);
}

export function removeCampaignProjectInfoRecord(
  records: CampaignProjectInfoRecord[],
  infoId: string,
): CampaignProjectInfoCleanupResult {
  const nextRecords = cleanupCampaignProjectInfoRecords(records).records.filter(
    (record) => record.infoId !== infoId,
  );
  return cleanupCampaignProjectInfoRecords(nextRecords);
}

function normalizeCampaignProjectInfoRecord(
  record: CampaignProjectInfoRecord,
): CampaignProjectInfoRecord {
  const now = new Date().toISOString();
  const campaignId = stringValue(record.campaignId);
  const createdAt = stringValue(record.createdAt) || now;

  return {
    infoId: stringValue(record.infoId) || `project-info-${campaignId || createId()}`,
    campaignId,
    projectBrief: stringValue(record.projectBrief),
    productInformation: stringValue(record.productInformation),
    creatorPersonas: stringValue(record.creatorPersonas),
    sop: stringValue(record.sop),
    scriptFilmingNotes: stringValue(record.scriptFilmingNotes),
    postingFinalisationNotes: stringValue(record.postingFinalisationNotes),
    createdAt,
    updatedAt: stringValue(record.updatedAt) || createdAt,
  };
}

function groupRecordIndexes(
  records: CampaignProjectInfoRecord[],
  getKey: (record: CampaignProjectInfoRecord) => string,
): number[][] {
  const groups = new Map<string, number[]>();
  records.forEach((record, index) => {
    const key = getKey(record);
    if (!key) return;
    groups.set(key, [...(groups.get(key) ?? []), index]);
  });
  return Array.from(groups.values());
}

function getLatestRecordIndex(records: CampaignProjectInfoRecord[], indexes: number[]): number {
  return indexes.reduce((latestIndex, index) => {
    const latestScore = getRecordTimestamp(records[latestIndex]);
    const score = getRecordTimestamp(records[index]);
    return score >= latestScore ? index : latestIndex;
  });
}

function getRecordTimestamp(record: CampaignProjectInfoRecord) {
  return Date.parse(record.updatedAt || record.createdAt) || 0;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
