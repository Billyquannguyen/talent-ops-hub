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
  type CampaignProfileRecord,
  type CentralAppDatabase,
  type CentralWorksheetName,
  type CreatorDatabaseRecord,
  type OutreachTemplateRecord,
  type PerformanceBenchmarkRecord,
  type PerformanceWeeklyInputRecord,
  type SourcingTemplateRecord,
  type StorageDiagnostic,
} from "./schema";

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
  PerformanceBenchmarks: "benchmarkId",
  PerformanceWeeklyInputs: "inputId",
  AgencyDatabase: "id",
  CreatorDatabase: "id",
  AppSettings: "settingKey",
};

let tokenCache: { accessToken: string; expiresAt: number } | null = null;

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

export async function readCentralDatabaseFromGoogleSheets() {
  const config = assertConfigured();
  const spreadsheetId = await resolveSpreadsheetId(config);
  await ensureDatabaseShape(spreadsheetId);

  const rowsBySheet = Object.fromEntries(
    await Promise.all(
      centralWorksheetNames.map(async (worksheetName) => [
        worksheetName,
        await readWorksheetRows(spreadsheetId, worksheetName),
      ]),
    ),
  ) as Record<CentralWorksheetName, SheetRows>;

  return rowsToDatabase(rowsBySheet);
}

export async function writeCentralDatabaseToGoogleSheets(database: CentralAppDatabase) {
  const config = assertConfigured();
  const spreadsheetId = await resolveSpreadsheetId(config);
  await ensureDatabaseShape(spreadsheetId);

  for (const worksheetName of centralWorksheetNames) {
    await replaceWorksheetRows(
      spreadsheetId,
      worksheetName,
      getRowsForWorksheet(database, worksheetName),
    );
  }

  return readCentralDatabaseFromGoogleSheets();
}

export async function mergeCentralDatabaseIntoGoogleSheets(localDatabase: CentralAppDatabase) {
  const remoteDatabase = await readCentralDatabaseFromGoogleSheets();
  const report = {
    CampaignProfiles: 0,
    SourcingTemplates: 0,
    OutreachTemplates: 0,
    CampaignMemoryCards: 0,
    ActiveCampaignCreators: 0,
    PerformanceBenchmarks: 0,
    PerformanceWeeklyInputs: 0,
    AgencyDatabase: 0,
    CreatorDatabase: 0,
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
  let metadata = await getMetadata(spreadsheetId);
  const existingSheets = new Map(
    (metadata.sheets ?? []).map((sheet) => [sheet.properties.title, sheet.properties.sheetId]),
  );
  const requests = centralWorksheetNames
    .filter((worksheetName) => !existingSheets.has(worksheetName))
    .map((worksheetName) => ({
      addSheet: {
        properties: {
          title: worksheetName,
          gridProperties: { frozenRowCount: 1 },
        },
      },
    }));

  if (requests.length > 0) {
    await batchUpdate(spreadsheetId, requests);
    metadata = await getMetadata(spreadsheetId);
  }

  const freezeRequests = (metadata.sheets ?? [])
    .filter((sheet) =>
      centralWorksheetNames.includes(sheet.properties.title as CentralWorksheetName),
    )
    .map((sheet) => ({
      updateSheetProperties: {
        properties: {
          sheetId: sheet.properties.sheetId,
          gridProperties: { frozenRowCount: 1 },
        },
        fields: "gridProperties.frozenRowCount",
      },
    }));
  if (freezeRequests.length > 0) await batchUpdate(spreadsheetId, freezeRequests);

  for (const worksheetName of centralWorksheetNames) {
    await ensureHeaders(spreadsheetId, worksheetName);
  }
}

async function ensureHeaders(spreadsheetId: string, worksheetName: CentralWorksheetName) {
  const requiredHeaders = requiredWorksheetHeaders[worksheetName];
  const currentHeaderRow = await readValues(spreadsheetId, `${quoteSheetName(worksheetName)}!1:1`);
  const existingHeaders = (currentHeaderRow[0] ?? []).map(stringValue).filter(Boolean);
  const headerMap = buildHeaderMap(existingHeaders, requiredHeaders);
  const missingHeaders = requiredHeaders.filter((header) => headerMap[header] === undefined);
  const nextHeaders =
    existingHeaders.length > 0 ? [...existingHeaders, ...missingHeaders] : requiredHeaders;

  await updateValues(
    spreadsheetId,
    `${quoteSheetName(worksheetName)}!A1:${columnName(nextHeaders.length)}1`,
    [nextHeaders],
  );
}

async function readWorksheetRows(spreadsheetId: string, worksheetName: CentralWorksheetName) {
  const values = await readValues(spreadsheetId, `${quoteSheetName(worksheetName)}!A1:Z1000`);
  const headers = (values[0] ?? []).map(stringValue);
  const headerMap = buildHeaderMap(headers, requiredWorksheetHeaders[worksheetName]);
  const missingHeaders = requiredWorksheetHeaders[worksheetName].filter(
    (header) => headerMap[header] === undefined,
  );
  if (missingHeaders.length > 0) {
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

async function getMetadata(spreadsheetId: string): Promise<SpreadsheetMetadata> {
  const params = new URLSearchParams({
    fields:
      "spreadsheetId,spreadsheetUrl,properties(title),sheets(properties(sheetId,title,index,gridProperties(rowCount,columnCount)))",
  });
  return googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?${params}`);
}

async function readValues(spreadsheetId: string, range: string): Promise<unknown[][]> {
  const encodedRange = encodeURIComponent(range);
  const result = (await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}?valueRenderOption=UNFORMATTED_VALUE`,
  )) as { values?: unknown[][] };
  return result.values ?? [];
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
}

async function batchUpdate(spreadsheetId: string, requests: Array<Record<string, unknown>>) {
  if (requests.length === 0) return;
  await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests }),
  });
}

async function googleFetch(url: string, init: RequestInit = {}) {
  const accessToken = await getAccessToken();
  const response = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google Sheets request failed (${response.status}): ${body}`);
  }
  if (response.status === 204) return {};
  return response.json();
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
        createdAt: stringValue(row.createdAt),
        updatedAt: stringValue(row.updatedAt),
        createdBy: stringValue(row.createdBy),
        updatedBy: stringValue(row.updatedBy),
      })),
      OutreachTemplates: rowsBySheet.OutreachTemplates.map((row) => ({
        templateId: stringValue(row.templateId),
        templateName: stringValue(row.templateName),
        type: stringValue(row.type) === "Email" ? "Email" : "DM",
        body: stringValue(row.body),
        createdAt: stringValue(row.createdAt),
        updatedAt: stringValue(row.updatedAt),
      })),
      CampaignMemoryCards: rowsBySheet.CampaignMemoryCards.map((row) => ({
        cardId: stringValue(row.cardId),
        campaignId: stringValue(row.campaignId),
        title: stringValue(row.title),
        content: stringValue(row.content),
        preferredLanguages: stringValue(row.preferredLanguages),
        createdAt: stringValue(row.createdAt),
        updatedAt: stringValue(row.updatedAt),
      })),
      ActiveCampaignCreators: rowsBySheet.ActiveCampaignCreators.map((row) => ({
        recordId: stringValue(row.recordId),
        campaignId: stringValue(row.campaignId),
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
      PerformanceBenchmarks: rowsBySheet.PerformanceBenchmarks.map((row) => ({
        benchmarkId: stringValue(row.benchmarkId),
        campaignId: stringValue(row.campaignId),
        targetDailyOutreach: numberValue(row.targetDailyOutreach),
        teamOutreachExcludingMe: numberValue(row.teamOutreachExcludingMe),
        teamSubmissionsExcludingMe: numberValue(row.teamSubmissionsExcludingMe),
        teamApprovalsExcludingMe: numberValue(row.teamApprovalsExcludingMe),
        createdAt: stringValue(row.createdAt),
        updatedAt: stringValue(row.updatedAt),
      })),
      PerformanceWeeklyInputs: rowsBySheet.PerformanceWeeklyInputs.map((row) => ({
        inputId: stringValue(row.inputId),
        weekStart: stringValue(row.weekStart),
        campaignId: stringValue(row.campaignId),
        myOutreachVolume: numberValue(row.myOutreachVolume),
        myCreatorSubmissions: numberValue(row.myCreatorSubmissions),
        myCreatorApprovals: numberValue(row.myCreatorApprovals),
        myCampaignExecutions: numberValue(row.myCampaignExecutions),
        expectedProfit: numberValue(row.expectedProfit),
        actualProfit: numberValue(row.actualProfit),
        createdAt: stringValue(row.createdAt),
        updatedAt: stringValue(row.updatedAt),
      })),
      AgencyDatabase: rowsBySheet.AgencyDatabase.map((row) => ({
        id: stringValue(row.id),
        agencyName: stringValue(row.agencyName),
        contactName: stringValue(row.contactName),
        contactRole: stringValue(row.contactRole),
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
  worksheetName: "PerformanceBenchmarks",
): PerformanceBenchmarkRecord[];
function getRowsForWorksheet(
  database: CentralAppDatabase,
  worksheetName: "PerformanceWeeklyInputs",
): PerformanceWeeklyInputRecord[];
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

export function diagnosticsFromError(error: unknown): StorageDiagnostic[] {
  return [
    {
      level: "error",
      message: error instanceof Error ? error.message : "Google Sheets request failed.",
    },
  ];
}
