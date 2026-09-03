import {
  BadgeDollarSign,
  CircleCheck,
  CreditCard,
  HandCoins,
  ExternalLink,
  Gauge,
  Pencil,
  Percent,
  Plus,
  Trash2,
  TrendingUp,
  TriangleAlert,
  UsersRound,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";

import { TopBar } from "@/components/TopBar";
import {
  calculateCampaignSummary,
  calculateCreatorFinancials,
  createSelectedCreatorRecord,
  deleteSelectedCreatorRecordFromGoogleSheets,
  getCampaignCreators,
  loadCampaignRegistry,
  loadActiveCampaignRegistryFromGoogleSheetsOnly,
  saveSelectedCreatorRecordToGoogleSheets,
  selectedCreatorStatuses,
  updateSelectedCreatorRecordInGoogleSheets,
  type GlobalCampaign,
  type GlobalCampaignRegistry,
  type SelectedCreatorRecord,
  type SelectedCreatorStatus,
} from "@/lib/campaignRegistry";
import { readCampaignBatches } from "@/storage/appRepository";
import type { CampaignBatchRecord } from "@/storage/schema";

import { FeishuPaymentFormGenerator } from "./FeishuPaymentFormGenerator";
import { OngoingWorkloadMonitor } from "./OngoingWorkloadMonitor";

const allCampaignsSelectionId = "all-campaigns";

const statusSelectStyles: Record<SelectedCreatorStatus, string> = {
  "Contract signed": "border-sky-400/40 bg-sky-400/10 text-sky-200",
  Script: "border-violet-400/40 bg-violet-400/10 text-violet-200",
  Draft: "border-amber-400/40 bg-amber-400/10 text-amber-200",
  Posted: "border-cyan-400/40 bg-cyan-400/10 text-cyan-100",
  Invoicing: "border-orange-400/40 bg-orange-400/10 text-orange-200",
  "Fully paid": "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
};

const controlClassName =
  "h-10 w-full rounded-md border border-input bg-background/80 px-3 text-sm outline-none ring-ring transition-colors focus:border-ring focus:ring-2";
const tableActionClassName =
  "inline-flex h-8 items-center gap-1.5 rounded-md border border-border/80 bg-background/65 px-2.5 text-xs font-medium transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring";

export function ActiveCampaignManagement({
  initialCampaignId = "",
}: {
  initialCampaignId?: string;
}) {
  const [registry, setRegistry] = useState<GlobalCampaignRegistry>(() => loadCampaignRegistry());
  const [campaignBatches, setCampaignBatches] = useState<CampaignBatchRecord[]>(() =>
    readCampaignBatches(),
  );
  const [selectedCampaignId, setSelectedCampaignId] = useState(
    initialCampaignId || allCampaignsSelectionId,
  );
  const [editingRecord, setEditingRecord] = useState<SelectedCreatorRecord | null>(null);
  const [postedStatusRequest, setPostedStatusRequest] = useState<{
    record: SelectedCreatorRecord;
    liveLink: string;
  } | null>(null);
  const [paymentFormContext, setPaymentFormContext] = useState<{
    record: SelectedCreatorRecord;
    campaign: GlobalCampaign;
  } | null>(null);
  const [storageMessage, setStorageMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    const currentRegistry = loadCampaignRegistry();
    setRegistry(currentRegistry);
    setSelectedCampaignId((current) => {
      const requestedSelection = initialCampaignId || current || allCampaignsSelectionId;
      if (requestedSelection === allCampaignsSelectionId) return allCampaignsSelectionId;
      return currentRegistry.campaigns.some((campaign) => campaign.id === requestedSelection)
        ? requestedSelection
        : allCampaignsSelectionId;
    });
    void (async () => {
      try {
        const googleRegistry = await loadActiveCampaignRegistryFromGoogleSheetsOnly({
          reason: "active-campaigns:load",
        });
        if (cancelled) return;
        setRegistry(googleRegistry);
        setCampaignBatches(readCampaignBatches());
        setSelectedCampaignId((current) => {
          const requestedSelection = initialCampaignId || current || allCampaignsSelectionId;
          if (requestedSelection === allCampaignsSelectionId) return allCampaignsSelectionId;
          return googleRegistry.campaigns.some((campaign) => campaign.id === requestedSelection)
            ? requestedSelection
            : allCampaignsSelectionId;
        });
      } catch (error) {
        if (cancelled) return;
        setStorageMessage(
          error instanceof Error
            ? error.message
            : "Google Sheets is unavailable. Creator records were not refreshed.",
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initialCampaignId]);

  const hasCampaignProfiles = registry.campaigns.length > 0;
  const isAllCampaignsView = selectedCampaignId === allCampaignsSelectionId;
  const selectedCampaign = isAllCampaignsView
    ? undefined
    : registry.campaigns.find((campaign) => campaign.id === selectedCampaignId);
  const campaignById = useMemo(
    () => new Map(registry.campaigns.map((campaign) => [campaign.id, campaign])),
    [registry.campaigns],
  );
  const visibleCreatorRecords = useMemo(
    () =>
      isAllCampaignsView
        ? registry.creatorRecords
        : selectedCampaign
          ? getCampaignCreators(registry, selectedCampaign.id)
          : [],
    [isAllCampaignsView, registry, selectedCampaign],
  );
  const visibleSummary = useMemo(
    () => calculateCampaignSummary(visibleCreatorRecords),
    [visibleCreatorRecords],
  );
  const modalCampaign = editingRecord ? campaignById.get(editingRecord.campaignRegistryId) : null;
  const batchesByCampaignId = useMemo(() => {
    const grouped = new Map<string, CampaignBatchRecord[]>();
    campaignBatches.forEach((batch) => {
      const records = grouped.get(batch.campaignId) ?? [];
      records.push(batch);
      grouped.set(batch.campaignId, records);
    });
    grouped.forEach((records) =>
      records.sort(
        (left, right) => Number(right.isDefault === "TRUE") - Number(left.isDefault === "TRUE"),
      ),
    );
    return grouped;
  }, [campaignBatches]);

  function openNewCreator() {
    if (!selectedCampaign) return;
    const batches = batchesByCampaignId.get(selectedCampaign.id) ?? [];
    const defaultBatch = batches.find((batch) => batch.isDefault === "TRUE") ?? batches[0];
    setEditingRecord(
      createSelectedCreatorRecord(selectedCampaign.id, {
        batchId: defaultBatch?.batchId ?? "",
        projectCode: defaultBatch?.projectCode ?? selectedCampaign.campaignCode,
      }),
    );
  }

  async function saveCreatorRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingRecord || !editingRecord.creatorName.trim()) return;
    const campaign = campaignById.get(editingRecord.campaignRegistryId);
    if (!campaign) return;
    const availableBatches = batchesByCampaignId.get(editingRecord.campaignRegistryId) ?? [];
    const selectedBatch =
      availableBatches.find((batch) => batch.batchId === editingRecord.batchId) ??
      availableBatches.find((batch) => batch.projectCode === editingRecord.projectCode) ??
      availableBatches.find((batch) => batch.isDefault === "TRUE") ??
      availableBatches[0];
    const now = new Date().toISOString();
    const savedRecord = {
      ...editingRecord,
      batchId: selectedBatch?.batchId ?? editingRecord.batchId,
      projectCode: selectedBatch?.projectCode ?? editingRecord.projectCode ?? campaign.campaignCode,
      draftLink: "",
      updatedAt: now,
    };

    try {
      const exists = registry.creatorRecords.some((record) => record.id === savedRecord.id);
      const previousRecord = registry.creatorRecords.find((record) => record.id === savedRecord.id);
      const nextCreatorRecords = exists
        ? await updateSelectedCreatorRecordInGoogleSheets(savedRecord)
        : await saveSelectedCreatorRecordToGoogleSheets(savedRecord);
      setRegistry((current) => ({
        ...current,
        creatorRecords: filterCreatorRecordsByCampaigns(nextCreatorRecords, current.campaigns),
      }));
      setEditingRecord(null);
      setStorageMessage("Creator record saved.");
      if (savedRecord.status === "Invoicing" && previousRecord?.status !== "Invoicing") {
        setPaymentFormContext({ record: savedRecord, campaign });
      }
    } catch (error) {
      setStorageMessage(
        error instanceof Error
          ? error.message
          : "Google Sheets save failed. Creator record was not saved.",
      );
    }
  }

  async function deleteCreatorRecord(recordId: string) {
    const confirmed =
      typeof window === "undefined" ||
      window.confirm("Delete this selected creator record from the campaign?");
    if (!confirmed) return;

    try {
      const nextCreatorRecords = await deleteSelectedCreatorRecordFromGoogleSheets(recordId);
      setRegistry((current) => ({
        ...current,
        creatorRecords: filterCreatorRecordsByCampaigns(nextCreatorRecords, current.campaigns),
      }));
      setEditingRecord((current) => (current?.id === recordId ? null : current));
      setStorageMessage("Creator record deleted.");
    } catch (error) {
      setStorageMessage(
        error instanceof Error
          ? error.message
          : "Google Sheets delete failed. Creator record was not deleted.",
      );
    }
  }

  async function updateCreatorRecordStatus(
    record: SelectedCreatorRecord,
    status: SelectedCreatorStatus,
    liveLink = record.liveLink,
  ): Promise<SelectedCreatorRecord | null> {
    const updatedRecord = {
      ...record,
      status,
      liveLink,
      updatedAt: new Date().toISOString(),
    };

    try {
      const nextCreatorRecords = await updateSelectedCreatorRecordInGoogleSheets(updatedRecord);
      setRegistry((current) => ({
        ...current,
        creatorRecords: filterCreatorRecordsByCampaigns(nextCreatorRecords, current.campaigns),
      }));
      setStorageMessage(`Status updated to ${status}.`);
      return updatedRecord;
    } catch (error) {
      setStorageMessage(
        error instanceof Error
          ? error.message
          : "Google Sheets save failed. Status was not updated.",
      );
      return null;
    }
  }

  function requestStatusChange(record: SelectedCreatorRecord, status: SelectedCreatorStatus) {
    if (record.status === status) return;
    if (status === "Posted") {
      setPostedStatusRequest({ record, liveLink: record.liveLink });
      return;
    }
    if (status === "Invoicing") {
      void (async () => {
        const updatedRecord = await updateCreatorRecordStatus(record, status);
        if (updatedRecord) openPaymentForm(updatedRecord);
      })();
      return;
    }
    void updateCreatorRecordStatus(record, status);
  }

  function openPaymentForm(record: SelectedCreatorRecord) {
    const campaign = campaignById.get(record.campaignRegistryId);
    if (!campaign) {
      setStorageMessage("Campaign profile is missing. Payment form could not open.");
      return;
    }
    setPaymentFormContext({ record, campaign });
  }

  async function savePaymentFormLiveLink(record: SelectedCreatorRecord, liveLink: string) {
    const normalizedLiveLink = liveLink.trim();
    if (normalizedLiveLink === record.liveLink.trim()) return;

    const updatedRecord = {
      ...record,
      liveLink: normalizedLiveLink,
      updatedAt: new Date().toISOString(),
    };

    try {
      const nextCreatorRecords = await updateSelectedCreatorRecordInGoogleSheets(updatedRecord);
      setRegistry((current) => ({
        ...current,
        creatorRecords: filterCreatorRecordsByCampaigns(nextCreatorRecords, current.campaigns),
      }));
      setPaymentFormContext((current) =>
        current?.record.id === updatedRecord.id ? { ...current, record: updatedRecord } : current,
      );
      setStorageMessage("Live link saved to the creator record.");
    } catch (error) {
      setStorageMessage(
        error instanceof Error
          ? error.message
          : "Google Sheets save failed. Live link was not updated.",
      );
      throw error;
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <TopBar />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[300px] bg-hero-glow opacity-70" />

      <main className="katlas-page gap-4">
        <section className="rounded-xl border border-border/80 bg-card/75 px-4 py-4 shadow-[0_18px_55px_rgba(0,0,0,0.2)] backdrop-blur-xl md:px-5">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Active Campaign Management
              </p>
              <h1 className="mt-1.5 text-2xl font-semibold leading-tight tracking-tight md:text-3xl">
                Campaign delivery
              </h1>
              <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
                Track selected creators from contract signing through final payment.
              </p>
            </div>
            <div className="w-full lg:max-w-xs">
              <FieldLabel label="Campaign view">
                <select
                  value={selectedCampaignId}
                  onChange={(event) => setSelectedCampaignId(event.target.value)}
                  className={controlClassName}
                >
                  <option value={allCampaignsSelectionId}>All Campaigns</option>
                  {registry.campaigns.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.campaignName}
                    </option>
                  ))}
                </select>
              </FieldLabel>
            </div>
          </div>
        </section>

        {hasCampaignProfiles ? (
          <>
            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <SummaryCard
                label="Selected Creators"
                value={visibleSummary.totalCreators.toLocaleString()}
                icon={UsersRound}
              />
              <SummaryCard
                label="Creator Cost"
                value={formatCurrency(visibleSummary.totalSpend)}
                icon={BadgeDollarSign}
              />
              <SummaryCard
                label="Revenue"
                value={formatCurrency(visibleSummary.totalExternalQuote)}
                icon={HandCoins}
              />
              <SummaryCard
                label="Total Profit"
                value={formatCurrency(visibleSummary.totalProfit)}
                icon={TrendingUp}
              />
              <SummaryCard
                label="Average Profit Margin"
                value={formatPercent(visibleSummary.averageMargin)}
                icon={Percent}
              />
              <ProjectProgressCard
                finished={visibleSummary.finishedProjects}
                ongoing={visibleSummary.ongoingProjects}
              />
            </section>

            <section className="overflow-hidden rounded-xl border border-border/80 bg-card/80 shadow-[0_18px_50px_rgba(0,0,0,0.18)] backdrop-blur-sm">
              <div className="flex flex-col justify-between gap-4 border-b border-border/70 px-4 py-4 sm:flex-row sm:items-center md:px-5">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="katlas-panel-icon">
                      <UsersRound className="size-4" />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold">Creator records</h2>
                      <p className="text-xs text-muted-foreground">
                        {visibleCreatorRecords.length.toLocaleString()} records in this view
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-sm font-medium">
                    {selectedCampaign
                      ? `${selectedCampaign.campaignName} | ${selectedCampaign.campaignCode}`
                      : "All Campaigns"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {selectedCampaign
                      ? "Showing the selected creators for this campaign."
                      : "Choose one campaign to add a creator or narrow the table."}
                  </p>
                </div>
                {selectedCampaign ? (
                  <button
                    type="button"
                    onClick={openNewCreator}
                    className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                  >
                    <Plus className="size-4" />
                    Add Creator
                  </button>
                ) : (
                  <p className="rounded-md border border-border/80 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
                    Select one campaign to add a creator.
                  </p>
                )}
              </div>

              <CreatorRecordsTable
                records={visibleCreatorRecords}
                campaignById={campaignById}
                batchesByCampaignId={batchesByCampaignId}
                showCampaignColumn={isAllCampaignsView}
                onEdit={setEditingRecord}
                onStatusChange={requestStatusChange}
                onPaymentForm={openPaymentForm}
              />
              {storageMessage ? <StorageMessage message={storageMessage} /> : null}
            </section>
          </>
        ) : (
          <section className="katlas-panel p-6 text-sm text-muted-foreground">
            No campaign profiles exist yet. Create one in Campaign Profiles first.
          </section>
        )}
      </main>

      {editingRecord && modalCampaign ? (
        <CreatorRecordModal
          record={editingRecord}
          campaignName={modalCampaign.campaignName}
          campaignCode={modalCampaign.campaignCode}
          campaignBatches={batchesByCampaignId.get(modalCampaign.id) ?? []}
          onChange={setEditingRecord}
          onCancel={() => setEditingRecord(null)}
          onSubmit={saveCreatorRecord}
          canDelete={registry.creatorRecords.some((record) => record.id === editingRecord.id)}
          onDelete={(recordId) => {
            void deleteCreatorRecord(recordId);
          }}
        />
      ) : null}
      {postedStatusRequest ? (
        <PostedLiveLinkModal
          creatorName={postedStatusRequest.record.creatorName}
          liveLink={postedStatusRequest.liveLink}
          onCancel={() => setPostedStatusRequest(null)}
          onSubmit={(liveLink) => {
            const record = postedStatusRequest.record;
            setPostedStatusRequest(null);
            void updateCreatorRecordStatus(record, "Posted", liveLink);
          }}
        />
      ) : null}
      {paymentFormContext ? (
        <FeishuPaymentFormGenerator
          record={paymentFormContext.record}
          campaign={paymentFormContext.campaign}
          campaignBatches={batchesByCampaignId.get(paymentFormContext.campaign.id) ?? []}
          onSaveLiveLink={(liveLink) =>
            savePaymentFormLiveLink(paymentFormContext.record, liveLink)
          }
          onClose={() => setPaymentFormContext(null)}
        />
      ) : null}
    </div>
  );
}

function filterCreatorRecordsByCampaigns(
  records: SelectedCreatorRecord[],
  campaigns: GlobalCampaign[],
): SelectedCreatorRecord[] {
  const campaignIds = new Set(campaigns.map((campaign) => campaign.id));
  return records.filter((record) => campaignIds.has(record.campaignRegistryId));
}

function CreatorRecordsTable({
  records,
  campaignById,
  batchesByCampaignId,
  showCampaignColumn,
  onEdit,
  onStatusChange,
  onPaymentForm,
}: {
  records: SelectedCreatorRecord[];
  campaignById: Map<string, GlobalCampaign>;
  batchesByCampaignId: Map<string, CampaignBatchRecord[]>;
  showCampaignColumn: boolean;
  onEdit: (record: SelectedCreatorRecord) => void;
  onStatusChange: (record: SelectedCreatorRecord, status: SelectedCreatorStatus) => void;
  onPaymentForm: (record: SelectedCreatorRecord) => void;
}) {
  if (!records.length) {
    return (
      <div className="px-4 py-12 text-center md:px-5">
        <div className="mx-auto grid size-11 place-items-center rounded-full border border-border bg-background/60 text-muted-foreground">
          <UsersRound className="size-5" />
        </div>
        <p className="mt-3 text-sm font-medium">No creators in this view</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Select a campaign and add its first contracted creator.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[1080px] border-collapse text-left text-sm">
          <thead className="bg-background/55 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
            <tr>
              <TableHeader>Creator</TableHeader>
              <TableHeader>{showCampaignColumn ? "Campaign / Project" : "Project"}</TableHeader>
              <TableHeader>Performance</TableHeader>
              <TableHeader>Commercials</TableHeader>
              <TableHeader>Profit</TableHeader>
              <TableHeader>Delivery</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader align="right">Actions</TableHeader>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => {
              const financials = calculateCreatorFinancials(record);
              const campaign = campaignById.get(record.campaignRegistryId);
              const currentBatch = (batchesByCampaignId.get(record.campaignRegistryId) ?? []).find(
                (batch) => batch.batchId === record.batchId,
              );
              const projectCode =
                currentBatch?.projectCode ||
                record.projectCode ||
                campaign?.campaignCode ||
                "No project code";

              return (
                <tr
                  key={record.id}
                  className="border-t border-border/70 transition-colors hover:bg-accent/20"
                >
                  <TableCell>
                    <CreatorNameLink name={record.creatorName} href={record.creatorLink} />
                    <p className="mt-1 max-w-52 truncate text-xs text-muted-foreground">
                      {record.notes || "No notes"}
                    </p>
                  </TableCell>
                  <TableCell>
                    {showCampaignColumn ? (
                      <p className="max-w-44 truncate font-medium">
                        {campaign?.campaignName ?? "Unknown campaign"}
                      </p>
                    ) : null}
                    <span className="mt-1 inline-flex rounded-full border border-border/80 bg-background/70 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {projectCode}
                    </span>
                  </TableCell>
                  <TableCell>
                    <DataPair label="Avg views" value={formatNumber(record.avgViews)} />
                    <DataPair label="CPM" value={formatCpm(financials.cpm)} />
                  </TableCell>
                  <TableCell>
                    <DataPair
                      label="Creator"
                      value={formatPaymentAmount(
                        record.creatorPaymentAmount,
                        record.creatorPaymentCurrency,
                      )}
                    />
                    <DataPair label="Cost" value={formatCurrency(record.internalQuote)} />
                    <DataPair label="Quote" value={formatCurrency(record.externalQuote)} strong />
                  </TableCell>
                  <TableCell>
                    <p className="font-semibold tabular-nums">
                      {formatCurrency(financials.profit)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatPercent(financials.profitMargin)} margin
                    </p>
                  </TableCell>
                  <TableCell>
                    <p className="text-xs font-medium">{formatMonth(record.month)}</p>
                    <div className="mt-1">
                      <InlineLink href={record.liveLink} label="Live content" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusSelect
                      status={record.status}
                      onChange={(status) => onStatusChange(record, status)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => onEdit(record)}
                        className={tableActionClassName}
                      >
                        <Pencil className="size-3.5" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => onPaymentForm(record)}
                        className={tableActionClassName}
                      >
                        <CreditCard className="size-3.5" />
                        Payment
                      </button>
                    </div>
                  </TableCell>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-border/70 lg:hidden">
        {records.map((record) => {
          const financials = calculateCreatorFinancials(record);
          const campaign = campaignById.get(record.campaignRegistryId);
          const currentBatch = (batchesByCampaignId.get(record.campaignRegistryId) ?? []).find(
            (batch) => batch.batchId === record.batchId,
          );
          const projectCode =
            currentBatch?.projectCode ||
            record.projectCode ||
            campaign?.campaignCode ||
            "No project code";

          return (
            <article key={record.id} className="p-4 md:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <CreatorNameLink name={record.creatorName} href={record.creatorLink} />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {showCampaignColumn && campaign ? `${campaign.campaignName} · ` : ""}
                    {projectCode}
                  </p>
                </div>
                <StatusSelect
                  status={record.status}
                  onChange={(status) => onStatusChange(record, status)}
                />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                <MobileMetric label="Avg views" value={formatNumber(record.avgViews)} />
                <MobileMetric label="Client quote" value={formatCurrency(record.externalQuote)} />
                <MobileMetric label="Profit" value={formatCurrency(financials.profit)} />
                <MobileMetric label="Margin" value={formatPercent(financials.profitMargin)} />
              </div>

              {record.notes ? (
                <p className="mt-4 text-xs leading-5 text-muted-foreground">{record.notes}</p>
              ) : null}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">{formatMonth(record.month)}</span>
                  <InlineLink href={record.liveLink} label="Live content" />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onEdit(record)}
                    className={tableActionClassName}
                  >
                    <Pencil className="size-3.5" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => onPaymentForm(record)}
                    className={tableActionClassName}
                  >
                    <CreditCard className="size-3.5" />
                    Payment
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

function CreatorRecordModal({
  record,
  campaignName,
  campaignCode,
  campaignBatches,
  onChange,
  onCancel,
  onSubmit,
  canDelete,
  onDelete,
}: {
  record: SelectedCreatorRecord;
  campaignName: string;
  campaignCode: string;
  campaignBatches: CampaignBatchRecord[];
  onChange: (record: SelectedCreatorRecord) => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  canDelete: boolean;
  onDelete: (recordId: string) => void;
}) {
  const financials = calculateCreatorFinancials(record);
  const selectedBatch =
    campaignBatches.find((batch) => batch.batchId === record.batchId) ??
    campaignBatches.find((batch) => batch.projectCode === record.projectCode) ??
    campaignBatches.find((batch) => batch.isDefault === "TRUE") ??
    campaignBatches[0];
  const selectedBatchValue =
    selectedBatch?.batchId || `legacy:${record.projectCode || campaignCode}`;

  function patchRecord(patch: Partial<SelectedCreatorRecord>) {
    onChange({ ...record, ...patch });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 p-3 backdrop-blur-sm md:p-6">
      <form
        onSubmit={onSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="creator-record-title"
        className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-border/90 bg-card p-4 shadow-2xl md:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Creator Record</p>
            <h2 id="creator-record-title" className="mt-2 text-xl font-semibold">
              {record.creatorName || "Add creator"}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Campaign is locked to {campaignName}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close creator record"
            className="grid size-9 shrink-0 place-items-center rounded-md border border-border bg-background/70 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-5 rounded-lg border border-border/70 bg-background/25 p-4">
          <div className="mb-4">
            <h3 className="text-sm font-semibold">Creator and delivery</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Identity, campaign batch, performance and publishing details.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <FieldLabel label="Project Code / Batch">
              <select
                value={selectedBatchValue}
                onChange={(event) => {
                  const batch = campaignBatches.find(
                    (candidate) => candidate.batchId === event.target.value,
                  );
                  patchRecord({
                    batchId: batch?.batchId ?? "",
                    projectCode: batch?.projectCode ?? campaignCode,
                  });
                }}
                required
                className={controlClassName}
              >
                {!campaignBatches.length ? (
                  <option value={`legacy:${record.projectCode || campaignCode}`}>
                    {record.projectCode || campaignCode || "No project code"}
                  </option>
                ) : null}
                {campaignBatches.map((batch) => (
                  <option key={batch.batchId} value={batch.batchId}>
                    {batch.projectCode}
                    {batch.batchName ? ` | ${batch.batchName}` : ""}
                    {batch.isDefault === "TRUE" ? " | Default" : ""}
                  </option>
                ))}
              </select>
            </FieldLabel>
            <TextInput
              label="Creator Name"
              value={record.creatorName}
              onChange={(creatorName) => patchRecord({ creatorName })}
              required
            />
            <TextInput
              label="Creator Link"
              value={record.creatorLink}
              onChange={(creatorLink) => patchRecord({ creatorLink })}
            />
            <NumberInput
              label="Avg Views"
              value={record.avgViews}
              onChange={(avgViews) => patchRecord({ avgViews })}
            />
            <NumberInput
              label="Creator Payment Amount"
              value={record.creatorPaymentAmount}
              onChange={(creatorPaymentAmount) => patchRecord({ creatorPaymentAmount })}
            />
            <TextInput
              label="Creator Payment Currency"
              value={record.creatorPaymentCurrency}
              onChange={(creatorPaymentCurrency) =>
                patchRecord({ creatorPaymentCurrency: creatorPaymentCurrency.toUpperCase() })
              }
              required
            />
            <NumberInput
              label="Internal Cost USD"
              value={record.internalQuote}
              onChange={(internalQuote) => patchRecord({ internalQuote })}
            />
            <NumberInput
              label="Client Quote USD"
              value={record.externalQuote}
              onChange={(externalQuote) => patchRecord({ externalQuote })}
            />
            <MonthInput
              label="Month"
              value={record.month}
              onChange={(month) => patchRecord({ month })}
            />
            <FieldLabel label="Status">
              <select
                value={record.status}
                onChange={(event) =>
                  patchRecord({ status: event.target.value as SelectedCreatorStatus })
                }
                className={`h-10 w-full rounded-md border px-3 text-sm font-medium outline-none ring-ring focus:ring-2 ${statusSelectStyles[record.status]}`}
              >
                {selectedCreatorStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </FieldLabel>
            <TextInput
              label="Live Link"
              value={record.liveLink}
              onChange={(liveLink) => patchRecord({ liveLink })}
            />
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <CompactFinancial label="CPM" value={formatCpm(financials.cpm)} />
          <CompactFinancial label="Profit" value={formatCurrency(financials.profit)} />
          <CompactFinancial label="Profit margin" value={formatPercent(financials.profitMargin)} />
        </div>

        <div className="mt-4">
          <FieldLabel label="Notes">
            <textarea
              value={record.notes}
              rows={4}
              onChange={(event) => patchRecord({ notes: event.target.value })}
              className="w-full resize-y rounded-md border border-input bg-background/80 px-3 py-2 text-sm leading-6 outline-none ring-ring transition-colors focus:border-ring focus:ring-2"
            />
          </FieldLabel>
        </div>

        <div className="mt-5 flex flex-col-reverse justify-between gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-center">
          {canDelete ? (
            <button
              type="button"
              onClick={() => onDelete(record.id)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-4 text-sm font-medium text-destructive transition hover:bg-destructive/15"
            >
              <Trash2 className="size-4" />
              Delete creator
            </button>
          ) : (
            <span />
          )}
          <div className="flex justify-end gap-2">
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
        </div>
      </form>
    </div>
  );
}

function PostedLiveLinkModal({
  creatorName,
  liveLink,
  onCancel,
  onSubmit,
}: {
  creatorName: string;
  liveLink: string;
  onCancel: () => void;
  onSubmit: (liveLink: string) => void;
}) {
  const [value, setValue] = useState(liveLink);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/85 p-4 backdrop-blur-sm">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(value.trim());
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="posted-live-link-title"
        className="w-full max-w-md rounded-xl border border-border/90 bg-card p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Posted content</p>
            <h2 id="posted-live-link-title" className="mt-2 text-xl font-semibold">
              Add live link
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close live link form"
            className="grid size-9 shrink-0 place-items-center rounded-md border border-border bg-background/70 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {creatorName || "This creator"} is marked as Posted. Add the live link so the campaign
          record stays useful.
        </p>
        <div className="mt-4">
          <TextInput label="Live Link" value={value} onChange={setValue} required />
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
            Save Posted
          </button>
        </div>
      </form>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="rounded-xl border border-border/80 bg-card/75 p-4 shadow-[0_12px_35px_rgba(0,0,0,0.14)]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {Icon ? (
          <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-border/70 bg-background/55 text-muted-foreground">
            <Icon className="size-4" />
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
    </div>
  );
}

function ProjectProgressCard({ finished, ongoing }: { finished: number; ongoing: number }) {
  return (
    <div className="min-w-0 rounded-xl border border-border/80 bg-card/75 p-4 shadow-[0_12px_35px_rgba(0,0,0,0.14)] md:col-span-2 xl:col-span-5">
      <div className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-lg border border-border/70 bg-background/55 text-muted-foreground">
          <Gauge className="size-4" />
        </span>
        <div>
          <p className="text-sm font-semibold">Project progress</p>
          <p className="text-xs text-muted-foreground">Current delivery workload</p>
        </div>
      </div>
      <div className="mt-4 grid min-w-0 grid-cols-2 gap-4 sm:grid-cols-[120px_120px_minmax(0,1fr)] sm:items-center sm:gap-5">
        <ProgressMetric label="Finished" value={finished} tone="success" />
        <ProgressMetric label="Ongoing" value={ongoing} tone="active" />
        <div className="col-span-2 min-w-0 border-t border-border/70 pt-4 sm:col-span-1 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
          <OngoingWorkloadMonitor count={ongoing} />
        </div>
      </div>
    </div>
  );
}

function ProgressMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "active";
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/40 px-3 py-3">
      <div className="flex items-center gap-2">
        <span
          className={`size-2 rounded-full ${tone === "success" ? "bg-emerald-400" : "bg-cyan-400"}`}
        />
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p>
    </div>
  );
}

function CompactFinancial({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/45 px-3 py-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-base font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function DataPair({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "font-semibold text-foreground" : "font-medium text-foreground"}>
        {value}
      </span>
    </div>
  );
}

function MobileMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function CreatorNameLink({ name, href }: { name: string; href: string }) {
  if (!href.trim()) return <p className="font-semibold">{name || "Unnamed creator"}</p>;

  return (
    <a
      href={normalizeUrl(href)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex max-w-52 items-center gap-1.5 font-semibold underline-offset-4 transition-colors hover:text-emerald-300 hover:underline"
    >
      <span className="truncate">{name || "Unnamed creator"}</span>
      <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
    </a>
  );
}

function StorageMessage({ message }: { message: string }) {
  const isError = /error|failed|unavailable|missing|unsupported/i.test(message);
  const Icon = isError ? TriangleAlert : CircleCheck;

  return (
    <div
      role="status"
      className={`flex items-center gap-2 border-t px-4 py-3 text-xs md:px-5 ${
        isError
          ? "border-rose-400/20 bg-rose-400/5 text-rose-200"
          : "border-emerald-400/20 bg-emerald-400/5 text-emerald-200"
      }`}
    >
      <Icon className="size-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function FieldLabel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-foreground/75">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function TextInput({
  label,
  value,
  required,
  onChange,
}: {
  label: string;
  value: string;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <FieldLabel label={label}>
      <input
        value={value}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        className={controlClassName}
      />
    </FieldLabel>
  );
}

function NumberInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <FieldLabel label={label}>
      <input
        value={value || ""}
        type="number"
        min="0"
        step="0.01"
        onChange={(event) => onChange(Number(event.target.value))}
        className={controlClassName}
      />
    </FieldLabel>
  );
}

function MonthInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <FieldLabel label={label}>
      <input
        value={value}
        type="month"
        onChange={(event) => onChange(event.target.value)}
        className={controlClassName}
      />
    </FieldLabel>
  );
}

function TableHeader({
  children,
  align = "left",
}: {
  children: ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th className={`px-4 py-3 font-semibold ${align === "right" ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function TableCell({ children }: { children: ReactNode }) {
  return <td className="px-4 py-3.5 align-top">{children}</td>;
}

function StatusSelect({
  status,
  onChange,
}: {
  status: SelectedCreatorStatus;
  onChange: (status: SelectedCreatorStatus) => void;
}) {
  return (
    <select
      value={status}
      onChange={(event) => onChange(event.target.value as SelectedCreatorStatus)}
      aria-label="Creator status"
      className={`h-8 min-w-32 rounded-full border px-2 text-xs font-medium outline-none ring-ring transition-colors focus:ring-2 ${statusSelectStyles[status]}`}
    >
      {selectedCreatorStatuses.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

function InlineLink({ href, label }: { href: string; label: string }) {
  if (!href.trim()) return <span className="text-xs text-muted-foreground">No link</span>;
  return (
    <a
      href={normalizeUrl(href)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
    >
      {label}
      <ExternalLink className="size-3" />
    </a>
  );
}

function normalizeUrl(value: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function formatMonth(value: string): string {
  if (!value) return "No month";
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return value;
  return new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" }).format(
    new Date(year, month - 1, 1),
  );
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPaymentAmount(value: number, currency: string): string {
  const normalizedCurrency = currency.trim().toUpperCase() || "USD";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: normalizedCurrency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)} ${normalizedCurrency}`;
  }
}

function formatCpm(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 4,
  }).format(value);
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
}
