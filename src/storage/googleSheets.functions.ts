import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type {
  ActiveCampaignCreatorRecord,
  AgencyDatabaseRecord,
  AppSettingRecord,
  CampaignMemoryCardRecord,
  CampaignPromptVaultRecord,
  CampaignProfileRecord,
  CentralAppDatabase,
  EmployeeProfileRecord,
  OutreachTemplateRecord,
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

export const loadCreatorOutreachBundle = createServerFn({ method: "POST" }).handler(async () => {
  const {
    diagnosticsFromError,
    getGoogleSheetsServerStatus,
    readCreatorOutreachBundleFromGoogleSheets,
  } = await import("./googleSheets.server");

  try {
    const status = getGoogleSheetsServerStatus();
    if (!status.configured) {
      return {
        ok: false,
        campaignProfiles: [] as CampaignProfileRecord[],
        outreachTemplates: [] as OutreachTemplateRecord[],
        campaignMemoryCards: [] as CampaignMemoryCardRecord[],
        status,
      };
    }

    const bundle = await readCreatorOutreachBundleFromGoogleSheets();
    return {
      ok: true,
      ...bundle,
      status,
    };
  } catch (error) {
    return {
      ok: false,
      campaignProfiles: [] as CampaignProfileRecord[],
      outreachTemplates: [] as OutreachTemplateRecord[],
      campaignMemoryCards: [] as CampaignMemoryCardRecord[],
      status: {
        source: "googleSheets" as const,
        shared: true,
        configured: true,
        diagnostics: diagnosticsFromError(error),
      },
    };
  }
});

export const loadActiveCampaignsBundle = createServerFn({ method: "POST" }).handler(async () => {
  const {
    diagnosticsFromError,
    getGoogleSheetsServerStatus,
    readActiveCampaignsBundleFromGoogleSheets,
  } = await import("./googleSheets.server");

  try {
    const status = getGoogleSheetsServerStatus();
    if (!status.configured) {
      return {
        ok: false,
        campaignProfiles: [] as CampaignProfileRecord[],
        activeCampaignCreators: [] as ActiveCampaignCreatorRecord[],
        status,
      };
    }

    const bundle = await readActiveCampaignsBundleFromGoogleSheets();
    return {
      ok: true,
      ...bundle,
      status,
    };
  } catch (error) {
    return {
      ok: false,
      campaignProfiles: [] as CampaignProfileRecord[],
      activeCampaignCreators: [] as ActiveCampaignCreatorRecord[],
      status: {
        source: "googleSheets" as const,
        shared: true,
        configured: true,
        diagnostics: diagnosticsFromError(error),
      },
    };
  }
});

export const loadPromptVaultBundle = createServerFn({ method: "POST" }).handler(async () => {
  const {
    diagnosticsFromError,
    getGoogleSheetsServerStatus,
    readPromptVaultBundleFromGoogleSheets,
  } = await import("./googleSheets.server");

  try {
    const status = getGoogleSheetsServerStatus();
    if (!status.configured) {
      return {
        ok: false,
        campaignProfiles: [] as CampaignProfileRecord[],
        campaignPromptVault: [] as CampaignPromptVaultRecord[],
        appSettings: [] as AppSettingRecord[],
        status,
      };
    }

    const bundle = await readPromptVaultBundleFromGoogleSheets();
    return {
      ok: true,
      ...bundle,
      status,
    };
  } catch (error) {
    return {
      ok: false,
      campaignProfiles: [] as CampaignProfileRecord[],
      campaignPromptVault: [] as CampaignPromptVaultRecord[],
      appSettings: [] as AppSettingRecord[],
      status: {
        source: "googleSheets" as const,
        shared: true,
        configured: true,
        diagnostics: diagnosticsFromError(error),
      },
    };
  }
});

export const listCampaignProfileRecords = createServerFn({ method: "POST" }).handler(async () => {
  const { diagnosticsFromError, getGoogleSheetsServerStatus, listCampaignProfilesInGoogleSheets } =
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

    const result = await listCampaignProfilesInGoogleSheets();
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

export const migrateAgencyDatabaseContactsRecord = createServerFn({ method: "POST" }).handler(
  async () => {
    const {
      diagnosticsFromError,
      getGoogleSheetsServerStatus,
      migrateAgencyDatabaseContactsInGoogleSheets,
    } = await import("./googleSheets.server");

    try {
      const status = getGoogleSheetsServerStatus();
      if (!status.configured) {
        return {
          ok: false,
          records: [] as AgencyDatabaseRecord[],
          report: null,
          status,
        };
      }

      const result = await migrateAgencyDatabaseContactsInGoogleSheets();
      return {
        ok: true,
        records: result.records,
        report: result.report,
        status,
      };
    } catch (error) {
      return {
        ok: false,
        records: [] as AgencyDatabaseRecord[],
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

export const listAgencyDatabaseRecords = createServerFn({ method: "POST" }).handler(async () => {
  const { diagnosticsFromError, getGoogleSheetsServerStatus, listAgencyDatabaseInGoogleSheets } =
    await import("./googleSheets.server");

  try {
    const status = getGoogleSheetsServerStatus();
    if (!status.configured) {
      return {
        ok: false,
        records: [] as AgencyDatabaseRecord[],
        status,
      };
    }

    const result = await listAgencyDatabaseInGoogleSheets();
    return {
      ok: true,
      records: result.records,
      status,
    };
  } catch (error) {
    return {
      ok: false,
      records: [] as AgencyDatabaseRecord[],
      status: {
        source: "googleSheets" as const,
        shared: true,
        configured: true,
        diagnostics: diagnosticsFromError(error),
      },
    };
  }
});

export const saveAgencyDatabaseRecord = createServerFn({ method: "POST" })
  .inputValidator(z.object({ record: z.any() }))
  .handler(async ({ data }) => {
    const {
      diagnosticsFromError,
      getGoogleSheetsServerStatus,
      upsertAgencyDatabaseInGoogleSheets,
    } = await import("./googleSheets.server");

    try {
      const status = getGoogleSheetsServerStatus();
      if (!status.configured) {
        return {
          ok: false,
          records: [] as AgencyDatabaseRecord[],
          status,
        };
      }

      const result = await upsertAgencyDatabaseInGoogleSheets(data.record as AgencyDatabaseRecord);
      return {
        ok: true,
        records: result.records,
        status,
      };
    } catch (error) {
      return {
        ok: false,
        records: [] as AgencyDatabaseRecord[],
        status: {
          source: "googleSheets" as const,
          shared: true,
          configured: true,
          diagnostics: diagnosticsFromError(error),
        },
      };
    }
  });

export const deleteAgencyDatabaseRecord = createServerFn({ method: "POST" })
  .inputValidator(z.object({ recordId: z.string() }))
  .handler(async ({ data }) => {
    const {
      deleteAgencyDatabaseInGoogleSheets,
      diagnosticsFromError,
      getGoogleSheetsServerStatus,
    } = await import("./googleSheets.server");

    try {
      const status = getGoogleSheetsServerStatus();
      if (!status.configured) {
        return {
          ok: false,
          records: [] as AgencyDatabaseRecord[],
          status,
        };
      }

      const result = await deleteAgencyDatabaseInGoogleSheets(data.recordId);
      return {
        ok: true,
        records: result.records,
        status,
      };
    } catch (error) {
      return {
        ok: false,
        records: [] as AgencyDatabaseRecord[],
        status: {
          source: "googleSheets" as const,
          shared: true,
          configured: true,
          diagnostics: diagnosticsFromError(error),
        },
      };
    }
  });

export const listCreatorDatabaseRecords = createServerFn({ method: "POST" }).handler(async () => {
  const { diagnosticsFromError, getGoogleSheetsServerStatus, listCreatorDatabaseInGoogleSheets } =
    await import("./googleSheets.server");

  try {
    const status = getGoogleSheetsServerStatus();
    if (!status.configured) {
      return {
        ok: false,
        records: [] as CreatorDatabaseRecord[],
        status,
      };
    }

    const result = await listCreatorDatabaseInGoogleSheets();
    return {
      ok: true,
      records: result.records,
      status,
    };
  } catch (error) {
    return {
      ok: false,
      records: [] as CreatorDatabaseRecord[],
      status: {
        source: "googleSheets" as const,
        shared: true,
        configured: true,
        diagnostics: diagnosticsFromError(error),
      },
    };
  }
});

export const saveCreatorDatabaseRecord = createServerFn({ method: "POST" })
  .inputValidator(z.object({ record: z.any() }))
  .handler(async ({ data }) => {
    const {
      diagnosticsFromError,
      getGoogleSheetsServerStatus,
      upsertCreatorDatabaseInGoogleSheets,
    } = await import("./googleSheets.server");

    try {
      const status = getGoogleSheetsServerStatus();
      if (!status.configured) {
        return {
          ok: false,
          records: [] as CreatorDatabaseRecord[],
          status,
        };
      }

      const result = await upsertCreatorDatabaseInGoogleSheets(
        data.record as CreatorDatabaseRecord,
      );
      return {
        ok: true,
        records: result.records,
        status,
      };
    } catch (error) {
      return {
        ok: false,
        records: [] as CreatorDatabaseRecord[],
        status: {
          source: "googleSheets" as const,
          shared: true,
          configured: true,
          diagnostics: diagnosticsFromError(error),
        },
      };
    }
  });

export const deleteCreatorDatabaseRecord = createServerFn({ method: "POST" })
  .inputValidator(z.object({ recordId: z.string() }))
  .handler(async ({ data }) => {
    const {
      deleteCreatorDatabaseInGoogleSheets,
      diagnosticsFromError,
      getGoogleSheetsServerStatus,
    } = await import("./googleSheets.server");

    try {
      const status = getGoogleSheetsServerStatus();
      if (!status.configured) {
        return {
          ok: false,
          records: [] as CreatorDatabaseRecord[],
          status,
        };
      }

      const result = await deleteCreatorDatabaseInGoogleSheets(data.recordId);
      return {
        ok: true,
        records: result.records,
        status,
      };
    } catch (error) {
      return {
        ok: false,
        records: [] as CreatorDatabaseRecord[],
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

export const listAppSettingRecords = createServerFn({ method: "POST" }).handler(async () => {
  const { diagnosticsFromError, getGoogleSheetsServerStatus, listAppSettingsInGoogleSheets } =
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

    const result = await listAppSettingsInGoogleSheets();
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

export const listEmployeeProfileRecords = createServerFn({ method: "POST" }).handler(async () => {
  const { diagnosticsFromError, getGoogleSheetsServerStatus, listEmployeeProfilesInGoogleSheets } =
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

    const result = await listEmployeeProfilesInGoogleSheets();
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

export const listCampaignPromptVaultRecords = createServerFn({ method: "POST" }).handler(
  async () => {
    const {
      diagnosticsFromError,
      getGoogleSheetsServerStatus,
      listCampaignPromptVaultInGoogleSheets,
    } = await import("./googleSheets.server");

    try {
      const status = getGoogleSheetsServerStatus();
      if (!status.configured) {
        return {
          ok: false,
          records: [] as CampaignPromptVaultRecord[],
          status,
        };
      }

      const result = await listCampaignPromptVaultInGoogleSheets();
      return {
        ok: true,
        records: result.records,
        status,
      };
    } catch (error) {
      return {
        ok: false,
        records: [] as CampaignPromptVaultRecord[],
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

export const saveCampaignPromptVaultRecord = createServerFn({ method: "POST" })
  .inputValidator(z.object({ record: z.any() }))
  .handler(async ({ data }) => {
    const {
      diagnosticsFromError,
      getGoogleSheetsServerStatus,
      upsertCampaignPromptVaultInGoogleSheets,
    } = await import("./googleSheets.server");

    try {
      const status = getGoogleSheetsServerStatus();
      if (!status.configured) {
        return {
          ok: false,
          records: [] as CampaignPromptVaultRecord[],
          status,
        };
      }

      const result = await upsertCampaignPromptVaultInGoogleSheets(
        data.record as CampaignPromptVaultRecord,
      );
      return {
        ok: true,
        records: result.records,
        status,
      };
    } catch (error) {
      return {
        ok: false,
        records: [] as CampaignPromptVaultRecord[],
        status: {
          source: "googleSheets" as const,
          shared: true,
          configured: true,
          diagnostics: diagnosticsFromError(error),
        },
      };
    }
  });

export const deleteCampaignPromptVaultRecord = createServerFn({ method: "POST" })
  .inputValidator(z.object({ promptId: z.string() }))
  .handler(async ({ data }) => {
    const {
      deleteCampaignPromptVaultInGoogleSheets,
      diagnosticsFromError,
      getGoogleSheetsServerStatus,
    } = await import("./googleSheets.server");

    try {
      const status = getGoogleSheetsServerStatus();
      if (!status.configured) {
        return {
          ok: false,
          records: [] as CampaignPromptVaultRecord[],
          status,
        };
      }

      const result = await deleteCampaignPromptVaultInGoogleSheets(data.promptId);
      return {
        ok: true,
        records: result.records,
        status,
      };
    } catch (error) {
      return {
        ok: false,
        records: [] as CampaignPromptVaultRecord[],
        status: {
          source: "googleSheets" as const,
          shared: true,
          configured: true,
          diagnostics: diagnosticsFromError(error),
        },
      };
    }
  });

export const saveEmployeeProfileRecord = createServerFn({ method: "POST" })
  .inputValidator(z.object({ record: z.any() }))
  .handler(async ({ data }) => {
    const {
      diagnosticsFromError,
      getGoogleSheetsServerStatus,
      upsertEmployeeProfileInGoogleSheets,
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

      const result = await upsertEmployeeProfileInGoogleSheets(
        data.record as EmployeeProfileRecord,
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
