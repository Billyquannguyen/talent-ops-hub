import {
  BookOpen,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  FileText,
  MessageSquareText,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { TopBar } from "@/components/TopBar";

const handbookSections = [
  {
    title: "Company Foundation",
    icon: Building2,
    summary:
      "This is where the basic identity of Katlas Media should live. A new employee should be able to read this section and understand what the company does, who it serves, which markets matter, and how the company describes itself.",
    content:
      "Later we can fill this with the company story, mission, service positioning, main markets, public links, important contacts, and any context that helps someone explain Katlas clearly in one or two minutes.",
    prompts: "Company description, mission, markets, public links, key contacts, timezone.",
  },
  {
    title: "Business And Services",
    icon: BriefcaseBusiness,
    summary:
      "This section should explain what Katlas sells and how campaigns are usually structured. It should help a new employee understand client expectations before they start sourcing creators or replying to messages.",
    content:
      "This can include core services, campaign types, common creator deliverables, usage rights, payment expectations, reporting expectations, and what a good campaign outcome looks like from Katlas' point of view.",
    prompts: "Services, campaign types, deliverables, usage rights, pricing context, reporting.",
  },
  {
    title: "How Work Gets Done",
    icon: CheckCircle2,
    summary:
      "This is the operational playbook. It should describe how work moves from client brief to creator sourcing, outreach, negotiation, approval, content live, payment, and reporting.",
    content:
      "The goal is to make handoffs clear. A new employee should know what happens first, what information needs to be captured, who needs to be updated, and where campaign records should be maintained.",
    prompts: "Workflow stages, ownership, handoffs, approvals, escalation, status rules.",
  },
  {
    title: "People, Communication, And Tools",
    icon: UsersRound,
    summary:
      "This section should help someone function inside the company day to day. It should answer who to ask, where to communicate, which tools matter, and where important files are stored.",
    content:
      "This can include internal roles, preferred communication channels, response-time expectations, account setup notes, folder structure, template locations, and work habits that keep everyone aligned.",
    prompts: "Team roles, communication rules, tools, folders, templates, account access.",
  },
  {
    title: "Standards And Boundaries",
    icon: ShieldCheck,
    summary:
      "This section should define the quality bar and the rules of the road. It should make clear what good work looks like and what should never be missed when dealing with creators, clients, data, payments, and usage rights.",
    content:
      "Later this can hold creator quality standards, client-facing standards, file naming rules, privacy notes, payment boundaries, revision expectations, and anything sensitive that a new employee must know before doing live work.",
    prompts: "Quality standards, policies, privacy, payments, usage rights, client-ready rules.",
  },
];

export function AboutKatlasMedia() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <TopBar />
      <div className="absolute inset-x-0 top-0 h-[360px] bg-hero-glow pointer-events-none" />

      <main className="relative mx-auto flex w-full max-w-5xl flex-col gap-5 px-5 py-6">
        <section className="rounded-2xl border border-border bg-card/60 p-5 md:p-7">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                About Katlas Media
              </p>
              <h1 className="mt-3 text-3xl font-medium leading-tight tracking-tight md:text-4xl">
                Company handbook for new employees.
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                A single place for the company context someone needs before they start working: what
                Katlas does, how campaigns move, who owns what, which tools matter, and what
                standards should not be missed.
              </p>
            </div>
            <div className="grid w-full gap-0 border-y border-border py-4 sm:grid-cols-2 lg:max-w-sm">
              <Metric label="Status" value="Ready To Fill" />
              <Metric label="Format" value="Handbook" />
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-start gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground">
              <BookOpen className="size-4" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">What This Page Should Answer</h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                This page should feel like the first document a new employee reads after joining
                Katlas. It should be practical, not decorative. When you send the real company
                information, I’ll turn it into clear sections with enough context to be useful, not
                tiny disconnected notes.
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-4">
          {handbookSections.map((section) => (
            <HandbookSection key={section.title} section={section} />
          ))}
        </section>

        <section className="rounded-lg border border-dashed border-border bg-card/50 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <FileText className="size-4 text-muted-foreground" />
                <h2 className="text-base font-semibold">Ready For The Real Katlas Info</h2>
              </div>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                Send the company information whenever you are ready. I’ll extract it into these
                larger sections so the page reads like an onboarding handbook instead of a
                placeholder dashboard.
              </p>
            </div>
            <span className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground">
              Draft Structure
            </span>
          </div>
        </section>
      </main>
    </div>
  );
}

function HandbookSection({
  section,
}: {
  section: {
    title: string;
    icon: LucideIcon;
    summary: string;
    content: string;
    prompts: string;
  };
}) {
  const Icon = section.icon;

  return (
    <article className="rounded-lg border border-border bg-card p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <div className="grid size-10 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground">
          <Icon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold">{section.title}</h2>
          <p className="mt-3 text-sm leading-7 text-foreground/85">{section.summary}</p>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">{section.content}</p>
          <div className="mt-5 rounded-lg border border-border bg-background p-4">
            <div className="flex items-center gap-2">
              <MessageSquareText className="size-4 text-muted-foreground" />
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Content To Add Later
              </p>
            </div>
            <p className="mt-2 text-sm leading-6">{section.prompts}</p>
          </div>
        </div>
      </div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r border-border px-4 first:pl-0 last:border-r-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}
