import { createFileRoute } from "@tanstack/react-router";
import {
  AlignLeft,
  Bell,
  Bold,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Italic,
  Link,
  List,
  ListOrdered,
  MapPin,
  Minus,
  Plus,
  Route as RouteIcon,
  ShieldCheck,
  TextCursorInput,
  Trash2,
  Users,
  Video,
  X,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

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
  owner: string;
  role: string;
  colorClass: string;
  ringClass: string;
  hex: string;
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
    owner: "Billy Quan",
    role: "Booked calls",
    colorClass: "bg-sky-400",
    ringClass: "ring-sky-400/40",
    hex: "#38bdf8",
  },
  {
    id: "personal",
    name: "Personal",
    account: "personal@gmail.com",
    owner: "Personal",
    role: "Life blockers",
    colorClass: "bg-amber-300",
    ringClass: "ring-amber-300/40",
    hex: "#fcd34d",
  },
  {
    id: "content",
    name: "Content",
    account: "content@katlas.media",
    owner: "Content",
    role: "Shoots and posts",
    colorClass: "bg-emerald-400",
    ringClass: "ring-emerald-400/40",
    hex: "#34d399",
  },
  {
    id: "team",
    name: "Team Ops",
    account: "ops@katlas.media",
    owner: "Team Ops",
    role: "Shared visibility",
    colorClass: "bg-violet-400",
    ringClass: "ring-violet-400/40",
    hex: "#a78bfa",
  },
];

const weekDays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
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
  const [title, setTitle] = useState("");
  const [eventTab, setEventTab] = useState<"details" | "time">("details");
  const [eventType, setEventType] = useState("Event");
  const [startDate, setStartDate] = useState(todayKey);
  const [endDate, setEndDate] = useState(todayKey);
  const [startTime, setStartTime] = useState("13:30");
  const [endTime, setEndTime] = useState("14:30");
  const [allDay, setAllDay] = useState(false);
  const [repeat, setRepeat] = useState("Does not repeat");
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [location, setLocation] = useState("");
  const [notificationAmount, setNotificationAmount] = useState("30");
  const [notificationUnit, setNotificationUnit] = useState("minutes");
  const [calendarOwner, setCalendarOwner] = useState<CalendarId>("work");
  const [availability, setAvailability] = useState("Busy");
  const [visibility, setVisibility] = useState("Default visibility");
  const [description, setDescription] = useState("");
  const [guests, setGuests] = useState("");
  const [allowModify, setAllowModify] = useState(false);
  const [allowInvite, setAllowInvite] = useState(true);
  const [allowGuestList, setAllowGuestList] = useState(true);
  const [targetCalendars, setTargetCalendars] = useState<CalendarId[]>(["work"]);
  const [queueTargets, setQueueTargets] = useState<Record<string, CalendarId[]>>(() =>
    Object.fromEntries(seedQueue.map((item) => [item.id, item.recommendedTargets])),
  );
  const [status, setStatus] = useState("Ready to route.");

  const secondMonth = useMemo(() => addMonths(activeMonth, 1), [activeMonth]);
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
  const currentCalendar = getCalendar(calendarOwner);

  function selectDate(dateKey: string) {
    setSelectedDate(dateKey);
    setStartDate(dateKey);
    setEndDate(dateKey);
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

  function saveEvent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const finalTargets = targetCalendars.includes(calendarOwner)
      ? targetCalendars
      : [calendarOwner, ...targetCalendars];
    const eventTitle = title.trim() || "Untitled event";

    if (finalTargets.length === 0) {
      setStatus("Choose at least one calendar.");
      return;
    }

    const nextEvent: RoutedEvent = {
      id: `evt-${crypto.randomUUID()}`,
      title: eventTitle,
      date: startDate,
      start: allDay ? "All day" : startTime,
      end: allDay ? "All day" : endTime,
      calendars: finalTargets,
      origin: "assistant",
      kind: eventType === "Private blocker" ? "blocker" : "event",
      source: "Event Assistant",
      note: description.trim() || undefined,
      routed: true,
    };

    setEvents((current) => [...current, nextEvent]);
    setSelectedDate(startDate);
    setActiveMonth(startOfMonth(parseDateKey(startDate)));
    setTitle("");
    setDescription("");
    setGuests("");
    setStatus(
      `${eventTitle} saved to ${finalTargets.length} calendar${finalTargets.length > 1 ? "s" : ""}.`,
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
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-hero-glow" />

      <main className="katlas-page max-w-[1500px] gap-5 py-5">
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-lg border border-border/80 bg-[#050607]/88 p-4 shadow-[0_24px_100px_rgba(0,0,0,0.28)] backdrop-blur-xl md:p-6">
            <div className="flex flex-col gap-4 border-b border-border/70 pb-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-lg bg-blue-600 text-white shadow-[0_0_34px_rgba(37,99,235,0.28)]">
                    <CalendarDays className="size-5" />
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                      Event Assistant
                    </p>
                    <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
                      Calendar Planner
                    </h1>
                  </div>
                </div>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                  Select a date, review routed events, and send new meetings to the calendars that
                  need them.
                </p>
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
                    selectDate(todayKey);
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

            <div className="mt-6 rounded-2xl border border-border/80 bg-black/28 p-4 shadow-inner md:p-6">
              <div className="flex items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Previous month"
                  onClick={() => setActiveMonth(addMonths(activeMonth, -1))}
                  className="rounded-full"
                >
                  <ChevronLeft className="size-5" />
                </Button>
                <h2 className="text-center text-xl font-semibold tracking-tight">
                  {formatMonth(activeMonth)}
                </h2>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Next month"
                  onClick={() => setActiveMonth(addMonths(activeMonth, 1))}
                  className="rounded-full"
                >
                  <ChevronRight className="size-5" />
                </Button>
              </div>

              <div className="mt-7 grid gap-6 lg:grid-cols-2">
                <LargeMonth
                  month={activeMonth}
                  selectedDate={selectedDate}
                  events={events}
                  visibleCalendars={visibleCalendars}
                  onSelectDate={selectDate}
                />
                <LargeMonth
                  month={secondMonth}
                  selectedDate={selectedDate}
                  events={events}
                  visibleCalendars={visibleCalendars}
                  onSelectDate={selectDate}
                />
              </div>

              <p className="mt-6 text-center text-xs font-medium text-muted-foreground">
                Minimal planner view - built for calendar routing
              </p>
            </div>
          </div>

          <aside className="grid gap-4">
            <div className="katlas-panel rounded-lg">
              <div className="grid grid-cols-3 gap-2">
                <MetricCard label="Connected" value={connectedCalendars.length.toString()} />
                <MetricCard label="Queue" value={queue.length.toString()} tone="amber" />
                <MetricCard label="Routed" value={routedCount.toString()} tone="emerald" />
              </div>
              <div className="mt-4 space-y-2">
                {connectedCalendars.map((calendar) => {
                  const selected = visibleCalendars.includes(calendar.id);
                  return (
                    <button
                      key={calendar.id}
                      type="button"
                      onClick={() => toggleVisibleCalendar(calendar.id)}
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-3 rounded-lg border px-3 py-3 text-left transition",
                        selected
                          ? "border-ring/40 bg-background/70"
                          : "border-border/70 bg-background/35 opacity-60 hover:opacity-100",
                      )}
                    >
                      <span
                        className={cn(
                          "size-2.5 shrink-0 rounded-full ring-4",
                          calendar.colorClass,
                          calendar.ringClass,
                        )}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{calendar.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {calendar.account}
                        </span>
                      </span>
                      {selected ? <Check className="ml-auto size-4 text-muted-foreground" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="katlas-panel rounded-lg">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold tracking-tight">Selected day</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatFullDate(parseDateKey(selectedDate))}
                  </p>
                </div>
                <Clock className="size-4 text-muted-foreground" />
              </div>
              <div className="mt-4 space-y-2">
                {selectedDayEvents.length > 0 ? (
                  selectedDayEvents.map((event) => (
                    <SelectedEventCard key={event.id} event={event} />
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

        <form
          onSubmit={saveEvent}
          className="rounded-2xl border border-border/80 bg-[#f7f9fd] p-0 text-[#202124] shadow-[0_24px_100px_rgba(0,0,0,0.26)]"
        >
          <div className="flex flex-col gap-4 border-b border-[#e2e6ef] px-5 py-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 flex-1 items-start gap-4">
              <button
                type="button"
                aria-label="Clear title"
                onClick={() => setTitle("")}
                className="mt-3 grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-[#5f6368] transition hover:bg-[#e8eef8]"
              >
                <X className="size-5" />
              </button>
              <label className="min-w-0 flex-1">
                <span className="sr-only">Event title</span>
                <Input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Add title"
                  className="h-14 rounded-none border-0 border-b-4 border-[#1a73e8] bg-transparent px-0 text-3xl font-normal text-[#202124] shadow-none placeholder:text-[#3c4043] focus-visible:ring-0"
                />
              </label>
            </div>
            <Button
              type="submit"
              className="h-11 rounded-full bg-[#0b57d0] px-8 text-sm font-semibold text-white hover:bg-[#174ea6]"
            >
              Save
            </Button>
          </div>

          <div className="grid gap-8 px-6 py-6 xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-3 pl-10">
                <input
                  type="date"
                  value={startDate}
                  onChange={(event) => {
                    setStartDate(event.target.value);
                    setEndDate(event.target.value);
                    setSelectedDate(event.target.value);
                    setActiveMonth(startOfMonth(parseDateKey(event.target.value)));
                  }}
                  className="h-12 rounded-md border-0 bg-[#e9eef6] px-4 text-sm text-[#202124] outline-none"
                />
                <input
                  type="time"
                  value={startTime}
                  disabled={allDay}
                  onChange={(event) => setStartTime(event.target.value)}
                  className="h-12 rounded-md border-0 bg-[#e9eef6] px-4 text-sm text-[#202124] outline-none disabled:opacity-50"
                />
                <span className="text-sm text-[#3c4043]">to</span>
                <input
                  type="time"
                  value={endTime}
                  disabled={allDay}
                  onChange={(event) => setEndTime(event.target.value)}
                  className="h-12 rounded-md border-0 bg-[#e9eef6] px-4 text-sm text-[#202124] outline-none disabled:opacity-50"
                />
                <input
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  className="h-12 rounded-md border-0 bg-[#e9eef6] px-4 text-sm text-[#202124] outline-none"
                />
                <button
                  type="button"
                  className="h-10 rounded-md px-3 text-sm font-semibold text-[#0b57d0] transition hover:bg-[#e8f0fe]"
                >
                  Time zone
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-3 pl-10">
                <label className="inline-flex cursor-pointer items-center gap-3 text-sm text-[#3c4043]">
                  <input
                    type="checkbox"
                    checked={allDay}
                    onChange={(event) => setAllDay(event.target.checked)}
                    className="size-5 accent-[#0b57d0]"
                  />
                  All day
                </label>
                <Select value={repeat} onValueChange={setRepeat}>
                  <SelectTrigger className="h-12 w-[220px] border-0 bg-[#e9eef6] text-[#202124] shadow-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Does not repeat">Does not repeat</SelectItem>
                    <SelectItem value="Daily">Daily</SelectItem>
                    <SelectItem value="Weekly on this day">Weekly on this day</SelectItem>
                    <SelectItem value="Monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-3xl bg-white p-5 shadow-[0_18px_60px_rgba(60,64,67,0.12)]">
                <div className="flex border-b border-[#dadce0] text-sm font-medium">
                  <button
                    type="button"
                    onClick={() => setEventTab("details")}
                    className={cn(
                      "relative px-3 pb-4 text-[#3c4043]",
                      eventTab === "details" && "text-[#0b57d0]",
                    )}
                  >
                    Event details
                    {eventTab === "details" ? (
                      <span className="absolute inset-x-0 bottom-0 h-1 rounded-t-full bg-[#0b57d0]" />
                    ) : null}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEventTab("time")}
                    className={cn(
                      "relative px-5 pb-4 text-[#3c4043]",
                      eventTab === "time" && "text-[#0b57d0]",
                    )}
                  >
                    Find a time
                    {eventTab === "time" ? (
                      <span className="absolute inset-x-0 bottom-0 h-1 rounded-t-full bg-[#0b57d0]" />
                    ) : null}
                  </button>
                </div>

                {eventTab === "details" ? (
                  <div className="mt-5 space-y-4">
                    <EditorRow icon={<Video className="size-5 text-[#fbbc04]" />}>
                      <button
                        type="button"
                        onClick={() => setVideoEnabled((current) => !current)}
                        className={cn(
                          "w-full rounded-md px-4 py-3 text-left text-sm transition",
                          videoEnabled
                            ? "bg-[#e8f0fe] text-[#0b57d0]"
                            : "bg-transparent text-[#3c4043]",
                        )}
                      >
                        {videoEnabled ? "Video conferencing added" : "Add video conferencing"}
                      </button>
                    </EditorRow>

                    <EditorRow icon={<MapPin className="size-5 text-[#5f6368]" />}>
                      <Input
                        value={location}
                        onChange={(event) => setLocation(event.target.value)}
                        placeholder="Add location"
                        className="h-12 border-0 bg-[#e9eef6] text-[#202124] shadow-none placeholder:text-[#5f6368] focus-visible:ring-1 focus-visible:ring-[#1a73e8]"
                      />
                    </EditorRow>

                    <EditorRow icon={<Bell className="size-5 text-[#5f6368]" />}>
                      <div className="flex flex-wrap items-center gap-2">
                        <Select value="Notification">
                          <SelectTrigger className="h-12 w-[180px] border-0 bg-[#e9eef6] text-[#202124] shadow-none">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Notification">Notification</SelectItem>
                            <SelectItem value="Email">Email</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          value={notificationAmount}
                          onChange={(event) => setNotificationAmount(event.target.value)}
                          className="h-12 w-24 border-0 bg-[#e9eef6] text-[#202124] shadow-none"
                        />
                        <Select value={notificationUnit} onValueChange={setNotificationUnit}>
                          <SelectTrigger className="h-12 w-[150px] border-0 bg-[#e9eef6] text-[#202124] shadow-none">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="minutes">minutes</SelectItem>
                            <SelectItem value="hours">hours</SelectItem>
                            <SelectItem value="days">days</SelectItem>
                          </SelectContent>
                        </Select>
                        <button
                          type="button"
                          className="grid size-10 cursor-pointer place-items-center rounded-full text-[#5f6368] transition hover:bg-[#eef2f7]"
                          aria-label="Remove notification"
                        >
                          <X className="size-5" />
                        </button>
                      </div>
                    </EditorRow>

                    <EditorRow icon={<CalendarDays className="size-5 text-[#5f6368]" />}>
                      <div className="flex flex-wrap items-center gap-2">
                        <Select
                          value={calendarOwner}
                          onValueChange={(value) => {
                            const nextCalendar = value as CalendarId;
                            setCalendarOwner(nextCalendar);
                            if (!targetCalendars.includes(nextCalendar)) {
                              setTargetCalendars((current) => [...current, nextCalendar]);
                            }
                          }}
                        >
                          <SelectTrigger className="h-12 w-[180px] border-0 bg-transparent text-[#202124] shadow-none">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {connectedCalendars.map((calendar) => (
                              <SelectItem key={calendar.id} value={calendar.id}>
                                {calendar.owner}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <button
                          type="button"
                          className="inline-flex h-12 cursor-pointer items-center gap-3 rounded-md bg-[#e9eef6] px-4 text-sm text-[#202124]"
                        >
                          <span
                            className="size-5 rounded-full"
                            style={{ backgroundColor: currentCalendar.hex }}
                          />
                          <ChevronDown className="size-4 text-[#5f6368]" />
                        </button>
                      </div>
                    </EditorRow>

                    <EditorRow icon={<TextCursorInput className="size-5 text-[#5f6368]" />}>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Select value={availability} onValueChange={setAvailability}>
                          <SelectTrigger className="h-12 border-0 bg-[#e9eef6] text-[#202124] shadow-none">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Busy">Busy</SelectItem>
                            <SelectItem value="Free">Free</SelectItem>
                          </SelectContent>
                        </Select>
                        <Select value={visibility} onValueChange={setVisibility}>
                          <SelectTrigger className="h-12 border-0 bg-[#e9eef6] text-[#202124] shadow-none">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Default visibility">Default visibility</SelectItem>
                            <SelectItem value="Public">Public</SelectItem>
                            <SelectItem value="Private">Private</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </EditorRow>

                    <EditorRow icon={<AlignLeft className="size-5 text-[#5f6368]" />}>
                      <div className="rounded-md bg-[#e9eef6]">
                        <div className="flex flex-wrap items-center gap-1 border-b border-[#d2d8e2] px-3 py-2 text-[#3c4043]">
                          <IconButton label="Attach file" icon={<RouteIcon className="size-4" />} />
                          <IconButton label="Bold" icon={<Bold className="size-4" />} />
                          <IconButton label="Italic" icon={<Italic className="size-4" />} />
                          <IconButton label="Underline" icon={<Minus className="size-4" />} />
                          <IconButton
                            label="Numbered list"
                            icon={<ListOrdered className="size-4" />}
                          />
                          <IconButton label="Bulleted list" icon={<List className="size-4" />} />
                          <IconButton label="Link" icon={<Link className="size-4" />} />
                          <IconButton
                            label="Remove formatting"
                            icon={<Trash2 className="size-4" />}
                          />
                        </div>
                        <textarea
                          value={description}
                          onChange={(event) => setDescription(event.target.value)}
                          placeholder="Add description"
                          className="min-h-[210px] w-full resize-y rounded-b-md border-0 bg-transparent px-4 py-4 text-sm text-[#202124] outline-none placeholder:text-[#5f6368]"
                        />
                      </div>
                    </EditorRow>
                  </div>
                ) : (
                  <div className="mt-5 rounded-lg border border-[#dadce0] bg-[#f8fafd] p-5 text-sm text-[#5f6368]">
                    Availability preview will compare selected calendars once Google accounts are
                    connected.
                  </div>
                )}
              </div>
            </div>

            <aside className="space-y-5">
              <div>
                <h3 className="border-b-2 border-[#dadce0] pb-4 text-sm font-semibold text-[#0b57d0]">
                  Guests
                </h3>
                <Input
                  value={guests}
                  onChange={(event) => setGuests(event.target.value)}
                  placeholder="Add guests"
                  className="mt-4 h-12 border-0 bg-[#e9eef6] text-[#202124] shadow-none placeholder:text-[#5f6368]"
                />
              </div>

              <div>
                <p className="text-sm font-medium text-[#202124]">Guest permissions</p>
                <div className="mt-4 space-y-4">
                  <PermissionCheck
                    label="Modify event"
                    checked={allowModify}
                    onChange={setAllowModify}
                  />
                  <PermissionCheck
                    label="Invite others"
                    checked={allowInvite}
                    onChange={setAllowInvite}
                  />
                  <PermissionCheck
                    label="See guest list"
                    checked={allowGuestList}
                    onChange={setAllowGuestList}
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-[#e0e5ee] bg-white p-4">
                <div className="flex items-center gap-2">
                  <Users className="size-4 text-[#5f6368]" />
                  <h3 className="text-sm font-semibold text-[#202124]">Put on calendars</h3>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  {connectedCalendars.map((calendar) => {
                    const selected = targetCalendars.includes(calendar.id);
                    return (
                      <button
                        key={calendar.id}
                        type="button"
                        onClick={() => toggleTargetCalendar(calendar.id)}
                        className={cn(
                          "flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition",
                          selected
                            ? "border-[#1a73e8]/50 bg-[#e8f0fe] text-[#202124]"
                            : "border-[#e0e5ee] bg-white text-[#5f6368] hover:bg-[#f2f6fc]",
                        )}
                      >
                        <span
                          className={cn("size-2.5 shrink-0 rounded-full", calendar.colorClass)}
                        />
                        <span className="min-w-0 truncate">{calendar.name}</span>
                        {selected ? <Check className="ml-auto size-4 text-[#0b57d0]" /> : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-2xl border border-[#e0e5ee] bg-white p-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-[#0b57d0]" />
                  <h3 className="text-sm font-semibold text-[#202124]">Routing status</h3>
                </div>
                <p className="mt-3 text-sm leading-6 text-[#5f6368]">{status}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[#5f6368]">
                  <span className="rounded-md bg-[#f1f4f9] px-3 py-2">{queue.length} pending</span>
                  <span className="rounded-md bg-[#f1f4f9] px-3 py-2">{blockerCount} blockers</span>
                </div>
              </div>
            </aside>
          </div>
        </form>

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

function LargeMonth({
  month,
  selectedDate,
  events,
  visibleCalendars,
  onSelectDate,
}: {
  month: Date;
  selectedDate: string;
  events: RoutedEvent[];
  visibleCalendars: CalendarId[];
  onSelectDate: (dateKey: string) => void;
}) {
  const monthDays = buildVisibleMonthGrid(month);

  return (
    <section>
      <h3 className="text-center text-lg font-semibold tracking-tight">{formatMonth(month)}</h3>
      <div className="mt-5 grid grid-cols-7 gap-2 text-center text-sm font-semibold text-muted-foreground">
        {weekDays.map((day) => (
          <div key={day}>{day}</div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-7 gap-2">
        {monthDays.map((day, index) => {
          if (!day)
            return <div key={`empty-${month.getMonth()}-${index}`} className="h-16 sm:h-[72px]" />;

          const key = toDateKey(day);
          const dayEvents = events
            .filter((event) => event.date === key)
            .filter((event) =>
              event.calendars.some((calendarId) => visibleCalendars.includes(calendarId)),
            )
            .sort(sortByStart);
          const selected = selectedDate === key;
          const isToday = key === todayKey;

          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDate(key)}
              className={cn(
                "h-16 cursor-pointer rounded-lg border border-border/75 bg-black/30 p-2 text-left transition hover:border-ring/50 hover:bg-accent/25 sm:h-[72px]",
                selected && "border-ring/60 bg-accent/45 shadow-[0_0_0_1px_var(--ring)]",
              )}
            >
              <span className="flex h-full flex-col items-center justify-center gap-1 text-center">
                <span
                  className={cn(
                    "grid size-8 place-items-center rounded-full text-lg font-semibold",
                    isToday && "bg-foreground text-background",
                  )}
                >
                  {day.getDate()}
                </span>
                <span className="min-h-4 text-[11px] font-medium leading-none text-muted-foreground">
                  {dayEvents.length > 0
                    ? dayEvents.length === 1
                      ? "Event"
                      : `${dayEvents.length} Events`
                    : "-"}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function EditorRow({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-4 md:grid-cols-[28px_minmax(0,1fr)] md:items-start">
      <div className="mt-3 hidden justify-center md:flex">{icon}</div>
      <div>{children}</div>
    </div>
  );
}

function IconButton({ label, icon }: { label: string; icon: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="grid size-8 cursor-pointer place-items-center rounded-md transition hover:bg-[#dce3ed]"
    >
      {icon}
    </button>
  );
}

function PermissionCheck({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 text-sm text-[#3c4043]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-5 accent-[#0b57d0]"
      />
      {label}
    </label>
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
      <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function SelectedEventCard({ event }: { event: RoutedEvent }) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/55 p-3">
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
            {formatShortDate(parseDateKey(item.date))} - {item.start} to {item.end}
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

function buildVisibleMonthGrid(month: Date) {
  const firstDay = startOfMonth(month);
  const days: Array<Date | null> = Array.from({ length: firstDay.getDay() }, () => null);
  const cursor = new Date(firstDay);
  while (cursor.getMonth() === month.getMonth()) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
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
