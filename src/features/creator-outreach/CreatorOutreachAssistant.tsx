import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Database,
  FileInput,
  Languages,
  Library,
  Plus,
  Save,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { TopBar } from "@/components/TopBar";
import {
  createBlankProject,
  createCustomProjectField,
  createDefaultDatabase,
  loadKatlasBuddyDatabase,
  normalizeImportedTemplates,
  saveKatlasBuddyDatabase,
} from "./database";
import {
  applyTemplateFields,
  createBlankTemplate,
  createId,
  extractTemplateFields,
  slugFieldName,
} from "./messageComposer";
import { detectLanguage, getLanguageLabel, translateText } from "./translation";
import {
  channelTypes,
  creatorMessageSources,
  katlasBuddyDatabaseName,
  katlasBuddyWorksheetNames,
  outreachLanguages,
  projectFieldDefinitions,
  templateCategories,
  type ChannelType,
  type CreatorMessageSource,
  type KatlasBuddyDatabase,
  type OutreachLanguage,
  type OutreachProject,
  type OutreachProjectFields,
  type OutreachTemplate,
  type TemplateCategory,
} from "./types";

export function CreatorOutreachAssistant() {
  const [loaded, setLoaded] = useState(false);
  const [database, setDatabase] = useState<KatlasBuddyDatabase>(() => createDefaultDatabase());
  const [creatorMessage, setCreatorMessage] = useState("");
  const [creatorName, setCreatorName] = useState("");
  const [detectedLanguage, setDetectedLanguage] = useState<OutreachLanguage>("english");
  const [englishTranslation, setEnglishTranslation] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [replyEditor, setReplyEditor] = useState("");
  const [targetLanguage, setTargetLanguage] = useState<OutreachLanguage>("thai");
  const [translatedReply, setTranslatedReply] = useState("");
  const [isTemplateDrawerOpen, setIsTemplateDrawerOpen] = useState(false);
  const [isProjectVaultOpen, setIsProjectVaultOpen] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState("");
  const [templateDraft, setTemplateDraft] = useState<OutreachTemplate | null>(null);
  const [openTemplateCategories, setOpenTemplateCategories] = useState<TemplateCategory[]>([
    "Initial Outreach",
    "Rate Collection",
  ]);
  const [templateImportText, setTemplateImportText] = useState("");
  const [copyStatus, setCopyStatus] = useState("");

  const templates = database.worksheets.Templates;
  const projects = database.worksheets.Projects;
  const projectFieldsRows = database.worksheets.Project_Fields;
  const settings = database.worksheets.Settings;
  const activeProjectId = settings.activeProjectId || projects[0]?.id || "";
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? projects[0];
  const activeProjectFields =
    projectFieldsRows.find((fields) => fields.projectId === activeProject?.id) ??
    projectFieldsRows[0];
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId);
  const activeProjectLanguage = activeProject?.primaryLanguage ?? "english";
  const creatorSource = settings.defaultSource;

  const fieldButtons = useMemo(() => {
    const customFields =
      activeProjectFields?.customFields.map((field) => ({
        key: field.key,
        label: field.label,
      })) ?? [];

    return [
      { key: "creator_name", label: "Creator Name" },
      { key: "project_name", label: "Project Name" },
      ...projectFieldDefinitions,
      ...customFields,
    ];
  }, [activeProjectFields]);

  useEffect(() => {
    const loadedDatabase = loadKatlasBuddyDatabase();
    setDatabase(loadedDatabase);
    setSelectedTemplateId(loadedDatabase.worksheets.Templates[0]?.id ?? "");
    setEditingTemplateId(loadedDatabase.worksheets.Templates[0]?.id ?? "");
    setTargetLanguage(loadedDatabase.worksheets.Settings.defaultTargetLanguage);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    saveKatlasBuddyDatabase(database);
  }, [database, loaded]);

  useEffect(() => {
    if (!templates.length) return;
    if (selectedTemplateId && templates.some((template) => template.id === selectedTemplateId)) {
      return;
    }
    setSelectedTemplateId(templates[0].id);
  }, [selectedTemplateId, templates]);

  useEffect(() => {
    if (!editingTemplateId) {
      setTemplateDraft(null);
      return;
    }
    setTemplateDraft(templates.find((template) => template.id === editingTemplateId) ?? null);
  }, [editingTemplateId, templates]);

  useEffect(() => {
    const language = detectLanguage(creatorMessage);
    setDetectedLanguage(language);
    setTargetLanguage(language === "english" ? activeProjectLanguage : language);

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
  }, [activeProjectLanguage, creatorMessage]);

  useEffect(() => {
    if (!selectedTemplate || !activeProject || !activeProjectFields) {
      setReplyEditor("");
      return;
    }

    setReplyEditor(
      applyTemplateFields({
        template: selectedTemplate,
        project: activeProject,
        projectFields: activeProjectFields,
        creatorName,
      }),
    );
  }, [activeProject, activeProjectFields, creatorName, selectedTemplate]);

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

  function changeProject(projectId: string) {
    const project = projects.find((item) => item.id === projectId);
    updateSettings({
      activeProjectId: projectId,
      defaultTargetLanguage: project?.primaryLanguage ?? "english",
    });
    setTargetLanguage(project?.primaryLanguage ?? "english");
  }

  function createProject() {
    const { project, fields } = createBlankProject();
    const now = new Date().toISOString();
    setDatabase((current) => ({
      ...current,
      worksheets: {
        ...current.worksheets,
        Projects: [project, ...current.worksheets.Projects],
        Project_Fields: [fields, ...current.worksheets.Project_Fields],
        Settings: {
          ...current.worksheets.Settings,
          activeProjectId: project.id,
          defaultTargetLanguage: project.primaryLanguage,
          updatedAt: now,
        },
      },
    }));
    setTargetLanguage(project.primaryLanguage);
    setIsProjectVaultOpen(true);
  }

  function updateActiveProject(patch: Partial<OutreachProject>) {
    if (!activeProject) return;
    const now = new Date().toISOString();
    setDatabase((current) => ({
      ...current,
      worksheets: {
        ...current.worksheets,
        Projects: current.worksheets.Projects.map((project) =>
          project.id === activeProject.id ? { ...project, ...patch, updatedAt: now } : project,
        ),
      },
    }));
  }

  function updateActiveProjectFields(patch: Partial<OutreachProjectFields>) {
    if (!activeProjectFields) return;
    const now = new Date().toISOString();
    setDatabase((current) => ({
      ...current,
      worksheets: {
        ...current.worksheets,
        Project_Fields: current.worksheets.Project_Fields.map((fields) =>
          fields.id === activeProjectFields.id ? { ...fields, ...patch, updatedAt: now } : fields,
        ),
      },
    }));
  }

  function openTemplateLibrary(templateId = selectedTemplateId) {
    setEditingTemplateId(templateId || templates[0]?.id || "");
    setIsTemplateDrawerOpen(true);
  }

  function createTemplateDraft(category: TemplateCategory = "Initial Outreach") {
    const template = createBlankTemplate(category);
    setEditingTemplateId(template.id);
    setTemplateDraft(template);
    setIsTemplateDrawerOpen(true);
  }

  function saveTemplateDraft() {
    if (!templateDraft) return;
    const now = new Date().toISOString();
    const savedTemplate = {
      ...templateDraft,
      fields: extractTemplateFields(templateDraft.body),
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
    setEditingTemplateId(savedTemplate.id);
    setCopyStatus("Template saved.");
  }

  function duplicateTemplate(template: OutreachTemplate) {
    const now = new Date().toISOString();
    const copy = {
      ...template,
      id: createId("template"),
      templateName: `${template.templateName} Copy`,
      createdAt: now,
      updatedAt: now,
    };
    setDatabase((current) => ({
      ...current,
      worksheets: {
        ...current.worksheets,
        Templates: [copy, ...current.worksheets.Templates],
      },
    }));
    setSelectedTemplateId(copy.id);
    setEditingTemplateId(copy.id);
    setTemplateDraft(copy);
    setCopyStatus("Template duplicated.");
  }

  function deleteTemplate(templateId: string) {
    const confirmed =
      typeof window === "undefined" || window.confirm("Delete this template from Templates?");
    if (!confirmed) return;

    setDatabase((current) => ({
      ...current,
      worksheets: {
        ...current.worksheets,
        Templates: current.worksheets.Templates.filter((template) => template.id !== templateId),
      },
    }));
    const nextTemplate = templates.find((template) => template.id !== templateId);
    setSelectedTemplateId(nextTemplate?.id ?? "");
    setEditingTemplateId(nextTemplate?.id ?? "");
    setCopyStatus("Template deleted.");
  }

  function importTemplates(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const imported = normalizeImportedTemplates(JSON.parse(templateImportText));
      if (!imported.length) {
        setCopyStatus("No templates found in import.");
        return;
      }

      const existingIds = new Set(templates.map((template) => template.id));
      const safeImports = imported.map((template) =>
        existingIds.has(template.id) ? { ...template, id: createId("template") } : template,
      );

      setDatabase((current) => ({
        ...current,
        worksheets: {
          ...current.worksheets,
          Templates: [...safeImports, ...current.worksheets.Templates],
        },
      }));
      setSelectedTemplateId(safeImports[0].id);
      setEditingTemplateId(safeImports[0].id);
      setTemplateImportText("");
      setCopyStatus(
        `${safeImports.length} template${safeImports.length === 1 ? "" : "s"} imported.`,
      );
    } catch {
      setCopyStatus("Import failed. Use valid JSON.");
    }
  }

  function insertFieldIntoTemplate(fieldKey: string) {
    if (!templateDraft) return;
    const spacer = templateDraft.body.endsWith("\n") || !templateDraft.body ? "" : " ";
    setTemplateDraft({
      ...templateDraft,
      body: `${templateDraft.body}${spacer}{${fieldKey}}`,
    });
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

            <div className="grid gap-3 md:grid-cols-[260px_180px_auto_auto] md:items-end">
              <FieldLabel label="Current Campaign">
                <select
                  value={activeProjectId}
                  onChange={(event) => changeProject(event.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus:ring-2"
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.projectName}
                    </option>
                  ))}
                </select>
              </FieldLabel>
              <TextInput label="Creator Name" value={creatorName} onChange={setCreatorName} />
              <button
                onClick={() => openTemplateLibrary()}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium transition hover:bg-accent"
              >
                <Library className="size-4" />
                Templates
              </button>
              <button
                onClick={() => setIsProjectVaultOpen(true)}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium transition hover:bg-accent"
              >
                <BookOpen className="size-4" />
                Project Vault
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Database className="size-3.5" />
            <span>{katlasBuddyDatabaseName}</span>
            {katlasBuddyWorksheetNames.map((sheet) => (
              <span key={sheet} className="rounded-full border border-border px-2 py-1">
                {sheet}
              </span>
            ))}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Panel title="Creator Message" icon={Languages}>
            <div className="grid gap-3 md:grid-cols-2">
              <FieldLabel label="Source">
                <select
                  value={creatorSource}
                  onChange={(event) =>
                    updateSettings({ defaultSource: event.target.value as CreatorMessageSource })
                  }
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus:ring-2"
                >
                  {creatorMessageSources.map((source) => (
                    <option key={source} value={source}>
                      {source}
                    </option>
                  ))}
                </select>
              </FieldLabel>
              <div className="rounded-md border border-border bg-background px-3 py-2">
                <p className="text-xs text-muted-foreground">Auto Detect Language</p>
                <p className="mt-1 text-sm font-medium">{getLanguageLabel(detectedLanguage)}</p>
              </div>
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
            <div className="grid gap-3 md:grid-cols-[1fr_170px]">
              <FieldLabel label="Reply Template">
                <select
                  value={selectedTemplateId}
                  onChange={(event) => setSelectedTemplateId(event.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus:ring-2"
                >
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.templateName}
                    </option>
                  ))}
                </select>
              </FieldLabel>
              <FieldLabel label="Target Language">
                <LanguageSelect value={targetLanguage} onChange={setTargetLanguage} />
              </FieldLabel>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {selectedTemplate ? (
                <ChannelBadge channelType={selectedTemplate.channelType} />
              ) : null}
              <button
                onClick={() => openTemplateLibrary(selectedTemplateId)}
                className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-background px-2.5 text-xs font-medium transition hover:bg-accent"
              >
                <Settings className="size-3.5" />
                Manage Template
              </button>
              <button
                onClick={() => createTemplateDraft(selectedTemplate?.category)}
                className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-background px-2.5 text-xs font-medium transition hover:bg-accent"
              >
                <Plus className="size-3.5" />
                Create Template
              </button>
            </div>

            <div className="mt-3 grid min-h-[520px] gap-3 md:grid-cols-2">
              <FieldLabel label="Original Reply">
                <textarea
                  value={replyEditor}
                  onChange={(event) => setReplyEditor(event.target.value)}
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

      {isTemplateDrawerOpen ? (
        <TemplateDrawer
          templates={templates}
          selectedTemplateId={selectedTemplateId}
          editingTemplateId={editingTemplateId}
          templateDraft={templateDraft}
          openCategories={openTemplateCategories}
          fieldButtons={fieldButtons}
          importText={templateImportText}
          onSelectTemplate={(templateId) => {
            setSelectedTemplateId(templateId);
            setEditingTemplateId(templateId);
          }}
          onEditTemplate={setEditingTemplateId}
          onChangeDraft={setTemplateDraft}
          onToggleCategory={(category) => {
            setOpenTemplateCategories((current) =>
              current.includes(category)
                ? current.filter((item) => item !== category)
                : [...current, category],
            );
          }}
          onCreateTemplate={createTemplateDraft}
          onDuplicateTemplate={duplicateTemplate}
          onDeleteTemplate={deleteTemplate}
          onSaveTemplate={saveTemplateDraft}
          onInsertField={insertFieldIntoTemplate}
          onChangeImportText={setTemplateImportText}
          onImportTemplates={importTemplates}
          onClose={() => setIsTemplateDrawerOpen(false)}
        />
      ) : null}

      {isProjectVaultOpen && activeProject && activeProjectFields ? (
        <ProjectVaultModal
          project={activeProject}
          projectFields={activeProjectFields}
          onCreateProject={createProject}
          onChangeProject={updateActiveProject}
          onChangeProjectFields={updateActiveProjectFields}
          onClose={() => setIsProjectVaultOpen(false)}
        />
      ) : null}
    </div>
  );
}

function TemplateDrawer({
  templates,
  selectedTemplateId,
  editingTemplateId,
  templateDraft,
  openCategories,
  fieldButtons,
  importText,
  onSelectTemplate,
  onEditTemplate,
  onChangeDraft,
  onToggleCategory,
  onCreateTemplate,
  onDuplicateTemplate,
  onDeleteTemplate,
  onSaveTemplate,
  onInsertField,
  onChangeImportText,
  onImportTemplates,
  onClose,
}: {
  templates: OutreachTemplate[];
  selectedTemplateId: string;
  editingTemplateId: string;
  templateDraft: OutreachTemplate | null;
  openCategories: TemplateCategory[];
  fieldButtons: Array<{ key: string; label: string }>;
  importText: string;
  onSelectTemplate: (templateId: string) => void;
  onEditTemplate: (templateId: string) => void;
  onChangeDraft: (template: OutreachTemplate | null) => void;
  onToggleCategory: (category: TemplateCategory) => void;
  onCreateTemplate: (category?: TemplateCategory) => void;
  onDuplicateTemplate: (template: OutreachTemplate) => void;
  onDeleteTemplate: (templateId: string) => void;
  onSaveTemplate: () => void;
  onInsertField: (fieldKey: string) => void;
  onChangeImportText: (value: string) => void;
  onImportTemplates: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  const visibleFields = templateDraft ? extractTemplateFields(templateDraft.body) : [];

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm">
      <aside className="ml-auto flex h-full w-full max-w-5xl flex-col border-l border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border p-4">
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              Template Library
            </p>
            <h2 className="mt-1 text-xl font-semibold">Templates worksheet</h2>
          </div>
          <button
            onClick={onClose}
            className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-background transition hover:bg-accent"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[330px_1fr]">
          <div className="min-h-0 overflow-y-auto border-r border-border p-4">
            <button
              onClick={() => onCreateTemplate("Initial Outreach")}
              className="mb-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:opacity-90"
            >
              <Plus className="size-4" />
              Create Template
            </button>

            <div className="space-y-2">
              {templateCategories.map((category) => {
                const categoryTemplates = templates.filter(
                  (template) => template.category === category,
                );
                const isOpen = openCategories.includes(category);
                return (
                  <div key={category} className="rounded-lg border border-border bg-background">
                    <button
                      onClick={() => onToggleCategory(category)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium"
                    >
                      <span>{category}</span>
                      <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                        {categoryTemplates.length}
                        {isOpen ? (
                          <ChevronDown className="size-4" />
                        ) : (
                          <ChevronRight className="size-4" />
                        )}
                      </span>
                    </button>
                    {isOpen ? (
                      <div className="border-t border-border p-2">
                        {categoryTemplates.length ? (
                          categoryTemplates.map((template) => (
                            <button
                              key={template.id}
                              onClick={() => {
                                onSelectTemplate(template.id);
                                onEditTemplate(template.id);
                              }}
                              className={`mb-2 block w-full rounded-md border px-3 py-2 text-left text-xs transition last:mb-0 ${
                                template.id === editingTemplateId
                                  ? "border-foreground bg-card"
                                  : "border-border hover:bg-accent"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium">{template.templateName}</span>
                                {template.id === selectedTemplateId ? (
                                  <Check className="size-3.5" />
                                ) : null}
                              </div>
                              <div className="mt-2">
                                <ChannelBadge channelType={template.channelType} />
                              </div>
                            </button>
                          ))
                        ) : (
                          <p className="px-3 py-2 text-xs text-muted-foreground">
                            No templates yet.
                          </p>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <form onSubmit={onImportTemplates} className="mt-4 rounded-lg border border-border p-3">
              <p className="text-sm font-medium">Import Template Library</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Paste JSON with a Templates array or a direct array of templates.
              </p>
              <textarea
                value={importText}
                rows={5}
                onChange={(event) => onChangeImportText(event.target.value)}
                className="mt-3 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-xs leading-5 outline-none ring-ring focus:ring-2"
              />
              <button
                type="submit"
                className="mt-2 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-medium transition hover:bg-accent"
              >
                <FileInput className="size-3.5" />
                Import Library
              </button>
            </form>
          </div>

          <div className="min-h-0 overflow-y-auto p-4">
            {templateDraft ? (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <TextInput
                    label="Template Name"
                    value={templateDraft.templateName}
                    onChange={(templateName) => onChangeDraft({ ...templateDraft, templateName })}
                  />
                  <FieldLabel label="Category">
                    <select
                      value={templateDraft.category}
                      onChange={(event) =>
                        onChangeDraft({
                          ...templateDraft,
                          category: event.target.value as TemplateCategory,
                        })
                      }
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus:ring-2"
                    >
                      {templateCategories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </FieldLabel>
                  <FieldLabel label="Channel Type">
                    <select
                      value={templateDraft.channelType}
                      onChange={(event) =>
                        onChangeDraft({
                          ...templateDraft,
                          channelType: event.target.value as ChannelType,
                        })
                      }
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus:ring-2"
                    >
                      {channelTypes.map((channel) => (
                        <option key={channel} value={channel}>
                          {channel}
                        </option>
                      ))}
                    </select>
                  </FieldLabel>
                  <TextInput
                    label="Required Fields"
                    value={templateDraft.requiredFields.join(", ")}
                    onChange={(value) =>
                      onChangeDraft({
                        ...templateDraft,
                        requiredFields: splitCsv(value),
                      })
                    }
                  />
                </div>

                <div>
                  <p className="text-xs font-medium text-muted-foreground">Insert Field</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {fieldButtons.map((field) => (
                      <button
                        key={field.key}
                        onClick={() => onInsertField(field.key)}
                        className="rounded-full border border-border bg-background px-3 py-1 text-xs transition hover:bg-accent"
                      >
                        {field.label}
                      </button>
                    ))}
                  </div>
                </div>

                <FieldLabel label="Body">
                  <textarea
                    value={templateDraft.body}
                    rows={14}
                    onChange={(event) =>
                      onChangeDraft({
                        ...templateDraft,
                        body: event.target.value,
                        fields: extractTemplateFields(event.target.value),
                      })
                    }
                    className="w-full resize-y rounded-md border border-input bg-background px-3 py-3 text-sm leading-6 outline-none ring-ring focus:ring-2"
                  />
                </FieldLabel>

                <div>
                  <p className="text-xs font-medium text-muted-foreground">Fields</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {visibleFields.length ? (
                      visibleFields.map((field) => (
                        <span
                          key={field}
                          className="rounded-full border border-border bg-background px-3 py-1 text-xs"
                        >
                          {`{${field}}`}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">No fields inserted.</span>
                    )}
                  </div>
                </div>

                <FieldLabel label="Notes">
                  <textarea
                    value={templateDraft.notes}
                    rows={4}
                    onChange={(event) =>
                      onChangeDraft({ ...templateDraft, notes: event.target.value })
                    }
                    className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-6 outline-none ring-ring focus:ring-2"
                  />
                </FieldLabel>

                <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
                  <button
                    onClick={() => onDuplicateTemplate(templateDraft)}
                    className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium transition hover:bg-accent"
                  >
                    <Copy className="size-4" />
                    Duplicate Template
                  </button>
                  <button
                    onClick={() => onDeleteTemplate(templateDraft.id)}
                    className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium transition hover:bg-accent"
                  >
                    <Trash2 className="size-4" />
                    Delete Template
                  </button>
                  <button
                    onClick={onSaveTemplate}
                    className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:opacity-90"
                  >
                    <Save className="size-4" />
                    Save Template
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-background p-6 text-sm text-muted-foreground">
                Select or create a template.
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

function ProjectVaultModal({
  project,
  projectFields,
  onCreateProject,
  onChangeProject,
  onChangeProjectFields,
  onClose,
}: {
  project: OutreachProject;
  projectFields: OutreachProjectFields;
  onCreateProject: () => void;
  onChangeProject: (patch: Partial<OutreachProject>) => void;
  onChangeProjectFields: (patch: Partial<OutreachProjectFields>) => void;
  onClose: () => void;
}) {
  function updateCustomField(
    fieldId: string,
    patch: Partial<{ label: string; key: string; value: string }>,
  ) {
    onChangeProjectFields({
      customFields: projectFields.customFields.map((field) => {
        if (field.id !== fieldId) return field;
        const label = patch.label ?? field.label;
        return {
          ...field,
          ...patch,
          label,
          key: patch.key ?? (patch.label ? slugFieldName(label) : field.key),
        };
      }),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Project Vault</p>
            <h2 className="mt-1 text-xl font-semibold">Project_Fields worksheet</h2>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onCreateProject}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-medium transition hover:bg-accent"
            >
              <Plus className="size-3.5" />
              New Campaign
            </button>
            <button
              onClick={onClose}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-medium transition hover:bg-accent"
            >
              <X className="size-3.5" />
              Close
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[340px_1fr]">
          <section className="rounded-lg border border-border bg-background p-4">
            <h3 className="text-sm font-semibold">Project</h3>
            <div className="mt-4 space-y-3">
              <TextInput
                label="Project Name"
                value={project.projectName}
                onChange={(projectName) => onChangeProject({ projectName })}
              />
              <TextInput
                label="Brand Name"
                value={project.brandName}
                onChange={(brandName) => onChangeProject({ brandName })}
              />
              <TextInput
                label="Country"
                value={project.country}
                onChange={(country) => onChangeProject({ country })}
              />
              <FieldLabel label="Primary Language">
                <LanguageSelect
                  value={project.primaryLanguage}
                  onChange={(primaryLanguage) => onChangeProject({ primaryLanguage })}
                />
              </FieldLabel>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-background p-4">
            <h3 className="text-sm font-semibold">Reusable Campaign Information</h3>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <TextareaInput
                label="Deliverables"
                value={projectFields.deliverables}
                onChange={(deliverables) => onChangeProjectFields({ deliverables })}
              />
              <TextareaInput
                label="Talking Points"
                value={projectFields.talkingPoints}
                onChange={(talkingPoints) => onChangeProjectFields({ talkingPoints })}
              />
              <TextareaInput
                label="Usage Rights"
                value={projectFields.usageRights}
                onChange={(usageRights) => onChangeProjectFields({ usageRights })}
              />
              <TextareaInput
                label="Payment Terms"
                value={projectFields.paymentTerms}
                onChange={(paymentTerms) => onChangeProjectFields({ paymentTerms })}
              />
              <TextareaInput
                label="Campaign Brief"
                value={projectFields.campaignBrief}
                onChange={(campaignBrief) => onChangeProjectFields({ campaignBrief })}
              />
              <TextareaInput
                label="Reference Links"
                value={projectFields.referenceLinks}
                onChange={(referenceLinks) => onChangeProjectFields({ referenceLinks })}
              />
              <div className="md:col-span-2">
                <TextareaInput
                  label="Notes"
                  value={projectFields.notes}
                  onChange={(notes) => onChangeProjectFields({ notes })}
                />
              </div>
            </div>

            <div className="mt-5 border-t border-border pt-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">Custom Fields</h3>
                <button
                  onClick={() =>
                    onChangeProjectFields({
                      customFields: [
                        ...projectFields.customFields,
                        createCustomProjectField("Custom Field"),
                      ],
                    })
                  }
                  className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-card px-2.5 text-xs font-medium transition hover:bg-accent"
                >
                  <Plus className="size-3.5" />
                  Add Field
                </button>
              </div>

              <div className="mt-3 space-y-3">
                {projectFields.customFields.length ? (
                  projectFields.customFields.map((field) => (
                    <div
                      key={field.id}
                      className="grid gap-2 rounded-lg border border-border p-3 md:grid-cols-[1fr_1fr_2fr_auto]"
                    >
                      <TextInput
                        label="Label"
                        value={field.label}
                        onChange={(label) => updateCustomField(field.id, { label })}
                      />
                      <TextInput
                        label="Field Key"
                        value={field.key}
                        onChange={(key) => updateCustomField(field.id, { key })}
                      />
                      <TextInput
                        label="Value"
                        value={field.value}
                        onChange={(value) => updateCustomField(field.id, { value })}
                      />
                      <div className="flex items-end">
                        <button
                          onClick={() =>
                            onChangeProjectFields({
                              customFields: projectFields.customFields.filter(
                                (customField) => customField.id !== field.id,
                              ),
                            })
                          }
                          className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-card px-3 text-xs font-medium transition hover:bg-accent"
                        >
                          <Trash2 className="size-3.5" />
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                    No custom fields yet.
                  </p>
                )}
              </div>
            </div>
          </section>
        </div>
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
    <section className="rounded-xl border border-border bg-card p-4">
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

function TextareaInput({
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
      <textarea
        value={value}
        rows={5}
        onChange={(event) => onChange(event.target.value)}
        className="w-full resize-y rounded-md border border-input bg-card px-3 py-2 text-sm leading-6 outline-none ring-ring focus:ring-2"
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

function ChannelBadge({ channelType }: { channelType: ChannelType }) {
  return (
    <span className="inline-flex rounded-full border border-border bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground">
      {channelType}
    </span>
  );
}

function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
