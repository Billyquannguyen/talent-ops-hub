import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
} from "node:crypto";

export type GoogleCalendarToken = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string;
};

export type CalendarTarget = { connectionId: string; calendarId: string };

export type CalendarConnectionSummary = {
  id: string;
  account: string;
  createdAt: string;
  updatedAt: string;
  error: string;
};

export type GoogleCalendarListItem = {
  key: string;
  connectionId: string;
  id: string;
  name: string;
  account: string;
  primary: boolean;
  writable: boolean;
  backgroundColor: string;
  timeZone: string;
};

export type CalendarNotification = {
  id: string;
  connectionId: string;
  account: string;
  calendarId: string;
  calendarName: string;
  eventId: string;
  eventUpdated: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  timeZone: string;
  responseStatus: "accepted" | "tentative" | "needsAction";
  status: "pending" | "applied" | "ignored";
  createdAt: string;
  updatedAt: string;
};

type StoredConnection = {
  id: string;
  account: string;
  token: GoogleCalendarToken;
  createdAt: string;
  updatedAt: string;
  error: string;
};

type CalendarSyncState = {
  id: string;
  connectionId: string;
  calendarId: string;
  syncToken: string;
  channelId: string;
  channelResourceId: string;
  channelExpiration: number;
  lastCheckedAt: string;
};

type CalendarAssistantState = {
  version: 2;
  connections: StoredConnection[];
  syncStates: CalendarSyncState[];
  notifications: CalendarNotification[];
  updatedAt: string;
};

type OAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  tokenSecret: string;
};

type GoogleEvent = Record<string, unknown>;

const stateCookieName = "katlas_google_calendar_state";
const legacyTokenCookieName = "katlas_google_calendar_token";
const assistantStateSettingKey = "calendar.assistant.state.v2";
const legacyTokenSettingKey = "google-calendar.oauth-token.v1";
const calendarScopes = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
];
let stateMutationQueue: Promise<unknown> = Promise.resolve();

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
  authorizationUrl.searchParams.set("prompt", "consent select_account");
  authorizationUrl.searchParams.set("state", state);
  return {
    authorizationUrl: authorizationUrl.toString(),
    stateCookie: serializeCookie(stateCookieName, state, request, 600),
  };
}

export function verifyGoogleOAuthState(request: Request, receivedState: string) {
  const expectedState = parseCookies(request.headers.get("cookie"))[stateCookieName] ?? "";
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
  if (!response.ok) throw new Error(readGoogleError(body, "Google authorization failed."));
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

export async function connectGoogleCalendarAccount(request: Request, token: GoogleCalendarToken) {
  const calendars = await listGoogleCalendarsForToken(token.accessToken, "");
  const account = calendars.find((calendar) => calendar.primary)?.account ?? "";
  if (!account) throw new Error("Could not identify the connected Google account.");
  const connectionId = connectionIdForAccount(account);
  const now = new Date().toISOString();
  await mutateAssistantState(request, (state) => {
    const existing = state.connections.find((connection) => connection.id === connectionId);
    const next: StoredConnection = {
      id: connectionId,
      account,
      token,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      error: "",
    };
    state.connections = [...state.connections.filter((item) => item.id !== connectionId), next];
    state.syncStates = state.syncStates.filter((item) => item.connectionId !== connectionId);
    return state;
  });
  return { connectionId, account };
}

export async function listCalendarWorkspace(request: Request) {
  const state = await loadAssistantState(request);
  let changed = false;
  const connections: CalendarConnectionSummary[] = [];
  const calendars: GoogleCalendarListItem[] = [];
  for (const connection of state.connections) {
    try {
      const refreshed = await refreshTokenIfNeeded(request, connection.token);
      if (refreshed !== connection.token) {
        connection.token = refreshed;
        connection.updatedAt = new Date().toISOString();
        changed = true;
      }
      calendars.push(
        ...(await listGoogleCalendarsForToken(connection.token.accessToken, connection.id)),
      );
      connection.error = "";
    } catch (error) {
      const message = error instanceof Error ? error.message : "Google Calendar connection failed.";
      if (connection.error !== message) changed = true;
      connection.error = message;
    }
    connections.push(toConnectionSummary(connection));
  }
  if (changed) await saveAssistantState(request, state);
  return { connections, calendars };
}

export async function disconnectGoogleCalendarAccount(request: Request, connectionId: string) {
  const state = await loadAssistantState(request);
  const connection = state.connections.find((item) => item.id === connectionId);
  if (connection) await revokeGoogleCalendarToken(connection.token);
  await mutateAssistantState(request, (current) => {
    current.connections = current.connections.filter((item) => item.id !== connectionId);
    current.syncStates = current.syncStates.filter((item) => item.connectionId !== connectionId);
    current.notifications = current.notifications.filter(
      (item) => item.connectionId !== connectionId,
    );
    return current;
  });
}

export async function createWorkspaceBlockers(
  request: Request,
  input: {
    targets: CalendarTarget[];
    title: string;
    date: string;
    startTime: string;
    endTime: string;
    allDay: boolean;
    timeZone: string;
    sourceEventId?: string;
  },
) {
  const state = await loadAssistantState(request);
  const results: Array<{
    connectionId: string;
    calendarId: string;
    ok: boolean;
    eventId?: string;
    link?: string;
    error?: string;
  }> = [];
  let changed = false;
  for (const target of uniqueTargets(input.targets)) {
    const connection = state.connections.find((item) => item.id === target.connectionId);
    if (!connection) {
      results.push({ ...target, ok: false, error: "Google account is no longer connected." });
      continue;
    }
    try {
      const refreshed = await refreshTokenIfNeeded(request, connection.token);
      if (refreshed !== connection.token) {
        connection.token = refreshed;
        connection.updatedAt = new Date().toISOString();
        changed = true;
      }
      const created = await createGoogleCalendarBlocker(
        connection.token.accessToken,
        target.calendarId,
        input,
      );
      results.push({ ...target, ok: true, ...created });
    } catch (error) {
      results.push({
        ...target,
        ok: false,
        error: error instanceof Error ? error.message : "Could not create blocker.",
      });
    }
  }
  if (changed) await saveAssistantState(request, state);
  return results;
}

export async function scanCalendarWorkspace(request: Request) {
  const workspace = await listCalendarWorkspace(request);
  const state = await loadAssistantState(request);
  const errors: string[] = [];
  let detected = 0;
  for (const calendar of workspace.calendars) {
    const connection = state.connections.find((item) => item.id === calendar.connectionId);
    if (!connection) continue;
    try {
      const result = await scanOneCalendar(request, state, connection, calendar);
      detected += result.detected;
    } catch (error) {
      errors.push(
        `${calendar.account} · ${calendar.name}: ${error instanceof Error ? error.message : "Scan failed."}`,
      );
    }
  }
  await saveAssistantState(request, state);
  return { detected, errors, notifications: pendingNotifications(state) };
}

export async function listCalendarNotifications(request: Request) {
  return pendingNotifications(await loadAssistantState(request));
}

export async function ignoreCalendarNotification(request: Request, notificationId: string) {
  await mutateAssistantState(request, (state) => {
    const item = state.notifications.find((notification) => notification.id === notificationId);
    if (item) {
      item.status = "ignored";
      item.updatedAt = new Date().toISOString();
    }
    return state;
  });
}

export async function applyCalendarNotification(
  request: Request,
  input: { notificationId: string; targets: CalendarTarget[]; acceptSource: boolean },
) {
  const state = await loadAssistantState(request);
  const notification = state.notifications.find((item) => item.id === input.notificationId);
  if (!notification || notification.status !== "pending") {
    throw new Error("This calendar notification is no longer pending.");
  }
  const sourceConnection = state.connections.find((item) => item.id === notification.connectionId);
  if (!sourceConnection) throw new Error("The source Google account is disconnected.");
  if (input.acceptSource && notification.responseStatus !== "accepted") {
    sourceConnection.token = await refreshTokenIfNeeded(request, sourceConnection.token);
    await acceptGoogleInvitation(
      sourceConnection.token.accessToken,
      notification.calendarId,
      notification.eventId,
      sourceConnection.account,
    );
  }
  const results = await createWorkspaceBlockers(request, {
    targets: input.targets.filter(
      (target) =>
        target.connectionId !== notification.connectionId ||
        target.calendarId !== notification.calendarId,
    ),
    title: "Busy",
    date: notification.start.slice(0, 10),
    startTime: notification.allDay ? "00:00" : timePart(notification.start),
    endTime: notification.allDay ? "23:59" : timePart(notification.end),
    allDay: notification.allDay,
    timeZone: notification.timeZone,
    sourceEventId: notification.eventId,
  });
  if (results.every((result) => result.ok)) {
    await mutateAssistantState(request, (current) => {
      const item = current.notifications.find((entry) => entry.id === notification.id);
      if (item) {
        item.status = "applied";
        item.updatedAt = new Date().toISOString();
      }
      return current;
    });
  }
  return results;
}

export async function handleGoogleCalendarWebhook(request: Request) {
  const channelId = request.headers.get("x-goog-channel-id") ?? "";
  const channelToken = request.headers.get("x-goog-channel-token") ?? "";
  if (!channelId || !safeEqual(channelToken, webhookToken(request, channelId))) {
    return { accepted: false, status: 401, detected: 0 };
  }
  const state = await loadAssistantState(request);
  const syncState = state.syncStates.find((item) => item.channelId === channelId);
  if (!syncState) return { accepted: false, status: 404, detected: 0 };
  const connection = state.connections.find((item) => item.id === syncState.connectionId);
  if (!connection) return { accepted: false, status: 404, detected: 0 };
  connection.token = await refreshTokenIfNeeded(request, connection.token);
  connection.updatedAt = new Date().toISOString();
  const calendars = await listGoogleCalendarsForToken(connection.token.accessToken, connection.id);
  const calendar = calendars.find((item) => item.id === syncState.calendarId);
  if (!calendar) return { accepted: false, status: 404, detected: 0 };
  const result = await scanOneCalendar(request, state, connection, calendar, false);
  await saveAssistantState(request, state);
  return { accepted: true, status: 200, detected: result.detected };
}

export async function renewGoogleCalendarWatches(request: Request) {
  const workspace = await listCalendarWorkspace(request);
  const state = await loadAssistantState(request);
  let renewed = 0;
  for (const calendar of workspace.calendars) {
    const connection = state.connections.find((item) => item.id === calendar.connectionId);
    if (!connection) continue;
    const syncState = state.syncStates.find(
      (item) => item.connectionId === calendar.connectionId && item.calendarId === calendar.id,
    );
    if (!syncState || syncState.channelExpiration < Date.now() + 2 * 24 * 60 * 60 * 1000) {
      await registerCalendarWatch(request, state, connection, calendar);
      renewed += 1;
    }
  }
  await saveAssistantState(request, state);
  return { renewed };
}

export function clearStateCookie(request: Request) {
  return serializeCookie(stateCookieName, "", request, 0);
}

export function clearLegacyTokenCookie(request: Request) {
  return serializeCookie(legacyTokenCookieName, "", request, 0);
}

async function scanOneCalendar(
  request: Request,
  state: CalendarAssistantState,
  connection: StoredConnection,
  calendar: GoogleCalendarListItem,
  ensureWatch = true,
) {
  const refreshed = await refreshTokenIfNeeded(request, connection.token);
  if (refreshed !== connection.token) {
    connection.token = refreshed;
    connection.updatedAt = new Date().toISOString();
  }
  let syncState = state.syncStates.find(
    (item) => item.connectionId === connection.id && item.calendarId === calendar.id,
  );
  const initialized = Boolean(syncState?.syncToken);
  let pageToken = "";
  let nextSyncToken = "";
  const changedEvents: GoogleEvent[] = [];
  do {
    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar.id)}/events`,
    );
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("showDeleted", "true");
    url.searchParams.set("maxResults", "2500");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    if (syncState?.syncToken) {
      url.searchParams.set("syncToken", syncState.syncToken);
    } else {
      url.searchParams.set(
        "timeMin",
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      );
    }
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${connection.token.accessToken}` },
    });
    if (response.status === 410 && syncState?.syncToken) {
      syncState.syncToken = "";
      return scanOneCalendar(request, state, connection, calendar, ensureWatch);
    }
    const body = (await response.json()) as Record<string, unknown>;
    if (!response.ok) throw new Error(readGoogleError(body, "Could not scan calendar events."));
    changedEvents.push(...(Array.isArray(body.items) ? body.items.filter(isRecord) : []));
    pageToken = stringValue(body.nextPageToken);
    nextSyncToken = stringValue(body.nextSyncToken) || nextSyncToken;
  } while (pageToken);

  let detected = 0;
  if (initialized) {
    for (const event of changedEvents) {
      if (!shouldNotifyForEvent(event, connection.account)) continue;
      const notification = toCalendarNotification(connection, calendar, event);
      const existing = state.notifications.find((item) => item.id === notification.id);
      if (!existing) {
        state.notifications.push(notification);
        detected += 1;
      } else if (existing.eventUpdated !== notification.eventUpdated) {
        Object.assign(existing, notification, { status: "pending", createdAt: existing.createdAt });
        detected += 1;
      }
    }
  }
  if (!syncState) {
    syncState = {
      id: syncId(connection.id, calendar.id),
      connectionId: connection.id,
      calendarId: calendar.id,
      syncToken: nextSyncToken,
      channelId: "",
      channelResourceId: "",
      channelExpiration: 0,
      lastCheckedAt: new Date().toISOString(),
    };
    state.syncStates.push(syncState);
  } else {
    syncState.syncToken = nextSyncToken || syncState.syncToken;
    syncState.lastCheckedAt = new Date().toISOString();
  }
  if (ensureWatch && syncState.channelExpiration < Date.now() + 2 * 24 * 60 * 60 * 1000) {
    await registerCalendarWatch(request, state, connection, calendar);
  }
  return { detected };
}

async function registerCalendarWatch(
  request: Request,
  state: CalendarAssistantState,
  connection: StoredConnection,
  calendar: GoogleCalendarListItem,
) {
  const channelId = randomUUID();
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar.id)}/events/watch`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${connection.token.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: channelId,
        type: "web_hook",
        address: `${new URL(requireOAuthConfig(request).redirectUri).origin}/api/calendar/webhook`,
        token: webhookToken(request, channelId),
        params: { ttl: "604800" },
      }),
    },
  );
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok)
    throw new Error(readGoogleError(body, "Could not register calendar monitoring."));
  const current = state.syncStates.find(
    (item) => item.connectionId === connection.id && item.calendarId === calendar.id,
  );
  if (!current) return;
  current.channelId = channelId;
  current.channelResourceId = stringValue(body.resourceId);
  current.channelExpiration = numberValue(body.expiration, Date.now() + 6 * 24 * 60 * 60 * 1000);
}

async function refreshTokenIfNeeded(request: Request, token: GoogleCalendarToken) {
  if (token.expiresAt > Date.now() + 60_000) return token;
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
  const accessToken = stringValue(body.access_token);
  if (!accessToken) throw new Error("Google Calendar did not return a refreshed access token.");
  return {
    ...token,
    accessToken,
    expiresAt: Date.now() + numberValue(body.expires_in, 3600) * 1000,
    scope: stringValue(body.scope) || token.scope,
  } satisfies GoogleCalendarToken;
}

async function listGoogleCalendarsForToken(accessToken: string, connectionId: string) {
  const response = await fetch(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok) throw new Error(readGoogleError(body, "Could not load Google calendars."));
  const items = Array.isArray(body.items) ? body.items.filter(isRecord) : [];
  const account = stringValue(items.find((item) => item.primary === true)?.id);
  return items
    .map(
      (item) =>
        ({
          key: calendarKey(connectionId, stringValue(item.id)),
          connectionId,
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

async function createGoogleCalendarBlocker(
  accessToken: string,
  calendarId: string,
  input: {
    title: string;
    date: string;
    startTime: string;
    endTime: string;
    allDay: boolean;
    timeZone: string;
    sourceEventId?: string;
  },
) {
  const event = {
    summary: input.title,
    visibility: "private",
    transparency: "opaque",
    extendedProperties: {
      private: { katlasBuddy: "blocker", sourceEventId: input.sourceEventId ?? "manual" },
    },
    ...(input.allDay
      ? { start: { date: input.date }, end: { date: addOneDay(input.date) } }
      : {
          start: { dateTime: `${input.date}T${input.startTime}:00`, timeZone: input.timeZone },
          end: { dateTime: `${input.date}T${input.endTime}:00`, timeZone: input.timeZone },
        }),
  };
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(event),
    },
  );
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok)
    throw new Error(readGoogleError(body, `Could not create blocker on ${calendarId}.`));
  return { eventId: stringValue(body.id), link: stringValue(body.htmlLink) };
}

async function acceptGoogleInvitation(
  accessToken: string,
  calendarId: string,
  eventId: string,
  account: string,
) {
  const eventUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
  const getResponse = await fetch(eventUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const event = (await getResponse.json()) as Record<string, unknown>;
  if (!getResponse.ok) throw new Error(readGoogleError(event, "Could not load the invitation."));
  const attendees = Array.isArray(event.attendees)
    ? event.attendees
        .filter(isRecord)
        .map((attendee) =>
          attendee.self === true ||
          stringValue(attendee.email).toLowerCase() === account.toLowerCase()
            ? { ...attendee, responseStatus: "accepted" }
            : attendee,
        )
    : [];
  const patchResponse = await fetch(`${eventUrl}?sendUpdates=all`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ attendees }),
  });
  const body = (await patchResponse.json()) as Record<string, unknown>;
  if (!patchResponse.ok) throw new Error(readGoogleError(body, "Could not accept the invitation."));
}

async function revokeGoogleCalendarToken(token: GoogleCalendarToken | null) {
  if (!token) return;
  const value = token.refreshToken || token.accessToken;
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(value)}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  }).catch(() => undefined);
}

async function loadAssistantState(request: Request): Promise<CalendarAssistantState> {
  const config = requireOAuthConfig(request);
  const { listAppSettingsInGoogleSheets } = await import("@/storage/googleSheets.server");
  const { records } = await listAppSettingsInGoogleSheets();
  const encrypted = records.find(
    (record) => record.settingKey === assistantStateSettingKey,
  )?.settingValue;
  if (encrypted) return normalizeAssistantState(decryptJson(encrypted, config.tokenSecret));
  const legacyEncrypted = records.find(
    (record) => record.settingKey === legacyTokenSettingKey,
  )?.settingValue;
  if (legacyEncrypted) {
    try {
      const migrated = await migrateLegacyToken(
        request,
        decryptJson(legacyEncrypted, config.tokenSecret) as GoogleCalendarToken,
      );
      if (migrated) return migrated;
    } catch {
      // A broken legacy token should not prevent a fresh multi-account setup.
    }
  }
  const legacyCookie = parseCookies(request.headers.get("cookie"))[legacyTokenCookieName];
  if (legacyCookie) {
    try {
      const migrated = await migrateLegacyToken(
        request,
        decryptJson(legacyCookie, config.tokenSecret) as GoogleCalendarToken,
      );
      if (migrated) return migrated;
    } catch {
      // The browser can reconnect if its old cookie is no longer usable.
    }
  }
  return emptyAssistantState();
}

async function migrateLegacyToken(request: Request, legacyToken: GoogleCalendarToken) {
  const token = await refreshTokenIfNeeded(request, legacyToken);
  const calendars = await listGoogleCalendarsForToken(token.accessToken, "");
  const account = calendars.find((calendar) => calendar.primary)?.account ?? "";
  if (!account) return null;
  const now = new Date().toISOString();
  const migrated: CalendarAssistantState = {
    ...emptyAssistantState(),
    connections: [
      {
        id: connectionIdForAccount(account),
        account,
        token,
        createdAt: now,
        updatedAt: now,
        error: "",
      },
    ],
    updatedAt: now,
  };
  await saveAssistantState(request, migrated);
  return migrated;
}

async function saveAssistantState(request: Request, state: CalendarAssistantState) {
  const pending = state.notifications.filter((item) => item.status === "pending");
  const resolved = state.notifications
    .filter((item) => item.status !== "pending")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 100);
  state.notifications = [...pending, ...resolved];
  state.updatedAt = new Date().toISOString();
  const encrypted = encryptJson(state, requireOAuthConfig(request).tokenSecret);
  const { upsertAppSettingInGoogleSheets } = await import("@/storage/googleSheets.server");
  await upsertAppSettingInGoogleSheets({
    settingKey: assistantStateSettingKey,
    settingValue: encrypted,
    updatedAt: state.updatedAt,
  });
}

async function mutateAssistantState(
  request: Request,
  mutator: (state: CalendarAssistantState) => CalendarAssistantState,
) {
  const operation = stateMutationQueue.then(async () => {
    const state = await loadAssistantState(request);
    const next = mutator(state);
    await saveAssistantState(request, next);
    return next;
  });
  stateMutationQueue = operation.catch(() => undefined);
  return operation;
}

function normalizeAssistantState(value: unknown): CalendarAssistantState {
  if (!isRecord(value)) return emptyAssistantState();
  return {
    version: 2,
    connections: Array.isArray(value.connections)
      ? value.connections.filter(isRecord).map((item) => item as StoredConnection)
      : [],
    syncStates: Array.isArray(value.syncStates)
      ? value.syncStates.filter(isRecord).map((item) => item as CalendarSyncState)
      : [],
    notifications: Array.isArray(value.notifications)
      ? value.notifications.filter(isRecord).map((item) => item as CalendarNotification)
      : [],
    updatedAt: stringValue(value.updatedAt) || new Date().toISOString(),
  };
}

function emptyAssistantState(): CalendarAssistantState {
  return { version: 2, connections: [], syncStates: [], notifications: [], updatedAt: "" };
}

function shouldNotifyForEvent(event: GoogleEvent, account: string) {
  if (stringValue(event.status) === "cancelled") return false;
  if (stringValue(event.transparency) === "transparent") return false;
  const extended = isRecord(event.extendedProperties) ? event.extendedProperties : {};
  const privateProps = isRecord(extended.private) ? extended.private : {};
  if (stringValue(privateProps.katlasBuddy) === "blocker") return false;
  return ["accepted", "tentative", "needsAction"].includes(eventResponseStatus(event, account));
}

function toCalendarNotification(
  connection: StoredConnection,
  calendar: GoogleCalendarListItem,
  event: GoogleEvent,
): CalendarNotification {
  const eventId = stringValue(event.id);
  const startValue = isRecord(event.start) ? event.start : {};
  const endValue = isRecord(event.end) ? event.end : {};
  const allDay = Boolean(startValue.date);
  const now = new Date().toISOString();
  return {
    id: notificationId(connection.id, calendar.id, eventId),
    connectionId: connection.id,
    account: connection.account,
    calendarId: calendar.id,
    calendarName: calendar.name,
    eventId,
    eventUpdated: stringValue(event.updated) || now,
    title: stringValue(event.summary) || "Busy event",
    start: stringValue(startValue.dateTime) || stringValue(startValue.date),
    end: stringValue(endValue.dateTime) || stringValue(endValue.date),
    allDay,
    timeZone: stringValue(startValue.timeZone) || calendar.timeZone || "UTC",
    responseStatus: eventResponseStatus(event, connection.account) ?? "accepted",
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };
}

function eventResponseStatus(
  event: GoogleEvent,
  account: string,
): CalendarNotification["responseStatus"] | null {
  const attendees = Array.isArray(event.attendees) ? event.attendees.filter(isRecord) : [];
  const self = attendees.find(
    (attendee) =>
      attendee.self === true || stringValue(attendee.email).toLowerCase() === account.toLowerCase(),
  );
  if (!self) return "accepted";
  const status = stringValue(self.responseStatus);
  if (status === "tentative" || status === "needsAction" || status === "accepted") return status;
  return null;
}

function pendingNotifications(state: CalendarAssistantState) {
  return state.notifications
    .filter((item) => item.status === "pending")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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

function encryptJson(value: unknown, secret: string) {
  const key = createHash("sha256").update(secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64url")).join(".");
}

function decryptJson(value: string, secret: string): unknown {
  const [ivValue, tagValue, ciphertextValue] = value.split(".");
  if (!ivValue || !tagValue || !ciphertextValue) throw new Error("Invalid calendar state.");
  const key = createHash("sha256").update(secret).digest();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(ciphertextValue, "base64url")),
      decipher.final(),
    ]).toString("utf8"),
  ) as unknown;
}

function webhookToken(request: Request, channelId: string) {
  return createHmac("sha256", requireOAuthConfig(request).tokenSecret)
    .update(channelId)
    .digest("base64url");
}

function safeEqual(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let different = 0;
  for (let index = 0; index < a.length; index += 1) {
    different |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return different === 0;
}

function serializeCookie(name: string, value: string, request: Request, maxAge: number) {
  const secure = new URL(request.url).protocol === "https:";
  return [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${maxAge}`,
    "SameSite=Lax",
    "HttpOnly",
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
        return [
          separator >= 0 ? part.slice(0, separator) : part,
          decodeURIComponent(separator >= 0 ? part.slice(separator + 1) : ""),
        ];
      }),
  );
}

function connectionIdForAccount(account: string) {
  return `google-${createHash("sha256").update(account.toLowerCase()).digest("hex").slice(0, 20)}`;
}

function calendarKey(connectionId: string, calendarId: string) {
  return `${connectionId}:${calendarId}`;
}

function syncId(connectionId: string, calendarId: string) {
  return createHash("sha256").update(`${connectionId}:${calendarId}`).digest("hex").slice(0, 32);
}

function notificationId(connectionId: string, calendarId: string, eventId: string) {
  return createHash("sha256")
    .update(`${connectionId}:${calendarId}:${eventId}`)
    .digest("hex")
    .slice(0, 32);
}

function toConnectionSummary(connection: StoredConnection): CalendarConnectionSummary {
  return {
    id: connection.id,
    account: connection.account,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
    error: connection.error,
  };
}

function uniqueTargets(targets: CalendarTarget[]) {
  return [
    ...new Map(
      targets.map((target) => [`${target.connectionId}:${target.calendarId}`, target]),
    ).values(),
  ];
}

function timePart(value: string) {
  return value.match(/T(\d{2}:\d{2})/)?.[1] ?? "00:00";
}

function addOneDay(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

function readGoogleError(body: Record<string, unknown>, fallback: string) {
  if (isRecord(body.error) && typeof body.error.message === "string") return body.error.message;
  if (typeof body.error_description === "string") return body.error_description;
  if (typeof body.error === "string") return body.error;
  return fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown, fallback: number) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}
