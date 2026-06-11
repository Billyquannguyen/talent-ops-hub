import { ClipboardList, Search, Sparkles } from "lucide-react";
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
    id: "placeholder-one",
    title: "Placeholder Function",
    description:
      "Reserved for the next Katlas workflow, such as campaign matching or creator vetting.",
    status: "placeholder",
    icon: ClipboardList,
  },
  {
    id: "placeholder-two",
    title: "Placeholder Function",
    description:
      "Reserved for another repeatable workflow that should live as its own dashboard function.",
    status: "placeholder",
    icon: Sparkles,
  },
];
