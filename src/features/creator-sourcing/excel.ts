import type { CreatorRow } from "./types";

export async function parseSpreadsheet(
  file: File,
): Promise<{ headers: string[]; rows: CreatorRow[]; sheetName: string }> {
  const XLSX = await loadSheetJs();
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[1] ?? workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("The workbook does not contain any sheets.");
  }

  const worksheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Array<string | number | boolean | Date | null>>(
    worksheet,
    {
      header: 1,
      defval: "",
      raw: false,
    },
  );

  const headerRow = rawRows.find((row) => row.some((cell) => String(cell ?? "").trim()));
  if (!headerRow) {
    throw new Error("The selected worksheet does not contain a readable header row.");
  }

  const headerIndex = rawRows.indexOf(headerRow);
  const headers = makeUniqueHeaders(
    headerRow.map((cell, index) => String(cell ?? "").trim() || `Column ${index + 1}`),
  );

  const rows = rawRows
    .slice(headerIndex + 1)
    .filter((row) => row.some((cell) => String(cell ?? "").trim()))
    .map((row) =>
      headers.reduce<CreatorRow>((record, header, index) => {
        record[header] = normalizeCell(row[index]);
        return record;
      }, {}),
    );

  return { headers, rows, sheetName };
}

export async function exportPreviewSpreadsheet({
  fileName,
  headers,
  rows,
}: {
  fileName: string;
  headers: string[];
  rows: string[][];
}) {
  const XLSX = await loadSheetJs();
  const records = rows.map((row) =>
    headers.reduce<CreatorRow>((record, header, index) => {
      record[header] = row[index] ?? "";
      return record;
    }, {}),
  );

  const worksheet = XLSX.utils.json_to_sheet(records, { header: headers });
  worksheet["!cols"] = headers.map((header) => ({
    wch: Math.min(Math.max(header.length + 4, 14), 34),
  }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Preview");
  XLSX.writeFile(workbook, fileName);
}

type WorkSheet = Record<string, unknown> & { "!cols"?: Array<{ wch: number }> };
type WorkBook = { SheetNames: string[]; Sheets: Record<string, WorkSheet> };
type SheetJsModule = {
  read: (buffer: ArrayBuffer, options: Record<string, unknown>) => WorkBook;
  writeFile: (workbook: WorkBook, fileName: string) => void;
  utils: {
    sheet_to_json: <T>(worksheet: WorkSheet, options: Record<string, unknown>) => T[];
    json_to_sheet: (rows: CreatorRow[], options: { header: string[] }) => WorkSheet;
    book_new: () => WorkBook;
    book_append_sheet: (workbook: WorkBook, worksheet: WorkSheet, sheetName: string) => void;
  };
};

declare global {
  interface Window {
    XLSX?: SheetJsModule;
  }
}

let sheetJsLoader: Promise<SheetJsModule> | undefined;

function loadSheetJs(): Promise<SheetJsModule> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Excel processing is only available in the browser."));
  }
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (sheetJsLoader) return sheetJsLoader;

  sheetJsLoader = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    script.async = true;
    script.onload = () => {
      if (window.XLSX) {
        resolve(window.XLSX);
        return;
      }
      reject(new Error("The Excel parser loaded, but did not initialize."));
    };
    script.onerror = () =>
      reject(
        new Error("Could not load the Excel parser. Check your internet connection and try again."),
      );
    document.head.appendChild(script);
  });

  return sheetJsLoader;
}

function makeUniqueHeaders(headers: string[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((header) => {
    const count = seen.get(header) ?? 0;
    seen.set(header, count + 1);
    return count === 0 ? header : `${header} ${count + 1}`;
  });
}

function normalizeCell(value: unknown): string | number | boolean {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (value == null) return "";
  return value as string | number | boolean;
}
