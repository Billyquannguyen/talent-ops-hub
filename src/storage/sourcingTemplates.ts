import type { SourcingTemplateRecord } from "./schema";

export type SourcingTemplateCleanupResult = {
  records: SourcingTemplateRecord[];
  removedCount: number;
  removedInactiveCount: number;
  duplicateIdCount: number;
  duplicateNameCount: number;
  inactiveCount: number;
};

export type SourcingTemplateContactsMigrationResult = {
  records: SourcingTemplateRecord[];
  changedTemplateCount: number;
  convertedColumnCount: number;
  templatesWithBothEmailAndContacts: string[];
  invalidColumnsJsonTemplateIds: string[];
};

export function isActiveSourcingTemplateRecord(record: SourcingTemplateRecord): boolean {
  return normalizeActiveFlag(record.isActive);
}

export function cleanupSourcingTemplateRecords(
  records: SourcingTemplateRecord[],
): SourcingTemplateCleanupResult {
  const activeRecords = records.filter(isActiveSourcingTemplateRecord).map((record) => ({
    ...record,
    isActive: "TRUE",
  }));
  const removedIndexes = new Set<number>();
  const removedInactiveCount = records.length - activeRecords.length;
  let duplicateIdCount = 0;
  let duplicateNameCount = 0;

  for (const group of groupRecordIndexes(activeRecords, (record) => record.id, removedIndexes)) {
    if (group.length <= 1) continue;
    const keepIndex = getLatestRecordIndex(activeRecords, group);
    group.forEach((index) => {
      if (index === keepIndex) return;
      removedIndexes.add(index);
      duplicateIdCount += 1;
    });
  }

  for (const group of groupRecordIndexes(
    activeRecords,
    getCampaignTemplateNameKey,
    removedIndexes,
  )) {
    if (group.length <= 1) continue;
    const keepIndex = getLatestRecordIndex(activeRecords, group);
    group.forEach((index) => {
      if (index === keepIndex) return;
      removedIndexes.add(index);
      duplicateNameCount += 1;
    });
  }

  const removedCount = removedInactiveCount + duplicateIdCount + duplicateNameCount;

  return {
    records: activeRecords.filter((_, index) => !removedIndexes.has(index)),
    removedCount,
    removedInactiveCount,
    inactiveCount: removedCount,
    duplicateIdCount,
    duplicateNameCount,
  };
}

export function upsertSourcingTemplateRecord(
  records: SourcingTemplateRecord[],
  record: SourcingTemplateRecord,
): SourcingTemplateCleanupResult {
  const cleaned = cleanupSourcingTemplateRecords(records).records;
  const sameIdIndex = cleaned.findIndex((item) => item.id === record.id);

  const activeRecord = {
    ...record,
    isActive: "TRUE",
  };

  if (sameIdIndex < 0) {
    return cleanupSourcingTemplateRecords([...cleaned, activeRecord]);
  }

  const nextRecords = cleaned.map((item, index) => {
    if (index === sameIdIndex) {
      return {
        ...activeRecord,
        createdAt: item.createdAt || activeRecord.createdAt,
      };
    }

    return item;
  });

  return cleanupSourcingTemplateRecords(nextRecords);
}

export function removeSourcingTemplateRecord(
  records: SourcingTemplateRecord[],
  templateId: string,
): SourcingTemplateCleanupResult {
  const nextRecords = cleanupSourcingTemplateRecords(records).records.filter(
    (record) => record.id !== templateId,
  );
  return cleanupSourcingTemplateRecords(nextRecords);
}

export function migrateSourcingTemplateContactsRecords(
  records: SourcingTemplateRecord[],
): SourcingTemplateContactsMigrationResult {
  let changedTemplateCount = 0;
  let convertedColumnCount = 0;
  const templatesWithBothEmailAndContacts: string[] = [];
  const invalidColumnsJsonTemplateIds: string[] = [];

  const nextRecords = records.map((record) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(record.columnsJson || "[]");
    } catch {
      invalidColumnsJsonTemplateIds.push(record.id);
      return record;
    }
    if (!Array.isArray(parsed)) {
      invalidColumnsJsonTemplateIds.push(record.id);
      return record;
    }

    const hasEmailColumn = parsed.some(isLegacyEmailTemplateColumn);
    const hasContactsColumn = parsed.some(isContactsTemplateColumnRecord);
    if (hasEmailColumn && hasContactsColumn) {
      templatesWithBothEmailAndContacts.push(record.id);
    }

    let changed = false;
    const columns = parsed.map((value) => {
      if (!isRecord(value) || !isLegacyEmailTemplateColumn(value)) return value;
      changed = true;
      convertedColumnCount += 1;
      const nextColumn = { ...value, blockType: "contacts" };
      delete nextColumn.fieldKey;
      delete nextColumn.sourceField;
      delete nextColumn.sourceEasyKolField;
      return nextColumn;
    });

    if (!changed) return record;
    changedTemplateCount += 1;
    return {
      ...record,
      columnsJson: JSON.stringify(columns),
      updatedAt: new Date().toISOString(),
    };
  });

  return {
    records: nextRecords,
    changedTemplateCount,
    convertedColumnCount,
    templatesWithBothEmailAndContacts,
    invalidColumnsJsonTemplateIds,
  };
}

function isLegacyEmailTemplateColumn(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const source =
    value.fieldKey ?? value.sourceField ?? value.sourceEasyKolField ?? value.sourceBlock;
  return normalizeTemplateValue(source) === "email";
}

function isContactsTemplateColumnRecord(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    normalizeTemplateValue(value.blockType ?? value.type ?? value.sourceType) === "contacts" ||
    normalizeTemplateValue(value.label ?? value.outputColumnName ?? value.outputName) === "contacts"
  );
}

function normalizeTemplateValue(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function groupRecordIndexes(
  records: SourcingTemplateRecord[],
  getKey: (record: SourcingTemplateRecord) => string,
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
