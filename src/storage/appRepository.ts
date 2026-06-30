import {
  loadCentralDatabaseFromLocalStorage,
  saveCentralDatabaseToLocalStorage,
} from "./localStorageAdapter";
import {
  cleanupCampaignMemoryCardsInGoogleSheets,
  cleanupOutreachTemplatesInGoogleSheets,
  cleanupSourcingActiveTemplateSettingsInGoogleSheets,
  cleanupSourcingTemplatesInGoogleSheets,
  createActiveCampaignCreatorInGoogleSheets,
  createCampaignMemoryCardInGoogleSheets,
  createOutreachTemplateInGoogleSheets,
  deleteActiveCampaignCreatorFromGoogleSheets,
  deleteAgencyDatabaseFromGoogleSheets,
  deleteCampaignMemoryCardFromGoogleSheets,
  deleteCampaignPromptVaultFromGoogleSheets,
  deleteCreatorDatabaseFromGoogleSheets,
  deleteOutreachTemplateFromGoogleSheets,
  deleteSourcingTemplateFromGoogleSheets,
  getGoogleSheetsStorageStatus,
  listAgencyDatabaseFromGoogleSheets,
  listAppSettingsFromGoogleSheets,
  listActiveCampaignCreatorsFromGoogleSheets,
  listCampaignMemoryCardsFromGoogleSheets,
  listCampaignPromptVaultFromGoogleSheets,
  listCampaignProfilesFromGoogleSheets,
  listCreatorDatabaseFromGoogleSheets,
  listEmployeeProfilesFromGoogleSheets,
  listOutreachTemplatesFromGoogleSheets,
  loadActiveCampaignsBundleFromGoogleSheets,
  loadCreatorOutreachBundleFromGoogleSheets,
  loadCreatorSourcingDatabaseFromGoogleSheets,
  loadDatabaseFromGoogleSheets,
  loadPromptVaultBundleFromGoogleSheets,
  migrateAgencyDatabaseContactsInGoogleSheets,
  migrateDatabaseToGoogleSheets,
  replaceCampaignMemoryCardsForCampaignInGoogleSheets,
  saveAgencyDatabaseToGoogleSheets,
  saveDatabaseToGoogleSheets,
  saveAppSettingToGoogleSheets,
  saveCampaignPromptVaultToGoogleSheets,
  saveCreatorDatabaseToGoogleSheets,
  saveEmployeeProfileToGoogleSheets,
  saveSourcingTemplateToGoogleSheets,
  updateActiveCampaignCreatorInGoogleSheets,
  updateCampaignMemoryCardInGoogleSheets,
  updateOutreachTemplateInGoogleSheets,
  type ActiveCampaignCreatorCleanupReport,
  type AgencyDatabaseContactMigrationReport,
  type ActiveCampaignsBundleResult,
  type CreatorOutreachBundleResult,
  type CampaignMemoryCardCleanupReport,
  type GoogleSheetsDatabaseResult,
  type MigrationReport,
  type OutreachTemplateCleanupReport,
  type PromptVaultBundleResult,
  type SourcingTemplateCleanupReport,
} from "./googleSheetsAdapter";

export type { MigrationReport };
import {
  type ActiveCampaignCreatorRecord,
  type AppSettingRecord,
  type CampaignMemoryCardRecord,
  type CampaignPromptVaultRecord,
  type CampaignProfileRecord,
  type CentralAppDatabase,
  type AgencyDatabaseRecord,
  type CreatorDatabaseRecord,
  type EmployeeProfileRecord,
  type OutreachTemplateRecord,
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

export async function loadCreatorOutreachBundleFromGoogleSheetsOnly(): Promise<CreatorOutreachBundleResult> {
  console.info("[AppRepositoryGoogleSheets]", "load-creator-outreach-bundle-start", {
    at: new Date().toISOString(),
  });
  const result = await loadCreatorOutreachBundleFromGoogleSheets();
  if (!result.ok) {
    throw new Error(getStorageFailureMessage(result.status));
  }
  rememberCampaignProfiles(result.campaignProfiles);
  rememberOutreachTemplates(result.outreachTemplates);
  rememberCampaignMemoryCards(result.campaignMemoryCards, result.campaignProfiles);
  return result;
}

export async function loadActiveCampaignsBundleFromGoogleSheetsOnly(): Promise<ActiveCampaignsBundleResult> {
  console.info("[AppRepositoryGoogleSheets]", "load-active-campaigns-bundle-start", {
    at: new Date().toISOString(),
  });
  const result = await loadActiveCampaignsBundleFromGoogleSheets();
  if (!result.ok) {
    throw new Error(getStorageFailureMessage(result.status));
  }
  rememberCampaignProfiles(result.campaignProfiles);
  rememberActiveCampaignCreators(result.activeCampaignCreators);
  return result;
}

export async function loadPromptVaultBundleFromGoogleSheetsOnly(): Promise<PromptVaultBundleResult> {
  console.info("[AppRepositoryGoogleSheets]", "load-prompt-vault-bundle-start", {
    at: new Date().toISOString(),
  });
  const result = await loadPromptVaultBundleFromGoogleSheets();
  if (!result.ok) {
    throw new Error(getStorageFailureMessage(result.status));
  }
  rememberCampaignProfiles(result.campaignProfiles);
  rememberCampaignPromptVault(result.campaignPromptVault);
  rememberAppSettings(result.appSettings);
  return result;
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

export async function listCampaignProfilesFromGoogleSheetsOnly(): Promise<CampaignProfileRecord[]> {
  console.info("[AppRepositoryGoogleSheets]", "list-campaign-profiles-start", {
    at: new Date().toISOString(),
  });
  const result = await listCampaignProfilesFromGoogleSheets();
  if (!result.ok) {
    throw new Error(getStorageFailureMessage(result.status));
  }
  rememberCampaignProfiles(result.records);
  return result.records;
}

export async function listAgencyDatabaseFromGoogleSheetsOnly(): Promise<AgencyDatabaseRecord[]> {
  console.info("[AppRepositoryGoogleSheets]", "list-agency-database-start", {
    at: new Date().toISOString(),
  });
  const result = await listAgencyDatabaseFromGoogleSheets();
  if (!result.ok) {
    throw new Error(getStorageFailureMessage(result.status));
  }
  rememberAgencyDatabase(result.records);
  return result.records;
}

export async function saveAgencyDatabaseRecordToGoogleSheetsOnly(
  record: AgencyDatabaseRecord,
): Promise<AgencyDatabaseRecord[]> {
  console.info("[AppRepositoryGoogleSheets]", "save-agency-database-record-start", {
    id: record.id,
    agencyName: record.agencyName,
    at: new Date().toISOString(),
  });
  const result = await saveAgencyDatabaseToGoogleSheets(record);
  if (!result.ok) {
    throw new Error(getStorageFailureMessage(result.status));
  }
  clearPrimaryDatabaseCache();
  rememberAgencyDatabase(result.records);
  return result.records;
}

export async function deleteAgencyDatabaseRecordFromGoogleSheetsOnly(
  recordId: string,
): Promise<AgencyDatabaseRecord[]> {
  console.info("[AppRepositoryGoogleSheets]", "delete-agency-database-record-start", {
    recordId,
    at: new Date().toISOString(),
  });
  const result = await deleteAgencyDatabaseFromGoogleSheets(recordId);
  if (!result.ok) {
    throw new Error(getStorageFailureMessage(result.status));
  }
  clearPrimaryDatabaseCache();
  rememberAgencyDatabase(result.records);
  return result.records;
}

export async function listCreatorDatabaseFromGoogleSheetsOnly(): Promise<CreatorDatabaseRecord[]> {
  console.info("[AppRepositoryGoogleSheets]", "list-creator-database-start", {
    at: new Date().toISOString(),
  });
  const result = await listCreatorDatabaseFromGoogleSheets();
  if (!result.ok) {
    throw new Error(getStorageFailureMessage(result.status));
  }
  rememberCreatorDatabase(result.records);
  return result.records;
}

export async function saveCreatorDatabaseRecordToGoogleSheetsOnly(
  record: CreatorDatabaseRecord,
): Promise<CreatorDatabaseRecord[]> {
  console.info("[AppRepositoryGoogleSheets]", "save-creator-database-record-start", {
    id: record.id,
    creatorName: record.creatorName,
    at: new Date().toISOString(),
  });
  const result = await saveCreatorDatabaseToGoogleSheets(record);
  if (!result.ok) {
    throw new Error(getStorageFailureMessage(result.status));
  }
  clearPrimaryDatabaseCache();
  rememberCreatorDatabase(result.records);
  return result.records;
}

export async function deleteCreatorDatabaseRecordFromGoogleSheetsOnly(
  recordId: string,
): Promise<CreatorDatabaseRecord[]> {
  console.info("[AppRepositoryGoogleSheets]", "delete-creator-database-record-start", {
    recordId,
    at: new Date().toISOString(),
  });
  const result = await deleteCreatorDatabaseFromGoogleSheets(recordId);
  if (!result.ok) {
    throw new Error(getStorageFailureMessage(result.status));
  }
  clearPrimaryDatabaseCache();
  rememberCreatorDatabase(result.records);
  return result.records;
}

export async function migrateAgencyDatabaseContactsInGoogleSheetsOnly(): Promise<{
  records: CentralAppDatabase["worksheets"]["AgencyDatabase"];
  report: AgencyDatabaseContactMigrationReport;
}> {
  console.info("[AppRepositoryGoogleSheets]", "migrate-agency-database-contacts-start", {
    at: new Date().toISOString(),
  });
  const result = await migrateAgencyDatabaseContactsInGoogleSheets();
  if (!result.ok || !result.report) {
    throw new Error(getStorageFailureMessage(result.status));
  }
  clearPrimaryDatabaseCache();
  return {
    records: result.records,
    report: result.report,
  };
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

export async function listOutreachTemplatesFromGoogleSheetsOnly(): Promise<{
  records: OutreachTemplateRecord[];
  report: OutreachTemplateCleanupReport | null;
}> {
  console.info("[AppRepositoryGoogleSheets]", "list-outreach-templates-start", {
    at: new Date().toISOString(),
  });
  const result = await listOutreachTemplatesFromGoogleSheets();
  if (!result.ok) {
    throw new Error(getStorageFailureMessage(result.status));
  }
  return {
    records: result.records,
    report: result.report,
  };
}

export async function createOutreachTemplateInGoogleSheetsOnly(
  record: OutreachTemplateRecord,
): Promise<OutreachTemplateRecord[]> {
  console.info("[AppRepositoryGoogleSheets]", "create-outreach-template-start", {
    templateId: record.templateId,
    templateName: record.templateName,
    at: new Date().toISOString(),
  });
  const result = await createOutreachTemplateInGoogleSheets(record);
  if (!result.ok) {
    throw new Error(getStorageFailureMessage(result.status));
  }
  clearPrimaryDatabaseCache();
  return result.records;
}

export async function updateOutreachTemplateInGoogleSheetsOnly(
  record: OutreachTemplateRecord,
): Promise<OutreachTemplateRecord[]> {
  console.info("[AppRepositoryGoogleSheets]", "update-outreach-template-start", {
    templateId: record.templateId,
    templateName: record.templateName,
    at: new Date().toISOString(),
  });
  const result = await updateOutreachTemplateInGoogleSheets(record);
  if (!result.ok) {
    throw new Error(getStorageFailureMessage(result.status));
  }
  clearPrimaryDatabaseCache();
  return result.records;
}

export async function deleteOutreachTemplateFromGoogleSheetsOnly(
  templateId: string,
): Promise<OutreachTemplateRecord[]> {
  console.info("[AppRepositoryGoogleSheets]", "delete-outreach-template-start", {
    templateId,
    at: new Date().toISOString(),
  });
  const result = await deleteOutreachTemplateFromGoogleSheets(templateId);
  if (!result.ok) {
    throw new Error(getStorageFailureMessage(result.status));
  }
  clearPrimaryDatabaseCache();
  return result.records;
}

export async function cleanupOutreachTemplatesInGoogleSheetsOnly(): Promise<{
  records: OutreachTemplateRecord[];
  report: OutreachTemplateCleanupReport | null;
}> {
  console.info("[AppRepositoryGoogleSheets]", "cleanup-outreach-templates-start", {
    at: new Date().toISOString(),
  });
  const result = await cleanupOutreachTemplatesInGoogleSheets();
  if (!result.ok) {
    throw new Error(getStorageFailureMessage(result.status));
  }
  clearPrimaryDatabaseCache();
  return {
    records: result.records,
    report: result.report,
  };
}

export async function listCampaignMemoryCardsFromGoogleSheetsOnly(): Promise<{
  records: CampaignMemoryCardRecord[];
  report: CampaignMemoryCardCleanupReport | null;
}> {
  console.info("[AppRepositoryGoogleSheets]", "list-campaign-memory-cards-start", {
    at: new Date().toISOString(),
  });
  const result = await listCampaignMemoryCardsFromGoogleSheets();
  if (!result.ok) {
    throw new Error(getStorageFailureMessage(result.status));
  }
  clearPrimaryDatabaseCache();
  rememberCampaignMemoryCards(result.records);
  return {
    records: result.records,
    report: result.report,
  };
}

export async function createCampaignMemoryCardInGoogleSheetsOnly(
  record: CampaignMemoryCardRecord,
): Promise<CampaignMemoryCardRecord[]> {
  console.info("[AppRepositoryGoogleSheets]", "create-campaign-memory-card-start", {
    cardId: record.cardId,
    campaignId: record.campaignId,
    at: new Date().toISOString(),
  });
  const result = await createCampaignMemoryCardInGoogleSheets(record);
  if (!result.ok) {
    throw new Error(getStorageFailureMessage(result.status));
  }
  clearPrimaryDatabaseCache();
  rememberCampaignMemoryCards(result.records);
  return result.records;
}

export async function updateCampaignMemoryCardInGoogleSheetsOnly(
  record: CampaignMemoryCardRecord,
): Promise<CampaignMemoryCardRecord[]> {
  console.info("[AppRepositoryGoogleSheets]", "update-campaign-memory-card-start", {
    cardId: record.cardId,
    campaignId: record.campaignId,
    at: new Date().toISOString(),
  });
  const result = await updateCampaignMemoryCardInGoogleSheets(record);
  if (!result.ok) {
    throw new Error(getStorageFailureMessage(result.status));
  }
  clearPrimaryDatabaseCache();
  rememberCampaignMemoryCards(result.records);
  return result.records;
}

export async function deleteCampaignMemoryCardFromGoogleSheetsOnly(
  cardId: string,
): Promise<CampaignMemoryCardRecord[]> {
  console.info("[AppRepositoryGoogleSheets]", "delete-campaign-memory-card-start", {
    cardId,
    at: new Date().toISOString(),
  });
  const result = await deleteCampaignMemoryCardFromGoogleSheets(cardId);
  if (!result.ok) {
    throw new Error(getStorageFailureMessage(result.status));
  }
  clearPrimaryDatabaseCache();
  rememberCampaignMemoryCards(result.records);
  return result.records;
}

export async function replaceCampaignMemoryCardsForCampaignInGoogleSheetsOnly({
  campaignId,
  preferredLanguages,
  records,
}: {
  campaignId: string;
  preferredLanguages: string;
  records: CampaignMemoryCardRecord[];
}): Promise<{
  records: CampaignMemoryCardRecord[];
  campaignProfiles: CampaignProfileRecord[];
  report: CampaignMemoryCardCleanupReport | null;
}> {
  console.info("[AppRepositoryGoogleSheets]", "replace-campaign-memory-cards-start", {
    campaignId,
    cards: records.length,
    at: new Date().toISOString(),
  });
  const result = await replaceCampaignMemoryCardsForCampaignInGoogleSheets({
    campaignId,
    preferredLanguages,
    records,
  });
  if (!result.ok) {
    throw new Error(getStorageFailureMessage(result.status));
  }
  clearPrimaryDatabaseCache();
  rememberCampaignMemoryCards(result.records, result.campaignProfiles);
  return {
    records: result.records,
    campaignProfiles: result.campaignProfiles,
    report: result.report,
  };
}

export async function cleanupCampaignMemoryCardsInGoogleSheetsOnly(): Promise<{
  records: CampaignMemoryCardRecord[];
  report: CampaignMemoryCardCleanupReport | null;
}> {
  console.info("[AppRepositoryGoogleSheets]", "cleanup-campaign-memory-cards-start", {
    at: new Date().toISOString(),
  });
  const result = await cleanupCampaignMemoryCardsInGoogleSheets();
  if (!result.ok) {
    throw new Error(getStorageFailureMessage(result.status));
  }
  clearPrimaryDatabaseCache();
  rememberCampaignMemoryCards(result.records);
  return {
    records: result.records,
    report: result.report,
  };
}

export async function cleanupSourcingActiveTemplateSettingsInGoogleSheetsOnly(): Promise<{
  changedCount: number;
}> {
  console.info("[AppRepositoryGoogleSheets]", "cleanup-sourcing-active-template-settings-start", {
    at: new Date().toISOString(),
  });
  const result = await cleanupSourcingActiveTemplateSettingsInGoogleSheets();
  if (!result.ok) {
    throw new Error(getStorageFailureMessage(result.status));
  }
  clearPrimaryDatabaseCache();
  return {
    changedCount: result.changedCount,
  };
}

export async function listActiveCampaignCreatorsFromGoogleSheetsOnly(): Promise<{
  records: ActiveCampaignCreatorRecord[];
  report: ActiveCampaignCreatorCleanupReport | null;
}> {
  console.info("[AppRepositoryGoogleSheets]", "list-active-campaign-creators-start", {
    at: new Date().toISOString(),
  });
  const result = await listActiveCampaignCreatorsFromGoogleSheets();
  if (!result.ok) {
    throw new Error(getStorageFailureMessage(result.status));
  }
  clearPrimaryDatabaseCache();
  rememberActiveCampaignCreators(result.records);
  return {
    records: result.records,
    report: result.report,
  };
}

export async function createActiveCampaignCreatorInGoogleSheetsOnly(
  record: ActiveCampaignCreatorRecord,
): Promise<ActiveCampaignCreatorRecord[]> {
  console.info("[AppRepositoryGoogleSheets]", "create-active-campaign-creator-start", {
    recordId: record.recordId,
    campaignId: record.campaignId,
    at: new Date().toISOString(),
  });
  const result = await createActiveCampaignCreatorInGoogleSheets(record);
  if (!result.ok) {
    throw new Error(getStorageFailureMessage(result.status));
  }
  clearPrimaryDatabaseCache();
  rememberActiveCampaignCreators(result.records);
  return result.records;
}

export async function updateActiveCampaignCreatorInGoogleSheetsOnly(
  record: ActiveCampaignCreatorRecord,
): Promise<ActiveCampaignCreatorRecord[]> {
  console.info("[AppRepositoryGoogleSheets]", "update-active-campaign-creator-start", {
    recordId: record.recordId,
    campaignId: record.campaignId,
    at: new Date().toISOString(),
  });
  const result = await updateActiveCampaignCreatorInGoogleSheets(record);
  if (!result.ok) {
    throw new Error(getStorageFailureMessage(result.status));
  }
  clearPrimaryDatabaseCache();
  rememberActiveCampaignCreators(result.records);
  return result.records;
}

export async function deleteActiveCampaignCreatorFromGoogleSheetsOnly(
  recordId: string,
): Promise<ActiveCampaignCreatorRecord[]> {
  console.info("[AppRepositoryGoogleSheets]", "delete-active-campaign-creator-start", {
    recordId,
    at: new Date().toISOString(),
  });
  const result = await deleteActiveCampaignCreatorFromGoogleSheets(recordId);
  if (!result.ok) {
    throw new Error(getStorageFailureMessage(result.status));
  }
  clearPrimaryDatabaseCache();
  rememberActiveCampaignCreators(result.records);
  return result.records;
}

export async function saveAppSettingToGoogleSheetsOnly(
  settingKey: string,
  settingValue: string,
): Promise<AppSettingRecord[]> {
  console.info("[AppRepositoryGoogleSheets]", "save-app-setting-start", {
    settingKey,
    at: new Date().toISOString(),
  });
  const result = await saveAppSettingToGoogleSheets({
    settingKey,
    settingValue,
    updatedAt: new Date().toISOString(),
  });
  if (!result.ok) {
    throw new Error(getStorageFailureMessage(result.status));
  }
  clearPrimaryDatabaseCache();
  rememberAppSettings(result.records);
  return result.records;
}

export async function listAppSettingsFromGoogleSheetsOnly(): Promise<AppSettingRecord[]> {
  console.info("[AppRepositoryGoogleSheets]", "list-app-settings-start", {
    at: new Date().toISOString(),
  });
  const result = await listAppSettingsFromGoogleSheets();
  if (!result.ok) {
    throw new Error(getStorageFailureMessage(result.status));
  }
  rememberAppSettings(result.records);
  return result.records;
}

export async function listEmployeeProfilesFromGoogleSheetsOnly(): Promise<EmployeeProfileRecord[]> {
  console.info("[AppRepositoryGoogleSheets]", "list-employee-profiles-start", {
    at: new Date().toISOString(),
  });
  const result = await listEmployeeProfilesFromGoogleSheets();
  if (!result.ok) {
    throw new Error(getStorageFailureMessage(result.status));
  }
  rememberEmployeeProfiles(result.records);
  return result.records;
}

export async function saveEmployeeProfileToGoogleSheetsOnly(
  record: EmployeeProfileRecord,
): Promise<EmployeeProfileRecord[]> {
  console.info("[AppRepositoryGoogleSheets]", "save-employee-profile-start", {
    profileId: record.profileId,
    at: new Date().toISOString(),
  });
  const result = await saveEmployeeProfileToGoogleSheets(record);
  if (!result.ok) {
    throw new Error(getStorageFailureMessage(result.status));
  }
  clearPrimaryDatabaseCache();
  rememberEmployeeProfiles(result.records);
  return result.records;
}

export async function listCampaignPromptVaultFromGoogleSheetsOnly(): Promise<
  CampaignPromptVaultRecord[]
> {
  console.info("[AppRepositoryGoogleSheets]", "list-campaign-prompt-vault-start", {
    at: new Date().toISOString(),
  });
  const result = await listCampaignPromptVaultFromGoogleSheets();
  if (!result.ok) {
    throw new Error(getStorageFailureMessage(result.status));
  }
  rememberCampaignPromptVault(result.records);
  return result.records;
}

export async function saveCampaignPromptVaultToGoogleSheetsOnly(
  record: CampaignPromptVaultRecord,
): Promise<CampaignPromptVaultRecord[]> {
  console.info("[AppRepositoryGoogleSheets]", "save-campaign-prompt-vault-start", {
    promptId: record.promptId,
    campaignId: record.campaignId,
    at: new Date().toISOString(),
  });
  const result = await saveCampaignPromptVaultToGoogleSheets(record);
  if (!result.ok) {
    throw new Error(getStorageFailureMessage(result.status));
  }
  clearPrimaryDatabaseCache();
  rememberCampaignPromptVault(result.records);
  return result.records;
}

export async function deleteCampaignPromptVaultFromGoogleSheetsOnly(
  promptId: string,
): Promise<CampaignPromptVaultRecord[]> {
  console.info("[AppRepositoryGoogleSheets]", "delete-campaign-prompt-vault-start", {
    promptId,
    at: new Date().toISOString(),
  });
  const result = await deleteCampaignPromptVaultFromGoogleSheets(promptId);
  if (!result.ok) {
    throw new Error(getStorageFailureMessage(result.status));
  }
  clearPrimaryDatabaseCache();
  rememberCampaignPromptVault(result.records);
  return result.records;
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

function rememberCampaignMemoryCards(
  records: CampaignMemoryCardRecord[],
  campaignProfiles?: CampaignProfileRecord[],
) {
  const database = loadAppDatabase();
  database.worksheets.CampaignMemoryCards = records;
  if (campaignProfiles) database.worksheets.CampaignProfiles = campaignProfiles;
  saveCentralDatabaseToLocalStorage(database);
}

function rememberCampaignProfiles(records: CampaignProfileRecord[]) {
  const database = loadAppDatabase();
  database.worksheets.CampaignProfiles = records;
  saveCentralDatabaseToLocalStorage(database);
}

function rememberOutreachTemplates(records: OutreachTemplateRecord[]) {
  const database = loadAppDatabase();
  database.worksheets.OutreachTemplates = records;
  saveCentralDatabaseToLocalStorage(database);
}

function rememberActiveCampaignCreators(records: ActiveCampaignCreatorRecord[]) {
  const database = loadAppDatabase();
  database.worksheets.ActiveCampaignCreators = records;
  saveCentralDatabaseToLocalStorage(database);
}

function rememberAppSettings(records: AppSettingRecord[]) {
  const database = loadAppDatabase();
  database.worksheets.AppSettings = records;
  saveCentralDatabaseToLocalStorage(database);
}

function rememberEmployeeProfiles(records: EmployeeProfileRecord[]) {
  const database = loadAppDatabase();
  database.worksheets.EmployeeProfiles = records;
  saveCentralDatabaseToLocalStorage(database);
}

function rememberCampaignPromptVault(records: CampaignPromptVaultRecord[]) {
  const database = loadAppDatabase();
  database.worksheets.CampaignPromptVault = records;
  saveCentralDatabaseToLocalStorage(database);
}

function rememberAgencyDatabase(records: AgencyDatabaseRecord[]) {
  const database = loadAppDatabase();
  database.worksheets.AgencyDatabase = records;
  saveCentralDatabaseToLocalStorage(database);
}

function rememberCreatorDatabase(records: CreatorDatabaseRecord[]) {
  const database = loadAppDatabase();
  database.worksheets.CreatorDatabase = records;
  saveCentralDatabaseToLocalStorage(database);
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
