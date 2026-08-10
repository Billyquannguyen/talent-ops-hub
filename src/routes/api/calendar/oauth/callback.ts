import { createFileRoute } from "@tanstack/react-router";

import {
  clearStateCookie,
  createTokenCookie,
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
        const denied = url.searchParams.get("error");
        const destination = new URL("/calendar", request.url);

        if (denied) {
          destination.searchParams.set("calendar", "denied");
          return redirectWithStateCleanup(request, destination);
        }
        if (!code || !verifyGoogleOAuthState(request, state)) {
          destination.searchParams.set("calendar", "invalid-state");
          return redirectWithStateCleanup(request, destination);
        }

        try {
          const token = await exchangeGoogleAuthorizationCode(request, code);
          destination.searchParams.set("calendar", "connected");
          const headers = new Headers({ Location: destination.toString() });
          headers.append("Set-Cookie", createTokenCookie(request, token));
          headers.append("Set-Cookie", clearStateCookie(request));
          return new Response(null, { status: 302, headers });
        } catch {
          destination.searchParams.set("calendar", "failed");
          return redirectWithStateCleanup(request, destination);
        }
      },
    },
  },
});

function redirectWithStateCleanup(request: Request, destination: URL) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: destination.toString(),
      "Set-Cookie": clearStateCookie(request),
    },
  });
}
