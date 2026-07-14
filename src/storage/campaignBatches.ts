import type { CampaignBatchRecord } from "./schema";

export type CampaignBatchCleanupResult = {
  records: CampaignBatchRecord[];
  removedCount: number;
  duplicateIdCount: number;
  duplicateCodeCount: number;
  emptyRecordCount: number;
};

export function cleanupCampaignBatchRecords(
  records: CampaignBatchRecord[],
): CampaignBatchCleanupResult {
  const validRecords = records
    .filter(
      (record) => record.batchId?.trim() && record.campaignId?.trim() && record.projectCode?.trim(),
    )
    .map(normalizeCampaignBatchRecord);
  const emptyRecordCount = records.length - validRecords.length;
  const removedIndexes = new Set<number>();
  let duplicateIdCount = 0;
  let duplicateCodeCount = 0;

  markOlderDuplicates(
    validRecords,
    (record) => record.batchId,
    removedIndexes,
    () => {
      duplicateIdCount += 1;
    },
  );
  markOlderDuplicates(
    validRecords,
    (record) => `${record.campaignId}::${record.projectCode.toUpperCase()}`,
    removedIndexes,
    () => {
      duplicateCodeCount += 1;
    },
  );

  const deduped = validRecords.filter((_, index) => !removedIndexes.has(index));
  const normalizedDefaults = normalizeDefaultBatches(deduped);

  return {
    records: normalizedDefaults,
    removedCount: emptyRecordCount + removedIndexes.size,
    duplicateIdCount,
    duplicateCodeCount,
    emptyRecordCount,
  };
}

export function upsertCampaignBatchRecord(
  records: CampaignBatchRecord[],
  record: CampaignBatchRecord,
): CampaignBatchCleanupResult {
  const cleaned = cleanupCampaignBatchRecords(records).records;
  const nextRecord = normalizeCampaignBatchRecord(record);
  const sameIdIndex = cleaned.findIndex((item) => item.batchId === nextRecord.batchId);
  const nextRecords =
    sameIdIndex < 0
      ? [...cleaned, nextRecord]
      : cleaned.map((item, index) =>
          index === sameIdIndex
            ? { ...nextRecord, createdAt: item.createdAt || nextRecord.createdAt }
            : item,
        );

  const withSingleDefault =
    nextRecord.isDefault === "TRUE"
      ? nextRecords.map((item) =>
          item.campaignId === nextRecord.campaignId
            ? { ...item, isDefault: item.batchId === nextRecord.batchId ? "TRUE" : "FALSE" }
            : item,
        )
      : nextRecords;

  return cleanupCampaignBatchRecords(withSingleDefault);
}

export function removeCampaignBatchRecord(
  records: CampaignBatchRecord[],
  batchId: string,
): CampaignBatchCleanupResult {
  const nextRecords = cleanupCampaignBatchRecords(records).records.filter(
    (record) => record.batchId !== batchId,
  );
  return cleanupCampaignBatchRecords(nextRecords);
}

export function createCampaignBatchRecord(input: {
  campaignId: string;
  projectCode: string;
  batchName?: string;
  isDefault?: boolean;
}): CampaignBatchRecord {
  const now = new Date().toISOString();
  return {
    batchId: createBatchId(),
    campaignId: input.campaignId.trim(),
    projectCode: input.projectCode.trim().toUpperCase(),
    batchName: input.batchName?.trim() || input.projectCode.trim().toUpperCase(),
    isDefault: input.isDefault ? "TRUE" : "FALSE",
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeCampaignBatchRecord(record: CampaignBatchRecord): CampaignBatchRecord {
  const now = new Date().toISOString();
  const createdAt = stringValue(record.createdAt) || now;
  return {
    batchId: stringValue(record.batchId),
    campaignId: stringValue(record.campaignId),
    projectCode: stringValue(record.projectCode).toUpperCase(),
    batchName: stringValue(record.batchName) || stringValue(record.projectCode).toUpperCase(),
    isDefault: isTruthy(record.isDefault) ? "TRUE" : "FALSE",
    status: stringValue(record.status) || "active",
    createdAt,
    updatedAt: stringValue(record.updatedAt) || createdAt,
  };
}

function normalizeDefaultBatches(records: CampaignBatchRecord[]): CampaignBatchRecord[] {
  const byCampaign = new Map<string, CampaignBatchRecord[]>();
  records.forEach((record) => {
    byCampaign.set(record.campaignId, [...(byCampaign.get(record.campaignId) ?? []), record]);
  });

  return records.map((record) => {
    const campaignRecords = byCampaign.get(record.campaignId) ?? [];
    const defaults = campaignRecords.filter((item) => item.isDefault === "TRUE");
    const selectedDefault = defaults.length
      ? defaults.reduce(getNewerRecord)
      : (campaignRecords.find((item) => item.status.toLowerCase() === "active") ??
        campaignRecords[0]);
    return { ...record, isDefault: record.batchId === selectedDefault?.batchId ? "TRUE" : "FALSE" };
  });
}

function markOlderDuplicates(
  records: CampaignBatchRecord[],
  getKey: (record: CampaignBatchRecord) => string,
  removedIndexes: Set<number>,
  onRemoved: () => void,
) {
  const groups = new Map<string, number[]>();
  records.forEach((record, index) => {
    const key = getKey(record);
    groups.set(key, [...(groups.get(key) ?? []), index]);
  });
  groups.forEach((indexes) => {
    if (indexes.length <= 1) return;
    const keepIndex = indexes.reduce((latestIndex, index) =>
      getTimestamp(records[index]) >= getTimestamp(records[latestIndex]) ? index : latestIndex,
    );
    indexes.forEach((index) => {
      if (index === keepIndex || removedIndexes.has(index)) return;
      removedIndexes.add(index);
      onRemoved();
    });
  });
}

function getNewerRecord(a: CampaignBatchRecord, b: CampaignBatchRecord) {
  return getTimestamp(b) >= getTimestamp(a) ? b : a;
}

function getTimestamp(record: CampaignBatchRecord): number {
  return Date.parse(record.updatedAt) || Date.parse(record.createdAt) || 0;
}

function isTruthy(value: unknown): boolean {
  return ["true", "1", "yes"].includes(stringValue(value).toLowerCase());
}

function createBatchId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? `batch-${crypto.randomUUID()}`
    : `batch-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function stringValue(value: unknown): string {
  return value == null ? "" : String(value).trim();
}
