import {
  centralWorksheetNames,
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
  type StorageStatus,
} from "./schema";
import {
  cleanupCampaignMemoryCardsRecord,
  cleanupOutreachTemplatesRecord,
  cleanupSourcingTemplatesRecord,
  cleanupSourcingActiveTemplateSettingsRecord,
  createActiveCampaignCreatorRecord,
  createCampaignMemoryCardRecord,
  createOutreachTemplateRecord,
  deleteActiveCampaignCreatorRecord,
  deleteAgencyDatabaseRecord,
  deleteCampaignProfileRecord,
  deleteCampaignMemoryCardRecord,
  deleteCampaignPromptVaultRecord,
  deleteCreatorDatabaseRecord,
  deleteOutreachTemplateRecord,
  deleteSourcingTemplateRecord,
  getGoogleSheetsConnectionStatus,
  listAgencyDatabaseRecords,
  listAppSettingRecords,
  listActiveCampaignCreatorRecords,
  listCampaignMemoryCardRecords,
  listCampaignPromptVaultRecords,
  listCampaignProfileRecords,
  listCreatorDatabaseRecords,
  listEmployeeProfileRecords,
  listOutreachTemplateRecords,
  loadActiveCampaignsBundle,
  loadCreatorOutreachBundle,
  loadCreatorSourcingGoogleSheetsDatabase,
  loadGoogleSheetsDatabase,
  loadPromptVaultBundle,
  migrateAgencyDatabaseContactsRecord,
  migrateLocalDatabaseToGoogleSheets,
  replaceCampaignMemoryCardsForCampaignRecord,
  saveAgencyDatabaseRecord,
  saveAppSettingRecord,
  saveCampaignProfileRecord,
  saveCampaignPromptVaultRecord,
  saveCreatorDatabaseRecord,
  saveEmployeeProfileRecord,
  saveGoogleSheetsDatabase,
  saveSourcingTemplateRecord,
  updateActiveCampaignCreatorRecord,
  updateCampaignMemoryCardRecord,
  updateOutreachTemplateRecord,
} from "./googleSheets.functions";

export type RawSheetTable = {
  worksheetName: string;
  headers: string[];
  rows: Array<Record<string, unknown>>;
};

export type ParsedSheetTable = {
  worksheetName: CentralWorksheetName;
  headerMap: Record<string, number>;
  rows: Array<Record<string, unknown>>;
};

export type GoogleSheetsDatabaseResult = {
  ok: boolean;
  database: CentralAppDatabase | null;
  status: StorageStatus;
};

export type MigrationReport = Record<CentralWorksheetName, number> & { errors: string[] };

export type AgencyDatabaseContactMigrationReport = {
  backupSheetName: string;
  rowsRead: number;
  rowsBackfilled: number;
  rowsWithExistingContactsJson: number;
};

export type SourcingTemplateCleanupReport = {
  beforeRows: number;
  afterRows: number;
  removedRows: number;
  removedInactiveRows: number;
  removedDuplicateIdRows: number;
  removedDuplicateNameRows: number;
};

export type OutreachTemplateCleanupReport = {
  beforeRows: number;
  afterRows: number;
  removedRows: number;
  removedEmptyRows: number;
  removedDuplicateIdRows: number;
  removedDuplicateNameRows: number;
};

export type OutreachTemplatesResult = {
  ok: boolean;
  records: OutreachTemplateRecord[];
  report: OutreachTemplateCleanupReport | null;
  status: StorageStatus;
};

export type CampaignMemoryCardCleanupReport = {
  beforeRows: number;
  afterRows: number;
  removedRows: number;
  removedEmptyRows: number;
  reassignedDuplicateCardIds: number;
  removedDuplicateTitleRows: number;
};

export type CampaignMemoryCardsResult = {
  ok: boolean;
  records: CampaignMemoryCardRecord[];
  report: CampaignMemoryCardCleanupReport | null;
  status: StorageStatus;
};

export type CampaignMemoryCardsForCampaignResult = CampaignMemoryCardsResult & {
  campaignProfiles: CampaignProfileRecord[];
};

export type ActiveCampaignCreatorCleanupReport = {
  beforeRows: number;
  afterRows: number;
  removedRows: number;
  removedEmptyRows: number;
  removedDuplicateIdRows: number;
};

export type ActiveCampaignCreatorsResult = {
  ok: boolean;
  records: ActiveCampaignCreatorRecord[];
  report: ActiveCampaignCreatorCleanupReport | null;
  status: StorageStatus;
};

export type AppSettingsResult = {
  ok: boolean;
  records: AppSettingRecord[];
  status: StorageStatus;
};

export type CampaignProfilesResult = {
  ok: boolean;
  records: CampaignProfileRecord[];
  status: StorageStatus;
};

export type EmployeeProfilesResult = {
  ok: boolean;
  records: EmployeeProfileRecord[];
  status: StorageStatus;
};

export type CampaignPromptVaultResult = {
  ok: boolean;
  records: CampaignPromptVaultRecord[];
  status: StorageStatus;
};

export type CreatorOutreachBundleResult = {
  ok: boolean;
  campaignProfiles: CampaignProfileRecord[];
  outreachTemplates: OutreachTemplateRecord[];
  campaignMemoryCards: CampaignMemoryCardRecord[];
  status: StorageStatus;
};

export type ActiveCampaignsBundleResult = {
  ok: boolean;
  campaignProfiles: CampaignProfileRecord[];
  activeCampaignCreators: ActiveCampaignCreatorRecord[];
  status: StorageStatus;
};

export type PromptVaultBundleResult = {
  ok: boolean;
  campaignProfiles: CampaignProfileRecord[];
  campaignPromptVault: CampaignPromptVaultRecord[];
  appSettings: AppSettingRecord[];
  status: StorageStatus;
};

export type AgencyDatabaseResult = {
  ok: boolean;
  records: AgencyDatabaseRecord[];
  status: StorageStatus;
};

export type CreatorDatabaseResult = {
  ok: boolean;
  records: CreatorDatabaseRecord[];
  status: StorageStatus;
};

export async function getGoogleSheetsStorageStatus(): Promise<StorageStatus> {
  return getGoogleSheetsConnectionStatus();
}

export async function loadDatabaseFromGoogleSheets(
  options: {
    reason?: string;
  } = {},
): Promise<GoogleSheetsDatabaseResult> {
  return loadGoogleSheetsDatabase({ data: { reason: options.reason } });
}

export async function loadCreatorSourcingDatabaseFromGoogleSheets(
  options: {
    reason?: string;
  } = {},
): Promise<GoogleSheetsDatabaseResult> {
  return loadCreatorSourcingGoogleSheetsDatabase({ data: { reason: options.reason } });
}

export async function loadCreatorOutreachBundleFromGoogleSheets(): Promise<CreatorOutreachBundleResult> {
  return loadCreatorOutreachBundle();
}

export async function loadActiveCampaignsBundleFromGoogleSheets(): Promise<ActiveCampaignsBundleResult> {
  return loadActiveCampaignsBundle();
}

export async function loadPromptVaultBundleFromGoogleSheets(): Promise<PromptVaultBundleResult> {
  return loadPromptVaultBundle();
}

export async function listCampaignProfilesFromGoogleSheets(): Promise<CampaignProfilesResult> {
  return listCampaignProfileRecords();
}

export async function saveCampaignProfileToGoogleSheets(
  record: CampaignProfileRecord,
): Promise<CampaignProfilesResult> {
  return saveCampaignProfileRecord({ data: { record } });
}

export async function deleteCampaignProfileFromGoogleSheets(
  campaignId: string,
): Promise<CampaignProfilesResult> {
  return deleteCampaignProfileRecord({ data: { campaignId } });
}

export async function listAgencyDatabaseFromGoogleSheets(): Promise<AgencyDatabaseResult> {
  return listAgencyDatabaseRecords();
}

export async function saveAgencyDatabaseToGoogleSheets(
  record: AgencyDatabaseRecord,
): Promise<AgencyDatabaseResult> {
  return saveAgencyDatabaseRecord({ data: { record } });
}

export async function deleteAgencyDatabaseFromGoogleSheets(
  recordId: string,
): Promise<AgencyDatabaseResult> {
  return deleteAgencyDatabaseRecord({ data: { recordId } });
}

export async function listCreatorDatabaseFromGoogleSheets(): Promise<CreatorDatabaseResult> {
  return listCreatorDatabaseRecords();
}

export async function saveCreatorDatabaseToGoogleSheets(
  record: CreatorDatabaseRecord,
): Promise<CreatorDatabaseResult> {
  return saveCreatorDatabaseRecord({ data: { record } });
}

export async function deleteCreatorDatabaseFromGoogleSheets(
  recordId: string,
): Promise<CreatorDatabaseResult> {
  return deleteCreatorDatabaseRecord({ data: { recordId } });
}

export async function migrateAgencyDatabaseContactsInGoogleSheets(): Promise<{
  ok: boolean;
  records: AgencyDatabaseRecord[];
  report: AgencyDatabaseContactMigrationReport | null;
  status: StorageStatus;
}> {
  return migrateAgencyDatabaseContactsRecord();
}

export async function saveDatabaseToGoogleSheets(
  database: CentralAppDatabase,
): Promise<GoogleSheetsDatabaseResult> {
  return saveGoogleSheetsDatabase({ data: { database } });
}

export async function saveSourcingTemplateToGoogleSheets(
  record: SourcingTemplateRecord,
): Promise<GoogleSheetsDatabaseResult> {
  return saveSourcingTemplateRecord({ data: { record } });
}

export async function deleteSourcingTemplateFromGoogleSheets(
  templateId: string,
): Promise<GoogleSheetsDatabaseResult> {
  return deleteSourcingTemplateRecord({ data: { templateId } });
}

export async function cleanupSourcingTemplatesInGoogleSheets(): Promise<
  GoogleSheetsDatabaseResult & { report: SourcingTemplateCleanupReport | null }
> {
  return cleanupSourcingTemplatesRecord();
}

export async function listOutreachTemplatesFromGoogleSheets(): Promise<OutreachTemplatesResult> {
  return listOutreachTemplateRecords();
}

export async function createOutreachTemplateInGoogleSheets(
  record: OutreachTemplateRecord,
): Promise<OutreachTemplatesResult> {
  return createOutreachTemplateRecord({ data: { record } });
}

export async function updateOutreachTemplateInGoogleSheets(
  record: OutreachTemplateRecord,
): Promise<OutreachTemplatesResult> {
  return updateOutreachTemplateRecord({ data: { record } });
}

export async function deleteOutreachTemplateFromGoogleSheets(
  templateId: string,
): Promise<OutreachTemplatesResult> {
  return deleteOutreachTemplateRecord({ data: { templateId } });
}

export async function cleanupOutreachTemplatesInGoogleSheets(): Promise<OutreachTemplatesResult> {
  return cleanupOutreachTemplatesRecord();
}

export async function listCampaignMemoryCardsFromGoogleSheets(): Promise<CampaignMemoryCardsResult> {
  return listCampaignMemoryCardRecords();
}

export async function createCampaignMemoryCardInGoogleSheets(
  record: CampaignMemoryCardRecord,
): Promise<CampaignMemoryCardsResult> {
  return createCampaignMemoryCardRecord({ data: { record } });
}

export async function updateCampaignMemoryCardInGoogleSheets(
  record: CampaignMemoryCardRecord,
): Promise<CampaignMemoryCardsResult> {
  return updateCampaignMemoryCardRecord({ data: { record } });
}

export async function deleteCampaignMemoryCardFromGoogleSheets(
  cardId: string,
): Promise<CampaignMemoryCardsResult> {
  return deleteCampaignMemoryCardRecord({ data: { cardId } });
}

export async function replaceCampaignMemoryCardsForCampaignInGoogleSheets({
  campaignId,
  preferredLanguages,
  records,
}: {
  campaignId: string;
  preferredLanguages: string;
  records: CampaignMemoryCardRecord[];
}): Promise<CampaignMemoryCardsForCampaignResult> {
  return replaceCampaignMemoryCardsForCampaignRecord({
    data: { campaignId, preferredLanguages, records },
  });
}

export async function cleanupCampaignMemoryCardsInGoogleSheets(): Promise<CampaignMemoryCardsResult> {
  return cleanupCampaignMemoryCardsRecord();
}

export async function listActiveCampaignCreatorsFromGoogleSheets(): Promise<ActiveCampaignCreatorsResult> {
  return listActiveCampaignCreatorRecords();
}

export async function createActiveCampaignCreatorInGoogleSheets(
  record: ActiveCampaignCreatorRecord,
): Promise<ActiveCampaignCreatorsResult> {
  return createActiveCampaignCreatorRecord({ data: { record } });
}

export async function updateActiveCampaignCreatorInGoogleSheets(
  record: ActiveCampaignCreatorRecord,
): Promise<ActiveCampaignCreatorsResult> {
  return updateActiveCampaignCreatorRecord({ data: { record } });
}

export async function deleteActiveCampaignCreatorFromGoogleSheets(
  recordId: string,
): Promise<ActiveCampaignCreatorsResult> {
  return deleteActiveCampaignCreatorRecord({ data: { recordId } });
}

export async function saveAppSettingToGoogleSheets(
  record: AppSettingRecord,
): Promise<AppSettingsResult> {
  return saveAppSettingRecord({ data: { record } });
}

export async function listAppSettingsFromGoogleSheets(): Promise<AppSettingsResult> {
  return listAppSettingRecords();
}

export async function listEmployeeProfilesFromGoogleSheets(): Promise<EmployeeProfilesResult> {
  return listEmployeeProfileRecords();
}

export async function saveEmployeeProfileToGoogleSheets(
  record: EmployeeProfileRecord,
): Promise<EmployeeProfilesResult> {
  return saveEmployeeProfileRecord({ data: { record } });
}

export async function listCampaignPromptVaultFromGoogleSheets(): Promise<CampaignPromptVaultResult> {
  return listCampaignPromptVaultRecords();
}

export async function saveCampaignPromptVaultToGoogleSheets(
  record: CampaignPromptVaultRecord,
): Promise<CampaignPromptVaultResult> {
  return saveCampaignPromptVaultRecord({ data: { record } });
}

export async function deleteCampaignPromptVaultFromGoogleSheets(
  promptId: string,
): Promise<CampaignPromptVaultResult> {
  return deleteCampaignPromptVaultRecord({ data: { promptId } });
}

export async function cleanupSourcingActiveTemplateSettingsInGoogleSheets(): Promise<{
  ok: boolean;
  records: unknown[];
  changedCount: number;
  status: StorageStatus;
}> {
  return cleanupSourcingActiveTemplateSettingsRecord();
}

export async function migrateDatabaseToGoogleSheets(database: CentralAppDatabase): Promise<{
  ok: boolean;
  database: CentralAppDatabase | null;
  report: MigrationReport | null;
  status: StorageStatus;
}> {
  return migrateLocalDatabaseToGoogleSheets({ data: { database } });
}

export function parseWorksheetByHeaders(
  worksheetName: CentralWorksheetName,
  headers: string[],
  rows: Array<Record<string, unknown>>,
): ParsedSheetTable {
  return {
    worksheetName,
    headerMap: buildHeaderMap(headers, requiredWorksheetHeaders[worksheetName]),
    rows,
  };
}

export function diagnoseWorkbookTables(tables: RawSheetTable[]): StorageDiagnostic[] {
  const diagnostics: StorageDiagnostic[] = [];
  const tablesByName = new Map(
    tables.map((table) => [normalizeWorksheetName(table.worksheetName), table]),
  );

  for (const worksheetName of centralWorksheetNames) {
    const table = tablesByName.get(normalizeWorksheetName(worksheetName));
    if (!table) {
      diagnostics.push({
        level: "error",
        worksheet: worksheetName,
        message: `Missing worksheet: ${worksheetName}`,
      });
      continue;
    }

    const missingHeaders = getMissingHeaders(worksheetName, table.headers);
    if (missingHeaders.length > 0) {
      diagnostics.push({
        level: "error",
        worksheet: worksheetName,
        message: `${worksheetName} is missing required headers.`,
        missingHeaders,
      });
    }
  }

  return diagnostics;
}

export function buildHeaderMap(headers: string[], requiredHeaders: string[]) {
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

export function getMissingHeaders(worksheetName: CentralWorksheetName, headers: string[]) {
  const headerMap = buildHeaderMap(headers, requiredWorksheetHeaders[worksheetName]);
  return requiredWorksheetHeaders[worksheetName].filter(
    (header) => headerMap[header] === undefined,
  );
}

export function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeWorksheetName(value: string) {
  return value.trim().toLowerCase();
}
