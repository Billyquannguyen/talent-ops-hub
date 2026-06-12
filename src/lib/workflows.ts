import { BriefcaseBusiness, Gauge, MessageSquareText, Search } from "lucide-react";
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
    id: "employee-performance",
    title: "Employee Performance Tracking",
    description:
      "Calculate outreach, submission, approval, and profit scores against measurable KPI targets.",
    status: "ready",
    route: "/employee-performance",
    icon: Gauge,
  },
];
