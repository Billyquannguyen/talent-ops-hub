import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { CentralAppDatabase, SourcingTemplateRecord } from "./schema";

export const getGoogleSheetsConnectionStatus = createServerFn({ method: "GET" }).handler(
  async () => {
    const { getGoogleSheetsServerStatus } = await import("./googleSheets.server");
    return getGoogleSheetsServerStatus();
  },
);

export const loadGoogleSheetsDatabase = createServerFn({ method: "POST" })
  .inputValidator(z.object({ reason: z.string().optional() }).optional())
  .handler(async ({ data }) => {
    const {
      diagnosticsFromError,
      getGoogleSheetsServerStatus,
      readCentralDatabaseFromGoogleSheets,
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
        database: await readCentralDatabaseFromGoogleSheets({
          reason: data?.reason ?? "loadGoogleSheetsDatabase",
        }),
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

export const loadCreatorSourcingGoogleSheetsDatabase = createServerFn({ method: "POST" })
  .inputValidator(z.object({ reason: z.string().optional() }).optional())
  .handler(async ({ data }) => {
    const {
      diagnosticsFromError,
      getGoogleSheetsServerStatus,
      readCreatorSourcingDatabaseFromGoogleSheets,
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
        database: await readCreatorSourcingDatabaseFromGoogleSheets({
          reason: data?.reason ?? "loadCreatorSourcingGoogleSheetsDatabase",
        }),
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

export const saveSourcingTemplateRecord = createServerFn({ method: "POST" })
  .inputValidator(z.object({ record: z.any() }))
  .handler(async ({ data }) => {
    const {
      diagnosticsFromError,
      getGoogleSheetsServerStatus,
      upsertSourcingTemplateInGoogleSheets,
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
        database: await upsertSourcingTemplateInGoogleSheets(data.record as SourcingTemplateRecord),
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

export const deleteSourcingTemplateRecord = createServerFn({ method: "POST" })
  .inputValidator(z.object({ templateId: z.string() }))
  .handler(async ({ data }) => {
    const {
      deleteSourcingTemplateInGoogleSheets,
      diagnosticsFromError,
      getGoogleSheetsServerStatus,
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
        database: await deleteSourcingTemplateInGoogleSheets(data.templateId),
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

export const cleanupSourcingTemplatesRecord = createServerFn({ method: "POST" }).handler(
  async () => {
    const {
      cleanupSourcingTemplatesInGoogleSheets,
      diagnosticsFromError,
      getGoogleSheetsServerStatus,
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

      const result = await cleanupSourcingTemplatesInGoogleSheets();
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
  },
);

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
