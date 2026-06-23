import { MdOutlineMail } from "react-icons/md";
import {
  SiCalendly,
  SiDiscord,
  SiFacebook,
  SiGoogledrive,
  SiInstagram,
  SiLine,
  SiNotion,
  SiSlack,
  SiTelegram,
  SiThreads,
  SiTiktok,
  SiViber,
  SiWhatsapp,
} from "react-icons/si";
import type { IconType } from "react-icons";

import type { EmployeeAccountLink, EmployeeProfile } from "./types";

export const launchpadStorageKey = "katlas-account-launchpad-links-v1";

export const launchpadCategories = ["Communication", "Social", "Workspace"] as const;

export type LaunchpadCategory = (typeof launchpadCategories)[number];

export type LaunchpadServiceId =
  | "slack"
  | "whatsapp"
  | "line"
  | "telegram"
  | "viber"
  | "discord"
  | "instagram"
  | "tiktok"
  | "facebook"
  | "threads"
  | "outlook"
  | "google-drive"
  | "notion"
  | "calendly";

export type LaunchpadService = {
  id: LaunchpadServiceId;
  label: string;
  category: LaunchpadCategory;
  icon: IconType;
};

export type LaunchpadLinks = Partial<Record<LaunchpadServiceId, string>>;

export const defaultLaunchpadLinks: LaunchpadLinks = {
  slack: "https://app.slack.com/client",
  whatsapp: "https://web.whatsapp.com",
  line: "https://manager.line.biz",
  telegram: "https://web.telegram.org",
  viber: "https://web.viber.com",
  discord: "https://discord.com/app",
  instagram: "https://www.instagram.com/direct/inbox/",
  tiktok: "https://www.tiktok.com/messages",
  facebook: "https://www.facebook.com/messages",
  threads: "https://www.threads.net",
  outlook: "https://outlook.office.com/mail/",
  "google-drive": "https://drive.google.com/drive/my-drive",
  notion: "https://www.notion.so",
  calendly: "https://calendly.com/app",
};

export const launchpadServices: LaunchpadService[] = [
  { id: "slack", label: "Slack", category: "Communication", icon: SiSlack },
  { id: "whatsapp", label: "WhatsApp", category: "Communication", icon: SiWhatsapp },
  { id: "line", label: "LINE", category: "Communication", icon: SiLine },
  { id: "telegram", label: "Telegram", category: "Communication", icon: SiTelegram },
  { id: "viber", label: "Viber", category: "Communication", icon: SiViber },
  { id: "discord", label: "Discord", category: "Communication", icon: SiDiscord },
  { id: "instagram", label: "Instagram", category: "Social", icon: SiInstagram },
  { id: "tiktok", label: "TikTok", category: "Social", icon: SiTiktok },
  { id: "facebook", label: "Facebook", category: "Social", icon: SiFacebook },
  { id: "threads", label: "Threads", category: "Social", icon: SiThreads },
  { id: "outlook", label: "Outlook", category: "Workspace", icon: MdOutlineMail },
  { id: "google-drive", label: "Google Drive", category: "Workspace", icon: SiGoogledrive },
  { id: "notion", label: "Notion", category: "Workspace", icon: SiNotion },
  { id: "calendly", label: "Calendly", category: "Workspace", icon: SiCalendly },
];

const legacyLabels: Record<LaunchpadServiceId, string[]> = {
  slack: ["slack"],
  whatsapp: ["whatsapp"],
  line: ["line"],
  telegram: ["telegram"],
  viber: ["viber"],
  discord: ["discord"],
  instagram: ["instagram"],
  tiktok: ["tiktok"],
  facebook: ["facebook"],
  threads: ["threads"],
  outlook: ["outlook"],
  "google-drive": ["google drive", "drive"],
  notion: ["notion"],
  calendly: ["calendly"],
};

export function loadLaunchpadLinks(profile?: EmployeeProfile): LaunchpadLinks {
  if (typeof window === "undefined") return linksFromProfile(profile);

  try {
    const raw = window.localStorage.getItem(launchpadStorageKey);
    if (!raw) return linksFromProfile(profile);
    return normalizeLinks(JSON.parse(raw), profile);
  } catch {
    return linksFromProfile(profile);
  }
}

export function saveLaunchpadLinks(links: LaunchpadLinks) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(launchpadStorageKey, JSON.stringify(normalizeLinks(links)));
}

export function launchpadLinksToAccounts(links: LaunchpadLinks): EmployeeAccountLink[] {
  const normalized = normalizeLinks(links);
  return launchpadServices.map((service) => ({
    id: service.id,
    label: service.label,
    category: service.category,
    url: normalized[service.id] ?? "",
    handle: "",
    notes: "",
  }));
}

function normalizeLinks(value: unknown, fallbackProfile?: EmployeeProfile): LaunchpadLinks {
  const links = { ...defaultLaunchpadLinks, ...linksFromProfile(fallbackProfile) };
  if (!isRecord(value)) return links;

  for (const service of launchpadServices) {
    const raw = value[service.id];
    if (typeof raw === "string" && raw.trim()) {
      links[service.id] = raw.trim();
    }
  }

  return links;
}

function linksFromProfile(profile?: EmployeeProfile): LaunchpadLinks {
  const links: LaunchpadLinks = { ...defaultLaunchpadLinks };
  if (!profile?.accounts?.length) return links;

  for (const service of launchpadServices) {
    const legacy = findLegacyAccount(profile.accounts, service.id);
    if (legacy?.url.trim()) {
      links[service.id] = legacy.url.trim();
    }
  }

  return links;
}

function findLegacyAccount(accounts: EmployeeAccountLink[], serviceId: LaunchpadServiceId) {
  const labels = legacyLabels[serviceId];
  return accounts.find((account) => {
    const label = account.label.trim().toLowerCase();
    return labels.some((candidate) => label.includes(candidate));
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
