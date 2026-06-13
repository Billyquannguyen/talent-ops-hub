import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { CentralAppDatabase } from "./schema";

export const getGoogleSheetsConnectionStatus = createServerFn({ method: "GET" }).handler(
  async () => {
    const { getGoogleSheetsServerStatus } = await import("./googleSheets.server");
    return getGoogleSheetsServerStatus();
  },
);

export const loadGoogleSheetsDatabase = createServerFn({ method: "POST" }).handler(async () => {
  const { diagnosticsFromError, getGoogleSheetsServerStatus, readCentralDatabaseFromGoogleSheets } =
    await import("./googleSheets.server");

  try {
    const status = getGoogleSheetsServerStatus();
    if (!status.configured) {
      return {
        ok: false,
        database: null,
        status,
      };
    }

    return {
      ok: true,
      database: await readCentralDatabaseFromGoogleSheets(),
      status,
    };
  } catch (error) {
    return {
      ok: false,
      database: null,
      status: {
        source: "googleSheets" as const,
        shared: true,
        configured: true,
        diagnostics: diagnosticsFromError(error),
      },
    };
  }
});

export const saveGoogleSheetsDatabase = createServerFn({ method: "POST" })
  .inputValidator(z.object({ database: z.any() }))
  .handler(async ({ data }) => {
    const {
      diagnosticsFromError,
      getGoogleSheetsServerStatus,
      writeCentralDatabaseToGoogleSheets,
    } = await import("./googleSheets.server");

    try {
      const status = getGoogleSheetsServerStatus();
      if (!status.configured) {
        return {
          ok: false,
          database: null,
          status,
        };
      }

      return {
        ok: true,
        database: await writeCentralDatabaseToGoogleSheets(data.database as CentralAppDatabase),
        status,
      };
    } catch (error) {
      return {
        ok: false,
        database: null,
        status: {
          source: "googleSheets" as const,
          shared: true,
          configured: true,
          diagnostics: diagnosticsFromError(error),
        },
      };
    }
  });

export const migrateLocalDatabaseToGoogleSheets = createServerFn({ method: "POST" })
  .inputValidator(z.object({ database: z.any() }))
  .handler(async ({ data }) => {
    const {
      diagnosticsFromError,
      getGoogleSheetsServerStatus,
      mergeCentralDatabaseIntoGoogleSheets,
    } = await import("./googleSheets.server");

    try {
      const status = getGoogleSheetsServerStatus();
      if (!status.configured) {
        return {
          ok: false,
          database: null,
          report: null,
          status,
        };
      }

      const result = await mergeCentralDatabaseIntoGoogleSheets(
        data.database as CentralAppDatabase,
      );
      return {
        ok: true,
        database: result.database,
        report: result.report,
        status,
      };
    } catch (error) {
      return {
        ok: false,
        database: null,
        report: null,
        status: {
          source: "googleSheets" as const,
          shared: true,
          configured: true,
          diagnostics: diagnosticsFromError(error),
        },
      };
    }
  });
