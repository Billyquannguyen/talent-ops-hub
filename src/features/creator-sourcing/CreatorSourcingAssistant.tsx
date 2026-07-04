import { useBlocker } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ClipboardList,
  Columns3,
  Copy,
  CopyPlus,
  Download,
  FileSpreadsheet,
  Filter,
  Hash,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { TopBar } from "@/components/TopBar";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { formatCountryLabel, matchesCountryQuery } from "@/lib/countries";
import {
  deleteSourcingTemplateFromGoogleSheetsOnly,
  loadCreatorSourcingDatabaseFromGoogleSheetsOnly,
  saveSourcingTemplateToGoogleSheetsOnly,
} from "@/storage/appRepository";
import {
  cleanupSourcingTemplateRecords,
  isActiveSourcingTemplateRecord,
} from "@/storage/sourcingTemplates";
import type {
  AppSettingRecord,
  CampaignProfileRecord,
  SourcingTemplateRecord,
} from "@/storage/schema";
import {
  buildContactEnrichmentReport,
  buildPreviewRow,
  hasContactInfo,
  runEnrichmentPipeline,
} from "./enrichment";
import { exportPreviewSpreadsheet, parseSpreadsheet } from "./excel";
import {
  emptyFilters,
  filterCreators,
  getCell,
  inferColumnMap,
  parseMetric,
  rowHasEmail,
} from "./filters";
import {
  easyKolFields,
  type EmailAvailability,
  type ContactEnrichmentReport,
  type ContactField,
  type ContactInfo,
  type CreatorEnrichmentResult,
  type EasyKolField,
  type FilterSettings,
  type PreviewRow,
  type SourcingProject,
  type SourcingTemplate,
  type TemplateBlockType,
  type TemplateColumn,
  type UploadedCreator,
} from "./types";

const followersRangeOptions = [
  { key: "followers-1k-10k", label: "1k-10k", min: "1000", max: "10000" },
  { key: "followers-10k-100k", label: "10k-100k", min: "10000", max: "100000" },
  { key: "followers-100k-1m", label: "100k-1m", min: "100000", max: "1000000" },
  { key: "followers-1m-plus", label: "> 1m", min: "1000000", max: "" },
] as const;
const averageViewRangeOptions = [
  { key: "views-under-1k", label: "<1k", min: "", max: "1000" },
  { key: "views-1k-10k", label: "1k-10k", min: "1000", max: "10000" },
  { key: "views-10k-100k", label: "10k-100k", min: "10000", max: "100000" },
  { key: "views-100k-plus", label: "> 100k", min: "100000", max: "" },
] as const;
const emptyBillyFilters = {
  followersMin: "",
  followersMax: "",
  followerRanges: [],
} satisfies BillyFilterSettings;
const filterSectionDefaults = {
  regions: false,
  languages: false,
  platforms: false,
  followers: false,
  averageViews: false,
  emailAvailability: false,
};
const billyFilterSectionDefaults = {
  followers: false,
};
const billyExtensionMessageSource = "katlas-billy-extension";
const billyImportHeaders = [
  "Nickname",
  "@Username",
  "Description",
  "Platform",
  "Followers",
  "Avg. Views",
  "Avg. Likes",
  "Email",
  "Last Post",
  "URL",
  "Sample Video URL",
  "Source Link",
];

type FilterSectionKey = keyof typeof filterSectionDefaults;
type BillyFilterSectionKey = keyof typeof billyFilterSectionDefaults;
type BillyFilterSettings = {
  followersMin: string;
  followersMax: string;
  followerRanges: string[];
};
type BillyFilterChip = {
  key: string;
  label: string;
  action:
    | {
        type: "array";
        field: "followerRanges";
        value: string;
      }
    | {
        type: "fields";
        fields: Array<keyof BillyFilterSettings>;
      };
};
type FilterChip = {
  key: string;
  label: string;
  action:
    | {
        type: "array";
        field:
          | "regions"
          | "languages"
          | "platforms"
          | "followerRanges"
          | "averageViewRanges"
          | "emailAvailabilitySelections";
        value: string;
      }
    | {
        type: "fields";
        fields: Array<keyof FilterSettings>;
      };
};
type CountOption = {
  value: string;
  count: number;
};
type RangeOption = {
  key: string;
  label: string;
  min: string;
  max: string;
  count: number;
};
type SourcingAssistantPage = "easykol" | "billy";
type PendingLeaveAction =
  | { type: "selectProject"; projectId: string }
  | { type: "selectTemplate"; templateId: string }
  | { type: "selectAssistantPage"; page: SourcingAssistantPage };
type HashtagScrapeReport = {
  sourceLabel: string;
  sourceUrl: string;
  creatorsFound: number;
  videosFound: number;
  duplicatesRemoved: number;
  warnings: string[];
};
type HashtagScrapeResponse =
  | {
      ok: true;
      platform: "tiktok";
      hashtag?: string;
      sourceType?: "hashtag" | "sound";
      sourceLabel?: string;
      headers: string[];
      rows: Array<Record<string, string | number | boolean | null | undefined>>;
      videosFound: number;
      creatorsFound: number;
      duplicatesRemoved: number;
      warnings: string[];
      sourceUrl: string;
    }
  | {
      ok: false;
      error: string;
    };
type BillyExtensionCreator = {
  username: string;
  profileUrl?: string;
  sampleVideoUrl?: string;
  videoDescription?: string;
  sourceLink?: string;
  videos?: string[];
};
type BillyExtensionPayload = {
  collectedAt?: string;
  sourceLabel: string;
  sourceUrl: string;
  videosFound: number;
  creators: BillyExtensionCreator[];
};
type PendingBillyExtensionImport = {
  id: string;
  payload: unknown;
};

export function CreatorSourcingAssistant() {
  const [assistantPage, setAssistantPage] = useState<SourcingAssistantPage>(
    getInitialSourcingAssistantPage,
  );
  const [pendingBillyExtensionImport, setPendingBillyExtensionImport] =
    useState<PendingBillyExtensionImport | null>(null);
  const [billyHasActiveWorkingData, setBillyHasActiveWorkingData] = useState(false);
  const [projects, setProjects] = useState<SourcingProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState("");
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);
  const [isSavingTemplates, setIsSavingTemplates] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [creators, setCreators] = useState<UploadedCreator[]>([]);
  const [sourceFileName, setSourceFileName] = useState("");
  const [sheetName, setSheetName] = useState("");
  const [filters, setFilters] = useState<FilterSettings>(() => ({ ...emptyFilters }));
  const [draftTemplate, setDraftTemplate] = useState<TemplateColumn[]>([]);
  const [draftTemplateName, setDraftTemplateName] = useState("");
  const [templateMessage, setTemplateMessage] = useState("");
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isTemplateManagerOpen, setIsTemplateManagerOpen] = useState(false);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [openFilterSections, setOpenFilterSections] = useState(filterSectionDefaults);
  const [customRanges, setCustomRanges] = useState({
    followersMin: "",
    followersMax: "",
    averageViewsMin: "",
    averageViewsMax: "",
  });
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [previewReady, setPreviewReady] = useState(false);
  const [contactInfoByCreatorId, setContactInfoByCreatorId] = useState<Record<string, ContactInfo>>(
    {},
  );
  const [enrichmentReport, setEnrichmentReport] = useState<ContactEnrichmentReport | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isEnrichingContacts, setIsEnrichingContacts] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [pendingLeaveAction, setPendingLeaveAction] = useState<PendingLeaveAction | null>(null);
  const projectsRef = useRef<SourcingProject[]>([]);
  const activeCampaignIdRef = useRef("");
  const templateLoadRequestRef = useRef(0);
  const templateMutationRequestRef = useRef(0);

  const activeProject = projects.find((project) => project.campaignId === activeProjectId);
  const activeTemplateId = activeProject?.activeTemplateId ?? "";
  const template = useMemo(() => draftTemplate, [draftTemplate]);
  const templateHasUnsavedChanges = activeProject
    ? !templatesEqual(draftTemplate, activeProject.template) ||
      draftTemplateName.trim() !== activeProject.templateName
    : false;
  const hasActiveWorkingData = Boolean(
    sourceFileName || headers.length > 0 || creators.length > 0 || previewReady,
  );
  const shouldConfirmBeforeLeaving =
    hasActiveWorkingData || billyHasActiveWorkingData || templateHasUnsavedChanges;
  const routeBlocker = useBlocker({
    shouldBlockFn: ({ current, next }) =>
      current.pathname === "/creator-sourcing" &&
      next.pathname !== "/creator-sourcing" &&
      shouldConfirmBeforeLeaving,
    enableBeforeUnload: shouldConfirmBeforeLeaving,
    withResolver: true,
  });

  useEffect(() => {
    function handleHashChange() {
      const nextPage = getSourcingAssistantPageFromHash();
      if (nextPage) setAssistantPage(nextPage);
    }

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    function handleBillyExtensionMessage(event: MessageEvent) {
      if (event.source !== window || !isRecord(event.data)) return;
      if (event.data.source !== billyExtensionMessageSource) return;
      if (event.data.type !== "BILLY_IMPORT") return;

      setAssistantPage("billy");
      updateSourcingAssistantHash("billy");
      setPendingBillyExtensionImport({
        id: createId("billy-extension-import"),
        payload: event.data.payload,
      });
    }

    window.addEventListener("message", handleBillyExtensionMessage);
    return () => window.removeEventListener("message", handleBillyExtensionMessage);
  }, []);

  const columnMap = useMemo(() => inferColumnMap(headers), [headers]);
  const filteredCreators = useMemo(
    () => filterCreators(creators, filters, columnMap),
    [creators, filters, columnMap],
  );
  const previewRows = useMemo(
    () =>
      filteredCreators.map((creator) =>
        buildPreviewRow({
          id: creator.id,
          data: creator.data,
          columnMap,
          template,
          contactInfo: contactInfoByCreatorId[creator.id],
        }),
      ),
    [filteredCreators, columnMap, template, contactInfoByCreatorId],
  );
  const previewHeaders = useMemo(
    () => template.map((column, index) => column.label.trim() || `Column ${index + 1}`),
    [template],
  );
  const selectedPreviewRows = useMemo(
    () => previewRows.filter((row) => selectedRowIds.includes(row.id)),
    [previewRows, selectedRowIds],
  );
  const regionCounts = useMemo(
    () => getValueCounts(creators, columnMap, "Region"),
    [creators, columnMap],
  );
  const languageCounts = useMemo(
    () => getValueCounts(creators, columnMap, "Language"),
    [creators, columnMap],
  );
  const platformCounts = useMemo(
    () => getValueCounts(creators, columnMap, "Platform"),
    [creators, columnMap],
  );
  const followersRanges = useMemo(
    () => getMetricRangeCounts(creators, columnMap, "Followers", followersRangeOptions),
    [creators, columnMap],
  );
  const averageViewRanges = useMemo(
    () => getMetricRangeCounts(creators, columnMap, "Avg. Views", averageViewRangeOptions),
    [creators, columnMap],
  );
  const emailAvailabilityCounts = useMemo(() => {
    const withEmail = creators.filter((creator) => rowHasEmail(creator.data, columnMap)).length;
    return {
      has: withEmail,
      none: creators.length - withEmail,
    };
  }, [creators, columnMap]);
  const creatorsWithContact = previewRows.filter((row) => hasContactInfo(row.contactInfo)).length;
  const creatorsWithoutContact = previewRows.length - creatorsWithContact;
  const activeFilterChips = getActiveFilterChips(filters);

  useEffect(() => {
    const requestId = ++templateLoadRequestRef.current;

    async function loadTemplates() {
      setIsLoadingTemplates(true);
      setProjectsLoaded(false);
      setErrorMessage("");
      try {
        const database = await loadCreatorSourcingDatabaseFromGoogleSheetsOnly({
          reason: "creator-sourcing:load-templates",
        });
        if (requestId !== templateLoadRequestRef.current) return;
        const loadedProjects = loadProjects(database);
        const nextCampaignId =
          activeCampaignIdRef.current &&
          loadedProjects.some((project) => project.campaignId === activeCampaignIdRef.current)
            ? activeCampaignIdRef.current
            : (loadedProjects[0]?.campaignId ?? "");
        const selectedProject =
          loadedProjects.find((project) => project.campaignId === nextCampaignId) ??
          loadedProjects[0];
        setProjects(loadedProjects);
        setActiveProjectId(nextCampaignId);
        setFilters({ ...emptyFilters });
        setDraftTemplate(cloneTemplate(selectedProject?.template ?? []));
        setDraftTemplateName(selectedProject?.templateName ?? "");
        setProjectsLoaded(true);
      } catch (error) {
        if (requestId !== templateLoadRequestRef.current) return;
        const message =
          error instanceof Error
            ? error.message
            : "Google Sheets database is unavailable. Sourcing templates were not loaded.";
        console.error(message);
        setErrorMessage(message);
        setProjects([]);
        setActiveProjectId("");
        setDraftTemplate([]);
        setDraftTemplateName("");
        setProjectsLoaded(true);
      } finally {
        if (requestId === templateLoadRequestRef.current) setIsLoadingTemplates(false);
      }
    }

    void loadTemplates();
  }, []);

  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  useEffect(() => {
    activeCampaignIdRef.current = activeProjectId;
  }, [activeProjectId]);

  useEffect(() => {
    if (!activeProjectId) {
      setDraftTemplate([]);
      setTemplateMessage("");
      return;
    }
    const project = projectsRef.current.find((item) => item.campaignId === activeProjectId);
    if (!project) return;
    setDraftTemplate(cloneTemplate(project.template));
    setDraftTemplateName(project.templateName);
    setTemplateMessage("");
  }, [activeProjectId, activeTemplateId, projectsLoaded]);

  useEffect(() => {
    setPreviewReady(false);
  }, [creators, filters, template]);

  useEffect(() => {
    setEnrichmentReport(null);
  }, [creators, filters]);

  useEffect(() => {
    setCustomRanges({
      followersMin: filters.followersMin,
      followersMax: filters.followersMax,
      averageViewsMin: filters.averageViewsMin,
      averageViewsMax: filters.averageViewsMax,
    });
  }, [
    filters.followersMin,
    filters.followersMax,
    filters.averageViewsMin,
    filters.averageViewsMax,
  ]);

  useEffect(() => {
    const filteredIds = new Set(filteredCreators.map((creator) => creator.id));
    setSelectedRowIds((current) => current.filter((id) => filteredIds.has(id)));
  }, [filteredCreators]);

  function requestProjectChange(projectId: string) {
    if (projectId === activeProjectId) return;
    if (shouldConfirmBeforeLeaving) {
      setPendingLeaveAction({ type: "selectProject", projectId });
      return;
    }
    switchProject(projectId);
  }

  function switchProject(projectId: string) {
    const nextProject = projectsRef.current.find((project) => project.campaignId === projectId);
    activeCampaignIdRef.current = projectId;
    resetForCampaignChange(nextProject);
    setActiveProjectId(projectId);
    setStatusMessage("Campaign changed.");
  }

  function requestTemplateChange(templateId: string) {
    if (templateId === activeTemplateId) return;
    if (shouldConfirmBeforeLeaving) {
      setPendingLeaveAction({ type: "selectTemplate", templateId });
      return;
    }
    switchTemplate(templateId);
  }

  function switchTemplate(templateId: string) {
    resetWorkingData({
      resetDraft: false,
      resetFilters: false,
      clearMessages: true,
      closeTemplateUi: false,
    });
    setProjects((current) =>
      current.map((project) =>
        project.campaignId === activeProjectId
          ? activateProjectTemplate(project, templateId)
          : project,
      ),
    );
    setStatusMessage("Template changed.");
  }

  async function persistSourcingTemplate(template: SourcingTemplate, successMessage: string) {
    const requestId = ++templateMutationRequestRef.current;
    const targetCampaignId = template.campaignId;
    setIsSavingTemplates(true);
    setErrorMessage("");
    try {
      const record = toSourcingTemplateRecord(template, activeProject?.name ?? "");
      const savedDatabase = await saveSourcingTemplateToGoogleSheetsOnly(record);
      if (requestId !== templateMutationRequestRef.current) return true;
      const loadedProjects = loadProjects(savedDatabase);
      const nextProjects = loadedProjects.map((project) =>
        project.campaignId === targetCampaignId
          ? activateProjectTemplate(project, template.id)
          : project,
      );
      setProjects(nextProjects);
      if (activeCampaignIdRef.current === targetCampaignId) {
        const nextProject =
          nextProjects.find((project) => project.campaignId === targetCampaignId) ??
          nextProjects[0];
        setActiveProjectId(nextProject?.campaignId ?? "");
        setDraftTemplate(cloneTemplate(nextProject?.template ?? []));
        setDraftTemplateName(nextProject?.templateName ?? "");
        setTemplateMessage(successMessage);
      }
      return true;
    } catch (error) {
      if (requestId !== templateMutationRequestRef.current) return false;
      const message =
        error instanceof Error
          ? error.message
          : "Google Sheets save failed. Template was not saved.";
      console.error(message);
      setErrorMessage(message);
      setTemplateMessage("Template was not saved to Google Sheets.");
      return false;
    } finally {
      if (requestId === templateMutationRequestRef.current) setIsSavingTemplates(false);
    }
  }

  async function deleteSourcingTemplateFromSheets(templateId: string) {
    const requestId = ++templateMutationRequestRef.current;
    const targetCampaignId = activeCampaignIdRef.current;
    setIsSavingTemplates(true);
    setErrorMessage("");
    try {
      const savedDatabase = await deleteSourcingTemplateFromGoogleSheetsOnly(templateId);
      if (requestId !== templateMutationRequestRef.current) return true;
      const loadedProjects = loadProjects(savedDatabase);
      const nextProject =
        loadedProjects.find((project) => project.campaignId === targetCampaignId) ??
        loadedProjects[0];
      setProjects(loadedProjects);
      if (activeCampaignIdRef.current === targetCampaignId) {
        setActiveProjectId(nextProject?.campaignId ?? "");
        setDraftTemplate(cloneTemplate(nextProject?.template ?? []));
        setDraftTemplateName(nextProject?.templateName ?? "");
        setTemplateMessage("Template deleted from Google Sheets.");
      }
      return true;
    } catch (error) {
      if (requestId !== templateMutationRequestRef.current) return false;
      const message =
        error instanceof Error
          ? error.message
          : "Google Sheets delete failed. Template was not deleted.";
      console.error(message);
      setErrorMessage(message);
      setTemplateMessage("Template was not deleted from Google Sheets.");
      return false;
    } finally {
      if (requestId === templateMutationRequestRef.current) setIsSavingTemplates(false);
    }
  }

  function createNewTemplate() {
    if (!activeProject) return;
    const now = new Date().toISOString();
    const nextTemplate: SourcingTemplate = {
      id: createId("sourcing-template"),
      campaignId: activeProject.campaignId,
      templateName: getNextTemplateName(activeProject.templates),
      columns: defaultTemplate(),
      createdAt: now,
      updatedAt: now,
    };

    resetWorkingData({
      resetDraft: false,
      resetFilters: false,
      clearMessages: true,
      closeTemplateUi: false,
    });
    setProjects((current) =>
      current.map((project) => {
        if (project.campaignId !== activeProject.campaignId) return project;
        return activateProjectTemplate(
          {
            ...project,
            templates: [...project.templates, nextTemplate],
          },
          nextTemplate.id,
        );
      }),
    );
    setDraftTemplate(cloneTemplate(nextTemplate.columns));
    setDraftTemplateName(nextTemplate.templateName);
    setTemplateMessage("New template created. Edit and save it when ready.");
    setIsTemplateModalOpen(true);
  }

  async function duplicateSourcingTemplate(templateId: string) {
    if (!activeProject) return;
    const sourceTemplate = activeProject.templates.find(
      (templateItem) => templateItem.id === templateId,
    );
    if (!sourceTemplate) return;
    const now = new Date().toISOString();
    const nextTemplate: SourcingTemplate = {
      ...sourceTemplate,
      id: createId("sourcing-template"),
      templateName: getDuplicateTemplateName(sourceTemplate.templateName, activeProject.templates),
      columns: cloneTemplate(sourceTemplate.columns),
      createdAt: now,
      updatedAt: now,
    };

    await persistSourcingTemplate(nextTemplate, "Template duplicated and saved to Google Sheets.");
  }

  async function deleteSourcingTemplate(templateId: string) {
    if (!activeProject || activeProject.templates.length <= 1) return;
    const templateToDelete = activeProject.templates.find(
      (templateItem) => templateItem.id === templateId,
    );
    if (!templateToDelete) return;
    const confirmed =
      typeof window === "undefined" ||
      window.confirm(`Delete "${templateToDelete.templateName}"? This cannot be undone.`);
    if (!confirmed) return;

    await deleteSourcingTemplateFromSheets(templateId);
  }

  function resetWorkingData(
    options: {
      resetDraft?: boolean;
      resetFilters?: boolean;
      clearMessages?: boolean;
      closeTemplateUi?: boolean;
    } = {},
  ) {
    const {
      resetDraft = false,
      resetFilters = false,
      clearMessages = false,
      closeTemplateUi = false,
    } = options;
    setHeaders([]);
    setCreators([]);
    setSourceFileName("");
    setSheetName("");
    setSelectedRowIds([]);
    setPreviewReady(false);
    setIsPreviewModalOpen(false);
    setContactInfoByCreatorId({});
    setEnrichmentReport(null);
    setOpenFilterSections(filterSectionDefaults);
    setCustomRanges({
      followersMin: "",
      followersMax: "",
      averageViewsMin: "",
      averageViewsMax: "",
    });
    setIsUploading(false);
    setIsProcessing(false);
    setIsEnrichingContacts(false);
    if (resetFilters) setFilters({ ...emptyFilters });
    if (resetDraft) {
      setDraftTemplate([]);
      setDraftTemplateName("");
    }
    if (clearMessages) {
      setStatusMessage("");
      setCopyMessage("");
      setErrorMessage("");
      setTemplateMessage("");
    }
    if (closeTemplateUi) {
      setIsTemplateModalOpen(false);
      setIsTemplateManagerOpen(false);
    }
  }

  function resetForCampaignChange(nextProject?: SourcingProject) {
    resetWorkingData({
      resetDraft: true,
      resetFilters: true,
      clearMessages: true,
      closeTemplateUi: true,
    });
    if (!nextProject) return;
    setDraftTemplate(cloneTemplate(nextProject.template));
    setDraftTemplateName(nextProject.templateName);
  }

  function confirmPendingLeave() {
    if (!pendingLeaveAction) return;
    const action = pendingLeaveAction;
    setPendingLeaveAction(null);
    if (action.type === "selectAssistantPage") {
      switchAssistantPage(action.page);
      return;
    }
    if (action.type === "selectTemplate") {
      switchTemplate(action.templateId);
      return;
    }
    switchProject(action.projectId);
  }

  function confirmRouteLeave() {
    resetWorkingData({
      resetDraft: true,
      resetFilters: true,
      clearMessages: true,
      closeTemplateUi: true,
    });
    setBillyHasActiveWorkingData(false);
    routeBlocker.proceed?.();
  }

  async function handleUpload(file: File | undefined) {
    if (!file || !activeProject) return;
    setIsUploading(true);
    setErrorMessage("");
    setCopyMessage("");
    setStatusMessage("Reading the second worksheet from the EasyKOL export...");

    try {
      const parsed = await parseSpreadsheet(file);
      const uploadedCreators = parsed.rows.map((row, index) => ({
        id: `${Date.now()}-${index}`,
        data: row,
      }));

      setHeaders(parsed.headers);
      setCreators(uploadedCreators);
      setSourceFileName(file.name);
      setSheetName(parsed.sheetName);
      setSelectedRowIds([]);
      setPreviewReady(false);
      setContactInfoByCreatorId({});
      setEnrichmentReport(null);
      setStatusMessage(
        `Loaded ${uploadedCreators.length.toLocaleString()} creators from ${parsed.sheetName}.`,
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Upload failed.");
      setStatusMessage("");
    } finally {
      setIsUploading(false);
    }
  }

  async function enrichContacts() {
    if (!activeProject) {
      setErrorMessage("Select a campaign first.");
      return;
    }
    if (creators.length === 0) {
      setErrorMessage("Upload an EasyKOL export first.");
      return;
    }

    setIsEnrichingContacts(true);
    setErrorMessage("");
    setCopyMessage("");
    setEnrichmentReport(null);

    try {
      for (const message of [
        "Scanning EasyKOL Email column...",
        "Scanning Description...",
        "Scanning URL fields...",
      ]) {
        setStatusMessage(message);
        await wait(220);
      }

      const result = await runEnrichmentPipeline({
        creators: filteredCreators,
        columnMap,
      });

      let enrichmentResults = result.results;
      let aiStatusMessage = "";
      try {
        setStatusMessage("Fetching public links...");
        await wait(220);
        setStatusMessage("Extracting contacts with AI...");
        const aiResult = await enrichContactsWithAI(filteredCreators);
        enrichmentResults = mergeAIEnrichmentResults(result.results, aiResult.results);
        aiStatusMessage =
          aiResult.skipped > 0
            ? ` AI checked ${aiResult.processed} creators. ${aiResult.skipped} skipped by batch limit.`
            : ` AI checked ${aiResult.processed} creators.`;
      } catch (error) {
        aiStatusMessage =
          error instanceof Error
            ? ` OpenRouter enrichment unavailable: ${error.message}`
            : " OpenRouter enrichment unavailable.";
      }

      setStatusMessage("Generating Contacts...");
      await wait(220);
      setContactInfoByCreatorId(
        Object.fromEntries(
          enrichmentResults.map((row) => [row.creatorId, row.contactInfo] as const),
        ),
      );
      setEnrichmentReport(buildContactEnrichmentReport(enrichmentResults));
      setStatusMessage(`Done.${aiStatusMessage}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Contact enrichment failed.");
      setStatusMessage("");
    } finally {
      setIsEnrichingContacts(false);
    }
  }

  async function preparePreview() {
    if (!activeProject) {
      setErrorMessage("Select a campaign first.");
      return;
    }
    if (creators.length === 0) {
      setErrorMessage("Upload an EasyKOL export first.");
      return;
    }
    if (template.length === 0) {
      setErrorMessage("Add at least one output column to the selected sourcing template.");
      return;
    }
    const missingTemplateFields = getMissingTemplateSourceFields(template, columnMap);
    if (missingTemplateFields.length > 0) {
      setErrorMessage(
        `The selected template uses source fields that were not found in this EasyKOL file: ${missingTemplateFields.join(
          ", ",
        )}. Check the uploaded headers or edit the template mapping.`,
      );
      return;
    }

    setIsProcessing(true);
    setErrorMessage("");
    setCopyMessage("");

    for (const message of [
      "Applying Filters...",
      "Extracting Contacts...",
      "Applying Template...",
      "Preparing Preview...",
    ]) {
      setStatusMessage(message);
      await wait(260);
    }

    setPreviewReady(true);
    setIsProcessing(false);
    setStatusMessage(`Preview ready with ${previewRows.length.toLocaleString()} creators.`);
  }

  async function copyRows(rows: PreviewRow[], label: string) {
    if (rows.length === 0) return;
    const text = rows.map((row) => row.values.map(formatTsvCell).join("\t")).join("\n");

    try {
      await navigator.clipboard.writeText(text);
      setCopyMessage(`${label} copied without headers.`);
      setErrorMessage("");
    } catch {
      setErrorMessage("Copy failed. Your browser blocked clipboard access.");
      setCopyMessage("");
    }
  }

  async function downloadPreview() {
    if (previewRows.length === 0) return;
    const baseName =
      activeProject?.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "katlas-creators";

    try {
      await exportPreviewSpreadsheet({
        fileName: `${baseName}-preview.xlsx`,
        headers: previewHeaders,
        rows: previewRows.map((row) => row.values),
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Excel export failed.");
    }
  }

  function updateFilter<Key extends keyof FilterSettings>(key: Key, value: FilterSettings[Key]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function updateFilterGroup(patch: Partial<FilterSettings>) {
    setFilters((current) => ({ ...current, ...patch }));
  }

  function toggleFilterSection(section: FilterSectionKey) {
    setOpenFilterSections((current) => ({
      regions: false,
      languages: false,
      platforms: false,
      followers: false,
      averageViews: false,
      emailAvailability: false,
      [section]: !current[section],
    }));
  }

  function toggleArrayFilter(
    key: "regions" | "languages" | "platforms",
    legacyKey: "region" | "language" | "platform",
    value: string,
  ) {
    const selected = filters[key];
    updateFilterGroup({
      [legacyKey]: "",
      [key]: selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value],
    });
  }

  function togglePresetRange(kind: "followers" | "averageViews", range: { key: string }) {
    if (kind === "followers") {
      const selected = filters.followerRanges;
      updateFilterGroup({
        followerRanges: selected.includes(range.key)
          ? selected.filter((key) => key !== range.key)
          : [...selected, range.key],
      });
      return;
    }

    const selected = filters.averageViewRanges;
    updateFilterGroup({
      averageViewRanges: selected.includes(range.key)
        ? selected.filter((key) => key !== range.key)
        : [...selected, range.key],
    });
  }

  function applyCustomRange(kind: "followers" | "averageViews") {
    if (kind === "followers") {
      updateFilterGroup({
        followersMin: customRanges.followersMin,
        followersMax: customRanges.followersMax,
      });
      return;
    }

    updateFilterGroup({
      averageViewsMin: customRanges.averageViewsMin,
      averageViewsMax: customRanges.averageViewsMax,
    });
  }

  function toggleEmailAvailability(value: EmailAvailability) {
    const selected = filters.emailAvailabilitySelections;
    const next = selected.includes(value)
      ? selected.filter((item) => item !== value)
      : [...selected, value];
    updateFilterGroup({
      emailAvailability: "",
      emailAvailabilitySelections: next,
      hasEmail: false,
    });
  }

  function clearFilterChip(chip: FilterChip) {
    setFilters((current) => {
      const next = { ...current };
      if (chip.action.type === "array") {
        const { field, value } = chip.action;
        if (field === "regions") next.regions = next.regions.filter((item) => item !== value);
        if (field === "languages") next.languages = next.languages.filter((item) => item !== value);
        if (field === "platforms") next.platforms = next.platforms.filter((item) => item !== value);
        if (field === "followerRanges")
          next.followerRanges = next.followerRanges.filter((item) => item !== value);
        if (field === "averageViewRanges")
          next.averageViewRanges = next.averageViewRanges.filter((item) => item !== value);
        if (field === "emailAvailabilitySelections") {
          next.emailAvailabilitySelections = next.emailAvailabilitySelections.filter(
            (item) => item !== value,
          );
          next.emailAvailability = "";
          next.hasEmail = false;
        }
      } else {
        chip.action.fields.forEach((key) => {
          clearFilterValue(next, key);
        });
      }
      return next;
    });
  }

  async function saveTemplate() {
    if (!activeProject) return;
    const activeTemplate = activeProject.templates.find(
      (templateItem) => templateItem.id === activeProject.activeTemplateId,
    );
    const savedAt = new Date().toISOString();
    const savedTemplate = cloneTemplate(draftTemplate);
    const savedTemplateName = draftTemplateName.trim() || activeProject.templateName;
    const templateToSave: SourcingTemplate = {
      ...(activeTemplate ?? createDefaultSourcingTemplate(activeProject.campaignId)),
      id: activeProject.activeTemplateId || activeTemplate?.id || createId("sourcing-template"),
      campaignId: activeProject.campaignId,
      templateName: savedTemplateName,
      columns: savedTemplate,
      createdAt: activeTemplate?.createdAt || savedAt,
      updatedAt: savedAt,
    };
    const saved = await persistSourcingTemplate(
      templateToSave,
      "Template saved to Google Sheets for this campaign.",
    );
    if (saved) setIsTemplateModalOpen(false);
  }

  async function saveTemplateAsNew() {
    if (!activeProject) return;
    const savedAt = new Date().toISOString();
    const baseName = draftTemplateName.trim() || activeProject.templateName || "Template";
    const nextTemplate: SourcingTemplate = {
      id: createId("sourcing-template"),
      campaignId: activeProject.campaignId,
      templateName: getDuplicateTemplateName(baseName, activeProject.templates),
      columns: cloneTemplate(draftTemplate),
      createdAt: savedAt,
      updatedAt: savedAt,
    };

    const saved = await persistSourcingTemplate(
      nextTemplate,
      "Template saved as a new Google Sheets template.",
    );
    if (saved) setIsTemplateModalOpen(false);
  }

  async function resetTemplate() {
    if (!activeProject) return;
    const activeTemplate = activeProject.templates.find(
      (templateItem) => templateItem.id === activeProject.activeTemplateId,
    );
    const templateForProject = defaultTemplate();
    const savedAt = new Date().toISOString();
    const templateToSave: SourcingTemplate = {
      ...(activeTemplate ?? createDefaultSourcingTemplate(activeProject.campaignId)),
      id: activeProject.activeTemplateId || activeTemplate?.id || createId("sourcing-template"),
      campaignId: activeProject.campaignId,
      templateName:
        activeTemplate?.templateName || activeProject.templateName || "Default Template",
      columns: templateForProject,
      createdAt: activeTemplate?.createdAt || savedAt,
      updatedAt: savedAt,
    };
    const saved = await persistSourcingTemplate(
      templateToSave,
      "Template reset and saved to Google Sheets.",
    );
    if (saved) setIsTemplateModalOpen(false);
  }

  function addTemplateColumn() {
    setDraftTemplate((current) => [
      ...current,
      {
        id: createId("column"),
        label: `Column ${current.length + 1}`,
        blockType: "blank",
      },
    ]);
    setTemplateMessage("Unsaved changes");
  }

  function updateTemplateColumn(columnId: string, patch: Partial<TemplateColumn>) {
    setDraftTemplate((current) =>
      current.map((column) => (column.id === columnId ? { ...column, ...patch } : column)),
    );
    setTemplateMessage("Unsaved changes");
  }

  function removeTemplateColumn(columnId: string) {
    setDraftTemplate((current) => current.filter((column) => column.id !== columnId));
    setTemplateMessage("Unsaved changes");
  }

  function moveTemplateColumn(columnId: string, direction: "up" | "down") {
    setDraftTemplate((current) => {
      const index = current.findIndex((column) => column.id === columnId);
      const nextIndex = direction === "up" ? index - 1 : index + 1;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      const [item] = next.splice(index, 1);
      if (!item) return current;
      next.splice(nextIndex, 0, item);
      return next;
    });
    setTemplateMessage("Unsaved changes");
  }

  function updateTemplateBlock(column: TemplateColumn, value: string) {
    if (value.startsWith("field:")) {
      const fieldKey = value.replace("field:", "") as EasyKolField;
      updateTemplateColumn(column.id, {
        blockType: "field",
        fieldKey,
        label: column.label.trim() ? column.label : fieldKey,
        customValue: "",
      });
      return;
    }

    const blockType = value as TemplateBlockType;
    const defaultLabels: Record<TemplateBlockType, string> = {
      field: "Column",
      contacts: "Contacts",
      blank: "Blank",
      custom: "Custom",
    };

    updateTemplateColumn(column.id, {
      blockType,
      fieldKey: undefined,
      label: column.label.trim() ? column.label : defaultLabels[blockType],
      customValue: blockType === "custom" ? (column.customValue ?? "") : "",
    });
  }

  function toggleRow(rowId: string) {
    setSelectedRowIds((current) =>
      current.includes(rowId) ? current.filter((id) => id !== rowId) : [...current, rowId],
    );
  }

  function toggleAllPreviewRows() {
    if (selectedPreviewRows.length === previewRows.length) {
      setSelectedRowIds([]);
      return;
    }
    setSelectedRowIds(previewRows.map((row) => row.id));
  }

  function changeAssistantPage(nextPage: SourcingAssistantPage) {
    if (nextPage === assistantPage) return;
    if (assistantPage === "billy" && billyHasActiveWorkingData) {
      setPendingLeaveAction({ type: "selectAssistantPage", page: nextPage });
      return;
    }
    switchAssistantPage(nextPage);
  }

  function switchAssistantPage(nextPage: SourcingAssistantPage) {
    setAssistantPage(nextPage);
    updateSourcingAssistantHash(nextPage);
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <TopBar />
      <div className="absolute inset-x-0 top-0 h-[360px] bg-hero-glow pointer-events-none" />

      <main className="katlas-page">
        <section className="katlas-hero-panel">
          <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Creator Sourcing Assistant
              </p>
              <h1 className="mt-3 max-w-3xl text-3xl font-medium leading-tight tracking-tight md:text-4xl">
                {assistantPage === "easykol"
                  ? "EasyKOL Scraping Processor"
                  : "Billy's Scraper System"}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                {assistantPage === "easykol"
                  ? "Upload the EasyKOL export, filter the creators, generate contacts, then preview the exact columns you want to paste into a sourcing sheet."
                  : "Scrape a TikTok hashtag on its own page, dedupe creators, filter the list, then export rows without touching the EasyKOL upload flow."}
              </p>
            </div>
          </div>
        </section>

        <SourcingAssistantPagination page={assistantPage} onPageChange={changeAssistantPage} />

        {assistantPage === "easykol" ? (
          <>
            {statusMessage || copyMessage || errorMessage ? (
              <section className="space-y-2">
                {statusMessage ? (
                  <div className="katlas-status-line flex items-center gap-2">
                    <Check className="size-4 text-emerald-400" />
                    {statusMessage}
                  </div>
                ) : null}
                {copyMessage ? <div className="katlas-status-line">{copyMessage}</div> : null}
                {errorMessage ? (
                  <div className="rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {errorMessage}
                  </div>
                ) : null}
              </section>
            ) : null}

            <section className="grid gap-5 lg:grid-cols-[360px_1fr]">
              <aside className="flex min-w-0 flex-col gap-5">
                <Panel title="Campaign" icon={ClipboardList}>
                  {projects.length > 0 ? (
                    <>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">
                          Campaign From Campaign Profiles
                        </label>
                        <select
                          value={activeProjectId}
                          onChange={(event) => requestProjectChange(event.target.value)}
                          className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus:ring-2"
                        >
                          {projects.map((project) => (
                            <option key={project.campaignId} value={project.campaignId}>
                              {project.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="mt-3">
                        <label className="text-xs font-medium text-muted-foreground">
                          Saved Sourcing Template
                        </label>
                        <select
                          value={activeProject?.activeTemplateId ?? ""}
                          onChange={(event) => requestTemplateChange(event.target.value)}
                          className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus:ring-2"
                        >
                          {activeProject?.templates.map((templateItem) => (
                            <option key={templateItem.id} value={templateItem.id}>
                              {templateItem.templateName}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          onClick={createNewTemplate}
                          disabled={!activeProject || isLoadingTemplates || isSavingTemplates}
                          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Plus className="size-4" />
                          New
                        </button>
                        <button
                          onClick={() => setIsTemplateModalOpen(true)}
                          disabled={!activeProject || isLoadingTemplates || isSavingTemplates}
                          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Columns3 className="size-4" />
                          Edit
                        </button>
                        <button
                          onClick={() => setIsTemplateManagerOpen(true)}
                          disabled={!activeProject || isLoadingTemplates || isSavingTemplates}
                          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Pencil className="size-4" />
                          Manage
                        </button>
                        <button
                          onClick={resetTemplate}
                          disabled={!activeProject || isLoadingTemplates || isSavingTemplates}
                          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <RotateCcw className="size-4" />
                          Reset
                        </button>
                      </div>
                      <TemplateStatus
                        columnCount={activeProject?.template.length ?? 0}
                        templateName={activeProject?.templateName ?? ""}
                        savedAt={activeProject?.templateSavedAt}
                        hasUnsavedChanges={templateHasUnsavedChanges}
                        message={
                          isLoadingTemplates
                            ? "Loading templates from Google Sheets..."
                            : isSavingTemplates
                              ? "Saving to Google Sheets..."
                              : templateMessage
                        }
                      />
                    </>
                  ) : (
                    <p className="mt-3 text-xs leading-5 text-muted-foreground">
                      Create campaigns in Campaign Profiles first. Sourcing templates attach to
                      those campaign records.
                    </p>
                  )}
                </Panel>

                <Panel title="Upload" icon={Upload}>
                  <label
                    className={`flex flex-col items-center justify-center rounded-lg border border-dashed px-4 py-6 text-center transition ${
                      activeProject
                        ? "cursor-pointer border-border bg-background hover:border-ring"
                        : "cursor-not-allowed border-border bg-muted/60 opacity-75"
                    }`}
                  >
                    <FileSpreadsheet className="size-7 text-muted-foreground" />
                    <span className="mt-3 text-sm font-medium">
                      {isUploading
                        ? "Reading file..."
                        : activeProject
                          ? "Upload EasyKOL Excel or CSV"
                          : "Select a campaign before uploading"}
                    </span>
                    <span className="mt-1 text-xs text-muted-foreground">
                      The app automatically reads the second worksheet.
                    </span>
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      disabled={!activeProject || isUploading}
                      onChange={(event) => {
                        void handleUpload(event.target.files?.[0]);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>

                  {sourceFileName && (
                    <div className="mt-3 space-y-2 rounded-md border border-border bg-background px-3 py-3 text-xs text-muted-foreground">
                      <div>
                        <p className="font-medium uppercase text-muted-foreground">Current File</p>
                        <p className="mt-1 truncate font-medium text-foreground">
                          {sourceFileName}
                        </p>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                        <div>
                          <p className="font-medium uppercase text-muted-foreground">
                            Creators Loaded
                          </p>
                          <p className="mt-1 font-medium text-foreground">
                            {creators.length.toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="font-medium uppercase text-muted-foreground">Worksheet</p>
                          <p className="mt-1 truncate font-medium text-foreground">
                            {sheetName || "Second worksheet"}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </Panel>

                <Panel title="Filters" icon={Filter}>
                  <EasyKolFilters
                    filters={filters}
                    openSections={openFilterSections}
                    regionCounts={regionCounts}
                    languageCounts={languageCounts}
                    platformCounts={platformCounts}
                    followersRanges={followersRanges}
                    averageViewRanges={averageViewRanges}
                    emailAvailabilityCounts={emailAvailabilityCounts}
                    customRanges={customRanges}
                    onToggleSection={toggleFilterSection}
                    onToggleRegion={(value) => toggleArrayFilter("regions", "region", value)}
                    onToggleLanguage={(value) => toggleArrayFilter("languages", "language", value)}
                    onTogglePlatform={(value) => toggleArrayFilter("platforms", "platform", value)}
                    onPresetRange={togglePresetRange}
                    onCustomRangeChange={(patch) =>
                      setCustomRanges((current) => ({ ...current, ...patch }))
                    }
                    onApplyCustomRange={applyCustomRange}
                    onEmailAvailability={toggleEmailAvailability}
                  />
                </Panel>
              </aside>

              <div className="flex min-w-0 flex-col gap-5">
                <Panel
                  key={`${activeProjectId}:${activeTemplateId}:preview`}
                  title="Preview"
                  icon={Sparkles}
                >
                  {activeFilterChips.length > 0 ? (
                    <ActiveFilterChips chips={activeFilterChips} onClear={clearFilterChip} />
                  ) : null}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">
                        {filteredCreators.length.toLocaleString()} of{" "}
                        {creators.length.toLocaleString()} creators match the current filters
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Preview shows only the columns from the selected sourcing template.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={enrichContacts}
                        disabled={
                          isEnrichingContacts ||
                          isProcessing ||
                          !activeProject ||
                          creators.length === 0
                        }
                        className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isEnrichingContacts ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Sparkles className="size-4" />
                        )}
                        Enrich Contacts
                      </button>
                      <button
                        onClick={preparePreview}
                        disabled={
                          isProcessing ||
                          isEnrichingContacts ||
                          !activeProject ||
                          creators.length === 0
                        }
                        className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isProcessing ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Sparkles className="size-4" />
                        )}
                        Prepare Preview
                      </button>
                      <button
                        onClick={() => setIsPreviewModalOpen(true)}
                        disabled={!previewReady || previewRows.length === 0}
                        className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <FileSpreadsheet className="size-4" />
                        Open Preview
                      </button>
                      <button
                        onClick={() => copyRows(previewRows, "All rows")}
                        disabled={!previewReady || previewRows.length === 0}
                        className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Copy className="size-4" />
                        Copy All Rows
                      </button>
                      <button
                        onClick={downloadPreview}
                        disabled={!previewReady || previewRows.length === 0}
                        className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Download className="size-4" />
                        Download Modified Sheet
                      </button>
                    </div>
                  </div>

                  <PreviewMetrics
                    imported={creators.length}
                    filtered={filteredCreators.length}
                    withContact={creatorsWithContact}
                    withoutContact={creatorsWithoutContact}
                  />

                  {enrichmentReport ? (
                    <ContactEnrichmentReportPanel report={enrichmentReport} />
                  ) : null}

                  {!previewReady ? (
                    <div className="mt-4 rounded-md border border-dashed border-border bg-background px-4 py-4 text-sm text-muted-foreground">
                      Prepare Preview to open the Excel-style output table.
                    </div>
                  ) : null}
                </Panel>
              </div>
            </section>
          </>
        ) : (
          <BillyScraperSystem
            projects={projects}
            isLoadingTemplates={isLoadingTemplates}
            pendingExtensionImport={pendingBillyExtensionImport}
            onExtensionImportHandled={() => setPendingBillyExtensionImport(null)}
            onWorkingDataChange={setBillyHasActiveWorkingData}
          />
        )}
      </main>

      {isTemplateModalOpen && activeProject ? (
        <TemplateEditorModal
          projectName={activeProject.name}
          templateName={draftTemplateName}
          template={template}
          isSaving={isSavingTemplates}
          onTemplateNameChange={setDraftTemplateName}
          onAddColumn={addTemplateColumn}
          onMoveColumn={moveTemplateColumn}
          onRemoveColumn={removeTemplateColumn}
          onUpdateColumn={updateTemplateColumn}
          onUpdateBlock={updateTemplateBlock}
          onSave={saveTemplate}
          onSaveAsNew={saveTemplateAsNew}
          onClose={() => setIsTemplateModalOpen(false)}
        />
      ) : null}

      {isTemplateManagerOpen && activeProject ? (
        <SourcingTemplateManagerModal
          projectName={activeProject.name}
          templates={activeProject.templates}
          activeTemplateId={activeProject.activeTemplateId}
          isSaving={isSavingTemplates}
          onSelectTemplate={requestTemplateChange}
          onNewTemplate={createNewTemplate}
          onEditActiveTemplate={() => setIsTemplateModalOpen(true)}
          onDuplicateTemplate={duplicateSourcingTemplate}
          onDeleteTemplate={deleteSourcingTemplate}
          onClose={() => setIsTemplateManagerOpen(false)}
        />
      ) : null}

      {isPreviewModalOpen ? (
        <PreviewModal
          headers={previewHeaders}
          rows={previewRows}
          selectedRowIds={selectedRowIds}
          onToggleRow={toggleRow}
          onToggleAll={toggleAllPreviewRows}
          onCopyAll={() => copyRows(previewRows, "All rows")}
          onCopySelected={() => copyRows(selectedPreviewRows, "Selected rows")}
          onDownload={downloadPreview}
          onClose={() => setIsPreviewModalOpen(false)}
        />
      ) : null}

      {pendingLeaveAction || routeBlocker.status === "blocked" ? (
        <LeaveProjectModal
          hasUnsavedTemplateChanges={templateHasUnsavedChanges}
          workingDataKind={assistantPage === "billy" ? "billy" : "easykol"}
          actionLabel={
            pendingLeaveAction?.type === "selectAssistantPage"
              ? "Switch Page"
              : pendingLeaveAction
                ? "Leave Campaign"
                : "Leave Page"
          }
          onStay={() => {
            if (pendingLeaveAction) {
              setPendingLeaveAction(null);
              return;
            }
            routeBlocker.reset?.();
          }}
          onLeave={pendingLeaveAction ? confirmPendingLeave : confirmRouteLeave}
        />
      ) : null}
    </div>
  );
}

function SourcingAssistantPagination({
  page,
  onPageChange,
}: {
  page: SourcingAssistantPage;
  onPageChange: (page: SourcingAssistantPage) => void;
}) {
  const pages: Array<{ id: SourcingAssistantPage; label: string; pageNumber: number }> = [
    { id: "easykol", label: "EasyKOL", pageNumber: 1 },
    { id: "billy", label: "Billy", pageNumber: 2 },
  ];
  const currentIndex = pages.findIndex((item) => item.id === page);
  const previousPage = pages[Math.max(currentIndex - 1, 0)]?.id ?? page;
  const nextPage = pages[Math.min(currentIndex + 1, pages.length - 1)]?.id ?? page;

  function switchPage(nextPageId: SourcingAssistantPage) {
    onPageChange(nextPageId);
  }

  return (
    <Pagination className="justify-start">
      <PaginationContent className="rounded-lg border border-border bg-card p-1">
        <PaginationItem>
          <PaginationPrevious
            href="#"
            aria-disabled={page === "easykol"}
            className={page === "easykol" ? "pointer-events-none opacity-50" : ""}
            onClick={(event) => {
              event.preventDefault();
              switchPage(previousPage);
            }}
          />
        </PaginationItem>
        {pages.map((item) => (
          <PaginationItem key={item.id}>
            <PaginationLink
              href="#"
              isActive={page === item.id}
              aria-label={`Open ${item.label} page`}
              onClick={(event) => {
                event.preventDefault();
                switchPage(item.id);
              }}
            >
              {item.pageNumber}
            </PaginationLink>
          </PaginationItem>
        ))}
        <PaginationItem>
          <PaginationNext
            href="#"
            aria-disabled={page === "billy"}
            className={page === "billy" ? "pointer-events-none opacity-50" : ""}
            onClick={(event) => {
              event.preventDefault();
              switchPage(nextPage);
            }}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

function BillyScraperSystem({
  projects,
  isLoadingTemplates,
  pendingExtensionImport,
  onExtensionImportHandled,
  onWorkingDataChange,
}: {
  projects: SourcingProject[];
  isLoadingTemplates: boolean;
  pendingExtensionImport: PendingBillyExtensionImport | null;
  onExtensionImportHandled: () => void;
  onWorkingDataChange: (hasWorkingData: boolean) => void;
}) {
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [hashtagInput, setHashtagInput] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [creators, setCreators] = useState<UploadedCreator[]>([]);
  const [filters, setFilters] = useState<BillyFilterSettings>(() => createBillyFilters());
  const [openFilterSections, setOpenFilterSections] = useState<
    Record<BillyFilterSectionKey, boolean>
  >(() => ({ ...billyFilterSectionDefaults }));
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [previewReady, setPreviewReady] = useState(false);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [scrapeReport, setScrapeReport] = useState<HashtagScrapeReport | null>(null);
  const hasActiveWorkingData = Boolean(
    hashtagInput.trim() ||
    headers.length > 0 ||
    creators.length > 0 ||
    previewReady ||
    scrapeReport,
  );

  const activeProject =
    projects.find((project) => project.campaignId === selectedCampaignId) ?? projects[0];
  const activeTemplate =
    activeProject?.templates.find((templateItem) => templateItem.id === selectedTemplateId) ??
    activeProject?.templates.find(
      (templateItem) => templateItem.id === activeProject.activeTemplateId,
    ) ??
    activeProject?.templates[0];
  const template = useMemo(() => activeTemplate?.columns ?? [], [activeTemplate]);
  const columnMap = useMemo(() => inferColumnMap(headers), [headers]);
  const filteredCreators = useMemo(
    () => filterBillyCreators(creators, filters),
    [creators, filters],
  );
  const followerRanges = useMemo(
    () => getBillyMetricRangeCounts(creators, "Followers", followersRangeOptions),
    [creators],
  );
  const activeFilterChips = useMemo(() => getActiveBillyFilterChips(filters), [filters]);
  const previewHeaders = useMemo(
    () => [
      ...template.map((column, index) => column.label.trim() || `Column ${index + 1}`),
      "Bio",
      "Sample Video URL",
      "Source Link",
    ],
    [template],
  );
  const previewRows = useMemo(
    () =>
      filteredCreators.map((creator) => {
        const baseRow = buildPreviewRow({
          id: creator.id,
          data: creator.data,
          columnMap,
          template,
        });
        return {
          ...baseRow,
          values: [
            ...baseRow.values,
            stringValue(creator.data.Description),
            stringValue(creator.data["Sample Video URL"]),
            stringValue(creator.data["Source Link"]),
          ],
        };
      }),
    [filteredCreators, columnMap, template],
  );
  const selectedPreviewRows = useMemo(
    () => previewRows.filter((row) => selectedRowIds.includes(row.id)),
    [previewRows, selectedRowIds],
  );

  useEffect(() => {
    onWorkingDataChange(hasActiveWorkingData);
    return () => onWorkingDataChange(false);
  }, [hasActiveWorkingData, onWorkingDataChange]);

  useEffect(() => {
    if (!projects.length) {
      setSelectedCampaignId("");
      return;
    }
    if (
      !selectedCampaignId ||
      !projects.some((project) => project.campaignId === selectedCampaignId)
    ) {
      setSelectedCampaignId(projects[0]?.campaignId ?? "");
    }
  }, [projects, selectedCampaignId]);

  useEffect(() => {
    if (!activeProject) {
      setSelectedTemplateId("");
      return;
    }
    const templateExists = activeProject.templates.some(
      (templateItem) => templateItem.id === selectedTemplateId,
    );
    if (!selectedTemplateId || !templateExists) {
      setSelectedTemplateId(activeProject.activeTemplateId || activeProject.templates[0]?.id || "");
    }
  }, [activeProject, selectedTemplateId]);

  useEffect(() => {
    setPreviewReady(false);
    setSelectedRowIds([]);
  }, [creators, filters, selectedTemplateId]);

  const loadBillyRows = useCallback(
    ({
      headers: nextHeaders,
      rows,
      sourceLabel,
      sourceUrl,
      videosFound,
      duplicatesRemoved,
      warnings,
      verb = "Loaded",
    }: {
      headers: string[];
      rows: Array<Record<string, string | number | boolean | null | undefined>>;
      sourceLabel: string;
      sourceUrl: string;
      videosFound: number;
      duplicatesRemoved: number;
      warnings: string[];
      verb?: string;
    }) => {
      const importId = `${sourceLabel}-${Date.now()}`;
      const nextCreators = rows.map((row, index) => ({
        id: `billy-${importId}-${index}`,
        data: row,
      }));

      setHeaders(nextHeaders);
      setCreators(nextCreators);
      setSelectedRowIds([]);
      setPreviewReady(false);
      setScrapeReport({
        sourceLabel,
        sourceUrl,
        creatorsFound: nextCreators.length,
        videosFound,
        duplicatesRemoved,
        warnings,
      });
      setStatusMessage(
        `${verb} ${nextCreators.length.toLocaleString()} creators from ${sourceLabel}.`,
      );
      setCopyMessage(warnings[0] ?? "");
    },
    [],
  );

  const importExtensionPayload = useCallback(
    async (rawPayload: unknown) => {
      const payload = parseBillyExtensionPayload(rawPayload);
      if (!payload || payload.creators.length === 0) {
        setErrorMessage("Billy did not receive any TikTok creators from the extension.");
        return;
      }

      setIsScraping(true);
      setStatusMessage(
        `Importing ${payload.creators.length.toLocaleString()} creators from the extension...`,
      );
      setErrorMessage("");
      setCopyMessage("");
      setScrapeReport(null);

      try {
        const response = await fetch("/api/sourcing/tiktok-profiles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const result = (await response.json().catch(() => ({
          ok: false,
          error: "Billy profile import returned an invalid response.",
        }))) as HashtagScrapeResponse;

        if (!response.ok || !result.ok) {
          throw new Error(result.ok ? "Billy profile import failed." : result.error);
        }

        loadBillyRows({
          headers: result.headers,
          rows: result.rows,
          sourceLabel: result.sourceLabel ?? payload.sourceLabel,
          sourceUrl: result.sourceUrl || payload.sourceUrl,
          videosFound: result.videosFound,
          duplicatesRemoved: result.duplicatesRemoved,
          warnings: result.warnings,
          verb: "Imported",
        });
      } catch (error) {
        const fallbackRows = createBillyRowsFromExtensionPayload(payload);
        loadBillyRows({
          headers: billyImportHeaders,
          rows: fallbackRows,
          sourceLabel: payload.sourceLabel,
          sourceUrl: payload.sourceUrl,
          videosFound: payload.videosFound,
          duplicatesRemoved: Math.max(payload.creators.length - fallbackRows.length, 0),
          warnings: [
            error instanceof Error
              ? `Profile enrichment failed. Billy kept the collected links. ${error.message}`
              : "Profile enrichment failed. Billy kept the collected links.",
          ],
          verb: "Imported",
        });
      } finally {
        setIsScraping(false);
      }
    },
    [loadBillyRows],
  );

  useEffect(() => {
    if (!pendingExtensionImport) return;
    void importExtensionPayload(pendingExtensionImport.payload);
    onExtensionImportHandled();
  }, [importExtensionPayload, onExtensionImportHandled, pendingExtensionImport]);

  async function scrapeHashtag() {
    const sourceInput = normalizeBillySourceInput(hashtagInput);
    if (!sourceInput) {
      setErrorMessage("Enter a hashtag or TikTok sound link first.");
      return;
    }

    setIsScraping(true);
    setStatusMessage(`Scraping ${sourceInput}...`);
    setErrorMessage("");
    setCopyMessage("");
    setScrapeReport(null);

    try {
      const response = await fetch("/api/sourcing/hashtag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "tiktok",
          source: sourceInput,
          maxResults: 1000,
        }),
      });
      const payload = (await response.json().catch(() => ({
        ok: false,
        error: "Billy scraper returned an invalid response.",
      }))) as HashtagScrapeResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.ok ? "Billy scrape failed." : payload.error);
      }

      const sourceLabel = payload.sourceLabel ?? `#${payload.hashtag}`;
      loadBillyRows({
        headers: payload.headers,
        rows: payload.rows,
        sourceLabel,
        sourceUrl: payload.sourceUrl,
        videosFound: payload.videosFound,
        duplicatesRemoved: payload.duplicatesRemoved,
        warnings: payload.warnings,
        verb: "Loaded",
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Billy scrape failed.");
      setStatusMessage("");
    } finally {
      setIsScraping(false);
    }
  }

  async function preparePreview() {
    if (!activeProject) {
      setErrorMessage("Select a campaign first.");
      return;
    }
    if (!creators.length) {
      setErrorMessage("Scrape a hashtag or sound link first.");
      return;
    }
    if (!template.length) {
      setErrorMessage("Select a sourcing template first.");
      return;
    }

    const missingTemplateFields = getMissingTemplateSourceFields(template, columnMap);
    if (missingTemplateFields.length > 0) {
      setErrorMessage(
        `The selected template uses fields Billy's rows do not have: ${missingTemplateFields.join(
          ", ",
        )}. Pick a simpler template for this scraper.`,
      );
      return;
    }

    setIsProcessing(true);
    setErrorMessage("");
    setCopyMessage("");

    for (const message of ["Applying Filters...", "Applying Template...", "Preparing Preview..."]) {
      setStatusMessage(message);
      await wait(220);
    }

    setPreviewReady(true);
    setIsProcessing(false);
    setStatusMessage(`Preview ready with ${previewRows.length.toLocaleString()} creators.`);
  }

  async function copyRows(rows: PreviewRow[], label: string) {
    if (rows.length === 0) return;
    const text = rows.map((row) => row.values.map(formatTsvCell).join("\t")).join("\n");

    try {
      await navigator.clipboard.writeText(text);
      setCopyMessage(`${label} copied without headers.`);
      setErrorMessage("");
    } catch {
      setErrorMessage("Copy failed. Your browser blocked clipboard access.");
      setCopyMessage("");
    }
  }

  async function downloadPreview() {
    if (!previewRows.length) return;
    const baseName =
      activeProject?.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "billy-scraper";

    try {
      await exportPreviewSpreadsheet({
        fileName: `${baseName}-billy-scraper-preview.xlsx`,
        headers: previewHeaders,
        rows: previewRows.map((row) => row.values),
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Excel export failed.");
    }
  }

  function toggleRow(rowId: string) {
    setSelectedRowIds((current) =>
      current.includes(rowId) ? current.filter((id) => id !== rowId) : [...current, rowId],
    );
  }

  function toggleAllPreviewRows() {
    if (selectedPreviewRows.length === previewRows.length) {
      setSelectedRowIds([]);
      return;
    }
    setSelectedRowIds(previewRows.map((row) => row.id));
  }

  function toggleFilterSection(section: BillyFilterSectionKey) {
    setOpenFilterSections((current) => ({ ...current, [section]: !current[section] }));
  }

  function togglePresetRange(range: { key: string }) {
    setFilters((current) => {
      const selected = current.followerRanges;
      const next = selected.includes(range.key)
        ? selected.filter((item) => item !== range.key)
        : [...selected, range.key];
      return { ...current, followerRanges: next };
    });
  }

  function clearBillyFilterChip(chip: BillyFilterChip) {
    setFilters((current) => {
      const next: BillyFilterSettings = {
        ...current,
        followerRanges: [...current.followerRanges],
      };

      if (chip.action.type === "array") {
        if (chip.action.field === "followerRanges") {
          next.followerRanges = next.followerRanges.filter((item) => item !== chip.action.value);
        }
        return next;
      }

      chip.action.fields.forEach((field) => clearBillyFilterValue(next, field));
      return next;
    });
  }

  if (isLoadingTemplates) {
    return (
      <Panel title="Billy's Scraper System" icon={Hash}>
        <div className="katlas-status-line">Loading campaigns and sourcing templates...</div>
      </Panel>
    );
  }

  return (
    <>
      {statusMessage || copyMessage || errorMessage ? (
        <section className="space-y-2">
          {statusMessage ? (
            <div className="katlas-status-line flex items-center gap-2">
              <Check className="size-4 text-emerald-400" />
              {statusMessage}
            </div>
          ) : null}
          {copyMessage ? <div className="katlas-status-line">{copyMessage}</div> : null}
          {errorMessage ? (
            <div className="rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {errorMessage}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <aside className="flex min-w-0 flex-col gap-5">
          <Panel title="Campaign" icon={ClipboardList}>
            {projects.length > 0 ? (
              <>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Campaign From Campaign Profiles
                  </label>
                  <select
                    value={activeProject?.campaignId ?? ""}
                    onChange={(event) => setSelectedCampaignId(event.target.value)}
                    className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus:ring-2"
                  >
                    {projects.map((project) => (
                      <option key={project.campaignId} value={project.campaignId}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mt-3">
                  <label className="text-xs font-medium text-muted-foreground">
                    Saved Sourcing Template
                  </label>
                  <select
                    value={activeTemplate?.id ?? ""}
                    onChange={(event) => setSelectedTemplateId(event.target.value)}
                    className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus:ring-2"
                  >
                    {activeProject?.templates.map((templateItem) => (
                      <option key={templateItem.id} value={templateItem.id}>
                        {templateItem.templateName}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : (
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                Billy can scrape without a campaign. Create campaigns in Campaign Profiles before
                preparing the final preview.
              </p>
            )}
          </Panel>

          <Panel title="Scrape Source" icon={Hash}>
            <HashtagScraperForm
              value={hashtagInput}
              isScraping={isScraping}
              canScrape
              onChange={setHashtagInput}
              onScrape={() => {
                void scrapeHashtag();
              }}
            />
            {scrapeReport ? <HashtagScrapeReportPanel report={scrapeReport} /> : null}
          </Panel>

          <Panel title="Billy Filters" icon={Filter}>
            <BillyFilterControls
              filters={filters}
              openSections={openFilterSections}
              followerRanges={followerRanges}
              onToggleSection={toggleFilterSection}
              onPresetRange={togglePresetRange}
              onChange={setFilters}
              onReset={() => setFilters(createBillyFilters())}
            />
          </Panel>
        </aside>

        <div className="flex min-w-0 flex-col gap-5">
          <Panel title="Billy Preview" icon={Sparkles}>
            {activeFilterChips.length > 0 ? (
              <ActiveBillyFilterChips chips={activeFilterChips} onClear={clearBillyFilterChip} />
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">
                  {filteredCreators.length.toLocaleString()} of {creators.length.toLocaleString()}{" "}
                  creators match Billy's filters
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Output uses the selected sourcing template, then appends Billy's full bio and
                  source link columns.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={preparePreview}
                  disabled={isProcessing || !activeProject || creators.length === 0}
                  className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isProcessing ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                  Prepare Preview
                </button>
                <button
                  onClick={() => setIsPreviewModalOpen(true)}
                  disabled={!previewReady || previewRows.length === 0}
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <FileSpreadsheet className="size-4" />
                  Open Preview
                </button>
                <button
                  onClick={() => copyRows(previewRows, "Billy rows")}
                  disabled={!previewReady || previewRows.length === 0}
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Copy className="size-4" />
                  Copy All Rows
                </button>
                <button
                  onClick={downloadPreview}
                  disabled={!previewReady || previewRows.length === 0}
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Download className="size-4" />
                  Download Modified Sheet
                </button>
              </div>
            </div>

            <PreviewMetrics
              imported={creators.length}
              filtered={filteredCreators.length}
              withContact={previewRows.filter((row) => hasContactInfo(row.contactInfo)).length}
              withoutContact={previewRows.filter((row) => !hasContactInfo(row.contactInfo)).length}
            />

            {!previewReady ? (
              <div className="mt-4 rounded-md border border-dashed border-border bg-background px-4 py-4 text-sm text-muted-foreground">
                Scrape a hashtag or sound link, filter the creators, then prepare Billy's preview.
              </div>
            ) : null}
          </Panel>
        </div>
      </section>

      {isPreviewModalOpen ? (
        <PreviewModal
          headers={previewHeaders}
          rows={previewRows}
          selectedRowIds={selectedRowIds}
          onToggleRow={toggleRow}
          onToggleAll={toggleAllPreviewRows}
          onCopyAll={() => copyRows(previewRows, "Billy rows")}
          onCopySelected={() => copyRows(selectedPreviewRows, "Selected Billy rows")}
          onDownload={downloadPreview}
          onClose={() => setIsPreviewModalOpen(false)}
        />
      ) : null}
    </>
  );
}

function BillyFilterControls({
  filters,
  openSections,
  followerRanges,
  onToggleSection,
  onPresetRange,
  onChange,
  onReset,
}: {
  filters: BillyFilterSettings;
  openSections: Record<BillyFilterSectionKey, boolean>;
  followerRanges: RangeOption[];
  onToggleSection: (section: BillyFilterSectionKey) => void;
  onPresetRange: (range: { key: string }) => void;
  onChange: (filters: BillyFilterSettings) => void;
  onReset: () => void;
}) {
  const hasActiveFilters = hasBillyFilters(filters);

  return (
    <div className="space-y-3">
      <FilterDropdown
        title="Followers"
        summary={getRangeSelectionSummary(
          filters.followerRanges,
          filters.followersMin,
          filters.followersMax,
          followersRangeOptions,
          "Select Followers",
          "followers",
        )}
        open={openSections.followers}
        onToggle={() => onToggleSection("followers")}
      >
        <BillyRangeOptionList
          selected={filters.followerRanges}
          ranges={followerRanges}
          onSelect={onPresetRange}
        />
        <BillyRangeControl
          min={filters.followersMin}
          max={filters.followersMax}
          minPlaceholder="Min followers"
          maxPlaceholder="Max followers"
          onMin={(followersMin) => onChange({ ...filters, followersMin })}
          onMax={(followersMax) => onChange({ ...filters, followersMax })}
        />
      </FilterDropdown>

      <button
        type="button"
        onClick={onReset}
        disabled={!hasActiveFilters}
        className="h-9 w-full rounded-md border border-border bg-background px-3 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        Reset Billy Filters
      </button>
    </div>
  );
}

function BillyRangeControl({
  min,
  max,
  minPlaceholder,
  maxPlaceholder,
  onMin,
  onMax,
}: {
  min: string;
  max: string;
  minPlaceholder: string;
  maxPlaceholder: string;
  onMin: (value: string) => void;
  onMax: (value: string) => void;
}) {
  return (
    <div className="mt-3 rounded-md border border-border bg-card p-2">
      <p className="mb-2 text-xs font-medium text-muted-foreground">Custom Range</p>
      <div className="grid grid-cols-2 gap-2">
        <input
          value={min}
          onChange={(event) => onMin(event.target.value)}
          placeholder={minPlaceholder}
          className="h-9 min-w-0 rounded-md border border-input bg-background px-2 text-xs outline-none ring-ring focus:ring-2"
        />
        <input
          value={max}
          onChange={(event) => onMax(event.target.value)}
          placeholder={maxPlaceholder}
          className="h-9 min-w-0 rounded-md border border-input bg-background px-2 text-xs outline-none ring-ring focus:ring-2"
        />
      </div>
    </div>
  );
}

function BillyRangeOptionList({
  selected,
  ranges,
  onSelect,
}: {
  selected: string[];
  ranges: RangeOption[];
  onSelect: (range: RangeOption) => void;
}) {
  return (
    <div className="space-y-1">
      {ranges.map((range) => (
        <FilterOptionButton
          key={range.key}
          label={range.label}
          count={range.count}
          selected={selected.includes(range.key)}
          onClick={() => onSelect(range)}
        />
      ))}
    </div>
  );
}

function ActiveBillyFilterChips({
  chips,
  onClear,
}: {
  chips: BillyFilterChip[];
  onClear: (chip: BillyFilterChip) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => onClear(chip)}
          className="inline-flex h-8 items-center gap-1 rounded-full border border-border bg-background px-3 text-xs text-muted-foreground transition hover:text-foreground"
        >
          {chip.label}
          <X className="size-3" />
        </button>
      ))}
    </div>
  );
}

function HashtagScraperForm({
  value,
  isScraping,
  canScrape,
  onChange,
  onScrape,
}: {
  value: string;
  isScraping: boolean;
  canScrape: boolean;
  onChange: (value: string) => void;
  onScrape: () => void;
}) {
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        onScrape();
      }}
    >
      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">
          TikTok Hashtag Or Sound Link
        </span>
        <div className="mt-1 rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
          <input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="#skincare or https://www.tiktok.com/music/..."
            className="h-10 w-full min-w-0 bg-transparent px-3 text-sm outline-none"
          />
        </div>
      </label>
      <button
        type="submit"
        disabled={!canScrape || isScraping || !normalizeBillySourceInput(value)}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isScraping ? <Loader2 className="size-4 animate-spin" /> : <Hash className="size-4" />}
        {isScraping ? "Scraping..." : "Scrape Source"}
      </button>
    </form>
  );
}

function HashtagScrapeReportPanel({ report }: { report: HashtagScrapeReport }) {
  return (
    <div className="mt-3 space-y-3 rounded-md border border-border bg-background px-3 py-3 text-xs text-muted-foreground">
      <div>
        <p className="font-medium uppercase text-muted-foreground">Current Source</p>
        <a
          href={report.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-1 block truncate font-medium text-primary underline-offset-2 hover:underline"
        >
          {report.sourceLabel}
        </a>
      </div>
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
        <div>
          <p className="font-medium uppercase text-muted-foreground">Creators</p>
          <p className="mt-1 font-medium text-foreground">
            {report.creatorsFound.toLocaleString()}
          </p>
        </div>
        <div>
          <p className="font-medium uppercase text-muted-foreground">Videos Read</p>
          <p className="mt-1 font-medium text-foreground">{report.videosFound.toLocaleString()}</p>
        </div>
        <div>
          <p className="font-medium uppercase text-muted-foreground">Duplicates Removed</p>
          <p className="mt-1 font-medium text-foreground">
            {report.duplicatesRemoved.toLocaleString()}
          </p>
        </div>
      </div>
      {report.warnings.length ? (
        <div className="rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-amber-100">
          {report.warnings[0]}
        </div>
      ) : null}
    </div>
  );
}

function EasyKolFilters({
  filters,
  openSections,
  regionCounts,
  languageCounts,
  platformCounts,
  followersRanges,
  averageViewRanges,
  emailAvailabilityCounts,
  customRanges,
  onToggleSection,
  onToggleRegion,
  onToggleLanguage,
  onTogglePlatform,
  onPresetRange,
  onCustomRangeChange,
  onApplyCustomRange,
  onEmailAvailability,
}: {
  filters: FilterSettings;
  openSections: Record<FilterSectionKey, boolean>;
  regionCounts: CountOption[];
  languageCounts: CountOption[];
  platformCounts: CountOption[];
  followersRanges: RangeOption[];
  averageViewRanges: RangeOption[];
  emailAvailabilityCounts: { has: number; none: number };
  customRanges: {
    followersMin: string;
    followersMax: string;
    averageViewsMin: string;
    averageViewsMax: string;
  };
  onToggleSection: (section: FilterSectionKey) => void;
  onToggleRegion: (value: string) => void;
  onToggleLanguage: (value: string) => void;
  onTogglePlatform: (value: string) => void;
  onPresetRange: (kind: "followers" | "averageViews", range: { key: string }) => void;
  onCustomRangeChange: (
    patch: Partial<{
      followersMin: string;
      followersMax: string;
      averageViewsMin: string;
      averageViewsMax: string;
    }>,
  ) => void;
  onApplyCustomRange: (kind: "followers" | "averageViews") => void;
  onEmailAvailability: (value: "has" | "none") => void;
}) {
  return (
    <div className="space-y-3">
      <FilterDropdown
        title="Regions"
        summary={getSelectionSummary(filters.regions, "Select Regions", formatCountryLabel)}
        open={openSections.regions}
        onToggle={() => onToggleSection("regions")}
      >
        <CountOptionList
          emptyLabel="Upload creator data to see regions."
          formatValue={formatCountryLabel}
          matchesQuery={matchesCountryQuery}
          noResultsLabel="No matching countries."
          options={regionCounts}
          searchPlaceholder="Search country code or name"
          selected={filters.regions}
          onSelect={onToggleRegion}
        />
      </FilterDropdown>

      <FilterDropdown
        title="Languages"
        summary={getSelectionSummary(filters.languages, "Select Languages")}
        open={openSections.languages}
        onToggle={() => onToggleSection("languages")}
      >
        <CountOptionList
          emptyLabel="Upload creator data to see languages."
          options={languageCounts}
          selected={filters.languages}
          onSelect={onToggleLanguage}
        />
      </FilterDropdown>

      <FilterDropdown
        title="Platform"
        summary={getSelectionSummary(filters.platforms, "Select Platform")}
        open={openSections.platforms}
        onToggle={() => onToggleSection("platforms")}
      >
        <CountOptionList
          emptyLabel="Upload creator data to see platforms."
          options={platformCounts}
          selected={filters.platforms}
          onSelect={onTogglePlatform}
        />
      </FilterDropdown>

      <FilterDropdown
        title="Followers"
        summary={getRangeSelectionSummary(
          filters.followerRanges,
          filters.followersMin,
          filters.followersMax,
          followersRangeOptions,
          "Select Followers",
          "followers",
        )}
        open={openSections.followers}
        onToggle={() => onToggleSection("followers")}
      >
        <RangeOptionList
          kind="followers"
          filters={filters}
          ranges={followersRanges}
          onSelect={(range) => onPresetRange("followers", range)}
        />
        <CustomRangeControls
          min={customRanges.followersMin}
          max={customRanges.followersMax}
          minLabel="Min Followers"
          maxLabel="Max Followers"
          onMin={(value) => onCustomRangeChange({ followersMin: value })}
          onMax={(value) => onCustomRangeChange({ followersMax: value })}
          onConfirm={() => onApplyCustomRange("followers")}
        />
      </FilterDropdown>

      <FilterDropdown
        title="Average Views"
        summary={getRangeSelectionSummary(
          filters.averageViewRanges,
          filters.averageViewsMin,
          filters.averageViewsMax,
          averageViewRangeOptions,
          "Select Average Views",
          "avg views",
        )}
        open={openSections.averageViews}
        onToggle={() => onToggleSection("averageViews")}
      >
        <RangeOptionList
          kind="averageViews"
          filters={filters}
          ranges={averageViewRanges}
          onSelect={(range) => onPresetRange("averageViews", range)}
        />
        <CustomRangeControls
          min={customRanges.averageViewsMin}
          max={customRanges.averageViewsMax}
          minLabel="Min Avg Views"
          maxLabel="Max Avg Views"
          onMin={(value) => onCustomRangeChange({ averageViewsMin: value })}
          onMax={(value) => onCustomRangeChange({ averageViewsMax: value })}
          onConfirm={() => onApplyCustomRange("averageViews")}
        />
      </FilterDropdown>

      <FilterDropdown
        title="Email Availability"
        summary={
          filters.emailAvailabilitySelections.length > 0
            ? getEmailSelectionSummary(filters.emailAvailabilitySelections)
            : filters.emailAvailability === "has"
              ? "Has Email"
              : filters.emailAvailability === "none"
                ? "No Email"
                : "Select Email Availability"
        }
        open={openSections.emailAvailability}
        onToggle={() => onToggleSection("emailAvailability")}
      >
        <div className="space-y-1">
          <FilterOptionButton
            label="Has Email"
            count={emailAvailabilityCounts.has}
            selected={
              filters.emailAvailabilitySelections.includes("has") ||
              filters.emailAvailability === "has" ||
              (!filters.emailAvailability && filters.hasEmail)
            }
            onClick={() => onEmailAvailability("has")}
          />
          <FilterOptionButton
            label="No Email"
            count={emailAvailabilityCounts.none}
            selected={
              filters.emailAvailabilitySelections.includes("none") ||
              filters.emailAvailability === "none"
            }
            onClick={() => onEmailAvailability("none")}
          />
        </div>
      </FilterDropdown>
    </div>
  );
}

function FilterDropdown({
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex h-10 w-full items-center justify-between gap-3 rounded-md border border-input bg-background px-3 text-left text-sm transition hover:bg-accent/50"
      >
        <span className="min-w-0 truncate text-muted-foreground">{summary}</span>
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open ? (
        <div className="rounded-md border border-border bg-background p-2 shadow-lg">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function CountOptionList({
  options,
  selected,
  emptyLabel,
  noResultsLabel = "No matching options.",
  searchPlaceholder,
  formatValue = (value) => value,
  matchesQuery,
  onSelect,
}: {
  options: CountOption[];
  selected: string[];
  emptyLabel: string;
  noResultsLabel?: string;
  searchPlaceholder?: string;
  formatValue?: (value: string) => string;
  matchesQuery?: (value: string, query: string) => boolean;
  onSelect: (value: string) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");

  if (options.length === 0) {
    return (
      <p className="rounded-md bg-card px-3 py-3 text-xs text-muted-foreground">{emptyLabel}</p>
    );
  }

  const visibleOptions = searchQuery.trim()
    ? options.filter((option) =>
        matchesQuery
          ? matchesQuery(option.value, searchQuery)
          : formatValue(option.value).toLowerCase().includes(searchQuery.trim().toLowerCase()),
      )
    : options;

  return (
    <div className="space-y-2">
      {searchPlaceholder ? (
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder={searchPlaceholder}
          className="h-9 w-full rounded-md border border-input bg-card px-3 text-xs text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary"
        />
      ) : null}
      <div className="max-h-52 space-y-1 overflow-auto pr-1">
        {visibleOptions.length > 0 ? (
          visibleOptions.map((option) => (
            <FilterOptionButton
              key={option.value}
              label={formatValue(option.value)}
              count={option.count}
              selected={selected.includes(option.value)}
              onClick={() => onSelect(option.value)}
            />
          ))
        ) : (
          <p className="rounded-md bg-card px-3 py-3 text-xs text-muted-foreground">
            {noResultsLabel}
          </p>
        )}
      </div>
    </div>
  );
}

function RangeOptionList({
  kind,
  filters,
  ranges,
  onSelect,
}: {
  kind: "followers" | "averageViews";
  filters: FilterSettings;
  ranges: RangeOption[];
  onSelect: (range: RangeOption) => void;
}) {
  return (
    <div className="space-y-1">
      {ranges.map((range) => (
        <FilterOptionButton
          key={range.key}
          label={range.label}
          count={range.count}
          selected={
            kind === "followers"
              ? filters.followerRanges.includes(range.key)
              : filters.averageViewRanges.includes(range.key)
          }
          onClick={() => onSelect(range)}
        />
      ))}
    </div>
  );
}

function FilterOptionButton({
  label,
  count,
  selected,
  onClick,
}: {
  label: string;
  count: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-9 w-full items-center justify-between gap-3 rounded-md border px-3 text-xs transition ${
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-transparent bg-card text-muted-foreground hover:border-border hover:text-foreground"
      }`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span
          className={`grid size-4 shrink-0 place-items-center rounded border ${
            selected ? "border-primary-foreground" : "border-border"
          }`}
        >
          {selected ? <Check className="size-3" /> : null}
        </span>
        <span className="truncate">{label}</span>
      </span>
      <span className="shrink-0 tabular-nums opacity-80">({count.toLocaleString()})</span>
    </button>
  );
}

function CustomRangeControls({
  min,
  max,
  minLabel,
  maxLabel,
  onMin,
  onMax,
  onConfirm,
}: {
  min: string;
  max: string;
  minLabel: string;
  maxLabel: string;
  onMin: (value: string) => void;
  onMax: (value: string) => void;
  onConfirm: () => void;
}) {
  return (
    <div className="mt-3 rounded-md border border-border bg-card p-2">
      <p className="mb-2 text-xs font-medium text-muted-foreground">Custom Range</p>
      <div className="grid grid-cols-2 gap-2">
        <input
          value={min}
          onChange={(event) => onMin(event.target.value)}
          placeholder={minLabel}
          className="h-9 min-w-0 rounded-md border border-input bg-background px-2 text-xs outline-none ring-ring focus:ring-2"
        />
        <input
          value={max}
          onChange={(event) => onMax(event.target.value)}
          placeholder={maxLabel}
          className="h-9 min-w-0 rounded-md border border-input bg-background px-2 text-xs outline-none ring-ring focus:ring-2"
        />
      </div>
      <button
        type="button"
        onClick={onConfirm}
        className="mt-2 h-9 w-full rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition hover:opacity-90"
      >
        Confirm
      </button>
    </div>
  );
}

function ActiveFilterChips({
  chips,
  onClear,
}: {
  chips: FilterChip[];
  onClear: (chip: FilterChip) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => onClear(chip)}
          className="inline-flex h-8 items-center gap-1 rounded-full border border-border bg-background px-3 text-xs text-muted-foreground transition hover:text-foreground"
        >
          {chip.label}
          <X className="size-3" />
        </button>
      ))}
    </div>
  );
}

function PreviewModal({
  headers,
  rows,
  selectedRowIds,
  onToggleRow,
  onToggleAll,
  onCopyAll,
  onCopySelected,
  onDownload,
  onClose,
}: {
  headers: string[];
  rows: PreviewRow[];
  selectedRowIds: string[];
  onToggleRow: (rowId: string) => void;
  onToggleAll: () => void;
  onCopyAll: () => void;
  onCopySelected: () => void;
  onDownload: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-[96vw] flex-col rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Excel-Style Preview
            </p>
            <h2 className="mt-1 text-lg font-semibold">
              {rows.length.toLocaleString()} prepared rows
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {selectedRowIds.length.toLocaleString()} selected
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={onCopyAll}
              disabled={rows.length === 0}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Copy className="size-4" />
              Copy All Rows
            </button>
            <button
              onClick={onCopySelected}
              disabled={selectedRowIds.length === 0}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Copy className="size-4" />
              Copy Selected Rows
            </button>
            <button
              onClick={onDownload}
              disabled={rows.length === 0}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="size-4" />
              Download Modified Sheet
            </button>
            <button
              onClick={onClose}
              className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-background px-3 text-sm font-medium transition hover:bg-accent"
            >
              Close
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden px-5 py-4">
          <PreviewTable
            headers={headers}
            rows={rows}
            selectedRowIds={selectedRowIds}
            onToggleRow={onToggleRow}
            onToggleAll={onToggleAll}
          />
        </div>
      </div>
    </div>
  );
}

function LeaveProjectModal({
  hasUnsavedTemplateChanges,
  workingDataKind,
  actionLabel,
  onStay,
  onLeave,
}: {
  hasUnsavedTemplateChanges: boolean;
  workingDataKind: "easykol" | "billy";
  actionLabel: string;
  onStay: () => void;
  onLeave: () => void;
}) {
  const workingDataLabel =
    workingDataKind === "billy"
      ? "Billy scrape rows, filters, and preview data"
      : "The uploaded EasyKOL file and preview data";
  const eyebrowLabel =
    workingDataKind === "billy" ? "Before leaving Billy:" : "Before leaving this campaign:";
  const leaveButtonLabel = workingDataKind === "billy" ? actionLabel : "Leave Campaign";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{eyebrowLabel}</p>
        <h2 className="mt-3 text-lg font-semibold">
          {hasUnsavedTemplateChanges
            ? "You have unsaved template changes."
            : "Have you copied or downloaded everything you need?"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {workingDataLabel} will be cleared.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onStay}
            className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium transition hover:bg-accent"
          >
            Stay
          </button>
          <button
            onClick={onLeave}
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            {leaveButtonLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function SourcingTemplateManagerModal({
  projectName,
  templates,
  activeTemplateId,
  isSaving,
  onSelectTemplate,
  onNewTemplate,
  onEditActiveTemplate,
  onDuplicateTemplate,
  onDeleteTemplate,
  onClose,
}: {
  projectName: string;
  templates: SourcingTemplate[];
  activeTemplateId: string;
  isSaving: boolean;
  onSelectTemplate: (templateId: string) => void;
  onNewTemplate: () => void;
  onEditActiveTemplate: () => void;
  onDuplicateTemplate: (templateId: string) => void;
  onDeleteTemplate: (templateId: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Manage Sourcing Templates
            </p>
            <h2 className="mt-1 text-lg font-semibold">{projectName}</h2>
          </div>
          <button
            onClick={onClose}
            className="grid size-9 place-items-center rounded-md border border-border bg-background text-muted-foreground transition hover:text-foreground"
            aria-label="Close sourcing template manager"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-3 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                onNewTemplate();
                onClose();
              }}
              disabled={isSaving}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:opacity-90"
            >
              <Plus className="size-4" />
              New Template
            </button>
            <button
              type="button"
              onClick={() => {
                onEditActiveTemplate();
                onClose();
              }}
              disabled={isSaving}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium transition hover:bg-accent"
            >
              <Pencil className="size-4" />
              Edit Active
            </button>
          </div>

          <div className="space-y-2">
            {templates.map((templateItem) => {
              const selected = templateItem.id === activeTemplateId;
              return (
                <article
                  key={templateItem.id}
                  className={`rounded-lg border p-3 ${
                    selected ? "border-primary bg-primary/10" : "border-border bg-background"
                  }`}
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h3 className="font-semibold">{templateItem.templateName}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {templateItem.columns.length} column
                        {templateItem.columns.length === 1 ? "" : "s"}
                        {selected ? " · Active" : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => onSelectTemplate(templateItem.id)}
                        disabled={selected || isSaving}
                        className="inline-flex h-8 items-center rounded-md border border-border bg-card px-2.5 text-xs font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Select
                      </button>
                      <button
                        type="button"
                        onClick={() => onDuplicateTemplate(templateItem.id)}
                        disabled={isSaving}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium transition hover:bg-accent"
                      >
                        <CopyPlus className="size-3.5" />
                        Duplicate
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteTemplate(templateItem.id)}
                        disabled={templates.length <= 1 || isSaving}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
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
        </div>
      </div>
    </div>
  );
}

function TemplateEditorModal({
  projectName,
  templateName,
  template,
  isSaving,
  onTemplateNameChange,
  onAddColumn,
  onMoveColumn,
  onRemoveColumn,
  onUpdateColumn,
  onUpdateBlock,
  onSave,
  onSaveAsNew,
  onClose,
}: {
  projectName: string;
  templateName: string;
  template: TemplateColumn[];
  isSaving: boolean;
  onTemplateNameChange: (value: string) => void;
  onAddColumn: () => void;
  onMoveColumn: (columnId: string, direction: "up" | "down") => void;
  onRemoveColumn: (columnId: string) => void;
  onUpdateColumn: (columnId: string, patch: Partial<TemplateColumn>) => void;
  onUpdateBlock: (column: TemplateColumn, value: string) => void;
  onSave: () => void;
  onSaveAsNew: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Template Editor
            </p>
            <h2 className="mt-1 text-lg font-semibold">{projectName}</h2>
          </div>
          <button
            onClick={onClose}
            className="grid size-9 place-items-center rounded-md border border-border bg-background text-muted-foreground transition hover:text-foreground"
            aria-label="Close template editor"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          <TemplateBuilder
            projectName={projectName}
            templateName={templateName}
            template={template}
            onTemplateNameChange={onTemplateNameChange}
            onAddColumn={onAddColumn}
            onMoveColumn={onMoveColumn}
            onRemoveColumn={onRemoveColumn}
            onUpdateColumn={onUpdateColumn}
            onUpdateBlock={onUpdateBlock}
          />
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-4">
          <button
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium transition hover:bg-accent"
          >
            Close
          </button>
          <button
            onClick={onSave}
            disabled={template.length === 0 || isSaving}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save className="size-4" />
            {isSaving ? "Saving..." : "Save Template"}
          </button>
          <button
            onClick={onSaveAsNew}
            disabled={template.length === 0 || isSaving}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="size-4" />
            Save As New
          </button>
        </div>
      </div>
    </div>
  );
}

function TemplateStatus({
  columnCount,
  templateName,
  savedAt,
  hasUnsavedChanges,
  message,
}: {
  columnCount: number;
  templateName: string;
  savedAt?: string;
  hasUnsavedChanges: boolean;
  message: string;
}) {
  const statusText = hasUnsavedChanges
    ? "Unsaved template changes"
    : columnCount > 0
      ? `Saved template: ${templateName || "Untitled Template"} (${columnCount} column${
          columnCount === 1 ? "" : "s"
        })`
      : "Currently no saved template for this campaign";

  return (
    <div className="mt-3 rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
      <p
        className={hasUnsavedChanges ? "font-medium text-amber-300" : "font-medium text-foreground"}
      >
        {statusText}
      </p>
      {!hasUnsavedChanges && columnCount > 0 ? (
        <p className="mt-1">Last saved {formatSavedAt(savedAt)}</p>
      ) : null}
      {message ? <p className="mt-1">{message}</p> : null}
    </div>
  );
}

function TemplateBuilder({
  projectName,
  templateName,
  template,
  onTemplateNameChange,
  onAddColumn,
  onMoveColumn,
  onRemoveColumn,
  onUpdateColumn,
  onUpdateBlock,
}: {
  projectName: string;
  templateName: string;
  template: TemplateColumn[];
  onTemplateNameChange: (value: string) => void;
  onAddColumn: () => void;
  onMoveColumn: (columnId: string, direction: "up" | "down") => void;
  onRemoveColumn: (columnId: string) => void;
  onUpdateColumn: (columnId: string, patch: Partial<TemplateColumn>) => void;
  onUpdateBlock: (column: TemplateColumn, value: string) => void;
}) {
  return (
    <div>
      <p className="mb-3 text-xs leading-5 text-muted-foreground">
        Campaign: <span className="font-medium text-foreground">{projectName}</span>
      </p>
      <label className="mb-4 block">
        <span className="text-xs font-medium text-muted-foreground">Template Name</span>
        <input
          value={templateName}
          onChange={(event) => onTemplateNameChange(event.target.value)}
          placeholder="Default Template"
          className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus:ring-2"
        />
      </label>
      <div className="space-y-2">
        {template.map((column, index) => (
          <div key={column.id} className="rounded-lg border border-border bg-background p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="grid size-8 place-items-center rounded-md border border-border text-sm font-medium text-muted-foreground">
                {index + 1}
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => onMoveColumn(column.id, "up")}
                  disabled={index === 0}
                  className="grid size-8 place-items-center rounded-md border border-border bg-card text-muted-foreground transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Move template column up"
                >
                  <ArrowUp className="size-4" />
                </button>
                <button
                  onClick={() => onMoveColumn(column.id, "down")}
                  disabled={index === template.length - 1}
                  className="grid size-8 place-items-center rounded-md border border-border bg-card text-muted-foreground transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Move template column down"
                >
                  <ArrowDown className="size-4" />
                </button>
                <button
                  onClick={() => onRemoveColumn(column.id)}
                  className="grid size-8 place-items-center rounded-md border border-border bg-card text-muted-foreground transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={template.length === 1}
                  aria-label="Remove template column"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <input
                value={column.label}
                onChange={(event) => onUpdateColumn(column.id, { label: event.target.value })}
                placeholder="Output column label"
                className="h-9 w-full rounded-md border border-input bg-card px-2 text-xs outline-none ring-ring focus:ring-2"
              />
              <select
                value={getTemplateBlockValue(column)}
                onChange={(event) => onUpdateBlock(column, event.target.value)}
                className="h-9 w-full rounded-md border border-input bg-card px-2 text-xs outline-none ring-ring focus:ring-2"
              >
                <optgroup label="EasyKOL fields">
                  {easyKolFields.map((field) => (
                    <option key={field} value={`field:${field}`}>
                      {field}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Utility blocks">
                  <option value="contacts">Contacts</option>
                  <option value="blank">Blank</option>
                  <option value="custom">Custom</option>
                </optgroup>
              </select>
              {column.blockType === "custom" ? (
                <input
                  value={column.customValue ?? ""}
                  onChange={(event) =>
                    onUpdateColumn(column.id, { customValue: event.target.value })
                  }
                  placeholder="Custom value"
                  className="h-9 w-full rounded-md border border-input bg-card px-2 text-xs outline-none ring-ring focus:ring-2"
                />
              ) : (
                <div className="flex min-h-9 items-center rounded-md border border-border bg-card px-2 text-xs text-muted-foreground">
                  {getBlockDescription(column)}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={onAddColumn}
        className="mt-3 inline-flex h-10 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium transition hover:bg-accent"
      >
        <Plus className="size-4" />
        Add Column
      </button>
    </div>
  );
}

function PreviewTable({
  headers,
  rows,
  selectedRowIds,
  onToggleRow,
  onToggleAll,
}: {
  headers: string[];
  rows: PreviewRow[];
  selectedRowIds: string[];
  onToggleRow: (rowId: string) => void;
  onToggleAll: () => void;
}) {
  if (headers.length === 0) {
    return (
      <EmptyPanel
        icon={Columns3}
        title="Add template columns before preparing preview."
        body="The output template controls the final columns."
      />
    );
  }

  const allSelected = rows.length > 0 && selectedRowIds.length === rows.length;

  return (
    <div className="h-full max-h-[70vh] overflow-auto rounded-lg border border-border bg-background">
      <table className="min-w-max border-collapse text-left text-sm">
        <thead className="sticky top-0 z-10 bg-muted">
          <tr>
            <th className="sticky left-0 z-20 w-10 border-b border-r border-border bg-muted px-3 py-2">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleAll}
                className="size-4 accent-foreground"
                aria-label="Select all preview rows"
              />
            </th>
            {headers.map((header, index) => (
              <th
                key={`${header}-${index}`}
                className="min-w-40 whitespace-nowrap border-b border-r border-border px-3 py-2 text-xs font-semibold"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-border bg-card last:border-b-0">
              <td className="sticky left-0 z-10 border-r border-border bg-card px-3 py-2 align-top">
                <input
                  type="checkbox"
                  checked={selectedRowIds.includes(row.id)}
                  onChange={() => onToggleRow(row.id)}
                  className="size-4 accent-foreground"
                  aria-label="Select preview row"
                />
              </td>
              {row.values.map((value, index) => (
                <td
                  key={`${row.id}-${index}`}
                  className="max-w-96 whitespace-pre-wrap border-r border-border px-3 py-2 align-top text-xs leading-5 text-muted-foreground"
                >
                  {renderLinkedCell(value)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderLinkedCell(value: string): ReactNode {
  if (!value) return null;

  return value.split("\n").map((line, lineIndex, lines) => (
    <span key={`${line}-${lineIndex}`}>
      {renderLinkedLine(line, lineIndex)}
      {lineIndex < lines.length - 1 ? <br /> : null}
    </span>
  ));
}

function renderLinkedLine(line: string, lineIndex: number): ReactNode[] {
  const nodes: ReactNode[] = [];
  const markdownLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = markdownLinkRegex.exec(line))) {
    if (match.index > cursor) {
      nodes.push(...renderUrlText(line.slice(cursor, match.index), `plain-${lineIndex}-${cursor}`));
    }

    const label = match[1] ?? "";
    const href = match[2] ?? "";
    nodes.push(
      <a
        key={`markdown-${lineIndex}-${match.index}`}
        href={href}
        target={href.startsWith("mailto:") ? undefined : "_blank"}
        rel={href.startsWith("mailto:") ? undefined : "noreferrer"}
        className="text-primary underline underline-offset-2 hover:opacity-80"
      >
        {label}
      </a>,
    );
    cursor = markdownLinkRegex.lastIndex;
  }

  if (cursor < line.length) {
    nodes.push(...renderUrlText(line.slice(cursor), `plain-${lineIndex}-${cursor}`));
  }

  return nodes.length > 0 ? nodes : [line];
}

function renderUrlText(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const urlRegex = /https?:\/\/[^\s<>"\]]+/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = urlRegex.exec(text))) {
    if (match.index > cursor) {
      nodes.push(text.slice(cursor, match.index));
    }

    const rawUrl = match[0] ?? "";
    const { href, trailing } = splitTrailingPunctuation(rawUrl);
    nodes.push(
      <a
        key={`${keyPrefix}-${match.index}`}
        href={href}
        target="_blank"
        rel="noreferrer"
        className="text-primary underline underline-offset-2 hover:opacity-80"
      >
        {href}
      </a>,
    );
    if (trailing) nodes.push(trailing);
    cursor = urlRegex.lastIndex;
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  return nodes.length > 0 ? nodes : [text];
}

function splitTrailingPunctuation(value: string): { href: string; trailing: string } {
  let href = value;
  let trailing = "";
  while (/[.,;:!?)]$/.test(href)) {
    trailing = `${href[href.length - 1]}${trailing}`;
    href = href.slice(0, -1);
  }
  return { href, trailing };
}

function PreviewMetrics({
  imported,
  filtered,
  withContact,
  withoutContact,
}: {
  imported: number;
  filtered: number;
  withContact: number;
  withoutContact: number;
}) {
  return (
    <div className="mt-4 grid gap-2 sm:grid-cols-4">
      <SmallMetric label="Imported Creators" value={imported} />
      <SmallMetric label="Filtered Creators" value={filtered} />
      <SmallMetric label="With Contact" value={withContact} />
      <SmallMetric label="Without Contact" value={withoutContact} />
    </div>
  );
}

function ContactEnrichmentReportPanel({ report }: { report: ContactEnrichmentReport }) {
  return (
    <div className="mt-4 rounded-lg border border-border bg-background p-4">
      <h3 className="text-sm font-semibold">Contact Enrichment Report</h3>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <SmallMetric label="Creators Processed" value={report.creatorsProcessed} />
        <SmallMetric label="Email Found" value={report.emailFound} />
        <SmallMetric label="LINE Found" value={report.lineFound} />
        <SmallMetric label="WhatsApp Found" value={report.whatsappFound} />
        <SmallMetric label="Instagram Found" value={report.instagramFound} />
        <SmallMetric label="Creators With Contact" value={report.creatorsWithContact} />
        <SmallMetric label="Creators Without Contact" value={report.creatorsWithoutContact} />
      </div>
    </div>
  );
}

function EmptyPanel({
  icon: Icon,
  title,
  body,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
}) {
  return (
    <div className="mt-5 rounded-lg border border-dashed border-border bg-background px-4 py-10 text-center">
      <Icon className="mx-auto size-8 text-muted-foreground" />
      <p className="mt-3 text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{body}</p>
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

function SmallMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="katlas-muted-box px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value.toLocaleString()}</p>
    </div>
  );
}

function defaultTemplate(): TemplateColumn[] {
  return [
    fieldColumn("Nickname", "Creator"),
    fieldColumn("@Username", "Username"),
    fieldColumn("Followers", "Followers"),
    fieldColumn("Avg. Views", "Avg Views"),
    {
      id: createId("column"),
      label: "Contacts",
      blockType: "contacts",
    },
    {
      id: createId("column"),
      label: "Coordinator",
      blockType: "custom",
      customValue: "",
    },
  ];
}

function fieldColumn(fieldKey: EasyKolField, label: string): TemplateColumn {
  return {
    id: createId("column"),
    label,
    blockType: "field",
    fieldKey,
  };
}

function getTemplateBlockValue(column: TemplateColumn): string {
  return column.blockType === "field" && column.fieldKey
    ? `field:${column.fieldKey}`
    : column.blockType;
}

function getBlockDescription(column: TemplateColumn): string {
  if (column.blockType === "contacts") return "Generated Email, LINE, WhatsApp, Instagram block";
  if (column.blockType === "blank") return "Outputs empty cells";
  if (column.blockType === "field") return column.fieldKey ?? "Choose an EasyKOL field";
  return "Fixed value";
}

function getValueCounts(
  creators: UploadedCreator[],
  columnMap: ReturnType<typeof inferColumnMap>,
  field: EasyKolField,
): CountOption[] {
  const counts = new Map<string, number>();
  creators.forEach(({ data }) => {
    const value = getCell(data, columnMap, field);
    if (!value) return;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((first, second) => second.count - first.count || first.value.localeCompare(second.value));
}

function getMetricRangeCounts(
  creators: UploadedCreator[],
  columnMap: ReturnType<typeof inferColumnMap>,
  field: EasyKolField,
  ranges: ReadonlyArray<{ key: string; label: string; min: string; max: string }>,
): RangeOption[] {
  return ranges.map((range) => ({
    ...range,
    count: creators.filter(({ data }) => valueInRange(getCell(data, columnMap, field), range))
      .length,
  }));
}

function getMissingTemplateSourceFields(
  template: TemplateColumn[],
  columnMap: ReturnType<typeof inferColumnMap>,
): string[] {
  const missing = new Set<string>();

  template.forEach((column) => {
    if (column.blockType !== "field" || !column.fieldKey) return;
    if (!columnMap[column.fieldKey]) missing.add(formatEasyKolFieldLabel(column.fieldKey));
  });

  const usesContacts = template.some((column) => column.blockType === "contacts");
  const hasContactSource = ["Email", "Description", "URL"].some(
    (field) => columnMap[field as EasyKolField],
  );
  if (usesContacts && !hasContactSource) {
    missing.add("Email, Description, or URL for Contacts");
  }

  return Array.from(missing);
}

function formatEasyKolFieldLabel(field: EasyKolField): string {
  const labels: Partial<Record<EasyKolField, string>> = {
    "Avg. Views": "Avg Views",
    "Posts (7d)": "Posts 7d",
    "Posts (30d)": "Posts 30d",
  };
  return labels[field] ?? field;
}

function valueInRange(value: unknown, range: { min: string; max: string }): boolean {
  const metric = parseMetric(value);
  if (metric == null) return false;
  const min = parseMetric(range.min);
  const max = parseMetric(range.max);
  if (min != null && metric < min) return false;
  if (max != null && metric > max) return false;
  return true;
}

function createBillyFilters(): BillyFilterSettings {
  return {
    ...emptyBillyFilters,
    followerRanges: [],
  };
}

function filterBillyCreators(
  creators: UploadedCreator[],
  filters: BillyFilterSettings,
): UploadedCreator[] {
  return creators.filter(({ data }) => {
    if (
      !matchesBillyRangeGroup(
        data.Followers,
        filters.followerRanges,
        filters.followersMin,
        filters.followersMax,
        followersRangeOptions,
      )
    ) {
      return false;
    }
    return true;
  });
}

function getBillyMetricRangeCounts(
  creators: UploadedCreator[],
  field: string,
  ranges: ReadonlyArray<{ key: string; label: string; min: string; max: string }>,
): RangeOption[] {
  return ranges.map((range) => ({
    ...range,
    count: creators.filter(({ data }) => valueInRange(data[field], range)).length,
  }));
}

function matchesBillyRangeGroup(
  value: unknown,
  selectedRangeKeys: string[],
  customMin: string,
  customMax: string,
  ranges: ReadonlyArray<{ key: string; min: string; max: string }>,
): boolean {
  const hasCustomRange = Boolean(customMin || customMax);
  if (selectedRangeKeys.length === 0 && !hasCustomRange) return true;

  const matchesPreset = selectedRangeKeys.some((key) => {
    const range = ranges.find((option) => option.key === key);
    return range ? matchesBillyRange(value, range.min, range.max) : false;
  });
  const matchesCustom = hasCustomRange && matchesBillyRange(value, customMin, customMax);
  return matchesPreset || matchesCustom;
}

function matchesBillyRange(value: unknown, min: string, max: string): boolean {
  const minValue = parseMetric(min);
  const maxValue = parseMetric(max);
  if (minValue == null && maxValue == null) return true;
  const metric = parseMetric(value);
  if (metric == null) return false;
  if (minValue != null && metric < minValue) return false;
  if (maxValue != null && metric > maxValue) return false;
  return true;
}

function hasBillyFilters(filters: BillyFilterSettings): boolean {
  return filters.followerRanges.length > 0 || Boolean(filters.followersMin || filters.followersMax);
}

function clearBillyFilterValue(filters: BillyFilterSettings, key: keyof BillyFilterSettings) {
  if (key === "followersMin") filters.followersMin = "";
  if (key === "followersMax") filters.followersMax = "";
  if (key === "followerRanges") filters.followerRanges = [];
}

function getActiveBillyFilterChips(filters: BillyFilterSettings): BillyFilterChip[] {
  const chips: BillyFilterChip[] = [];

  filters.followerRanges.forEach((rangeKey) => {
    const range = followersRangeOptions.find((option) => option.key === rangeKey);
    if (!range) return;
    chips.push({
      key: range.key,
      label: `${range.label} Followers`,
      action: { type: "array", field: "followerRanges", value: range.key },
    });
  });
  if (filters.followersMin || filters.followersMax) {
    chips.push({
      key: "billy-followers-custom",
      label: getRangeChipLabel(
        filters.followersMin,
        filters.followersMax,
        "Followers",
        followersRangeOptions,
      ),
      action: { type: "fields", fields: ["followersMin", "followersMax"] },
    });
  }
  return chips;
}

function parseBillyExtensionPayload(value: unknown): BillyExtensionPayload | undefined {
  if (!isRecord(value)) return undefined;
  const rawCreators = Array.isArray(value.creators) ? value.creators : [];
  const creators = rawCreators
    .map(parseBillyExtensionCreator)
    .filter((creator): creator is BillyExtensionCreator => Boolean(creator));
  const sourceUrl = typeof value.sourceUrl === "string" ? value.sourceUrl : "";
  const sourceLabel =
    typeof value.sourceLabel === "string" && value.sourceLabel.trim()
      ? value.sourceLabel.trim()
      : "TikTok extension import";
  const videosFound =
    typeof value.videosFound === "number" && Number.isFinite(value.videosFound)
      ? value.videosFound
      : creators.reduce((count, creator) => count + (creator.videos?.length || 1), 0);

  return {
    collectedAt: typeof value.collectedAt === "string" ? value.collectedAt : undefined,
    sourceLabel,
    sourceUrl,
    videosFound,
    creators: dedupeBillyExtensionCreators(creators),
  };
}

function parseBillyExtensionCreator(value: unknown): BillyExtensionCreator | undefined {
  if (!isRecord(value)) return undefined;
  const username = cleanBillyUsername(stringValue(value.username));
  if (!username) return undefined;
  const videos = Array.isArray(value.videos)
    ? value.videos.filter((item): item is string => typeof item === "string" && item.trim())
    : undefined;
  return {
    username,
    profileUrl:
      typeof value.profileUrl === "string" && value.profileUrl.trim()
        ? value.profileUrl.trim()
        : `https://www.tiktok.com/@${username}`,
    sampleVideoUrl:
      typeof value.sampleVideoUrl === "string" && value.sampleVideoUrl.trim()
        ? value.sampleVideoUrl.trim()
        : videos?.[0],
    videoDescription:
      typeof value.videoDescription === "string" ? value.videoDescription.trim() : undefined,
    sourceLink: typeof value.sourceLink === "string" ? value.sourceLink.trim() : undefined,
    videos,
  };
}

function dedupeBillyExtensionCreators(creators: BillyExtensionCreator[]): BillyExtensionCreator[] {
  const creatorsByUsername = new Map<string, BillyExtensionCreator>();

  creators.forEach((creator) => {
    const key = cleanBillyUsername(creator.username).toLowerCase();
    if (!key) return;
    const existing = creatorsByUsername.get(key);
    if (!existing) {
      creatorsByUsername.set(key, {
        ...creator,
        username: cleanBillyUsername(creator.username),
        videos: [...(creator.videos ?? [])],
      });
      return;
    }

    creatorsByUsername.set(key, {
      ...existing,
      profileUrl: existing.profileUrl || creator.profileUrl,
      sampleVideoUrl: existing.sampleVideoUrl || creator.sampleVideoUrl,
      videoDescription: existing.videoDescription || creator.videoDescription,
      sourceLink: existing.sourceLink || creator.sourceLink,
      videos: Array.from(new Set([...(existing.videos ?? []), ...(creator.videos ?? [])])),
    });
  });

  return Array.from(creatorsByUsername.values());
}

function createBillyRowsFromExtensionPayload(
  payload: BillyExtensionPayload,
): Array<Record<string, string | number | boolean | null | undefined>> {
  return payload.creators.map((creator) => {
    const username = cleanBillyUsername(creator.username);
    const description = creator.videoDescription ?? "";
    return {
      Nickname: username,
      "@Username": `@${username}`,
      Description: description,
      Platform: "TikTok",
      Followers: "",
      "Avg. Views": "",
      "Avg. Likes": "",
      Email: extractEmailFromText(description),
      "Last Post": "",
      URL: creator.profileUrl || `https://www.tiktok.com/@${username}`,
      "Sample Video URL": creator.sampleVideoUrl || creator.videos?.[0] || "",
      "Source Link": creator.sourceLink || payload.sourceUrl,
    };
  });
}

function cleanBillyUsername(value: string): string {
  return value
    .trim()
    .replace(/^@+/, "")
    .replace(/[/?#].*$/, "");
}

function extractEmailFromText(value: string): string {
  return value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? "";
}

function getSelectionSummary(
  values: string[],
  emptyLabel: string,
  formatValue: (value: string) => string = (value) => value,
): string {
  if (values.length === 0) return emptyLabel;
  if (values.length === 1) return values[0] ? formatValue(values[0]) : emptyLabel;
  return `${values.length} selected`;
}

function getRangeSelectionSummary(
  selectedKeys: string[],
  min: string,
  max: string,
  ranges: ReadonlyArray<{ key: string; label: string; min: string; max: string }>,
  emptyLabel: string,
  noun: string,
): string {
  const selectedLabels = selectedKeys
    .map((key) => ranges.find((range) => range.key === key)?.label)
    .filter(Boolean);
  const custom = min || max ? getMetricFilterSummary(min, max, noun) : "";
  const total = selectedLabels.length + (custom ? 1 : 0);
  if (total === 0) return emptyLabel;
  if (total === 1) return selectedLabels[0] ?? custom;
  return `${total} selected`;
}

function getMetricFilterSummary(min: string, max: string, noun: string): string {
  if (!min && !max) return `All ${noun}`;
  return `${formatRangeValue(min) || "0"}-${formatRangeValue(max) || "max"} ${noun}`;
}

function getEmailSelectionSummary(values: EmailAvailability[]): string {
  if (values.length === 2) return "Has Email, No Email";
  return values[0] === "has" ? "Has Email" : "No Email";
}

function getRangeChipLabel(
  min: string,
  max: string,
  label: string,
  ranges: ReadonlyArray<{ label: string; min: string; max: string }> = [],
): string {
  const preset = ranges.find((range) => range.min === min && range.max === max);
  if (preset) return `${preset.label} ${label}`;
  if (min && max) return `${formatRangeValue(min)}-${formatRangeValue(max)} ${label}`;
  if (min) return `${formatRangeValue(min)}+ ${label}`;
  return `<${formatRangeValue(max)} ${label}`;
}

function formatRangeValue(value: string): string {
  const metric = parseMetric(value);
  if (metric == null) return value;
  if (metric >= 1_000_000) return `${metric / 1_000_000}m`;
  if (metric >= 1_000) return `${metric / 1_000}k`;
  return String(metric);
}

function getActiveFilterChips(filters: FilterSettings): FilterChip[] {
  const chips: FilterChip[] = [];
  if (filters.keyword)
    chips.push({
      key: "keyword",
      label: `Search: ${filters.keyword}`,
      action: { type: "fields", fields: ["keyword"] },
    });
  filters.regions.forEach((region) =>
    chips.push({
      key: `region-${region}`,
      label: formatCountryLabel(region),
      action: { type: "array", field: "regions", value: region },
    }),
  );
  filters.languages.forEach((language) =>
    chips.push({
      key: `language-${language}`,
      label: language,
      action: { type: "array", field: "languages", value: language },
    }),
  );
  filters.platforms.forEach((platform) =>
    chips.push({
      key: `platform-${platform}`,
      label: platform,
      action: { type: "array", field: "platforms", value: platform },
    }),
  );
  filters.followerRanges.forEach((rangeKey) => {
    const range = followersRangeOptions.find((option) => option.key === rangeKey);
    if (!range) return;
    chips.push({
      key: range.key,
      label: `${range.label} Followers`,
      action: { type: "array", field: "followerRanges", value: range.key },
    });
  });
  if (filters.followersMin || filters.followersMax)
    chips.push({
      key: "followers-custom",
      label: getRangeChipLabel(
        filters.followersMin,
        filters.followersMax,
        "Followers",
        followersRangeOptions,
      ),
      action: { type: "fields", fields: ["followersMin", "followersMax"] },
    });
  filters.averageViewRanges.forEach((rangeKey) => {
    const range = averageViewRangeOptions.find((option) => option.key === rangeKey);
    if (!range) return;
    chips.push({
      key: range.key,
      label: `${range.label} Avg Views`,
      action: { type: "array", field: "averageViewRanges", value: range.key },
    });
  });
  if (filters.averageViewsMin || filters.averageViewsMax)
    chips.push({
      key: "averageViews-custom",
      label: getRangeChipLabel(
        filters.averageViewsMin,
        filters.averageViewsMax,
        "Avg Views",
        averageViewRangeOptions,
      ),
      action: { type: "fields", fields: ["averageViewsMin", "averageViewsMax"] },
    });
  if (filters.medianViewsMin)
    chips.push({
      key: "medianViewsMin",
      label: `${filters.medianViewsMin}+ median views`,
      action: { type: "fields", fields: ["medianViewsMin"] },
    });
  if (filters.medianViewsMax)
    chips.push({
      key: "medianViewsMax",
      label: `Max ${filters.medianViewsMax} median views`,
      action: { type: "fields", fields: ["medianViewsMax"] },
    });
  if (filters.lastPostAfter)
    chips.push({
      key: "lastPostAfter",
      label: `Last post after ${filters.lastPostAfter}`,
      action: { type: "fields", fields: ["lastPostAfter"] },
    });
  if (filters.posts7dMin)
    chips.push({
      key: "posts7dMin",
      label: `${filters.posts7dMin}+ posts 7d`,
      action: { type: "fields", fields: ["posts7dMin"] },
    });
  if (filters.posts30dMin)
    chips.push({
      key: "posts30dMin",
      label: `${filters.posts30dMin}+ posts 30d`,
      action: { type: "fields", fields: ["posts30dMin"] },
    });
  filters.emailAvailabilitySelections.forEach((value) =>
    chips.push({
      key: `email-${value}`,
      label: value === "has" ? "Has Email" : "No Email",
      action: { type: "array", field: "emailAvailabilitySelections", value },
    }),
  );
  if (
    filters.emailAvailabilitySelections.length === 0 &&
    (filters.emailAvailability === "has" || (!filters.emailAvailability && filters.hasEmail))
  ) {
    chips.push({
      key: "hasEmail",
      label: "Has Email",
      action: { type: "fields", fields: ["emailAvailability", "hasEmail"] },
    });
  }
  if (filters.emailAvailabilitySelections.length === 0 && filters.emailAvailability === "none")
    chips.push({
      key: "noEmail",
      label: "No Email",
      action: { type: "fields", fields: ["emailAvailability", "hasEmail"] },
    });
  return chips;
}

function clearFilterValue(filters: FilterSettings, key: keyof FilterSettings) {
  if (key === "followersMin") filters.followersMin = "";
  if (key === "followersMax") filters.followersMax = "";
  if (key === "followerRanges") filters.followerRanges = [];
  if (key === "averageViewsMin") filters.averageViewsMin = "";
  if (key === "averageViewsMax") filters.averageViewsMax = "";
  if (key === "averageViewRanges") filters.averageViewRanges = [];
  if (key === "medianViewsMin") filters.medianViewsMin = "";
  if (key === "medianViewsMax") filters.medianViewsMax = "";
  if (key === "region") filters.region = "";
  if (key === "regions") filters.regions = [];
  if (key === "language") filters.language = "";
  if (key === "languages") filters.languages = [];
  if (key === "platform") filters.platform = "";
  if (key === "platforms") filters.platforms = [];
  if (key === "lastPostAfter") filters.lastPostAfter = "";
  if (key === "posts7dMin") filters.posts7dMin = "";
  if (key === "posts30dMin") filters.posts30dMin = "";
  if (key === "hasEmail") filters.hasEmail = false;
  if (key === "emailAvailability") filters.emailAvailability = "";
  if (key === "emailAvailabilitySelections") filters.emailAvailabilitySelections = [];
  if (key === "keyword") filters.keyword = "";
}

function loadProjects(database: {
  worksheets: {
    AppSettings: AppSettingRecord[];
    CampaignProfiles: CampaignProfileRecord[];
    SourcingTemplates: SourcingTemplateRecord[];
  };
}): SourcingProject[] {
  if (typeof window === "undefined") return [];
  const campaigns = database.worksheets.CampaignProfiles;
  const settings = new Map(
    database.worksheets.AppSettings.map((setting) => [setting.settingKey, setting.settingValue]),
  );
  const templatesByCampaign = groupSourcingTemplates(database.worksheets.SourcingTemplates);

  return campaigns.map((campaign) =>
    createProjectFromCampaign(
      campaign,
      templatesByCampaign.get(campaign.campaignId) ?? [],
      settings,
    ),
  );
}

function createProjectFromCampaign(
  campaign: CampaignProfileRecord,
  templates: SourcingTemplate[],
  settings: Map<string, string>,
): SourcingProject {
  const ensuredTemplates =
    templates.length > 0 ? templates : [createDefaultSourcingTemplate(campaign.campaignId)];
  const activeTemplateId =
    settings.get(`sourcing.activeTemplate.${campaign.campaignId}`) || ensuredTemplates[0]?.id || "";

  return activateProjectTemplate(
    {
      id: campaign.campaignId,
      campaignId: campaign.campaignId,
      name: campaign.campaignName,
      createdAt: campaign.createdAt,
      filters: { ...emptyFilters },
      templates: ensuredTemplates,
      activeTemplateId,
      template: [],
      templateName: "",
      templateSavedAt: undefined,
    },
    activeTemplateId,
  );
}

function groupSourcingTemplates(records: SourcingTemplateRecord[]) {
  const grouped = new Map<string, SourcingTemplate[]>();
  const cleanup = cleanupSourcingTemplateRecords(records);
  if (cleanup.removedCount > 0) {
    console.info("[SourcingTemplatesCleanup]", "load-templates", cleanup);
  }
  cleanup.records.filter(isActiveSourcingTemplateRecord).forEach((record) => {
    const template = normalizeSourcingTemplateRecord(record);
    const templates = grouped.get(template.campaignId) ?? [];
    templates.push(template);
    grouped.set(template.campaignId, templates);
  });

  grouped.forEach((templates) =>
    templates.sort((first, second) => first.createdAt.localeCompare(second.createdAt)),
  );
  return grouped;
}

function normalizeSourcingTemplateRecord(record: SourcingTemplateRecord): SourcingTemplate {
  return {
    id: record.id || createId("sourcing-template"),
    campaignId: record.campaignId,
    templateName: record.templateName || "Default Template",
    columns: normalizeTemplate(parseJsonSetting(record.columnsJson)),
    createdAt: record.createdAt || new Date().toISOString(),
    updatedAt: record.updatedAt || record.createdAt || new Date().toISOString(),
  };
}

function createDefaultSourcingTemplate(campaignId: string): SourcingTemplate {
  const now = new Date().toISOString();
  return {
    id: createId("sourcing-template"),
    campaignId,
    templateName: "Default Template",
    columns: defaultTemplate(),
    createdAt: now,
    updatedAt: now,
  };
}

function activateProjectTemplate(project: SourcingProject, templateId: string): SourcingProject {
  const templates =
    project.templates.length > 0
      ? project.templates
      : [createDefaultSourcingTemplate(project.campaignId)];
  const activeTemplate = templates.find((template) => template.id === templateId) ?? templates[0];

  if (!activeTemplate) {
    return {
      ...project,
      templates,
      activeTemplateId: "",
      template: [],
      templateName: "",
      templateSavedAt: undefined,
    };
  }

  return {
    ...project,
    templates,
    activeTemplateId: activeTemplate.id,
    template: cloneTemplate(activeTemplate.columns),
    templateName: activeTemplate.templateName,
    templateSavedAt: activeTemplate.updatedAt,
  };
}

function toSourcingTemplateRecord(
  template: SourcingTemplate,
  campaignName = "",
): SourcingTemplateRecord {
  return {
    id: template.id,
    campaignId: template.campaignId,
    campaignName,
    templateName: template.templateName,
    columnsJson: JSON.stringify(template.columns),
    isActive: "TRUE",
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
    createdBy: "",
    updatedBy: "",
  };
}

function parseJsonSetting(value: unknown): unknown {
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function getNextTemplateName(templates: SourcingTemplate[]): string {
  let index = templates.length + 1;
  const names = new Set(templates.map((template) => template.templateName));
  while (names.has(`Template ${index}`)) {
    index += 1;
  }
  return `Template ${index}`;
}

function getDuplicateTemplateName(baseName: string, templates: SourcingTemplate[]): string {
  const names = new Set(templates.map((template) => template.templateName));
  let index = 2;
  let candidate = `${baseName} Copy`;
  while (names.has(candidate)) {
    candidate = `${baseName} Copy ${index}`;
    index += 1;
  }
  return candidate;
}

function normalizeFilters(value: unknown): FilterSettings {
  const filters = isRecord(value) ? value : {};
  const emailAvailability = normalizeEmailAvailability(filters.emailAvailability);
  const emailAvailabilitySelections = normalizeEmailAvailabilityArray(
    filters.emailAvailabilitySelections,
    emailAvailability || (filters.hasEmail ? "has" : ""),
  );
  return {
    followersMin: stringValue(filters.followersMin),
    followersMax: stringValue(filters.followersMax),
    followerRanges: normalizeStringArray(filters.followerRanges),
    averageViewsMin: stringValue(filters.averageViewsMin),
    averageViewsMax: stringValue(filters.averageViewsMax),
    averageViewRanges: normalizeStringArray(filters.averageViewRanges),
    medianViewsMin: stringValue(filters.medianViewsMin),
    medianViewsMax: stringValue(filters.medianViewsMax),
    region: "",
    regions: normalizeStringArray(filters.regions, stringValue(filters.region)),
    language: "",
    languages: normalizeStringArray(filters.languages, stringValue(filters.language)),
    platform: "",
    platforms: normalizeStringArray(filters.platforms, stringValue(filters.platform)),
    lastPostAfter: stringValue(filters.lastPostAfter),
    posts7dMin: stringValue(filters.posts7dMin),
    posts30dMin: stringValue(filters.posts30dMin),
    hasEmail: false,
    emailAvailability: "",
    emailAvailabilitySelections,
    keyword: stringValue(filters.keyword),
  };
}

function normalizeTemplate(value: unknown): TemplateColumn[] {
  if (!Array.isArray(value) || value.length === 0) return defaultTemplate();

  return [...value]
    .sort((first, second) => getTemplateColumnOrder(first) - getTemplateColumnOrder(second))
    .map((item, index) => {
      const column = isRecord(item) ? item : {};
      const fieldKey = normalizeEasyKolFieldKey(
        column.fieldKey ?? column.sourceField ?? column.sourceEasyKolField ?? column.sourceBlock,
      );
      const blockType = normalizeBlockType(
        column.blockType ?? column.type ?? column.sourceType ?? column.sourceBlock,
        fieldKey,
      );

      return {
        id: String(column.id || createId("column")),
        label:
          stringValue(column.label) ||
          stringValue(column.outputColumnName) ||
          stringValue(column.outputName) ||
          stringValue(column.name) ||
          `Column ${index + 1}`,
        blockType: blockType === "field" && !fieldKey ? "blank" : blockType,
        fieldKey,
        customValue: stringValue(column.customValue) || stringValue(column.value),
      };
    });
}

function normalizeBlockType(value: unknown, fieldKey?: EasyKolField): TemplateBlockType {
  const normalized = stringValue(value).trim().toLowerCase();
  if (fieldKey) return "field";
  if (normalized === "field" || normalized === "easykol" || normalized === "source") return "field";
  if (normalized === "contacts" || normalized === "contact") return "contacts";
  if (normalized === "blank" || normalized === "empty") return "blank";
  if (normalized === "custom" || normalized === "fixed") return "custom";
  return "blank";
}

function normalizeEasyKolFieldKey(value: unknown): EasyKolField | undefined {
  const normalized = normalizeFieldLookupValue(value);
  if (!normalized) return undefined;
  return easyKolFields.find((field) => {
    const fieldAliases = getEasyKolFieldAliases(field).map(normalizeFieldLookupValue);
    return normalizeFieldLookupValue(field) === normalized || fieldAliases.includes(normalized);
  });
}

function getEasyKolFieldAliases(field: EasyKolField): string[] {
  const aliases: Partial<Record<EasyKolField, string[]>> = {
    "@Username": ["Username", "Handle", "Account"],
    "Avg. Views": ["Avg Views", "Average Views"],
    "Median Views": ["Median View"],
    "Posts (7d)": ["Posts 7d", "7d Posts", "Posts Last 7 Days"],
    "Posts (30d)": ["Posts 30d", "30d Posts", "Posts Last 30 Days"],
    URL: ["Profile URL", "Profile Link", "Link"],
  };
  return aliases[field] ?? [];
}

function getTemplateColumnOrder(value: unknown): number {
  const record = isRecord(value) ? value : {};
  const order = Number(
    record.order ?? record.columnNumber ?? record.index ?? Number.MAX_SAFE_INTEGER,
  );
  return Number.isFinite(order) ? order : Number.MAX_SAFE_INTEGER;
}

function normalizeFieldLookupValue(value: unknown): string {
  return stringValue(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9@]+/g, "");
}

function normalizeStringArray(value: unknown, legacyValue = ""): string[] {
  const values = Array.isArray(value) ? value.map(stringValue) : [];
  return Array.from(new Set([legacyValue, ...values].map((item) => item.trim()).filter(Boolean)));
}

function normalizeEmailAvailability(value: unknown): "" | EmailAvailability {
  return value === "has" || value === "none" ? value : "";
}

function normalizeEmailAvailabilityArray(
  value: unknown,
  legacyValue: "" | EmailAvailability,
): EmailAvailability[] {
  const values = Array.isArray(value)
    ? value.filter((item): item is EmailAvailability => item === "has" || item === "none")
    : [];
  return Array.from(new Set([legacyValue, ...values].filter(Boolean))) as EmailAvailability[];
}

type AIContactEnrichmentResponse =
  | {
      ok: true;
      results: AIContactEnrichmentResult[];
      processed: number;
      skipped: number;
      maxCreators: number;
    }
  | {
      ok: false;
      error: string;
    };

type AIContactEnrichmentResult = {
  creatorId: string;
  contactsText: string;
  contacts: Partial<Record<ContactField, string>>;
  confidence: "high" | "medium" | "low";
  source: string;
  reasoning: string;
  sourcesChecked: string[];
  warnings: string[];
  modelUsed: string;
};

async function enrichContactsWithAI(
  creators: UploadedCreator[],
): Promise<Extract<AIContactEnrichmentResponse, { ok: true }>> {
  const response = await fetch("/api/ai/enrich-contacts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      creators: creators.map((creator) => ({
        creatorId: creator.id,
        data: creator.data,
      })),
      maxCreators: 10,
    }),
  });
  const payload = (await response.json().catch(() => ({
    ok: false,
    error: "AI enrichment API returned an invalid response.",
  }))) as AIContactEnrichmentResponse;

  if (!response.ok || !payload.ok) {
    throw new Error(payload.ok ? "AI enrichment failed." : payload.error);
  }

  return payload;
}

function mergeAIEnrichmentResults(
  localResults: CreatorEnrichmentResult[],
  aiResults: AIContactEnrichmentResult[],
): CreatorEnrichmentResult[] {
  const aiByCreatorId = new Map(aiResults.map((result) => [result.creatorId, result]));

  return localResults.map((result) => {
    const aiResult = aiByCreatorId.get(result.creatorId);
    if (!aiResult) return result;

    return {
      creatorId: result.creatorId,
      contactInfo: mergeContactInfoWithAI(result.contactInfo, aiResult),
    };
  });
}

function mergeContactInfoWithAI(
  localContactInfo: ContactInfo,
  aiResult: AIContactEnrichmentResult,
): ContactInfo {
  const aiConfidence = getAIConfidenceScore(aiResult.confidence);
  const aiDiscoveries = (
    Object.entries(aiResult.contacts) as Array<[ContactField, string | undefined]>
  )
    .filter(([, value]) => Boolean(value?.trim()))
    .map(([field, value]) => ({
      field,
      value: value?.trim() ?? "",
      source: "External Discovery" as const,
      discoveryMethod: "AI Extraction" as const,
      provider: aiResult.modelUsed ? `OpenRouter ${aiResult.modelUsed}` : "OpenRouter",
      confidence: aiConfidence,
      sourceUrl: aiResult.sourcesChecked.find((source) => /^https?:\/\//i.test(source)),
    }));

  return {
    ...localContactInfo,
    email: localContactInfo.email || aiResult.contacts.email,
    line: localContactInfo.line || aiResult.contacts.line,
    whatsapp: localContactInfo.whatsapp || aiResult.contacts.whatsapp,
    phone: localContactInfo.phone || aiResult.contacts.phone,
    instagram: localContactInfo.instagram || aiResult.contacts.instagram,
    tiktok: localContactInfo.tiktok || aiResult.contacts.tiktok,
    youtube: localContactInfo.youtube || aiResult.contacts.youtube,
    website: localContactInfo.website || aiResult.contacts.website,
    other: localContactInfo.other || aiResult.contacts.other,
    sourceUrl:
      localContactInfo.sourceUrl ||
      aiResult.sourcesChecked.find((source) => /^https?:\/\//i.test(source)),
    confidence: Math.max(localContactInfo.confidence, aiConfidence),
    discoveryMethod: aiDiscoveries.length
      ? `OpenRouter: ${aiResult.source || "available sources"}`
      : localContactInfo.discoveryMethod,
    discoveries: [...localContactInfo.discoveries, ...aiDiscoveries],
    externalDiscoveryStatus: aiDiscoveries.length
      ? `AI enrichment complete: ${aiResult.reasoning || "contacts extracted"}`
      : `AI enrichment complete: ${aiResult.reasoning || "no extra contacts found"}`,
  };
}

function getAIConfidenceScore(confidence: AIContactEnrichmentResult["confidence"]): number {
  if (confidence === "high") return 90;
  if (confidence === "medium") return 70;
  return 45;
}

function cloneTemplate(template: TemplateColumn[]): TemplateColumn[] {
  return template.map((column) => ({ ...column }));
}

function templatesEqual(first: TemplateColumn[], second: TemplateColumn[]): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

function formatSavedAt(value?: string): string {
  if (!value) return "Not saved yet";
  const savedAt = new Date(value);
  if (Number.isNaN(savedAt.getTime())) return "Not saved yet";
  const seconds = Math.max(0, Math.floor((Date.now() - savedAt.getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function stringValue(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

function normalizeBillySourceInput(value: string): string {
  return value.trim();
}

function getInitialSourcingAssistantPage(): SourcingAssistantPage {
  return getSourcingAssistantPageFromHash() ?? "easykol";
}

function getSourcingAssistantPageFromHash(): SourcingAssistantPage | undefined {
  if (typeof window === "undefined") return undefined;
  const hash = window.location.hash.toLowerCase();
  if (hash.includes("billy")) return "billy";
  if (hash.includes("easykol")) return "easykol";
  return undefined;
}

function updateSourcingAssistantHash(page: SourcingAssistantPage) {
  if (typeof window === "undefined") return;
  const nextHash = page === "billy" ? "#billy" : "#easykol";
  if (window.location.hash === nextHash) return;
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${window.location.search}${nextHash}`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function formatTsvCell(value: string): string {
  if (!/[\t\n"]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}
