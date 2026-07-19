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
  Layers3,
  RotateCcw,
  Save,
  Star,
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
  deleteCampaignBatchFromGoogleSheetsOnly,
  listCampaignProjectInfoFromGoogleSheetsOnly,
  listEmployeeProfilesFromGoogleSheetsOnly,
  readCampaignBatches,
  readCampaignProfiles,
  saveCampaignBatchToGoogleSheetsOnly,
  saveCampaignProfileToGoogleSheetsOnly,
  saveCampaignProjectInfoToGoogleSheetsOnly,
} from "@/storage/appRepository";
import { createCampaignBatchRecord } from "@/storage/campaignBatches";
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
import type {
  CampaignBatchRecord,
  CampaignProfileRecord,
  CampaignProjectInfoRecord,
} from "@/storage/schema";
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

type CampaignBatchDraft = {
  batchId?: string;
  projectCode: string;
  batchName: string;
  isDefault: boolean;
  createdAt?: string;
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
  const [editingBatchCampaign, setEditingBatchCampaign] = useState<GlobalCampaign | null>(null);
  const [editingBatchDraft, setEditingBatchDraft] = useState<CampaignBatchDraft | null>(null);
  const [campaignBatches, setCampaignBatches] = useState<CampaignBatchRecord[]>(() =>
    readCampaignBatches(),
  );
  const [batchSaving, setBatchSaving] = useState(false);
  const [batchStatus, setBatchStatus] = useState("");
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
        setCampaignBatches(readCampaignBatches());
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
    let savedCampaign: GlobalCampaign;

    if (editingDraft.id) {
      const existingCampaign = registry.campaigns.find(
        (campaign) => campaign.id === editingDraft.id,
      );
      if (!existingCampaign) return;
      savedCampaign = {
        ...existingCampaign,
        campaignName: editingDraft.campaignName.trim(),
        campaignCode: existingCampaign.campaignCode,
        preferredLanguages: editingDraft.preferredLanguages,
        memoryCards: editingDraft.memoryCards,
        updatedAt: now,
      };
      setRegistry((current) => ({
        ...current,
        campaigns: current.campaigns.map((campaign) =>
          campaign.id === savedCampaign.id ? savedCampaign : campaign,
        ),
      }));
    } else {
      savedCampaign = {
        ...createCampaign(editingDraft.campaignName, editingDraft.campaignCode),
        preferredLanguages: editingDraft.preferredLanguages,
        memoryCards: editingDraft.memoryCards,
      };
      setRegistry((current) => ({
        ...current,
        campaigns: [savedCampaign, ...current.campaigns],
      }));
    }

    setEditingDraft(null);
    if (!editingDraft.id) {
      void syncDefaultBatchForCampaign(savedCampaign);
    }
  }

  async function syncDefaultBatchForCampaign(campaign: GlobalCampaign) {
    const existingBatches = campaignBatches.filter((batch) => batch.campaignId === campaign.id);
    const currentDefault =
      existingBatches.find((batch) => batch.isDefault === "TRUE") ?? existingBatches[0];
    const now = new Date().toISOString();
    const nextBatch = currentDefault
      ? {
          ...currentDefault,
          projectCode: campaign.campaignCode,
          isDefault: "TRUE",
          updatedAt: now,
        }
      : createCampaignBatchRecord({
          campaignId: campaign.id,
          projectCode: campaign.campaignCode,
          batchName: "b1",
          isDefault: true,
        });

    try {
      const records = await saveCampaignBatchToGoogleSheetsOnly(nextBatch);
      setCampaignBatches(records);
    } catch (error) {
      setBatchStatus(
        error instanceof Error ? error.message : "The default project code could not be saved.",
      );
    }
  }

  async function openBatchManager(campaign: GlobalCampaign) {
    setEditingBatchCampaign(campaign);
    setEditingBatchDraft(null);
    setBatchStatus("");

    const existingBatches = campaignBatches.filter((batch) => batch.campaignId === campaign.id);
    if (existingBatches.length || !campaign.campaignCode.trim()) return;

    setBatchSaving(true);
    setBatchStatus("Creating the initial project code...");
    try {
      const records = await saveCampaignBatchToGoogleSheetsOnly(
        createCampaignBatchRecord({
          campaignId: campaign.id,
          projectCode: campaign.campaignCode,
          batchName: "b1",
          isDefault: true,
        }),
      );
      setCampaignBatches(records);
      setBatchStatus("Initial project code ready.");
    } catch (error) {
      setBatchStatus(error instanceof Error ? error.message : "Project codes could not be loaded.");
    } finally {
      setBatchSaving(false);
    }
  }

  async function saveCampaignBatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingBatchCampaign || !editingBatchDraft?.projectCode.trim()) return;

    const projectCode = editingBatchDraft.projectCode.trim().toUpperCase();
    const batchName = editingBatchDraft.batchName.trim().toLowerCase();
    if (!/^b[1-9]\d*$/.test(batchName)) {
      setBatchStatus("Batch label must use the format b1, b2, b8, or b9.");
      return;
    }
    const campaignRecords = campaignBatches.filter(
      (batch) => batch.campaignId === editingBatchCampaign.id,
    );
    const duplicate = campaignRecords.some(
      (batch) =>
        batch.projectCode.toUpperCase() === projectCode &&
        batch.batchId !== editingBatchDraft.batchId,
    );
    if (duplicate) {
      setBatchStatus(`${projectCode} already exists for this campaign.`);
      return;
    }

    const now = new Date().toISOString();
    const record: CampaignBatchRecord = editingBatchDraft.batchId
      ? {
          batchId: editingBatchDraft.batchId,
          campaignId: editingBatchCampaign.id,
          projectCode,
          batchName,
          isDefault: editingBatchDraft.isDefault || campaignRecords.length === 1 ? "TRUE" : "FALSE",
          status: "active",
          createdAt: editingBatchDraft.createdAt || now,
          updatedAt: now,
        }
      : createCampaignBatchRecord({
          campaignId: editingBatchCampaign.id,
          projectCode,
          batchName,
          isDefault: editingBatchDraft.isDefault || campaignRecords.length === 0,
        });

    setBatchSaving(true);
    setBatchStatus("");
    try {
      const records = await saveCampaignBatchToGoogleSheetsOnly(record);
      setCampaignBatches(records);
      setEditingBatchDraft(null);
      setBatchStatus("Project code saved.");
      const savedRecord = records.find((batch) => batch.batchId === record.batchId) ?? record;
      if (savedRecord.isDefault === "TRUE") {
        await updateCampaignDefaultCode(editingBatchCampaign, savedRecord);
      }
    } catch (error) {
      setBatchStatus(
        error instanceof Error ? error.message : "The project code could not be saved.",
      );
    } finally {
      setBatchSaving(false);
    }
  }

  async function makeDefaultBatch(campaign: GlobalCampaign, batch: CampaignBatchRecord) {
    setBatchSaving(true);
    setBatchStatus("");
    try {
      const records = await saveCampaignBatchToGoogleSheetsOnly({
        ...batch,
        isDefault: "TRUE",
        updatedAt: new Date().toISOString(),
      });
      setCampaignBatches(records);
      const savedBatch = records.find((record) => record.batchId === batch.batchId) ?? batch;
      await updateCampaignDefaultCode(campaign, savedBatch);
      setBatchStatus(`${savedBatch.projectCode} is now the default project code.`);
    } catch (error) {
      setBatchStatus(
        error instanceof Error ? error.message : "The default project code could not be changed.",
      );
    } finally {
      setBatchSaving(false);
    }
  }

  async function updateCampaignDefaultCode(campaign: GlobalCampaign, batch: CampaignBatchRecord) {
    const now = new Date().toISOString();
    const existingProfile = readCampaignProfiles().find(
      (profileRecord) => profileRecord.campaignId === campaign.id,
    );
    const profileRecord: CampaignProfileRecord = {
      campaignId: campaign.id,
      campaignName: campaign.campaignName,
      campaignCode: batch.projectCode,
      country: existingProfile?.country ?? "",
      preferredLanguages: campaign.preferredLanguages.join(", "),
      status: campaign.status || existingProfile?.status || campaignActiveStatus,
      createdAt: existingProfile?.createdAt || campaign.createdAt || now,
      updatedAt: now,
    };
    await saveCampaignProfileToGoogleSheetsOnly(profileRecord);
    skipNextRegistrySave.current = true;
    setRegistry((current) => ({
      ...current,
      campaigns: current.campaigns.map((item) =>
        item.id === campaign.id
          ? { ...item, campaignCode: batch.projectCode, updatedAt: now }
          : item,
      ),
    }));
    setEditingBatchCampaign((current) =>
      current?.id === campaign.id
        ? { ...current, campaignCode: batch.projectCode, updatedAt: now }
        : current,
    );
  }

  async function deleteCampaignBatch(campaign: GlobalCampaign, batch: CampaignBatchRecord) {
    const campaignRecords = campaignBatches.filter((item) => item.campaignId === campaign.id);
    if (campaignRecords.length <= 1) {
      setBatchStatus("A campaign must keep at least one project code.");
      return;
    }
    if (batch.isDefault === "TRUE") {
      setBatchStatus("Choose another default project code before deleting this one.");
      return;
    }
    const assignedCreator = registry.creatorRecords.find(
      (record) =>
        record.campaignRegistryId === campaign.id &&
        (record.batchId === batch.batchId ||
          (!record.batchId && record.projectCode === batch.projectCode)),
    );
    if (assignedCreator) {
      setBatchStatus(
        `${batch.projectCode} is used by ${assignedCreator.creatorName || "a creator record"} and cannot be deleted.`,
      );
      return;
    }
    const confirmed =
      typeof window === "undefined" ||
      window.confirm(`Delete project code ${batch.projectCode}? This cannot be undone.`);
    if (!confirmed) return;

    setBatchSaving(true);
    setBatchStatus("");
    try {
      const records = await deleteCampaignBatchFromGoogleSheetsOnly(batch.batchId);
      setCampaignBatches(records);
      setEditingBatchDraft(null);
      setBatchStatus("Project code deleted.");
    } catch (error) {
      setBatchStatus(
        error instanceof Error ? error.message : "The project code could not be deleted.",
      );
    } finally {
      setBatchSaving(false);
    }
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
                Create and manage campaigns here. Each campaign can have multiple project codes for
                separate batches without becoming a duplicate campaign.
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
                  <TableHeader>Project Codes</TableHeader>
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
                        <div className="flex max-w-56 flex-wrap gap-1.5">
                          {campaignBatches.some((batch) => batch.campaignId === campaign.id) ? (
                            campaignBatches
                              .filter((batch) => batch.campaignId === campaign.id)
                              .sort(
                                (left, right) =>
                                  Number(right.isDefault === "TRUE") -
                                  Number(left.isDefault === "TRUE"),
                              )
                              .map((batch) => (
                                <span
                                  key={batch.batchId}
                                  className={`rounded-full border px-2 py-1 text-xs ${
                                    batch.isDefault === "TRUE"
                                      ? "border-primary/50 bg-primary/10 text-foreground"
                                      : "border-border bg-background text-muted-foreground"
                                  }`}
                                  title={batch.batchName || batch.projectCode}
                                >
                                  {batch.projectCode}
                                  {batch.isDefault === "TRUE" ? " · Default" : ""}
                                </span>
                              ))
                          ) : (
                            <span className="rounded-full border border-border bg-background px-2 py-1 text-xs">
                              {campaign.campaignCode}
                            </span>
                          )}
                        </div>
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
                            onClick={() => void openBatchManager(campaign)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium transition hover:bg-accent"
                          >
                            <Layers3 className="size-3.5" />
                            Project Codes
                          </button>
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

      {editingBatchCampaign ? (
        <CampaignBatchModal
          campaign={editingBatchCampaign}
          batches={campaignBatches.filter((batch) => batch.campaignId === editingBatchCampaign.id)}
          draft={editingBatchDraft}
          status={batchStatus}
          saving={batchSaving}
          onAdd={() =>
            setEditingBatchDraft({
              projectCode: "",
              batchName: "",
              isDefault: false,
            })
          }
          onEdit={(batch) =>
            setEditingBatchDraft({
              batchId: batch.batchId,
              projectCode: batch.projectCode,
              batchName: batch.batchName,
              isDefault: batch.isDefault === "TRUE",
              createdAt: batch.createdAt,
            })
          }
          onDraftChange={(patch) =>
            setEditingBatchDraft((current) => (current ? { ...current, ...patch } : current))
          }
          onCancelDraft={() => setEditingBatchDraft(null)}
          onMakeDefault={(batch) => void makeDefaultBatch(editingBatchCampaign, batch)}
          onDelete={(batch) => void deleteCampaignBatch(editingBatchCampaign, batch)}
          onClose={() => {
            setEditingBatchCampaign(null);
            setEditingBatchDraft(null);
            setBatchStatus("");
          }}
          onSubmit={saveCampaignBatch}
        />
      ) : null}
    </div>
  );
}

function CampaignBatchModal({
  campaign,
  batches,
  draft,
  status,
  saving,
  onAdd,
  onEdit,
  onDraftChange,
  onCancelDraft,
  onMakeDefault,
  onDelete,
  onClose,
  onSubmit,
}: {
  campaign: GlobalCampaign;
  batches: CampaignBatchRecord[];
  draft: CampaignBatchDraft | null;
  status: string;
  saving: boolean;
  onAdd: () => void;
  onEdit: (batch: CampaignBatchRecord) => void;
  onDraftChange: (patch: Partial<CampaignBatchDraft>) => void;
  onCancelDraft: () => void;
  onMakeDefault: (batch: CampaignBatchRecord) => void;
  onDelete: (batch: CampaignBatchRecord) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const sortedBatches = [...batches].sort(
    (left, right) =>
      Number(right.isDefault === "TRUE") - Number(left.isDefault === "TRUE") ||
      left.createdAt.localeCompare(right.createdAt),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 backdrop-blur-sm">
      <section className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Campaign Profiles / Project Codes
            </p>
            <h2 className="mt-2 text-xl font-semibold">{campaign.campaignName}</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Keep one campaign profile and add a separate code for each project batch.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-background transition hover:bg-accent"
            aria-label="Close project codes"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="p-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm font-semibold">Project codes</p>
              <p className="mt-1 text-xs text-muted-foreground">
                The default code is used only when an older creator record has no batch selected.
              </p>
            </div>
            <button
              type="button"
              onClick={onAdd}
              disabled={saving || Boolean(draft)}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="size-3.5" />
              Add Project Code
            </button>
          </div>

          <div className="mt-4 space-y-2">
            {sortedBatches.length ? (
              sortedBatches.map((batch) => (
                <div
                  key={batch.batchId}
                  className="flex flex-col gap-3 rounded-lg border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{batch.projectCode}</span>
                      {batch.isDefault === "TRUE" ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] font-medium">
                          <Star className="size-3 fill-current" />
                          Default
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {batch.batchName || "No batch label"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {batch.isDefault !== "TRUE" ? (
                      <button
                        type="button"
                        onClick={() => onMakeDefault(batch)}
                        disabled={saving}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium transition hover:bg-accent disabled:opacity-50"
                      >
                        <Star className="size-3.5" />
                        Set Default
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => onEdit(batch)}
                      disabled={saving || Boolean(draft)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium transition hover:bg-accent disabled:opacity-50"
                    >
                      <Pencil className="size-3.5" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(batch)}
                      disabled={saving || Boolean(draft)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium transition hover:bg-accent disabled:opacity-50"
                    >
                      <Trash2 className="size-3.5" />
                      Delete
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                {saving ? "Preparing the initial project code..." : "No project codes yet."}
              </div>
            )}
          </div>

          {draft ? (
            <form
              onSubmit={onSubmit}
              className="mt-4 rounded-lg border border-border bg-background p-4"
            >
              <p className="text-sm font-semibold">
                {draft.batchId ? "Edit project code" : "Add project code"}
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <TextInput
                  label="Project Code"
                  value={draft.projectCode}
                  placeholder="CCIT02"
                  required
                  onChange={(projectCode) => onDraftChange({ projectCode })}
                />
                <TextInput
                  label="Batch Label"
                  value={draft.batchName}
                  placeholder="b2"
                  required
                  onChange={(batchName) => onDraftChange({ batchName })}
                />
              </div>
              <label className="mt-3 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.isDefault}
                  onChange={(event) => onDraftChange({ isDefault: event.target.checked })}
                  className="size-4 accent-primary"
                />
                Use as the default code for this campaign
              </label>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onCancelDraft}
                  disabled={saving}
                  className="inline-flex h-9 items-center rounded-md border border-border bg-card px-3 text-xs font-medium transition hover:bg-accent disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !draft.projectCode.trim()}
                  className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Save className="size-3.5" />
                  {saving ? "Saving..." : "Save Project Code"}
                </button>
              </div>
            </form>
          ) : null}

          {status ? <p className="mt-4 text-xs text-muted-foreground">{status}</p> : null}
        </div>
      </section>
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
            label="Default Project Code"
            value={draft.campaignCode}
            onChange={(campaignCode) => onChange({ campaignCode })}
            placeholder="CCIT01"
            required
            disabled={Boolean(draft.id)}
          />
        </div>

        {draft.id ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Change the default or add another code from Project Codes in the campaign table.
          </p>
        ) : null}

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
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <FieldLabel label={label}>
      <input
        value={value}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
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
