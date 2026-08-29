import { createFileRoute } from "@tanstack/react-router";

import { renewGoogleCalendarWatches } from "@/services/calendar/googleCalendar.server";

export const Route = createFileRoute("/api/calendar/cron")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env.CRON_SECRET ?? "";
        if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
          return Response.json({ ok: false }, { status: 401 });
        try {
          return Response.json({ ok: true, ...(await renewGoogleCalendarWatches(request)) });
        } catch (error) {
          return Response.json(
            { ok: false, error: error instanceof Error ? error.message : "Renewal failed." },
            { status: 500 },
          );
        }
      },
    },
  },
});
