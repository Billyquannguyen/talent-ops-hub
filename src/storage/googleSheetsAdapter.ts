import {
  centralWorksheetNames,
  requiredWorksheetHeaders,
  worksheetHeaderAliases,
  type CentralAppDatabase,
  type CentralWorksheetName,
  type SourcingTemplateRecord,
  type StorageDiagnostic,
  type StorageStatus,
} from "./schema";
import {
  deleteSourcingTemplateRecord,
  getGoogleSheetsConnectionStatus,
  loadCreatorSourcingGoogleSheetsDatabase,
  loadGoogleSheetsDatabase,
  migrateLocalDatabaseToGoogleSheets,
  saveGoogleSheetsDatabase,
  saveSourcingTemplateRecord,
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
