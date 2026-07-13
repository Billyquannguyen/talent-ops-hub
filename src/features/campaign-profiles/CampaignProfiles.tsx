import {
  BadgeDollarSign,
  CalendarDays,
  Check,
  ClipboardList,
  Copy,
  FileText,
  Maximize2,
  Megaphone,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  TrendingUp,
  Trash2,
  Users,
  Video,
  X,
  EyeOff,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { TopBar } from "@/components/TopBar";
import {
  listCampaignProjectInfoFromGoogleSheetsOnly,
  listEmployeeProfilesFromGoogleSheetsOnly,
  saveCampaignProjectInfoToGoogleSheetsOnly,
} from "@/storage/appRepository";
import {
  employeeProfileFromRecord,
  employeeProfileRecordId,
  loadEmployeeProfile,
  saveEmployeeProfile,
} from "@/features/employee-profile/storage";
import type { EmployeeProfile } from "@/features/employee-profile/types";
import {
  campaignMemoryLanguages,
  calculateCreatorFinancials,
  createCampaign,
  createCampaignMemoryCard,
  loadActiveCampaignRegistryFromGoogleSheetsOnly,
  loadCampaignRegistry,
  saveCampaignRegistry,
  type GlobalCampaign,
  type GlobalCampaignRegistry,
  type CampaignMemoryCard,
  type CampaignMemoryLanguage,
} from "@/lib/campaignRegistry";
import type { CampaignProjectInfoRecord } from "@/storage/schema";
import {
  campaignActiveStatus,
  campaignHiddenStatus,
  isCampaignHiddenStatus,
} from "@/lib/campaignVisibility";

type CampaignDraft = {
  id?: string;
  campaignName: string;
  campaignCode: string;
  preferredLanguages: CampaignMemoryLanguage[];
  memoryCards: CampaignMemoryCard[];
};

const emptyDraft: CampaignDraft = {
  campaignName: "",
  campaignCode: "",
  preferredLanguages: ["English"],
  memoryCards: [createCampaignMemoryCard("Deliverables", "")],
};

type ProjectInfoTextKey =
  | "projectBrief"
  | "productInformation"
  | "creatorPersonas"
  | "sop"
  | "scriptFilmingNotes"
  | "postingFinalisationNotes";

type ProjectInfoEditorState = {
  campaign: GlobalCampaign;
  record: CampaignProjectInfoRecord;
};

const projectInfoSections: Array<{
  key: ProjectInfoTextKey;
  title: string;
  description: string;
  placeholder: string;
  icon: LucideIcon;
}> = [
  {
    key: "projectBrief",
    title: "Project brief",
    description: "Client goal, market context, target audience, offer, and campaign objective.",
    placeholder: "Paste the project brief, client goal, campaign context, and key constraints...",
    icon: FileText,
  },
  {
    key: "productInformation",
    title: "Product information",
    description: "Product details, core features, pricing, claims, links, and required wording.",
    placeholder:
      "Add product description, feature list, landing pages, pricing, and proof points...",
    icon: Package,
  },
  {
    key: "creatorPersonas",
    title: "Creator personas",
    description: "Ideal creator types, niches, exclusions, audience profile, and examples.",
    placeholder: "Describe the creator profiles that fit this campaign and who to avoid...",
    icon: Users,
  },
  {
    key: "sop",
    title: "SOP",
    description: "The operating steps teammates should follow for this specific campaign.",
    placeholder:
      "Write the campaign workflow, checks, approvals, escalation paths, and deadlines...",
    icon: ClipboardList,
  },
  {
    key: "scriptFilmingNotes",
    title: "Script and filming notes",
    description: "Script rules, filming direction, talking-point order, and review notes.",
    placeholder:
      "Add hook guidance, required scenes, script warnings, filming notes, and revision rules...",
    icon: Video,
  },
  {
    key: "postingFinalisationNotes",
    title: "Posting & campaign finalisation notes",
    description: "Posting rules, live link checks, reporting, payment, and closing notes.",
    placeholder:
      "Add posting instructions, final checks, live link requirements, and campaign closing notes...",
    icon: Megaphone,
  },
];

export function CampaignProfiles() {
  const [loaded, setLoaded] = useState(false);
  const [registry, setRegistry] = useState<GlobalCampaignRegistry>(() => loadCampaignRegistry());
  const [editingDraft, setEditingDraft] = useState<CampaignDraft | null>(null);
  const [editingProjectInfo, setEditingProjectInfo] = useState<ProjectInfoEditorState | null>(null);
  const [projectInfoRecords, setProjectInfoRecords] = useState<CampaignProjectInfoRecord[]>([]);
  const [projectInfoLoaded, setProjectInfoLoaded] = useState(false);
  const [projectInfoSaving, setProjectInfoSaving] = useState(false);
  const [projectInfoStatus, setProjectInfoStatus] = useState("");
  const [roiMonth, setRoiMonth] = useState(() => getCurrentMonthValue());
  const [profile, setProfile] = useState<EmployeeProfile>(() => loadEmployeeProfile());
  const [roiStatus, setRoiStatus] = useState("Loading ROI data...");
  const skipNextRegistrySave = useRef(false);

  useEffect(() => {
    skipNextRegistrySave.current = true;
    setRegistry(loadCampaignRegistry({ includeHidden: true }));
    setLoaded(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSharedRoiData() {
      try {
        const [nextRegistry, profileRecords] = await Promise.all([
          loadActiveCampaignRegistryFromGoogleSheetsOnly({
            reason: "campaign-profiles:roi",
            includeHidden: true,
          }),
          listEmployeeProfilesFromGoogleSheetsOnly(),
        ]);
        if (cancelled) return;

        const profileRecord =
          profileRecords.find((record) => record.profileId === employeeProfileRecordId) ??
          profileRecords[0];
        if (profileRecord) {
          const nextProfile = employeeProfileFromRecord(profileRecord);
          setProfile(nextProfile);
          saveEmployeeProfile(nextProfile);
        }

        skipNextRegistrySave.current = true;
        setRegistry(nextRegistry);
        setRoiStatus("ROI data loaded from Katlas Buddy Database");
      } catch (error) {
        if (cancelled) return;
        setRoiStatus(
          error instanceof Error
            ? error.message
            : "Shared ROI data unavailable. Showing local cached data.",
        );
      }
    }

    void loadSharedRoiData();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (skipNextRegistrySave.current) {
      skipNextRegistrySave.current = false;
      return;
    }
    saveCampaignRegistry(registry);
  }, [loaded, registry]);

  const activeCampaigns = registry.campaigns.filter(
    (campaign) => !isCampaignHiddenStatus(campaign.status),
  );
  const hiddenCampaigns = registry.campaigns.filter((campaign) =>
    isCampaignHiddenStatus(campaign.status),
  );
  const activeCampaignIds = new Set(activeCampaigns.map((campaign) => campaign.id));
  const visibleRegistry: GlobalCampaignRegistry = {
    campaigns: activeCampaigns,
    creatorRecords: registry.creatorRecords.filter((record) =>
      activeCampaignIds.has(record.campaignRegistryId),
    ),
  };
  const monthlyRoi = calculateMonthlyRoi(visibleRegistry, roiMonth, profile);

  function saveCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingDraft?.campaignName.trim() || !editingDraft.campaignCode.trim()) return;
    const now = new Date().toISOString();

    setRegistry((current) => {
      if (editingDraft.id) {
        return {
          ...current,
          campaigns: current.campaigns.map((campaign) =>
            campaign.id === editingDraft.id
              ? {
                  ...campaign,
                  campaignName: editingDraft.campaignName.trim(),
                  campaignCode: editingDraft.campaignCode.trim().toUpperCase(),
                  preferredLanguages: editingDraft.preferredLanguages,
                  memoryCards: editingDraft.memoryCards,
                  updatedAt: now,
                }
              : campaign,
          ),
        };
      }

      return {
        ...current,
        campaigns: [
          {
            ...createCampaign(editingDraft.campaignName, editingDraft.campaignCode),
            preferredLanguages: editingDraft.preferredLanguages,
            memoryCards: editingDraft.memoryCards,
          },
          ...current.campaigns,
        ],
      };
    });

    setEditingDraft(null);
  }

  function deleteCampaign(campaignId: string) {
    const campaign = registry.campaigns.find((item) => item.id === campaignId);
    const confirmed =
      typeof window === "undefined" ||
      window.confirm(
        `Delete ${campaign?.campaignName ?? "this campaign"}? Creator records attached to this campaign will also be removed.`,
      );
    if (!confirmed) return;

    setRegistry((current) => ({
      campaigns: current.campaigns.filter((item) => item.id !== campaignId),
      creatorRecords: current.creatorRecords.filter(
        (record) => record.campaignRegistryId !== campaignId,
      ),
    }));
  }

  function toggleCampaignHidden(campaignId: string, hidden: boolean) {
    const campaign = registry.campaigns.find((item) => item.id === campaignId);
    const nextStatus = hidden ? campaignHiddenStatus : campaignActiveStatus;
    const confirmed =
      !hidden ||
      typeof window === "undefined" ||
      window.confirm(
        `Hide ${campaign?.campaignName ?? "this campaign"}? It will disappear from Sourcing, Outreach, Prompt Vault, and Active Campaigns until you restore it here.`,
      );
    if (!confirmed) return;

    const now = new Date().toISOString();
    setRegistry((current) => ({
      ...current,
      campaigns: current.campaigns.map((item) =>
        item.id === campaignId ? { ...item, status: nextStatus, updatedAt: now } : item,
      ),
    }));
  }

  async function openProjectInfo(campaign: GlobalCampaign) {
    let records = projectInfoRecords;
    setProjectInfoStatus("");

    if (!projectInfoLoaded) {
      setProjectInfoStatus("Loading project info...");
      try {
        records = await listCampaignProjectInfoFromGoogleSheetsOnly();
        setProjectInfoRecords(records);
        setProjectInfoLoaded(true);
        setProjectInfoStatus("");
      } catch (error) {
        setProjectInfoStatus(
          error instanceof Error ? error.message : "Project info could not be loaded.",
        );
      }
    }

    setEditingProjectInfo({
      campaign,
      record:
        records.find((record) => record.campaignId === campaign.id) ??
        createEmptyProjectInfoRecord(campaign),
    });
  }

  async function saveProjectInfo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingProjectInfo) return;

    const now = new Date().toISOString();
    const record: CampaignProjectInfoRecord = {
      ...editingProjectInfo.record,
      infoId:
        editingProjectInfo.record.infoId || createProjectInfoId(editingProjectInfo.campaign.id),
      campaignId: editingProjectInfo.campaign.id,
      createdAt: editingProjectInfo.record.createdAt || now,
      updatedAt: now,
    };

    setProjectInfoSaving(true);
    setProjectInfoStatus("");
    try {
      const records = await saveCampaignProjectInfoToGoogleSheetsOnly(record);
      setProjectInfoRecords(records);
      setProjectInfoLoaded(true);
      setProjectInfoStatus("Project info saved.");
      setEditingProjectInfo(null);
    } catch (error) {
      setProjectInfoStatus(
        error instanceof Error ? error.message : "Project info could not be saved.",
      );
    } finally {
      setProjectInfoSaving(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <TopBar />
      <div className="absolute inset-x-0 top-0 h-[360px] bg-hero-glow pointer-events-none" />

      <main className="katlas-page max-w-6xl">
        <section className="katlas-hero-panel">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Campaign Profiles
              </p>
              <h1 className="mt-3 text-3xl font-medium leading-tight tracking-tight md:text-4xl">
                Global campaign registry
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                Create and manage campaign names and campaign IDs here. Other workflow tools
                reference these profiles.
              </p>
            </div>
            <div className="grid w-full gap-0 border-y border-border py-4 sm:grid-cols-3 lg:max-w-lg">
              <Metric label="Active Projects" value={activeCampaigns.length.toLocaleString()} />
              <Metric label="Hidden" value={hiddenCampaigns.length.toLocaleString()} />
              <Metric
                label="Creator Records"
                value={visibleRegistry.creatorRecords.length.toLocaleString()}
              />
            </div>
          </div>
        </section>

        <Panel title="Campaign List" icon={Pencil}>
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm font-medium">Campaign profiles</p>
              <p className="mt-1 text-xs text-muted-foreground">
                This is the only place to create, edit, hide, restore, or delete campaigns.
              </p>
            </div>
            <button
              onClick={() => setEditingDraft(emptyDraft)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:opacity-90"
            >
              <Plus className="size-4" />
              Add Campaign
            </button>
          </div>

          <div className="katlas-table-shell mt-4">
            <table className="min-w-[620px] w-full border-collapse text-left text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <TableHeader>Campaign Name</TableHeader>
                  <TableHeader>Campaign ID</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader>Preferred Languages</TableHeader>
                  <TableHeader>Memory Cards</TableHeader>
                  <TableHeader>Actions</TableHeader>
                </tr>
              </thead>
              <tbody>
                {registry.campaigns.length ? (
                  registry.campaigns.map((campaign) => (
                    <tr
                      key={campaign.id}
                      className={`border-t border-border ${
                        isCampaignHiddenStatus(campaign.status) ? "bg-muted/20 opacity-70" : ""
                      }`}
                    >
                      <TableCell>
                        <span className="font-medium">{campaign.campaignName}</span>
                      </TableCell>
                      <TableCell>
                        <span className="rounded-full border border-border bg-background px-2 py-1 text-xs">
                          {campaign.campaignCode}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`rounded-full border px-2 py-1 text-xs ${
                            isCampaignHiddenStatus(campaign.status)
                              ? "border-amber-400/40 bg-amber-400/10 text-amber-100"
                              : "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                          }`}
                        >
                          {isCampaignHiddenStatus(campaign.status) ? "Hidden" : "Active"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          {campaign.preferredLanguages.map((language) => (
                            <span
                              key={language}
                              className="rounded-full border border-border bg-background px-2 py-1 text-xs text-muted-foreground"
                            >
                              {language}
                            </span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {campaign.memoryCards.length.toLocaleString()} cards
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => void openProjectInfo(campaign)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium transition hover:bg-accent"
                          >
                            <FileText className="size-3.5" />
                            Project Info
                          </button>
                          <button
                            onClick={() => setEditingDraft(toDraft(campaign))}
                            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium transition hover:bg-accent"
                          >
                            <Pencil className="size-3.5" />
                            Edit
                          </button>
                          {isCampaignHiddenStatus(campaign.status) ? (
                            <button
                              onClick={() => toggleCampaignHidden(campaign.id, false)}
                              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium transition hover:bg-accent"
                            >
                              <RotateCcw className="size-3.5" />
                              Restore
                            </button>
                          ) : (
                            <button
                              onClick={() => toggleCampaignHidden(campaign.id, true)}
                              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium transition hover:bg-accent"
                            >
                              <EyeOff className="size-3.5" />
                              Hide
                            </button>
                          )}
                          <button
                            onClick={() => deleteCampaign(campaign.id)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium transition hover:bg-accent"
                          >
                            <Trash2 className="size-3.5" />
                            Delete
                          </button>
                        </div>
                      </TableCell>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-10 text-center text-sm text-muted-foreground"
                    >
                      No campaign profiles yet. Add one before tracking selected creators.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="My Monthly ROI" icon={TrendingUp}>
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
            <div>
              <p className="text-sm font-medium">Monthly ROI</p>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
                Based on positive-profit Active Campaign creator records for the selected month.
              </p>
              <p className="mt-2 text-xs text-muted-foreground">{roiStatus}</p>
            </div>
            <label className="block w-full max-w-xs">
              <span className="text-xs font-medium text-muted-foreground">Month</span>
              <div className="mt-1 flex h-10 items-center gap-2 rounded-md border border-input bg-background px-3">
                <CalendarDays className="size-4 text-muted-foreground" />
                <input
                  type="month"
                  value={roiMonth}
                  onChange={(event) => setRoiMonth(event.target.value)}
                  className="w-full bg-transparent text-sm outline-none"
                />
              </div>
            </label>
          </div>

          <div className="mt-5 rounded-xl border border-border bg-background p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">ROI</p>
                {monthlyRoi.hasSalary ? (
                  <p className="mt-2 text-4xl font-semibold tracking-tight">
                    {formatPercent(monthlyRoi.roi)}
                  </p>
                ) : (
                  <p className="mt-2 text-xl font-semibold">Salary not configured.</p>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[560px]">
                <RoiMetric
                  label="Monthly Revenue"
                  value={formatCurrency(monthlyRoi.monthlyRevenue, profile.currency)}
                />
                <RoiMetric
                  label="Monthly Profit"
                  value={formatCurrency(monthlyRoi.monthlyProfit, profile.currency)}
                />
                <RoiMetric
                  label="Monthly Salary"
                  value={
                    monthlyRoi.hasSalary
                      ? formatCurrency(profile.monthlySalary, profile.currency)
                      : "Not set"
                  }
                />
              </div>
            </div>

            <div className="mt-5">
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${monthlyRoi.progressWidth}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {monthlyRoi.includedCreators.toLocaleString()} creator records included.
              </p>
            </div>
          </div>
        </Panel>
      </main>

      {editingDraft ? (
        <CampaignProfileModal
          draft={editingDraft}
          onChange={(patch) =>
            setEditingDraft((current) => (current ? { ...current, ...patch } : current))
          }
          onCancel={() => setEditingDraft(null)}
          onSubmit={saveCampaign}
        />
      ) : null}

      {editingProjectInfo ? (
        <ProjectInfoModal
          state={editingProjectInfo}
          status={projectInfoStatus}
          saving={projectInfoSaving}
          onChange={(patch) =>
            setEditingProjectInfo((current) =>
              current ? { ...current, record: { ...current.record, ...patch } } : current,
            )
          }
          onCancel={() => setEditingProjectInfo(null)}
          onSubmit={saveProjectInfo}
        />
      ) : null}
    </div>
  );
}

function ProjectInfoModal({
  state,
  status,
  saving,
  onChange,
  onCancel,
  onSubmit,
}: {
  state: ProjectInfoEditorState;
  status: string;
  saving: boolean;
  onChange: (patch: Partial<CampaignProjectInfoRecord>) => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [expandedSectionKey, setExpandedSectionKey] = useState<ProjectInfoTextKey | null>(null);
  const [copiedSectionKey, setCopiedSectionKey] = useState<ProjectInfoTextKey | null>(null);
  const expandedSection =
    projectInfoSections.find((section) => section.key === expandedSectionKey) ?? null;

  async function copyProjectInfoSection(section: (typeof projectInfoSections)[number]) {
    const value = state.record[section.key].trim();
    if (!value) return;

    try {
      await navigator.clipboard.writeText(value);
      setCopiedSectionKey(section.key);
      window.setTimeout(() => {
        setCopiedSectionKey((current) => (current === section.key ? null : current));
      }, 1400);
    } catch {
      setCopiedSectionKey(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 backdrop-blur-sm">
      <form
        onSubmit={onSubmit}
        className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl"
      >
        <div className="border-b border-border p-5">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Campaign Profiles / Project Info
              </p>
              <h2 className="mt-2 text-2xl font-semibold">{state.campaign.campaignName}</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground">
                  {state.campaign.campaignCode}
                </span>
                <span className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground">
                  {state.record.updatedAt
                    ? `Updated ${formatShortDate(state.record.updatedAt)}`
                    : "Not saved yet"}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="inline-flex h-10 items-center rounded-md border border-border bg-background px-4 text-sm font-medium transition hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Save className="size-4" />
                {saving ? "Saving..." : "Save Info"}
              </button>
            </div>
          </div>
          {status ? <p className="mt-3 text-xs text-muted-foreground">{status}</p> : null}
        </div>

        <div className="grid gap-4 p-5 xl:grid-cols-2">
          {projectInfoSections.map((section) => {
            const Icon = section.icon;
            const value = state.record[section.key];
            const hasValue = value.trim().length > 0;
            const copied = copiedSectionKey === section.key;
            return (
              <section
                key={section.key}
                className="flex min-h-[310px] flex-col rounded-xl border border-border bg-background/70 p-4 shadow-sm shadow-black/10"
              >
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="katlas-panel-icon shrink-0">
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold">{section.title}</h3>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {section.description}
                      </p>
                      <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/75">
                        {value.length.toLocaleString()} chars
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      disabled={!hasValue}
                      onClick={() => copyProjectInfoSection(section)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                      {copied ? "Copied" : "Copy"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpandedSectionKey(section.key)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium transition hover:bg-accent"
                    >
                      <Maximize2 className="size-3.5" />
                      View full
                    </button>
                  </div>
                </div>
                <textarea
                  value={value}
                  placeholder={section.placeholder}
                  rows={7}
                  onChange={(event) => onChange({ [section.key]: event.target.value })}
                  className="min-h-[170px] flex-1 resize-y rounded-lg border border-input bg-card px-3 py-3 text-sm leading-6 outline-none ring-ring placeholder:text-muted-foreground/60 focus:ring-2"
                />
              </section>
            );
          })}
        </div>

        {expandedSection ? (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/85 px-4 backdrop-blur-md">
            <section className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
              <div className="flex items-start justify-between gap-4 border-b border-border p-5">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Project Info / Full View
                  </p>
                  <h3 className="mt-2 text-xl font-semibold">{expandedSection.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {expandedSection.description}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setExpandedSectionKey(null)}
                  className="inline-flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-background transition hover:bg-accent"
                  aria-label="Close full view"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="flex-1 p-5">
                <textarea
                  value={state.record[expandedSection.key]}
                  placeholder={expandedSection.placeholder}
                  onChange={(event) => onChange({ [expandedSection.key]: event.target.value })}
                  className="h-[56vh] min-h-[360px] w-full resize-none rounded-xl border border-input bg-background px-4 py-4 text-sm leading-6 outline-none ring-ring placeholder:text-muted-foreground/60 focus:ring-2"
                />
              </div>

              <div className="flex flex-col gap-3 border-t border-border p-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs font-medium text-muted-foreground">
                  {state.record[expandedSection.key].length.toLocaleString()} characters
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={!state.record[expandedSection.key].trim()}
                    onClick={() => copyProjectInfoSection(expandedSection)}
                    className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {copiedSectionKey === expandedSection.key ? (
                      <Check className="size-4" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                    {copiedSectionKey === expandedSection.key ? "Copied" : "Copy"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpandedSectionKey(null)}
                    className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90"
                  >
                    Done
                  </button>
                </div>
              </div>
            </section>
          </div>
        ) : null}
      </form>
    </div>
  );
}

function CampaignProfileModal({
  draft,
  onChange,
  onCancel,
  onSubmit,
}: {
  draft: CampaignDraft;
  onChange: (patch: Partial<CampaignDraft>) => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 backdrop-blur-sm">
      <form
        onSubmit={onSubmit}
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              {draft.id ? "Edit Campaign" : "Add Campaign"}
            </p>
            <h2 className="mt-2 text-xl font-semibold">Campaign profile</h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium transition hover:bg-accent"
          >
            Cancel
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <TextInput
            label="Campaign Name"
            value={draft.campaignName}
            onChange={(campaignName) => onChange({ campaignName })}
            placeholder="Dola Thailand"
            required
          />
          <TextInput
            label="Campaign ID"
            value={draft.campaignCode}
            onChange={(campaignCode) => onChange({ campaignCode })}
            placeholder="DOLA-TH"
            required
          />
        </div>

        <div className="mt-5 border-t border-border pt-4">
          <p className="text-xs font-medium text-muted-foreground">Preferred Languages</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {campaignMemoryLanguages.map((language) => {
              const selected = draft.preferredLanguages.includes(language);
              return (
                <button
                  key={language}
                  type="button"
                  onClick={() =>
                    onChange({
                      preferredLanguages: selected
                        ? draft.preferredLanguages.filter((item) => item !== language)
                        : [...draft.preferredLanguages, language],
                    })
                  }
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  {language}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5 border-t border-border pt-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Memory Cards</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Store reusable campaign information for Creator Outreach.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                onChange({
                  memoryCards: [...draft.memoryCards, createCampaignMemoryCard("New Memory", "")],
                })
              }
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-medium transition hover:bg-accent"
            >
              <Plus className="size-3.5" />
              Add Card
            </button>
          </div>

          <div className="mt-3 space-y-3">
            {draft.memoryCards.map((card) => (
              <div key={card.id} className="rounded-lg border border-border bg-background p-3">
                <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                  <TextInput
                    label="Title"
                    value={card.title}
                    onChange={(title) =>
                      onChange({
                        memoryCards: draft.memoryCards.map((item) =>
                          item.id === card.id ? { ...item, title } : item,
                        ),
                      })
                    }
                  />
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() =>
                        onChange({
                          memoryCards: draft.memoryCards.filter((item) => item.id !== card.id),
                        })
                      }
                      className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-card px-3 text-xs font-medium transition hover:bg-accent"
                    >
                      <Trash2 className="size-3.5" />
                      Delete
                    </button>
                  </div>
                </div>
                <FieldLabel label="Content">
                  <textarea
                    value={card.content}
                    rows={4}
                    onChange={(event) =>
                      onChange({
                        memoryCards: draft.memoryCards.map((item) =>
                          item.id === card.id ? { ...item, content: event.target.value } : item,
                        ),
                      })
                    }
                    className="w-full resize-y rounded-md border border-input bg-card px-3 py-2 text-sm leading-6 outline-none ring-ring focus:ring-2"
                  />
                </FieldLabel>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-10 items-center rounded-md border border-border bg-background px-4 text-sm font-medium transition hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );
}

function Panel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <section className="katlas-panel">
      <div className="mb-4 flex items-center gap-2">
        <div className="katlas-panel-icon">
          <Icon className="size-4" />
        </div>
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function FieldLabel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function TextInput({
  label,
  value,
  placeholder,
  required,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <FieldLabel label={label}>
      <input
        value={value}
        placeholder={placeholder}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus:ring-2"
      />
    </FieldLabel>
  );
}

function TableHeader({ children }: { children: ReactNode }) {
  return <th className="px-4 py-3 font-medium">{children}</th>;
}

function TableCell({ children }: { children: ReactNode }) {
  return <td className="px-4 py-3 align-top">{children}</td>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r border-border px-4 first:pl-0 last:border-r-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function RoiMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <BadgeDollarSign className="size-3.5" />
        {label}
      </div>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
  );
}

function toDraft(campaign: GlobalCampaign): CampaignDraft {
  return {
    id: campaign.id,
    campaignName: campaign.campaignName,
    campaignCode: campaign.campaignCode,
    preferredLanguages: campaign.preferredLanguages,
    memoryCards: campaign.memoryCards,
  };
}

function createEmptyProjectInfoRecord(campaign: GlobalCampaign): CampaignProjectInfoRecord {
  return {
    infoId: createProjectInfoId(campaign.id),
    campaignId: campaign.id,
    projectBrief: "",
    productInformation: "",
    creatorPersonas: "",
    sop: "",
    scriptFilmingNotes: "",
    postingFinalisationNotes: "",
    createdAt: "",
    updatedAt: "",
  };
}

function createProjectInfoId(campaignId: string) {
  return `project-info-${campaignId}`;
}

function calculateMonthlyRoi(
  registry: GlobalCampaignRegistry,
  month: string,
  profile: EmployeeProfile,
) {
  const includedCreators = registry.creatorRecords.filter((record) => {
    const financials = calculateCreatorFinancials(record);
    return (
      record.month === month &&
      !["Dropped", "Cancelled", "Canceled"].includes(record.status) &&
      financials.profit > 0
    );
  });
  const monthlyRevenue = includedCreators.reduce((sum, record) => sum + record.externalQuote, 0);
  const monthlyProfit = includedCreators.reduce(
    (sum, record) => sum + calculateCreatorFinancials(record).profit,
    0,
  );
  const hasSalary = profile.monthlySalary > 0;
  const roi = hasSalary ? (monthlyProfit / profile.monthlySalary) * 100 : 0;

  return {
    monthlyRevenue,
    monthlyProfit,
    includedCreators: includedCreators.length,
    hasSalary,
    roi,
    progressWidth: hasSalary ? Math.max(0, Math.min(100, roi)) : 0,
  };
}

function getCurrentMonthValue() {
  return new Date().toISOString().slice(0, 7);
}

function formatCurrency(value: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency || "USD"} ${Math.round(value).toLocaleString()}`;
  }
}

function formatPercent(value: number) {
  return `${Math.round(value).toLocaleString()}%`;
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
