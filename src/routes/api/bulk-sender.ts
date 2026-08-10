import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  BulkSenderError,
  getBulkSenderConfiguration,
  isBulkSenderRequestAuthenticated,
  submitBulkSenderJob,
} from "@/features/bulk-sender/bulkSender.server";

const requestSchema = z.object({
  workspaceId: z.string().min(1).max(160),
  idempotencyKey: z.string().min(1).max(200),
  drafts: z
    .array(
      z.object({
        rowId: z.string().min(1).max(200),
        to: z.string().email(),
        subject: z.string().min(1).max(998),
        html: z.string().min(1).max(500_000),
        plainText: z.string().min(1).max(250_000),
      }),
    )
    .min(1)
    .max(50),
});

export const Route = createFileRoute("/api/bulk-sender")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isBulkSenderRequestAuthenticated(request)) {
          return Response.json({ ok: false, error: "Authentication required." }, { status: 401 });
        }
        return Response.json({ ok: true, ...getBulkSenderConfiguration() });
      },
      POST: async ({ request }) => {
        if (!isBulkSenderRequestAuthenticated(request)) {
          return Response.json({ ok: false, error: "Authentication required." }, { status: 401 });
        }
        try {
          const input = requestSchema.parse(await request.json());
          return Response.json({ ok: true, job: await submitBulkSenderJob(input) });
        } catch (error) {
          if (error instanceof z.ZodError) {
            return Response.json({ ok: false, error: "Invalid draft batch." }, { status: 400 });
          }
          const status = error instanceof BulkSenderError ? error.statusCode : 500;
          return Response.json(
            { ok: false, error: error instanceof Error ? error.message : "Draft batch failed." },
            { status },
          );
        }
      },
    },
  },
});
