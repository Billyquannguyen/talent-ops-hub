import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type {
  ActiveCampaignCreatorRecord,
  AppSettingRecord,
  CampaignMemoryCardRecord,
  CentralAppDatabase,
  OutreachTemplateRecord,
  PerformanceBenchmarkRecord,
  PerformanceWeeklyInputRecord,
  SourcingTemplateRecord,
} from "./schema";

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

export const listOutreachTemplateRecords = createServerFn({ method: "POST" }).handler(async () => {
  const { diagnosticsFromError, getGoogleSheetsServerStatus, listOutreachTemplatesInGoogleSheets } =
    await import("./googleSheets.server");

  try {
    const status = getGoogleSheetsServerStatus();
    if (!status.configured) {
      return {
        ok: false,
        records: [],
        report: null,
        status,
      };
    }

    const result = await listOutreachTemplatesInGoogleSheets();
    return {
      ok: true,
      records: result.records,
      report: result.report,
      status,
    };
  } catch (error) {
    return {
      ok: false,
      records: [],
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

export const createOutreachTemplateRecord = createServerFn({ method: "POST" })
  .inputValidator(z.object({ record: z.any() }))
  .handler(async ({ data }) => {
    const {
      diagnosticsFromError,
      getGoogleSheetsServerStatus,
      upsertOutreachTemplateInGoogleSheets,
    } = await import("./googleSheets.server");

    try {
      const status = getGoogleSheetsServerStatus();
      if (!status.configured) {
        return {
          ok: false,
          records: [],
          report: null,
          status,
        };
      }

      const result = await upsertOutreachTemplateInGoogleSheets(
        data.record as OutreachTemplateRecord,
      );
      return {
        ok: true,
        records: result.records,
        report: result.report,
        status,
      };
    } catch (error) {
      return {
        ok: false,
        records: [],
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

export const updateOutreachTemplateRecord = createServerFn({ method: "POST" })
  .inputValidator(z.object({ record: z.any() }))
  .handler(async ({ data }) => {
    const {
      diagnosticsFromError,
      getGoogleSheetsServerStatus,
      upsertOutreachTemplateInGoogleSheets,
    } = await import("./googleSheets.server");

    try {
      const status = getGoogleSheetsServerStatus();
      if (!status.configured) {
        return {
          ok: false,
          records: [],
          report: null,
          status,
        };
      }

      const result = await upsertOutreachTemplateInGoogleSheets(
        data.record as OutreachTemplateRecord,
      );
      return {
        ok: true,
        records: result.records,
        report: result.report,
        status,
      };
    } catch (error) {
      return {
        ok: false,
        records: [],
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

export const deleteOutreachTemplateRecord = createServerFn({ method: "POST" })
  .inputValidator(z.object({ templateId: z.string() }))
  .handler(async ({ data }) => {
    const {
      deleteOutreachTemplateInGoogleSheets,
      diagnosticsFromError,
      getGoogleSheetsServerStatus,
    } = await import("./googleSheets.server");

    try {
      const status = getGoogleSheetsServerStatus();
      if (!status.configured) {
        return {
          ok: false,
          records: [],
          report: null,
          status,
        };
      }

      const result = await deleteOutreachTemplateInGoogleSheets(data.templateId);
      return {
        ok: true,
        records: result.records,
        report: result.report,
        status,
      };
    } catch (error) {
      return {
        ok: false,
        records: [],
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

export const cleanupOutreachTemplatesRecord = createServerFn({ method: "POST" }).handler(
  async () => {
    const {
      cleanupOutreachTemplatesInGoogleSheets,
      diagnosticsFromError,
      getGoogleSheetsServerStatus,
    } = await import("./googleSheets.server");

    try {
      const status = getGoogleSheetsServerStatus();
      if (!status.configured) {
        return {
          ok: false,
          records: [],
          report: null,
          status,
        };
      }

      const result = await cleanupOutreachTemplatesInGoogleSheets();
      return {
        ok: true,
        records: result.records,
        report: result.report,
        status,
      };
    } catch (error) {
      return {
        ok: false,
        records: [],
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

export const listCampaignMemoryCardRecords = createServerFn({ method: "POST" }).handler(
  async () => {
    const {
      diagnosticsFromError,
      getGoogleSheetsServerStatus,
      listCampaignMemoryCardsInGoogleSheets,
    } = await import("./googleSheets.server");

    try {
      const status = getGoogleSheetsServerStatus();
      if (!status.configured) {
        return {
          ok: false,
          records: [],
          report: null,
          status,
        };
      }

      const result = await listCampaignMemoryCardsInGoogleSheets();
      return {
        ok: true,
        records: result.records,
        report: result.report,
        status,
      };
    } catch (error) {
      return {
        ok: false,
        records: [],
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

export const createCampaignMemoryCardRecord = createServerFn({ method: "POST" })
  .inputValidator(z.object({ record: z.any() }))
  .handler(async ({ data }) => {
    const {
      diagnosticsFromError,
      getGoogleSheetsServerStatus,
      upsertCampaignMemoryCardInGoogleSheets,
    } = await import("./googleSheets.server");

    try {
      const status = getGoogleSheetsServerStatus();
      if (!status.configured) {
        return {
          ok: false,
          records: [],
          report: null,
          status,
        };
      }

      const result = await upsertCampaignMemoryCardInGoogleSheets(
        data.record as CampaignMemoryCardRecord,
      );
      return {
        ok: true,
        records: result.records,
        report: result.report,
        status,
      };
    } catch (error) {
      return {
        ok: false,
        records: [],
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

export const updateCampaignMemoryCardRecord = createServerFn({ method: "POST" })
  .inputValidator(z.object({ record: z.any() }))
  .handler(async ({ data }) => {
    const {
      diagnosticsFromError,
      getGoogleSheetsServerStatus,
      upsertCampaignMemoryCardInGoogleSheets,
    } = await import("./googleSheets.server");

    try {
      const status = getGoogleSheetsServerStatus();
      if (!status.configured) {
        return {
          ok: false,
          records: [],
          report: null,
          status,
        };
      }

      const result = await upsertCampaignMemoryCardInGoogleSheets(
        data.record as CampaignMemoryCardRecord,
      );
      return {
        ok: true,
        records: result.records,
        report: result.report,
        status,
      };
    } catch (error) {
      return {
        ok: false,
        records: [],
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

export const deleteCampaignMemoryCardRecord = createServerFn({ method: "POST" })
  .inputValidator(z.object({ cardId: z.string() }))
  .handler(async ({ data }) => {
    const {
      deleteCampaignMemoryCardInGoogleSheets,
      diagnosticsFromError,
      getGoogleSheetsServerStatus,
    } = await import("./googleSheets.server");

    try {
      const status = getGoogleSheetsServerStatus();
      if (!status.configured) {
        return {
          ok: false,
          records: [],
          report: null,
          status,
        };
      }

      const result = await deleteCampaignMemoryCardInGoogleSheets(data.cardId);
      return {
        ok: true,
        records: result.records,
        report: result.report,
        status,
      };
    } catch (error) {
      return {
        ok: false,
        records: [],
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

export const replaceCampaignMemoryCardsForCampaignRecord = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      campaignId: z.string(),
      preferredLanguages: z.string(),
      records: z.array(z.any()),
    }),
  )
  .handler(async ({ data }) => {
    const {
      diagnosticsFromError,
      getGoogleSheetsServerStatus,
      replaceCampaignMemoryCardsForCampaignInGoogleSheets,
    } = await import("./googleSheets.server");

    try {
      const status = getGoogleSheetsServerStatus();
      if (!status.configured) {
        return {
          ok: false,
          records: [],
          campaignProfiles: [],
          report: null,
          status,
        };
      }

      const result = await replaceCampaignMemoryCardsForCampaignInGoogleSheets({
        campaignId: data.campaignId,
        preferredLanguages: data.preferredLanguages,
        records: data.records as CampaignMemoryCardRecord[],
      });
      return {
        ok: true,
        records: result.records,
        campaignProfiles: result.campaignProfiles,
        report: result.report,
        status,
      };
    } catch (error) {
      return {
        ok: false,
        records: [],
        campaignProfiles: [],
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

export const cleanupCampaignMemoryCardsRecord = createServerFn({ method: "POST" }).handler(
  async () => {
    const {
      cleanupCampaignMemoryCardsInGoogleSheets,
      diagnosticsFromError,
      getGoogleSheetsServerStatus,
    } = await import("./googleSheets.server");

    try {
      const status = getGoogleSheetsServerStatus();
      if (!status.configured) {
        return {
          ok: false,
          records: [],
          report: null,
          status,
        };
      }

      const result = await cleanupCampaignMemoryCardsInGoogleSheets();
      return {
        ok: true,
        records: result.records,
        report: result.report,
        status,
      };
    } catch (error) {
      return {
        ok: false,
        records: [],
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

export const listActiveCampaignCreatorRecords = createServerFn({ method: "POST" }).handler(
  async () => {
    const {
      diagnosticsFromError,
      getGoogleSheetsServerStatus,
      listActiveCampaignCreatorsInGoogleSheets,
    } = await import("./googleSheets.server");

    try {
      const status = getGoogleSheetsServerStatus();
      if (!status.configured) {
        return {
          ok: false,
          records: [],
          report: null,
          status,
        };
      }

      const result = await listActiveCampaignCreatorsInGoogleSheets();
      return {
        ok: true,
        records: result.records,
        report: result.report,
        status,
      };
    } catch (error) {
      return {
        ok: false,
        records: [],
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

export const createActiveCampaignCreatorRecord = createServerFn({ method: "POST" })
  .inputValidator(z.object({ record: z.any() }))
  .handler(async ({ data }) => {
    const {
      diagnosticsFromError,
      getGoogleSheetsServerStatus,
      upsertActiveCampaignCreatorInGoogleSheets,
    } = await import("./googleSheets.server");

    try {
      const status = getGoogleSheetsServerStatus();
      if (!status.configured) {
        return {
          ok: false,
          records: [],
          report: null,
          status,
        };
      }

      const result = await upsertActiveCampaignCreatorInGoogleSheets(
        data.record as ActiveCampaignCreatorRecord,
      );
      return {
        ok: true,
        records: result.records,
        report: result.report,
        status,
      };
    } catch (error) {
      return {
        ok: false,
        records: [],
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

export const updateActiveCampaignCreatorRecord = createServerFn({ method: "POST" })
  .inputValidator(z.object({ record: z.any() }))
  .handler(async ({ data }) => {
    const {
      diagnosticsFromError,
      getGoogleSheetsServerStatus,
      upsertActiveCampaignCreatorInGoogleSheets,
    } = await import("./googleSheets.server");

    try {
      const status = getGoogleSheetsServerStatus();
      if (!status.configured) {
        return {
          ok: false,
          records: [],
          report: null,
          status,
        };
      }

      const result = await upsertActiveCampaignCreatorInGoogleSheets(
        data.record as ActiveCampaignCreatorRecord,
      );
      return {
        ok: true,
        records: result.records,
        report: result.report,
        status,
      };
    } catch (error) {
      return {
        ok: false,
        records: [],
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

export const deleteActiveCampaignCreatorRecord = createServerFn({ method: "POST" })
  .inputValidator(z.object({ recordId: z.string() }))
  .handler(async ({ data }) => {
    const {
      deleteActiveCampaignCreatorInGoogleSheets,
      diagnosticsFromError,
      getGoogleSheetsServerStatus,
    } = await import("./googleSheets.server");

    try {
      const status = getGoogleSheetsServerStatus();
      if (!status.configured) {
        return {
          ok: false,
          records: [],
          report: null,
          status,
        };
      }

      const result = await deleteActiveCampaignCreatorInGoogleSheets(data.recordId);
      return {
        ok: true,
        records: result.records,
        report: result.report,
        status,
      };
    } catch (error) {
      return {
        ok: false,
        records: [],
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

export const listPerformanceBenchmarkRecords = createServerFn({ method: "POST" }).handler(
  async () => {
    const {
      diagnosticsFromError,
      getGoogleSheetsServerStatus,
      listPerformanceBenchmarksInGoogleSheets,
    } = await import("./googleSheets.server");

    try {
      const status = getGoogleSheetsServerStatus();
      if (!status.configured) {
        return {
          ok: false,
          records: [],
          status,
        };
      }

      const result = await listPerformanceBenchmarksInGoogleSheets();
      return {
        ok: true,
        records: result.records,
        status,
      };
    } catch (error) {
      return {
        ok: false,
        records: [],
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

export const savePerformanceBenchmarkRecord = createServerFn({ method: "POST" })
  .inputValidator(z.object({ record: z.any() }))
  .handler(async ({ data }) => {
    const {
      diagnosticsFromError,
      getGoogleSheetsServerStatus,
      upsertPerformanceBenchmarkInGoogleSheets,
    } = await import("./googleSheets.server");

    try {
      const status = getGoogleSheetsServerStatus();
      if (!status.configured) {
        return {
          ok: false,
          records: [],
          status,
        };
      }

      const result = await upsertPerformanceBenchmarkInGoogleSheets(
        data.record as PerformanceBenchmarkRecord,
      );
      return {
        ok: true,
        records: result.records,
        status,
      };
    } catch (error) {
      return {
        ok: false,
        records: [],
        status: {
          source: "googleSheets" as const,
          shared: true,
          configured: true,
          diagnostics: diagnosticsFromError(error),
        },
      };
    }
  });

export const listPerformanceWeeklyInputRecords = createServerFn({ method: "POST" }).handler(
  async () => {
    const {
      diagnosticsFromError,
      getGoogleSheetsServerStatus,
      listPerformanceWeeklyInputsInGoogleSheets,
    } = await import("./googleSheets.server");

    try {
      const status = getGoogleSheetsServerStatus();
      if (!status.configured) {
        return {
          ok: false,
          records: [],
          status,
        };
      }

      const result = await listPerformanceWeeklyInputsInGoogleSheets();
      return {
        ok: true,
        records: result.records,
        status,
      };
    } catch (error) {
      return {
        ok: false,
        records: [],
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

export const savePerformanceWeeklyInputRecord = createServerFn({ method: "POST" })
  .inputValidator(z.object({ record: z.any() }))
  .handler(async ({ data }) => {
    const {
      diagnosticsFromError,
      getGoogleSheetsServerStatus,
      upsertPerformanceWeeklyInputInGoogleSheets,
    } = await import("./googleSheets.server");

    try {
      const status = getGoogleSheetsServerStatus();
      if (!status.configured) {
        return {
          ok: false,
          records: [],
          status,
        };
      }

      const result = await upsertPerformanceWeeklyInputInGoogleSheets(
        data.record as PerformanceWeeklyInputRecord,
      );
      return {
        ok: true,
        records: result.records,
        status,
      };
    } catch (error) {
      return {
        ok: false,
        records: [],
        status: {
          source: "googleSheets" as const,
          shared: true,
          configured: true,
          diagnostics: diagnosticsFromError(error),
        },
      };
    }
  });

export const saveAppSettingRecord = createServerFn({ method: "POST" })
  .inputValidator(z.object({ record: z.any() }))
  .handler(async ({ data }) => {
    const { diagnosticsFromError, getGoogleSheetsServerStatus, upsertAppSettingInGoogleSheets } =
      await import("./googleSheets.server");

    try {
      const status = getGoogleSheetsServerStatus();
      if (!status.configured) {
        return {
          ok: false,
          records: [],
          status,
        };
      }

      const result = await upsertAppSettingInGoogleSheets(data.record as AppSettingRecord);
      return {
        ok: true,
        records: result.records,
        status,
      };
    } catch (error) {
      return {
        ok: false,
        records: [],
        status: {
          source: "googleSheets" as const,
          shared: true,
          configured: true,
          diagnostics: diagnosticsFromError(error),
        },
      };
    }
  });

export const cleanupSourcingActiveTemplateSettingsRecord = createServerFn({
  method: "POST",
}).handler(async () => {
  const {
    cleanupSourcingActiveTemplateSettingsInGoogleSheets,
    diagnosticsFromError,
    getGoogleSheetsServerStatus,
  } = await import("./googleSheets.server");

  try {
    const status = getGoogleSheetsServerStatus();
    if (!status.configured) {
      return {
        ok: false,
        records: [],
        changedCount: 0,
        status,
      };
    }

    const result = await cleanupSourcingActiveTemplateSettingsInGoogleSheets();
    return {
      ok: true,
      records: result.records,
      changedCount: result.changedCount,
      status,
    };
  } catch (error) {
    return {
      ok: false,
      records: [],
      changedCount: 0,
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
