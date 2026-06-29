import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Copy, Eye, FileText, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { TopBar } from "@/components/TopBar";
import {
  deleteCampaignPromptVaultFromGoogleSheetsOnly,
  loadPromptVaultBundleFromGoogleSheetsOnly,
  saveCampaignPromptVaultToGoogleSheetsOnly,
} from "@/storage/appRepository";
import type { CampaignProfileRecord, CampaignPromptVaultRecord } from "@/storage/schema";

const suggestedCategories = [
  "Rate Negotiation",
  "Submission Generation",
  "Contract Review",
  "Script Review",
  "Creator Follow-up",
  "Brief Analysis",
  "Custom",
];

export function PromptVault() {
  const [campaigns, setCampaigns] = useState<CampaignProfileRecord[]>([]);
  const [prompts, setPrompts] = useState<CampaignPromptVaultRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [campaignFilter, setCampaignFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<CampaignPromptVaultRecord | null>(null);
  const [editorMode, setEditorMode] = useState<"single" | "universal">("single");
  const [viewingPrompt, setViewingPrompt] = useState<CampaignPromptVaultRecord | null>(null);

  const activeCampaigns = useMemo(() => campaigns.filter(isActiveCampaign), [campaigns]);
  const campaignOptions = activeCampaigns.length ? activeCampaigns : campaigns;
  const categories = useMemo(
    () =>
      Array.from(
        new Set([
          ...suggestedCategories,
          ...prompts.map((prompt) => prompt.category).filter(Boolean),
        ]),
      ),
    [prompts],
  );

  const filteredPrompts = useMemo(
    () =>
      prompts
        .filter((prompt) => !campaignFilter || prompt.campaignId === campaignFilter)
        .filter((prompt) => !categoryFilter || prompt.category === categoryFilter)
        .filter((prompt) => {
          const query = search.trim().toLowerCase();
          if (!query) return true;
          return [
            prompt.title,
            prompt.content,
            prompt.input,
            prompt.notes,
            prompt.campaignName,
            prompt.category,
          ]
            .join(" ")
            .toLowerCase()
            .includes(query);
        })
        .sort((first, second) => getTimestamp(second.updatedAt) - getTimestamp(first.updatedAt)),
    [campaignFilter, categoryFilter, prompts, search],
  );

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError("");

    void loadPromptVaultBundleFromGoogleSheetsOnly()
      .then((bundle) => {
        if (cancelled) return;
        setCampaigns(bundle.campaignProfiles);
        setPrompts(bundle.campaignPromptVault);
      })
      .catch((loadError) => {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Google Sheets could not load Prompt Vault.",
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function openNewUniversalCategory() {
    const campaign = campaignOptions[0];
    if (!campaign) return;
    setEditorMode("universal");
    setDraft(createPromptDraft(campaign));
  }

  function openEditPrompt(prompt: CampaignPromptVaultRecord) {
    setEditorMode("single");
    setDraft({ ...prompt });
  }

  async function savePrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    const category = getPromptCategory(draft);
    if (!category || !draft.content.trim()) return;

    const campaign = campaigns.find((item) => item.campaignId === draft.campaignId);
    const now = new Date().toISOString();
    const baseRecord = {
      ...draft,
      category,
      content: draft.content.trim(),
      input: draft.input.trim(),
      notes: draft.notes.trim(),
      createdAt: draft.createdAt || now,
      updatedAt: now,
    };

    setIsSaving(true);
    setError("");
    try {
      let nextRecords: CampaignPromptVaultRecord[] = [];
      if (editorMode === "universal" && !draft.createdAt) {
        for (const campaignOption of campaignOptions) {
          const existingPrompt = prompts.find(
            (prompt) =>
              prompt.campaignId === campaignOption.campaignId &&
              prompt.category.trim().toLowerCase() === category.toLowerCase(),
          );
          nextRecords = await saveCampaignPromptVaultToGoogleSheetsOnly({
            ...baseRecord,
            promptId: existingPrompt?.promptId || createId("prompt"),
            campaignId: campaignOption.campaignId,
            campaignName: campaignOption.campaignName,
            title: createPromptTitle(campaignOption.campaignName, category),
            createdAt: existingPrompt?.createdAt || now,
            updatedAt: now,
          });
        }
      } else {
        const campaignName = campaign?.campaignName ?? draft.campaignName;
        const record: CampaignPromptVaultRecord = {
          ...baseRecord,
          campaignName,
          title: createPromptTitle(campaignName, category),
        };
        nextRecords = await saveCampaignPromptVaultToGoogleSheetsOnly(record);
      }
      setPrompts(nextRecords);
      setDraft(null);
      setStatus(
        editorMode === "universal" && !draft.createdAt
          ? "Universal category saved to all active campaigns."
          : "Prompt saved.",
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Google Sheets save failed. Prompt was not saved.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function deletePrompt(promptId: string) {
    const confirmed =
      typeof window === "undefined" || window.confirm("Delete this prompt from Google Sheets?");
    if (!confirmed) return;

    setIsSaving(true);
    setError("");
    try {
      const nextRecords = await deleteCampaignPromptVaultFromGoogleSheetsOnly(promptId);
      setPrompts(nextRecords);
      setViewingPrompt((current) => (current?.promptId === promptId ? null : current));
      setStatus("Prompt deleted.");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Google Sheets delete failed. Prompt was not deleted.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function copyPrompt(prompt: CampaignPromptVaultRecord) {
    try {
      await navigator.clipboard.writeText(prompt.content);
      setStatus("Prompt copied.");
    } catch {
      setStatus("Copy failed. Select the prompt text manually.");
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <TopBar />
      <div className="absolute inset-x-0 top-0 h-[320px] bg-hero-glow pointer-events-none" />

      <main className="katlas-page gap-4 py-5">
        <section className="katlas-hero-panel p-4 md:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Katlas Buddy</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight">Prompt Vault</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Store campaign-specific workflow prompts generated in ChatGPT.
              </p>
            </div>
            <button
              type="button"
              onClick={openNewUniversalCategory}
              disabled={!campaignOptions.length || isLoading}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="size-4" />
              Add Universal Category
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card/70 p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px] lg:items-end">
            <label>
              <span className="text-xs font-medium text-muted-foreground">Search</span>
              <div className="mt-1 flex h-10 items-center gap-2 rounded-md border border-input bg-background px-3">
                <Search className="size-4 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search title, input, or prompt content..."
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                />
              </div>
            </label>

            <FieldLabel label="Campaign">
              <select
                value={campaignFilter}
                onChange={(event) => setCampaignFilter(event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus:ring-2"
              >
                <option value="">All campaigns</option>
                {campaigns.map((campaign) => (
                  <option key={campaign.campaignId} value={campaign.campaignId}>
                    {campaign.campaignName}
                  </option>
                ))}
              </select>
            </FieldLabel>

            <FieldLabel label="Category">
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus:ring-2"
              >
                <option value="">All categories</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </FieldLabel>
          </div>
        </section>

        {error ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        {status ? <div className="katlas-status-line">{status}</div> : null}

        <section className="min-h-[320px] rounded-xl border border-border bg-card/55 p-4">
          {isLoading ? (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              Loading Prompt Vault from Google Sheets...
            </div>
          ) : filteredPrompts.length ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredPrompts.map((prompt) => (
                <PromptCard
                  key={prompt.promptId}
                  prompt={prompt}
                  onCopy={() => copyPrompt(prompt)}
                  onView={() => setViewingPrompt(prompt)}
                  onEdit={() => openEditPrompt(prompt)}
                  onDelete={() => {
                    void deletePrompt(prompt.promptId);
                  }}
                />
              ))}
            </div>
          ) : (
            <EmptyPromptState
              hasCampaigns={Boolean(campaignOptions.length)}
              onAdd={openNewUniversalCategory}
            />
          )}
        </section>
      </main>

      {draft ? (
        <PromptEditorModal
          draft={draft}
          mode={editorMode}
          campaigns={campaignOptions}
          isSaving={isSaving}
          onChange={setDraft}
          onSubmit={savePrompt}
          onClose={() => setDraft(null)}
        />
      ) : null}

      {viewingPrompt ? (
        <PromptViewModal
          prompt={viewingPrompt}
          onCopy={() => copyPrompt(viewingPrompt)}
          onEdit={() => {
            setDraft({ ...viewingPrompt });
            setViewingPrompt(null);
          }}
          onClose={() => setViewingPrompt(null)}
        />
      ) : null}
    </div>
  );
}

function PromptCard({
  prompt,
  onCopy,
  onView,
  onEdit,
  onDelete,
}: {
  prompt: CampaignPromptVaultRecord;
  onCopy: () => void;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="flex min-h-[250px] flex-col rounded-xl border border-border bg-background/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{prompt.campaignName}</p>
          <h2 className="mt-2 line-clamp-2 text-base font-semibold">{prompt.title}</h2>
        </div>
        <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-card">
          <FileText className="size-4 text-cyan-100" />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <span className="rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground">
          {prompt.category || "Custom"}
        </span>
        <span className="rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground">
          Updated {formatDate(prompt.updatedAt)}
        </span>
      </div>

      <p className="mt-4 line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
        {createSnippet(prompt.content)}
      </p>
      {prompt.input ? (
        <p className="mt-3 line-clamp-2 rounded-lg border border-border bg-card/70 px-3 py-2 text-xs leading-5 text-muted-foreground">
          Input: {createSnippet(prompt.input, 120)}
        </p>
      ) : null}

      <div className="mt-auto flex flex-wrap gap-2 border-t border-border pt-3">
        <SmallActionButton label="Copy" icon={Copy} onClick={onCopy} />
        <SmallActionButton label="View Full" icon={Eye} onClick={onView} />
        <SmallActionButton label="Edit" icon={Pencil} onClick={onEdit} />
        <SmallActionButton label="Delete" icon={Trash2} onClick={onDelete} />
      </div>
    </article>
  );
}

function PromptEditorModal({
  draft,
  mode,
  campaigns,
  isSaving,
  onChange,
  onSubmit,
  onClose,
}: {
  draft: CampaignPromptVaultRecord;
  mode: "single" | "universal";
  campaigns: CampaignProfileRecord[];
  isSaving: boolean;
  onChange: (draft: CampaignPromptVaultRecord) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  const selectedCategory = suggestedCategories.includes(draft.category) ? draft.category : "Custom";
  const category = getPromptCategory(draft);
  const selectedCampaignName =
    campaigns.find((campaign) => campaign.campaignId === draft.campaignId)?.campaignName ||
    draft.campaignName;
  const generatedTitle =
    mode === "universal"
      ? `Each campaign name + ${category || "category"}`
      : createPromptTitle(selectedCampaignName, category || "Category");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm">
      <form
        onSubmit={onSubmit}
        className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-xl border border-border bg-card shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Prompt Vault</p>
            <h2 className="mt-1 text-xl font-semibold">
              {draft.createdAt
                ? "Edit Prompt Category"
                : mode === "universal"
                  ? "Add Universal Category"
                  : "Add Prompt Category"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "universal" && !draft.createdAt
                ? "This creates one prompt row for every active campaign."
                : "The title is generated from campaign name and category."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-background transition hover:bg-accent"
            aria-label="Close prompt editor"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="grid gap-3 md:grid-cols-2">
            {mode === "universal" && !draft.createdAt ? (
              <FieldLabel label="Campaigns">
                <div className="flex h-10 items-center rounded-md border border-input bg-background px-3 text-sm text-muted-foreground">
                  All active campaigns
                </div>
              </FieldLabel>
            ) : (
              <FieldLabel label="Campaign">
                <select
                  value={draft.campaignId}
                  onChange={(event) => {
                    const campaign = campaigns.find(
                      (item) => item.campaignId === event.target.value,
                    );
                    onChange({
                      ...draft,
                      campaignId: campaign?.campaignId ?? event.target.value,
                      campaignName: campaign?.campaignName ?? draft.campaignName,
                    });
                  }}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus:ring-2"
                >
                  {campaigns.map((campaign) => (
                    <option key={campaign.campaignId} value={campaign.campaignId}>
                      {campaign.campaignName}
                    </option>
                  ))}
                </select>
              </FieldLabel>
            )}

            <FieldLabel label="Category">
              <select
                value={selectedCategory}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    category: event.target.value === "Custom" ? "" : event.target.value,
                  })
                }
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus:ring-2"
              >
                {suggestedCategories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </FieldLabel>
          </div>

          {selectedCategory === "Custom" ? (
            <div className="mt-3">
              <TextInput
                label="Custom Category"
                value={draft.category}
                onChange={(category) => onChange({ ...draft, category })}
              />
            </div>
          ) : null}

          <div className="mt-3">
            <FieldLabel label="Generated Title">
              <div className="flex min-h-10 items-center rounded-md border border-border bg-background/70 px-3 py-2 text-sm text-muted-foreground">
                {generatedTitle}
              </div>
            </FieldLabel>
          </div>

          <div className="mt-3">
            <FieldLabel label="Content">
              <textarea
                value={draft.content}
                onChange={(event) => onChange({ ...draft, content: event.target.value })}
                rows={14}
                placeholder="Paste the prompt generated in ChatGPT here."
                className="w-full resize-y rounded-md border border-input bg-background px-3 py-3 text-sm leading-6 outline-none ring-ring focus:ring-2"
              />
            </FieldLabel>
          </div>

          <div className="mt-3">
            <FieldLabel label="Input">
              <textarea
                value={draft.input}
                onChange={(event) => onChange({ ...draft, input: event.target.value })}
                rows={5}
                placeholder="Note the input that goes with this prompt, like Communication screenshot, creator reply, brief section, or pasted context."
                className="w-full resize-y rounded-md border border-input bg-background px-3 py-3 text-sm leading-6 outline-none ring-ring focus:ring-2"
              />
            </FieldLabel>
          </div>

          <div className="mt-3">
            <FieldLabel label="Notes">
              <textarea
                value={draft.notes}
                onChange={(event) => onChange({ ...draft, notes: event.target.value })}
                rows={4}
                placeholder="Optional context, use cases, or reminders."
                className="w-full resize-y rounded-md border border-input bg-background px-3 py-3 text-sm leading-6 outline-none ring-ring focus:ring-2"
              />
            </FieldLabel>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center rounded-md border border-border bg-background px-4 text-sm font-medium transition hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving || !draft.campaignId || !category || !draft.content.trim()}
            className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {mode === "universal" && !draft.createdAt ? "Save To All Campaigns" : "Save Prompt"}
          </button>
        </div>
      </form>
    </div>
  );
}

function PromptViewModal({
  prompt,
  onCopy,
  onEdit,
  onClose,
}: {
  prompt: CampaignPromptVaultRecord;
  onCopy: () => void;
  onEdit: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              {prompt.campaignName} / {prompt.category}
            </p>
            <h2 className="mt-1 text-xl font-semibold">{prompt.title}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Updated {formatDate(prompt.updatedAt)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-background transition hover:bg-accent"
            aria-label="Close prompt viewer"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="rounded-lg border border-border bg-background p-4">
            <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Prompt</p>
            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6 text-foreground">
              {prompt.content}
            </pre>
          </div>
          {prompt.input ? (
            <div className="mt-3 rounded-lg border border-border bg-background/70 p-4">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Input</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                {prompt.input}
              </p>
            </div>
          ) : null}
          {prompt.notes ? (
            <div className="mt-3 rounded-lg border border-border bg-background/70 p-4">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Notes</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                {prompt.notes}
              </p>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-medium transition hover:bg-accent"
          >
            <Pencil className="size-4" />
            Edit
          </button>
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            <Copy className="size-4" />
            Copy Full Prompt
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyPromptState({ hasCampaigns, onAdd }: { hasCampaigns: boolean; onAdd: () => void }) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-background/50 px-4 text-center">
      <div className="grid size-12 place-items-center rounded-xl border border-border bg-card">
        <FileText className="size-5 text-muted-foreground" />
      </div>
      <h2 className="mt-4 text-base font-semibold">
        {hasCampaigns ? "No prompts found" : "Create a campaign first"}
      </h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        {hasCampaigns
          ? "Add a universal category to create one campaign-specific prompt for every active campaign."
          : "Prompt Vault uses Campaign Profiles as the source of truth."}
      </p>
      {hasCampaigns ? (
        <button
          type="button"
          onClick={onAdd}
          className="mt-4 inline-flex h-10 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:opacity-90"
        >
          <Plus className="size-4" />
          Add Universal Category
        </button>
      ) : null}
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
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus:ring-2"
      />
    </FieldLabel>
  );
}

function SmallActionButton({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium transition hover:bg-accent"
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  );
}

function createPromptDraft(campaign: CampaignProfileRecord): CampaignPromptVaultRecord {
  const now = new Date().toISOString();
  return {
    promptId: createId("prompt"),
    campaignId: campaign.campaignId,
    campaignName: campaign.campaignName,
    category: "Custom",
    title: "",
    content: "",
    input: "",
    notes: "",
    createdAt: "",
    updatedAt: now,
  };
}

function isActiveCampaign(campaign: CampaignProfileRecord) {
  const status = campaign.status.trim().toLowerCase();
  return !["archived", "deleted", "inactive", "cancelled", "canceled"].includes(status);
}

function createSnippet(content: string, maxLength = 220) {
  const compact = content.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact || "No prompt content.";
  return `${compact.slice(0, maxLength)}...`;
}

function formatDate(value: string) {
  if (!value) return "just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function getPromptCategory(prompt: CampaignPromptVaultRecord) {
  return prompt.category.trim();
}

function createPromptTitle(campaignName: string, category: string) {
  const cleanCampaignName = campaignName.trim() || "Campaign";
  const cleanCategory = category.trim() || "Prompt";
  return `${cleanCampaignName} - ${cleanCategory}`;
}

function getTimestamp(value: string) {
  return Date.parse(value) || 0;
}

function createId(prefix: string) {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
