import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  applyCalendarNotification,
  ignoreCalendarNotification,
  listCalendarNotifications,
  scanCalendarWorkspace,
} from "@/services/calendar/googleCalendar.server";

const targetSchema = z.object({ connectionId: z.string().min(1), calendarId: z.string().min(1) });
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("scan") }),
  z.object({ action: z.literal("ignore"), notificationId: z.string().min(1) }),
  z.object({
    action: z.literal("apply"),
    notificationId: z.string().min(1),
    targets: z.array(targetSchema).max(50),
    acceptSource: z.boolean(),
  }),
]);

export const Route = createFileRoute("/api/calendar/notifications")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          if (new URL(request.url).searchParams.get("scan") === "1")
            return Response.json({ ok: true, ...(await scanCalendarWorkspace(request)) });
          return Response.json({
            ok: true,
            notifications: await listCalendarNotifications(request),
          });
        } catch (error) {
          return calendarError(error);
        }
      },
      POST: async ({ request }) => {
        try {
          const input = actionSchema.parse(await request.json());
          if (input.action === "scan")
            return Response.json({ ok: true, ...(await scanCalendarWorkspace(request)) });
          if (input.action === "ignore") {
            await ignoreCalendarNotification(request, input.notificationId);
            return Response.json({ ok: true });
          }
          return Response.json({
            ok: true,
            results: await applyCalendarNotification(request, input),
          });
        } catch (error) {
          if (error instanceof z.ZodError)
            return Response.json({ ok: false, error: "Invalid calendar action." }, { status: 400 });
          return calendarError(error);
        }
      },
    },
  },
});

function calendarError(error: unknown) {
  return Response.json(
    { ok: false, error: error instanceof Error ? error.message : "Calendar action failed." },
    { status: 500 },
  );
}
