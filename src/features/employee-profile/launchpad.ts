import discordIcon from "@/assets/launchpad-icons/discord.png";
import facebookIcon from "@/assets/launchpad-icons/facebook.png";
import googleDriveIcon from "@/assets/launchpad-icons/google-drive.png";
import instagramIcon from "@/assets/launchpad-icons/instagram.png";
import lineIcon from "@/assets/launchpad-icons/line.png";
import notionIcon from "@/assets/launchpad-icons/notion.png";
import outlookIcon from "@/assets/launchpad-icons/outlook.png";
import slackIcon from "@/assets/launchpad-icons/slack.png";
import telegramIcon from "@/assets/launchpad-icons/telegram.png";
import threadsIcon from "@/assets/launchpad-icons/threads.png";
import tiktokIcon from "@/assets/launchpad-icons/tiktok.png";
import viberIcon from "@/assets/launchpad-icons/viber.png";
import whatsappIcon from "@/assets/launchpad-icons/whatsapp.png";
import calendlyIcon from "@/assets/launchpad-icons/calendly.png";

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
  iconSrc: string;
};

export type LaunchpadLinks = Partial<Record<LaunchpadServiceId, string>>;

export const launchpadServices: LaunchpadService[] = [
  { id: "slack", label: "Slack", category: "Communication", iconSrc: slackIcon },
  { id: "whatsapp", label: "WhatsApp", category: "Communication", iconSrc: whatsappIcon },
  { id: "line", label: "LINE", category: "Communication", iconSrc: lineIcon },
  { id: "telegram", label: "Telegram", category: "Communication", iconSrc: telegramIcon },
  { id: "viber", label: "Viber", category: "Communication", iconSrc: viberIcon },
  { id: "discord", label: "Discord", category: "Communication", iconSrc: discordIcon },
  { id: "instagram", label: "Instagram", category: "Social", iconSrc: instagramIcon },
  { id: "tiktok", label: "TikTok", category: "Social", iconSrc: tiktokIcon },
  { id: "facebook", label: "Facebook", category: "Social", iconSrc: facebookIcon },
  { id: "threads", label: "Threads", category: "Social", iconSrc: threadsIcon },
  { id: "outlook", label: "Outlook", category: "Workspace", iconSrc: outlookIcon },
  { id: "google-drive", label: "Google Drive", category: "Workspace", iconSrc: googleDriveIcon },
  { id: "notion", label: "Notion", category: "Workspace", iconSrc: notionIcon },
  { id: "calendly", label: "Calendly", category: "Workspace", iconSrc: calendlyIcon },
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

function normalizeLinks(value: unknown, fallbackProfile?: EmployeeProfile): LaunchpadLinks {
  const links = linksFromProfile(fallbackProfile);
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
  const links: LaunchpadLinks = {};
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
