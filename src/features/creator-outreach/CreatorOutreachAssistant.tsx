import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Copy, Database, FileInput, Languages, Plus, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { TopBar } from "@/components/TopBar";
import {
  loadCampaignRegistry,
  type CampaignMemoryLanguage,
  type GlobalCampaignRegistry,
} from "@/lib/campaignRegistry";
import {
  createDefaultDatabase,
  loadKatlasBuddyDatabase,
  saveKatlasBuddyDatabase,
} from "./database";
import { createBlankTemplate, extractTemplateFields } from "./messageComposer";
import { detectLanguage, getLanguageLabel, translateText } from "./translation";
import {
  creatorMessageSources,
  outreachLanguages,
  type ChannelType,
  type CreatorMessageSource,
  type KatlasBuddyDatabase,
  type OutreachLanguage,
  type OutreachTemplate,
} from "./types";

const simpleTemplateTypes = ["DM", "Email"] as const;

export function CreatorOutreachAssistant() {
  const [loaded, setLoaded] = useState(false);
  const [database, setDatabase] = useState<KatlasBuddyDatabase>(() => createDefaultDatabase());
  const [campaignRegistry, setCampaignRegistry] = useState<GlobalCampaignRegistry>(() =>
    loadCampaignRegistry(),
  );
  const [creatorMessage, setCreatorMessage] = useState("");
  const [creatorName, setCreatorName] = useState("");
  const [detectedLanguage, setDetectedLanguage] = useState<OutreachLanguage>("english");
  const [englishTranslation, setEnglishTranslation] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [replyEditor, setReplyEditor] = useState("");
  const [targetLanguage, setTargetLanguage] = useState<OutreachLanguage>("thai");
  const [translatedReply, setTranslatedReply] = useState("");
  const [isNewTemplateModalOpen, setIsNewTemplateModalOpen] = useState(false);
  const [isMemoryWidgetOpen, setIsMemoryWidgetOpen] = useState(false);
  const [selectedMemoryCampaignId, setSelectedMemoryCampaignId] = useState("");
  const [templateDraft, setTemplateDraft] = useState<OutreachTemplate | null>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const replyTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const replySelectionRef = useRef<{ start: number; end: number } | null>(null);

  const templates = database.worksheets.Templates;
  const settings = database.worksheets.Settings;
  const creatorSource = settings.defaultSource;
  const sourceCompatibleTemplates = useMemo(
    () => templates.filter((template) => isTemplateCompatibleWithSource(template, creatorSource)),
    [creatorSource, templates],
  );
  const replyTemplateOptions = sourceCompatibleTemplates.length
    ? sourceCompatibleTemplates
    : templates;
  const selectedTemplate =
    replyTemplateOptions.find((template) => template.id === selectedTemplateId) ??
    replyTemplateOptions[0];
  const defaultTargetLanguage = settings.defaultTargetLanguage ?? "english";

  useEffect(() => {
    const loadedDatabase = loadKatlasBuddyDatabase();
    const loadedRegistry = loadCampaignRegistry();
    setDatabase(loadedDatabase);
    setCampaignRegistry(loadedRegistry);
    setSelectedTemplateId(loadedDatabase.worksheets.Templates[0]?.id ?? "");
    setTargetLanguage(loadedDatabase.worksheets.Settings.defaultTargetLanguage);
    setSelectedMemoryCampaignId(loadedRegistry.campaigns[0]?.id ?? "");
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    saveKatlasBuddyDatabase(database);
  }, [database, loaded]);

  useEffect(() => {
    if (!replyTemplateOptions.length) return;
    if (
      selectedTemplateId &&
      replyTemplateOptions.some((template) => template.id === selectedTemplateId)
    ) {
      return;
    }
    setSelectedTemplateId(replyTemplateOptions[0].id);
  }, [replyTemplateOptions, selectedTemplateId]);

  useEffect(() => {
    const language = detectLanguage(creatorMessage);
    setDetectedLanguage(language);
    setTargetLanguage(resolveReplyTargetLanguage(language, defaultTargetLanguage));

    let cancelled = false;
    translateText({
      text: creatorMessage,
      sourceLanguage: language,
      targetLanguage: "english",
    }).then((translation) => {
      if (!cancelled) setEnglishTranslation(translation);
    });

    return () => {
      cancelled = true;
    };
  }, [creatorMessage, defaultTargetLanguage]);

  useEffect(() => {
    if (!selectedTemplate) {
      setReplyEditor("");
      return;
    }

    setReplyEditor(applyBasicTemplateFields(selectedTemplate.body, creatorName));
  }, [creatorName, selectedTemplate]);

  useEffect(() => {
    let cancelled = false;
    translateText({
      text: replyEditor,
      sourceLanguage: "english",
      targetLanguage,
    }).then((translation) => {
      if (!cancelled) setTranslatedReply(translation);
    });

    return () => {
      cancelled = true;
    };
  }, [replyEditor, targetLanguage]);

  function updateSettings(patch: Partial<KatlasBuddyDatabase["worksheets"]["Settings"]>) {
    const now = new Date().toISOString();
    setDatabase((current) => ({
      ...current,
      worksheets: {
        ...current.worksheets,
        Settings: {
          ...current.worksheets.Settings,
          ...patch,
          updatedAt: now,
        },
      },
    }));
  }

  function changeCreatorSource(source: CreatorMessageSource) {
    updateSettings({ defaultSource: source });
    setTargetLanguage(resolveReplyTargetLanguage(detectedLanguage, defaultTargetLanguage));

    const currentTemplate = templates.find((template) => template.id === selectedTemplateId);
    if (currentTemplate && isTemplateCompatibleWithSource(currentTemplate, source)) return;

    const nextTemplate = templates.find((template) =>
      isTemplateCompatibleWithSource(template, source),
    );
    if (nextTemplate) setSelectedTemplateId(nextTemplate.id);
  }

  function openNewTemplateModal() {
    const template = {
      ...createBlankTemplate("Initial Outreach"),
      templateName: "",
      channelType: creatorSource as ChannelType,
      body: "",
      fields: [],
      requiredFields: [],
      notes: "",
    };
    setTemplateDraft(template);
    setIsNewTemplateModalOpen(true);
  }

  function saveTemplateDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!templateDraft) return;
    if (!templateDraft.templateName.trim() || !templateDraft.body.trim()) return;

    const now = new Date().toISOString();
    const savedTemplate = {
      ...templateDraft,
      templateName: templateDraft.templateName.trim(),
      category: "Initial Outreach" as const,
      fields: extractTemplateFields(templateDraft.body),
      requiredFields: [],
      notes: "",
      updatedAt: now,
    };

    setDatabase((current) => {
      const exists = current.worksheets.Templates.some(
        (template) => template.id === savedTemplate.id,
      );
      return {
        ...current,
        worksheets: {
          ...current.worksheets,
          Templates: exists
            ? current.worksheets.Templates.map((template) =>
                template.id === savedTemplate.id ? savedTemplate : template,
              )
            : [savedTemplate, ...current.worksheets.Templates],
        },
      };
    });
    setSelectedTemplateId(savedTemplate.id);
    updateSettings({ defaultSource: savedTemplate.channelType as CreatorMessageSource });
    setTemplateDraft(null);
    setIsNewTemplateModalOpen(false);
    setCopyStatus("Template saved.");
  }

  async function copyText(text: string, label: string) {
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus(`${label} copied.`);
    } catch {
      setCopyStatus("Copy failed.");
    }
  }

  function insertMemoryContent(content: string) {
    if (!content.trim()) return;

    const textarea = replyTextareaRef.current;
    const selection = replySelectionRef.current;
    const hasSavedCursor =
      textarea &&
      selection &&
      selection.start <= replyEditor.length &&
      selection.end <= replyEditor.length;

    if (!textarea || !hasSavedCursor) {
      setReplyEditor((current) => (current.trim() ? `${current}\n\n${content}` : content));
      return;
    }

    const { start, end } = selection;
    const nextValue = `${replyEditor.slice(0, start)}${content}${replyEditor.slice(end)}`;
    setReplyEditor(nextValue);
    replySelectionRef.current = {
      start: start + content.length,
      end: start + content.length,
    };

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.selectionStart = start + content.length;
      textarea.selectionEnd = start + content.length;
    });
  }

  function rememberReplySelection() {
    const textarea = replyTextareaRef.current;
    if (!textarea) return;
    replySelectionRef.current = {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
    };
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <TopBar />
      <div className="absolute inset-x-0 top-0 h-[320px] bg-hero-glow pointer-events-none" />

      <main className="relative mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 py-5">
        <section className="rounded-xl border border-border bg-card/70 p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Creator Outreach Assistant
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight">
                Translate, build, and copy creator replies.
              </h1>
            </div>

            <div className="grid gap-3 md:grid-cols-[180px] md:items-end">
              <TextInput label="Creator Name" value={creatorName} onChange={setCreatorName} />
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Panel title="Creator Message" icon={Languages}>
            <div className="grid gap-3">
              <ControlCard
                label="Auto Detect Language"
                value={getLanguageLabel(detectedLanguage)}
                helper="Paste a creator message to translate it into English."
              />
            </div>

            <div className="mt-3 grid min-h-[520px] gap-3 md:grid-cols-2">
              <FieldLabel label="Message Input Box">
                <textarea
                  value={creatorMessage}
                  onChange={(event) => setCreatorMessage(event.target.value)}
                  placeholder="Paste the creator message here."
                  className="h-[470px] w-full resize-none rounded-md border border-input bg-background px-3 py-3 text-sm leading-6 outline-none ring-ring focus:ring-2"
                />
              </FieldLabel>
              <FieldLabel label="English Translation Box">
                <textarea
                  value={englishTranslation}
                  readOnly
                  className="h-[470px] w-full resize-none rounded-md border border-input bg-background px-3 py-3 text-sm leading-6 text-muted-foreground outline-none"
                />
              </FieldLabel>
            </div>

            <div className="mt-3 flex justify-end">
              <button
                onClick={() => copyText(englishTranslation, "Translation")}
                disabled={!englishTranslation.trim()}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Copy className="size-4" />
                Copy Translation
              </button>
            </div>
          </Panel>

          <Panel title="Reply Builder" icon={FileInput}>
            <div className="grid gap-3 md:grid-cols-[170px_1fr] xl:grid-cols-[170px_minmax(0,1fr)_auto_170px] xl:items-end">
              <ReplyTypeField value={creatorSource} onChange={changeCreatorSource} />
              <FieldLabel label="Reply Template">
                <select
                  aria-label="Reply Template"
                  value={selectedTemplateId}
                  onChange={(event) => setSelectedTemplateId(event.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus:ring-2"
                >
                  {replyTemplateOptions.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.templateName}
                    </option>
                  ))}
                </select>
              </FieldLabel>
              <button
                onClick={openNewTemplateModal}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium transition hover:bg-accent"
              >
                <Plus className="size-4" />
                New Template
              </button>
              <FieldLabel label="Target Language">
                <LanguageSelect value={targetLanguage} onChange={setTargetLanguage} />
              </FieldLabel>
            </div>

            <div className="mt-3 grid min-h-[520px] gap-3 md:grid-cols-2">
              <FieldLabel label="Original Reply">
                <textarea
                  ref={replyTextareaRef}
                  value={replyEditor}
                  onChange={(event) => setReplyEditor(event.target.value)}
                  onClick={rememberReplySelection}
                  onKeyUp={rememberReplySelection}
                  onSelect={rememberReplySelection}
                  placeholder="Select a template to build the reply."
                  className="h-[470px] w-full resize-none rounded-md border border-input bg-background px-3 py-3 text-sm leading-6 outline-none ring-ring focus:ring-2"
                />
              </FieldLabel>
              <FieldLabel label="Translated Reply">
                <textarea
                  value={translatedReply}
                  readOnly
                  className="h-[470px] w-full resize-none rounded-md border border-input bg-background px-3 py-3 text-sm leading-6 text-muted-foreground outline-none"
                />
              </FieldLabel>
            </div>

            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button
                onClick={() => copyText(replyEditor, "Original reply")}
                disabled={!replyEditor.trim()}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Copy className="size-4" />
                Copy Original
              </button>
              <button
                onClick={() => copyText(translatedReply, "Translated reply")}
                disabled={!translatedReply.trim()}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Copy className="size-4" />
                Copy Reply
              </button>
              <button
                onClick={() =>
                  copyText(`${replyEditor}\n\n${translatedReply}`, "Original and translation")
                }
                disabled={!replyEditor.trim() && !translatedReply.trim()}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Copy className="size-4" />
                Copy Both
              </button>
            </div>
          </Panel>
        </section>

        {copyStatus ? (
          <div className="rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
            {copyStatus}
          </div>
        ) : null}
      </main>

      <CampaignMemoryWidget
        isOpen={isMemoryWidgetOpen}
        detectedLanguage={detectedLanguage}
        registry={campaignRegistry}
        selectedCampaignId={selectedMemoryCampaignId}
        onToggle={() => setIsMemoryWidgetOpen((current) => !current)}
        onSelectCampaign={setSelectedMemoryCampaignId}
        onInsert={insertMemoryContent}
        onCopy={copyText}
      />

      {isNewTemplateModalOpen && templateDraft ? (
        <NewTemplateModal
          template={templateDraft}
          onChange={setTemplateDraft}
          onSubmit={saveTemplateDraft}
          onClose={() => {
            setTemplateDraft(null);
            setIsNewTemplateModalOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function NewTemplateModal({
  template,
  onChange,
  onSubmit,
  onClose,
}: {
  template: OutreachTemplate;
  onChange: (template: OutreachTemplate) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 backdrop-blur-sm">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-2xl rounded-xl border border-border bg-card p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">New Template</p>
            <h2 className="mt-1 text-xl font-semibold">Save a reusable message</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-background transition hover:bg-accent"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_160px]">
          <TextInput
            label="Template Name"
            value={template.templateName}
            onChange={(templateName) => onChange({ ...template, templateName })}
          />
          <FieldLabel label="Type">
            <select
              value={template.channelType}
              onChange={(event) =>
                onChange({
                  ...template,
                  channelType: event.target.value as ChannelType,
                })
              }
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus:ring-2"
            >
              {simpleTemplateTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </FieldLabel>
        </div>

        <div className="mt-4">
          <div className="flex items-end justify-between gap-3">
            <span className="text-xs font-medium text-muted-foreground">Message Body</span>
            <button
              type="button"
              onClick={() => onChange(addGenericField(template))}
              className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-background px-2.5 text-xs font-medium transition hover:bg-accent"
            >
              <Plus className="size-3.5" />
              Add Field
            </button>
          </div>
          <textarea
            value={template.body}
            rows={10}
            placeholder="Write the reusable message. Use generic placeholders like {{field}}, {{field_1}}, or {{field_2}}."
            onChange={(event) =>
              onChange({
                ...template,
                body: event.target.value,
                fields: extractTemplateFields(event.target.value),
              })
            }
            className="mt-1 w-full resize-y rounded-md border border-input bg-background px-3 py-3 text-sm leading-6 outline-none ring-ring focus:ring-2"
          />
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center rounded-md border border-border bg-background px-4 text-sm font-medium transition hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!template.templateName.trim() || !template.body.trim()}
            className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );
}

function CampaignMemoryWidget({
  isOpen,
  detectedLanguage,
  registry,
  selectedCampaignId,
  onToggle,
  onSelectCampaign,
  onInsert,
  onCopy,
}: {
  isOpen: boolean;
  detectedLanguage: OutreachLanguage;
  registry: GlobalCampaignRegistry;
  selectedCampaignId: string;
  onToggle: () => void;
  onSelectCampaign: (campaignId: string) => void;
  onInsert: (content: string) => void;
  onCopy: (content: string, label: string) => void;
}) {
  const detectedLanguageLabel = getLanguageLabel(detectedLanguage);
  const suggestedCampaigns = registry.campaigns.filter((campaign) =>
    campaign.preferredLanguages.includes(detectedLanguageLabel as CampaignMemoryLanguage),
  );
  const selectedCampaign =
    registry.campaigns.find((campaign) => campaign.id === selectedCampaignId) ??
    suggestedCampaigns[0] ??
    registry.campaigns[0];

  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3">
      {isOpen ? (
        <section className="max-h-[calc(100vh-120px)] w-[min(460px,calc(100vw-40px))] overflow-y-auto rounded-2xl border border-cyan-300/20 bg-card/85 p-4 shadow-2xl shadow-cyan-950/30 backdrop-blur-xl transition-all duration-200">
          <div className="flex items-start justify-between gap-4 border-b border-border pb-3">
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Campaign Memory
              </p>
              <h2 className="mt-1 text-lg font-semibold">Reusable campaign information</h2>
            </div>
            <button
              type="button"
              onClick={onToggle}
              className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-background transition hover:bg-accent"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="mt-4 grid gap-3">
            <div className="rounded-lg border border-border bg-background/80 p-3">
              <p className="text-xs text-muted-foreground">Detected Language</p>
              <p className="mt-1 text-sm font-semibold">{detectedLanguageLabel}</p>
            </div>

            <div className="rounded-lg border border-border bg-background/80 p-3">
              <p className="text-xs font-medium text-muted-foreground">Suggested Campaigns</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {suggestedCampaigns.length ? (
                  suggestedCampaigns.map((campaign) => (
                    <button
                      key={campaign.id}
                      type="button"
                      onClick={() => onSelectCampaign(campaign.id)}
                      className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium transition hover:bg-accent"
                    >
                      {campaign.campaignName}
                    </button>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">
                    No campaign matches this language yet.
                  </span>
                )}
              </div>
            </div>

            <FieldLabel label="Select Campaign">
              <select
                value={selectedCampaign?.id ?? ""}
                onChange={(event) => onSelectCampaign(event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus:ring-2"
              >
                {registry.campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.campaignName}
                  </option>
                ))}
              </select>
            </FieldLabel>

            <div className="space-y-2">
              {selectedCampaign?.memoryCards.length ? (
                selectedCampaign.memoryCards.map((card) => (
                  <article
                    key={card.id}
                    className="rounded-lg border border-border bg-background/80 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold">{card.title}</h3>
                        <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
                          {card.content || "No content"}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        <button
                          type="button"
                          onClick={() => onInsert(card.content)}
                          disabled={!card.content.trim()}
                          className="inline-flex h-8 items-center rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Insert
                        </button>
                        <button
                          type="button"
                          onClick={() => onCopy(card.content, card.title)}
                          disabled={!card.content.trim()}
                          className="inline-flex h-8 items-center rounded-md border border-border bg-card px-2.5 text-xs font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-border bg-background/80 p-4 text-sm text-muted-foreground">
                  No memory cards saved for this campaign yet. Add them in Campaign Profiles.
                </div>
              )}
            </div>
          </div>
        </section>
      ) : null}

      <button
        type="button"
        onClick={onToggle}
        className="inline-flex size-14 items-center justify-center rounded-full border border-cyan-300/30 bg-card/90 text-cyan-200 shadow-2xl shadow-cyan-950/30 backdrop-blur transition hover:scale-105 hover:border-cyan-300/50 hover:text-cyan-100"
        aria-label="Campaign Memory"
      >
        <Database className="size-6" />
      </button>
    </div>
  );
}

function addGenericField(template: OutreachTemplate): OutreachTemplate {
  const existingFields = extractTemplateFields(template.body).filter((field) =>
    /^field(_\d+)?$/.test(field),
  );
  const nextField = existingFields.length === 0 ? "field" : `field_${existingFields.length}`;
  const spacer = template.body.endsWith("\n") || !template.body ? "" : " ";
  const body = `${template.body}${spacer}{{${nextField}}}`;
  return {
    ...template,
    body,
    fields: extractTemplateFields(body),
  };
}

function applyBasicTemplateFields(body: string, creatorName: string): string {
  return body
    .replace(/\{\{creator_name\}\}/gi, creatorName.trim() || "Creator")
    .replace(/\{creator_name\}/gi, creatorName.trim() || "Creator");
}

function resolveReplyTargetLanguage(
  detectedLanguage: OutreachLanguage,
  projectLanguage: OutreachLanguage,
) {
  return detectedLanguage === "english" ? projectLanguage : detectedLanguage;
}

function isTemplateCompatibleWithSource(template: OutreachTemplate, source: CreatorMessageSource) {
  return template.channelType === source;
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
    <section className="flex h-full flex-col rounded-xl border border-border bg-card p-4">
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

function ControlCard({
  label,
  value,
  helper,
  children,
}: {
  label: string;
  value: string;
  helper?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-[86px] flex-col justify-between rounded-lg border border-border bg-background px-4 py-3">
      <div>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {children ? (
          children
        ) : (
          <p className="mt-2 text-base font-semibold leading-6 text-foreground">{value}</p>
        )}
      </div>
      {helper ? <p className="mt-2 text-xs text-muted-foreground">{helper}</p> : null}
    </div>
  );
}

function ReplyTypeField({
  value,
  onChange,
}: {
  value: CreatorMessageSource;
  onChange: (value: CreatorMessageSource) => void;
}) {
  return (
    <div className="block">
      <span className="text-xs font-medium text-muted-foreground">Reply Type</span>
      <div className="mt-1">
        <ReplyTypeToggle value={value} onChange={onChange} />
      </div>
    </div>
  );
}

function ReplyTypeToggle({
  value,
  onChange,
}: {
  value: CreatorMessageSource;
  onChange: (value: CreatorMessageSource) => void;
}) {
  return (
    <div className="grid h-10 grid-cols-2 rounded-md border border-input bg-background p-1">
      {creatorMessageSources.map((source) => {
        const isActive = source === value;
        return (
          <button
            key={source}
            type="button"
            onClick={() => onChange(source)}
            className={`rounded-[5px] px-3 text-sm font-medium transition ${
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            {source}
          </button>
        );
      })}
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

function LanguageSelect({
  value,
  onChange,
}: {
  value: OutreachLanguage;
  onChange: (value: OutreachLanguage) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as OutreachLanguage)}
      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus:ring-2"
    >
      {outreachLanguages.map((language) => (
        <option key={language.code} value={language.code}>
          {language.label}
        </option>
      ))}
    </select>
  );
}
