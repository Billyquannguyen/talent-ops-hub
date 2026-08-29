import { createFileRoute } from "@tanstack/react-router";
import {
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Link2,
  LoaderCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/calendar")({ component: EventAssistant });

type Connection = { id: string; account: string; error: string };
type CalendarItem = {
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
type Notification = {
  id: string;
  connectionId: string;
  account: string;
  calendarId: string;
  calendarName: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  timeZone: string;
  responseStatus: "accepted" | "tentative" | "needsAction";
};
type Target = { connectionId: string; calendarId: string };

const today = new Date().toISOString().slice(0, 10);

function EventAssistant() {
  const [configured, setConfigured] = useState(true);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [calendars, setCalendars] = useState<CalendarItem[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState("");
  const [notificationTargets, setNotificationTargets] = useState<Record<string, string[]>>({});
  const [manualTargets, setManualTargets] = useState<string[]>([]);
  const [workingId, setWorkingId] = useState("");
  const [title, setTitle] = useState("Busy");
  const [date, setDate] = useState(today);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [allDay, setAllDay] = useState(false);

  const writableCalendars = useMemo(
    () => calendars.filter((calendar) => calendar.writable),
    [calendars],
  );

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/calendar/connection");
      const body = (await response.json()) as {
        ok: boolean;
        configured: boolean;
        connections: Connection[];
        calendars: CalendarItem[];
        error?: string;
      };
      if (!response.ok || !body.ok) throw new Error(body.error || "Could not load calendars.");
      setConfigured(body.configured);
      setConnections(body.connections ?? []);
      setCalendars(body.calendars ?? []);
      setManualTargets((current) =>
        current.filter((key) => (body.calendars ?? []).some((item) => item.key === key)),
      );
      if (body.connections?.length) {
        const scan = await requestScan();
        const items = scan.notifications ?? [];
        setNotifications(items);
        setNotificationTargets(
          Object.fromEntries(
            items.map((item) => [
              item.id,
              (body.calendars ?? [])
                .filter(
                  (calendar) =>
                    calendar.writable &&
                    (calendar.connectionId !== item.connectionId ||
                      calendar.id !== item.calendarId),
                )
                .map((calendar) => calendar.key),
            ]),
          ),
        );
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load calendars.");
    } finally {
      setLoading(false);
    }
  }, []);

  const scanCalendars = useCallback(
    async (showProgress = true) => {
      if (showProgress) setScanning(true);
      try {
        const body = await requestScan();
        const items = body.notifications ?? [];
        setNotifications(items);
        setNotificationTargets((current) => {
          const next = { ...current };
          for (const item of items) {
            if (!next[item.id]) {
              next[item.id] = writableCalendars
                .filter(
                  (calendar) =>
                    calendar.connectionId !== item.connectionId || calendar.id !== item.calendarId,
                )
                .map((calendar) => calendar.key);
            }
          }
          return next;
        });
        if (showProgress) setMessage(body.errors?.length ? body.errors[0] : "Calendars checked.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Calendar check failed.");
      } finally {
        if (showProgress) setScanning(false);
      }
    },
    [writableCalendars],
  );

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  async function disconnect(connection: Connection) {
    if (!window.confirm(`Disconnect ${connection.account}?`)) return;
    setWorkingId(connection.id);
    try {
      const response = await fetch(
        `/api/calendar/connection?connectionId=${encodeURIComponent(connection.id)}`,
        { method: "DELETE" },
      );
      const body = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !body.ok) throw new Error(body.error || "Disconnect failed.");
      await loadWorkspace();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Disconnect failed.");
    } finally {
      setWorkingId("");
    }
  }

  async function actOnNotification(item: Notification, acceptSource: boolean) {
    const selected = notificationTargets[item.id] ?? [];
    if (!acceptSource && !selected.length) {
      setMessage("Choose at least one destination calendar.");
      return;
    }
    setWorkingId(item.id);
    try {
      const response = await fetch("/api/calendar/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "apply",
          notificationId: item.id,
          targets: targetObjects(selected),
          acceptSource,
        }),
      });
      const body = (await response.json()) as {
        ok: boolean;
        results?: Array<{ ok: boolean; error?: string }>;
        error?: string;
      };
      if (!response.ok || !body.ok) throw new Error(body.error || "Could not apply this event.");
      const failed = body.results?.filter((result) => !result.ok) ?? [];
      if (failed.length) throw new Error(failed[0]?.error || "Some blockers could not be created.");
      setNotifications((current) => current.filter((notification) => notification.id !== item.id));
      setMessage(
        acceptSource && item.responseStatus !== "accepted"
          ? "Invitation accepted and blockers added."
          : "Blockers added.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not apply this event.");
    } finally {
      setWorkingId("");
    }
  }

  async function ignoreNotification(id: string) {
    setWorkingId(id);
    try {
      const response = await fetch("/api/calendar/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ignore", notificationId: id }),
      });
      if (!response.ok) throw new Error("Could not ignore this event.");
      setNotifications((current) => current.filter((item) => item.id !== id));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not ignore this event.");
    } finally {
      setWorkingId("");
    }
  }

  async function createBlocker() {
    if (!manualTargets.length) return setMessage("Choose at least one calendar.");
    if (!allDay && endTime <= startTime) return setMessage("End time must be after start time.");
    setWorkingId("manual");
    try {
      const selectedCalendars = calendars.filter((calendar) =>
        manualTargets.includes(calendar.key),
      );
      const response = await fetch("/api/calendar/connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create-blocker",
          targets: targetObjects(manualTargets),
          title,
          date,
          startTime,
          endTime,
          allDay,
          timeZone:
            selectedCalendars[0]?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const body = (await response.json()) as {
        ok: boolean;
        results?: Array<{ ok: boolean; error?: string }>;
        error?: string;
      };
      if (!response.ok || !body.ok) throw new Error(body.error || "Blocker creation failed.");
      const created = body.results?.filter((result) => result.ok).length ?? 0;
      const failed = body.results?.filter((result) => !result.ok) ?? [];
      setMessage(
        failed.length
          ? `${created} blockers created. ${failed.length} failed.`
          : `${created} blockers created.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Blocker creation failed.");
    } finally {
      setWorkingId("");
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar />
      <main className="mx-auto w-full max-w-[1440px] px-4 pb-12 pt-5 sm:px-6">
        <header className="mb-4 flex flex-col gap-3 rounded-xl border border-border bg-card/60 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-lg bg-blue-600 text-white">
              <CalendarDays className="size-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Event Assistant</h1>
              <p className="text-sm text-muted-foreground">
                One event in, private blockers everywhere you choose.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Stat value={connections.length} label="accounts" />
            <Stat value={calendars.length} label="calendars" />
            <Stat
              value={notifications.length}
              label="to review"
              attention={notifications.length > 0}
            />
          </div>
        </header>

        {message && (
          <div className="mb-4 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
            {message}
          </div>
        )}

        <section className="mb-4 rounded-xl border border-border bg-card/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-medium">Connected Google accounts</h2>
              <p className="text-xs text-muted-foreground">
                Connect every account you use. Each can contain several calendars.
              </p>
            </div>
            <Button asChild size="sm" disabled={!configured}>
              <a href="/api/calendar/oauth/start">
                <Plus /> Connect another account
              </a>
            </Button>
          </div>
          {!configured && (
            <p className="mt-3 text-sm text-amber-300">
              Google OAuth setup is missing on this deployment.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {loading ? (
              <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
            ) : connections.length ? (
              connections.map((connection) => (
                <div
                  key={connection.id}
                  className="flex items-center gap-2 rounded-lg border border-border bg-background/60 px-3 py-2 text-sm"
                >
                  <span
                    className={cn(
                      "size-2 rounded-full",
                      connection.error ? "bg-amber-400" : "bg-emerald-400",
                    )}
                  />
                  <span>{connection.account}</span>
                  <span className="text-xs text-muted-foreground">
                    {calendars.filter((calendar) => calendar.connectionId === connection.id).length}{" "}
                    calendars
                  </span>
                  <button
                    className="ml-1 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => void disconnect(connection)}
                    aria-label={`Disconnect ${connection.account}`}
                    disabled={workingId === connection.id}
                  >
                    {workingId === connection.id ? (
                      <LoaderCircle className="size-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="size-3.5" />
                    )}
                  </button>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No account connected yet.</p>
            )}
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          <section className="rounded-xl border border-border bg-card/60">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <Bell className="size-4 text-amber-300" />
                <div>
                  <h2 className="font-medium">Needs your decision</h2>
                  <p className="text-xs text-muted-foreground">
                    New bookings and invitations appear here.
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void scanCalendars()}
                disabled={scanning || !connections.length}
              >
                {scanning ? <LoaderCircle className="animate-spin" /> : <RefreshCw />} Check now
              </Button>
            </div>
            <div className="p-3">
              {!notifications.length ? (
                <EmptyInbox connected={connections.length > 0} />
              ) : (
                notifications.map((item) => {
                  const availableTargets = writableCalendars.filter(
                    (calendar) =>
                      calendar.connectionId !== item.connectionId ||
                      calendar.id !== item.calendarId,
                  );
                  const selected = notificationTargets[item.id] ?? [];
                  const pendingReply = item.responseStatus !== "accepted";
                  return (
                    <article
                      key={item.id}
                      className="mb-3 rounded-lg border border-border bg-background/55 p-4 last:mb-0"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="mb-1 flex items-center gap-2">
                            <StatusBadge status={item.responseStatus} />
                            <span className="text-xs text-muted-foreground">
                              {item.account} · {item.calendarName}
                            </span>
                          </div>
                          <h3 className="font-medium">{item.title}</h3>
                          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                            <Clock3 className="size-3.5" /> {formatEventTime(item)}
                          </p>
                        </div>
                        <ShieldCheck className="size-5 text-emerald-400" />
                      </div>
                      <div className="mt-3">
                        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Add private Busy blocker to
                        </p>
                        <CalendarChoices
                          calendars={availableTargets}
                          selected={selected}
                          onChange={(keys) =>
                            setNotificationTargets((current) => ({ ...current, [item.id]: keys }))
                          }
                        />
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {pendingReply && (
                          <Button
                            size="sm"
                            onClick={() => void actOnNotification(item, true)}
                            disabled={workingId === item.id}
                          >
                            {workingId === item.id ? (
                              <LoaderCircle className="animate-spin" />
                            ) : (
                              <Check />
                            )}{" "}
                            Accept{selected.length ? " + block selected" : " invitation"}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant={pendingReply ? "outline" : "default"}
                          onClick={() => void actOnNotification(item, false)}
                          disabled={workingId === item.id || !selected.length}
                        >
                          <Link2 /> Block selected
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void ignoreNotification(item.id)}
                          disabled={workingId === item.id}
                        >
                          Ignore
                        </Button>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>

          <aside className="h-fit rounded-xl border border-border bg-card/60 p-4">
            <div className="mb-4 flex items-center gap-2">
              <div className="grid size-8 place-items-center rounded-lg bg-emerald-500/15 text-emerald-300">
                <ShieldCheck className="size-4" />
              </div>
              <div>
                <h2 className="font-medium">Quick blocker</h2>
                <p className="text-xs text-muted-foreground">
                  Same private Busy hold on several calendars.
                </p>
              </div>
            </div>
            <div className="space-y-3">
              <Field label="Label">
                <Input value={title} onChange={(event) => setTitle(event.target.value)} />
              </Field>
              <Field label="Date">
                <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
              </Field>
              {!allDay && (
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Starts">
                    <Input
                      type="time"
                      value={startTime}
                      onChange={(event) => setStartTime(event.target.value)}
                    />
                  </Field>
                  <Field label="Ends">
                    <Input
                      type="time"
                      value={endTime}
                      onChange={(event) => setEndTime(event.target.value)}
                    />
                  </Field>
                </div>
              )}
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={allDay}
                  onChange={(event) => setAllDay(event.target.checked)}
                  className="size-4 accent-emerald-500"
                />{" "}
                Block full day
              </label>
              <div>
                <p className="mb-2 text-sm font-medium">Block on</p>
                <CalendarChoices
                  calendars={writableCalendars}
                  selected={manualTargets}
                  onChange={setManualTargets}
                />
              </div>
              <Button
                className="w-full"
                onClick={() => void createBlocker()}
                disabled={workingId === "manual" || !connections.length}
              >
                {workingId === "manual" ? <LoaderCircle className="animate-spin" /> : <Plus />}{" "}
                Create {manualTargets.length || ""} blocker{manualTargets.length === 1 ? "" : "s"}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Event details stay private. Other calendars only receive “Busy”.
              </p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function CalendarChoices({
  calendars,
  selected,
  onChange,
}: {
  calendars: CalendarItem[];
  selected: string[];
  onChange: (keys: string[]) => void;
}) {
  const grouped = useMemo(
    () => Object.entries(Object.groupBy(calendars, (calendar) => calendar.account)),
    [calendars],
  );
  if (!calendars.length)
    return (
      <p className="text-xs text-muted-foreground">Connect another writable calendar first.</p>
    );
  return (
    <div className="space-y-2">
      {grouped.map(([account, items]) => (
        <details key={account} open className="rounded-md border border-border bg-card/40">
          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-xs font-medium">
            <span>{account}</span>
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </summary>
          <div className="border-t border-border px-2 py-1">
            {items?.map((calendar) => (
              <label
                key={calendar.key}
                className="flex cursor-pointer items-center gap-2 rounded px-1 py-1.5 text-sm hover:bg-muted/50"
              >
                <input
                  type="checkbox"
                  className="size-4 accent-emerald-500"
                  checked={selected.includes(calendar.key)}
                  onChange={(event) =>
                    onChange(
                      event.target.checked
                        ? [...selected, calendar.key]
                        : selected.filter((key) => key !== calendar.key),
                    )
                  }
                />
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: calendar.backgroundColor }}
                />
                <span className="min-w-0 flex-1 truncate">{calendar.name}</span>
                {calendar.primary && (
                  <span className="text-[10px] text-muted-foreground">Primary</span>
                )}
              </label>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

function EmptyInbox({ connected }: { connected: boolean }) {
  return (
    <div className="grid min-h-56 place-items-center px-4 text-center">
      <div>
        <div className="mx-auto mb-3 grid size-10 place-items-center rounded-full bg-muted">
          <Bell className="size-4 text-muted-foreground" />
        </div>
        <p className="font-medium">
          {connected ? "Nothing needs review" : "Connect your first Google account"}
        </p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {connected
            ? "New accepted, tentative, and unanswered invitations will appear here."
            : "Then connect the other Google accounts whose availability you want to protect."}
        </p>
      </div>
    </div>
  );
}

function Stat({
  value,
  label,
  attention = false,
}: {
  value: number;
  label: string;
  attention?: boolean;
}) {
  return (
    <span
      className={cn(
        "rounded-full border px-2.5 py-1",
        attention
          ? "border-amber-400/40 bg-amber-400/10 text-amber-200"
          : "border-border text-muted-foreground",
      )}
    >
      <strong className="text-foreground">{value}</strong> {label}
    </span>
  );
}

function StatusBadge({ status }: { status: Notification["responseStatus"] }) {
  const label =
    status === "needsAction" ? "Needs response" : status === "tentative" ? "Tentative" : "Accepted";
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        status === "accepted"
          ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
          : status === "tentative"
            ? "border-sky-400/30 bg-sky-400/10 text-sky-300"
            : "border-amber-400/30 bg-amber-400/10 text-amber-300",
      )}
    >
      {label}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

function targetObjects(keys: string[]): Target[] {
  return keys.map((key) => {
    const separator = key.indexOf(":");
    return { connectionId: key.slice(0, separator), calendarId: key.slice(separator + 1) };
  });
}

async function requestScan() {
  const response = await fetch("/api/calendar/notifications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "scan" }),
  });
  const body = (await response.json()) as {
    ok: boolean;
    notifications?: Notification[];
    errors?: string[];
    error?: string;
  };
  if (!response.ok || !body.ok) throw new Error(body.error || "Calendar check failed.");
  return body;
}

function formatEventTime(item: Notification) {
  if (item.allDay) return `${formatDate(item.start)} · All day`;
  return `${formatDate(item.start)} · ${formatTime(item.start)}–${formatTime(item.end)}`;
}

function formatDate(value: string) {
  const date = value.includes("T") ? new Date(value) : new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(
    new Date(value),
  );
}
