import { createFileRoute } from "@tanstack/react-router";

import {
  clearLegacyTokenCookie,
  clearStateCookie,
  connectGoogleCalendarAccount,
  exchangeGoogleAuthorizationCode,
  verifyGoogleOAuthState,
} from "@/services/calendar/googleCalendar.server";

export const Route = createFileRoute("/api/calendar/oauth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code") ?? "";
        const state = url.searchParams.get("state") ?? "";
        const destination = new URL("/calendar", request.url);
        if (url.searchParams.get("error")) {
          destination.searchParams.set("calendar", "denied");
          return redirectWithCleanup(request, destination);
        }
        if (!code || !verifyGoogleOAuthState(request, state)) {
          destination.searchParams.set("calendar", "invalid-state");
          return redirectWithCleanup(request, destination);
        }
        try {
          const token = await exchangeGoogleAuthorizationCode(request, code);
          await connectGoogleCalendarAccount(request, token);
          destination.searchParams.set("calendar", "connected");
        } catch {
          destination.searchParams.set("calendar", "failed");
        }
        return redirectWithCleanup(request, destination);
      },
    },
  },
});

function redirectWithCleanup(request: Request, destination: URL) {
  const headers = new Headers({ Location: destination.toString() });
  headers.append("Set-Cookie", clearStateCookie(request));
  headers.append("Set-Cookie", clearLegacyTokenCookie(request));
  return new Response(null, { status: 302, headers });
}
