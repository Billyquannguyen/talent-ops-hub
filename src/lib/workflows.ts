import { BriefcaseBusiness, MessageSquareText, Search, UserRound } from "lucide-react";
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
    id: "active-campaigns",
    title: "Active Campaign Management",
    description:
      "Track selected creators, quotes, status, profit, drafts, payments, and live links.",
    status: "ready",
    route: "/active-campaigns",
    icon: BriefcaseBusiness,
  },
  {
    id: "employee-profile",
    title: "Employee Profile",
    description: "Keep your work identity, contact details, and account links in one useful place.",
    status: "ready",
    route: "/employee-profile",
    icon: UserRound,
  },
];
