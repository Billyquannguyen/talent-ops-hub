import { createFileRoute } from "@tanstack/react-router";
import {
  Bell,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  Copy,
  Eye,
  Plus,
  Route as RouteIcon,
  ShieldCheck,
  Video,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/calendar")({
  component: EventAssistant,
});

type CalendarId = "work" | "personal" | "content" | "team";
type EventOrigin = "assistant" | "external";
type EventKind = "event" | "blocker";

type ConnectedCalendar = {
  id: CalendarId;
  name: string;
  account: string;
  role: string;
  colorClass: string;
  ringClass: string;
};

type RoutedEvent = {
  id: string;
  title: string;
  date: string;
  start: string;
  end: string;
  calendars: CalendarId[];
  origin: EventOrigin;
  kind: EventKind;
  source: string;
  note?: string;
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

const connectedCalendars: ConnectedCalendar[] = [
  {
    id: "work",
    name: "Work",
    account: "work@company.com",
    role: "Booked calls",
    colorClass: "bg-sky-400",
    ringClass: "ring-sky-400/40",
  },
  {
    id: "personal",
    name: "Personal",
    account: "personal@gmail.com",
    role: "Life blockers",
    colorClass: "bg-amber-300",
    ringClass: "ring-amber-300/40",
  },
  {
    id: "content",
    name: "Content",
    account: "content@katlas.media",
    role: "Shoots and posts",
    colorClass: "bg-emerald-400",
    ringClass: "ring-emerald-400/40",
  },
  {
    id: "team",
    name: "Team Ops",
    account: "ops@katlas.media",
    role: "Shared visibility",
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
  {
    id: "evt-5",
    title: "Subscribed: Beauty Expo",
    date: toDateKey(addDays(today, 8)),
    start: "12:00",
    end: "13:00",
    calendars: ["content"],
    origin: "external",
    kind: "event",
    source: "Industry calendar",
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
  {
    id: "queue-2",
    sourceEventId: "evt-5",
    title: "Subscribed: Beauty Expo",
    sourceCalendarId: "content",
    date: toDateKey(addDays(today, 8)),
    start: "12:00",
    end: "13:00",
    source: "Industry calendar",
    recommendedTargets: ["work", "team"],
    note: "Subscription event may affect campaign planning.",
  },
];

function EventAssistant() {
  const [activeMonth, setActiveMonth] = useState(() => startOfMonth(today));
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [events, setEvents] = useState<RoutedEvent[]>(seedEvents);
  const [queue, setQueue] = useState<QueueItem[]>(seedQueue);
  const [visibleCalendars, setVisibleCalendars] = useState<CalendarId[]>(
    connectedCalendars.map((calendar) => calendar.id),
  );
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventType, setNewEventType] = useState("Client meeting");
  const [newEventDate, setNewEventDate] = useState(todayKey);
  const [newEventStart, setNewEventStart] = useState("09:30");
  const [newEventEnd, setNewEventEnd] = useState("10:00");
  const [newEventTargets, setNewEventTargets] = useState<CalendarId[]>(["work"]);
  const [queueTargets, setQueueTargets] = useState<Record<string, CalendarId[]>>(() =>
    Object.fromEntries(seedQueue.map((item) => [item.id, item.recommendedTargets])),
  );
  const [status, setStatus] = useState("Assistant ready.");

  const monthDays = useMemo(() => buildMonthGrid(activeMonth), [activeMonth]);
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

  const routedCount = events.filter((event) => event.routed).length;
  const blockerCount = events.filter((event) => event.kind === "blocker").length;

  function toggleVisibleCalendar(calendarId: CalendarId) {
    setVisibleCalendars((current) =>
      current.includes(calendarId)
        ? current.filter((id) => id !== calendarId)
        : [...current, calendarId],
    );
  }

  function toggleNewEventTarget(calendarId: CalendarId) {
    setNewEventTargets((current) =>
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

  function submitNewEvent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = newEventTitle.trim() || newEventType;
    if (newEventTargets.length === 0) {
      setStatus("Choose at least one target calendar.");
      return;
    }

    const nextEvent: RoutedEvent = {
      id: `evt-${crypto.randomUUID()}`,
      title,
      date: newEventDate,
      start: newEventStart,
      end: newEventEnd,
      calendars: newEventTargets,
      origin: "assistant",
      kind: newEventType === "Private blocker" ? "blocker" : "event",
      source: "Event Assistant",
      routed: true,
    };

    setEvents((current) => [...current, nextEvent]);
    setSelectedDate(newEventDate);
    setActiveMonth(startOfMonth(parseDateKey(newEventDate)));
    setNewEventTitle("");
    setStatus(
      `${title} routed to ${newEventTargets.length} calendar${newEventTargets.length > 1 ? "s" : ""}.`,
    );
  }

  function routeQueueItem(item: QueueItem, mode: EventKind) {
    const targets = queueTargets[item.id] ?? [];
    if (targets.length === 0) {
      setStatus("Choose at least one target calendar for the queue item.");
      return;
    }

    if (mode === "event") {
      setEvents((current) =>
        current.map((event) =>
          event.id === item.sourceEventId
            ? {
                ...event,
                calendars: mergeCalendarIds(event.calendars, targets),
                routed: true,
              }
            : event,
        ),
      );
    } else {
      setEvents((current) => [
        ...current,
        {
          id: `evt-${crypto.randomUUID()}`,
          title: `Blocked: ${item.title}`,
          date: item.date,
          start: item.start,
          end: item.end,
          calendars: targets,
          origin: "assistant",
          kind: "blocker",
          source: `${item.source} review`,
          note: `Created from ${item.title}`,
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
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[360px] bg-hero-glow" />

      <main className="katlas-page max-w-7xl gap-4 py-5">
        <section className="katlas-hero-panel rounded-lg p-5 md:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                <CalendarDays className="size-3.5" />
                Event Assistant
              </div>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight md:text-3xl">
                Route meetings without turning your calendars into a mess.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                Create events once, choose the calendars that need them, and review outside bookings
                before they become blockers or shared events.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:min-w-[360px]">
              <MetricCard label="Connected" value={connectedCalendars.length.toString()} />
              <MetricCard label="Queue" value={queue.length.toString()} tone="amber" />
              <MetricCard label="Routed" value={routedCount.toString()} tone="emerald" />
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="katlas-panel rounded-lg p-0">
            <div className="flex flex-col gap-3 border-b border-border/70 p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <div className="katlas-panel-icon rounded-md">
                    <RouteIcon className="size-4" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold tracking-tight">Calendar board</h2>
                    <p className="text-xs text-muted-foreground">{formatMonth(activeMonth)}</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
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
                    setSelectedDate(todayKey);
                    setNewEventDate(todayKey);
                  }}
                >
                  Today
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Next month"
                  onClick={() => setActiveMonth(addMonths(activeMonth, 1))}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>

            <div className="border-b border-border/70 p-4">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {connectedCalendars.map((calendar) => {
                  const selected = visibleCalendars.includes(calendar.id);
                  return (
                    <button
                      key={calendar.id}
                      type="button"
                      onClick={() => toggleVisibleCalendar(calendar.id)}
                      className={cn(
                        "flex min-h-[72px] cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 text-left transition",
                        selected
                          ? "border-ring/40 bg-background/70"
                          : "border-border/70 bg-background/35 opacity-60 hover:opacity-100",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-1 size-2.5 shrink-0 rounded-full ring-4",
                          calendar.colorClass,
                          calendar.ringClass,
                        )}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{calendar.name}</span>
                        <span className="mt-1 block truncate text-xs text-muted-foreground">
                          {calendar.account}
                        </span>
                        <span className="mt-1 block text-[11px] text-muted-foreground/75">
                          {calendar.role}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="overflow-x-auto p-4">
              <div className="min-w-[760px]">
                <div className="grid grid-cols-7 border-b border-border/70 pb-2 text-center text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                    <div key={day}>{day}</div>
                  ))}
                </div>
                <div className="mt-2 grid grid-cols-7 overflow-hidden rounded-lg border border-border/70 bg-background/35">
                  {monthDays.map((day) => {
                    const key = toDateKey(day);
                    const dayEvents = events
                      .filter((event) => event.date === key)
                      .filter((event) =>
                        event.calendars.some((calendarId) => visibleCalendars.includes(calendarId)),
                      )
                      .sort(sortByStart);
                    const inMonth = day.getMonth() === activeMonth.getMonth();
                    const selected = selectedDate === key;
                    const isToday = key === todayKey;

                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          setSelectedDate(key);
                          setNewEventDate(key);
                        }}
                        className={cn(
                          "min-h-[126px] border-b border-r border-border/55 p-2 text-left align-top transition hover:bg-accent/35",
                          !inMonth && "bg-background/25 text-muted-foreground/50",
                          selected && "bg-accent/45 ring-1 ring-inset ring-ring/40",
                        )}
                      >
                        <span className="flex items-center justify-between">
                          <span
                            className={cn(
                              "grid size-7 place-items-center rounded-full text-xs font-medium",
                              isToday && "bg-foreground text-background",
                            )}
                          >
                            {day.getDate()}
                          </span>
                          {dayEvents.length > 0 ? (
                            <span className="text-[10px] text-muted-foreground">
                              {dayEvents.length}
                            </span>
                          ) : null}
                        </span>

                        <span className="mt-2 flex flex-col gap-1.5">
                          {dayEvents.slice(0, 3).map((event) => (
                            <EventChip key={event.id} event={event} />
                          ))}
                          {dayEvents.length > 3 ? (
                            <span className="rounded-md border border-border/60 bg-card/80 px-2 py-1 text-[11px] text-muted-foreground">
                              +{dayEvents.length - 3} more
                            </span>
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <aside className="flex flex-col gap-4">
            <form onSubmit={submitNewEvent} className="katlas-panel rounded-lg">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold tracking-tight">Add event</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Create once, route by calendar.
                  </p>
                </div>
                <div className="katlas-panel-icon rounded-md">
                  <Plus className="size-4" />
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <label className="block text-xs font-medium text-muted-foreground">
                  Title
                  <Input
                    className="mt-1"
                    value={newEventTitle}
                    onChange={(event) => setNewEventTitle(event.target.value)}
                    placeholder="Client meeting"
                  />
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-xs font-medium text-muted-foreground">
                    Type
                    <Select value={newEventType} onValueChange={setNewEventType}>
                      <SelectTrigger className="mt-1 bg-background/70">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Client meeting">Client meeting</SelectItem>
                        <SelectItem value="Creator shoot">Creator shoot</SelectItem>
                        <SelectItem value="Content review">Content review</SelectItem>
                        <SelectItem value="Private blocker">Private blocker</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="block text-xs font-medium text-muted-foreground">
                    Date
                    <Input
                      className="mt-1"
                      type="date"
                      value={newEventDate}
                      onChange={(event) => {
                        setNewEventDate(event.target.value);
                        setSelectedDate(event.target.value);
                        setActiveMonth(startOfMonth(parseDateKey(event.target.value)));
                      }}
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-xs font-medium text-muted-foreground">
                    Start
                    <Input
                      className="mt-1"
                      type="time"
                      value={newEventStart}
                      onChange={(event) => setNewEventStart(event.target.value)}
                    />
                  </label>
                  <label className="block text-xs font-medium text-muted-foreground">
                    End
                    <Input
                      className="mt-1"
                      type="time"
                      value={newEventEnd}
                      onChange={(event) => setNewEventEnd(event.target.value)}
                    />
                  </label>
                </div>

                <CalendarToggleGroup
                  label="Put on calendars"
                  selected={newEventTargets}
                  onToggle={toggleNewEventTarget}
                />

                <Button type="submit" className="w-full">
                  <RouteIcon className="size-4" />
                  Route event
                </Button>
              </div>
            </form>

            <div className="katlas-panel rounded-lg">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold tracking-tight">Selected day</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatFullDate(parseDateKey(selectedDate))}
                  </p>
                </div>
                <div className="katlas-panel-icon rounded-md">
                  <Eye className="size-4" />
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {selectedDayEvents.length > 0 ? (
                  selectedDayEvents.map((event) => (
                    <div
                      key={event.id}
                      className="rounded-lg border border-border/70 bg-background/55 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{event.title}</p>
                          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Clock className="size-3.5" />
                            {event.start} - {event.end}
                          </p>
                        </div>
                        {event.kind === "blocker" ? (
                          <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2 py-0.5 text-[10px] text-amber-100">
                            Block
                          </span>
                        ) : null}
                      </div>
                      <CalendarDots calendarIds={event.calendars} className="mt-3" />
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-border/70 bg-background/35 p-4 text-sm text-muted-foreground">
                    No visible events.
                  </div>
                )}
              </div>
            </div>
          </aside>
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="katlas-panel rounded-lg">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Bell className="size-4 text-amber-200" />
                  <h2 className="text-base font-semibold tracking-tight">Notification queue</h2>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Outside events waiting for a routing decision.
                </p>
              </div>
              <span className="w-fit rounded-full border border-border/70 bg-background/50 px-3 py-1 text-xs text-muted-foreground">
                {queue.length} pending
              </span>
            </div>

            <div className="mt-4 grid gap-3 xl:grid-cols-2">
              {queue.length > 0 ? (
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
                <div className="rounded-lg border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground xl:col-span-2">
                  Queue cleared.
                </div>
              )}
            </div>
          </div>

          <div className="katlas-panel rounded-lg">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-emerald-200" />
              <h2 className="text-base font-semibold tracking-tight">Routing health</h2>
            </div>
            <div className="mt-4 space-y-3">
              <HealthRow label="External events" value={queue.length ? "Needs review" : "Clear"} />
              <HealthRow label="Private blockers" value={blockerCount.toString()} />
              <HealthRow label="Last action" value={status} />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "amber" | "emerald";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border/80 bg-background/55 p-3",
        tone === "amber" && "border-amber-300/25 bg-amber-300/10",
        tone === "emerald" && "border-emerald-300/25 bg-emerald-300/10",
      )}
    >
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function EventChip({ event }: { event: RoutedEvent }) {
  return (
    <span className="rounded-md border border-border/60 bg-card/90 px-2 py-1 text-[11px] text-foreground shadow-sm">
      <span className="flex min-w-0 items-center gap-1.5">
        {event.kind === "blocker" ? (
          <Circle className="size-2.5 fill-amber-200 text-amber-200" />
        ) : (
          <Video className="size-3 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate">{event.start}</span>
        <span className="truncate">{event.title}</span>
      </span>
      <CalendarDots calendarIds={event.calendars} className="mt-1.5" />
    </span>
  );
}

function CalendarToggleGroup({
  label,
  selected,
  onToggle,
}: {
  label: string;
  selected: CalendarId[];
  onToggle: (calendarId: CalendarId) => void;
}) {
  return (
    <fieldset>
      <legend className="text-xs font-medium text-muted-foreground">{label}</legend>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {connectedCalendars.map((calendar) => {
          const isSelected = selected.includes(calendar.id);
          return (
            <button
              key={calendar.id}
              type="button"
              onClick={() => onToggle(calendar.id)}
              className={cn(
                "flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-left text-xs transition",
                isSelected
                  ? "border-ring/40 bg-accent/55 text-foreground"
                  : "border-border/70 bg-background/40 text-muted-foreground hover:bg-accent/30 hover:text-foreground",
              )}
            >
              <span className={cn("size-2.5 shrink-0 rounded-full", calendar.colorClass)} />
              <span className="min-w-0 truncate">{calendar.name}</span>
              {isSelected ? <Check className="ml-auto size-3.5 shrink-0" /> : null}
            </button>
          );
        })}
      </div>
    </fieldset>
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
    <article className="rounded-lg border border-border/70 bg-background/55 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className={cn("size-2.5 rounded-full", sourceCalendar.colorClass)} />
            <span className="truncate">{item.source}</span>
          </div>
          <h3 className="mt-2 truncate text-sm font-semibold">{item.title}</h3>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="size-3.5" />
            {formatShortDate(parseDateKey(item.date))} · {item.start} - {item.end}
          </p>
        </div>
        <button
          type="button"
          aria-label="Ignore queue item"
          onClick={onIgnore}
          className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-md border border-border/70 bg-card/60 text-muted-foreground transition hover:bg-card hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <p className="mt-3 rounded-md border border-border/60 bg-card/55 px-3 py-2 text-xs leading-5 text-muted-foreground">
        {item.note}
      </p>

      <div className="mt-3">
        <CalendarToggleGroup
          label="Target calendars"
          selected={selectedTargets}
          onToggle={onToggleTarget}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onBlock}>
          <ShieldCheck className="size-3.5" />
          Block
        </Button>
        <Button type="button" size="sm" onClick={onCopy}>
          <Copy className="size-3.5" />
          Copy
        </Button>
      </div>
    </article>
  );
}

function CalendarDots({
  calendarIds,
  className,
}: {
  calendarIds: CalendarId[];
  className?: string;
}) {
  return (
    <span className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {calendarIds.map((calendarId) => {
        const calendar = getCalendar(calendarId);
        return (
          <span
            key={calendarId}
            className="flex items-center gap-1 rounded-full bg-background/50 px-1.5 py-0.5"
          >
            <span className={cn("size-1.5 rounded-full", calendar.colorClass)} />
            <span className="text-[10px] text-muted-foreground">{calendar.name}</span>
          </span>
        );
      })}
    </span>
  );
}

function HealthRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/50 p-3">
      <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm text-foreground">{value}</p>
    </div>
  );
}

function getCalendar(calendarId: CalendarId) {
  return connectedCalendars.find((calendar) => calendar.id === calendarId) ?? connectedCalendars[0];
}

function mergeCalendarIds(current: CalendarId[], next: CalendarId[]) {
  return Array.from(new Set([...current, ...next]));
}

function sortByStart(a: RoutedEvent, b: RoutedEvent) {
  return a.start.localeCompare(b.start);
}

function buildMonthGrid(month: Date) {
  const firstDay = startOfMonth(month);
  const start = addDays(firstDay, -firstDay.getDay());
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
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
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
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
  return new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}
