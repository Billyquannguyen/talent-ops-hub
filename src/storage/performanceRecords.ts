import type { PerformanceBenchmarkRecord, PerformanceWeeklyInputRecord } from "./schema";

export type PerformanceBenchmarkCleanupResult = {
  records: PerformanceBenchmarkRecord[];
  removedCount: number;
  duplicateCampaignRows: number;
};

export type PerformanceWeeklyInputCleanupResult = {
  records: PerformanceWeeklyInputRecord[];
  removedCount: number;
  duplicateSnapshotRows: number;
};

export function cleanupPerformanceBenchmarkRecords(
  records: PerformanceBenchmarkRecord[],
): PerformanceBenchmarkCleanupResult {
  const normalized = records.map(normalizePerformanceBenchmarkRecord);
  const keepIndexes = getLatestIndexes(normalized, (record) => record.campaignId);
  const cleaned = normalized.filter((_, index) => keepIndexes.has(index));

  return {
    records: cleaned,
    removedCount: normalized.length - cleaned.length,
    duplicateCampaignRows: normalized.length - cleaned.length,
  };
}

export function upsertPerformanceBenchmarkRecord(
  records: PerformanceBenchmarkRecord[],
  record: PerformanceBenchmarkRecord,
): PerformanceBenchmarkCleanupResult {
  const cleaned = cleanupPerformanceBenchmarkRecords(records).records;
  const nextRecord = normalizePerformanceBenchmarkRecord(record);
  const existingIndex = cleaned.findIndex((item) => item.campaignId === nextRecord.campaignId);

  if (existingIndex === -1) {
    return cleanupPerformanceBenchmarkRecords([...cleaned, nextRecord]);
  }

  const nextRecords = [...cleaned];
  nextRecords[existingIndex] = {
    ...nextRecord,
    benchmarkId: cleaned[existingIndex].benchmarkId || nextRecord.benchmarkId,
    createdAt: cleaned[existingIndex].createdAt || nextRecord.createdAt,
  };

  return cleanupPerformanceBenchmarkRecords(nextRecords);
}

export function cleanupPerformanceWeeklyInputRecords(
  records: PerformanceWeeklyInputRecord[],
): PerformanceWeeklyInputCleanupResult {
  const normalized = records.map(normalizePerformanceWeeklyInputRecord);
  const keepIndexes = getLatestIndexes(
    normalized,
    (record) => `${record.campaignId}::${record.weekStart}`,
  );
  const cleaned = normalized.filter((_, index) => keepIndexes.has(index));

  return {
    records: cleaned,
    removedCount: normalized.length - cleaned.length,
    duplicateSnapshotRows: normalized.length - cleaned.length,
  };
}

export function upsertPerformanceWeeklyInputRecord(
  records: PerformanceWeeklyInputRecord[],
  record: PerformanceWeeklyInputRecord,
): PerformanceWeeklyInputCleanupResult {
  const cleaned = cleanupPerformanceWeeklyInputRecords(records).records;
  const nextRecord = normalizePerformanceWeeklyInputRecord(record);
  const existingIndex = cleaned.findIndex(
    (item) => item.campaignId === nextRecord.campaignId && item.weekStart === nextRecord.weekStart,
  );

  if (existingIndex === -1) {
    return cleanupPerformanceWeeklyInputRecords([...cleaned, nextRecord]);
  }

  const nextRecords = [...cleaned];
  nextRecords[existingIndex] = {
    ...nextRecord,
    inputId: cleaned[existingIndex].inputId || nextRecord.inputId,
    createdAt: cleaned[existingIndex].createdAt || nextRecord.createdAt,
  };

  return cleanupPerformanceWeeklyInputRecords(nextRecords);
}

function normalizePerformanceBenchmarkRecord(
  record: PerformanceBenchmarkRecord,
): PerformanceBenchmarkRecord {
  const now = new Date().toISOString();
  const createdAt = stringValue(record.createdAt) || now;
  const campaignId = stringValue(record.campaignId);

  return {
    benchmarkId: stringValue(record.benchmarkId) || `benchmark-${campaignId}`,
    campaignId,
    includeInPerformance: normalizeBooleanString(record.includeInPerformance, true),
    teamSize: Math.max(1, numberValue(record.teamSize) || 1),
    targetDailyOutreach: numberValue(record.targetDailyOutreach) || 25,
    teamOutreachExcludingMe: numberValue(record.teamOutreachExcludingMe),
    teamSubmissionsExcludingMe: numberValue(record.teamSubmissionsExcludingMe),
    teamApprovalsExcludingMe: numberValue(record.teamApprovalsExcludingMe),
    createdAt,
    updatedAt: stringValue(record.updatedAt) || createdAt,
  };
}

function normalizePerformanceWeeklyInputRecord(
  record: PerformanceWeeklyInputRecord,
): PerformanceWeeklyInputRecord {
  const now = new Date().toISOString();
  const createdAt = stringValue(record.createdAt) || now;
  const campaignId = stringValue(record.campaignId);
  const weekStart = stringValue(record.weekStart);
  const month = stringValue(record.month) || weekStart.slice(0, 7);

  return {
    inputId: stringValue(record.inputId) || `snapshot-${campaignId}-${weekStart}`,
    month,
    weekStart,
    campaignId,
    myOutreachVolume: numberValue(record.myOutreachVolume),
    myCreatorSubmissions: numberValue(record.myCreatorSubmissions),
    myCreatorApprovals: numberValue(record.myCreatorApprovals),
    myCampaignExecutions: numberValue(record.myCampaignExecutions),
    expectedProfit: numberValue(record.expectedProfit),
    actualProfit: numberValue(record.actualProfit),
    outreachScore: numberValue(record.outreachScore),
    submissionScore: numberValue(record.submissionScore),
    approvalScore: numberValue(record.approvalScore),
    executionScore: numberValue(record.executionScore),
    weeklyScore: numberValue(record.weeklyScore),
    createdAt,
    updatedAt: stringValue(record.updatedAt) || createdAt,
  };
}

function getLatestIndexes<T>(records: T[], getKey: (record: T) => string) {
  const latestByKey = new Map<string, number>();

  records.forEach((record, index) => {
    const key = getKey(record);
    if (!key || key.endsWith("::")) return;
    const currentIndex = latestByKey.get(key);
    if (currentIndex === undefined) {
      latestByKey.set(key, index);
      return;
    }
    if (getUpdatedAt(record) >= getUpdatedAt(records[currentIndex])) {
      latestByKey.set(key, index);
    }
  });

  return new Set(latestByKey.values());
}

function getUpdatedAt(record: unknown) {
  if (!isRecord(record)) return 0;
  const time = Date.parse(stringValue(record.updatedAt) || stringValue(record.createdAt));
  return Number.isFinite(time) ? time : 0;
}

function normalizeBooleanString(value: unknown, fallback: boolean) {
  const normalized = stringValue(value).trim().toLowerCase();
  if (["true", "yes", "1", "included", "include"].includes(normalized)) return "TRUE";
  if (["false", "no", "0", "disabled", "exclude", "excluded"].includes(normalized)) {
    return "FALSE";
  }
  return fallback ? "TRUE" : "FALSE";
}

function numberValue(value: unknown) {
  const numeric = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
}

function stringValue(value: unknown) {
  return String(value ?? "").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
