import crypto from "node:crypto";
import process from "node:process";

import {
  centralDatabaseName,
  centralWorksheetNames,
  createEmptyCentralDatabase,
  requiredWorksheetHeaders,
  worksheetHeaderAliases,
  type ActiveCampaignCreatorRecord,
  type AgencyDatabaseRecord,
  type AppSettingRecord,
  type CampaignMemoryCardRecord,
  type CampaignPromptVaultRecord,
  type CampaignProfileRecord,
  type CentralAppDatabase,
  type CentralWorksheetName,
  type CreatorDatabaseRecord,
  type EmployeeProfileRecord,
  type OutreachTemplateRecord,
  type SourcingTemplateRecord,
  type StorageDiagnostic,
} from "./schema";
import {
  cleanupSourcingTemplateRecords,
  isActiveSourcingTemplateRecord,
  removeSourcingTemplateRecord,
  upsertSourcingTemplateRecord,
} from "./sourcingTemplates";
import {
  cleanupOutreachTemplateRecords,
  removeOutreachTemplateRecord,
  upsertOutreachTemplateRecord,
} from "./outreachTemplates";
import {
  cleanupCampaignMemoryCardRecords,
  removeCampaignMemoryCardRecord,
  replaceCampaignMemoryCardsForCampaign,
  upsertCampaignMemoryCardRecord,
} from "./campaignMemoryCards";
import {
  cleanupActiveCampaignCreatorRecords,
  removeActiveCampaignCreatorRecord,
  upsertActiveCampaignCreatorRecord,
} from "./activeCampaignCreators";
import { cleanupEmployeeProfileRecords, upsertEmployeeProfileRecord } from "./employeeProfiles";
import {
  cleanupCampaignPromptVaultRecords,
  removeCampaignPromptVaultRecord,
  upsertCampaignPromptVaultRecord,
} from "./campaignPromptVault";

type GoogleSheetsConfig = {
  spreadsheetId: string;
  serviceAccountEmail: string;
  privateKey: string;
  missing: string[];
};

type SpreadsheetMetadata = {
  spreadsheetId: string;
  spreadsheetUrl?: string;
  properties?: { title?: string };
  sheets?: Array<{
    properties: {
      sheetId: number;
      title: string;
      gridProperties?: { rowCount?: number; columnCount?: number };
    };
  }>;
};

type SheetRows = Record<string, string>[];
type SheetRecordWithRowNumber<T> = {
  record: T;
  rowNumber: number;
};

const scopes = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.file",
];

const rowIdFields: Record<CentralWorksheetName, string> = {
  CampaignProfiles: "campaignId",
  SourcingTemplates: "id",
  OutreachTemplates: "templateId",
  CampaignMemoryCards: "cardId",
  ActiveCampaignCreators: "recordId",
  AgencyDatabase: "id",
  CreatorDatabase: "id",
  EmployeeProfiles: "profileId",
  CampaignPromptVault: "promptId",
  AppSettings: "settingKey",
};

let tokenCache: { accessToken: string; expiresAt: number } | null = null;
const databaseReadCacheTtlMs = 45_000;
const valuesReadCacheTtlMs = 60_000;
const databaseShapeCacheTtlMs = 5 * 60_000;
let databaseReadCache: {
  spreadsheetId: string;
  database: CentralAppDatabase;
  expiresAt: number;
} | null = null;
let databaseReadPromise: {
  spreadsheetId: string;
  promise: Promise<CentralAppDatabase>;
} | null = null;
let creatorSourcingReadCache: {
  spreadsheetId: string;
  database: CentralAppDatabase;
  expiresAt: number;
} | null = null;
let creatorSourcingReadPromise: {
  spreadsheetId: string;
  promise: Promise<CentralAppDatabase>;
} | null = null;
let databaseShapeCache: { spreadsheetId: string; expiresAt: number } | null = null;
const valuesReadCache = new Map<string, { values: unknown[][]; expiresAt: number }>();
const valuesReadPromises = new Map<string, Promise<unknown[][]>>();

export function getGoogleSheetsServerStatus() {
  const config = readConfig();
  return {
    source: "googleSheets" as const,
    shared: true,
    configured: config.missing.length === 0,
    spreadsheetId: config.spreadsheetId,
    spreadsheetName: centralDatabaseName,
    diagnostics:
      config.missing.length === 0
        ? [
            {
              level: "info" as const,
              message: "Google Sheets credentials are configured.",
            },
          ]
        : [
            {
              level: "warning" as const,
              message: `Google Sheets pending configuration. Missing: ${config.missing.join(", ")}`,
              missingHeaders: config.missing,
            },
          ],
  };
}

export async function readCentralDatabaseFromGoogleSheets(options: { reason?: string } = {}) {
  const config = assertConfigured();
  const spreadsheetId = await resolveSpreadsheetId(config);
  const now = Date.now();
  const reason = options.reason ?? "unspecified";

  if (
    databaseReadCache &&
    databaseReadCache.spreadsheetId === spreadsheetId &&
    databaseReadCache.expiresAt > now
  ) {
    logGoogleSheetsCache("database-cache-hit", {
      reason,
      ttlMs: databaseReadCache.expiresAt - now,
    });
    return cloneDatabase(databaseReadCache.database);
  }

  if (databaseReadPromise && databaseReadPromise.spreadsheetId === spreadsheetId) {
    logGoogleSheetsCache("database-inflight-reuse", { reason });
    return cloneDatabase(await databaseReadPromise.promise);
  }

  const promise = readCentralDatabaseFromGoogleSheetsUncached(spreadsheetId, reason).finally(() => {
    if (databaseReadPromise?.promise === promise) databaseReadPromise = null;
  });
  databaseReadPromise = { spreadsheetId, promise };
  return cloneDatabase(await promise);
}

async function readCentralDatabaseFromGoogleSheetsUncached(spreadsheetId: string, reason: string) {
  logGoogleSheetsCache("database-cache-miss", { reason });
  await ensureDatabaseShape(spreadsheetId);

  const rowsBySheet = await readWorksheetRowsBatch(spreadsheetId, centralWorksheetNames);

  const database = rowsToDatabase(rowsBySheet);
  databaseReadCache = {
    spreadsheetId,
    database: cloneDatabase(database),
    expiresAt: Date.now() + databaseReadCacheTtlMs,
  };
  return database;
}

async function readWorksheetSubsetFromGoogleSheets(
  spreadsheetId: string,
  worksheetNames: CentralWorksheetName[],
  reason: string,
) {
  logGoogleSheetsCache("worksheet-subset-cache-miss", {
    reason,
    worksheets: worksheetNames.join(","),
  });
  await ensureDatabaseShape(spreadsheetId);

  const rowsBySheet = createEmptyRowsBySheet();
  const subsetRows = await readWorksheetRowsBatch(spreadsheetId, worksheetNames);
  for (const worksheetName of worksheetNames) {
    rowsBySheet[worksheetName] = subsetRows[worksheetName] ?? [];
  }

  return rowsToDatabase(rowsBySheet);
}

export async function writeCentralDatabaseToGoogleSheets(database: CentralAppDatabase) {
  const config = assertConfigured();
  const spreadsheetId = await resolveSpreadsheetId(config);
  await ensureDatabaseShape(spreadsheetId);
  const databaseToSave = cloneDatabase(database);
  const sourcingCleanup = cleanupSourcingTemplateRecords(
    databaseToSave.worksheets.SourcingTemplates,
  );
  databaseToSave.worksheets.SourcingTemplates = sourcingCleanup.records;
  logSourcingTemplateCleanupSummary("full-database-write", sourcingCleanup);

  for (const worksheetName of centralWorksheetNames) {
    await replaceWorksheetRows(
      spreadsheetId,
      worksheetName,
      getRowsForWorksheet(databaseToSave, worksheetName),
    );
  }

  const savedDatabase = cloneDatabase(databaseToSave);
  databaseReadCache = {
    spreadsheetId,
    database: savedDatabase,
    expiresAt: Date.now() + databaseReadCacheTtlMs,
  };
  logGoogleSheetsCache("database-cache-refreshed-after-write", {
    worksheets: centralWorksheetNames.length,
  });
  return cloneDatabase(savedDatabase);
}

export async function readCreatorOutreachBundleFromGoogleSheets() {
  const config = assertConfigured();
  const spreadsheetId = await resolveSpreadsheetId(config);
  const database = await readWorksheetSubsetFromGoogleSheets(
    spreadsheetId,
    ["CampaignProfiles", "OutreachTemplates", "CampaignMemoryCards"],
    "creator-outreach:bundle",
  );

  return {
    campaignProfiles: database.worksheets.CampaignProfiles,
    outreachTemplates: database.worksheets.OutreachTemplates,
    campaignMemoryCards: database.worksheets.CampaignMemoryCards,
  };
}

export async function readActiveCampaignsBundleFromGoogleSheets() {
  const config = assertConfigured();
  const spreadsheetId = await resolveSpreadsheetId(config);
  const database = await readWorksheetSubsetFromGoogleSheets(
    spreadsheetId,
    ["CampaignProfiles", "ActiveCampaignCreators"],
    "active-campaigns:bundle",
  );

  return {
    campaignProfiles: database.worksheets.CampaignProfiles,
    activeCampaignCreators: database.worksheets.ActiveCampaignCreators,
  };
}

export async function readPromptVaultBundleFromGoogleSheets() {
  const config = assertConfigured();
  const spreadsheetId = await resolveSpreadsheetId(config);
  const database = await readWorksheetSubsetFromGoogleSheets(
    spreadsheetId,
    ["CampaignProfiles", "CampaignPromptVault", "AppSettings"],
    "prompt-vault:bundle",
  );

  return {
    campaignProfiles: database.worksheets.CampaignProfiles,
    campaignPromptVault: database.worksheets.CampaignPromptVault,
    appSettings: database.worksheets.AppSettings,
  };
}

export async function readCreatorSourcingDatabaseFromGoogleSheets(
  options: { reason?: string } = {},
) {
  const config = assertConfigured();
  const spreadsheetId = await resolveSpreadsheetId(config);
  const now = Date.now();
  const reason = options.reason ?? "creator-sourcing";

  if (
    creatorSourcingReadCache &&
    creatorSourcingReadCache.spreadsheetId === spreadsheetId &&
    creatorSourcingReadCache.expiresAt > now
  ) {
    logGoogleSheetsCache("creator-sourcing-cache-hit", {
      reason,
      ttlMs: creatorSourcingReadCache.expiresAt - now,
    });
    return cloneDatabase(creatorSourcingReadCache.database);
  }

  if (creatorSourcingReadPromise && creatorSourcingReadPromise.spreadsheetId === spreadsheetId) {
    logGoogleSheetsCache("creator-sourcing-inflight-reuse", { reason });
    return cloneDatabase(await creatorSourcingReadPromise.promise);
  }

  const promise = readCreatorSourcingDatabaseFromGoogleSheetsUncached(
    spreadsheetId,
    reason,
  ).finally(() => {
    if (creatorSourcingReadPromise?.promise === promise) creatorSourcingReadPromise = null;
  });
  creatorSourcingReadPromise = { spreadsheetId, promise };
  return cloneDatabase(await promise);
}

export async function listCampaignProfilesInGoogleSheets() {
  const config = assertConfigured();
  const spreadsheetId = await resolveSpreadsheetId(config);
  await ensureDatabaseShape(spreadsheetId);

  const records = (await readWorksheetRows(
    spreadsheetId,
    "CampaignProfiles",
  )) as CampaignProfileRecord[];

  return {
    records,
  };
}

export async function migrateAgencyDatabaseContactsInGoogleSheets() {
  const config = assertConfigured();
  const spreadsheetId = await resolveSpreadsheetId(config);
  await ensureDatabaseShape(spreadsheetId);

  const sourceValues = await readValues(
    spreadsheetId,
    `${quoteSheetName("AgencyDatabase")}!A1:Z1000`,
  );
  const backupSheetName = await createWorksheetBackup(
    spreadsheetId,
    "AgencyDatabase",
    sourceValues,
  );
  const records = (await readWorksheetRows(
    spreadsheetId,
    "AgencyDatabase",
  )) as AgencyDatabaseRecord[];

  let rowsBackfilled = 0;
  let rowsWithExistingContactsJson = 0;
  const migratedRecords = records.map((record) => {
    if (stringValue(record.contactsJson).trim()) {
      rowsWithExistingContactsJson += 1;
      return record;
    }

    const contact = createAgencyContactValue(record);
    if (!record.contactName && !record.contactRole && !contact) return record;

    rowsBackfilled += 1;
    return {
      ...record,
      contact: stringValue(record.contact) || contact,
      contactsJson: JSON.stringify([
        {
          id: `contact-${record.id || Date.now()}`,
          name: stringValue(record.contactName),
          role: stringValue(record.contactRole),
          contact,
        },
      ]),
    };
  });

  await replaceWorksheetRows(spreadsheetId, "AgencyDatabase", migratedRecords);
  invalidateDatabaseReadCache("agency-database-contact-migration");

  return {
    records: migratedRecords,
    report: {
      backupSheetName,
      rowsRead: records.length,
      rowsBackfilled,
      rowsWithExistingContactsJson,
    },
  };
}

export async function listAgencyDatabaseInGoogleSheets() {
  const config = assertConfigured();
  const spreadsheetId = await resolveSpreadsheetId(config);
  await ensureDatabaseShape(spreadsheetId);

  return {
    records: await readNormalizedWorksheetRecords<AgencyDatabaseRecord>(
      spreadsheetId,
      "AgencyDatabase",
    ),
  };
}

export async function upsertAgencyDatabaseInGoogleSheets(record: AgencyDatabaseRecord) {
  const config = assertConfigured();
  const spreadsheetId = await resolveSpreadsheetId(config);
  await ensureDatabaseShape(spreadsheetId);

  const agencyRows = await readWorksheetRecordsWithRowNumbers<AgencyDatabaseRecord>(
    spreadsheetId,
    "AgencyDatabase",
  );
  const records = normalizeWorksheetRecords(
    "AgencyDatabase",
    agencyRows.rows.map((row) => row.record as Record<string, unknown>),
  ) as AgencyDatabaseRecord[];
  const nextRecord = (
    normalizeWorksheetRecords("AgencyDatabase", [
      record as Record<string, unknown>,
    ]) as AgencyDatabaseRecord[]
  )[0];
  const existingIndex = records.findIndex((item) => item.id === nextRecord.id);
  const nextRows =
    existingIndex === -1
      ? [nextRecord, ...records]
      : records.map((item, index) => (index === existingIndex ? nextRecord : item));

  await writeCurrentStateWorksheetRows(spreadsheetId, "AgencyDatabase", agencyRows, nextRows);
  invalidateDatabaseReadCache("agency-database-targeted-write");

  return { records: nextRows };
}

export async function deleteAgencyDatabaseInGoogleSheets(recordId: string) {
  const config = assertConfigured();
  const spreadsheetId = await resolveSpreadsheetId(config);
  await ensureDatabaseShape(spreadsheetId);

  const agencyRows = await readWorksheetRecordsWithRowNumbers<AgencyDatabaseRecord>(
    spreadsheetId,
    "AgencyDatabase",
  );
  const records = normalizeWorksheetRecords(
    "AgencyDatabase",
    agencyRows.rows.map((row) => row.record as Record<string, unknown>),
  ) as AgencyDatabaseRecord[];
  const nextRows = records.filter((record) => record.id !== recordId);

  await writeCurrentStateWorksheetRows(spreadsheetId, "AgencyDatabase", agencyRows, nextRows);
  invalidateDatabaseReadCache("agency-database-targeted-delete");

  return { records: nextRows };
}

export async function listCreatorDatabaseInGoogleSheets() {
  const config = assertConfigured();
  const spreadsheetId = await resolveSpreadsheetId(config);
  await ensureDatabaseShape(spreadsheetId);

  return {
    records: await readNormalizedWorksheetRecords<CreatorDatabaseRecord>(
      spreadsheetId,
      "CreatorDatabase",
    ),
  };
}

export async function upsertCreatorDatabaseInGoogleSheets(record: CreatorDatabaseRecord) {
  const config = assertConfigured();
  const spreadsheetId = await resolveSpreadsheetId(config);
  await ensureDatabaseShape(spreadsheetId);

  const creatorRows = await readWorksheetRecordsWithRowNumbers<CreatorDatabaseRecord>(
    spreadsheetId,
    "CreatorDatabase",
  );
  const records = normalizeWorksheetRecords(
    "CreatorDatabase",
    creatorRows.rows.map((row) => row.record as Record<string, unknown>),
  ) as CreatorDatabaseRecord[];
  const nextRecord = (
    normalizeWorksheetRecords("CreatorDatabase", [
      record as Record<string, unknown>,
    ]) as CreatorDatabaseRecord[]
  )[0];
  const existingIndex = records.findIndex((item) => item.id === nextRecord.id);
  const nextRows =
    existingIndex === -1
      ? [nextRecord, ...records]
      : records.map((item, index) => (index === existingIndex ? nextRecord : item));

  await writeCurrentStateWorksheetRows(spreadsheetId, "CreatorDatabase", creatorRows, nextRows);
  invalidateDatabaseReadCache("creator-database-targeted-write");

  return { records: nextRows };
}

export async function deleteCreatorDatabaseInGoogleSheets(recordId: string) {
  const config = assertConfigured();
  const spreadsheetId = await resolveSpreadsheetId(config);
  await ensureDatabaseShape(spreadsheetId);

  const creatorRows = await readWorksheetRecordsWithRowNumbers<CreatorDatabaseRecord>(
    spreadsheetId,
    "CreatorDatabase",
  );
  const records = normalizeWorksheetRecords(
    "CreatorDatabase",
    creatorRows.rows.map((row) => row.record as Record<string, unknown>),
  ) as CreatorDatabaseRecord[];
  const nextRows = records.filter((record) => record.id !== recordId);

  await writeCurrentStateWorksheetRows(spreadsheetId, "CreatorDatabase", creatorRows, nextRows);
  invalidateDatabaseReadCache("creator-database-targeted-delete");

  return { records: nextRows };
}

export async function upsertSourcingTemplateInGoogleSheets(record: SourcingTemplateRecord) {
  const config = assertConfigured();
  const spreadsheetId = await resolveSpreadsheetId(config);
  await ensureDatabaseShape(spreadsheetId);

  const sourcingRows = await readWorksheetRecordsWithRowNumbers<SourcingTemplateRecord>(
    spreadsheetId,
    "SourcingTemplates",
  );
  const sourcingCleanup = upsertSourcingTemplateRecord(
    sourcingRows.rows.map((row) => row.record),
    record,
  );
  logSourcingTemplateCleanupSummary("targeted-upsert", sourcingCleanup);
  await writeCurrentStateWorksheetRows(
    spreadsheetId,
    "SourcingTemplates",
    sourcingRows,
    sourcingCleanup.records,
  );

  const appSettingRows = await readAppSettingsRecordsWithRowNumbers(spreadsheetId);
  const appSettings = upsertAppSettingRecord(
    appSettingRows.rows.map((row) => row.record),
    `sourcing.activeTemplate.${record.campaignId}`,
    record.id,
  );
  await writeChangedWorksheetRows(spreadsheetId, "AppSettings", appSettingRows, appSettings);

  invalidateDatabaseReadCache("sourcing-template-targeted-write");
  invalidateCreatorSourcingReadCache("sourcing-template-targeted-write");

  return readCreatorSourcingDatabaseSubset(spreadsheetId, {
    SourcingTemplates: sourcingCleanup.records,
    AppSettings: appSettings,
  });
}

export async function deleteSourcingTemplateInGoogleSheets(templateId: string) {
  const config = assertConfigured();
  const spreadsheetId = await resolveSpreadsheetId(config);
  await ensureDatabaseShape(spreadsheetId);

  const sourcingRows = await readWorksheetRecordsWithRowNumbers<SourcingTemplateRecord>(
    spreadsheetId,
    "SourcingTemplates",
  );
  const currentTemplates = sourcingRows.rows.map((row) => row.record);
  const existing = currentTemplates.find((template) => template.id === templateId);
  if (!existing) {
    return readCreatorSourcingDatabaseSubset(spreadsheetId, {
      SourcingTemplates: currentTemplates,
    });
  }

  const sourcingCleanup = removeSourcingTemplateRecord(currentTemplates, templateId);
  logSourcingTemplateCleanupSummary("targeted-delete", sourcingCleanup);
  await writeCurrentStateWorksheetRows(
    spreadsheetId,
    "SourcingTemplates",
    sourcingRows,
    sourcingCleanup.records,
  );

  const appSettingRows = await readAppSettingsRecordsWithRowNumbers(spreadsheetId);
  const settingKey = `sourcing.activeTemplate.${existing.campaignId}`;
  const currentSetting = appSettingRows.rows
    .map((row) => row.record)
    .find((setting) => setting.settingKey === settingKey);
  let appSettings = appSettingRows.rows.map((row) => row.record);

  if (currentSetting?.settingValue === templateId) {
    const nextTemplate =
      sourcingCleanup.records.find(
        (template) =>
          template.campaignId === existing.campaignId && isActiveSourcingTemplateRecord(template),
      ) ?? null;
    appSettings = upsertAppSettingRecord(appSettings, settingKey, nextTemplate?.id ?? "");
    await writeChangedWorksheetRows(spreadsheetId, "AppSettings", appSettingRows, appSettings);
  }

  invalidateDatabaseReadCache("sourcing-template-targeted-delete");
  invalidateCreatorSourcingReadCache("sourcing-template-targeted-delete");

  return readCreatorSourcingDatabaseSubset(spreadsheetId, {
    SourcingTemplates: sourcingCleanup.records,
    AppSettings: appSettings,
  });
}

export async function cleanupSourcingTemplatesInGoogleSheets() {
  const config = assertConfigured();
  const spreadsheetId = await resolveSpreadsheetId(config);
  await ensureDatabaseShape(spreadsheetId);

  const sourcingRows = await readWorksheetRecordsWithRowNumbers<SourcingTemplateRecord>(
    spreadsheetId,
    "SourcingTemplates",
  );
  const beforeRows = sourcingRows.rows.length;
  const sourcingCleanup = cleanupSourcingTemplateRecords(
    sourcingRows.rows.map((row) => row.record),
  );
  logSourcingTemplateCleanupSummary("manual-cleanup-action", sourcingCleanup);
  await writeCurrentStateWorksheetRows(
    spreadsheetId,
    "SourcingTemplates",
    sourcingRows,
    sourcingCleanup.records,
  );

  invalidateDatabaseReadCache("sourcing-template-manual-cleanup");
  invalidateCreatorSourcingReadCache("sourcing-template-manual-cleanup");

  return {
    database: await readCreatorSourcingDatabaseSubset(spreadsheetId, {
      SourcingTemplates: sourcingCleanup.records,
    }),
    report: {
      beforeRows,
      afterRows: sourcingCleanup.records.length,
      removedRows: beforeRows - sourcingCleanup.records.length,
      removedInactiveRows: sourcingCleanup.removedInactiveCount,
      removedDuplicateIdRows: sourcingCleanup.duplicateIdCount,
      removedDuplicateNameRows: sourcingCleanup.duplicateNameCount,
    },
  };
}

export async function listOutreachTemplatesInGoogleSheets() {
  const config = assertConfigured();
  const spreadsheetId = await resolveSpreadsheetId(config);
  await ensureDatabaseShape(spreadsheetId);

  const outreachRows = await readWorksheetRecordsWithRowNumbers<OutreachTemplateRecord>(
    spreadsheetId,
    "OutreachTemplates",
  );
  const cleanup = cleanupOutreachTemplateRecords(outreachRows.rows.map((row) => row.record));
  logOutreachTemplateCleanupSummary("list-current-state", cleanup);

  if (cleanup.removedCount > 0) {
    await writeCurrentStateWorksheetRows(
      spreadsheetId,
      "OutreachTemplates",
      outreachRows,
      cleanup.records,
    );
    invalidateDatabaseReadCache("outreach-template-list-cleanup");
  }

  return {
    records: cleanup.records,
    report: createOutreachTemplateCleanupReport(outreachRows.rows.length, cleanup),
  };
}

export async function upsertOutreachTemplateInGoogleSheets(record: OutreachTemplateRecord) {
  const config = assertConfigured();
  const spreadsheetId = await resolveSpreadsheetId(config);
  await ensureDatabaseShape(spreadsheetId);

  const outreachRows = await readWorksheetRecordsWithRowNumbers<OutreachTemplateRecord>(
    spreadsheetId,
    "OutreachTemplates",
  );
  const cleanup = upsertOutreachTemplateRecord(
    outreachRows.rows.map((row) => row.record),
    record,
  );
  logOutreachTemplateCleanupSummary("targeted-upsert", cleanup);
  await writeCurrentStateWorksheetRows(
    spreadsheetId,
    "OutreachTemplates",
    outreachRows,
    cleanup.records,
  );

  invalidateDatabaseReadCache("outreach-template-targeted-write");

  return {
    records: cleanup.records,
    report: createOutreachTemplateCleanupReport(outreachRows.rows.length, cleanup),
  };
}

export async function deleteOutreachTemplateInGoogleSheets(templateId: string) {
  const config = assertConfigured();
  const spreadsheetId = await resolveSpreadsheetId(config);
  await ensureDatabaseShape(spreadsheetId);

  const outreachRows = await readWorksheetRecordsWithRowNumbers<OutreachTemplateRecord>(
    spreadsheetId,
    "OutreachTemplates",
  );
  const cleanup = removeOutreachTemplateRecord(
    outreachRows.rows.map((row) => row.record),
    templateId,
  );
  logOutreachTemplateCleanupSummary("targeted-delete", cleanup);
  await writeCurrentStateWorksheetRows(
    spreadsheetId,
    "OutreachTemplates",
    outreachRows,
    cleanup.records,
  );

  invalidateDatabaseReadCache("outreach-template-targeted-delete");

  return {
    records: cleanup.records,
    report: createOutreachTemplateCleanupReport(outreachRows.rows.length, cleanup),
  };
}

export async function cleanupOutreachTemplatesInGoogleSheets() {
  const config = assertConfigured();
  const spreadsheetId = await resolveSpreadsheetId(config);
  await ensureDatabaseShape(spreadsheetId);

  const outreachRows = await readWorksheetRecordsWithRowNumbers<OutreachTemplateRecord>(
    spreadsheetId,
    "OutreachTemplates",
  );
  const cleanup = cleanupOutreachTemplateRecords(outreachRows.rows.map((row) => row.record));
  logOutreachTemplateCleanupSummary("manual-cleanup-action", cleanup);
  await writeCurrentStateWorksheetRows(
    spreadsheetId,
    "OutreachTemplates",
    outreachRows,
    cleanup.records,
  );

  invalidateDatabaseReadCache("outreach-template-manual-cleanup");

  return {
    records: cleanup.records,
    report: createOutreachTemplateCleanupReport(outreachRows.rows.length, cleanup),
  };
}

export async function listCampaignMemoryCardsInGoogleSheets() {
  const config = assertConfigured();
  const spreadsheetId = await resolveSpreadsheetId(config);
  await ensureDatabaseShape(spreadsheetId);

  const memoryRows = await readWorksheetRecordsWithRowNumbers<CampaignMemoryCardRecord>(
    spreadsheetId,
    "CampaignMemoryCards",
  );
  const cleanup = cleanupCampaignMemoryCardRecords(memoryRows.rows.map((row) => row.record));
  logCampaignMemoryCardCleanupSummary("list-current-state", cleanup);

  if (cleanup.removedCount > 0 || cleanup.duplicateIdReassignedCount > 0) {
    await writeCurrentStateWorksheetRows(
      spreadsheetId,
      "CampaignMemoryCards",
      memoryRows,
      cleanup.records,
    );
    invalidateDatabaseReadCache("campaign-memory-card-list-cleanup");
  }

  return {
    records: cleanup.records,
    report: createCampaignMemoryCardCleanupReport(memoryRows.rows.length, cleanup),
  };
}

export async function upsertCampaignMemoryCardInGoogleSheets(record: CampaignMemoryCardRecord) {
  const config = assertConfigured();
  const spreadsheetId = await resolveSpreadsheetId(config);
  await ensureDatabaseShape(spreadsheetId);

  const memoryRows = await readWorksheetRecordsWithRowNumbers<CampaignMemoryCardRecord>(
    spreadsheetId,
    "CampaignMemoryCards",
  );
  const cleanup = upsertCampaignMemoryCardRecord(
    memoryRows.rows.map((row) => row.record),
    record,
  );
  logCampaignMemoryCardCleanupSummary("targeted-upsert", cleanup);
  await writeCurrentStateWorksheetRows(
    spreadsheetId,
    "CampaignMemoryCards",
    memoryRows,
    cleanup.records,
  );

  invalidateDatabaseReadCache("campaign-memory-card-targeted-write");

  return {
    records: cleanup.records,
    report: createCampaignMemoryCardCleanupReport(memoryRows.rows.length, cleanup),
  };
}

export async function deleteCampaignMemoryCardInGoogleSheets(cardId: string) {
  const config = assertConfigured();
  const spreadsheetId = await resolveSpreadsheetId(config);
  await ensureDatabaseShape(spreadsheetId);

  const memoryRows = await readWorksheetRecordsWithRowNumbers<CampaignMemoryCardRecord>(
    spreadsheetId,
    "CampaignMemoryCards",
  );
  const cleanup = removeCampaignMemoryCardRecord(
    memoryRows.rows.map((row) => row.record),
    cardId,
  );
  logCampaignMemoryCardCleanupSummary("targeted-delete", cleanup);
  await writeCurrentStateWorksheetRows(
    spreadsheetId,
    "CampaignMemoryCards",
    memoryRows,
    cleanup.records,
  );

  invalidateDatabaseReadCache("campaign-memory-card-targeted-delete");

  return {
    records: cleanup.records,
    report: createCampaignMemoryCardCleanupReport(memoryRows.rows.length, cleanup),
  };
}

export async function replaceCampaignMemoryCardsForCampaignInGoogleSheets({
  campaignId,
  preferredLanguages,
  records,
}: {
  campaignId: string;
  preferredLanguages: string;
  records: CampaignMemoryCardRecord[];
}) {
  const config = assertConfigured();
  const spreadsheetId = await resolveSpreadsheetId(config);
  await ensureDatabaseShape(spreadsheetId);

  const [memoryRows, campaignRows] = await Promise.all([
    readWorksheetRecordsWithRowNumbers<CampaignMemoryCardRecord>(
      spreadsheetId,
      "CampaignMemoryCards",
    ),
    readWorksheetRecordsWithRowNumbers<CampaignProfileRecord>(spreadsheetId, "CampaignProfiles"),
  ]);
  const cleanup = replaceCampaignMemoryCardsForCampaign(
    memoryRows.rows.map((row) => row.record),
    campaignId,
    records,
  );
  logCampaignMemoryCardCleanupSummary("replace-campaign-cards", cleanup);
  await writeCurrentStateWorksheetRows(
    spreadsheetId,
    "CampaignMemoryCards",
    memoryRows,
    cleanup.records,
  );

  const campaignProfiles = updateCampaignPreferredLanguages(
    campaignRows.rows.map((row) => row.record),
    campaignId,
    preferredLanguages,
  );
  await writeChangedWorksheetRows(
    spreadsheetId,
    "CampaignProfiles",
    campaignRows,
    campaignProfiles,
  );

  invalidateDatabaseReadCache("campaign-memory-card-replace-campaign");

  return {
    records: cleanup.records,
    campaignProfiles,
    report: createCampaignMemoryCardCleanupReport(memoryRows.rows.length, cleanup),
  };
}

export async function cleanupCampaignMemoryCardsInGoogleSheets() {
  const config = assertConfigured();
  const spreadsheetId = await resolveSpreadsheetId(config);
  await ensureDatabaseShape(spreadsheetId);

  const memoryRows = await readWorksheetRecordsWithRowNumbers<CampaignMemoryCardRecord>(
    spreadsheetId,
    "CampaignMemoryCards",
  );
  const cleanup = cleanupCampaignMemoryCardRecords(memoryRows.rows.map((row) => row.record));
  logCampaignMemoryCardCleanupSummary("manual-cleanup-action", cleanup);
  await writeCurrentStateWorksheetRows(
    spreadsheetId,
    "CampaignMemoryCards",
    memoryRows,
    cleanup.records,
  );

  invalidateDatabaseReadCache("campaign-memory-card-manual-cleanup");

  return {
    records: cleanup.records,
    report: createCampaignMemoryCardCleanupReport(memoryRows.rows.length, cleanup),
  };
}

export async function listActiveCampaignCreatorsInGoogleSheets() {
  const config = assertConfigured();
  const spreadsheetId = await resolveSpreadsheetId(config);
  await ensureDatabaseShape(spreadsheetId);

  const creatorRows = await readWorksheetRecordsWithRowNumbers<ActiveCampaignCreatorRecord>(
    spreadsheetId,
    "ActiveCampaignCreators",
  );
  const cleanup = cleanupActiveCampaignCreatorRecords(creatorRows.rows.map((row) => row.record));
  logActiveCampaignCreatorCleanupSummary("list-current-state", cleanup);

  if (cleanup.removedCount > 0) {
    await writeCurrentStateWorksheetRows(
      spreadsheetId,
      "ActiveCampaignCreators",
      creatorRows,
      cleanup.records,
    );
    invalidateDatabaseReadCache("active-campaign-creator-list-cleanup");
  }

  return {
    records: cleanup.records,
    report: createActiveCampaignCreatorCleanupReport(creatorRows.rows.length, cleanup),
  };
}

export async function upsertActiveCampaignCreatorInGoogleSheets(
  record: ActiveCampaignCreatorRecord,
) {
  const config = assertConfigured();
  const spreadsheetId = await resolveSpreadsheetId(config);
  await ensureDatabaseShape(spreadsheetId);

  const creatorRows = await readWorksheetRecordsWithRowNumbers<ActiveCampaignCreatorRecord>(
    spreadsheetId,
    "ActiveCampaignCreators",
  );
  const cleanup = upsertActiveCampaignCreatorRecord(
    creatorRows.rows.map((row) => row.record),
    record,
  );
  logActiveCampaignCreatorCleanupSummary("targeted-upsert", cleanup);
  await writeCurrentStateWorksheetRows(
    spreadsheetId,
    "ActiveCampaignCreators",
    creatorRows,
    cleanup.records,
  );

  invalidateDatabaseReadCache("active-campaign-creator-targeted-write");

  return {
    records: cleanup.records,
    report: createActiveCampaignCreatorCleanupReport(creatorRows.rows.length, cleanup),
  };
}

export async function deleteActiveCampaignCreatorInGoogleSheets(recordId: string) {
  const config = assertConfigured();
  const spreadsheetId = await resolveSpreadsheetId(config);
  await ensureDatabaseShape(spreadsheetId);

  const creatorRows = await readWorksheetRecordsWithRowNumbers<ActiveCampaignCreatorRecord>(
    spreadsheetId,
    "ActiveCampaignCreators",
  );
  const cleanup = removeActiveCampaignCreatorRecord(
    creatorRows.rows.map((row) => row.record),
    recordId,
  );
  logActiveCampaignCreatorCleanupSummary("targeted-delete", cleanup);
  await writeCurrentStateWorksheetRows(
    spreadsheetId,
    "ActiveCampaignCreators",
    creatorRows,
    cleanup.records,
  );

  invalidateDatabaseReadCache("active-campaign-creator-targeted-delete");

  return {
    records: cleanup.records,
    report: createActiveCampaignCreatorCleanupReport(creatorRows.rows.length, cleanup),
  };
}

export async function upsertAppSettingInGoogleSheets(record: AppSettingRecord) {
  const config = assertConfigured();
  const spreadsheetId = await resolveSpreadsheetId(config);
  await ensureDatabaseShape(spreadsheetId);

  const settingsRows = await readAppSettingsRecordsWithRowNumbers(spreadsheetId);
  const now = new Date().toISOString();
  const nextRecord: AppSettingRecord = {
    settingKey: stringValue(record.settingKey),
    settingValue: stringValue(record.settingValue),
    updatedAt: stringValue(record.updatedAt) || now,
  };
  const existingIndex = settingsRows.rows.findIndex(
    (row) => row.record.settingKey === nextRecord.settingKey,
  );
  const nextRows = settingsRows.rows.map((row) => row.record);
  if (existingIndex === -1) {
    nextRows.push(nextRecord);
  } else {
    nextRows[existingIndex] = nextRecord;
  }

  await writeCurrentStateWorksheetRows(spreadsheetId, "AppSettings", settingsRows, nextRows);
  invalidateDatabaseReadCache("app-setting-targeted-write");

  return {
    records: nextRows,
  };
}

export async function listAppSettingsInGoogleSheets() {
  const config = assertConfigured();
  const spreadsheetId = await resolveSpreadsheetId(config);
  await ensureDatabaseShape(spreadsheetId);

  const records = await readAppSettingsRows(spreadsheetId);

  return {
    records,
  };
}

export async function listEmployeeProfilesInGoogleSheets() {
  const config = assertConfigured();
  const spreadsheetId = await resolveSpreadsheetId(config);
  await ensureDatabaseShape(spreadsheetId);

  const profileRows = await readWorksheetRecordsWithRowNumbers<EmployeeProfileRecord>(
    spreadsheetId,
    "EmployeeProfiles",
  );
  const cleanup = cleanupEmployeeProfileRecords(profileRows.rows.map((row) => row.record));
  logEmployeeProfileCleanupSummary("list-current-state", cleanup);

  if (cleanup.removedCount > 0) {
    await writeCurrentStateWorksheetRows(
      spreadsheetId,
      "EmployeeProfiles",
      profileRows,
      cleanup.records,
    );
    invalidateDatabaseReadCache("employee-profile-list-cleanup");
  }

  return {
    records: cleanup.records,
  };
}

export async function upsertEmployeeProfileInGoogleSheets(record: EmployeeProfileRecord) {
  const config = assertConfigured();
  const spreadsheetId = await resolveSpreadsheetId(config);
  await ensureDatabaseShape(spreadsheetId);

  const profileRows = await readWorksheetRecordsWithRowNumbers<EmployeeProfileRecord>(
    spreadsheetId,
    "EmployeeProfiles",
  );
  const cleanup = upsertEmployeeProfileRecord(
    profileRows.rows.map((row) => row.record),
    record,
  );
  logEmployeeProfileCleanupSummary("targeted-upsert", cleanup);

  await writeCurrentStateWorksheetRows(
    spreadsheetId,
    "EmployeeProfiles",
    profileRows,
    cleanup.records,
  );

  invalidateDatabaseReadCache("employee-profile-targeted-write");

  return {
    records: cleanup.records,
  };
}

export async function listCampaignPromptVaultInGoogleSheets() {
  const config = assertConfigured();
  const spreadsheetId = await resolveSpreadsheetId(config);
  await ensureDatabaseShape(spreadsheetId);

  const promptRows = await readWorksheetRecordsWithRowNumbers<CampaignPromptVaultRecord>(
    spreadsheetId,
    "CampaignPromptVault",
  );
  const cleanup = cleanupCampaignPromptVaultRecords(promptRows.rows.map((row) => row.record));
  logCampaignPromptVaultCleanupSummary("list-current-state", cleanup);

  if (cleanup.removedCount > 0) {
    await writeCurrentStateWorksheetRows(
      spreadsheetId,
      "CampaignPromptVault",
      promptRows,
      cleanup.records,
    );
    invalidateDatabaseReadCache("campaign-prompt-vault-list-cleanup");
  }

  return {
    records: cleanup.records,
  };
}

export async function upsertCampaignPromptVaultInGoogleSheets(record: CampaignPromptVaultRecord) {
  const config = assertConfigured();
  const spreadsheetId = await resolveSpreadsheetId(config);
  await ensureDatabaseShape(spreadsheetId);

  const promptRows = await readWorksheetRecordsWithRowNumbers<CampaignPromptVaultRecord>(
    spreadsheetId,
    "CampaignPromptVault",
  );
  const cleanup = upsertCampaignPromptVaultRecord(
    promptRows.rows.map((row) => row.record),
    record,
  );
  logCampaignPromptVaultCleanupSummary("targeted-upsert", cleanup);

  await writeCurrentStateWorksheetRows(
    spreadsheetId,
    "CampaignPromptVault",
    promptRows,
    cleanup.records,
  );

  invalidateDatabaseReadCache("campaign-prompt-vault-targeted-write");

  return {
    records: cleanup.records,
  };
}

export async function deleteCampaignPromptVaultInGoogleSheets(promptId: string) {
  const config = assertConfigured();
  const spreadsheetId = await resolveSpreadsheetId(config);
  await ensureDatabaseShape(spreadsheetId);

  const promptRows = await readWorksheetRecordsWithRowNumbers<CampaignPromptVaultRecord>(
    spreadsheetId,
    "CampaignPromptVault",
  );
  const cleanup = removeCampaignPromptVaultRecord(
    promptRows.rows.map((row) => row.record),
    promptId,
  );
  logCampaignPromptVaultCleanupSummary("targeted-delete", cleanup);

  await writeCurrentStateWorksheetRows(
    spreadsheetId,
    "CampaignPromptVault",
    promptRows,
    cleanup.records,
  );

  invalidateDatabaseReadCache("campaign-prompt-vault-targeted-delete");

  return {
    records: cleanup.records,
  };
}

export async function cleanupSourcingActiveTemplateSettingsInGoogleSheets() {
  const config = assertConfigured();
  const spreadsheetId = await resolveSpreadsheetId(config);
  await ensureDatabaseShape(spreadsheetId);

  const [settingsRows, sourcingRows] = await Promise.all([
    readAppSettingsRecordsWithRowNumbers(spreadsheetId),
    readWorksheetRecordsWithRowNumbers<SourcingTemplateRecord>(spreadsheetId, "SourcingTemplates"),
  ]);
  const settings = settingsRows.rows.map((row) => row.record);
  const activeTemplates = cleanupSourcingTemplateRecords(
    sourcingRows.rows.map((row) => row.record),
  ).records.filter(isActiveSourcingTemplateRecord);
  const templatesByCampaign = new Map<string, SourcingTemplateRecord[]>();
  activeTemplates.forEach((template) => {
    templatesByCampaign.set(template.campaignId, [
      ...(templatesByCampaign.get(template.campaignId) ?? []),
      template,
    ]);
  });
  let changedCount = 0;
  const cleanedSettings = settings.map((setting) => {
    if (!setting.settingKey.startsWith("sourcing.activeTemplate.")) return setting;
    const campaignId = setting.settingKey.replace("sourcing.activeTemplate.", "");
    const campaignTemplates = templatesByCampaign.get(campaignId) ?? [];
    const currentTemplateExists = campaignTemplates.some(
      (template) => template.id === setting.settingValue,
    );
    if (currentTemplateExists || !setting.settingValue) return setting;

    changedCount += 1;
    return {
      ...setting,
      settingValue: campaignTemplates[0]?.id ?? "",
      updatedAt: new Date().toISOString(),
    };
  });

  if (changedCount > 0) {
    await writeChangedWorksheetRows(spreadsheetId, "AppSettings", settingsRows, cleanedSettings);
    invalidateDatabaseReadCache("sourcing-active-template-settings-cleanup");
    invalidateCreatorSourcingReadCache("sourcing-active-template-settings-cleanup");
  }

  return {
    records: cleanedSettings,
    changedCount,
  };
}

export async function mergeCentralDatabaseIntoGoogleSheets(localDatabase: CentralAppDatabase) {
  const remoteDatabase = await readCentralDatabaseFromGoogleSheets({
    reason: "merge-local-database",
  });
  const report = {
    CampaignProfiles: 0,
    SourcingTemplates: 0,
    OutreachTemplates: 0,
    CampaignMemoryCards: 0,
    ActiveCampaignCreators: 0,
    AgencyDatabase: 0,
    CreatorDatabase: 0,
    EmployeeProfiles: 0,
    CampaignPromptVault: 0,
    AppSettings: 0,
    errors: [] as string[],
  };

  const merged = createEmptyCentralDatabase();
  for (const worksheetName of centralWorksheetNames) {
    const idField = rowIdFields[worksheetName];
    const remoteRows = getRowsForWorksheet(remoteDatabase, worksheetName);
    const localRows = getRowsForWorksheet(localDatabase, worksheetName);
    const existingIds = new Set(remoteRows.map((row) => stringValue(row[idField])));
    const missingRows = localRows.filter((row) => {
      const id = stringValue(row[idField]);
      return id && !existingIds.has(id);
    });
    report[worksheetName] = missingRows.length;
    setRowsForWorksheet(merged, worksheetName, [...remoteRows, ...missingRows]);
  }

  const saved = await writeCentralDatabaseToGoogleSheets(merged);
  return { database: saved, report };
}

async function resolveSpreadsheetId(config: GoogleSheetsConfig) {
  if (config.spreadsheetId) return config.spreadsheetId;

  const searchParams = new URLSearchParams({
    q: `name = '${centralDatabaseName.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`,
    pageSize: "1",
    fields: "files(id,name,webViewLink)",
  });
  const search = (await googleFetch(
    `https://www.googleapis.com/drive/v3/files?${searchParams.toString()}`,
  )) as { files?: Array<{ id: string }> };
  const existing = search.files?.[0]?.id;
  if (existing) return existing;

  const created = (await googleFetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    body: JSON.stringify({
      properties: { title: centralDatabaseName },
      sheets: centralWorksheetNames.map((worksheetName) => ({
        properties: { title: worksheetName },
      })),
    }),
  })) as { spreadsheetId: string };

  return created.spreadsheetId;
}

async function ensureDatabaseShape(spreadsheetId: string) {
  if (
    databaseShapeCache &&
    databaseShapeCache.spreadsheetId === spreadsheetId &&
    databaseShapeCache.expiresAt > Date.now()
  ) {
    logGoogleSheetsCache("database-shape-cache-hit", {
      ttlMs: databaseShapeCache.expiresAt - Date.now(),
    });
    return;
  }

  const metadata = await getMetadata(spreadsheetId);
  const existingSheets = new Map(
    (metadata.sheets ?? []).map((sheet) => [sheet.properties.title, sheet.properties.sheetId]),
  );
  const missingWorksheetNames = centralWorksheetNames.filter(
    (worksheetName) => !existingSheets.has(worksheetName),
  );
  const requests = missingWorksheetNames.map((worksheetName) => ({
    addSheet: {
      properties: {
        title: worksheetName,
        gridProperties: { frozenRowCount: 1 },
      },
    },
  }));

  if (requests.length > 0) {
    await batchUpdate(spreadsheetId, requests);
    await Promise.all(
      missingWorksheetNames.map((worksheetName) =>
        writeRequiredHeaders(spreadsheetId, worksheetName),
      ),
    );
  }

  databaseShapeCache = {
    spreadsheetId,
    expiresAt: Date.now() + databaseShapeCacheTtlMs,
  };
}

async function ensureHeaders(spreadsheetId: string, worksheetName: CentralWorksheetName) {
  const requiredHeaders = requiredWorksheetHeaders[worksheetName];
  const currentHeaderRow = await readValues(spreadsheetId, `${quoteSheetName(worksheetName)}!1:1`);
  const existingHeaders = (currentHeaderRow[0] ?? []).map(stringValue).filter(Boolean);
  const headerMap = buildHeaderMap(existingHeaders, requiredHeaders);
  const missingHeaders = requiredHeaders.filter((header) => headerMap[header] === undefined);
  if (existingHeaders.length > 0 && missingHeaders.length === 0) return;

  const nextHeaders =
    existingHeaders.length > 0 ? [...existingHeaders, ...missingHeaders] : requiredHeaders;

  await updateHeaderRow(spreadsheetId, worksheetName, nextHeaders);
}

async function writeRequiredHeaders(spreadsheetId: string, worksheetName: CentralWorksheetName) {
  await updateHeaderRow(spreadsheetId, worksheetName, requiredWorksheetHeaders[worksheetName]);
}

async function updateHeaderRow(
  spreadsheetId: string,
  worksheetName: CentralWorksheetName,
  headers: string[],
) {
  await updateValues(
    spreadsheetId,
    `${quoteSheetName(worksheetName)}!A1:${columnName(headers.length)}1`,
    [headers],
  );
}

async function readWorksheetRows(spreadsheetId: string, worksheetName: CentralWorksheetName) {
  const values = await readValues(spreadsheetId, `${quoteSheetName(worksheetName)}!A1:Z1000`);
  return parseWorksheetRowsFromValues(worksheetName, values);
}

async function readWorksheetRowsBatch(
  spreadsheetId: string,
  worksheetNames: readonly CentralWorksheetName[],
) {
  const ranges = worksheetNames.map((worksheetName) => `${quoteSheetName(worksheetName)}!A1:Z1000`);
  const valuesByRange = await readValuesBatch(spreadsheetId, ranges);
  const rowsBySheet = createEmptyRowsBySheet();

  worksheetNames.forEach((worksheetName, index) => {
    rowsBySheet[worksheetName] = parseWorksheetRowsFromValues(
      worksheetName,
      valuesByRange.get(ranges[index]) ?? [],
    );
  });

  return rowsBySheet;
}

function parseWorksheetRowsFromValues(worksheetName: CentralWorksheetName, values: unknown[][]) {
  const headers = (values[0] ?? []).map(stringValue);
  const headerMap = buildHeaderMap(headers, requiredWorksheetHeaders[worksheetName]);
  const missingHeaders = requiredWorksheetHeaders[worksheetName].filter(
    (header) => headerMap[header] === undefined,
  );
  if (missingHeaders.length > 0) {
    if (worksheetName === "AppSettings") {
      console.warn("[AppSettingsRepair]", "missing-headers-ignored-for-read", {
        missingHeaders,
        at: new Date().toISOString(),
      });
      return [];
    }
    throw new Error(`${worksheetName} is missing required headers: ${missingHeaders.join(", ")}`);
  }

  return values.slice(1).flatMap((row) => {
    const record = Object.fromEntries(
      requiredWorksheetHeaders[worksheetName].map((header) => [
        header,
        stringValue(row[headerMap[header] ?? -1]),
      ]),
    );
    const idField = rowIdFields[worksheetName];
    return record[idField] ? [record] : [];
  });
}

async function readNormalizedWorksheetRecords<T>(
  spreadsheetId: string,
  worksheetName: CentralWorksheetName,
) {
  const rows = await readWorksheetRows(spreadsheetId, worksheetName);
  return normalizeWorksheetRecords(worksheetName, rows) as T[];
}

function normalizeWorksheetRecords(
  worksheetName: CentralWorksheetName,
  rows: Array<Record<string, unknown>>,
) {
  const rowsBySheet = createEmptyRowsBySheet();
  rowsBySheet[worksheetName] = rows.map((row) =>
    Object.fromEntries(
      requiredWorksheetHeaders[worksheetName].map((header) => [header, stringValue(row[header])]),
    ),
  );
  return rowsToDatabase(rowsBySheet).worksheets[worksheetName];
}

function createEmptyRowsBySheet() {
  return Object.fromEntries(
    centralWorksheetNames.map((worksheetName) => [worksheetName, [] as SheetRows]),
  ) as Record<CentralWorksheetName, SheetRows>;
}

async function readAppSettingsRows(spreadsheetId: string): Promise<AppSettingRecord[]> {
  const settingsRows = await readAppSettingsRecordsWithRowNumbers(spreadsheetId);
  return settingsRows.rows.map((row) => row.record);
}

async function readAppSettingsRecordsWithRowNumbers(spreadsheetId: string): Promise<{
  rows: Array<SheetRecordWithRowNumber<AppSettingRecord>>;
  nextRowNumber: number;
}> {
  try {
    return await readWorksheetRecordsWithRowNumbers<AppSettingRecord>(spreadsheetId, "AppSettings");
  } catch (error) {
    if (!isMissingHeadersError(error, "AppSettings")) throw error;

    console.warn("[AppSettingsRepair]", "missing-headers-detected", {
      message: error instanceof Error ? error.message : "AppSettings header read failed.",
      at: new Date().toISOString(),
    });

    await ensureHeaders(spreadsheetId, "AppSettings");

    try {
      return await readWorksheetRecordsWithRowNumbers<AppSettingRecord>(
        spreadsheetId,
        "AppSettings",
      );
    } catch (retryError) {
      if (!isMissingHeadersError(retryError, "AppSettings")) throw retryError;

      console.warn("[AppSettingsRepair]", "using-empty-settings-after-header-retry", {
        message:
          retryError instanceof Error ? retryError.message : "AppSettings header retry failed.",
        at: new Date().toISOString(),
      });

      return {
        rows: [],
        nextRowNumber: 2,
      };
    }
  }
}

function isMissingHeadersError(error: unknown, worksheetName: CentralWorksheetName) {
  return (
    error instanceof Error &&
    error.message.startsWith(`${worksheetName} is missing required headers:`)
  );
}

async function replaceWorksheetRows(
  spreadsheetId: string,
  worksheetName: CentralWorksheetName,
  rows: Array<Record<string, unknown>>,
) {
  const headers = requiredWorksheetHeaders[worksheetName];
  const lastColumn = columnName(headers.length);
  await clearValues(spreadsheetId, `${quoteSheetName(worksheetName)}!A1:Z1000`);
  await updateValues(
    spreadsheetId,
    `${quoteSheetName(worksheetName)}!A1:${lastColumn}${rows.length + 1}`,
    [headers, ...rows.map((row) => headers.map((header) => row[header] ?? ""))],
  );
}

async function createWorksheetBackup(
  spreadsheetId: string,
  sourceWorksheetName: string,
  values: unknown[][],
) {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+/, "")
    .replace("T", "_");
  const backupSheetName = `${sourceWorksheetName}_Backup_${timestamp}`;
  await batchUpdate(spreadsheetId, [
    {
      addSheet: {
        properties: {
          title: backupSheetName,
          gridProperties: { frozenRowCount: 1 },
        },
      },
    },
  ]);
  if (values.length > 0) {
    await updateValues(
      spreadsheetId,
      `${quoteSheetName(backupSheetName)}!A1:${columnName(values[0]?.length ?? 1)}${values.length}`,
      values,
    );
  }
  return backupSheetName;
}

async function readWorksheetRecordsWithRowNumbers<T>(
  spreadsheetId: string,
  worksheetName: CentralWorksheetName,
): Promise<{
  rows: Array<SheetRecordWithRowNumber<T>>;
  nextRowNumber: number;
}> {
  const values = await readValues(spreadsheetId, `${quoteSheetName(worksheetName)}!A1:Z1000`);
  return parseWorksheetRecordsWithRowNumbersFromValues<T>(worksheetName, values);
}

function parseWorksheetRecordsWithRowNumbersFromValues<T>(
  worksheetName: CentralWorksheetName,
  values: unknown[][],
): {
  rows: Array<SheetRecordWithRowNumber<T>>;
  nextRowNumber: number;
} {
  const headers = (values[0] ?? []).map(stringValue);
  const headerMap = buildHeaderMap(headers, requiredWorksheetHeaders[worksheetName]);
  const missingHeaders = requiredWorksheetHeaders[worksheetName].filter(
    (header) => headerMap[header] === undefined,
  );
  if (missingHeaders.length > 0) {
    throw new Error(`${worksheetName} is missing required headers: ${missingHeaders.join(", ")}`);
  }

  const idField = rowIdFields[worksheetName];
  const rows = values.slice(1).flatMap((row, index) => {
    const record = Object.fromEntries(
      requiredWorksheetHeaders[worksheetName].map((header) => [
        header,
        stringValue(row[headerMap[header] ?? -1]),
      ]),
    ) as T;

    return (record as Record<string, unknown>)[idField] ? [{ record, rowNumber: index + 2 }] : [];
  });

  return {
    rows,
    nextRowNumber: Math.max(values.length + 1, 2),
  };
}

async function writeChangedWorksheetRows<T>(
  spreadsheetId: string,
  worksheetName: CentralWorksheetName,
  currentRows: {
    rows: Array<SheetRecordWithRowNumber<T>>;
    nextRowNumber: number;
  },
  nextRows: T[],
) {
  const headers = requiredWorksheetHeaders[worksheetName];
  let nextAppendRowNumber = currentRows.nextRowNumber;

  for (let index = 0; index < nextRows.length; index += 1) {
    const nextRecord = nextRows[index];
    const currentRow = currentRows.rows[index];
    const rowValues = headers.map(
      (header) => (nextRecord as Record<string, unknown>)[header] ?? "",
    );

    if (currentRow) {
      if (
        !worksheetRecordChanged(
          currentRow.record as Record<string, unknown>,
          nextRecord as Record<string, unknown>,
          headers,
        )
      ) {
        continue;
      }
      await updateValues(
        spreadsheetId,
        `${quoteSheetName(worksheetName)}!A${currentRow.rowNumber}:${columnName(headers.length)}${currentRow.rowNumber}`,
        [rowValues],
      );
      continue;
    }

    await updateValues(
      spreadsheetId,
      `${quoteSheetName(worksheetName)}!A${nextAppendRowNumber}:${columnName(headers.length)}${nextAppendRowNumber}`,
      [rowValues],
    );
    nextAppendRowNumber += 1;
  }
}

async function writeCurrentStateWorksheetRows<T>(
  spreadsheetId: string,
  worksheetName: CentralWorksheetName,
  currentRows: {
    rows: Array<SheetRecordWithRowNumber<T>>;
    nextRowNumber: number;
  },
  nextRows: T[],
) {
  await writeChangedWorksheetRows(spreadsheetId, worksheetName, currentRows, nextRows);

  const staleRows = currentRows.rows.slice(nextRows.length).map((row) => row.rowNumber);
  if (staleRows.length === 0) return;

  await deleteWorksheetRowNumbers(spreadsheetId, worksheetName, staleRows);
}

async function deleteWorksheetRowNumbers(
  spreadsheetId: string,
  worksheetName: CentralWorksheetName,
  rowNumbers: number[],
) {
  const sheetId = await getWorksheetSheetId(spreadsheetId, worksheetName);
  const requests = [...new Set(rowNumbers)]
    .filter((rowNumber) => rowNumber > 1)
    .sort((first, second) => second - first)
    .map((rowNumber) => ({
      deleteDimension: {
        range: {
          sheetId,
          dimension: "ROWS",
          startIndex: rowNumber - 1,
          endIndex: rowNumber,
        },
      },
    }));

  await batchUpdate(spreadsheetId, requests);
}

async function getWorksheetSheetId(spreadsheetId: string, worksheetName: CentralWorksheetName) {
  const metadata = await getMetadata(spreadsheetId);
  const sheetId = metadata.sheets?.find((sheet) => sheet.properties.title === worksheetName)
    ?.properties.sheetId;
  if (sheetId === undefined) throw new Error(`Worksheet not found: ${worksheetName}`);
  return sheetId;
}

function worksheetRecordChanged(
  currentRecord: Record<string, unknown>,
  nextRecord: Record<string, unknown>,
  headers: string[],
) {
  return headers.some(
    (header) => stringValue(currentRecord[header]) !== stringValue(nextRecord[header]),
  );
}

function logSourcingTemplateCleanupSummary(
  reason: string,
  cleanup: {
    removedCount: number;
    removedInactiveCount: number;
    duplicateIdCount: number;
    duplicateNameCount: number;
  },
) {
  if (cleanup.removedCount === 0) return;
  console.info("[SourcingTemplatesCleanup]", "delete-stale-current-state-rows", {
    reason,
    removedCount: cleanup.removedCount,
    inactiveRows: cleanup.removedInactiveCount,
    duplicateIdRows: cleanup.duplicateIdCount,
    duplicateNameRows: cleanup.duplicateNameCount,
    at: new Date().toISOString(),
  });
}

function createOutreachTemplateCleanupReport(
  beforeRows: number,
  cleanup: {
    records: OutreachTemplateRecord[];
    removedCount: number;
    duplicateIdCount: number;
    duplicateNameCount: number;
    emptyRecordCount: number;
  },
) {
  return {
    beforeRows,
    afterRows: cleanup.records.length,
    removedRows: beforeRows - cleanup.records.length,
    removedEmptyRows: cleanup.emptyRecordCount,
    removedDuplicateIdRows: cleanup.duplicateIdCount,
    removedDuplicateNameRows: cleanup.duplicateNameCount,
  };
}

function logOutreachTemplateCleanupSummary(
  reason: string,
  cleanup: {
    removedCount: number;
    duplicateIdCount: number;
    duplicateNameCount: number;
    emptyRecordCount: number;
  },
) {
  if (cleanup.removedCount === 0) return;
  console.info("[OutreachTemplatesCleanup]", "delete-stale-current-state-rows", {
    reason,
    removedCount: cleanup.removedCount,
    emptyRows: cleanup.emptyRecordCount,
    duplicateIdRows: cleanup.duplicateIdCount,
    duplicateNameRows: cleanup.duplicateNameCount,
    at: new Date().toISOString(),
  });
}

function updateCampaignPreferredLanguages(
  campaigns: CampaignProfileRecord[],
  campaignId: string,
  preferredLanguages: string,
) {
  const now = new Date().toISOString();
  return campaigns.map((campaign) =>
    campaign.campaignId === campaignId
      ? {
          ...campaign,
          preferredLanguages,
          updatedAt: now,
        }
      : campaign,
  );
}

function createCampaignMemoryCardCleanupReport(
  beforeRows: number,
  cleanup: {
    records: CampaignMemoryCardRecord[];
    removedCount: number;
    duplicateIdReassignedCount: number;
    duplicateTitleCount: number;
    emptyRecordCount: number;
  },
) {
  return {
    beforeRows,
    afterRows: cleanup.records.length,
    removedRows: beforeRows - cleanup.records.length,
    removedEmptyRows: cleanup.emptyRecordCount,
    reassignedDuplicateCardIds: cleanup.duplicateIdReassignedCount,
    removedDuplicateTitleRows: cleanup.duplicateTitleCount,
  };
}

function logCampaignMemoryCardCleanupSummary(
  reason: string,
  cleanup: {
    removedCount: number;
    duplicateIdReassignedCount: number;
    duplicateTitleCount: number;
    emptyRecordCount: number;
  },
) {
  if (cleanup.removedCount === 0 && cleanup.duplicateIdReassignedCount === 0) return;
  console.info("[CampaignMemoryCardsCleanup]", "current-state-repair", {
    reason,
    removedCount: cleanup.removedCount,
    emptyRows: cleanup.emptyRecordCount,
    reassignedDuplicateCardIds: cleanup.duplicateIdReassignedCount,
    duplicateTitleRows: cleanup.duplicateTitleCount,
    at: new Date().toISOString(),
  });
}

function createActiveCampaignCreatorCleanupReport(
  beforeRows: number,
  cleanup: {
    records: ActiveCampaignCreatorRecord[];
    removedCount: number;
    duplicateIdCount: number;
    emptyRecordCount: number;
  },
) {
  return {
    beforeRows,
    afterRows: cleanup.records.length,
    removedRows: beforeRows - cleanup.records.length,
    removedEmptyRows: cleanup.emptyRecordCount,
    removedDuplicateIdRows: cleanup.duplicateIdCount,
  };
}

function logActiveCampaignCreatorCleanupSummary(
  reason: string,
  cleanup: {
    removedCount: number;
    duplicateIdCount: number;
    emptyRecordCount: number;
  },
) {
  if (cleanup.removedCount === 0) return;
  console.info("[ActiveCampaignCreatorsCleanup]", "delete-stale-current-state-rows", {
    reason,
    removedCount: cleanup.removedCount,
    emptyRows: cleanup.emptyRecordCount,
    duplicateIdRows: cleanup.duplicateIdCount,
    at: new Date().toISOString(),
  });
}

function logEmployeeProfileCleanupSummary(
  reason: string,
  cleanup: {
    removedCount: number;
    duplicateIdCount: number;
    emptyRecordCount: number;
  },
) {
  if (cleanup.removedCount === 0) return;
  console.info("[EmployeeProfilesCleanup]", "delete-stale-current-state-rows", {
    reason,
    removedCount: cleanup.removedCount,
    emptyRows: cleanup.emptyRecordCount,
    duplicateIdRows: cleanup.duplicateIdCount,
    at: new Date().toISOString(),
  });
}

function logCampaignPromptVaultCleanupSummary(
  reason: string,
  cleanup: {
    removedCount: number;
    duplicateIdCount: number;
    emptyRecordCount: number;
  },
) {
  if (cleanup.removedCount === 0) return;
  console.info("[CampaignPromptVaultCleanup]", "delete-stale-current-state-rows", {
    reason,
    removedCount: cleanup.removedCount,
    emptyRows: cleanup.emptyRecordCount,
    duplicateIdRows: cleanup.duplicateIdCount,
    at: new Date().toISOString(),
  });
}

async function readCreatorSourcingDatabaseFromGoogleSheetsUncached(
  spreadsheetId: string,
  reason: string,
) {
  logGoogleSheetsCache("creator-sourcing-cache-miss", { reason });
  await ensureDatabaseShape(spreadsheetId);

  const campaignRange = `${quoteSheetName("CampaignProfiles")}!A1:Z1000`;
  const sourcingRange = `${quoteSheetName("SourcingTemplates")}!A1:Z1000`;
  const valuesByRange = await readValuesBatch(spreadsheetId, [campaignRange, sourcingRange]);
  const [campaignProfiles, sourcingRows, appSettingRows] = await Promise.all([
    Promise.resolve(
      parseWorksheetRowsFromValues(
        "CampaignProfiles",
        valuesByRange.get(campaignRange) ?? [],
      ) as CampaignProfileRecord[],
    ),
    Promise.resolve(
      parseWorksheetRecordsWithRowNumbersFromValues<SourcingTemplateRecord>(
        "SourcingTemplates",
        valuesByRange.get(sourcingRange) ?? [],
      ),
    ),
    readAppSettingsRecordsWithRowNumbers(spreadsheetId),
  ]);
  const cleanup = cleanupSourcingTemplateRecords(sourcingRows.rows.map((row) => row.record));

  if (cleanup.removedCount > 0) {
    logSourcingTemplateCleanupSummary("creator-sourcing-load", cleanup);
    await writeCurrentStateWorksheetRows(
      spreadsheetId,
      "SourcingTemplates",
      sourcingRows,
      cleanup.records,
    );
    invalidateDatabaseReadCache("sourcing-template-load-cleanup");
  }

  const database = createEmptyCentralDatabase();
  database.worksheets.CampaignProfiles = campaignProfiles;
  database.worksheets.SourcingTemplates = cleanup.records.filter(isActiveSourcingTemplateRecord);
  database.worksheets.AppSettings = appSettingRows.rows.map((row) => row.record);

  creatorSourcingReadCache = {
    spreadsheetId,
    database: cloneDatabase(database),
    expiresAt: Date.now() + databaseReadCacheTtlMs,
  };

  return database;
}

function upsertAppSettingRecord(
  settings: AppSettingRecord[],
  settingKey: string,
  settingValue: string,
) {
  const now = new Date().toISOString();
  const nextSetting: AppSettingRecord = {
    settingKey,
    settingValue,
    updatedAt: now,
  };
  const index = settings.findIndex((setting) => setting.settingKey === settingKey);
  if (index < 0) return [...settings, nextSetting];

  return settings.map((setting, settingIndex) => (settingIndex === index ? nextSetting : setting));
}

async function readCreatorSourcingDatabaseSubset(
  spreadsheetId: string,
  overrides: Partial<{
    SourcingTemplates: SourcingTemplateRecord[];
    AppSettings: AppSettingRecord[];
  }> = {},
) {
  const database = createEmptyCentralDatabase();
  database.worksheets.CampaignProfiles = (await readWorksheetRows(
    spreadsheetId,
    "CampaignProfiles",
  )) as CampaignProfileRecord[];
  database.worksheets.SourcingTemplates =
    overrides.SourcingTemplates ??
    ((await readWorksheetRows(spreadsheetId, "SourcingTemplates")) as SourcingTemplateRecord[]);
  database.worksheets.SourcingTemplates = database.worksheets.SourcingTemplates.filter(
    isActiveSourcingTemplateRecord,
  );
  database.worksheets.AppSettings =
    overrides.AppSettings ?? (await readAppSettingsRows(spreadsheetId));
  return database;
}

function invalidateDatabaseReadCache(reason: string) {
  databaseReadCache = null;
  databaseReadPromise = null;
  logGoogleSheetsCache("database-cache-invalidated", { reason });
}

function invalidateCreatorSourcingReadCache(reason: string) {
  creatorSourcingReadCache = null;
  creatorSourcingReadPromise = null;
  logGoogleSheetsCache("creator-sourcing-cache-invalidated", { reason });
}

async function getMetadata(spreadsheetId: string): Promise<SpreadsheetMetadata> {
  const params = new URLSearchParams({
    fields:
      "spreadsheetId,spreadsheetUrl,properties(title),sheets(properties(sheetId,title,index,gridProperties(rowCount,columnCount)))",
  });
  logGoogleSheetsRead("spreadsheets.get", { spreadsheetId });
  return googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?${params}`);
}

async function readValues(spreadsheetId: string, range: string): Promise<unknown[][]> {
  const cacheKey = valuesReadCacheKey(spreadsheetId, range);
  const cached = valuesReadCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    logGoogleSheetsCache("values-cache-hit", {
      spreadsheetId,
      range,
      ttlMs: cached.expiresAt - now,
    });
    return cloneSheetValues(cached.values);
  }

  const inFlight = valuesReadPromises.get(cacheKey);
  if (inFlight) {
    logGoogleSheetsCache("values-inflight-reuse", { spreadsheetId, range });
    return cloneSheetValues(await inFlight);
  }

  const encodedRange = encodeURIComponent(range);
  logGoogleSheetsCache("values-cache-miss", { spreadsheetId, range });
  logGoogleSheetsRead("values.get", { spreadsheetId, range });
  const promise = googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}?valueRenderOption=UNFORMATTED_VALUE`,
  )
    .then((result) => ((result as { values?: unknown[][] }).values ?? []) as unknown[][])
    .then((values) => {
      valuesReadCache.set(cacheKey, {
        values: cloneSheetValues(values),
        expiresAt: Date.now() + valuesReadCacheTtlMs,
      });
      return values;
    })
    .finally(() => {
      valuesReadPromises.delete(cacheKey);
    });
  valuesReadPromises.set(cacheKey, promise);
  return cloneSheetValues(await promise);
}

async function readValuesBatch(
  spreadsheetId: string,
  ranges: readonly string[],
): Promise<Map<string, unknown[][]>> {
  const now = Date.now();
  const valuesByRange = new Map<string, unknown[][]>();
  const rangesToFetch: string[] = [];

  for (const range of ranges) {
    const cacheKey = valuesReadCacheKey(spreadsheetId, range);
    const cached = valuesReadCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      logGoogleSheetsCache("values-cache-hit", {
        spreadsheetId,
        range,
        ttlMs: cached.expiresAt - now,
      });
      valuesByRange.set(range, cloneSheetValues(cached.values));
      continue;
    }

    rangesToFetch.push(range);
  }

  if (rangesToFetch.length > 0) {
    const params = new URLSearchParams({ valueRenderOption: "UNFORMATTED_VALUE" });
    rangesToFetch.forEach((range) => params.append("ranges", range));
    logGoogleSheetsCache("values-batch-cache-miss", {
      spreadsheetId,
      ranges: rangesToFetch,
    });
    logGoogleSheetsRead("values.batchGet", {
      spreadsheetId,
      ranges: rangesToFetch,
    });
    const response = (await googleFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${params}`,
    )) as { valueRanges?: Array<{ values?: unknown[][] }> };

    rangesToFetch.forEach((range, index) => {
      const values = response.valueRanges?.[index]?.values ?? [];
      valuesReadCache.set(valuesReadCacheKey(spreadsheetId, range), {
        values: cloneSheetValues(values),
        expiresAt: Date.now() + valuesReadCacheTtlMs,
      });
      valuesByRange.set(range, cloneSheetValues(values));
    });
  }

  return valuesByRange;
}

async function updateValues(spreadsheetId: string, range: string, values: unknown[][]) {
  const encodedRange = encodeURIComponent(range);
  await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}?valueInputOption=RAW`,
    {
      method: "PUT",
      body: JSON.stringify({
        majorDimension: "ROWS",
        values,
      }),
    },
  );
  invalidateValuesReadCache(spreadsheetId, `update:${range}`, getWorksheetNameFromRange(range));
}

async function clearValues(spreadsheetId: string, range: string) {
  const encodedRange = encodeURIComponent(range);
  await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}:clear`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
  invalidateValuesReadCache(spreadsheetId, `clear:${range}`, getWorksheetNameFromRange(range));
}

async function batchUpdate(spreadsheetId: string, requests: Array<Record<string, unknown>>) {
  if (requests.length === 0) return;
  await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests }),
  });
  invalidateValuesReadCache(spreadsheetId, "batchUpdate");
}

function valuesReadCacheKey(spreadsheetId: string, range: string) {
  return `${spreadsheetId}::${range}`;
}

function cloneSheetValues(values: unknown[][]) {
  return values.map((row) => [...row]);
}

function invalidateValuesReadCache(
  spreadsheetId: string,
  reason: string,
  worksheetName?: string | null,
) {
  const prefix = `${spreadsheetId}::`;
  const quotedWorksheetPrefix = worksheetName ? `${prefix}${quoteSheetName(worksheetName)}!` : "";
  const rawWorksheetPrefix = worksheetName ? `${prefix}${worksheetName}!` : "";
  let removed = 0;
  for (const key of valuesReadCache.keys()) {
    if (!key.startsWith(prefix)) continue;
    if (
      worksheetName &&
      !key.startsWith(quotedWorksheetPrefix) &&
      !key.startsWith(rawWorksheetPrefix)
    ) {
      continue;
    }
    valuesReadCache.delete(key);
    removed += 1;
  }
  for (const key of valuesReadPromises.keys()) {
    if (!key.startsWith(prefix)) continue;
    if (
      worksheetName &&
      !key.startsWith(quotedWorksheetPrefix) &&
      !key.startsWith(rawWorksheetPrefix)
    ) {
      continue;
    }
    valuesReadPromises.delete(key);
  }
  if (removed > 0) {
    logGoogleSheetsCache("values-cache-invalidated", {
      spreadsheetId,
      reason,
      worksheetName,
      removed,
    });
  }
}

function getWorksheetNameFromRange(range: string) {
  const quotedMatch = range.match(/^'((?:''|[^'])+)'!/);
  if (quotedMatch) return quotedMatch[1].replace(/''/g, "'");
  const rawMatch = range.match(/^([^!]+)!/);
  return rawMatch?.[1] ?? null;
}

async function googleFetch(url: string, init: RequestInit = {}) {
  const accessToken = await getAccessToken();
  const maxAttempts = 3;
  let response: Response | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    response = await fetch(url, {
      ...init,
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
    });

    if (response.ok || !shouldRetryGoogleSheetsResponse(response) || attempt === maxAttempts) {
      break;
    }

    const retryAfterSeconds = Number(response.headers.get("retry-after"));
    const delayMs = Number.isFinite(retryAfterSeconds)
      ? retryAfterSeconds * 1000
      : 1000 * 2 ** (attempt - 1);
    console.warn("[GoogleSheetsRetry]", "retrying-request", {
      status: response.status,
      attempt,
      nextAttemptInMs: delayMs,
      at: new Date().toISOString(),
    });
    await sleep(delayMs);
  }

  if (!response) throw new Error("Google Sheets request failed before a response was received.");
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google Sheets request failed (${response.status}): ${body}`);
  }
  if (response.status === 204) return {};
  return response.json();
}

function shouldRetryGoogleSheetsResponse(response: Response) {
  return response.status === 429 || response.status === 500 || response.status === 503;
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.expiresAt - 60 > now) return tokenCache.accessToken;

  const config = assertConfigured();
  const jwtHeader = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const jwtClaim = base64Url(
    JSON.stringify({
      iss: config.serviceAccountEmail,
      scope: scopes.join(" "),
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    }),
  );
  const unsignedToken = `${jwtHeader}.${jwtClaim}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsignedToken);
  signer.end();
  const signature = signer.sign(config.privateKey, "base64url");
  const assertion = `${unsignedToken}.${signature}`;
  const params = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!response.ok) {
    throw new Error(`Google auth failed (${response.status}): ${await response.text()}`);
  }
  const data = (await response.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    accessToken: data.access_token,
    expiresAt: now + data.expires_in,
  };
  return tokenCache.accessToken;
}

function readConfig(): GoogleSheetsConfig {
  const spreadsheetId = stringValue(process.env.GOOGLE_SHEETS_SPREADSHEET_ID);
  const serviceAccountEmail = stringValue(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
  const privateKey =
    stringValue(process.env.GOOGLE_PRIVATE_KEY).replace(/\\n/g, "\n") ||
    decodeBase64Key(process.env.GOOGLE_PRIVATE_KEY_BASE64);
  const missing = [
    !serviceAccountEmail ? "GOOGLE_SERVICE_ACCOUNT_EMAIL" : "",
    !privateKey ? "GOOGLE_PRIVATE_KEY or GOOGLE_PRIVATE_KEY_BASE64" : "",
  ].filter(Boolean);

  return {
    spreadsheetId,
    serviceAccountEmail,
    privateKey,
    missing,
  };
}

function assertConfigured() {
  const config = readConfig();
  if (config.missing.length > 0) {
    throw new Error(`Google Sheets is not configured. Missing: ${config.missing.join(", ")}`);
  }
  return config;
}

function rowsToDatabase(rowsBySheet: Record<CentralWorksheetName, SheetRows>): CentralAppDatabase {
  return {
    ...createEmptyCentralDatabase(),
    worksheets: {
      CampaignProfiles: rowsBySheet.CampaignProfiles.map((row) => ({
        campaignId: stringValue(row.campaignId),
        campaignName: stringValue(row.campaignName),
        campaignCode: stringValue(row.campaignCode),
        country: stringValue(row.country),
        preferredLanguages: stringValue(row.preferredLanguages),
        status: stringValue(row.status),
        createdAt: stringValue(row.createdAt),
        updatedAt: stringValue(row.updatedAt),
      })),
      SourcingTemplates: rowsBySheet.SourcingTemplates.map((row) => ({
        id: stringValue(row.id),
        campaignId: stringValue(row.campaignId),
        campaignName: stringValue(row.campaignName),
        templateName: stringValue(row.templateName),
        columnsJson: stringValue(row.columnsJson),
        isActive: stringValue(row.isActive) || "TRUE",
        createdAt: stringValue(row.createdAt),
        updatedAt: stringValue(row.updatedAt),
        createdBy: stringValue(row.createdBy),
        updatedBy: stringValue(row.updatedBy),
      })),
      OutreachTemplates: cleanupOutreachTemplateRecords(
        rowsBySheet.OutreachTemplates.map((row) => ({
          templateId: stringValue(row.templateId),
          templateName: stringValue(row.templateName),
          type: stringValue(row.type) === "Email" ? "Email" : "DM",
          body: stringValue(row.body),
          createdAt: stringValue(row.createdAt),
          updatedAt: stringValue(row.updatedAt),
        })),
      ).records,
      CampaignMemoryCards: cleanupCampaignMemoryCardRecords(
        rowsBySheet.CampaignMemoryCards.map((row) => ({
          cardId: stringValue(row.cardId),
          campaignId: stringValue(row.campaignId),
          title: stringValue(row.title),
          content: stringValue(row.content),
          preferredLanguages: stringValue(row.preferredLanguages),
          createdAt: stringValue(row.createdAt),
          updatedAt: stringValue(row.updatedAt),
        })),
      ).records,
      ActiveCampaignCreators: cleanupActiveCampaignCreatorRecords(
        rowsBySheet.ActiveCampaignCreators.map((row) => ({
          recordId: stringValue(row.recordId),
          campaignId: stringValue(row.campaignId),
          month: stringValue(row.month),
          creatorName: stringValue(row.creatorName),
          creatorLink: stringValue(row.creatorLink),
          avgViews: numberValue(row.avgViews),
          internalQuote: numberValue(row.internalQuote),
          externalQuote: numberValue(row.externalQuote),
          cpm: numberValue(row.cpm),
          profit: numberValue(row.profit),
          profitMargin: numberValue(row.profitMargin),
          status: stringValue(row.status),
          draftLink: stringValue(row.draftLink),
          liveLink: stringValue(row.liveLink),
          notes: stringValue(row.notes),
          createdAt: stringValue(row.createdAt),
          updatedAt: stringValue(row.updatedAt),
        })),
      ).records,
      AgencyDatabase: rowsBySheet.AgencyDatabase.map((row) => ({
        id: stringValue(row.id),
        agencyName: stringValue(row.agencyName),
        contactName: stringValue(row.contactName),
        contactRole: stringValue(row.contactRole),
        contact: stringValue(row.contact),
        contactsJson: stringValue(row.contactsJson),
        email: stringValue(row.email),
        line: stringValue(row.line),
        instagram: stringValue(row.instagram),
        website: stringValue(row.website),
        country: stringValue(row.country),
        niche: stringValue(row.niche),
        notes: stringValue(row.notes),
        status: stringValue(row.status),
        createdAt: stringValue(row.createdAt),
        updatedAt: stringValue(row.updatedAt),
      })),
      CreatorDatabase: rowsBySheet.CreatorDatabase.map((row) => ({
        id: stringValue(row.id),
        creatorName: stringValue(row.creatorName),
        handle: stringValue(row.handle),
        platform: stringValue(row.platform),
        profileUrl: stringValue(row.profileUrl),
        country: stringValue(row.country),
        language: stringValue(row.language),
        niche: stringValue(row.niche),
        followers: numberValue(row.followers),
        avgViews: numberValue(row.avgViews),
        email: stringValue(row.email),
        line: stringValue(row.line),
        instagram: stringValue(row.instagram),
        whatsapp: stringValue(row.whatsapp),
        agencyName: stringValue(row.agencyName),
        notes: stringValue(row.notes),
        status: stringValue(row.status),
        createdAt: stringValue(row.createdAt),
        updatedAt: stringValue(row.updatedAt),
      })),
      EmployeeProfiles: cleanupEmployeeProfileRecords(
        rowsBySheet.EmployeeProfiles.map((row) => ({
          profileId: stringValue(row.profileId) || "employee-profile-default",
          displayName: stringValue(row.displayName),
          avatarUrl: stringValue(row.avatarUrl),
          joiningDate: stringValue(row.joiningDate),
          monthlySalary: numberValue(row.monthlySalary),
          currency: stringValue(row.currency) || "USD",
          notes: stringValue(row.notes),
          accountsJson: stringValue(row.accountsJson),
          createdAt: stringValue(row.createdAt),
          updatedAt: stringValue(row.updatedAt),
        })),
      ).records,
      CampaignPromptVault: cleanupCampaignPromptVaultRecords(
        rowsBySheet.CampaignPromptVault.map((row) => ({
          promptId: stringValue(row.promptId),
          campaignId: stringValue(row.campaignId),
          campaignName: stringValue(row.campaignName),
          category: stringValue(row.category),
          title: stringValue(row.title),
          content: stringValue(row.content),
          input: stringValue(row.input),
          files: stringValue(row.files) || stringValue(row.notes),
          createdAt: stringValue(row.createdAt),
          updatedAt: stringValue(row.updatedAt),
        })),
      ).records,
      AppSettings: rowsBySheet.AppSettings.map((row) => ({
        settingKey: stringValue(row.settingKey),
        settingValue: stringValue(row.settingValue),
        updatedAt: stringValue(row.updatedAt),
      })),
    },
  };
}

function getRowsForWorksheet(
  database: CentralAppDatabase,
  worksheetName: "CampaignProfiles",
): CampaignProfileRecord[];
function getRowsForWorksheet(
  database: CentralAppDatabase,
  worksheetName: "SourcingTemplates",
): SourcingTemplateRecord[];
function getRowsForWorksheet(
  database: CentralAppDatabase,
  worksheetName: "OutreachTemplates",
): OutreachTemplateRecord[];
function getRowsForWorksheet(
  database: CentralAppDatabase,
  worksheetName: "CampaignMemoryCards",
): CampaignMemoryCardRecord[];
function getRowsForWorksheet(
  database: CentralAppDatabase,
  worksheetName: "ActiveCampaignCreators",
): ActiveCampaignCreatorRecord[];
function getRowsForWorksheet(
  database: CentralAppDatabase,
  worksheetName: "AgencyDatabase",
): AgencyDatabaseRecord[];
function getRowsForWorksheet(
  database: CentralAppDatabase,
  worksheetName: "CreatorDatabase",
): CreatorDatabaseRecord[];
function getRowsForWorksheet(
  database: CentralAppDatabase,
  worksheetName: "EmployeeProfiles",
): EmployeeProfileRecord[];
function getRowsForWorksheet(
  database: CentralAppDatabase,
  worksheetName: "CampaignPromptVault",
): CampaignPromptVaultRecord[];
function getRowsForWorksheet(
  database: CentralAppDatabase,
  worksheetName: "AppSettings",
): AppSettingRecord[];
function getRowsForWorksheet(database: CentralAppDatabase, worksheetName: CentralWorksheetName) {
  return database.worksheets[worksheetName];
}

function setRowsForWorksheet(
  database: CentralAppDatabase,
  worksheetName: CentralWorksheetName,
  rows: Array<Record<string, unknown>>,
) {
  (database.worksheets[worksheetName] as Array<Record<string, unknown>>).splice(
    0,
    database.worksheets[worksheetName].length,
    ...rows,
  );
}

function buildHeaderMap(headers: string[], requiredHeaders: string[]) {
  const normalizedHeaders = headers.map(normalizeHeader);
  const map: Record<string, number> = {};

  for (const requiredHeader of requiredHeaders) {
    const exactIndex = normalizedHeaders.findIndex(
      (header) => header === normalizeHeader(requiredHeader),
    );
    if (exactIndex >= 0) {
      map[requiredHeader] = exactIndex;
      continue;
    }

    const aliases = (worksheetHeaderAliases[requiredHeader] ?? []).map(normalizeHeader);
    const aliasIndex = normalizedHeaders.findIndex((header) => aliases.includes(header));
    if (aliasIndex >= 0) map[requiredHeader] = aliasIndex;
  }

  return map;
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function quoteSheetName(sheetName: string) {
  return `'${sheetName.replace(/'/g, "''")}'`;
}

function columnName(columnCount: number) {
  let name = "";
  let index = columnCount;
  while (index > 0) {
    const modulo = (index - 1) % 26;
    name = String.fromCharCode(65 + modulo) + name;
    index = Math.floor((index - modulo) / 26);
  }
  return name || "A";
}

function base64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

function decodeBase64Key(value: unknown) {
  const encoded = stringValue(value);
  if (!encoded) return "";
  return Buffer.from(encoded, "base64").toString("utf8");
}

function numberValue(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function stringValue(value: unknown) {
  return value == null ? "" : String(value);
}

function createAgencyContactValue(record: AgencyDatabaseRecord) {
  return [
    stringValue(record.contact).trim(),
    record.email ? `Email: ${stringValue(record.email).trim()}` : "",
    record.line ? `LINE: ${stringValue(record.line).trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function cloneDatabase(database: CentralAppDatabase): CentralAppDatabase {
  return JSON.parse(JSON.stringify(database)) as CentralAppDatabase;
}

function logGoogleSheetsRead(operation: string, detail: Record<string, unknown>) {
  console.info("[GoogleSheetsRead]", operation, {
    ...detail,
    at: new Date().toISOString(),
  });
}

function logGoogleSheetsCache(operation: string, detail: Record<string, unknown>) {
  console.info("[GoogleSheetsCache]", operation, {
    ...detail,
    at: new Date().toISOString(),
  });
}

export function diagnosticsFromError(error: unknown): StorageDiagnostic[] {
  return [
    {
      level: "error",
      message: error instanceof Error ? error.message : "Google Sheets request failed.",
    },
  ];
}
