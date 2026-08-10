import { createFileRoute } from "@tanstack/react-router";
import {
  Bell,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Link2,
  LoaderCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  Unplug,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/calendar")({
  component: EventAssistant,
});

type CalendarId = string;
type EventKind = "event" | "blocker";

type ConnectedCalendar = {
  id: CalendarId;
  name: string;
  account: string;
  colorClass: string;
  ringClass: string;
  backgroundColor?: string;
  primary?: boolean;
  writable?: boolean;
};

type CalendarConnectionState = {
  loading: boolean;
  configured: boolean;
  connected: boolean;
  account: string;
  calendars: ConnectedCalendar[];
  redirectUri: string;
  error: string;
};

type RoutedEvent = {
  id: string;
  title: string;
  date: string;
  start: string;
  end: string;
  calendars: CalendarId[];
  origin: "assistant" | "external";
  kind: EventKind;
  source: string;
  routed?: boolean;
};

type QueueItem = {
  id: string;
  sourceEventId: string;
  title: string;
  sourceCalendarId: CalendarId;
  date: string;
  start: string;
  end: string;
  source: string;
  recommendedTargets: CalendarId[];
  note: string;
};

const demoCalendars: ConnectedCalendar[] = [
  {
    id: "work",
    name: "Work",
    account: "work@company.com",
    colorClass: "bg-sky-400",
    ringClass: "ring-sky-400/40",
  },
  {
    id: "personal",
    name: "Personal",
    account: "personal@gmail.com",
    colorClass: "bg-amber-300",
    ringClass: "ring-amber-300/40",
  },
  {
    id: "content",
    name: "Content",
    account: "content@katlas.media",
    colorClass: "bg-emerald-400",
    ringClass: "ring-emerald-400/40",
  },
  {
    id: "team",
    name: "Team Ops",
    account: "ops@katlas.media",
    colorClass: "bg-violet-400",
    ringClass: "ring-violet-400/40",
  },
];

const today = new Date();
const todayKey = toDateKey(today);

const seedEvents: RoutedEvent[] = [
  {
    id: "evt-1",
    title: "Glossier creator review",
    date: toDateKey(addDays(today, 1)),
    start: "10:00",
    end: "10:45",
    calendars: ["work", "team"],
    origin: "assistant",
    kind: "event",
    source: "Event Assistant",
    routed: true,
  },
  {
    id: "evt-2",
    title: "Pilates class",
    date: toDateKey(addDays(today, 2)),
    start: "18:30",
    end: "19:30",
    calendars: ["personal"],
    origin: "external",
    kind: "event",
    source: "Personal Google Calendar",
  },
  {
    id: "evt-3",
    title: "Calendly: brand intro",
    date: toDateKey(addDays(today, 4)),
    start: "14:00",
    end: "14:30",
    calendars: ["work"],
    origin: "external",
    kind: "event",
    source: "Calendly",
  },
  {
    id: "evt-4",
    title: "YouTube publishing hold",
    date: toDateKey(addDays(today, 6)),
    start: "09:00",
    end: "11:00",
    calendars: ["content", "team"],
    origin: "assistant",
    kind: "blocker",
    source: "Event Assistant",
    routed: true,
  },
];

const seedQueue: QueueItem[] = [
  {
    id: "queue-1",
    sourceEventId: "evt-3",
    title: "Calendly: brand intro",
    sourceCalendarId: "work",
    date: toDateKey(addDays(today, 4)),
    start: "14:00",
    end: "14:30",
    source: "Calendly",
    recommendedTargets: ["personal", "team"],
    note: "External booking found on Work.",
  },
];

function EventAssistant() {
  const [activeMonth, setActiveMonth] = useState(() => startOfMonth(today));
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [events, setEvents] = useState<RoutedEvent[]>(seedEvents);
  const [queue, setQueue] = useState<QueueItem[]>(seedQueue);
  const [visibleCalendars, setVisibleCalendars] = useState<CalendarId[]>(
    demoCalendars.map((calendar) => calendar.id),
  );
  const [blockerTitle, setBlockerTitle] = useState("Busy");
  const [blockerDate, setBlockerDate] = useState(todayKey);
  const [startTime, setStartTime] = useState("13:30");
  const [endTime, setEndTime] = useState("14:30");
  const [allDay, setAllDay] = useState(false);
  const [targetCalendars, setTargetCalendars] = useState<CalendarId[]>(["work"]);
  const [queueTargets, setQueueTargets] = useState<Record<string, CalendarId[]>>(() =>
    Object.fromEntries(seedQueue.map((item) => [item.id, item.recommendedTargets])),
  );
  const [status, setStatus] = useState("Ready to protect your time.");
  const [isCreating, setIsCreating] = useState(false);
  const [connection, setConnection] = useState<CalendarConnectionState>({
    loading: true,
    configured: false,
    connected: false,
    account: "",
    calendars: [],
    redirectUri: "",
    error: "",
  });

  const activeCalendars = connection.connected ? connection.calendars : demoCalendars;
  const writableCalendars = connection.calendars.filter((calendar) => calendar.writable);

  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("calendar");
    if (result === "denied") setStatus("Google Calendar access was not approved.");
    if (result === "failed") setStatus("Google Calendar connection failed. Try connecting again.");
    if (result === "invalid-state") setStatus("The connection expired. Try connecting again.");
    if (result === "not-configured") setStatus("Google Calendar OAuth setup is still required.");
    if (result) window.history.replaceState({}, "", window.location.pathname);
    void loadCalendarConnection();
  }, []);

  async function loadCalendarConnection() {
    setConnection((current) => ({ ...current, loading: true, error: "" }));
    try {
      const response = await fetch("/api/calendar/connection");
      const body = (await response.json()) as {
        configured?: boolean;
        connected?: boolean;
        account?: string;
        calendars?: Array<{
          id: string;
          name: string;
          account: string;
          primary: boolean;
          writable: boolean;
          backgroundColor: string;
        }>;
        redirectUri?: string;
        error?: string;
      };
      const calendars = (body.calendars ?? []).map(
        (calendar) =>
          ({
            ...calendar,
            colorClass: "bg-blue-400",
            ringClass: "ring-blue-400/40",
          }) satisfies ConnectedCalendar,
      );
      const nextConnection: CalendarConnectionState = {
        loading: false,
        configured: Boolean(body.configured),
        connected: Boolean(body.connected),
        account: body.account ?? "",
        calendars,
        redirectUri: body.redirectUri ?? "",
        error: body.error ?? (response.ok ? "" : "Could not load the calendar connection."),
      };
      setConnection(nextConnection);

      if (nextConnection.connected) {
        const writable = calendars.filter((calendar) => calendar.writable);
        const defaultCalendar = writable.find((calendar) => calendar.primary) ?? writable[0];
        setVisibleCalendars(calendars.map((calendar) => calendar.id));
        setTargetCalendars(defaultCalendar ? [defaultCalendar.id] : []);
        setStatus(`Connected ${nextConnection.account || "Google Calendar"}.`);
      }
    } catch (error) {
      setConnection((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : "Could not load the calendar connection.",
      }));
    }
  }

  async function disconnectGoogleCalendar() {
    setConnection((current) => ({ ...current, loading: true, error: "" }));
    try {
      await fetch("/api/calendar/connection", { method: "DELETE" });
      setConnection((current) => ({
        ...current,
        loading: false,
        connected: false,
        account: "",
        calendars: [],
      }));
      setVisibleCalendars(demoCalendars.map((calendar) => calendar.id));
      setTargetCalendars([]);
      setStatus("Google Calendar disconnected.");
    } catch (error) {
      setConnection((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : "Could not disconnect Google Calendar.",
      }));
    }
  }

  const selectedDayEvents = useMemo(
    () =>
      events
        .filter((event) => event.date === selectedDate)
        .filter((event) =>
          event.calendars.some((calendarId) => visibleCalendars.includes(calendarId)),
        )
        .sort(sortByStart),
    [events, selectedDate, visibleCalendars],
  );

  const blockerCount = events.filter((event) => event.kind === "blocker").length;

  function selectDate(dateKey: string) {
    setSelectedDate(dateKey);
    setBlockerDate(dateKey);
  }

  function toggleVisibleCalendar(calendarId: CalendarId) {
    setVisibleCalendars((current) =>
      current.includes(calendarId)
        ? current.filter((id) => id !== calendarId)
        : [...current, calendarId],
    );
  }

  function toggleTargetCalendar(calendarId: CalendarId) {
    setTargetCalendars((current) =>
      current.includes(calendarId)
        ? current.filter((id) => id !== calendarId)
        : [...current, calendarId],
    );
  }

  function toggleQueueTarget(itemId: string, calendarId: CalendarId) {
    setQueueTargets((current) => {
      const selected = current[itemId] ?? [];
      return {
        ...current,
        [itemId]: selected.includes(calendarId)
          ? selected.filter((id) => id !== calendarId)
          : [...selected, calendarId],
      };
    });
  }

  async function createBlocker(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!connection.connected) {
      setStatus("Connect Google Calendar first.");
      return;
    }
    if (targetCalendars.length === 0) {
      setStatus("Choose at least one calendar.");
      return;
    }
    if (!allDay && startTime >= endTime) {
      setStatus("End time must be after start time.");
      return;
    }

    const title = blockerTitle.trim() || "Busy";
    setIsCreating(true);
    setStatus("Creating blocker in Google Calendar...");
    try {
      const response = await fetch("/api/calendar/connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create-blocker",
          calendarIds: targetCalendars,
          title,
          date: blockerDate,
          startTime,
          endTime,
          allDay,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        }),
      });
      const body = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !body.ok) throw new Error(body.error || "Blocker creation failed.");

      setEvents((current) => [
        ...current,
        {
          id: `evt-${crypto.randomUUID()}`,
          title,
          date: blockerDate,
          start: allDay ? "All day" : startTime,
          end: allDay ? "All day" : endTime,
          calendars: targetCalendars,
          origin: "assistant",
          kind: "blocker",
          source: "Google Calendar",
          routed: true,
        },
      ]);
      setSelectedDate(blockerDate);
      setActiveMonth(startOfMonth(parseDateKey(blockerDate)));
      setBlockerTitle("Busy");
      setStatus(
        `${title} blocked on ${targetCalendars.length} calendar${targetCalendars.length > 1 ? "s" : ""}.`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Blocker creation failed.");
    } finally {
      setIsCreating(false);
    }
  }

  function routeQueueItem(item: QueueItem, mode: EventKind) {
    const targets = queueTargets[item.id] ?? [];
    if (targets.length === 0) {
      setStatus("Choose at least one target calendar.");
      return;
    }

    if (mode === "event") {
      setEvents((current) =>
        current.map((event) =>
          event.id === item.sourceEventId
            ? { ...event, calendars: mergeCalendarIds(event.calendars, targets), routed: true }
            : event,
        ),
      );
    } else {
      setEvents((current) => [
        ...current,
        {
          id: `evt-${crypto.randomUUID()}`,
          title: `Busy`,
          date: item.date,
          start: item.start,
          end: item.end,
          calendars: targets,
          origin: "assistant",
          kind: "blocker",
          source: `${item.source} review`,
          routed: true,
        },
      ]);
    }

    setQueue((current) => current.filter((queueItem) => queueItem.id !== item.id));
    setStatus(
      `${mode === "event" ? "Copied" : "Blocked"} ${item.title} on ${targets.length} calendar${targets.length > 1 ? "s" : ""}.`,
    );
  }

  function ignoreQueueItem(item: QueueItem) {
    setQueue((current) => current.filter((queueItem) => queueItem.id !== item.id));
    setStatus(`${item.title} ignored.`);
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <TopBar />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[320px] bg-hero-glow" />

      <main className="katlas-page max-w-[1400px] gap-4 py-5">
        <header className="katlas-panel flex flex-col gap-4 rounded-lg p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-lg bg-blue-600 text-white">
              <CalendarDays className="size-4" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Event Assistant</h1>
              <p className="text-xs text-muted-foreground">
                Protect your time and route outside bookings.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <StatusPill
              label="Connected"
              value={connection.connected ? connection.calendars.length.toString() : "0"}
            />
            <StatusPill label="Needs review" value={queue.length.toString()} tone="amber" />
            <StatusPill label="Blockers" value={blockerCount.toString()} tone="emerald" />
          </div>
        </header>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="katlas-panel rounded-lg p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">{formatMonth(activeMonth)}</h2>
                <p className="text-xs text-muted-foreground">Select a day to create a blocker.</p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Previous month"
                  onClick={() => setActiveMonth(addMonths(activeMonth, -1))}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setActiveMonth(startOfMonth(today));
                    selectDate(todayKey);
                  }}
                >
                  Today
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Next month"
                  onClick={() => setActiveMonth(addMonths(activeMonth, 1))}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>

            <MonthGrid
              month={activeMonth}
              selectedDate={selectedDate}
              events={events}
              visibleCalendars={visibleCalendars}
              calendars={activeCalendars}
              onSelectDate={selectDate}
            />

            <div className="mt-4 border-t border-border/70 pt-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">
                    {formatFullDate(parseDateKey(selectedDate))}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {selectedDayEvents.length} visible item
                    {selectedDayEvents.length === 1 ? "" : "s"}
                  </p>
                </div>
                <Clock className="size-4 text-muted-foreground" />
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {selectedDayEvents.length ? (
                  selectedDayEvents.map((event) => (
                    <EventCard key={event.id} event={event} calendars={activeCalendars} />
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-border/70 px-3 py-4 text-sm text-muted-foreground sm:col-span-2 xl:col-span-3">
                    Nothing scheduled on the visible calendars.
                  </div>
                )}
              </div>
            </div>
          </div>

          <aside className="grid content-start gap-4">
            <CalendarConnectionCard
              connection={connection}
              onRefresh={() => void loadCalendarConnection()}
              onDisconnect={() => void disconnectGoogleCalendar()}
            />

            <form onSubmit={createBlocker} className="katlas-panel rounded-lg p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">Create blocker</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Details stay private. Only “busy” time is shared.
                  </p>
                </div>
                <div className="katlas-panel-icon rounded-md">
                  <ShieldCheck className="size-4" />
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <label className="block text-xs font-medium text-muted-foreground">
                  Label
                  <Input
                    className="mt-1 bg-background/70"
                    value={blockerTitle}
                    onChange={(event) => setBlockerTitle(event.target.value)}
                    placeholder="Busy"
                  />
                </label>

                <label className="block text-xs font-medium text-muted-foreground">
                  Date
                  <Input
                    className="mt-1 bg-background/70"
                    type="date"
                    value={blockerDate}
                    onChange={(event) => {
                      setBlockerDate(event.target.value);
                      setSelectedDate(event.target.value);
                    }}
                  />
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-xs font-medium text-muted-foreground">
                    Starts
                    <Input
                      className="mt-1 bg-background/70"
                      type="time"
                      value={startTime}
                      disabled={allDay}
                      onChange={(event) => setStartTime(event.target.value)}
                    />
                  </label>
                  <label className="block text-xs font-medium text-muted-foreground">
                    Ends
                    <Input
                      className="mt-1 bg-background/70"
                      type="time"
                      value={endTime}
                      disabled={allDay}
                      onChange={(event) => setEndTime(event.target.value)}
                    />
                  </label>
                </div>

                <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={allDay}
                    onChange={(event) => setAllDay(event.target.checked)}
                    className="size-4 accent-primary"
                  />
                  Block the full day
                </label>

                <fieldset>
                  <legend className="text-xs font-medium text-muted-foreground">Block on</legend>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {writableCalendars.map((calendar) => {
                      const selected = targetCalendars.includes(calendar.id);
                      return (
                        <button
                          key={calendar.id}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => toggleTargetCalendar(calendar.id)}
                          className={cn(
                            "flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-3 text-left text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            selected
                              ? "border-ring/50 bg-accent/55"
                              : "border-border/70 bg-background/35 text-muted-foreground hover:bg-accent/25",
                          )}
                        >
                          <CalendarColor calendar={calendar} />
                          <span className="truncate">{calendar.name}</span>
                          {selected ? <Check className="ml-auto size-3.5" /> : null}
                        </button>
                      );
                    })}
                  </div>
                  {!connection.connected ? (
                    <p className="mt-2 text-xs text-amber-200/80">
                      Connect Google Calendar to choose where the blocker should go.
                    </p>
                  ) : null}
                </fieldset>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={!connection.connected || isCreating || writableCalendars.length === 0}
                >
                  {isCreating ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Plus className="size-4" />
                  )}
                  {connection.connected ? "Create blocker" : "Connect calendar first"}
                </Button>
                <p aria-live="polite" className="min-h-4 text-xs text-muted-foreground">
                  {status}
                </p>
              </div>
            </form>

            <div className="katlas-panel rounded-lg p-4">
              <h2 className="text-sm font-semibold">Visible calendars</h2>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {activeCalendars.map((calendar) => {
                  const selected = visibleCalendars.includes(calendar.id);
                  return (
                    <button
                      key={calendar.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleVisibleCalendar(calendar.id)}
                      className={cn(
                        "flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-3 text-left text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        selected
                          ? "border-border bg-background/65"
                          : "border-border/60 bg-background/25 opacity-55",
                      )}
                    >
                      <CalendarColor calendar={calendar} ring />
                      <span className="truncate">{calendar.name}</span>
                      {selected ? <Check className="ml-auto size-3.5" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="katlas-panel rounded-lg p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Bell className="size-4 text-amber-200" />
                  <h2 className="text-base font-semibold">Needs your attention</h2>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Outside bookings waiting for a routing decision.
                </p>
              </div>
              <span className="rounded-full border border-border/70 bg-background/50 px-3 py-1 text-xs text-muted-foreground">
                {queue.length} pending
              </span>
            </div>

            <div className="mt-4 grid gap-3 xl:grid-cols-2">
              {queue.length ? (
                queue.map((item) => (
                  <QueueCard
                    key={item.id}
                    item={item}
                    selectedTargets={queueTargets[item.id] ?? []}
                    onToggleTarget={(calendarId) => toggleQueueTarget(item.id, calendarId)}
                    onCopy={() => routeQueueItem(item, "event")}
                    onBlock={() => routeQueueItem(item, "blocker")}
                    onIgnore={() => ignoreQueueItem(item)}
                  />
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-border/70 p-5 text-sm text-muted-foreground xl:col-span-2">
                  All caught up.
                </div>
              )}
            </div>
          </div>

          <div className="katlas-panel rounded-lg p-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-emerald-200" />
              <h2 className="text-sm font-semibold">Routing health</h2>
            </div>
            <div className="mt-4 space-y-3">
              <HealthRow label="Outside bookings" value={queue.length ? "Review" : "Clear"} />
              <HealthRow label="Private blockers" value={blockerCount.toString()} />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function CalendarConnectionCard({
  connection,
  onRefresh,
  onDisconnect,
}: {
  connection: CalendarConnectionState;
  onRefresh: () => void;
  onDisconnect: () => void;
}) {
  return (
    <section className="katlas-panel rounded-lg p-4">
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-lg",
            connection.connected
              ? "bg-emerald-400/15 text-emerald-200"
              : "bg-blue-500/15 text-blue-200",
          )}
        >
          {connection.loading ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : connection.connected ? (
            <Check className="size-4" />
          ) : (
            <Link2 className="size-4" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Google Calendar</h2>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {connection.loading
              ? "Checking connection..."
              : connection.connected
                ? connection.account || "Connected"
                : connection.configured
                  ? "Ready to connect"
                  : "OAuth setup required"}
          </p>
        </div>
        {connection.connected ? (
          <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-1 text-[10px] font-medium text-emerald-100">
            Connected
          </span>
        ) : null}
      </div>

      {connection.error ? (
        <p className="mt-3 rounded-md border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-100">
          {connection.error}
        </p>
      ) : null}

      {!connection.loading && !connection.configured ? (
        <div className="mt-3 rounded-md border border-amber-400/20 bg-amber-400/10 p-3">
          <p className="text-xs leading-5 text-amber-100/90">
            Add the four Google Calendar variables from <code>.env.example</code>, then register
            this redirect URI in Google Cloud:
          </p>
          <code className="mt-2 block break-all rounded bg-black/25 px-2 py-1.5 text-[10px] text-amber-50">
            {connection.redirectUri}
          </code>
        </div>
      ) : null}

      <div className="mt-4 flex gap-2">
        {connection.connected ? (
          <>
            <Button type="button" size="sm" variant="outline" onClick={onRefresh}>
              <RefreshCw className="size-3.5" />
              Refresh
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onDisconnect}>
              <Unplug className="size-3.5" />
              Disconnect
            </Button>
          </>
        ) : connection.configured ? (
          <Button asChild size="sm" className="w-full">
            <a href="/api/calendar/oauth/start">
              <Link2 className="size-3.5" />
              Connect Google Calendar
            </a>
          </Button>
        ) : (
          <Button type="button" size="sm" className="w-full" disabled>
            Setup required
          </Button>
        )}
      </div>
    </section>
  );
}

function MonthGrid({
  month,
  selectedDate,
  events,
  visibleCalendars,
  calendars,
  onSelectDate,
}: {
  month: Date;
  selectedDate: string;
  events: RoutedEvent[];
  visibleCalendars: CalendarId[];
  calendars: ConnectedCalendar[];
  onSelectDate: (dateKey: string) => void;
}) {
  const days = buildVisibleMonthGrid(month);
  return (
    <div className="mt-4">
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <div key={day}>{day}</div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1">
        {days.map((day, index) => {
          if (!day) return <div key={`empty-${index}`} className="h-12 sm:h-14" />;
          const key = toDateKey(day);
          const dayEvents = events.filter(
            (event) =>
              event.date === key &&
              event.calendars.some((calendarId) => visibleCalendars.includes(calendarId)),
          );
          const selected = selectedDate === key;
          const isToday = key === todayKey;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDate(key)}
              className={cn(
                "flex h-12 cursor-pointer flex-col items-center justify-center rounded-md border border-transparent text-xs transition hover:border-border hover:bg-accent/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-14",
                selected && "border-ring/60 bg-accent/55",
              )}
            >
              <span
                className={cn(
                  "grid size-6 place-items-center rounded-full",
                  isToday && "bg-foreground font-semibold text-background",
                )}
              >
                {day.getDate()}
              </span>
              <span className="mt-1 flex h-1.5 items-center gap-0.5">
                {dayEvents.slice(0, 3).map((event) => (
                  <CalendarColor
                    key={event.id}
                    calendar={getCalendar(event.calendars[0], calendars)}
                    small
                  />
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EventCard({ event, calendars }: { event: RoutedEvent; calendars: ConnectedCalendar[] }) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/40 p-3">
      <div className="flex items-center gap-2">
        <CalendarColor calendar={getCalendar(event.calendars[0], calendars)} small />
        <span className="min-w-0 truncate text-sm font-medium">{event.title}</span>
        {event.kind === "blocker" ? (
          <ShieldCheck className="ml-auto size-3.5 text-emerald-200" />
        ) : null}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {event.start}
        {event.start !== "All day" ? `–${event.end}` : ""}
      </p>
    </div>
  );
}

function QueueCard({
  item,
  selectedTargets,
  onToggleTarget,
  onCopy,
  onBlock,
  onIgnore,
}: {
  item: QueueItem;
  selectedTargets: CalendarId[];
  onToggleTarget: (calendarId: CalendarId) => void;
  onCopy: () => void;
  onBlock: () => void;
  onIgnore: () => void;
}) {
  const sourceCalendar = getCalendar(item.sourceCalendarId);
  return (
    <article className="rounded-lg border border-border/70 bg-background/40 p-4">
      <div className="flex items-start gap-3">
        <span className={cn("mt-1 size-2.5 rounded-full", sourceCalendar.colorClass)} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">{item.title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatShortDate(parseDateKey(item.date))} · {item.start}–{item.end} · {item.source}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">{item.note}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {demoCalendars
          .filter((calendar) => calendar.id !== item.sourceCalendarId)
          .map((calendar) => {
            const selected = selectedTargets.includes(calendar.id);
            return (
              <button
                key={calendar.id}
                type="button"
                aria-pressed={selected}
                onClick={() => onToggleTarget(calendar.id)}
                className={cn(
                  "flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected
                    ? "border-ring/50 bg-accent/55"
                    : "border-border/70 text-muted-foreground",
                )}
              >
                <span className={cn("size-1.5 rounded-full", calendar.colorClass)} />
                {calendar.name}
              </button>
            );
          })}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={onBlock}>
          <ShieldCheck className="size-3.5" />
          Create blockers
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCopy}>
          <Copy className="size-3.5" />
          Copy details
        </Button>
        <Button type="button" size="sm" variant="ghost" className="ml-auto" onClick={onIgnore}>
          <X className="size-3.5" />
          Ignore
        </Button>
      </div>
    </article>
  );
}

function StatusPill({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "amber" | "emerald";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5",
        tone === "amber" && "border-amber-400/25 bg-amber-400/10",
        tone === "emerald" && "border-emerald-400/25 bg-emerald-400/10",
        tone === "default" && "border-border/70 bg-background/45",
      )}
    >
      <span className="text-muted-foreground">{label}</span>
      <strong>{value}</strong>
    </span>
  );
}

function HealthRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function CalendarColor({
  calendar,
  ring = false,
  small = false,
}: {
  calendar: ConnectedCalendar;
  ring?: boolean;
  small?: boolean;
}) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full",
        small ? "size-2" : "size-2.5",
        !calendar.backgroundColor && calendar.colorClass,
        ring && !calendar.backgroundColor && `ring-4 ${calendar.ringClass}`,
      )}
      style={{
        backgroundColor: calendar.backgroundColor,
        boxShadow:
          ring && calendar.backgroundColor ? `0 0 0 4px ${calendar.backgroundColor}33` : undefined,
      }}
    />
  );
}

function getCalendar(calendarId: CalendarId, calendars = demoCalendars) {
  return (
    calendars.find((calendar) => calendar.id === calendarId) ??
    demoCalendars.find((calendar) => calendar.id === calendarId) ??
    demoCalendars[0]
  );
}

function mergeCalendarIds(current: CalendarId[], next: CalendarId[]) {
  return Array.from(new Set([...current, ...next]));
}

function sortByStart(a: RoutedEvent, b: RoutedEvent) {
  return a.start.localeCompare(b.start);
}

function buildVisibleMonthGrid(month: Date) {
  const first = startOfMonth(month);
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const result: Array<Date | null> = Array.from({ length: first.getDay() }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1)
    result.push(new Date(first.getFullYear(), first.getMonth(), day));
  while (result.length % 7 !== 0) result.push(null);
  return result;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatMonth(date: Date) {
  return new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(date);
}

function formatFullDate(date: Date) {
  return new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(
    date,
  );
}

function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}
