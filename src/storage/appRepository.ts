import {
  loadCentralDatabaseFromLocalStorage,
  saveCentralDatabaseToLocalStorage,
} from "./localStorageAdapter";
import {
  cleanupSourcingTemplatesInGoogleSheets,
  deleteSourcingTemplateFromGoogleSheets,
  getGoogleSheetsStorageStatus,
  loadCreatorSourcingDatabaseFromGoogleSheets,
  loadDatabaseFromGoogleSheets,
  migrateDatabaseToGoogleSheets,
  saveDatabaseToGoogleSheets,
  saveSourcingTemplateToGoogleSheets,
  type GoogleSheetsDatabaseResult,
  type MigrationReport,
  type SourcingTemplateCleanupReport,
} from "./googleSheetsAdapter";

export type { MigrationReport };
import {
  type ActiveCampaignCreatorRecord,
  type AppSettingRecord,
  type CampaignMemoryCardRecord,
  type CampaignProfileRecord,
  type CentralAppDatabase,
  type OutreachTemplateRecord,
  type PerformanceBenchmarkRecord,
  type PerformanceWeeklyInputRecord,
  type SourcingTemplateRecord,
  type StorageStatus,
} from "./schema";

const primaryDatabaseCacheTtlMs = 45_000;
let primaryDatabaseCache: {
  database: CentralAppDatabase;
  status: StorageStatus;
  expiresAt: number;
} | null = null;
let primaryDatabaseLoadPromise: Promise<GoogleSheetsDatabaseResult> | null = null;

export function loadAppDatabase(): CentralAppDatabase {
  return loadCentralDatabaseFromLocalStorage().database;
}

export async function loadAppDatabaseFromGoogleSheetsOnly(
  options: {
    reason?: string;
    force?: boolean;
  } = {},
): Promise<CentralAppDatabase> {
  const result = await loadPrimaryDatabaseResult({
    reason: options.reason ?? "loadAppDatabaseFromGoogleSheetsOnly",
    force: options.force,
  });
  if (!result.ok || !result.database) {
    throw new Error(getStorageFailureMessage(result.status));
  }
  return cloneCentralDatabase(result.database);
}

export async function loadCreatorSourcingDatabaseFromGoogleSheetsOnly(
  options: {
    reason?: string;
  } = {},
): Promise<CentralAppDatabase> {
  const result = await loadCreatorSourcingDatabaseFromGoogleSheets({
    reason: options.reason ?? "loadCreatorSourcingDatabaseFromGoogleSheetsOnly",
  });
  if (!result.ok || !result.database) {
    throw new Error(getStorageFailureMessage(result.status));
  }
  return cloneCentralDatabase(result.database);
}

export async function saveAppDatabaseToGoogleSheetsOnly(
  database: CentralAppDatabase,
  options: { reason?: string } = {},
): Promise<CentralAppDatabase> {
  console.info("[AppRepositoryGoogleSheets]", "save-start", {
    reason: options.reason ?? "saveAppDatabaseToGoogleSheetsOnly",
    at: new Date().toISOString(),
  });
  const result = await saveDatabaseToGoogleSheets(database);
  if (!result.ok || !result.database) {
    throw new Error(getStorageFailureMessage(result.status));
  }
  rememberPrimaryDatabase(result.database, result.status);
  return cloneCentralDatabase(result.database);
}

export async function saveSourcingTemplateToGoogleSheetsOnly(
  record: SourcingTemplateRecord,
): Promise<CentralAppDatabase> {
  console.info("[AppRepositoryGoogleSheets]", "save-sourcing-template-start", {
    templateId: record.id,
    campaignId: record.campaignId,
    at: new Date().toISOString(),
  });
  const result = await saveSourcingTemplateToGoogleSheets(record);
  if (!result.ok || !result.database) {
    throw new Error(getStorageFailureMessage(result.status));
  }
  clearPrimaryDatabaseCache();
  return cloneCentralDatabase(result.database);
}

export async function deleteSourcingTemplateFromGoogleSheetsOnly(
  templateId: string,
): Promise<CentralAppDatabase> {
  console.info("[AppRepositoryGoogleSheets]", "delete-sourcing-template-start", {
    templateId,
    at: new Date().toISOString(),
  });
  const result = await deleteSourcingTemplateFromGoogleSheets(templateId);
  if (!result.ok || !result.database) {
    throw new Error(getStorageFailureMessage(result.status));
  }
  clearPrimaryDatabaseCache();
  return cloneCentralDatabase(result.database);
}

export async function cleanupSourcingTemplatesInGoogleSheetsOnly(): Promise<{
  database: CentralAppDatabase;
  report: SourcingTemplateCleanupReport;
}> {
  console.info("[AppRepositoryGoogleSheets]", "cleanup-sourcing-templates-start", {
    at: new Date().toISOString(),
  });
  const result = await cleanupSourcingTemplatesInGoogleSheets();
  if (!result.ok || !result.database || !result.report) {
    throw new Error(getStorageFailureMessage(result.status));
  }
  clearPrimaryDatabaseCache();
  return {
    database: cloneCentralDatabase(result.database),
    report: result.report,
  };
}

export function saveAppDatabase(database: CentralAppDatabase) {
  saveCentralDatabaseToLocalStorage(database);
  if (typeof window !== "undefined") {
    void saveDatabaseToGoogleSheets(database)
      .then((result) => {
        if (result.ok && result.database) {
          rememberPrimaryDatabase(result.database, result.status);
          return;
        }
        reportGoogleSheetsWriteFailure(result.status.diagnostics);
      })
      .catch((error) => {
        reportGoogleSheetsWriteFailure([
          {
            level: "error",
            message:
              error instanceof Error
                ? error.message
                : "Google Sheets write failed. Local cache was not promoted to shared storage.",
          },
        ]);
      });
  }
}

function reportGoogleSheetsWriteFailure(diagnostics: StorageStatus["diagnostics"]) {
  const message =
    diagnostics.map((diagnostic) => diagnostic.message).join("\n") ||
    "Google Sheets write failed. Local cache was not promoted to shared storage.";
  console.error(message);
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("katlas-storage-error", {
      detail: { message, diagnostics },
    }),
  );
}

function getStorageFailureMessage(status: StorageStatus): string {
  return (
    status.diagnostics
      .map((diagnostic) => diagnostic.message)
      .filter(Boolean)
      .join("\n") || "Google Sheets is unavailable. Shared database write was not completed."
  );
}

export function getAppStorageStatus(): StorageStatus {
  const localResult = loadCentralDatabaseFromLocalStorage();

  return {
    source: "localStorage",
    shared: false,
    configured: true,
    diagnostics: localResult.diagnostics,
  };
}

export async function getAppStorageStatusAsync(): Promise<StorageStatus> {
  const localResult = loadCentralDatabaseFromLocalStorage();
  try {
    const sheetsStatus = await getGoogleSheetsStorageStatus();
    if (sheetsStatus.configured) return sheetsStatus;

    return {
      source: "localStorage",
      shared: false,
      configured: true,
      diagnostics: [...localResult.diagnostics, ...sheetsStatus.diagnostics],
    };
  } catch (error) {
    return {
      source: "localStorage",
      shared: false,
      configured: true,
      diagnostics: [
        ...localResult.diagnostics,
        {
          level: "warning",
          message:
            error instanceof Error ? error.message : "Could not check Google Sheets connection.",
        },
      ],
    };
  }
}

export async function refreshAppDatabaseFromPrimary(): Promise<StorageStatus> {
  try {
    const result = await loadPrimaryDatabaseResult({
      reason: "refreshAppDatabaseFromPrimary",
    });
    if (result.ok && result.database) {
      return {
        ...result.status,
        source: "googleSheets",
        shared: true,
      };
    }
    return {
      source: "localStorage",
      shared: false,
      configured: true,
      diagnostics: result.status.diagnostics,
    };
  } catch (error) {
    return {
      source: "localStorage",
      shared: false,
      configured: true,
      diagnostics: [
        {
          level: "warning",
          message:
            error instanceof Error
              ? error.message
              : "Google Sheets is unavailable. Using local fallback.",
        },
      ],
    };
  }
}

async function loadPrimaryDatabaseResult({
  reason,
  force = false,
}: {
  reason: string;
  force?: boolean;
}): Promise<GoogleSheetsDatabaseResult> {
  const now = Date.now();
  if (!force && primaryDatabaseCache && primaryDatabaseCache.expiresAt > now) {
    console.info("[AppRepositoryGoogleSheets]", "client-cache-hit", {
      reason,
      ttlMs: primaryDatabaseCache.expiresAt - now,
      at: new Date().toISOString(),
    });
    return {
      ok: true,
      database: cloneCentralDatabase(primaryDatabaseCache.database),
      status: primaryDatabaseCache.status,
    };
  }

  if (!force && primaryDatabaseLoadPromise) {
    console.info("[AppRepositoryGoogleSheets]", "client-inflight-reuse", {
      reason,
      at: new Date().toISOString(),
    });
    const result = await primaryDatabaseLoadPromise;
    return cloneGoogleSheetsResult(result);
  }

  console.info("[AppRepositoryGoogleSheets]", "client-cache-miss", {
    reason,
    at: new Date().toISOString(),
  });
  primaryDatabaseLoadPromise = loadDatabaseFromGoogleSheets({ reason })
    .then((result) => {
      if (result.ok && result.database) rememberPrimaryDatabase(result.database, result.status);
      return result;
    })
    .finally(() => {
      primaryDatabaseLoadPromise = null;
    });

  const result = await primaryDatabaseLoadPromise;
  return cloneGoogleSheetsResult(result);
}

function rememberPrimaryDatabase(database: CentralAppDatabase, status: StorageStatus) {
  const databaseCopy = cloneCentralDatabase(database);
  saveCentralDatabaseToLocalStorage(databaseCopy);
  primaryDatabaseCache = {
    database: databaseCopy,
    status,
    expiresAt: Date.now() + primaryDatabaseCacheTtlMs,
  };
}

function clearPrimaryDatabaseCache() {
  primaryDatabaseCache = null;
  primaryDatabaseLoadPromise = null;
}

function cloneGoogleSheetsResult(result: GoogleSheetsDatabaseResult): GoogleSheetsDatabaseResult {
  return {
    ...result,
    database: result.database ? cloneCentralDatabase(result.database) : null,
  };
}

function cloneCentralDatabase(database: CentralAppDatabase): CentralAppDatabase {
  return JSON.parse(JSON.stringify(database)) as CentralAppDatabase;
}

export async function migrateLocalDatabaseToPrimary(): Promise<{
  ok: boolean;
  report: MigrationReport | null;
  status: StorageStatus;
}> {
  const localDatabase = loadAppDatabase();
  const result = await migrateDatabaseToGoogleSheets(localDatabase);
  if (result.ok && result.database) {
    rememberPrimaryDatabase(result.database, result.status);
  }
  return {
    ok: result.ok,
    report: result.report,
    status: result.ok
      ? {
          ...result.status,
          source: "googleSheets",
          shared: true,
        }
      : result.status,
  };
}

export function readCampaignProfiles(): CampaignProfileRecord[] {
  return loadAppDatabase().worksheets.CampaignProfiles;
}

export function writeCampaignProfiles(records: CampaignProfileRecord[]) {
  updateDatabase((database) => {
    database.worksheets.CampaignProfiles = records;
  });
}

export function readSourcingTemplates(): SourcingTemplateRecord[] {
  return loadAppDatabase().worksheets.SourcingTemplates;
}

export function writeSourcingTemplates(records: SourcingTemplateRecord[]) {
  updateDatabase((database) => {
    database.worksheets.SourcingTemplates = records;
  });
}

export function readOutreachTemplates(): OutreachTemplateRecord[] {
  return loadAppDatabase().worksheets.OutreachTemplates;
}

export function writeOutreachTemplates(records: OutreachTemplateRecord[]) {
  updateDatabase((database) => {
    database.worksheets.OutreachTemplates = records;
  });
}

export function readCampaignMemoryCards(): CampaignMemoryCardRecord[] {
  return loadAppDatabase().worksheets.CampaignMemoryCards;
}

export function writeCampaignMemoryCards(records: CampaignMemoryCardRecord[]) {
  updateDatabase((database) => {
    database.worksheets.CampaignMemoryCards = records;
  });
}

export function readActiveCampaignCreators(): ActiveCampaignCreatorRecord[] {
  return loadAppDatabase().worksheets.ActiveCampaignCreators;
}

export function writeActiveCampaignCreators(records: ActiveCampaignCreatorRecord[]) {
  updateDatabase((database) => {
    database.worksheets.ActiveCampaignCreators = records;
  });
}

export function readPerformanceBenchmarks(): PerformanceBenchmarkRecord[] {
  return loadAppDatabase().worksheets.PerformanceBenchmarks;
}

export function writePerformanceBenchmarks(records: PerformanceBenchmarkRecord[]) {
  updateDatabase((database) => {
    database.worksheets.PerformanceBenchmarks = records;
  });
}

export function readPerformanceWeeklyInputs(): PerformanceWeeklyInputRecord[] {
  return loadAppDatabase().worksheets.PerformanceWeeklyInputs;
}

export function writePerformanceWeeklyInputs(records: PerformanceWeeklyInputRecord[]) {
  updateDatabase((database) => {
    database.worksheets.PerformanceWeeklyInputs = records;
  });
}

export function readAppSettings(): AppSettingRecord[] {
  return loadAppDatabase().worksheets.AppSettings;
}

export function writeAppSettings(records: AppSettingRecord[]) {
  updateDatabase((database) => {
    database.worksheets.AppSettings = records;
  });
}

export function getAppSetting(settingKey: string, fallback = "") {
  return (
    readAppSettings().find((setting) => setting.settingKey === settingKey)?.settingValue ?? fallback
  );
}

export function setAppSetting(settingKey: string, settingValue: string) {
  updateDatabase((database) => {
    const existing = database.worksheets.AppSettings.find(
      (setting) => setting.settingKey === settingKey,
    );
    const updatedAt = new Date().toISOString();
    if (existing) {
      existing.settingValue = settingValue;
      existing.updatedAt = updatedAt;
      return;
    }
    database.worksheets.AppSettings.push({ settingKey, settingValue, updatedAt });
  });
}

export function updateDatabase(mutator: (database: CentralAppDatabase) => void) {
  const database = loadAppDatabase();
  mutator(database);
  saveAppDatabase(database);
}
