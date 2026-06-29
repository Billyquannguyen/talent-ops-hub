import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Building2,
  Copy,
  CopyPlus,
  Database,
  FileInput,
  Languages,
  Layers3,
  Pencil,
  Plus,
  SmilePlus,
  Sparkles,
  Settings2,
  Trash2,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { TopBar } from "@/components/TopBar";
import {
  campaignMemoryLanguages,
  loadCampaignRegistry,
  saveCampaignMemoryForCampaign,
  type CampaignMemoryLanguage,
  type CampaignMemoryCard,
  type GlobalCampaignRegistry,
} from "@/lib/campaignRegistry";
import {
  createOutreachTemplateInGoogleSheetsOnly,
  deleteAgencyDatabaseRecordFromGoogleSheetsOnly,
  deleteCreatorDatabaseRecordFromGoogleSheetsOnly,
  deleteOutreachTemplateFromGoogleSheetsOnly,
  listAgencyDatabaseFromGoogleSheetsOnly,
  listCreatorDatabaseFromGoogleSheetsOnly,
  loadCreatorOutreachBundleFromGoogleSheetsOnly,
  migrateAgencyDatabaseContactsInGoogleSheetsOnly,
  saveAgencyDatabaseRecordToGoogleSheetsOnly,
  saveCreatorDatabaseRecordToGoogleSheetsOnly,
  updateOutreachTemplateInGoogleSheetsOnly,
} from "@/storage/appRepository";
import type {
  AgencyDatabaseRecord,
  CampaignMemoryCardRecord,
  CampaignProfileRecord,
  CreatorDatabaseRecord,
  OutreachTemplateRecord,
} from "@/storage/schema";
import { DatabaseViewModal } from "./ContactDatabaseModal";
import {
  createDefaultDatabase,
  loadKatlasBuddyDatabase,
  outreachTemplateRecordToTemplate,
  outreachTemplateToRecord,
  saveKatlasBuddyDatabase,
} from "./database";
import {
  createBlankTemplate,
  createId as createOutreachId,
  extractTemplateFields,
} from "./messageComposer";
import {
  detectLanguage,
  getLanguageBadge,
  getLanguageLabel,
  polishReply,
  suggestedOutreachLanguages,
  translateText,
} from "./translation";
import {
  creatorMessageSources,
  type ChannelType,
  type CreatorMessageSource,
  type KatlasBuddyDatabase,
  type OutreachTemplate,
} from "./types";

const simpleTemplateTypes = ["DM", "Email"] as const;
const databaseStatusOptions = ["potential", "contacted", "interested", "rejected", "saved"];
type TextInsertTarget = "creatorMessage" | "replyEditor" | "translatedReply" | "templateBody";
type DatabaseViewType = "agency" | "creator";
const outreachEmojis = [
  "😊",
  "🙏",
  "✨",
  "🙌",
  "👍",
  "💛",
  "💙",
  "🔥",
  "🎉",
  "📩",
  "📌",
  "✅",
  "🤝",
  "💬",
  "💡",
  "📅",
  "⏰",
  "🚀",
] as const;

export function CreatorOutreachAssistant() {
  const [loaded, setLoaded] = useState(false);
  const [database, setDatabase] = useState<KatlasBuddyDatabase>(() => createDefaultDatabase());
  const [campaignRegistry, setCampaignRegistry] = useState<GlobalCampaignRegistry>(() =>
    loadCampaignRegistry(),
  );
  const [creatorMessage, setCreatorMessage] = useState("");
  const [detectedLanguage, setDetectedLanguage] = useState("English");
  const [englishTranslation, setEnglishTranslation] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [replyEditor, setReplyEditor] = useState("");
  const [targetLanguage, setTargetLanguage] = useState("Thai");
  const [translatedReply, setTranslatedReply] = useState("");
  const [isNewTemplateModalOpen, setIsNewTemplateModalOpen] = useState(false);
  const [isTemplateManagerOpen, setIsTemplateManagerOpen] = useState(false);
  const [isSmartFieldsModalOpen, setIsSmartFieldsModalOpen] = useState(false);
  const [isMemoryWidgetOpen, setIsMemoryWidgetOpen] = useState(false);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [activeDatabaseView, setActiveDatabaseView] = useState<DatabaseViewType | null>(null);
  const [agencyRecords, setAgencyRecords] = useState<AgencyDatabaseRecord[]>([]);
  const [creatorRecords, setCreatorRecords] = useState<CreatorDatabaseRecord[]>([]);
  const [isDatabaseLoading, setIsDatabaseLoading] = useState(false);
  const [isDatabaseSaving, setIsDatabaseSaving] = useState(false);
  const [databaseError, setDatabaseError] = useState("");
  const [agencyDraft, setAgencyDraft] = useState<AgencyDatabaseRecord | null>(null);
  const [creatorDraft, setCreatorDraft] = useState<CreatorDatabaseRecord | null>(null);
  const [selectedMemoryCampaignId, setSelectedMemoryCampaignId] = useState("");
  const [templateDraft, setTemplateDraft] = useState<OutreachTemplate | null>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const [translationStatus, setTranslationStatus] = useState("");
  const replyEditorTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const translatedReplyTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const selectedTemplateIdRef = useRef("");
  const activeTextTargetRef = useRef<{
    id: TextInsertTarget;
    element: HTMLTextAreaElement;
    start: number;
    end: number;
  } | null>(null);

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
  const defaultTargetLanguage = getLanguageLabel(settings.defaultTargetLanguage ?? "english");

  useEffect(() => {
    selectedTemplateIdRef.current = selectedTemplateId;
  }, [selectedTemplateId]);

  const applyOutreachTemplateRecords = useCallback(
    (records: OutreachTemplateRecord[], preferredTemplateId?: string) => {
      const nextTemplates = records.map(outreachTemplateRecordToTemplate);
      const currentSelectedTemplateId = selectedTemplateIdRef.current;
      const nextSelectedTemplateId =
        (preferredTemplateId &&
        nextTemplates.some((template) => template.id === preferredTemplateId)
          ? preferredTemplateId
          : currentSelectedTemplateId &&
              nextTemplates.some((template) => template.id === currentSelectedTemplateId)
            ? currentSelectedTemplateId
            : nextTemplates[0]?.id) ?? "";

      selectedTemplateIdRef.current = nextSelectedTemplateId;
      setDatabase((current) => ({
        ...current,
        worksheets: {
          ...current.worksheets,
          Templates: nextTemplates,
        },
      }));
      setSelectedTemplateId(nextSelectedTemplateId);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    const loadedDatabase = loadKatlasBuddyDatabase();
    const loadedRegistry = loadCampaignRegistry();
    const loadedTemplateId = loadedDatabase.worksheets.Templates[0]?.id ?? "";
    setDatabase(loadedDatabase);
    setCampaignRegistry(loadedRegistry);
    selectedTemplateIdRef.current = loadedTemplateId;
    setSelectedTemplateId(loadedTemplateId);
    setTargetLanguage(getLanguageLabel(loadedDatabase.worksheets.Settings.defaultTargetLanguage));
    setSelectedMemoryCampaignId(loadedRegistry.campaigns[0]?.id ?? "");
    setLoaded(true);

    void (async () => {
      try {
        const bundle = await loadCreatorOutreachBundleFromGoogleSheetsOnly();
        if (cancelled) return;
        const registryResult = createOutreachRegistryFromBundle(
          bundle.campaignProfiles,
          bundle.campaignMemoryCards,
        );
        applyOutreachTemplateRecords(bundle.outreachTemplates);
        setCampaignRegistry(registryResult);
        setSelectedMemoryCampaignId((current) => current || registryResult.campaigns[0]?.id || "");
      } catch (error) {
        if (cancelled) return;
        setCopyStatus(
          error instanceof Error
            ? error.message
            : "Google Sheets is unavailable. Outreach templates were not loaded.",
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyOutreachTemplateRecords]);

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
    let cancelled = false;

    if (!creatorMessage.trim()) {
      setDetectedLanguage("English");
      setEnglishTranslation("");
      setTranslationStatus("");
      return;
    }

    const timeout = window.setTimeout(() => {
      void (async () => {
        try {
          setTranslationStatus("Detecting language...");
          const language = await detectLanguage(creatorMessage);
          if (cancelled) return;

          setDetectedLanguage(language);
          setTargetLanguage(resolveReplyTargetLanguage(language, defaultTargetLanguage));
          setTranslationStatus("Translating creator message...");

          const translation = await translateText({
            text: creatorMessage,
            sourceLanguage: language,
            targetLanguage: "English",
          });

          if (!cancelled) {
            setEnglishTranslation(translation);
            setTranslationStatus("");
          }
        } catch (error) {
          if (!cancelled) {
            setEnglishTranslation("");
            setTranslationStatus(getTranslationErrorMessage(error));
          }
        }
      })();
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [creatorMessage, defaultTargetLanguage]);

  useEffect(() => {
    if (!selectedTemplate) {
      setReplyEditor("");
      return;
    }

    setReplyEditor(selectedTemplate.body);
  }, [selectedTemplate]);

  useEffect(() => {
    let cancelled = false;

    if (!replyEditor.trim()) {
      setTranslatedReply("");
      return;
    }

    const timeout = window.setTimeout(() => {
      void (async () => {
        try {
          setTranslationStatus("Translating reply...");
          const translation = await translateText({
            text: replyEditor,
            sourceLanguage: "english",
            targetLanguage,
          });

          if (!cancelled) {
            setTranslatedReply(translation);
            setTranslationStatus("");
          }
        } catch (error) {
          if (!cancelled) {
            setTranslatedReply("");
            setTranslationStatus(getTranslationErrorMessage(error));
          }
        }
      })();
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
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

  function openEditTemplateModal(template: OutreachTemplate) {
    setTemplateDraft({ ...template });
    setIsNewTemplateModalOpen(true);
  }

  async function duplicateTemplate(template: OutreachTemplate) {
    const now = new Date().toISOString();
    const duplicate: OutreachTemplate = {
      ...template,
      id: createOutreachId("template"),
      templateName: getDuplicateTemplateName(template.templateName, templates),
      createdAt: now,
      updatedAt: now,
    };

    try {
      const records = await createOutreachTemplateInGoogleSheetsOnly(
        outreachTemplateToRecord(duplicate),
      );
      applyOutreachTemplateRecords(records, duplicate.id);
      setCopyStatus("Template duplicated.");
    } catch (error) {
      setCopyStatus(
        error instanceof Error
          ? error.message
          : "Google Sheets save failed. Template was not duplicated.",
      );
    }
  }

  async function deleteTemplate(templateId: string) {
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    const confirmed =
      typeof window === "undefined" ||
      window.confirm(`Delete "${template.templateName}"? This cannot be undone.`);
    if (!confirmed) return;

    try {
      const records = await deleteOutreachTemplateFromGoogleSheetsOnly(templateId);
      applyOutreachTemplateRecords(records);
      setCopyStatus("Template deleted.");
    } catch (error) {
      setCopyStatus(
        error instanceof Error
          ? error.message
          : "Google Sheets delete failed. Template was not deleted.",
      );
    }
  }

  async function saveTemplateDraft(event: FormEvent<HTMLFormElement>) {
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

    try {
      const exists = templates.some((template) => template.id === savedTemplate.id);
      const records = exists
        ? await updateOutreachTemplateInGoogleSheetsOnly(outreachTemplateToRecord(savedTemplate))
        : await createOutreachTemplateInGoogleSheetsOnly(outreachTemplateToRecord(savedTemplate));
      applyOutreachTemplateRecords(records, savedTemplate.id);
      updateSettings({ defaultSource: savedTemplate.channelType as CreatorMessageSource });
      setTemplateDraft(null);
      setIsNewTemplateModalOpen(false);
      setCopyStatus("Template saved.");
    } catch (error) {
      setCopyStatus(
        error instanceof Error
          ? error.message
          : "Google Sheets save failed. Template was not saved.",
      );
    }
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

  async function polishCurrentReply() {
    if (!replyEditor.trim()) return;
    setTranslationStatus("Polishing reply...");
    try {
      const polished = await polishReply(replyEditor, "English");
      setReplyEditor(polished);
      setTranslationStatus("");
    } catch (error) {
      setTranslationStatus(getTranslationErrorMessage(error));
    }
  }

  async function openDatabaseView(view: DatabaseViewType) {
    setActiveDatabaseView(view);
    setDatabaseError("");
    setIsDatabaseLoading(true);
    try {
      if (view === "agency") {
        setAgencyRecords(await listAgencyDatabaseFromGoogleSheetsOnly());
      } else {
        setCreatorRecords(await listCreatorDatabaseFromGoogleSheetsOnly());
      }
    } catch (error) {
      setDatabaseError(
        error instanceof Error
          ? error.message
          : "Google Sheets is unavailable. Database records could not be loaded.",
      );
    } finally {
      setIsDatabaseLoading(false);
    }
  }

  function closeDatabaseView() {
    setActiveDatabaseView(null);
    setAgencyDraft(null);
    setCreatorDraft(null);
    setDatabaseError("");
  }

  function createAgencyDraft(): AgencyDatabaseRecord {
    const now = new Date().toISOString();
    return {
      id: createOutreachId("agency"),
      agencyName: "",
      contactName: "",
      contactRole: "",
      contact: "",
      contactsJson: "",
      email: "",
      line: "",
      instagram: "",
      website: "",
      country: "",
      niche: "",
      notes: "",
      status: "potential",
      createdAt: now,
      updatedAt: now,
    };
  }

  function createCreatorDraft(): CreatorDatabaseRecord {
    const now = new Date().toISOString();
    return {
      id: createOutreachId("creator-db"),
      creatorName: "",
      handle: "",
      platform: "",
      profileUrl: "",
      country: "",
      language: "",
      niche: "",
      followers: 0,
      avgViews: 0,
      email: "",
      line: "",
      instagram: "",
      whatsapp: "",
      agencyName: "",
      notes: "",
      status: "potential",
      createdAt: now,
      updatedAt: now,
    };
  }

  async function saveAgencyDraft(record: AgencyDatabaseRecord) {
    if (!record.agencyName.trim()) {
      setDatabaseError("Agency name is required.");
      return;
    }

    setIsDatabaseSaving(true);
    setDatabaseError("");
    try {
      const now = new Date().toISOString();
      const agencyContacts = normalizeAgencyContactRows(record);
      const firstContact = agencyContacts[0] ?? {
        name: "",
        role: "",
        contact: "",
      };
      const savedRecord = {
        ...record,
        agencyName: record.agencyName.trim(),
        contactName: firstContact.name,
        contactRole: firstContact.role,
        contact: firstContact.contact,
        contactsJson: JSON.stringify(agencyContacts),
        email: extractEmailFromContact(firstContact.contact),
        line: extractLineFromContact(firstContact.contact),
        niche: "",
        status: record.status || "potential",
        createdAt: record.createdAt || now,
        updatedAt: now,
      };
      const records = await saveAgencyDatabaseRecordToGoogleSheetsOnly(savedRecord);
      setAgencyRecords(records);
      setAgencyDraft(null);
      setCopyStatus("Agency saved to Google Sheets.");
    } catch (error) {
      setDatabaseError(
        error instanceof Error ? error.message : "Google Sheets save failed. Agency was not saved.",
      );
    } finally {
      setIsDatabaseSaving(false);
    }
  }

  async function saveCreatorDraft(record: CreatorDatabaseRecord) {
    if (!record.creatorName.trim()) {
      setDatabaseError("Creator name is required.");
      return;
    }

    setIsDatabaseSaving(true);
    setDatabaseError("");
    try {
      const now = new Date().toISOString();
      const savedRecord = {
        ...record,
        creatorName: record.creatorName.trim(),
        followers: normalizeNumber(record.followers),
        avgViews: normalizeNumber(record.avgViews),
        status: normalizeDatabaseStatus(record.status),
        createdAt: record.createdAt || now,
        updatedAt: now,
      };
      const records = await saveCreatorDatabaseRecordToGoogleSheetsOnly(savedRecord);
      setCreatorRecords(records);
      setCreatorDraft(null);
      setCopyStatus("Creator saved to Google Sheets.");
    } catch (error) {
      setDatabaseError(
        error instanceof Error
          ? error.message
          : "Google Sheets save failed. Creator was not saved.",
      );
    } finally {
      setIsDatabaseSaving(false);
    }
  }

  async function deleteAgencyRecord(recordId: string) {
    const confirmed =
      typeof window === "undefined" ||
      window.confirm("Delete this agency record from Google Sheets?");
    if (!confirmed) return;

    setIsDatabaseSaving(true);
    setDatabaseError("");
    try {
      const records = await deleteAgencyDatabaseRecordFromGoogleSheetsOnly(recordId);
      setAgencyRecords(records);
      setCopyStatus("Agency deleted from Google Sheets.");
    } catch (error) {
      setDatabaseError(
        error instanceof Error
          ? error.message
          : "Google Sheets delete failed. Agency was not deleted.",
      );
    } finally {
      setIsDatabaseSaving(false);
    }
  }

  async function migrateAgencyContacts() {
    const confirmed =
      typeof window === "undefined" ||
      window.confirm(
        "Run safe Agency Database contact migration? This creates a backup tab first and keeps old columns.",
      );
    if (!confirmed) return;

    setIsDatabaseSaving(true);
    setDatabaseError("");
    try {
      const result = await migrateAgencyDatabaseContactsInGoogleSheetsOnly();
      setAgencyRecords(result.records);
      setCopyStatus(
        `Agency contacts migrated. Backup tab: ${result.report.backupSheetName}. Rows backfilled: ${result.report.rowsBackfilled}.`,
      );
    } catch (error) {
      setDatabaseError(
        error instanceof Error
          ? error.message
          : "Google Sheets migration failed. Agency contacts were not migrated.",
      );
    } finally {
      setIsDatabaseSaving(false);
    }
  }

  async function deleteCreatorRecord(recordId: string) {
    const confirmed =
      typeof window === "undefined" ||
      window.confirm("Delete this creator record from Google Sheets?");
    if (!confirmed) return;

    setIsDatabaseSaving(true);
    setDatabaseError("");
    try {
      const records = await deleteCreatorDatabaseRecordFromGoogleSheetsOnly(recordId);
      setCreatorRecords(records);
      setCopyStatus("Creator deleted from Google Sheets.");
    } catch (error) {
      setDatabaseError(
        error instanceof Error
          ? error.message
          : "Google Sheets delete failed. Creator was not deleted.",
      );
    } finally {
      setIsDatabaseSaving(false);
    }
  }

  async function saveSmartFieldsCampaign(
    updatedCampaign: GlobalCampaignRegistry["campaigns"][number],
  ) {
    const nextRegistry = {
      ...campaignRegistry,
      campaigns: campaignRegistry.campaigns.map((campaign) =>
        campaign.id === updatedCampaign.id ? updatedCampaign : campaign,
      ),
    };
    setCampaignRegistry(nextRegistry);
    try {
      const savedRegistry = await saveCampaignMemoryForCampaign(updatedCampaign);
      setCampaignRegistry(savedRegistry);
      if (selectedMemoryCampaignId === "" || selectedMemoryCampaignId === updatedCampaign.id) {
        setSelectedMemoryCampaignId(updatedCampaign.id);
      }
      setCopyStatus("Smart fields saved.");
    } catch (error) {
      setCopyStatus(
        error instanceof Error
          ? error.message
          : "Google Sheets save failed. Smart fields were not saved.",
      );
    }
  }

  function insertSmartFieldContent(content: string) {
    if (!content.trim()) return;

    const target = activeTextTargetRef.current;
    if (
      !target ||
      !target.element.isConnected ||
      (target.id === "templateBody" && !templateDraft)
    ) {
      setReplyEditor((current) => (current.trim() ? `${current}\n\n${content}` : content));
      return;
    }

    insertTextIntoTarget(target.id, content, target.element, target.start, target.end);
  }

  function insertTextIntoTarget(
    id: TextInsertTarget,
    content: string,
    textarea: HTMLTextAreaElement,
    start = textarea.selectionStart,
    end = textarea.selectionEnd,
    options: { blockInsert?: boolean } = {},
  ) {
    const blockInsert = options.blockInsert ?? true;
    let nextPosition = start + content.length;
    const applyInsert = (current: string) => {
      const safeStart = Math.min(Math.max(start, 0), current.length);
      const safeEnd = Math.min(Math.max(end, safeStart), current.length);
      const spacer =
        blockInsert && current && safeStart === current.length && !current.endsWith("\n")
          ? "\n\n"
          : "";
      nextPosition = safeStart + spacer.length + content.length;
      return `${current.slice(0, safeStart)}${spacer}${content}${current.slice(safeEnd)}`;
    };

    if (id === "creatorMessage") setCreatorMessage(applyInsert);
    if (id === "replyEditor") setReplyEditor(applyInsert);
    if (id === "translatedReply") setTranslatedReply(applyInsert);
    if (id === "templateBody") {
      setTemplateDraft((current) =>
        current
          ? {
              ...current,
              body: applyInsert(current.body),
              fields: extractTemplateFields(applyInsert(current.body)),
            }
          : current,
      );
    }

    activeTextTargetRef.current = { id, element: textarea, start: nextPosition, end: nextPosition };
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.selectionStart = nextPosition;
      textarea.selectionEnd = nextPosition;
    });
  }

  function rememberTextTarget(id: TextInsertTarget, textarea: HTMLTextAreaElement) {
    activeTextTargetRef.current = {
      id,
      element: textarea,
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
    };
  }

  function handleSmartFieldDrop(id: TextInsertTarget, event: DragEvent<HTMLTextAreaElement>) {
    const content = event.dataTransfer.getData("text/plain");
    if (!content.trim()) return;
    event.preventDefault();
    const textarea = event.currentTarget;
    textarea.focus();
    insertTextIntoTarget(id, content, textarea, textarea.selectionStart, textarea.selectionEnd);
  }

  function insertEmoji(emoji: string) {
    const target = activeTextTargetRef.current;
    if (
      target &&
      target.element.isConnected &&
      (target.id === "replyEditor" || target.id === "translatedReply")
    ) {
      insertTextIntoTarget(target.id, emoji, target.element, target.start, target.end, {
        blockInsert: false,
      });
      return;
    }

    const textarea = replyEditorTextareaRef.current;
    if (!textarea) {
      setReplyEditor((current) => `${current}${emoji}`);
      return;
    }

    insertTextIntoTarget("replyEditor", emoji, textarea, replyEditor.length, replyEditor.length, {
      blockInsert: false,
    });
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <TopBar />
      <div className="absolute inset-x-0 top-0 h-[320px] bg-hero-glow pointer-events-none" />

      <main className="katlas-page gap-4 py-5">
        <section className="katlas-hero-panel p-4 md:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Creator Outreach Assistant
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight">
                Translate, build, and copy creator replies.
              </h1>
            </div>

            <div className="flex flex-wrap gap-2 lg:justify-end">
              <button
                type="button"
                onClick={() => setIsSmartFieldsModalOpen(true)}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:opacity-90"
              >
                <Layers3 className="size-4" />
                Smart Fields
              </button>
              <button
                type="button"
                onClick={() => {
                  void openDatabaseView("agency");
                }}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium transition hover:bg-accent"
              >
                <Building2 className="size-4" />
                Agency Database
              </button>
              <button
                type="button"
                onClick={() => {
                  void openDatabaseView("creator");
                }}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium transition hover:bg-accent"
              >
                <Users className="size-4" />
                Creator Database
              </button>
            </div>
          </div>
        </section>

        <section className="grid items-stretch gap-4 lg:grid-cols-2">
          <Panel title="Creator Message" icon={Languages}>
            <div className="grid min-h-[122px] gap-3 rounded-lg border border-border/75 bg-background/65 p-3 md:grid-cols-2 md:items-end">
              <ControlBlock
                label="Auto Detect Language"
                value={getLanguageBadge(detectedLanguage)}
                helper="Paste a creator message to translate it into English."
              />
              <ControlBlock
                label="Output"
                value="English Translation"
                helper="Use this side to understand incoming creator replies."
              />
            </div>

            <div className="mt-3 grid min-h-0 flex-1 gap-3 md:grid-cols-2">
              <EditorField label="Message Input Box">
                <textarea
                  value={creatorMessage}
                  onChange={(event) => setCreatorMessage(event.target.value)}
                  onFocus={(event) => rememberTextTarget("creatorMessage", event.currentTarget)}
                  onClick={(event) => rememberTextTarget("creatorMessage", event.currentTarget)}
                  onKeyUp={(event) => rememberTextTarget("creatorMessage", event.currentTarget)}
                  onSelect={(event) => rememberTextTarget("creatorMessage", event.currentTarget)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => handleSmartFieldDrop("creatorMessage", event)}
                  placeholder="Paste the creator message here."
                  className="min-h-[420px] flex-1 resize-none rounded-md border border-input bg-background px-3 py-3 text-sm leading-6 outline-none ring-ring focus:ring-2 lg:min-h-0"
                />
              </EditorField>
              <EditorField label="English Translation Box">
                <textarea
                  value={englishTranslation}
                  readOnly
                  className="min-h-[420px] flex-1 resize-none rounded-md border border-input bg-background px-3 py-3 text-sm leading-6 text-muted-foreground outline-none lg:min-h-0"
                />
              </EditorField>
            </div>

            <div className="mt-3 flex min-h-10 items-center justify-end border-t border-border pt-3">
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
            <div className="grid min-h-[122px] gap-3 rounded-lg border border-border/75 bg-background/65 p-3 xl:grid-cols-[150px_minmax(0,1fr)_124px_176px] xl:items-end">
              <ReplyTypeField value={creatorSource} onChange={changeCreatorSource} />
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <FieldLabel label="Template">
                    <select
                      aria-label="Template"
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
                </div>
                <button
                  type="button"
                  onClick={() => setIsTemplateManagerOpen(true)}
                  title="Manage templates"
                  aria-label="Manage templates"
                  className="inline-flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition hover:bg-accent hover:text-foreground"
                >
                  <Settings2 className="size-4" />
                </button>
              </div>
              <div className="relative">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Tools</span>
                <button
                  type="button"
                  onClick={() => setIsEmojiPickerOpen((current) => !current)}
                  title="Insert emoji"
                  aria-label="Insert emoji"
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
                >
                  <SmilePlus className="size-4" />
                  Emoji
                </button>
                {isEmojiPickerOpen ? (
                  <EmojiPicker
                    emojis={outreachEmojis}
                    onSelect={(emoji) => {
                      insertEmoji(emoji);
                      setIsEmojiPickerOpen(false);
                    }}
                  />
                ) : null}
              </div>
              <FieldLabel label="Language">
                <LanguageSelect value={targetLanguage} onChange={setTargetLanguage} />
              </FieldLabel>
            </div>

            <div className="mt-3 grid min-h-0 flex-1 gap-3 md:grid-cols-2">
              <EditorField label="Original Reply">
                <textarea
                  ref={replyEditorTextareaRef}
                  value={replyEditor}
                  onChange={(event) => setReplyEditor(event.target.value)}
                  onFocus={(event) => rememberTextTarget("replyEditor", event.currentTarget)}
                  onClick={(event) => rememberTextTarget("replyEditor", event.currentTarget)}
                  onKeyUp={(event) => rememberTextTarget("replyEditor", event.currentTarget)}
                  onSelect={(event) => rememberTextTarget("replyEditor", event.currentTarget)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => handleSmartFieldDrop("replyEditor", event)}
                  placeholder="Select a template to build the reply."
                  className="min-h-[420px] flex-1 resize-none rounded-md border border-input bg-background px-3 py-3 text-sm leading-6 outline-none ring-ring focus:ring-2 lg:min-h-0"
                />
              </EditorField>
              <EditorField label="Translated Reply">
                <textarea
                  ref={translatedReplyTextareaRef}
                  value={translatedReply}
                  onChange={(event) => setTranslatedReply(event.target.value)}
                  onFocus={(event) => rememberTextTarget("translatedReply", event.currentTarget)}
                  onClick={(event) => rememberTextTarget("translatedReply", event.currentTarget)}
                  onKeyUp={(event) => rememberTextTarget("translatedReply", event.currentTarget)}
                  onSelect={(event) => rememberTextTarget("translatedReply", event.currentTarget)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => handleSmartFieldDrop("translatedReply", event)}
                  className="min-h-[420px] flex-1 resize-none rounded-md border border-input bg-background px-3 py-3 text-sm leading-6 outline-none ring-ring focus:ring-2 lg:min-h-0"
                />
              </EditorField>
            </div>

            <div className="mt-3 flex min-h-10 flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
              <button
                onClick={polishCurrentReply}
                disabled={!replyEditor.trim()}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Sparkles className="size-4" />
                Polish Reply
              </button>
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

        {translationStatus ? <div className="katlas-status-line">{translationStatus}</div> : null}

        {copyStatus ? <div className="katlas-status-line">{copyStatus}</div> : null}
      </main>

      <CampaignMemoryWidget
        isOpen={isMemoryWidgetOpen}
        detectedLanguage={detectedLanguage}
        registry={campaignRegistry}
        selectedCampaignId={selectedMemoryCampaignId}
        onToggle={() => setIsMemoryWidgetOpen((current) => !current)}
        onSelectCampaign={setSelectedMemoryCampaignId}
        onInsert={insertSmartFieldContent}
      />

      {isSmartFieldsModalOpen ? (
        <SmartFieldsModal
          registry={campaignRegistry}
          selectedCampaignId={selectedMemoryCampaignId}
          onSelectCampaign={setSelectedMemoryCampaignId}
          onSave={saveSmartFieldsCampaign}
          onClose={() => setIsSmartFieldsModalOpen(false)}
        />
      ) : null}

      {activeDatabaseView ? (
        <DatabaseViewModal
          view={activeDatabaseView}
          agencies={agencyRecords}
          creators={creatorRecords}
          isLoading={isDatabaseLoading}
          isSaving={isDatabaseSaving}
          error={databaseError}
          agencyDraft={agencyDraft}
          creatorDraft={creatorDraft}
          onNewAgency={() => setAgencyDraft(createAgencyDraft())}
          onEditAgency={(record) => setAgencyDraft({ ...record })}
          onChangeAgencyDraft={setAgencyDraft}
          onSaveAgency={(record) => {
            void saveAgencyDraft(record);
          }}
          onDeleteAgency={(recordId) => {
            void deleteAgencyRecord(recordId);
          }}
          onMigrateAgencyContacts={() => {
            void migrateAgencyContacts();
          }}
          onNewCreator={() => setCreatorDraft(createCreatorDraft())}
          onEditCreator={(record) => setCreatorDraft({ ...record })}
          onChangeCreatorDraft={setCreatorDraft}
          onSaveCreator={(record) => {
            void saveCreatorDraft(record);
          }}
          onDeleteCreator={(recordId) => {
            void deleteCreatorRecord(recordId);
          }}
          onCopy={copyText}
          onClose={closeDatabaseView}
        />
      ) : null}

      {isTemplateManagerOpen ? (
        <OutreachTemplateManagerModal
          templates={templates}
          selectedTemplateId={selectedTemplateId}
          onSelectTemplate={setSelectedTemplateId}
          onNewTemplate={openNewTemplateModal}
          onEditTemplate={openEditTemplateModal}
          onDuplicateTemplate={duplicateTemplate}
          onDeleteTemplate={deleteTemplate}
          onClose={() => setIsTemplateManagerOpen(false)}
        />
      ) : null}

      {isNewTemplateModalOpen && templateDraft ? (
        <NewTemplateModal
          template={templateDraft}
          onChange={setTemplateDraft}
          onSubmit={saveTemplateDraft}
          onRememberTextTarget={rememberTextTarget}
          onSmartFieldDrop={handleSmartFieldDrop}
          onClose={() => {
            setTemplateDraft(null);
            setIsNewTemplateModalOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function getTranslationErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Translation is unavailable.";

  if (/translation|translate|api key|configured|openrouter/i.test(message)) {
    return "AI translation is not configured yet. Add OPENROUTER_API_KEY and OPENROUTER_DEFAULT_MODEL on the server.";
  }

  return `Translation unavailable: ${message}`;
}

function NewTemplateModal({
  template,
  onChange,
  onSubmit,
  onRememberTextTarget,
  onSmartFieldDrop,
  onClose,
}: {
  template: OutreachTemplate;
  onChange: (template: OutreachTemplate) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onRememberTextTarget: (id: TextInsertTarget, textarea: HTMLTextAreaElement) => void;
  onSmartFieldDrop: (id: TextInsertTarget, event: DragEvent<HTMLTextAreaElement>) => void;
  onClose: () => void;
}) {
  const isNew = !template.templateName.trim();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 backdrop-blur-sm">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-2xl rounded-xl border border-border bg-card p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              {isNew ? "New Template" : "Edit Template"}
            </p>
            <h2 className="mt-1 text-xl font-semibold">Reusable message snippet</h2>
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
            onFocus={(event) => onRememberTextTarget("templateBody", event.currentTarget)}
            onClick={(event) => onRememberTextTarget("templateBody", event.currentTarget)}
            onKeyUp={(event) => onRememberTextTarget("templateBody", event.currentTarget)}
            onSelect={(event) => onRememberTextTarget("templateBody", event.currentTarget)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => onSmartFieldDrop("templateBody", event)}
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

function SmartFieldsModal({
  registry,
  selectedCampaignId,
  onSelectCampaign,
  onSave,
  onClose,
}: {
  registry: GlobalCampaignRegistry;
  selectedCampaignId: string;
  onSelectCampaign: (campaignId: string) => void;
  onSave: (campaign: GlobalCampaignRegistry["campaigns"][number]) => void;
  onClose: () => void;
}) {
  const firstCampaign = registry.campaigns[0];
  const selectedCampaign =
    registry.campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? firstCampaign;
  const [draftCampaignId, setDraftCampaignId] = useState(selectedCampaign?.id ?? "");
  const activeCampaign =
    registry.campaigns.find((campaign) => campaign.id === draftCampaignId) ?? firstCampaign;
  const [preferredLanguages, setPreferredLanguages] = useState<CampaignMemoryLanguage[]>(
    activeCampaign?.preferredLanguages ?? ["English"],
  );
  const [cardDrafts, setCardDrafts] = useState<Array<{ id: string; content: string }>>(
    normalizeSmartFieldDrafts(activeCampaign?.memoryCards ?? []),
  );

  useEffect(() => {
    if (!activeCampaign) return;
    setPreferredLanguages(activeCampaign.preferredLanguages);
    setCardDrafts(normalizeSmartFieldDrafts(activeCampaign.memoryCards));
  }, [activeCampaign]);

  function toggleLanguage(language: CampaignMemoryLanguage) {
    setPreferredLanguages((current) => {
      const next = current.includes(language)
        ? current.filter((item) => item !== language)
        : [...current, language];
      return next.length ? next : current;
    });
  }

  function saveDraft() {
    if (!activeCampaign) return;
    const now = new Date().toISOString();
    onSave({
      ...activeCampaign,
      preferredLanguages,
      memoryCards: cardDrafts
        .filter((card) => card.content.trim())
        .map((card, index) => ({
          id: card.id,
          title: `Smart Field ${index + 1}`,
          content: card.content.trim(),
        })),
      updatedAt: now,
    });
    onSelectCampaign(activeCampaign.id);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Smart Fields</p>
            <h2 className="mt-1 text-xl font-semibold">Campaign field cards</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-background transition hover:bg-accent"
          >
            <X className="size-4" />
          </button>
        </div>

        {registry.campaigns.length === 0 ? (
          <div className="p-5 text-sm text-muted-foreground">
            Create a campaign in Campaign Profiles first.
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <FieldLabel label="Campaign">
                <select
                  value={draftCampaignId}
                  onChange={(event) => {
                    setDraftCampaignId(event.target.value);
                    onSelectCampaign(event.target.value);
                  }}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus:ring-2"
                >
                  {registry.campaigns.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.campaignName}
                    </option>
                  ))}
                </select>
              </FieldLabel>

              <div className="mt-4">
                <p className="text-xs font-medium text-muted-foreground">Preferred Languages</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {campaignMemoryLanguages.map((language) => {
                    const selected = preferredLanguages.includes(language);
                    return (
                      <button
                        key={language}
                        type="button"
                        onClick={() => toggleLanguage(language)}
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

              <div className="mt-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold">Smart Field Cards</p>
                  <button
                    type="button"
                    onClick={() =>
                      setCardDrafts((current) => [
                        ...current,
                        { id: createOutreachId("memory-card"), content: "" },
                      ])
                    }
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-medium transition hover:bg-accent"
                  >
                    <Plus className="size-3.5" />
                    Add Card
                  </button>
                </div>

                <div className="mt-3 space-y-3">
                  {cardDrafts.map((card, index) => (
                    <div
                      key={card.id}
                      className="rounded-lg border border-border bg-background p-3"
                    >
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="text-xs font-medium text-muted-foreground">
                          Card {index + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setCardDrafts((current) =>
                              current.filter((item) => item.id !== card.id),
                            )
                          }
                          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-card px-2 text-xs font-medium transition hover:bg-accent"
                        >
                          <Trash2 className="size-3" />
                          Delete
                        </button>
                      </div>
                      <textarea
                        value={card.content}
                        rows={3}
                        onChange={(event) =>
                          setCardDrafts((current) =>
                            current.map((item) =>
                              item.id === card.id ? { ...item, content: event.target.value } : item,
                            ),
                          )
                        }
                        className="w-full resize-y rounded-md border border-input bg-card px-3 py-2 text-sm leading-6 outline-none ring-ring focus:ring-2"
                      />
                    </div>
                  ))}
                </div>
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
                type="button"
                onClick={saveDraft}
                className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90"
              >
                Save
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function OutreachTemplateManagerModal({
  templates,
  selectedTemplateId,
  onSelectTemplate,
  onNewTemplate,
  onEditTemplate,
  onDuplicateTemplate,
  onDeleteTemplate,
  onClose,
}: {
  templates: OutreachTemplate[];
  selectedTemplateId: string;
  onSelectTemplate: (templateId: string) => void;
  onNewTemplate: () => void;
  onEditTemplate: (template: OutreachTemplate) => void;
  onDuplicateTemplate: (template: OutreachTemplate) => void;
  onDeleteTemplate: (templateId: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              Manage Templates
            </p>
            <h2 className="mt-1 text-xl font-semibold">Reusable outreach snippets</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-background transition hover:bg-accent"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-3 flex justify-end">
            <button
              type="button"
              onClick={() => {
                onNewTemplate();
                onClose();
              }}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:opacity-90"
            >
              <Plus className="size-4" />
              New Template
            </button>
          </div>

          {templates.length ? (
            <div className="space-y-2">
              {templates.map((template) => {
                const selected = template.id === selectedTemplateId;
                return (
                  <article
                    key={template.id}
                    className={`rounded-lg border p-3 ${
                      selected ? "border-primary bg-primary/10" : "border-border bg-background"
                    }`}
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold">{template.templateName}</h3>
                          <span className="rounded-full border border-border bg-card px-2 py-0.5 text-xs text-muted-foreground">
                            {template.channelType}
                          </span>
                        </div>
                        <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
                          {template.body}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => onSelectTemplate(template.id)}
                          className="inline-flex h-8 items-center rounded-md border border-border bg-card px-2.5 text-xs font-medium transition hover:bg-accent"
                        >
                          Select
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onEditTemplate(template);
                            onClose();
                          }}
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium transition hover:bg-accent"
                        >
                          <Pencil className="size-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => onDuplicateTemplate(template)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium transition hover:bg-accent"
                        >
                          <CopyPlus className="size-3.5" />
                          Duplicate
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteTemplate(template.id)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium transition hover:bg-accent"
                        >
                          <Trash2 className="size-3.5" />
                          Delete
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-background p-6 text-center text-sm text-muted-foreground">
              No templates yet. Create one to start building replies faster.
            </div>
          )}
        </div>
      </div>
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
}: {
  isOpen: boolean;
  detectedLanguage: string;
  registry: GlobalCampaignRegistry;
  selectedCampaignId: string;
  onToggle: () => void;
  onSelectCampaign: (campaignId: string) => void;
  onInsert: (content: string) => void;
}) {
  const detectedLanguageLabel = getLanguageLabel(detectedLanguage);
  const detectedLanguageBadge = getLanguageBadge(detectedLanguage);
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
              <p className="mt-1 text-sm font-semibold">{detectedLanguageBadge}</p>
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

            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Smart Field Cards</p>
              <div className="space-y-2">
                {selectedCampaign?.memoryCards.length ? (
                  selectedCampaign.memoryCards.map((card) => (
                    <article
                      key={card.id}
                      draggable={Boolean(card.content.trim())}
                      onDragStart={(event) => {
                        event.dataTransfer.setData("text/plain", card.content);
                        event.dataTransfer.effectAllowed = "copy";
                      }}
                      onClick={() => onInsert(card.content)}
                      className="cursor-grab rounded-lg border border-border bg-background/80 p-3 transition hover:border-cyan-300/40 hover:bg-accent/40 active:cursor-grabbing"
                    >
                      <p className="whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
                        {card.content || "No content"}
                      </p>
                    </article>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-border bg-background/80 p-4 text-sm text-muted-foreground">
                    No smart field cards saved for this campaign yet. Open Smart Fields to add them.
                  </div>
                )}
              </div>
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
  const nextField = `field_${existingFields.length + 1}`;
  const spacer = template.body.endsWith("\n") || !template.body ? "" : " ";
  const body = `${template.body}${spacer}{{${nextField}}}`;
  return {
    ...template,
    body,
    fields: extractTemplateFields(body),
  };
}

function normalizeSmartFieldDrafts(cards: CampaignMemoryCard[]) {
  const drafts = cards.length
    ? cards.map((card) => ({
        id: card.id || createOutreachId("memory-card"),
        content: card.content || card.title || "",
      }))
    : [{ id: createOutreachId("memory-card"), content: "" }];
  return drafts;
}

function getDuplicateTemplateName(baseName: string, templates: OutreachTemplate[]) {
  const cleanBase = `${baseName || "Template"} Copy`;
  const names = new Set(templates.map((template) => template.templateName));
  if (!names.has(cleanBase)) return cleanBase;
  let counter = 2;
  while (names.has(`${cleanBase} ${counter}`)) counter += 1;
  return `${cleanBase} ${counter}`;
}

function resolveReplyTargetLanguage(detectedLanguage: string, projectLanguage: string) {
  return getLanguageLabel(detectedLanguage).toLowerCase() === "english"
    ? getLanguageLabel(projectLanguage)
    : getLanguageLabel(detectedLanguage);
}

function isTemplateCompatibleWithSource(template: OutreachTemplate, source: CreatorMessageSource) {
  return template.channelType === source;
}

function normalizeDatabaseStatus(value: unknown) {
  const status = String(value ?? "").toLowerCase();
  return databaseStatusOptions.includes(status) ? status : "potential";
}

function normalizeAgencyContactRows(record: AgencyDatabaseRecord) {
  const parsed = parseAgencyContactsJson(record.contactsJson);
  if (parsed.length) return parsed;

  const legacyContact = [
    record.contact?.trim(),
    record.email ? `Email: ${record.email.trim()}` : "",
    record.line ? `LINE: ${record.line.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  if (!record.contactName && !record.contactRole && !legacyContact) return [];

  return [
    {
      id: createOutreachId("agency-contact"),
      name: record.contactName.trim(),
      role: record.contactRole.trim(),
      contact: legacyContact,
    },
  ];
}

function parseAgencyContactsJson(value: string) {
  if (!value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      const contact = {
        id: String(row.id ?? "") || createOutreachId("agency-contact"),
        name: String(row.name ?? "").trim(),
        role: String(row.role ?? "").trim(),
        contact: String(row.contact ?? row.value ?? "").trim(),
      };
      return contact.name || contact.role || contact.contact ? [contact] : [];
    });
  } catch {
    return [];
  }
}

function extractEmailFromContact(value: string) {
  return value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? "";
}

function extractLineFromContact(value: string) {
  const lineMatch = value.match(/(?:line|line id)[:\s]+(@?[\w.-]+)/i);
  return lineMatch?.[1] ?? "";
}

function normalizeNumber(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function EmojiPicker({
  emojis,
  onSelect,
}: {
  emojis: readonly string[];
  onSelect: (emoji: string) => void;
}) {
  return (
    <div className="absolute right-0 top-11 z-40 w-56 rounded-xl border border-border bg-card p-3 shadow-2xl">
      <p className="mb-2 text-xs font-medium text-muted-foreground">Quick emojis</p>
      <div className="grid grid-cols-6 gap-1.5">
        {emojis.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(emoji)}
            className="grid size-8 place-items-center rounded-md border border-transparent text-lg transition hover:border-border hover:bg-accent"
            aria-label={`Insert ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>
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
    <section className="katlas-panel flex h-full min-h-[680px] flex-col lg:h-[calc(100vh-236px)]">
      <div className="mb-4 flex shrink-0 items-center gap-2">
        <div className="katlas-panel-icon">
          <Icon className="size-4" />
        </div>
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function ControlBlock({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <div className="flex min-h-[88px] flex-col justify-between">
      <div>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-2 text-base font-semibold leading-6 text-foreground">{value}</p>
      </div>
      {helper ? (
        <p className="mt-2 max-w-sm text-xs leading-5 text-muted-foreground">{helper}</p>
      ) : null}
    </div>
  );
}

function EditorField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-h-0 flex-col">
      <span className="mb-1 block shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
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

function createOutreachRegistryFromBundle(
  campaignProfiles: CampaignProfileRecord[],
  memoryCards: CampaignMemoryCardRecord[],
): GlobalCampaignRegistry {
  return {
    campaigns: campaignProfiles.map((campaign) => ({
      id: campaign.campaignId,
      campaignName: campaign.campaignName,
      campaignCode: campaign.campaignCode,
      preferredLanguages: parseCampaignMemoryLanguages(campaign.preferredLanguages),
      memoryCards: memoryCards
        .filter((card) => card.campaignId === campaign.campaignId)
        .map(
          (card): CampaignMemoryCard => ({
            id: card.cardId,
            title: card.title,
            content: card.content,
          }),
        ),
      createdAt: campaign.createdAt,
      updatedAt: campaign.updatedAt,
    })),
    creatorRecords: [],
  };
}

function parseCampaignMemoryLanguages(value: string): CampaignMemoryLanguage[] {
  const parsed = value
    .split(",")
    .map((language) => language.trim())
    .filter((language): language is CampaignMemoryLanguage =>
      campaignMemoryLanguages.includes(language as CampaignMemoryLanguage),
    );
  return parsed.length ? parsed : ["English"];
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

function LanguageSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <>
      <input
        value={value}
        list="outreach-language-suggestions"
        onChange={(event) => onChange(event.target.value)}
        placeholder="Type any language"
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus:ring-2"
      />
      <datalist id="outreach-language-suggestions">
        {suggestedOutreachLanguages.map((language) => (
          <option key={language} value={language} />
        ))}
      </datalist>
    </>
  );
}
