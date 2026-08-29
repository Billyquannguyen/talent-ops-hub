import { createFileRoute } from "@tanstack/react-router";

import { handleGoogleCalendarWebhook } from "@/services/calendar/googleCalendar.server";

export const Route = createFileRoute("/api/calendar/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const result = await handleGoogleCalendarWebhook(request);
          return Response.json(
            { ok: result.accepted, detected: result.detected },
            { status: result.status },
          );
        } catch {
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});
