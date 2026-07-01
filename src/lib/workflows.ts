import { BriefcaseBusiness, FileText, MessageSquareText, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type WorkflowCard = {
  id: string;
  title: string;
  description: string;
  status: "ready" | "placeholder";
  route?: string;
  icon: LucideIcon;
};

export const workflowCards: WorkflowCard[] = [
  {
    id: "creator-sourcing",
    title: "Creator Sourcing Assistant",
    description:
      "Process EasyKOL exports, filter creator lists, enrich contact data, and download sourcing-ready files.",
    status: "ready",
    route: "/creator-sourcing",
    icon: Search,
  },
  {
    id: "creator-outreach",
    title: "Creator Outreach Assistant",
    description:
      "Translate creator messages, apply campaign templates, and copy ready-to-send replies.",
    status: "ready",
    route: "/creator-outreach",
    icon: MessageSquareText,
  },
  {
    id: "prompt-vault",
    title: "Prompt Vault",
    description:
      "Store, find, edit, and copy campaign-specific workflow prompts generated in ChatGPT.",
    status: "ready",
    route: "/prompt-vault",
    icon: FileText,
  },
  {
    id: "active-campaigns",
    title: "Active Campaign Management",
    description: "Track selected creators, quotes, status, profit, payments, and live links.",
    status: "ready",
    route: "/active-campaigns",
    icon: BriefcaseBusiness,
  },
];
