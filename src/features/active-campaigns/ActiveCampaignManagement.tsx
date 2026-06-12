import { ExternalLink, Pencil, Plus, Trash2, UsersRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";

import { TopBar } from "@/components/TopBar";
import {
  calculateCampaignSummary,
  calculateCreatorFinancials,
  createSelectedCreatorRecord,
  getCampaignCreators,
  loadCampaignRegistry,
  saveCampaignRegistry,
  selectedCreatorStatuses,
  type GlobalCampaignRegistry,
  type SelectedCreatorRecord,
  type SelectedCreatorStatus,
} from "@/lib/campaignRegistry";

export function ActiveCampaignManagement({
  initialCampaignId = "",
}: {
  initialCampaignId?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [registry, setRegistry] = useState<GlobalCampaignRegistry>(() => loadCampaignRegistry());
  const [selectedCampaignId, setSelectedCampaignId] = useState(initialCampaignId);
  const [editingRecord, setEditingRecord] = useState<SelectedCreatorRecord | null>(null);

  useEffect(() => {
    const currentRegistry = loadCampaignRegistry();
    setRegistry(currentRegistry);
    setSelectedCampaignId((current) =>
      currentRegistry.campaigns.some((campaign) => campaign.id === (initialCampaignId || current))
        ? initialCampaignId || current
        : currentRegistry.campaigns[0]?.id || "",
    );
    setLoaded(true);
  }, [initialCampaignId]);

  useEffect(() => {
    if (!loaded) return;
    saveCampaignRegistry(registry);
  }, [loaded, registry]);

  const selectedCampaign =
    registry.campaigns.find((campaign) => campaign.id === selectedCampaignId) ??
    registry.campaigns[0];
  const selectedCampaignRecords = useMemo(
    () => (selectedCampaign ? getCampaignCreators(registry, selectedCampaign.id) : []),
    [registry, selectedCampaign],
  );
  const selectedSummary = useMemo(
    () => calculateCampaignSummary(selectedCampaignRecords),
    [selectedCampaignRecords],
  );

  function openNewCreator() {
    if (!selectedCampaign) return;
    setEditingRecord(createSelectedCreatorRecord(selectedCampaign.id));
  }

  function saveCreatorRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingRecord || !editingRecord.creatorName.trim() || !selectedCampaign) return;
    const now = new Date().toISOString();
    const savedRecord = {
      ...editingRecord,
      campaignRegistryId: selectedCampaign.id,
      updatedAt: now,
    };

    setRegistry((current) => {
      const exists = current.creatorRecords.some((record) => record.id === savedRecord.id);
      return {
        ...current,
        creatorRecords: exists
          ? current.creatorRecords.map((record) =>
              record.id === savedRecord.id ? savedRecord : record,
            )
          : [savedRecord, ...current.creatorRecords],
      };
    });
    setEditingRecord(null);
  }

  function deleteCreatorRecord(recordId: string) {
    const confirmed =
      typeof window === "undefined" ||
      window.confirm("Delete this selected creator record from the campaign?");
    if (!confirmed) return;

    setRegistry((current) => ({
      ...current,
      creatorRecords: current.creatorRecords.filter((record) => record.id !== recordId),
    }));
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <TopBar />
      <div className="absolute inset-x-0 top-0 h-[360px] bg-hero-glow pointer-events-none" />

      <main className="relative mx-auto flex w-full max-w-7xl flex-col gap-5 px-5 py-6">
        <section className="rounded-2xl border border-border bg-card/60 p-5 md:p-7">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Active Campaign Management
              </p>
              <h1 className="mt-3 text-3xl font-medium leading-tight tracking-tight md:text-4xl">
                Selected creator tracker
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                Track selected creators after client approval and contract signing.
              </p>
            </div>
            <div className="w-full lg:max-w-sm">
              <FieldLabel label="Campaign Selector">
                <select
                  value={selectedCampaign?.id ?? ""}
                  onChange={(event) => setSelectedCampaignId(event.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus:ring-2"
                >
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

        {selectedCampaign ? (
          <>
            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <SummaryCard
                label="Selected Creators"
                value={selectedSummary.totalCreators.toLocaleString()}
              />
              <SummaryCard label="Total Spend" value={formatCurrency(selectedSummary.totalSpend)} />
              <SummaryCard
                label="Total Profit"
                value={formatCurrency(selectedSummary.totalProfit)}
              />
              <SummaryCard
                label="Average Profit Margin"
                value={formatPercent(selectedSummary.averageMargin)}
              />
              <SummaryCard label="Status Summary" value={selectedSummary.statusSummary} />
            </section>

            <Panel title="Creator Records" icon={UsersRound}>
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <p className="text-sm font-medium">
                    {selectedCampaign.campaignName} | {selectedCampaign.campaignCode}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Add only creators who are officially selected and contract signed.
                  </p>
                </div>
                <button
                  onClick={openNewCreator}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:opacity-90"
                >
                  <Plus className="size-4" />
                  Add Creator
                </button>
              </div>

              <CreatorRecordsTable
                records={selectedCampaignRecords}
                onEdit={setEditingRecord}
                onDelete={deleteCreatorRecord}
              />
            </Panel>
          </>
        ) : (
          <section className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
            No campaign profiles exist yet. Create one in Campaign Profiles first.
          </section>
        )}
      </main>

      {editingRecord && selectedCampaign ? (
        <CreatorRecordModal
          record={editingRecord}
          campaignName={selectedCampaign.campaignName}
          campaignCode={selectedCampaign.campaignCode}
          onChange={setEditingRecord}
          onCancel={() => setEditingRecord(null)}
          onSubmit={saveCreatorRecord}
        />
      ) : null}
    </div>
  );
}

function CreatorRecordsTable({
  records,
  onEdit,
  onDelete,
}: {
  records: SelectedCreatorRecord[];
  onEdit: (record: SelectedCreatorRecord) => void;
  onDelete: (recordId: string) => void;
}) {
  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-border">
      <table className="min-w-[1280px] w-full border-collapse text-left text-sm">
        <thead className="bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <TableHeader>Creator</TableHeader>
            <TableHeader>Creator Link</TableHeader>
            <TableHeader>Avg Views</TableHeader>
            <TableHeader>Internal Quote</TableHeader>
            <TableHeader>External Quote</TableHeader>
            <TableHeader>CPM</TableHeader>
            <TableHeader>Profit</TableHeader>
            <TableHeader>Profit Margin</TableHeader>
            <TableHeader>Status</TableHeader>
            <TableHeader>Draft Link</TableHeader>
            <TableHeader>Live Link</TableHeader>
            <TableHeader>Notes</TableHeader>
            <TableHeader>Actions</TableHeader>
          </tr>
        </thead>
        <tbody>
          {records.length ? (
            records.map((record) => {
              const financials = calculateCreatorFinancials(record);
              return (
                <tr key={record.id} className="border-t border-border">
                  <TableCell>
                    <span className="font-medium">{record.creatorName}</span>
                  </TableCell>
                  <TableCell>
                    <InlineLink href={record.creatorLink} label="Creator Link" />
                  </TableCell>
                  <TableCell>{formatNumber(record.avgViews)}</TableCell>
                  <TableCell>{formatCurrency(record.internalQuote)}</TableCell>
                  <TableCell>{formatCurrency(record.externalQuote)}</TableCell>
                  <TableCell>{formatCpm(financials.cpm)}</TableCell>
                  <TableCell>{formatCurrency(financials.profit)}</TableCell>
                  <TableCell>{formatPercent(financials.profitMargin)}</TableCell>
                  <TableCell>
                    <StatusBadge status={record.status} />
                  </TableCell>
                  <TableCell>
                    <InlineLink href={record.draftLink} label="Draft Link" />
                  </TableCell>
                  <TableCell>
                    <InlineLink href={record.liveLink} label="Live Link" />
                  </TableCell>
                  <TableCell>
                    <p className="max-w-52 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
                      {record.notes || "No notes"}
                    </p>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => onEdit(record)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium transition hover:bg-accent"
                      >
                        <Pencil className="size-3.5" />
                        Edit
                      </button>
                      <button
                        onClick={() => onDelete(record.id)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium transition hover:bg-accent"
                      >
                        <Trash2 className="size-3.5" />
                        Delete
                      </button>
                    </div>
                  </TableCell>
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan={13} className="px-4 py-10 text-center text-sm text-muted-foreground">
                No selected creators for this campaign yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function CreatorRecordModal({
  record,
  campaignName,
  campaignCode,
  onChange,
  onCancel,
  onSubmit,
}: {
  record: SelectedCreatorRecord;
  campaignName: string;
  campaignCode: string;
  onChange: (record: SelectedCreatorRecord) => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const financials = calculateCreatorFinancials(record);

  function patchRecord(patch: Partial<SelectedCreatorRecord>) {
    onChange({ ...record, ...patch });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 backdrop-blur-sm">
      <form
        onSubmit={onSubmit}
        className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Creator Record</p>
            <h2 className="mt-2 text-xl font-semibold">{record.creatorName || campaignName}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Campaign is locked to {campaignName} | {campaignCode}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium transition hover:bg-accent"
          >
            Cancel
          </button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
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
            label="Internal Quote"
            value={record.internalQuote}
            onChange={(internalQuote) => patchRecord({ internalQuote })}
          />
          <NumberInput
            label="External Quote"
            value={record.externalQuote}
            onChange={(externalQuote) => patchRecord({ externalQuote })}
          />
          <FieldLabel label="Status">
            <select
              value={record.status}
              onChange={(event) =>
                patchRecord({ status: event.target.value as SelectedCreatorStatus })
              }
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus:ring-2"
            >
              {selectedCreatorStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </FieldLabel>
          <TextInput
            label="Draft Link"
            value={record.draftLink}
            onChange={(draftLink) => patchRecord({ draftLink })}
          />
          <TextInput
            label="Live Link"
            value={record.liveLink}
            onChange={(liveLink) => patchRecord({ liveLink })}
          />
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <SummaryCard label="CPM" value={formatCpm(financials.cpm)} />
          <SummaryCard label="Profit" value={formatCurrency(financials.profit)} />
          <SummaryCard label="Profit Margin" value={formatPercent(financials.profitMargin)} />
        </div>

        <div className="mt-4">
          <FieldLabel label="Notes">
            <textarea
              value={record.notes}
              rows={4}
              onChange={(event) => patchRecord({ notes: event.target.value })}
              className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-6 outline-none ring-ring focus:ring-2"
            />
          </FieldLabel>
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
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-4 flex items-center gap-2">
        <div className="grid size-8 place-items-center rounded-md bg-accent text-accent-foreground">
          <Icon className="size-4" />
        </div>
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
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
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus:ring-2"
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

function StatusBadge({ status }: { status: SelectedCreatorStatus }) {
  return (
    <span className="inline-flex rounded-full border border-border bg-background px-2 py-1 text-xs">
      {status}
    </span>
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
