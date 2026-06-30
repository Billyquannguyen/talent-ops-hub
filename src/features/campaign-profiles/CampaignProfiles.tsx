import { BadgeDollarSign, CalendarDays, Pencil, Plus, TrendingUp, Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { TopBar } from "@/components/TopBar";
import { listEmployeeProfilesFromGoogleSheetsOnly } from "@/storage/appRepository";
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

export function CampaignProfiles() {
  const [loaded, setLoaded] = useState(false);
  const [registry, setRegistry] = useState<GlobalCampaignRegistry>(() => loadCampaignRegistry());
  const [editingDraft, setEditingDraft] = useState<CampaignDraft | null>(null);
  const [roiMonth, setRoiMonth] = useState(() => getCurrentMonthValue());
  const [profile, setProfile] = useState<EmployeeProfile>(() => loadEmployeeProfile());
  const [roiStatus, setRoiStatus] = useState("Loading ROI data...");
  const skipNextRegistrySave = useRef(false);

  useEffect(() => {
    setRegistry(loadCampaignRegistry());
    setLoaded(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSharedRoiData() {
      try {
        const [nextRegistry, profileRecords] = await Promise.all([
          loadActiveCampaignRegistryFromGoogleSheetsOnly({ reason: "campaign-profiles:roi" }),
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

  const monthlyRoi = calculateMonthlyRoi(registry, roiMonth, profile);

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
            <div className="grid w-full gap-0 border-y border-border py-4 sm:grid-cols-2 lg:max-w-sm">
              <Metric label="Campaigns" value={registry.campaigns.length.toLocaleString()} />
              <Metric
                label="Creator Records"
                value={registry.creatorRecords.length.toLocaleString()}
              />
            </div>
          </div>
        </section>

        <Panel title="Campaign List" icon={Pencil}>
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm font-medium">Campaign profiles</p>
              <p className="mt-1 text-xs text-muted-foreground">
                This is the only place to create, edit, or delete campaigns.
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
                  <TableHeader>Preferred Languages</TableHeader>
                  <TableHeader>Memory Cards</TableHeader>
                  <TableHeader>Actions</TableHeader>
                </tr>
              </thead>
              <tbody>
                {registry.campaigns.length ? (
                  registry.campaigns.map((campaign) => (
                    <tr key={campaign.id} className="border-t border-border">
                      <TableCell>
                        <span className="font-medium">{campaign.campaignName}</span>
                      </TableCell>
                      <TableCell>
                        <span className="rounded-full border border-border bg-background px-2 py-1 text-xs">
                          {campaign.campaignCode}
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
                            onClick={() => setEditingDraft(toDraft(campaign))}
                            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium transition hover:bg-accent"
                          >
                            <Pencil className="size-3.5" />
                            Edit
                          </button>
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
                      colSpan={5}
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
