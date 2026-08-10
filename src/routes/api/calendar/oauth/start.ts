import { createFileRoute } from "@tanstack/react-router";

import { createGoogleAuthorization } from "@/services/calendar/googleCalendar.server";

export const Route = createFileRoute("/api/calendar/oauth/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const authorization = createGoogleAuthorization(request);
          return new Response(null, {
            status: 302,
            headers: {
              Location: authorization.authorizationUrl,
              "Set-Cookie": authorization.stateCookie,
            },
          });
        } catch {
          return Response.redirect(new URL("/calendar?calendar=not-configured", request.url), 302);
        }
      },
    },
  },
});
