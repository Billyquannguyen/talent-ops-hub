import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  clearLegacyTokenCookie,
  createWorkspaceBlockers,
  disconnectGoogleCalendarAccount,
  getGoogleCalendarConfiguration,
  listCalendarWorkspace,
} from "@/services/calendar/googleCalendar.server";

const targetSchema = z.object({ connectionId: z.string().min(1), calendarId: z.string().min(1) });
const blockerSchema = z.object({
  action: z.literal("create-blocker"),
  targets: z.array(targetSchema).min(1).max(50),
  title: z.string().trim().min(1).max(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  allDay: z.boolean(),
  timeZone: z.string().min(1).max(100),
});

export const Route = createFileRoute("/api/calendar/connection")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const configuration = getGoogleCalendarConfiguration(request);
        if (!configuration.configured) {
          return Response.json({
            ok: true,
            configured: false,
            connections: [],
            calendars: [],
            redirectUri: configuration.redirectUri,
          });
        }
        try {
          return Response.json({
            ok: true,
            configured: true,
            ...(await listCalendarWorkspace(request)),
            redirectUri: configuration.redirectUri,
          });
        } catch (error) {
          return Response.json(
            {
              ok: false,
              configured: true,
              connections: [],
              calendars: [],
              redirectUri: configuration.redirectUri,
              error: error instanceof Error ? error.message : "Calendar connection failed.",
            },
            { status: 502 },
          );
        }
      },
      POST: async ({ request }) => {
        try {
          const input = blockerSchema.parse(await request.json());
          return Response.json({
            ok: true,
            results: await createWorkspaceBlockers(request, input),
          });
        } catch (error) {
          if (error instanceof z.ZodError)
            return Response.json({ ok: false, error: "Invalid blocker details." }, { status: 400 });
          return Response.json(
            {
              ok: false,
              error: error instanceof Error ? error.message : "Blocker creation failed.",
            },
            { status: 500 },
          );
        }
      },
      DELETE: async ({ request }) => {
        const connectionId = new URL(request.url).searchParams.get("connectionId") ?? "";
        if (!connectionId)
          return Response.json(
            { ok: false, error: "Choose an account to disconnect." },
            { status: 400 },
          );
        await disconnectGoogleCalendarAccount(request, connectionId);
        return Response.json(
          { ok: true },
          { headers: { "Set-Cookie": clearLegacyTokenCookie(request) } },
        );
      },
    },
  },
});
