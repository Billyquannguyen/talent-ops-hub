import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export type GoogleCalendarToken = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string;
};

export type GoogleCalendarListItem = {
  id: string;
  name: string;
  account: string;
  primary: boolean;
  writable: boolean;
  backgroundColor: string;
  timeZone: string;
};

type OAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  tokenSecret: string;
};

const tokenCookieName = "katlas_google_calendar_token";
const stateCookieName = "katlas_google_calendar_state";
const calendarScopes = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
];

export function getGoogleCalendarConfiguration(request: Request) {
  const config = readOAuthConfig(request);
  return {
    configured: Boolean(
      config.clientId && config.clientSecret && config.redirectUri && config.tokenSecret,
    ),
    redirectUri: config.redirectUri,
  };
}

export function createGoogleAuthorization(request: Request) {
  const config = requireOAuthConfig(request);
  const state = randomBytes(24).toString("base64url");
  const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorizationUrl.searchParams.set("client_id", config.clientId);
  authorizationUrl.searchParams.set("redirect_uri", config.redirectUri);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", calendarScopes.join(" "));
  authorizationUrl.searchParams.set("access_type", "offline");
  authorizationUrl.searchParams.set("include_granted_scopes", "true");
  authorizationUrl.searchParams.set("prompt", "consent");
  authorizationUrl.searchParams.set("state", state);

  return {
    authorizationUrl: authorizationUrl.toString(),
    stateCookie: serializeCookie(stateCookieName, state, request, {
      httpOnly: true,
      maxAge: 600,
    }),
  };
}

export function verifyGoogleOAuthState(request: Request, receivedState: string) {
  const cookies = parseCookies(request.headers.get("cookie"));
  const expectedState = cookies[stateCookieName] ?? "";
  return Boolean(receivedState && expectedState && receivedState === expectedState);
}

export async function exchangeGoogleAuthorizationCode(request: Request, code: string) {
  const config = requireOAuthConfig(request);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(readGoogleError(body, "Google authorization failed."));
  }

  const accessToken = stringValue(body.access_token);
  const refreshToken = stringValue(body.refresh_token);
  if (!accessToken || !refreshToken) {
    throw new Error(
      "Google did not return an offline refresh token. Reconnect and approve access.",
    );
  }

  return {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + numberValue(body.expires_in, 3600) * 1000,
    scope: stringValue(body.scope) || calendarScopes.join(" "),
  } satisfies GoogleCalendarToken;
}

export function readGoogleCalendarToken(request: Request) {
  const encrypted = parseCookies(request.headers.get("cookie"))[tokenCookieName];
  if (!encrypted) return null;
  try {
    return decryptToken(encrypted, requireOAuthConfig(request).tokenSecret);
  } catch {
    return null;
  }
}

export async function ensureFreshGoogleCalendarToken(request: Request) {
  const token = readGoogleCalendarToken(request);
  if (!token) return { token: null, refreshed: false };
  if (token.expiresAt > Date.now() + 60_000) return { token, refreshed: false };

  const config = requireOAuthConfig(request);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: token.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok) throw new Error(readGoogleError(body, "Google Calendar reconnect required."));

  return {
    token: {
      ...token,
      accessToken: stringValue(body.access_token),
      expiresAt: Date.now() + numberValue(body.expires_in, 3600) * 1000,
      scope: stringValue(body.scope) || token.scope,
    },
    refreshed: true,
  };
}

export async function listGoogleCalendars(accessToken: string) {
  const response = await fetch(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok) throw new Error(readGoogleError(body, "Could not load Google calendars."));
  const items = Array.isArray(body.items) ? body.items : [];
  const primary = items.find((item) => isRecord(item) && item.primary === true) as
    | Record<string, unknown>
    | undefined;
  const account = stringValue(primary?.id);

  return items
    .filter(isRecord)
    .map(
      (item) =>
        ({
          id: stringValue(item.id),
          name: stringValue(item.summaryOverride) || stringValue(item.summary) || "Calendar",
          account,
          primary: item.primary === true,
          writable: item.accessRole === "owner" || item.accessRole === "writer",
          backgroundColor: stringValue(item.backgroundColor) || "#60a5fa",
          timeZone: stringValue(item.timeZone) || "UTC",
        }) satisfies GoogleCalendarListItem,
    )
    .filter((calendar) => calendar.id);
}

export async function createGoogleCalendarBlockers(
  accessToken: string,
  input: {
    calendarIds: string[];
    title: string;
    date: string;
    startTime: string;
    endTime: string;
    allDay: boolean;
    timeZone: string;
  },
) {
  const event = input.allDay
    ? {
        summary: input.title,
        visibility: "private",
        transparency: "opaque",
        start: { date: input.date },
        end: { date: addOneDay(input.date) },
      }
    : {
        summary: input.title,
        visibility: "private",
        transparency: "opaque",
        start: { dateTime: `${input.date}T${input.startTime}:00`, timeZone: input.timeZone },
        end: { dateTime: `${input.date}T${input.endTime}:00`, timeZone: input.timeZone },
      };

  const results = await Promise.all(
    input.calendarIds.map(async (calendarId) => {
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(event),
        },
      );
      const body = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        throw new Error(readGoogleError(body, `Could not create blocker on ${calendarId}.`));
      }
      return { calendarId, eventId: stringValue(body.id), link: stringValue(body.htmlLink) };
    }),
  );
  return results;
}

export async function revokeGoogleCalendarToken(token: GoogleCalendarToken | null) {
  if (!token) return;
  const value = token.refreshToken || token.accessToken;
  if (!value) return;
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(value)}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  }).catch(() => undefined);
}

export function createTokenCookie(request: Request, token: GoogleCalendarToken) {
  const encrypted = encryptToken(token, requireOAuthConfig(request).tokenSecret);
  return serializeCookie(tokenCookieName, encrypted, request, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 180,
  });
}

export function clearTokenCookie(request: Request) {
  return serializeCookie(tokenCookieName, "", request, { httpOnly: true, maxAge: 0 });
}

export function clearStateCookie(request: Request) {
  return serializeCookie(stateCookieName, "", request, { httpOnly: true, maxAge: 0 });
}

function readOAuthConfig(request: Request): OAuthConfig {
  const origin = new URL(request.url).origin;
  return {
    clientId: stringValue(process.env.GOOGLE_CALENDAR_CLIENT_ID),
    clientSecret: stringValue(process.env.GOOGLE_CALENDAR_CLIENT_SECRET),
    redirectUri:
      stringValue(process.env.GOOGLE_CALENDAR_REDIRECT_URI) ||
      `${origin}/api/calendar/oauth/callback`,
    tokenSecret: stringValue(process.env.GOOGLE_CALENDAR_TOKEN_SECRET),
  };
}

function requireOAuthConfig(request: Request) {
  const config = readOAuthConfig(request);
  if (!config.clientId || !config.clientSecret || !config.redirectUri || !config.tokenSecret) {
    throw new Error("Google Calendar connection is not configured yet.");
  }
  return config;
}

function encryptToken(token: GoogleCalendarToken, secret: string) {
  const key = createHash("sha256").update(secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(token), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext]
    .map((value) => value.toString("base64url"))
    .join(".");
}

function decryptToken(value: string, secret: string): GoogleCalendarToken {
  const [ivValue, tagValue, ciphertextValue] = value.split(".");
  if (!ivValue || !tagValue || !ciphertextValue) throw new Error("Invalid calendar token.");
  const key = createHash("sha256").update(secret).digest();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(plaintext) as GoogleCalendarToken;
}

function serializeCookie(
  name: string,
  value: string,
  request: Request,
  options: { httpOnly: boolean; maxAge: number },
) {
  const secure = new URL(request.url).protocol === "https:";
  return [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${options.maxAge}`,
    "SameSite=Lax",
    options.httpOnly ? "HttpOnly" : "",
    secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

function parseCookies(header: string | null) {
  return Object.fromEntries(
    (header ?? "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");
        const key = separator >= 0 ? part.slice(0, separator) : part;
        const value = separator >= 0 ? part.slice(separator + 1) : "";
        return [key, decodeURIComponent(value)];
      }),
  );
}

function readGoogleError(body: Record<string, unknown>, fallback: string) {
  if (isRecord(body.error) && typeof body.error.message === "string") return body.error.message;
  if (typeof body.error_description === "string") return body.error_description;
  if (typeof body.error === "string") return body.error;
  return fallback;
}

function addOneDay(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return next.toISOString().slice(0, 10);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
