import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  ExternalLink,
  FileText,
  Flag,
  MessageSquareWarning,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { TopBar } from "@/components/TopBar";

const PROGRESS_STORAGE_KEY = "katlas-about-handbook-progress-v1";
const PROGRESS_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const PROGRESS_WINDOW_NAME_PREFIX = `${PROGRESS_STORAGE_KEY}:`;

type CalloutType = "critical" | "escalation" | "neverMiss" | "responseTime";

type ExecutiveSummaryItem = {
  label: string;
  value: string;
};

type Callout = {
  type: CalloutType;
  title: string;
  body: string;
};

type DetailBlock = {
  title: string;
  body?: string;
  items?: string[];
  warning?: boolean;
};

type RoleProfile = {
  name: string;
  role: string;
  whatToAsk: string;
};

type ToolProfile = {
  name: string;
  purpose: string;
  whoUsesIt: string;
  accessInstructions: string;
};

type WorkflowStage = {
  title: string;
  owner: string;
  body: string;
};

type HandbookSection = {
  id: string;
  title: string;
  icon: LucideIcon;
  summary: string;
  keyFacts: string[];
  warnings: string[];
  callouts: Callout[];
  detailBlocks: DetailBlock[];
};

const executiveSummary: ExecutiveSummaryItem[] = [
  { label: "Company", value: "Katlas Media / Qianyuan" },
  { label: "What We Do", value: "Global marketing for Chinese tech, AI, and consumer brands" },
  { label: "Who We Serve", value: "Brands expanding into international markets" },
  { label: "Markets", value: "50+ countries and regions" },
  { label: "Core Working Hours", value: "10:00 - 19:00 Shanghai time" },
  { label: "Primary Tools", value: "Feishu, EasyKOL, Nox, Outlook, Canva, VPN" },
];

const workflowSteps = [
  "Brief",
  "Sourcing",
  "Outreach",
  "Quote",
  "Internal Submission",
  "Client Review",
  "Order Confirmed",
  "Bargaining",
  "Requirements",
  "Contract",
  "Payment",
  "Script",
  "Video",
  "Approval",
  "Publishing",
  "Data",
  "Settlement",
  "Review",
];

const workflowStages: WorkflowStage[] = [
  {
    title: "Stage 1 - Understanding The Brief",
    owner: "You, with guidance from Pod Leader",
    body: "Before sourcing begins, understand the client background, product, target user, selling points, advertising platform, crossposting requirements, budget, influencer tier, price cap, CPM target, influencer type, and release timeline. When possible, try the product yourself.",
  },
  {
    title: "Stage 2 - Influencer Sourcing",
    owner: "You",
    body: "Screen influencers based on follower count, posting frequency, content quality, style match, and audience profile. Use EasyKOL and Nox as primary tools. YouTube manual search is also effective.",
  },
  {
    title: "Stage 3 - Outreach",
    owner: "You",
    body: "Email is the default outreach channel. Find emails through YouTube bios, rotate across 3 to 5 YouTube accounts for lookups, personalise the standard outreach template, and follow up after 3 to 4 days. DM is a last resort.",
  },
  {
    title: "Stage 4 - Quote Received To Internal Submission",
    owner: "You submit. PM reviews and sends to client.",
    body: "When an influencer responds with a quote, submit account link, followers, region, average views, CPM, cost price, external price, and your recommendation reason.",
  },
  {
    title: "Stage 5 - Bargaining",
    owner: "You. Escalate to PM if stuck.",
    body: "Negotiate with both influencer and client using CPM benchmarks and historical data. Use bundling, long-term framing, and crossposting add-ons while protecting margin.",
  },
  {
    title: "Stage 6 - Requirement Confirmation",
    owner: "You",
    body: "Once the client confirms an order, lock down the full brief, publication date, platform, format, and deliverables with the influencer. Save the client confirmation message as documentation.",
  },
  {
    title: "Stage 7 - Contract",
    owner: "You, reviewed by PM",
    body: "Contract must be signed before payment. Clarify deliverables, usage rights, revision rounds, and breach clauses. Modify the standard template only where needed.",
  },
  {
    title: "Stage 8 - Payment",
    owner: "You track. Finance processes.",
    body: "Default is no deposit and full payment after publishing. If a deposit is needed, contract must be signed first, deposit is usually capped at 50%, and ideally paid after script approval.",
  },
  {
    title: "Stage 9 - Script And Video Review",
    owner: "You",
    body: "Always request script first. Scripts have unlimited revisions by default. Videos should allow at least 3 rounds. Before sending to client, check brand names, competitor mentions, duration, and brief compliance.",
  },
  {
    title: "Stage 10 - Publishing",
    owner: "You",
    body: "Confirm go-live time, update internal and external tables, check content against the brief, and confirm tracking links, ManyChat flows, or co-created post requirements.",
  },
  {
    title: "Stage 11 - Data Collection And Reporting",
    owner: "You",
    body: "Collect views, likes, comments, and shares. Flag CPM or low-view problems to PM early. Update the influencer external database weekly.",
  },
  {
    title: "Stage 12 - Settlement And Review",
    owner: "You provide data. PM owns report.",
    body: "Log payment status, extra costs, ad spend, benefits, and price changes before batch settlement. Contribute execution summary, creator performance, content performance, and optimisation suggestions.",
  },
];

const roleProfiles: RoleProfile[] = [
  {
    name: "Silvia Sun",
    role: "Pod S Manager / Social Media Specialist",
    whatToAsk:
      "Direct manager support, campaign standards, influencer standards, and execution guidance.",
  },
  {
    name: "Yue Luo",
    role: "Influencer Marketing Manager",
    whatToAsk: "Senior reference for influencer execution and campaign judgement.",
  },
  {
    name: "Grace Tran",
    role: "Vietnam Team Lead",
    whatToAsk: "Cross-regional campaign questions and Vietnam market coordination.",
  },
  {
    name: "Project PM",
    role: "Project Manager",
    whatToAsk:
      "Client relationship, submissions, client approvals, contract template, and escalation.",
  },
  {
    name: "张静",
    role: "HR",
    whatToAsk: "Leave requests, policy questions, and HR process questions.",
  },
  {
    name: "Shuang Wu",
    role: "EasyKOL Permissions",
    whatToAsk: "EasyKOL access and permission setup.",
  },
];

const toolProfiles: ToolProfile[] = [
  {
    name: "Feishu",
    purpose: "Meetings, approvals, internal docs, daily reports, and weekly reports.",
    whoUsesIt: "Everyone.",
    accessInstructions: "Use the company account and keep meetings inside Feishu.",
  },
  {
    name: "EasyKOL",
    purpose: "Influencer sourcing, analytics, and export review.",
    whoUsesIt: "Sourcing and campaign operations.",
    accessInstructions: "Register with personal email and ask Shuang Wu for permissions.",
  },
  {
    name: "Nox",
    purpose: "Influencer analytics and campaign research.",
    whoUsesIt: "Sourcing and campaign operations.",
    accessInstructions: "Use the public accounts document for access steps.",
  },
  {
    name: "Outlook",
    purpose: "Creator outreach email and external communication.",
    whoUsesIt: "Creator outreach and campaign operators.",
    accessInstructions:
      "Use outreach@katlasmedia.com. Credentials stay in the private company account doc.",
  },
  {
    name: "Canva",
    purpose: "Creative assets, briefs, and lightweight presentation support.",
    whoUsesIt: "Creative, campaign, and operations teams.",
    accessInstructions: "Use the public accounts document for access steps.",
  },
  {
    name: "VPN (Yuntai)",
    purpose: "Remote access for Chinese platforms and region-sensitive tools.",
    whoUsesIt: "International remote employees and operators who need platform access.",
    accessInstructions: "Use the setup guide in the public accounts document.",
  },
  {
    name: "Video Translation Software",
    purpose: "Translation support for creator videos and campaign materials.",
    whoUsesIt: "Need info.",
    accessInstructions:
      "Use the public accounts document. Exact software name still needs confirmation.",
  },
];

const standardsChecklist = [
  "Never accept a video without first receiving and approving a script.",
  "Never pay a deposit without a signed contract.",
  "Never leave deliverables unclear before the influencer starts production.",
  "Never send client-facing content without checking it yourself first.",
  "Never miss the daily report by 24:00 Shanghai time or weekly report by Monday 10:00 Shanghai time.",
  "Never go 2+ hours without responding to work messages during working hours.",
  "Never negotiate contract changes with an influencer without checking with your PM.",
  "Never collaborate with influencers from IP-restricted regions on TikTok without flagging visibility risks.",
];

const handbookSections: HandbookSection[] = [
  {
    id: "company-foundation",
    title: "Company Foundation",
    icon: Building2,
    summary: "Who Katlas is, what we do, where we operate, and how to explain the company.",
    keyFacts: [
      "Katlas Media, also known as 千原传媒 / Qianyuan, is a Shanghai-based international marketing agency founded in 2022.",
      "The company helps Chinese technology, AI, and consumer brands expand into global markets.",
      "Offices: Beijing, Shanghai, Shenzhen, Ho Chi Minh City, and Brussels.",
      "The company works across 50+ countries and regions using a flexible remote-first collaboration model.",
    ],
    warnings: [
      "All deadlines, reports, and meeting times use Shanghai time unless stated otherwise.",
      "International remote employees should clarify overlap hours with the Pod Leader on day one.",
    ],
    callouts: [
      {
        type: "neverMiss",
        title: "Simple company explanation",
        body: "We help Chinese tech and AI companies build brand awareness and grow users internationally through influencer marketing, social media, and content.",
      },
      {
        type: "responseTime",
        title: "Working timezone",
        body: "Core hours are 10:00 - 19:00 Shanghai time, CST / UTC+8.",
      },
    ],
    detailBlocks: [
      {
        title: "What Katlas Media Is",
        body: "Katlas Media sits at the intersection of content strategy, influencer marketing, creative production, and global PR. It is not a traditional advertising agency. The work is about helping brands cross markets, cultures, platforms, and creator ecosystems.",
      },
      {
        title: "Mission / Purpose",
        body: "To help next-generation companies achieve global growth by building authoritative brand identities, maximising international exposure, and connecting brands with the right audiences across cultural contexts.",
      },
      {
        title: "Key Public Links",
        items: [
          "Website: www.katlasmedia.com",
          "WeChat Official Account: Qianyuan Overseas Growth / 千原出海增长",
          "Rednote: Qianyuan Research Institute / Lysa Crescent",
          "Podcast: Going Global Partners on Xiaoyuzhou, Apple Podcasts, Spotify, and Himalaya",
          "LinkedIn: Need info",
          "Email: admin@katlasmedia.com",
        ],
      },
      {
        title: "Important Contacts",
        items: [
          "Lysa Wei - CEO & Co-founder - Contact: Need info",
          "Eric Hong - Creative Director & Co-founder - Contact: Need info",
          "Silvia Sun - Social Media Specialist / Pod S Manager - Via Feishu",
          "Yue Luo - Influencer Marketing Manager - Via Feishu",
          "Grace Tran - Vietnam Team Lead - Via Feishu",
          "张静 - HR, leave requests and policy questions - Via Feishu",
          "周慧颖 - Newcomer exam score submission - Via Feishu",
          "Shuang Wu - EasyKOL permissions - Via Feishu",
        ],
      },
    ],
  },
  {
    id: "business-services",
    title: "Business & Services",
    icon: BriefcaseBusiness,
    summary: "What Katlas sells, how campaigns are structured, and what good campaign work means.",
    keyFacts: [
      "Katlas operates as a campaign agency hired by brands to plan and execute marketing campaigns.",
      "Katlas is an intermediary between the brand and the creator. It does not represent influencers.",
      "Revenue comes from project fees and commissions charged to clients for campaign execution.",
      "Common campaigns include influencer launches, retainers, UGC, KOC, cross-platform, PR, and event-integrated work.",
    ],
    warnings: [
      "Usage rights must be negotiated per deal and clearly stated in the contract.",
      "Spark Ads authorisation scope and duration can change influencer pricing, so confirm it upfront.",
    ],
    callouts: [
      {
        type: "critical",
        title: "Protect margin",
        body: "The margin sits between the influencer cost price and the external price charged to the client.",
      },
      {
        type: "neverMiss",
        title: "Good campaign outcome",
        body: "Content goes live on time, meets the brief, CPM stays within target, reporting is clean, and creator payment is correct.",
      },
    ],
    detailBlocks: [
      {
        title: "Core Services",
        items: [
          "Global Influencer & Social Media Marketing - sourcing, outreach, negotiation, and creator management across TikTok, Instagram, YouTube, LinkedIn, and X/Twitter.",
          "Full-Funnel Creative Production - brand films, launch videos, AIGC content, viral social videos, UI/UX showcase videos, and cross-cultural storytelling.",
          "Global PR & Media Relations - press releases, pitching, editorial placements, monitoring, media kits, SEO optimisation, and international coverage.",
          "Omnichannel Integrated Campaigns - influencer activation, event coverage, and media distribution in one coordinated campaign.",
          "Social Media Account Management - content planning, localisation, and community management across TikTok, Instagram, YouTube, LinkedIn, and Facebook.",
        ],
      },
      {
        title: "Campaign Types",
        items: [
          "One-off influencer campaigns for product launches or feature releases",
          "Ongoing retainer influencer programmes",
          "UGC and KOC campaigns",
          "Cross-platform campaigns with crossposting requirements",
          "Integrated campaigns combining influencers, PR, and events",
        ],
      },
      {
        title: "Common Deliverables",
        items: [
          "Dedicated video for TikTok, YouTube, or Instagram Reels",
          "Integration segment within a longer video",
          "Instagram Story, often bundled as a free add-on",
          "Carousel post",
          "Script and video package",
          "Live link and performance data report",
          "Post-campaign review report",
        ],
      },
      {
        title: "Pricing Context",
        items: [
          "Influencer pricing is based on CPM and historical collaboration data.",
          "Team member project commission is typically 5-10% of actual project profit.",
          "BD commission, when bringing in a new client, is typically 5-10% of first project profit after costs.",
        ],
      },
    ],
  },
  {
    id: "how-work-gets-done",
    title: "How Work Gets Done",
    icon: CheckCircle2,
    summary:
      "The operating flow from client brief to sourcing, outreach, approvals, publishing, and reporting.",
    keyFacts: [
      "Full flow: Client brief to sourcing, outreach, quote, internal submission, client review, contract, script, video, publishing, reporting, settlement, and project review.",
      "You own creator-side execution, while PMs own client-facing review and reporting.",
      "Every important confirmation should be saved as documentation.",
      "PM should be warned early if CPM is too high, views are too low, or an influencer becomes unresponsive.",
    ],
    warnings: [
      "Always request script first. Never accept a video without a script.",
      "Do not move forward when approvals, quotes, contracts, usage rights, or deliverables are unclear.",
    ],
    callouts: [
      {
        type: "critical",
        title: "Script before video",
        body: "Scripts must be reviewed before video production starts. Videos should be checked internally before client review.",
      },
      {
        type: "escalation",
        title: "Escalate blocked work",
        body: "If an influencer is unresponsive for 1-2 weeks, CPM is over target, contract changes appear, or the client disputes content, loop in PM.",
      },
    ],
    detailBlocks: [
      {
        title: "Full Workflow Overview",
        body: "Client Brief -> Influencer Sourcing -> Outreach -> Quote Received -> Internal Submission -> Client Review -> Order Confirmed -> Bargaining -> Requirement Confirmation -> Contract Signed -> Payment if deposit -> Script Review -> Video Review -> Client Approval -> Publishing -> Data Collection -> Payment Settlement -> Project Review.",
      },
      {
        title: "Escalation Rules",
        items: [
          "Influencer unresponsive for 1-2 weeks: escalate to PM, set a hard deadline, and attempt multi-channel contact.",
          "CPM significantly over target: warn PM early instead of waiting until settlement.",
          "Influencer requests contract changes outside the template: check with PM before agreeing.",
          "Client disputes content: do not respond unilaterally. Loop in PM.",
        ],
        warning: true,
      },
    ],
  },
  {
    id: "people-tools",
    title: "People, Communication & Tools",
    icon: UsersRound,
    summary:
      "Who to ask, where to communicate, which tools matter, and how work information is stored.",
    keyFacts: [
      "Primary communication and meeting tool: Feishu.",
      "Secondary communication: WeChat.",
      "Client outreach email: Outlook using outreach@katlasmedia.com.",
      "Meetings should be scheduled through Feishu, not WeChat.",
    ],
    warnings: [
      "Work messages should be answered within 2 hours during working hours.",
      "Failure to respond for 2+ hours can be recorded as 0.5 days absenteeism.",
      "Poor or missed reports can lead to commission deduction.",
    ],
    callouts: [
      {
        type: "responseTime",
        title: "Daily report deadline",
        body: "Daily report is due by 24:00 Shanghai time every day.",
      },
      {
        type: "responseTime",
        title: "Weekly report deadline",
        body: "Weekly report is due by 10:00 Monday Shanghai time. Quality is auto-checked at 22:00 Sunday.",
      },
    ],
    detailBlocks: [
      {
        title: "Who To Ask For What",
        items: [
          "Campaign brief and influencer standards: Silvia Sun / Pod S",
          "EasyKOL access: Shuang Wu",
          "Leave requests and policy: 张静 / HR",
          "Newcomer exam: 周慧颖",
          "Contract template: PM",
          "Payment processing: Finance, need info",
        ],
      },
      {
        title: "Internal Update Format",
        items: [
          "Daily report: fill in by 24:00 Shanghai time every day. Link still needs to be added.",
          "Weekly report: submit by 10:00 Monday Shanghai time. Link still needs to be added.",
          "System auto-checks weekly report quality at 22:00 Sunday Shanghai time.",
        ],
      },
      {
        title: "File And Template Locations",
        items: [
          "Project materials should be organised by month and uploaded to the corresponding Feishu shared folder.",
          "Folder structure: Need info.",
          "Outreach email template: Need info.",
          "Internal submission template: Need info.",
          "Contract template: Need info.",
          "ATM / influencer tracker: New ATM填写说明 doc on Feishu.",
        ],
      },
    ],
  },
  {
    id: "standards-boundaries",
    title: "Standards & Boundaries",
    icon: ShieldCheck,
    summary:
      "The rules that protect campaign quality, creator relationships, client trust, and payment safety.",
    keyFacts: [
      "Creator submissions must match follower tier, posting frequency, content quality, audience profile, and brand safety needs.",
      "Client-facing content must be reviewed before sending.",
      "Payment requires a signed contract first.",
      "Usage rights must be explicitly agreed in the contract before the campaign starts.",
    ],
    warnings: [
      "This is the most important section. If a rule here conflicts with speed, follow the rule.",
      "Do not assume usage rights are included. Confirm scope, duration, and platform.",
    ],
    callouts: [
      {
        type: "critical",
        title: "Signed contract before deposit",
        body: "Never pay a deposit without a signed contract.",
      },
      {
        type: "critical",
        title: "Approved script before video",
        body: "Never accept a video without an approved script.",
      },
      {
        type: "neverMiss",
        title: "Review before sending",
        body: "Never send client-facing content without reviewing it first.",
      },
    ],
    detailBlocks: [
      {
        title: "Creator Quality Standards",
        items: [
          "Relevant follower count for the campaign tier",
          "Consistent posting frequency, not dormant accounts",
          "Content style and tone matching the brand brief",
          "Audience demographics matching target market, region, gender, and age",
          "No obvious brand safety issues such as controversial content or competing brand deals",
          "Avoid influencers from regions where content visibility is known to be restricted",
        ],
      },
      {
        title: "Client-Facing Standards",
        items: [
          "Check correct brand name spelling and pronunciation.",
          "Check for competitor mentions.",
          "Check video duration and brief compliance.",
          "If errors exist, fix before sending or flag explicitly to the client.",
          "Save every client confirmation message as documentation.",
          "Do not communicate directly with clients on influencer-specific issues without looping in PM.",
        ],
      },
      {
        title: "Payment And Usage Rights Boundaries",
        items: [
          "Standard policy: no deposit, full payment after publishing.",
          "If deposit is unavoidable: 50% maximum, only after contract is signed, and ideally after script approval.",
          "All payments must be logged with cost, external price, and additional expenses.",
          "Spark Ads authorisation periods must be confirmed and documented.",
        ],
        warning: true,
      },
      {
        title: "Approval Rules",
        items: [
          "Scripts must be approved before video production begins. No exceptions.",
          "Videos must be reviewed internally before being sent to the client.",
          "Client must formally approve content before the influencer publishes.",
          "Contract must be signed before any money moves.",
        ],
        warning: true,
      },
    ],
  },
];

export function AboutKatlasMedia() {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [completedSections, setCompletedSections] = useState<Record<string, boolean>>({});
  const [progressLoaded, setProgressLoaded] = useState(false);

  useEffect(() => {
    const savedProgress = readProgressStorage();
    if (!savedProgress) {
      setProgressLoaded(true);
      return;
    }

    try {
      const parsedProgress = JSON.parse(savedProgress) as Record<string, boolean>;
      setCompletedSections(parsedProgress);
    } catch {
      clearProgressStorage();
    } finally {
      setProgressLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!progressLoaded) return;
    writeProgressStorage(completedSections);
  }, [completedSections, progressLoaded]);

  const completedCount = useMemo(
    () => handbookSections.filter((section) => completedSections[section.id]).length,
    [completedSections],
  );

  function toggleSection(sectionId: string) {
    setOpenSections((current) => ({ ...current, [sectionId]: !current[sectionId] }));
  }

  function toggleComplete(sectionId: string) {
    setCompletedSections((current) => {
      const nextProgress = { ...current, [sectionId]: !current[sectionId] };
      writeProgressStorage(nextProgress);
      return nextProgress;
    });
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <TopBar />
      <div className="absolute inset-x-0 top-0 h-[360px] bg-hero-glow pointer-events-none" />

      <main className="katlas-page max-w-6xl">
        <section className="katlas-hero-panel">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                About Katlas Media
              </p>
              <h1 className="mt-3 text-3xl font-medium leading-tight tracking-tight md:text-4xl">
                Internal handbook for new employees.
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                A practical guide to how Katlas works: company context, services, workflows, people,
                tools, and the standards that should not be missed.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background/80 px-4 py-3">
              <p className="text-xs text-muted-foreground">Reading Progress</p>
              <p className="mt-1 text-2xl font-semibold">
                {completedCount}/{handbookSections.length}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">sections complete</p>
            </div>
          </div>
        </section>

        <ExecutiveSummary />

        <ReadingProgress completedSections={completedSections} onToggleComplete={toggleComplete} />

        <section className="grid gap-4">
          {handbookSections.map((section) => (
            <HandbookSection
              key={section.id}
              section={section}
              expanded={Boolean(openSections[section.id])}
              completed={Boolean(completedSections[section.id])}
              onToggle={() => toggleSection(section.id)}
              onToggleComplete={() => toggleComplete(section.id)}
            />
          ))}
        </section>

        <section className="katlas-panel">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <FileText className="size-4 text-muted-foreground" />
                <h2 className="text-base font-semibold">Last Updated</h2>
              </div>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                June 2026. Compiled from Katlas onboarding materials, employee handbook, credentials
                deck, and platform execution guides. Remaining Need info fields should be filled by
                HR or Pod Leader during onboarding.
              </p>
            </div>
            <span className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground">
              Internal Handbook
            </span>
          </div>
        </section>
      </main>
    </div>
  );
}

function readProgressStorage() {
  if (typeof window === "undefined") return null;

  try {
    const storedProgress = window.localStorage?.getItem(PROGRESS_STORAGE_KEY);
    if (storedProgress) return storedProgress;
  } catch {
    // Some browser contexts restrict localStorage. Cookies keep progress usable there.
  }

  return readProgressCookie() ?? readProgressWindowName();
}

function writeProgressStorage(progress: Record<string, boolean>) {
  if (typeof window === "undefined") return;

  const serializedProgress = JSON.stringify(progress);

  try {
    window.localStorage?.setItem(PROGRESS_STORAGE_KEY, serializedProgress);
  } catch {
    // Keep writing the cookie fallback below.
  }

  writeProgressCookie(serializedProgress);
  writeProgressWindowName(serializedProgress);
}

function clearProgressStorage() {
  if (typeof window === "undefined") return;

  try {
    window.localStorage?.removeItem(PROGRESS_STORAGE_KEY);
  } catch {
    // Keep clearing the cookie fallback below.
  }

  clearProgressCookie();
  clearProgressWindowName();
}

function readProgressCookie() {
  if (typeof document === "undefined") return null;
  if (typeof document.cookie !== "string") return null;

  try {
    const cookiePrefix = `${encodeURIComponent(PROGRESS_STORAGE_KEY)}=`;
    const progressCookie = document.cookie
      .split("; ")
      .find((cookie) => cookie.startsWith(cookiePrefix));

    if (!progressCookie) return null;

    return decodeURIComponent(progressCookie.slice(cookiePrefix.length));
  } catch {
    return null;
  }
}

function writeProgressCookie(serializedProgress: string) {
  if (typeof document === "undefined") return;
  if (typeof document.cookie !== "string") return;

  try {
    document.cookie = `${encodeURIComponent(PROGRESS_STORAGE_KEY)}=${encodeURIComponent(
      serializedProgress,
    )}; path=/; max-age=${PROGRESS_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
  } catch {
    // The window.name fallback below still works in stricter browser contexts.
  }
}

function clearProgressCookie() {
  if (typeof document === "undefined") return;
  if (typeof document.cookie !== "string") return;

  try {
    document.cookie = `${encodeURIComponent(
      PROGRESS_STORAGE_KEY,
    )}=; path=/; max-age=0; SameSite=Lax`;
  } catch {
    // The window.name fallback is cleared separately.
  }
}

function readProgressWindowName() {
  if (typeof window === "undefined") return null;
  if (!window.name.startsWith(PROGRESS_WINDOW_NAME_PREFIX)) return null;

  return window.name.slice(PROGRESS_WINDOW_NAME_PREFIX.length);
}

function writeProgressWindowName(serializedProgress: string) {
  if (typeof window === "undefined") return;

  window.name = `${PROGRESS_WINDOW_NAME_PREFIX}${serializedProgress}`;
}

function clearProgressWindowName() {
  if (typeof window === "undefined") return;
  if (!window.name.startsWith(PROGRESS_WINDOW_NAME_PREFIX)) return;

  window.name = "";
}

function ExecutiveSummary() {
  return (
    <section className="katlas-panel p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="grid size-9 place-items-center rounded-md bg-accent text-accent-foreground">
              <Sparkles className="size-4" />
            </div>
            <h2 className="text-xl font-semibold">Katlas In 60 Seconds</h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            The minimum context a new employee should understand before reading deeper.
          </p>
        </div>
        <span className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground">
          10 minute onboarding target
        </span>
      </div>

      <div className="mt-5 grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {executiveSummary.map((item) => (
          <div
            key={item.label}
            className="min-w-0 rounded-lg border border-border bg-background/70 p-4"
          >
            <p className="text-xs font-medium uppercase text-muted-foreground">{item.label}</p>
            <p className="mt-2 break-words text-base font-semibold leading-6">{item.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ReadingProgress({
  completedSections,
  onToggleComplete,
}: {
  completedSections: Record<string, boolean>;
  onToggleComplete: (sectionId: string) => void;
}) {
  return (
    <section className="katlas-panel p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Handbook Progress</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {handbookSections.map((section) => {
            const completed = Boolean(completedSections[section.id]);
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => onToggleComplete(section.id)}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                  completed
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                    : "border-border bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                <CheckCircle2 className="size-3.5" />
                {section.title}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function HandbookSection({
  section,
  expanded,
  completed,
  onToggle,
  onToggleComplete,
}: {
  section: HandbookSection;
  expanded: boolean;
  completed: boolean;
  onToggle: () => void;
  onToggleComplete: () => void;
}) {
  const Icon = section.icon;
  const isWorkflowSection = section.id === "how-work-gets-done";
  const isPeopleToolsSection = section.id === "people-tools";
  const isStandardsSection = section.id === "standards-boundaries";

  return (
    <article className="katlas-panel overflow-hidden p-5 md:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <div className="grid size-11 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground">
          <Icon className="size-5" />
        </div>
        <div className="min-w-0 max-w-full flex-1 overflow-hidden">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <h2 className="text-xl font-semibold">{section.title}</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                {section.summary}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <button
                type="button"
                onClick={onToggleComplete}
                className={`inline-flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                  completed
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                    : "border-border bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                <CheckCircle2 className="size-3.5" />
                {completed ? "Complete" : "Mark Complete"}
              </button>
              <button
                type="button"
                onClick={onToggle}
                aria-expanded={expanded}
                aria-controls={`${section.id}-details`}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent"
              >
                {expanded ? "Hide Details" : "Show Details"}
                {expanded ? (
                  <ChevronDown className="size-3.5" />
                ) : (
                  <ChevronRight className="size-3.5" />
                )}
              </button>
            </div>
          </div>

          {expanded ? (
            <div id={`${section.id}-details`} className="mt-5 grid min-w-0 gap-4">
              <div className="min-w-0 overflow-hidden rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-4">
                <div className="flex items-center gap-2">
                  <FileText className="size-4 text-emerald-200" />
                  <h3 className="text-sm font-semibold text-emerald-100">Full Details</h3>
                </div>
                <div className="mt-4 grid min-w-0 gap-4">
                  {section.detailBlocks.map((block) => (
                    <DetailBlockCard key={`${section.id}-${block.title}`} block={block} />
                  ))}
                  {isWorkflowSection ? <WorkflowStageBreakdown /> : null}
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-5 grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <InfoList title="Key Facts" icon={Flag} items={section.keyFacts} />
            <InfoList
              title="Important Warnings"
              icon={AlertTriangle}
              items={section.warnings}
              warning
            />
          </div>

          {section.callouts.length > 0 ? (
            <div className="mt-4 grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              {section.callouts.map((callout) => (
                <CalloutBox key={`${section.id}-${callout.title}`} callout={callout} />
              ))}
            </div>
          ) : null}

          {isWorkflowSection ? <WorkflowTimeline /> : null}
          {isPeopleToolsSection ? <PeopleAndTools /> : null}
          {isStandardsSection ? <StandardsChecklist /> : null}
        </div>
      </div>
    </article>
  );
}

function InfoList({
  title,
  icon: Icon,
  items,
  warning = false,
}: {
  title: string;
  icon: LucideIcon;
  items: string[];
  warning?: boolean;
}) {
  return (
    <div
      className={`min-w-0 overflow-hidden rounded-lg border p-4 ${
        warning ? "border-amber-500/25 bg-amber-500/5" : "border-border bg-background/70"
      }`}
    >
      <div className="flex items-center gap-2">
        <Icon className={warning ? "size-4 text-amber-300" : "size-4 text-muted-foreground"} />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="mt-3 grid min-w-0 gap-2">
        {items.map((item) => (
          <div key={item} className="flex min-w-0 gap-2 text-sm leading-6 text-muted-foreground">
            <span
              className={
                warning
                  ? "mt-2 size-1.5 shrink-0 rounded-full bg-amber-300"
                  : "mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground"
              }
            />
            <span className="min-w-0 break-words">{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailBlockCard({ block }: { block: DetailBlock }) {
  return (
    <div
      className={`min-w-0 overflow-hidden rounded-lg border p-4 ${
        block.warning ? "border-red-500/30 bg-red-500/10" : "border-border bg-background/70"
      }`}
    >
      <h4 className="text-sm font-semibold">{block.title}</h4>
      {block.body ? (
        <p className="mt-3 break-words text-sm leading-7 text-muted-foreground">{block.body}</p>
      ) : null}
      {block.items ? (
        <div className="mt-3 grid min-w-0 gap-2">
          {block.items.map((item) => (
            <div key={item} className="flex min-w-0 gap-2 text-sm leading-6 text-muted-foreground">
              <span
                className={`mt-2 size-1.5 shrink-0 rounded-full ${
                  block.warning ? "bg-red-300" : "bg-muted-foreground"
                }`}
              />
              <span className="min-w-0 break-words">{item}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CalloutBox({ callout }: { callout: Callout }) {
  const styles: Record<CalloutType, string> = {
    critical: "border-red-500/35 bg-red-500/10 text-red-100",
    escalation: "border-sky-500/30 bg-sky-500/10 text-sky-100",
    neverMiss: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
    responseTime: "border-amber-500/30 bg-amber-500/10 text-amber-100",
  };

  const icons: Record<CalloutType, LucideIcon> = {
    critical: ShieldAlert,
    escalation: MessageSquareWarning,
    neverMiss: CheckCircle2,
    responseTime: Clock3,
  };

  const Icon = icons[callout.type];

  return (
    <div
      className={`min-w-0 max-w-full overflow-hidden rounded-lg border p-4 ${styles[callout.type]}`}
    >
      <div className="flex items-center gap-2">
        <Icon className="size-4 shrink-0" />
        <h3 className="text-sm font-semibold">{callout.title}</h3>
      </div>
      <p className="mt-2 break-words text-sm leading-6 text-current/80">{callout.body}</p>
    </div>
  );
}

function WorkflowTimeline() {
  return (
    <div className="mt-5 min-w-0 overflow-hidden rounded-lg border border-border bg-background/70 p-4">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Campaign Workflow</h3>
      </div>
      <div className="mt-4 flex max-w-full gap-3 overflow-x-auto pb-2">
        {workflowSteps.map((step, index) => (
          <div key={step} className="flex min-w-[128px] items-center gap-3">
            <div className="flex min-h-20 flex-1 flex-col justify-between rounded-lg border border-border/80 bg-card/75 p-3">
              <span className="text-xs text-muted-foreground">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="mt-3 text-sm font-semibold">{step}</span>
            </div>
            {index < workflowSteps.length - 1 ? (
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function WorkflowStageBreakdown() {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-background/70 p-4">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Stage-By-Stage Breakdown</h3>
      </div>
      <div className="mt-4 grid min-w-0 gap-3">
        {workflowStages.map((stage) => (
          <div
            key={stage.title}
            className="min-w-0 overflow-hidden rounded-lg border border-border/80 bg-card/75 p-4"
          >
            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
              <h4 className="text-sm font-semibold">{stage.title}</h4>
              <span className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground">
                {stage.owner}
              </span>
            </div>
            <p className="mt-3 break-words text-sm leading-7 text-muted-foreground">{stage.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PeopleAndTools() {
  return (
    <div className="mt-5 grid min-w-0 gap-4">
      <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-background/70 p-4">
        <div className="flex items-center gap-2">
          <UsersRound className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Role Directory</h3>
        </div>
        <div className="mt-4 grid min-w-0 gap-3 lg:grid-cols-[repeat(3,minmax(0,1fr))]">
          {roleProfiles.map((profile) => (
            <div
              key={`${profile.name}-${profile.role}`}
              className="min-w-0 overflow-hidden rounded-lg border border-border/80 bg-card/75 p-4"
            >
              <p className="break-words font-semibold">{profile.name}</p>
              <p className="mt-1 break-words text-sm text-muted-foreground">{profile.role}</p>
              <p className="mt-4 text-xs font-medium uppercase text-muted-foreground">Ask for</p>
              <p className="mt-1 break-words text-sm leading-6">{profile.whatToAsk}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-background/70 p-4">
        <div className="flex items-center gap-2">
          <Wrench className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Tool Directory</h3>
        </div>
        <div className="mt-4 grid min-w-0 gap-3 md:grid-cols-[repeat(2,minmax(0,1fr))] xl:grid-cols-[repeat(3,minmax(0,1fr))]">
          {toolProfiles.map((tool) => (
            <div
              key={tool.name}
              className="min-w-0 overflow-hidden rounded-lg border border-border/80 bg-card/75 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="break-words font-semibold">{tool.name}</p>
                <ExternalLink className="size-3.5 text-muted-foreground" />
              </div>
              <p className="mt-3 text-xs font-medium uppercase text-muted-foreground">Purpose</p>
              <p className="mt-1 break-words text-sm leading-6">{tool.purpose}</p>
              <p className="mt-3 text-xs font-medium uppercase text-muted-foreground">
                Who Uses It
              </p>
              <p className="mt-1 break-words text-sm leading-6 text-muted-foreground">
                {tool.whoUsesIt}
              </p>
              <p className="mt-3 text-xs font-medium uppercase text-muted-foreground">
                Access Instructions
              </p>
              <p className="mt-1 break-words text-sm leading-6 text-muted-foreground">
                {tool.accessInstructions}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StandardsChecklist() {
  return (
    <div className="mt-5 min-w-0 overflow-hidden rounded-lg border border-red-500/30 bg-red-500/10 p-4">
      <div className="flex items-center gap-2 text-red-100">
        <ShieldAlert className="size-4" />
        <h3 className="text-sm font-semibold">Non-Negotiable Standards</h3>
      </div>
      <div className="mt-4 grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {standardsChecklist.map((rule) => (
          <div
            key={rule}
            className="flex min-w-0 gap-3 rounded-lg border border-red-500/25 bg-background/70 p-4"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-300" />
            <p className="min-w-0 break-words text-sm leading-6 text-red-50/90">{rule}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
