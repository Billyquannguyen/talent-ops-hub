import type { OutreachTemplateRecord } from "./schema";

export type OutreachTemplateCleanupResult = {
  records: OutreachTemplateRecord[];
  removedCount: number;
  duplicateIdCount: number;
  duplicateNameCount: number;
  emptyRecordCount: number;
};

export function cleanupOutreachTemplateRecords(
  records: OutreachTemplateRecord[],
): OutreachTemplateCleanupResult {
  const validRecords = records
    .filter((record) => record.templateId.trim())
    .map(normalizeOutreachTemplateRecord);
  const emptyRecordCount = records.length - validRecords.length;
  const removedIndexes = new Set<number>();
  let duplicateIdCount = 0;
  let duplicateNameCount = 0;

  for (const group of groupRecordIndexes(validRecords, (record) => record.templateId)) {
    if (group.length <= 1) continue;
    const keepIndex = getLatestRecordIndex(validRecords, group);
    group.forEach((index) => {
      if (index === keepIndex) return;
      removedIndexes.add(index);
      duplicateIdCount += 1;
    });
  }

  for (const group of groupRecordIndexes(validRecords, getTemplateNameKey, removedIndexes)) {
    if (group.length <= 1) continue;
    const keepIndex = getLatestRecordIndex(validRecords, group);
    group.forEach((index) => {
      if (index === keepIndex) return;
      removedIndexes.add(index);
      duplicateNameCount += 1;
    });
  }

  const removedCount = emptyRecordCount + duplicateIdCount + duplicateNameCount;

  return {
    records: validRecords.filter((_, index) => !removedIndexes.has(index)),
    removedCount,
    duplicateIdCount,
    duplicateNameCount,
    emptyRecordCount,
  };
}

export function upsertOutreachTemplateRecord(
  records: OutreachTemplateRecord[],
  record: OutreachTemplateRecord,
): OutreachTemplateCleanupResult {
  const cleaned = cleanupOutreachTemplateRecords(records).records;
  const nextRecord = normalizeOutreachTemplateRecord(record);
  const sameIdIndex = cleaned.findIndex((item) => item.templateId === nextRecord.templateId);

  if (sameIdIndex < 0) {
    return cleanupOutreachTemplateRecords([...cleaned, nextRecord]);
  }

  const nextRecords = cleaned.map((item, index) => {
    if (index !== sameIdIndex) return item;
    return {
      ...nextRecord,
      createdAt: item.createdAt || nextRecord.createdAt,
    };
  });

  return cleanupOutreachTemplateRecords(nextRecords);
}

export function removeOutreachTemplateRecord(
  records: OutreachTemplateRecord[],
  templateId: string,
): OutreachTemplateCleanupResult {
  const nextRecords = cleanupOutreachTemplateRecords(records).records.filter(
    (record) => record.templateId !== templateId,
  );
  return cleanupOutreachTemplateRecords(nextRecords);
}

function normalizeOutreachTemplateRecord(record: OutreachTemplateRecord): OutreachTemplateRecord {
  const now = new Date().toISOString();
  const createdAt = stringValue(record.createdAt) || now;

  return {
    templateId: stringValue(record.templateId),
    templateName: stringValue(record.templateName) || "Untitled Template",
    type: record.type === "Email" ? "Email" : "DM",
    body: stringValue(record.body),
    createdAt,
    updatedAt: stringValue(record.updatedAt) || createdAt,
  };
}

function groupRecordIndexes(
  records: OutreachTemplateRecord[],
  getKey: (record: OutreachTemplateRecord) => string,
  removedIndexes = new Set<number>(),
): number[][] {
  const groups = new Map<string, number[]>();
  records.forEach((record, index) => {
    if (removedIndexes.has(index)) return;
    const key = getKey(record);
    if (!key) return;
    groups.set(key, [...(groups.get(key) ?? []), index]);
  });
  return Array.from(groups.values());
}

function getTemplateNameKey(record: OutreachTemplateRecord): string {
  const templateName = record.templateName.trim().toLowerCase();
  if (!templateName) return "";
  return `${record.type}::${templateName}`;
}

function getLatestRecordIndex(records: OutreachTemplateRecord[], indexes: number[]): number {
  return indexes.reduce((latestIndex, index) => {
    const latestScore = getRecordTimestamp(records[latestIndex]);
    const score = getRecordTimestamp(records[index]);
    return score >= latestScore ? index : latestIndex;
  }, indexes[0]);
}

function getRecordTimestamp(record: OutreachTemplateRecord): number {
  return Date.parse(record.updatedAt) || Date.parse(record.createdAt) || 0;
}

function stringValue(value: unknown): string {
  return value == null ? "" : String(value);
}
