import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  clearTokenCookie,
  createGoogleCalendarBlockers,
  createTokenCookie,
  ensureFreshGoogleCalendarToken,
  getGoogleCalendarConfiguration,
  listGoogleCalendars,
  readGoogleCalendarToken,
  revokeGoogleCalendarToken,
} from "@/services/calendar/googleCalendar.server";

const blockerSchema = z.object({
  action: z.literal("create-blocker"),
  calendarIds: z.array(z.string().min(1)).min(1).max(20),
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
            connected: false,
            calendars: [],
            redirectUri: configuration.redirectUri,
          });
        }

        try {
          const session = await ensureFreshGoogleCalendarToken(request);
          if (!session.token) {
            return Response.json({
              ok: true,
              configured: true,
              connected: false,
              calendars: [],
              redirectUri: configuration.redirectUri,
            });
          }
          const calendars = await listGoogleCalendars(session.token.accessToken);
          const headers = session.refreshed
            ? { "Set-Cookie": createTokenCookie(request, session.token) }
            : undefined;
          return Response.json(
            {
              ok: true,
              configured: true,
              connected: true,
              account: calendars.find((calendar) => calendar.primary)?.account ?? "",
              calendars,
              redirectUri: configuration.redirectUri,
            },
            { headers },
          );
        } catch (error) {
          return Response.json(
            {
              ok: false,
              configured: true,
              connected: false,
              calendars: [],
              redirectUri: configuration.redirectUri,
              error: error instanceof Error ? error.message : "Calendar connection failed.",
            },
            { status: 401, headers: { "Set-Cookie": clearTokenCookie(request) } },
          );
        }
      },
      POST: async ({ request }) => {
        try {
          const input = blockerSchema.parse(await request.json());
          const session = await ensureFreshGoogleCalendarToken(request);
          if (!session.token) {
            return Response.json(
              { ok: false, error: "Connect Google Calendar first." },
              { status: 401 },
            );
          }
          const results = await createGoogleCalendarBlockers(session.token.accessToken, input);
          const headers = session.refreshed
            ? { "Set-Cookie": createTokenCookie(request, session.token) }
            : undefined;
          return Response.json({ ok: true, results }, { headers });
        } catch (error) {
          if (error instanceof z.ZodError) {
            return Response.json({ ok: false, error: "Invalid blocker details." }, { status: 400 });
          }
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
        await revokeGoogleCalendarToken(readGoogleCalendarToken(request));
        return Response.json(
          { ok: true },
          { headers: { "Set-Cookie": clearTokenCookie(request) } },
        );
      },
    },
  },
});
