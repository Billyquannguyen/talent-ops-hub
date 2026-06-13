import { useBlocker } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { loadCampaignRegistry, type GlobalCampaign } from "@/lib/campaignRegistry";
import { formatCountryLabel, matchesCountryQuery } from "@/lib/countries";
import { loadAppDatabase, updateDatabase } from "@/storage/appRepository";
import type { AppSettingRecord, SourcingTemplateRecord } from "@/storage/schema";
import { buildPreviewRow, hasContactInfo, runEnrichmentPipeline } from "./enrichment";
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
  type ContactInfo,
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
const filterSectionDefaults = {
  regions: false,
  languages: false,
  platforms: false,
  followers: false,
  averageViews: false,
  emailAvailability: false,
};

type FilterSectionKey = keyof typeof filterSectionDefaults;
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
type PendingLeaveAction =
  | { type: "selectProject"; projectId: string }
  | { type: "selectTemplate"; templateId: string };

export function CreatorSourcingAssistant() {
  const [projects, setProjects] = useState<SourcingProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState("");
  const [projectsLoaded, setProjectsLoaded] = useState(false);
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

  const activeProject = projects.find((project) => project.id === activeProjectId);
  const activeTemplateId = activeProject?.activeTemplateId ?? "";
  const template = useMemo(() => draftTemplate, [draftTemplate]);
  const templateHasUnsavedChanges = activeProject
    ? !templatesEqual(draftTemplate, activeProject.template) ||
      draftTemplateName.trim() !== activeProject.templateName
    : false;
  const hasActiveWorkingData = Boolean(
    sourceFileName || headers.length > 0 || creators.length > 0 || previewReady,
  );
  const shouldConfirmBeforeLeaving = hasActiveWorkingData || templateHasUnsavedChanges;
  const routeBlocker = useBlocker({
    shouldBlockFn: ({ current, next }) =>
      current.pathname === "/creator-sourcing" &&
      next.pathname !== "/creator-sourcing" &&
      shouldConfirmBeforeLeaving,
    enableBeforeUnload: shouldConfirmBeforeLeaving,
    withResolver: true,
  });
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
    const loadedProjects = loadProjects();
    setProjects(loadedProjects);
    setActiveProjectId(loadedProjects[0]?.id ?? "");
    setFilters(loadedProjects[0]?.filters ?? { ...emptyFilters });
    setDraftTemplate(cloneTemplate(loadedProjects[0]?.template ?? []));
    setDraftTemplateName(loadedProjects[0]?.templateName ?? "");
    setProjectsLoaded(true);
  }, []);

  useEffect(() => {
    if (!projectsLoaded) return;
    saveProjects(projects);
  }, [projects, projectsLoaded]);

  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  useEffect(() => {
    const project = projectsRef.current.find((item) => item.id === activeProjectId);
    if (!project) return;
    setFilters((current) => (filtersEqual(current, project.filters) ? current : project.filters));
  }, [activeProjectId, projects]);

  useEffect(() => {
    if (!activeProjectId) {
      setDraftTemplate([]);
      setTemplateMessage("");
      return;
    }
    const project = projectsRef.current.find((item) => item.id === activeProjectId);
    if (!project) return;
    setDraftTemplate(cloneTemplate(project.template));
    setDraftTemplateName(project.templateName);
    setTemplateMessage("");
  }, [activeProjectId, activeTemplateId, projectsLoaded]);

  useEffect(() => {
    if (!activeProjectId) return;
    setProjects((current) =>
      current.map((project) =>
        project.id === activeProjectId && !filtersEqual(project.filters, filters)
          ? { ...project, filters }
          : project,
      ),
    );
  }, [activeProjectId, filters]);

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
    clearWorkingData();
    setActiveProjectId(projectId);
    setStatusMessage("Campaign changed.");
    setErrorMessage("");
    setCopyMessage("");
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
    clearWorkingData();
    setProjects((current) =>
      current.map((project) =>
        project.id === activeProjectId ? activateProjectTemplate(project, templateId) : project,
      ),
    );
    setStatusMessage("Template changed.");
    setErrorMessage("");
    setCopyMessage("");
  }

  function createNewTemplate() {
    if (!activeProject) return;
    const now = new Date().toISOString();
    const nextTemplate: SourcingTemplate = {
      id: createId("sourcing-template"),
      campaignId: activeProject.id,
      templateName: getNextTemplateName(activeProject.templates),
      columns: defaultTemplate(),
      createdAt: now,
      updatedAt: now,
    };

    clearWorkingData();
    setProjects((current) =>
      current.map((project) => {
        if (project.id !== activeProject.id) return project;
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

  function duplicateSourcingTemplate(templateId: string) {
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

    setProjects((current) =>
      current.map((project) => {
        if (project.id !== activeProject.id) return project;
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
    setTemplateMessage("Template duplicated.");
  }

  function deleteSourcingTemplate(templateId: string) {
    if (!activeProject || activeProject.templates.length <= 1) return;
    const templateToDelete = activeProject.templates.find(
      (templateItem) => templateItem.id === templateId,
    );
    if (!templateToDelete) return;
    const confirmed =
      typeof window === "undefined" ||
      window.confirm(`Delete "${templateToDelete.templateName}"? This cannot be undone.`);
    if (!confirmed) return;

    setProjects((current) =>
      current.map((project) => {
        if (project.id !== activeProject.id) return project;
        const templates = project.templates.filter(
          (templateItem) => templateItem.id !== templateId,
        );
        const nextActiveTemplateId =
          project.activeTemplateId === templateId
            ? (templates[0]?.id ?? "")
            : project.activeTemplateId;
        return activateProjectTemplate({ ...project, templates }, nextActiveTemplateId);
      }),
    );
    setTemplateMessage("Template deleted.");
  }

  function clearWorkingData() {
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
  }

  function confirmPendingLeave() {
    if (!pendingLeaveAction) return;
    const action = pendingLeaveAction;
    setPendingLeaveAction(null);
    if (action.type === "selectTemplate") {
      switchTemplate(action.templateId);
      return;
    }
    switchProject(action.projectId);
  }

  function confirmRouteLeave() {
    clearWorkingData();
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

      setStatusMessage("Generating Contacts...");
      await wait(220);
      setContactInfoByCreatorId(
        Object.fromEntries(result.results.map((row) => [row.creatorId, row.contactInfo] as const)),
      );
      setEnrichmentReport(result.report);
      setStatusMessage("Done.");
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

  function saveTemplate() {
    if (!activeProject) return;
    const savedAt = new Date().toISOString();
    const savedTemplate = cloneTemplate(draftTemplate);
    const savedTemplateName = draftTemplateName.trim() || activeProject.templateName;
    setProjects((current) =>
      current.map((project) => {
        if (project.id !== activeProject.id) return project;
        const templates = project.templates.map((templateItem) =>
          templateItem.id === project.activeTemplateId
            ? {
                ...templateItem,
                templateName: savedTemplateName,
                columns: savedTemplate,
                updatedAt: savedAt,
              }
            : templateItem,
        );
        return activateProjectTemplate(
          {
            ...project,
            templates,
          },
          project.activeTemplateId,
        );
      }),
    );
    setDraftTemplate(cloneTemplate(savedTemplate));
    setDraftTemplateName(savedTemplateName);
    setTemplateMessage("Template saved for this campaign.");
    setIsTemplateModalOpen(false);
  }

  function saveTemplateAsNew() {
    if (!activeProject) return;
    const savedAt = new Date().toISOString();
    const baseName = draftTemplateName.trim() || activeProject.templateName || "Template";
    const nextTemplate: SourcingTemplate = {
      id: createId("sourcing-template"),
      campaignId: activeProject.id,
      templateName: getDuplicateTemplateName(baseName, activeProject.templates),
      columns: cloneTemplate(draftTemplate),
      createdAt: savedAt,
      updatedAt: savedAt,
    };

    setProjects((current) =>
      current.map((project) => {
        if (project.id !== activeProject.id) return project;
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
    setTemplateMessage("Template saved as a new template.");
    setIsTemplateModalOpen(false);
  }

  function resetTemplate() {
    if (!activeProject) return;
    const templateForProject = defaultTemplate();
    const savedAt = new Date().toISOString();
    setProjects((current) =>
      current.map((project) => {
        if (project.id !== activeProject.id) return project;
        const templates = project.templates.map((templateItem) =>
          templateItem.id === project.activeTemplateId
            ? { ...templateItem, columns: templateForProject, updatedAt: savedAt }
            : templateItem,
        );
        return activateProjectTemplate({ ...project, templates }, project.activeTemplateId);
      }),
    );
    setDraftTemplate(cloneTemplate(templateForProject));
    setTemplateMessage("Template reset for this campaign.");
    setIsTemplateModalOpen(false);
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

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <TopBar />
      <div className="absolute inset-x-0 top-0 h-[360px] bg-hero-glow pointer-events-none" />

      <main className="relative mx-auto flex w-full max-w-7xl flex-col gap-5 px-5 py-6">
        <section className="rounded-2xl border border-border bg-card/60 p-5 md:p-7">
          <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Creator Sourcing Assistant
              </p>
              <h1 className="mt-3 max-w-3xl text-3xl font-medium leading-tight tracking-tight md:text-4xl">
                EasyKOL Scraping Processor
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                Upload the EasyKOL export, filter the creators, generate contacts, then preview the
                exact columns you want to paste into a sourcing sheet.
              </p>
            </div>
            <div className="grid w-full gap-0 border-y border-border py-4 sm:grid-cols-4 lg:max-w-2xl">
              <Metric label="Imported" value={creators.length.toLocaleString()} />
              <Metric label="Filtered" value={filteredCreators.length.toLocaleString()} />
              <Metric label="With contact" value={creatorsWithContact.toLocaleString()} />
              <Metric label="Without contact" value={creatorsWithoutContact.toLocaleString()} />
            </div>
          </div>
        </section>

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
                        <option key={project.id} value={project.id}>
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
                      disabled={!activeProject}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Plus className="size-4" />
                      New
                    </button>
                    <button
                      onClick={() => setIsTemplateModalOpen(true)}
                      disabled={!activeProject}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Columns3 className="size-4" />
                      Edit
                    </button>
                    <button
                      onClick={() => setIsTemplateManagerOpen(true)}
                      disabled={!activeProject}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Pencil className="size-4" />
                      Manage
                    </button>
                    <button
                      onClick={resetTemplate}
                      disabled={!activeProject}
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
                    message={templateMessage}
                  />
                </>
              ) : (
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  Create campaigns in Campaign Profiles first. Sourcing templates attach to those
                  campaign records.
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
                    <p className="mt-1 truncate font-medium text-foreground">{sourceFileName}</p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                    <div>
                      <p className="font-medium uppercase text-muted-foreground">Creators Loaded</p>
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
            <Panel title="Preview" icon={Sparkles}>
              {activeFilterChips.length > 0 ? (
                <ActiveFilterChips chips={activeFilterChips} onClear={clearFilterChip} />
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">
                    {filteredCreators.length.toLocaleString()} of {creators.length.toLocaleString()}{" "}
                    creators match the current filters
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Preview shows only the columns from the selected sourcing template.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={enrichContacts}
                    disabled={
                      isEnrichingContacts || isProcessing || !activeProject || creators.length === 0
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
                      isProcessing || isEnrichingContacts || !activeProject || creators.length === 0
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

              {statusMessage && (
                <div className="mt-4 flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
                  <Check className="size-4 text-emerald-400" />
                  {statusMessage}
                </div>
              )}
              {copyMessage && (
                <div className="mt-3 rounded-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
                  {copyMessage}
                </div>
              )}
              {errorMessage && (
                <div className="mt-3 rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {errorMessage}
                </div>
              )}

              <PreviewMetrics
                imported={creators.length}
                filtered={filteredCreators.length}
                withContact={creatorsWithContact}
                withoutContact={creatorsWithoutContact}
              />

              {enrichmentReport ? <ContactEnrichmentReportPanel report={enrichmentReport} /> : null}

              {!previewReady ? (
                <div className="mt-4 rounded-md border border-dashed border-border bg-background px-4 py-4 text-sm text-muted-foreground">
                  Prepare Preview to open the Excel-style output table.
                </div>
              ) : null}
            </Panel>
          </div>
        </section>
      </main>

      {isTemplateModalOpen && activeProject ? (
        <TemplateEditorModal
          projectName={activeProject.name}
          templateName={draftTemplateName}
          template={template}
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
  onStay,
  onLeave,
}: {
  hasUnsavedTemplateChanges: boolean;
  onStay: () => void;
  onLeave: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Before leaving this campaign:
        </p>
        <h2 className="mt-3 text-lg font-semibold">
          {hasUnsavedTemplateChanges
            ? "You have unsaved template changes."
            : "Have you copied or downloaded everything you need?"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          The uploaded EasyKOL file and preview data will be cleared.
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
            Leave Campaign
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
                        disabled={selected}
                        className="inline-flex h-8 items-center rounded-md border border-border bg-card px-2.5 text-xs font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Select
                      </button>
                      <button
                        type="button"
                        onClick={() => onDuplicateTemplate(templateItem.id)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium transition hover:bg-accent"
                      >
                        <CopyPlus className="size-3.5" />
                        Duplicate
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteTemplate(templateItem.id)}
                        disabled={templates.length <= 1}
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
            disabled={template.length === 0}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save className="size-4" />
            Save Template
          </button>
          <button
            onClick={onSaveAsNew}
            disabled={template.length === 0}
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r border-border px-4 first:pl-0 last:border-r-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

function SmallMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
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

function valueInRange(value: unknown, range: { min: string; max: string }): boolean {
  const metric = parseMetric(value);
  if (metric == null) return false;
  const min = parseMetric(range.min);
  const max = parseMetric(range.max);
  if (min != null && metric < min) return false;
  if (max != null && metric > max) return false;
  return true;
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
  ranges: ReadonlyArray<{ label: string; min: string; max: string }>,
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

function filtersEqual(first: FilterSettings, second: FilterSettings): boolean {
  return (Object.keys(emptyFilters) as Array<keyof FilterSettings>).every((key) =>
    filterValueEqual(first[key], second[key]),
  );
}

function filterValueEqual(
  first: FilterSettings[keyof FilterSettings],
  second: FilterSettings[keyof FilterSettings],
) {
  if (Array.isArray(first) || Array.isArray(second)) {
    if (!Array.isArray(first) || !Array.isArray(second)) return false;
    if (first.length !== second.length) return false;
    return first.every((value, index) => value === second[index]);
  }
  return first === second;
}

function loadProjects(): SourcingProject[] {
  if (typeof window === "undefined") return [];
  const campaigns = loadCampaignRegistry().campaigns;
  const database = loadAppDatabase();
  const settings = new Map(
    database.worksheets.AppSettings.map((setting) => [setting.settingKey, setting.settingValue]),
  );
  const templatesByCampaign = groupSourcingTemplates(database.worksheets.SourcingTemplates);

  return campaigns.map((campaign) =>
    createProjectFromCampaign(campaign, templatesByCampaign.get(campaign.id) ?? [], settings),
  );
}

function saveProjects(projects: SourcingProject[]) {
  if (typeof window === "undefined") return;
  updateDatabase((database) => {
    const managedCampaignIds = new Set(projects.map((project) => project.id));
    const unmanagedTemplates = database.worksheets.SourcingTemplates.filter(
      (template) => !managedCampaignIds.has(template.campaignId),
    );

    database.worksheets.SourcingTemplates = [
      ...unmanagedTemplates,
      ...projects.flatMap((project) => project.templates.map(toSourcingTemplateRecord)),
    ];

    projects.forEach((project) => {
      upsertAppSetting(
        database.worksheets.AppSettings,
        `sourcing.activeTemplate.${project.id}`,
        project.activeTemplateId,
      );
      upsertAppSetting(
        database.worksheets.AppSettings,
        `sourcing.filters.${project.id}`,
        JSON.stringify(project.filters),
      );
    });
  });
}

function createProjectFromCampaign(
  campaign: GlobalCampaign,
  templates: SourcingTemplate[],
  settings: Map<string, string>,
): SourcingProject {
  const ensuredTemplates =
    templates.length > 0 ? templates : [createDefaultSourcingTemplate(campaign.id)];
  const activeTemplateId =
    settings.get(`sourcing.activeTemplate.${campaign.id}`) || ensuredTemplates[0]?.id || "";
  const filters = parseJsonSetting(settings.get(`sourcing.filters.${campaign.id}`));

  return activateProjectTemplate(
    {
      id: campaign.id,
      name: campaign.campaignName,
      createdAt: campaign.createdAt,
      filters: normalizeFilters(filters),
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
  records.forEach((record) => {
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
    id: record.templateId || createId("sourcing-template"),
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
    project.templates.length > 0 ? project.templates : [createDefaultSourcingTemplate(project.id)];
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

function toSourcingTemplateRecord(template: SourcingTemplate): SourcingTemplateRecord {
  return {
    templateId: template.id,
    campaignId: template.campaignId,
    templateName: template.templateName,
    columnsJson: JSON.stringify(template.columns),
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
}

function upsertAppSetting(settings: AppSettingRecord[], settingKey: string, settingValue: string) {
  const updatedAt = new Date().toISOString();
  const existing = settings.find((setting) => setting.settingKey === settingKey);
  if (existing) {
    existing.settingValue = settingValue;
    existing.updatedAt = updatedAt;
    return;
  }
  settings.push({ settingKey, settingValue, updatedAt });
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

  return value.map((item, index) => {
    const column = isRecord(item) ? item : {};
    const blockType = normalizeBlockType(column.blockType);
    const fieldKey = easyKolFields.includes(column.fieldKey as EasyKolField)
      ? (column.fieldKey as EasyKolField)
      : undefined;

    return {
      id: String(column.id || createId("column")),
      label: stringValue(column.label) || `Column ${index + 1}`,
      blockType: blockType === "field" && !fieldKey ? "blank" : blockType,
      fieldKey,
      customValue: stringValue(column.customValue),
    };
  });
}

function normalizeBlockType(value: unknown): TemplateBlockType {
  return value === "field" || value === "contacts" || value === "blank" || value === "custom"
    ? value
    : "blank";
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
