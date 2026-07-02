import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Copy, Eye, FileText, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { TopBar } from "@/components/TopBar";
import {
  deleteCampaignPromptVaultFromGoogleSheetsOnly,
  loadPromptVaultBundleFromGoogleSheetsOnly,
  saveCampaignPromptVaultToGoogleSheetsOnly,
  saveAppSettingToGoogleSheetsOnly,
} from "@/storage/appRepository";
import type { CampaignProfileRecord, CampaignPromptVaultRecord } from "@/storage/schema";

const promptVaultCategoriesSettingKey = "promptVault.universalCategories";
const promptVaultCategoriesLocalKey = "katlas-prompt-vault-categories-v1";

const starterUniversalCategories = [
  "Rate Negotiation",
  "Submission Generation",
  "Contract Review",
  "Script Review",
  "Creator Follow-up",
  "Brief Analysis",
];

const generalPromptCampaignId = "general-prompts";
const generalPromptCampaign: CampaignProfileRecord = {
  campaignId: generalPromptCampaignId,
  campaignName: "General prompts",
  campaignCode: "GENERAL",
  country: "",
  preferredLanguages: "",
  status: "active",
  createdAt: "",
  updatedAt: "",
};

const previewCampaigns: CampaignProfileRecord[] = [
  {
    campaignId: "preview-dola-thailand",
    campaignName: "Dola Thailand",
    campaignCode: "DOLA-TH",
    country: "Thailand",
    preferredLanguages: "Thai, English",
    status: "active",
    createdAt: "",
    updatedAt: "",
  },
  {
    campaignId: "preview-dola-uk",
    campaignName: "Dola UK",
    campaignCode: "DOLA-UK",
    country: "United Kingdom",
    preferredLanguages: "English",
    status: "active",
    createdAt: "",
    updatedAt: "",
  },
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
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isCategorySaving, setIsCategorySaving] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState("");
  const [universalCategories, setUniversalCategories] = useState<string[]>(() =>
    readStoredUniversalCategories(),
  );
  const [viewingPrompt, setViewingPrompt] = useState<CampaignPromptVaultRecord | null>(null);
  const [viewingDetail, setViewingDetail] = useState<{
    title: string;
    subtitle: string;
    value: string;
  } | null>(null);

  const activeCampaigns = useMemo(() => campaigns.filter(isActiveCampaign), [campaigns]);
  const campaignOptions = useMemo(() => {
    const sourceCampaigns = activeCampaigns.length ? activeCampaigns : campaigns;
    return [
      generalPromptCampaign,
      ...sourceCampaigns.filter((campaign) => campaign.campaignId !== generalPromptCampaignId),
    ];
  }, [activeCampaigns, campaigns]);
  const categories = useMemo(
    () =>
      Array.from(
        new Set([
          ...universalCategories,
          ...prompts.map((prompt) => prompt.category.trim()).filter(Boolean),
        ]),
      ).filter((category) => category.toLowerCase() !== "custom"),
    [prompts, universalCategories],
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
            prompt.files,
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

        const categoriesSetting = bundle.appSettings.find(
          (setting) => setting.settingKey === promptVaultCategoriesSettingKey,
        );
        const storedCategories = categoriesSetting
          ? parseStoredCategories(categoriesSetting.settingValue)
          : starterUniversalCategories;
        setUniversalCategories(storedCategories);
        writeLocalUniversalCategories(storedCategories);

        if (!categoriesSetting && storedCategories.length) {
          void saveAppSettingToGoogleSheetsOnly(
            promptVaultCategoriesSettingKey,
            JSON.stringify(storedCategories),
          ).catch(() => {
            // The page can still work with local preview categories if shared settings are unavailable.
          });
        }
      })
      .catch((loadError) => {
        if (cancelled) return;
        if (isLocalPreviewHost()) {
          setCampaigns(previewCampaigns);
          setPrompts([]);
          setStatus(
            "Local preview mode: showing sample projects because Google Sheets is not configured.",
          );
          setError("");
          return;
        }
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

  function openNewPrompt() {
    const campaign =
      campaignOptions.find((item) => item.campaignId === campaignFilter) ?? campaignOptions[0];
    if (!campaign) return;
    setDraft(createPromptDraft(campaign, categoryFilter || categories[0] || ""));
  }

  function openEditPrompt(prompt: CampaignPromptVaultRecord) {
    setDraft({ ...prompt });
  }

  async function persistUniversalCategories(nextCategories: string[], successMessage: string) {
    setUniversalCategories(nextCategories);
    writeLocalUniversalCategories(nextCategories);
    setStatus(successMessage);
    setIsCategorySaving(true);

    try {
      await saveAppSettingToGoogleSheetsOnly(
        promptVaultCategoriesSettingKey,
        JSON.stringify(nextCategories),
      );
    } catch (saveError) {
      setStatus(
        saveError instanceof Error
          ? `Category change saved locally. ${saveError.message}`
          : "Category change saved locally. Google Sheets did not save it.",
      );
    } finally {
      setIsCategorySaving(false);
    }
  }

  async function saveUniversalCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const category = categoryDraft.trim();
    if (!category) return;

    const nextCategories = normalizeCategories([...universalCategories, category]);
    await persistUniversalCategories(nextCategories, "Universal category added.");
    setCategoryDraft("");
  }

  async function removeUniversalCategory(category: string) {
    const nextCategories = universalCategories.filter((item) => item !== category);
    if (categoryFilter === category) setCategoryFilter("");
    await persistUniversalCategories(nextCategories, "Universal category removed.");
  }

  async function savePrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    const category = getPromptCategory(draft);
    if (!category || !draft.content.trim()) return;

    const campaign = campaignOptions.find((item) => item.campaignId === draft.campaignId);
    const now = new Date().toISOString();
    const baseRecord = {
      ...draft,
      category,
      content: draft.content.trim(),
      input: draft.input.trim(),
      files: draft.files.trim(),
      createdAt: draft.createdAt || now,
      updatedAt: now,
    };

    setIsSaving(true);
    setError("");
    try {
      const campaignName = campaign?.campaignName ?? draft.campaignName;
      const record: CampaignPromptVaultRecord = {
        ...baseRecord,
        campaignName,
        title: createPromptTitle(campaignName, category),
      };
      const nextRecords = await saveCampaignPromptVaultToGoogleSheetsOnly(record);
      setPrompts(nextRecords);
      setDraft(null);
      setStatus("Prompt saved.");
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

  async function copyText(value: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(value);
      setStatus(successMessage);
    } catch {
      setStatus("Copy failed. Select the text manually.");
    }
  }

  async function copyPrompt(prompt: CampaignPromptVaultRecord) {
    await copyText(prompt.content, "Prompt copied.");
  }

  async function copyPromptFiles(prompt: CampaignPromptVaultRecord) {
    await copyText(prompt.files, "Files copied.");
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
              onClick={openNewPrompt}
              disabled={!campaignOptions.length || isLoading}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="size-4" />
              Add Prompt
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
                {campaignOptions.map((campaign) => (
                  <option key={campaign.campaignId} value={campaign.campaignId}>
                    {campaign.campaignName}
                  </option>
                ))}
              </select>
            </FieldLabel>

            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">Category</span>
                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(true)}
                  className="text-xs font-medium text-cyan-100 transition hover:text-foreground"
                >
                  Manage Categories
                </button>
              </div>
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus:ring-2"
              >
                <option value="">All categories</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>
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
                  onViewInput={() =>
                    setViewingDetail({
                      title: "Input",
                      subtitle: prompt.title,
                      value: prompt.input,
                    })
                  }
                  onCopyFiles={() => copyPromptFiles(prompt)}
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
              onAdd={openNewPrompt}
            />
          )}
        </section>
      </main>

      {draft ? (
        <PromptEditorModal
          draft={draft}
          campaigns={campaignOptions}
          categories={categories}
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

      {viewingDetail ? (
        <PromptDetailModal
          detail={viewingDetail}
          onCopy={() => copyText(viewingDetail.value, `${viewingDetail.title} copied.`)}
          onClose={() => setViewingDetail(null)}
        />
      ) : null}

      {isCategoryModalOpen ? (
        <CategoryManagerModal
          universalCategories={universalCategories}
          categoryDraft={categoryDraft}
          isSaving={isCategorySaving}
          onCategoryDraftChange={setCategoryDraft}
          onAddCategory={saveUniversalCategory}
          onRemoveCategory={(category) => {
            void removeUniversalCategory(category);
          }}
          onClose={() => {
            setCategoryDraft("");
            setIsCategoryModalOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function PromptCard({
  prompt,
  onCopy,
  onView,
  onViewInput,
  onCopyFiles,
  onEdit,
  onDelete,
}: {
  prompt: CampaignPromptVaultRecord;
  onCopy: () => void;
  onView: () => void;
  onViewInput: () => void;
  onCopyFiles: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="flex min-h-[250px] flex-col rounded-xl border border-border bg-background/70 p-4">
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{prompt.campaignName}</p>
        <h2 className="mt-2 line-clamp-2 text-base font-semibold">{prompt.title}</h2>
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
      <div className="mt-3 space-y-2">
        {prompt.input ? (
          <PromptCardInputDetail label="Input" value={prompt.input} onClick={onViewInput} />
        ) : null}
        {prompt.files ? (
          <PromptCardFilesDetail label="Files" value={prompt.files} onCopy={onCopyFiles} />
        ) : null}
      </div>

      <div className="mt-auto flex flex-wrap gap-2 border-t border-border pt-3">
        <SmallActionButton label="Copy" icon={Copy} onClick={onCopy} />
        <SmallActionButton label="View Full" icon={Eye} onClick={onView} />
        <SmallActionButton label="Edit" icon={Pencil} onClick={onEdit} />
        <SmallActionButton label="Delete" icon={Trash2} onClick={onDelete} />
      </div>
    </article>
  );
}

function PromptCardInputDetail({
  label,
  value,
  onClick,
}: {
  label: string;
  value: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full rounded-lg border border-cyan-300/15 bg-cyan-300/[0.035] px-3 py-2.5 text-left transition hover:border-cyan-200/35 hover:bg-cyan-300/[0.06]"
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-cyan-100">{label}</p>
      <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
        {createSnippet(value, 180)}
      </p>
    </button>
  );
}

function PromptCardFilesDetail({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy: () => void;
}) {
  return (
    <div className="rounded-lg border border-cyan-300/15 bg-cyan-300/[0.035] px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-cyan-100">{label}</p>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-cyan-200/15 bg-background/60 px-2 text-[11px] font-medium text-cyan-100 transition hover:border-cyan-200/35 hover:bg-cyan-300/[0.08]"
        >
          <Copy className="size-3" />
          Copy
        </button>
      </div>
      <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
        {createSnippet(value, 180)}
      </p>
    </div>
  );
}

function PromptEditorModal({
  draft,
  campaigns,
  categories,
  isSaving,
  onChange,
  onSubmit,
  onClose,
}: {
  draft: CampaignPromptVaultRecord;
  campaigns: CampaignProfileRecord[];
  categories: string[];
  isSaving: boolean;
  onChange: (draft: CampaignPromptVaultRecord) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  const selectedCategory = categories.includes(draft.category) ? draft.category : "Custom";
  const category = getPromptCategory(draft);
  const selectedCampaignName =
    campaigns.find((campaign) => campaign.campaignId === draft.campaignId)?.campaignName ||
    draft.campaignName;
  const generatedTitle = createPromptTitle(selectedCampaignName, category || "Category");

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
              {draft.createdAt ? "Edit Prompt" : "Add Prompt"}
            </h2>
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
            <FieldLabel label="Project">
              <select
                value={draft.campaignId}
                onChange={(event) => {
                  const campaign = campaigns.find((item) => item.campaignId === event.target.value);
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
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
                <option value="Custom">Custom</option>
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
            <FieldLabel label="Title">
              <div className="flex min-h-10 items-center rounded-md border border-border bg-background/70 px-3 py-2 text-sm text-muted-foreground">
                {generatedTitle}
              </div>
            </FieldLabel>
          </div>

          <div className="mt-3">
            <FieldLabel label="Prompt">
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
            <FieldLabel label="Files">
              <textarea
                value={draft.files}
                onChange={(event) => onChange({ ...draft, files: event.target.value })}
                rows={4}
                placeholder="Paste attachment links, screenshot references, files used, or short file notes."
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
            Save Prompt
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
          {prompt.files ? (
            <div className="mt-3 rounded-lg border border-border bg-background/70 p-4">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Files</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                {prompt.files}
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

function PromptDetailModal({
  detail,
  onCopy,
  onClose,
}: {
  detail: { title: string; subtitle: string; value: string };
  onCopy: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm">
      <div className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              Prompt Vault / {detail.title}
            </p>
            <h2 className="mt-1 line-clamp-2 text-xl font-semibold">{detail.subtitle}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-background transition hover:bg-accent"
            aria-label="Close detail viewer"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <pre className="whitespace-pre-wrap break-words rounded-lg border border-border bg-background p-4 font-sans text-sm leading-6 text-foreground">
            {detail.value}
          </pre>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center rounded-md border border-border bg-background px-4 text-sm font-medium transition hover:bg-accent"
          >
            Close
          </button>
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            <Copy className="size-4" />
            Copy
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
          ? "Add a prompt, choose its project and category, then save the prompt details for later reuse."
          : "Prompt Vault uses Campaign Profiles as the source of truth."}
      </p>
      {hasCampaigns ? (
        <button
          type="button"
          onClick={onAdd}
          className="mt-4 inline-flex h-10 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:opacity-90"
        >
          <Plus className="size-4" />
          Add Prompt
        </button>
      ) : null}
    </div>
  );
}

function CategoryManagerModal({
  universalCategories,
  categoryDraft,
  isSaving,
  onCategoryDraftChange,
  onAddCategory,
  onRemoveCategory,
  onClose,
}: {
  universalCategories: string[];
  categoryDraft: string;
  isSaving: boolean;
  onCategoryDraftChange: (value: string) => void;
  onAddCategory: (event: FormEvent<HTMLFormElement>) => void;
  onRemoveCategory: (category: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Prompt Vault</p>
            <h2 className="mt-1 text-xl font-semibold">Manage Categories</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-background transition hover:bg-accent"
            aria-label="Close category editor"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <form onSubmit={onAddCategory} className="flex gap-2">
            <div className="min-w-0 flex-1">
              <TextInput
                label="Add Universal Category"
                value={categoryDraft}
                onChange={onCategoryDraftChange}
              />
            </div>
            <button
              type="submit"
              disabled={!categoryDraft.trim() || isSaving}
              className="mt-6 inline-flex h-10 shrink-0 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add
            </button>
          </form>

          <div>
            <p className="text-xs font-medium text-muted-foreground">Universal Categories</p>
            {universalCategories.length ? (
              <div className="mt-2 divide-y divide-border overflow-hidden rounded-lg border border-border">
                {universalCategories.map((category) => (
                  <div
                    key={category}
                    className="flex items-center justify-between gap-3 bg-background/60 px-3 py-2"
                  >
                    <span className="min-w-0 truncate text-sm">{category}</span>
                    <button
                      type="button"
                      onClick={() => onRemoveCategory(category)}
                      disabled={isSaving}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-red-100 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Trash2 className="size-3.5" />
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-2 rounded-lg border border-dashed border-border bg-background/50 px-3 py-4 text-sm text-muted-foreground">
                No universal categories added yet.
              </div>
            )}
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
        </div>
      </div>
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

function createPromptDraft(
  campaign: CampaignProfileRecord,
  category = "",
): CampaignPromptVaultRecord {
  const now = new Date().toISOString();
  return {
    promptId: createId("prompt"),
    campaignId: campaign.campaignId,
    campaignName: campaign.campaignName,
    category,
    title: "",
    content: "",
    input: "",
    files: "",
    createdAt: "",
    updatedAt: now,
  };
}

function readStoredUniversalCategories() {
  if (typeof window === "undefined") return [];
  return parseStoredCategories(window.localStorage.getItem(promptVaultCategoriesLocalKey) ?? "[]");
}

function writeLocalUniversalCategories(categories: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(promptVaultCategoriesLocalKey, JSON.stringify(categories));
}

function parseStoredCategories(value: string) {
  if (!value.trim()) return [];

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return normalizeCategories(parsed);
  } catch {
    // Fall through to delimiter parsing for older manual values.
  }

  return normalizeCategories(value.split(/[\n,]/));
}

function normalizeCategories(values: unknown[]) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
        .filter((value) => value.toLowerCase() !== "custom"),
    ),
  ).sort((first, second) => first.localeCompare(second));
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

function isLocalPreviewHost() {
  if (typeof window === "undefined") return false;
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}
