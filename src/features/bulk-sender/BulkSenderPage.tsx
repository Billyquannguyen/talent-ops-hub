import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronLeft,
  ChevronRight,
  Eraser,
  Image,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Mail,
  Maximize2,
  Minimize2,
  Palette,
  Plus,
  Redo2,
  Send,
  Trash2,
  Underline,
  Undo2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type ReactNode } from "react";

import { TopBar } from "@/components/TopBar";
import { getPasswordGateCredential } from "@/lib/passwordGate";
import {
  BULK_SENDER_WORKSPACE_ID_KEY,
  BULK_SENDER_WORKSPACE_KEY,
  columnVariable,
  createDefaultWorkspace,
  createEmptyRow,
  createId,
  getDuplicateEmails,
  getRowIssue,
  htmlToPlainText,
  parseClipboardGrid,
  personalizeTemplate,
  rowHasContent,
} from "./bulkSender";
import type {
  BulkSenderDraftInput,
  BulkSenderJob,
  BulkSenderRow,
  BulkSenderWorkspace,
} from "./types";

type Props = { pageSwitcher: ReactNode };
type FocusTarget = "subject" | "body";

export function BulkSenderPage({ pageSwitcher }: Props) {
  const [workspace, setWorkspace] = useState<BulkSenderWorkspace | null>(null);
  const [workspaceId, setWorkspaceId] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [previewRowId, setPreviewRowId] = useState("");
  const [focusTarget, setFocusTarget] = useState<FocusTarget>("body");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [mailConfigured, setMailConfigured] = useState<boolean | null>(null);
  const [mailProvider, setMailProvider] = useState<"Outlook" | "Gmail">("Outlook");
  const [signatureConfigured, setSignatureConfigured] = useState(false);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const subjectRef = useRef<HTMLInputElement | null>(null);
  const workspaceBodyHtml = workspace?.bodyHtml;

  useEffect(() => {
    const saved = window.localStorage.getItem(BULK_SENDER_WORKSPACE_KEY);
    let next = createDefaultWorkspace();
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as BulkSenderWorkspace;
        if (parsed.columns?.length && parsed.rows?.length) next = parsed;
      } catch {
        // A damaged browser snapshot should not block the page.
      }
    }
    let id = window.localStorage.getItem(BULK_SENDER_WORKSPACE_ID_KEY);
    if (!id) {
      id = createId("workspace");
      window.localStorage.setItem(BULK_SENDER_WORKSPACE_ID_KEY, id);
    }
    setWorkspace(next);
    setWorkspaceId(id);
    setPreviewRowId(next.rows.find(rowHasContent)?.id ?? next.rows[0]?.id ?? "");

    void fetch("/api/bulk-sender", {
      headers: { "x-katlas-password": getPasswordGateCredential() },
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          ok?: boolean;
          configured?: boolean;
          provider?: "outlook" | "gmail";
          signatureConfigured?: boolean;
        };
        const provider = payload.provider === "gmail" ? "Gmail" : "Outlook";
        const configured = Boolean(response.ok && payload.ok && payload.configured);
        setMailProvider(provider);
        setSignatureConfigured(Boolean(payload.signatureConfigured));
        setMailConfigured(configured);
        if (!configured) {
          setStatusMessage(
            `${provider} is not connected yet. Add the server-only ${provider} credentials before creating drafts.`,
          );
        }
      })
      .catch(() => {
        setMailConfigured(false);
        setStatusMessage("Email connection status could not be checked.");
      });
  }, []);

  useEffect(() => {
    if (!workspace) return;
    const timeout = window.setTimeout(() => {
      window.localStorage.setItem(
        BULK_SENDER_WORKSPACE_KEY,
        JSON.stringify({ ...workspace, updatedAt: new Date().toISOString() }),
      );
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [workspace]);

  useEffect(() => {
    if (workspaceBodyHtml === undefined || !editorRef.current) return;
    if (editorRef.current.innerHTML !== workspaceBodyHtml) {
      editorRef.current.innerHTML = workspaceBodyHtml;
    }
  }, [workspaceBodyHtml]);

  const duplicateEmails = useMemo(
    () =>
      workspace ? getDuplicateEmails(workspace.rows, workspace.emailColumnId) : new Set<string>(),
    [workspace],
  );
  const populatedRows = workspace?.rows.filter(rowHasContent) ?? [];
  const actionableRows = populatedRows.filter(
    (row) =>
      !getRowIssue(row, workspace?.emailColumnId ?? "", duplicateEmails) &&
      row.result?.status !== "created" &&
      row.result?.status !== "skipped",
  );
  const attentionRows = populatedRows.filter((row) =>
    getRowIssue(row, workspace?.emailColumnId ?? "", duplicateEmails),
  );
  const createdCount = populatedRows.filter((row) => row.result?.status === "created").length;
  const skippedCount = populatedRows.filter((row) => row.result?.status === "skipped").length;
  const failedCount = populatedRows.filter((row) => row.result?.status === "failed").length;
  const batchRows = actionableRows.slice(0, 50);
  const previewRow =
    workspace?.rows.find((row) => row.id === previewRowId) ??
    populatedRows[0] ??
    workspace?.rows[0];

  function updateWorkspace(update: (current: BulkSenderWorkspace) => BulkSenderWorkspace) {
    setWorkspace((current) => (current ? update(current) : current));
  }

  function updateCell(rowId: string, columnId: string, value: string) {
    updateWorkspace((current) => ({
      ...current,
      rows: current.rows.map((row) =>
        row.id === rowId
          ? { ...row, values: { ...row.values, [columnId]: value }, result: undefined }
          : row,
      ),
    }));
  }

  function handlePaste(
    event: ClipboardEvent<HTMLInputElement>,
    startRowIndex: number,
    startColumnIndex: number,
  ) {
    const text = event.clipboardData.getData("text/plain");
    if (!text.includes("\t") && !text.includes("\n")) return;
    event.preventDefault();
    const pasted = parseClipboardGrid(text);
    if (!pasted.length) return;

    updateWorkspace((current) => {
      const requiredColumns = startColumnIndex + Math.max(...pasted.map((row) => row.length));
      const columns = [...current.columns];
      while (columns.length < requiredColumns) {
        columns.push({ id: createId("column"), name: `Column ${columns.length + 1}` });
      }
      const requiredRows = startRowIndex + pasted.length;
      const rows = current.rows.map((row) => ({
        ...row,
        values: { ...Object.fromEntries(columns.map((column) => [column.id, ""])), ...row.values },
      }));
      while (rows.length < requiredRows) rows.push(createEmptyRow(columns));
      pasted.forEach((cells, rowOffset) => {
        const row = rows[startRowIndex + rowOffset];
        cells.forEach((cell, columnOffset) => {
          row.values[columns[startColumnIndex + columnOffset].id] = cell;
        });
        row.result = undefined;
      });
      return { ...current, columns, rows };
    });
    setStatusMessage(
      `Pasted ${pasted.length.toLocaleString()} row${pasted.length === 1 ? "" : "s"}.`,
    );
  }

  function addColumn() {
    updateWorkspace((current) => {
      const column = { id: createId("column"), name: `Column ${current.columns.length + 1}` };
      return {
        ...current,
        columns: [...current.columns, column],
        rows: current.rows.map((row) => ({
          ...row,
          values: { ...row.values, [column.id]: "" },
        })),
      };
    });
  }

  function renameColumn(columnId: string, name: string) {
    updateWorkspace((current) => ({
      ...current,
      columns: current.columns.map((column) =>
        column.id === columnId ? { ...column, name } : column,
      ),
    }));
  }

  function moveColumn(columnId: string, direction: -1 | 1) {
    updateWorkspace((current) => {
      const columns = [...current.columns];
      const index = columns.findIndex((column) => column.id === columnId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= columns.length) return current;
      [columns[index], columns[target]] = [columns[target], columns[index]];
      return { ...current, columns };
    });
  }

  function deleteColumn(columnId: string) {
    updateWorkspace((current) => {
      if (current.columns.length === 1) return current;
      return {
        ...current,
        columns: current.columns.filter((column) => column.id !== columnId),
        rows: current.rows.map((row) => {
          const values = { ...row.values };
          delete values[columnId];
          return { ...row, values, result: undefined };
        }),
        emailColumnId: current.emailColumnId === columnId ? "" : current.emailColumnId,
      };
    });
  }

  function insertVariable(variable: string) {
    if (!workspace) return;
    if (focusTarget === "subject" && subjectRef.current) {
      const input = subjectRef.current;
      const start = input.selectionStart ?? workspace.subject.length;
      const end = input.selectionEnd ?? start;
      const subject = `${workspace.subject.slice(0, start)}${variable}${workspace.subject.slice(end)}`;
      updateWorkspace((current) => ({ ...current, subject }));
      window.requestAnimationFrame(() => {
        input.focus();
        input.setSelectionRange(start + variable.length, start + variable.length);
      });
      return;
    }
    editorRef.current?.focus();
    document.execCommand("insertText", false, variable);
    syncEditor();
  }

  function runEditorCommand(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    syncEditor();
  }

  function syncEditor() {
    const html = editorRef.current?.innerHTML ?? "";
    updateWorkspace((current) => ({ ...current, bodyHtml: html }));
  }

  function insertLink() {
    const url = window.prompt("Paste the link URL");
    if (url) runEditorCommand("createLink", url);
  }

  function insertImage() {
    const url = window.prompt("Paste the public image URL");
    if (url) runEditorCommand("insertImage", url);
  }

  async function submitBatch() {
    if (!workspace || !workspaceId || !batchRows.length) return;
    setConfirmOpen(false);
    setSubmitting(true);
    setStatusMessage(
      `Creating ${mailProvider} drafts. Keep this page open until the batch finishes...`,
    );
    const drafts: BulkSenderDraftInput[] = batchRows.map((row) => {
      const html = personalizeTemplate(workspace.bodyHtml, workspace.columns, row);
      return {
        rowId: row.id,
        to: row.values[workspace.emailColumnId].trim(),
        subject: personalizeTemplate(workspace.subject, workspace.columns, row),
        html,
        plainText: htmlToPlainText(html),
      };
    });
    try {
      const response = await fetch("/api/bulk-sender", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-katlas-password": getPasswordGateCredential(),
        },
        body: JSON.stringify({
          workspaceId,
          idempotencyKey: createId("submission"),
          drafts,
        }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        job?: BulkSenderJob;
        error?: string;
      };
      if (!response.ok || !payload.ok || !payload.job) {
        throw new Error(payload.error || "The draft batch failed.");
      }
      const resultMap = new Map(payload.job.results.map((result) => [result.rowId, result]));
      updateWorkspace((current) => ({
        ...current,
        rows: current.rows.map((row) => ({ ...row, result: resultMap.get(row.id) ?? row.result })),
      }));
      setStatusMessage(
        `${payload.job.created} created, ${payload.job.skipped} skipped, ${payload.job.failed} failed. Review every draft in ${mailProvider} before sending.`,
      );
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "The draft batch failed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!workspace) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <TopBar />
        <main className="katlas-page py-5 text-sm text-muted-foreground">
          Loading Bulk Sender...
        </main>
      </div>
    );
  }

  const previewSubject = previewRow
    ? personalizeTemplate(workspace.subject, workspace.columns, previewRow)
    : workspace.subject;
  const previewHtml = previewRow
    ? personalizeTemplate(workspace.bodyHtml, workspace.columns, previewRow)
    : workspace.bodyHtml;

  return (
    <div className="relative min-h-screen overflow-hidden bg-background pb-28 text-foreground">
      <TopBar />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[320px] bg-hero-glow" />
      <main className="katlas-page gap-4 py-5">
        <section className="katlas-hero-panel p-4 md:p-5">
          <div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Creator Outreach Assistant
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight">Bulk Sender</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Paste recipients, personalize one template, and create review-ready {mailProvider}
                drafts.
              </p>
              <div className="mt-4">{pageSwitcher}</div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card/80 shadow-sm">
          <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Mail className="size-4 text-primary" /> Recipients
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Paste cells from Google Sheets or Excel. Rows and columns expand automatically.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <CountPill label={`${populatedRows.length} rows`} />
              <CountPill label={`${actionableRows.length} ready`} tone="success" />
              {attentionRows.length ? (
                <CountPill label={`${attentionRows.length} need attention`} tone="warning" />
              ) : null}
              {createdCount ? <CountPill label={`${createdCount} created`} tone="success" /> : null}
              {skippedCount ? <CountPill label={`${skippedCount} skipped`} /> : null}
              {failedCount ? <CountPill label={`${failedCount} failed`} tone="warning" /> : null}
              <button
                type="button"
                onClick={addColumn}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-3 font-medium transition hover:bg-accent"
              >
                <Plus className="size-3.5" /> Add column
              </button>
              <button
                type="button"
                onClick={() => setExpanded((current) => !current)}
                title={expanded ? "Collapse grid" : "Expand grid"}
                className="grid size-9 place-items-center rounded-md border border-border bg-background transition hover:bg-accent"
              >
                {expanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
              </button>
            </div>
          </div>

          <div className={`overflow-auto bg-background/55 ${expanded ? "h-[70vh]" : "h-[420px]"}`}>
            <table className="min-w-max border-separate border-spacing-0 text-sm">
              <thead className="sticky top-0 z-20 bg-card">
                <tr>
                  <th className="sticky left-0 z-30 w-12 border-b border-r border-border bg-card px-2 text-center text-xs text-muted-foreground">
                    #
                  </th>
                  {workspace.columns.map((column, columnIndex) => (
                    <th
                      key={column.id}
                      className="min-w-64 border-b border-r border-border bg-card p-0 text-left align-top"
                    >
                      <div className="flex items-center gap-1 px-2 pt-2">
                        <input
                          aria-label={`Rename ${column.name}`}
                          value={column.name}
                          onChange={(event) => renameColumn(column.id, event.target.value)}
                          className="min-w-0 flex-1 bg-transparent px-1 py-1 text-sm font-semibold outline-none focus:ring-1 focus:ring-ring"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            updateWorkspace((current) => ({ ...current, emailColumnId: column.id }))
                          }
                          title="Use as recipient email column"
                          className={`grid size-7 place-items-center rounded-md transition ${
                            workspace.emailColumnId === column.id
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:bg-accent hover:text-foreground"
                          }`}
                        >
                          <Mail className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={columnIndex === 0}
                          onClick={() => moveColumn(column.id, -1)}
                          title="Move column left"
                          className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent disabled:opacity-30"
                        >
                          <ChevronLeft className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={columnIndex === workspace.columns.length - 1}
                          onClick={() => moveColumn(column.id, 1)}
                          title="Move column right"
                          className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent disabled:opacity-30"
                        >
                          <ChevronRight className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={workspace.columns.length === 1}
                          onClick={() => deleteColumn(column.id)}
                          title="Delete column"
                          className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-destructive/15 hover:text-destructive disabled:opacity-30"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                      <div className="px-3 pb-2 font-mono text-[11px] font-normal text-muted-foreground">
                        {columnVariable(column.name)}
                      </div>
                    </th>
                  ))}
                  <th className="w-40 border-b border-border bg-card px-3 text-xs font-medium text-muted-foreground">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {workspace.rows.map((row, rowIndex) => {
                  const issue = getRowIssue(row, workspace.emailColumnId, duplicateEmails);
                  return (
                    <tr key={row.id} className={issue && issue !== "blank" ? "bg-amber-500/5" : ""}>
                      <th className="sticky left-0 z-10 border-b border-r border-border bg-card px-2 text-center text-xs font-normal text-muted-foreground">
                        {rowIndex + 1}
                      </th>
                      {workspace.columns.map((column, columnIndex) => (
                        <td key={column.id} className="border-b border-r border-border p-0">
                          <input
                            aria-label={`${column.name}, row ${rowIndex + 1}`}
                            value={row.values[column.id] ?? ""}
                            onChange={(event) => updateCell(row.id, column.id, event.target.value)}
                            onPaste={(event) => handlePaste(event, rowIndex, columnIndex)}
                            className="h-11 w-full min-w-64 bg-transparent px-3 outline-none focus:bg-accent/40 focus:ring-2 focus:ring-inset focus:ring-ring"
                          />
                        </td>
                      ))}
                      <td className="border-b border-border px-3 text-xs">
                        <RowStatus issue={issue} result={row.result} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border p-3">
            <button
              type="button"
              onClick={() =>
                updateWorkspace((current) => ({
                  ...current,
                  rows: [
                    ...current.rows,
                    ...Array.from({ length: 5 }, () => createEmptyRow(current.columns)),
                  ],
                }))
              }
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium transition hover:bg-accent"
            >
              <Plus className="size-3.5" /> Add 5 rows
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card/80 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Send className="size-4 text-primary" /> Email template
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Fields are matched to every row.{" "}
            {signatureConfigured
              ? `Your configured ${mailProvider} signature is appended automatically.`
              : `${mailProvider} drafts are created without an automatic signature.`}
          </p>

          <label className="mt-4 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Subject
            <input
              ref={subjectRef}
              value={workspace.subject}
              onFocus={() => setFocusTarget("subject")}
              onChange={(event) =>
                updateWorkspace((current) => ({ ...current, subject: event.target.value }))
              }
              className="mt-2 h-11 w-full rounded-md border border-input bg-background px-3 text-sm font-normal normal-case tracking-normal outline-none ring-ring focus:ring-2"
            />
          </label>

          <div className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Message
          </div>
          <div className="mt-2 overflow-hidden rounded-lg border border-input bg-background">
            <RichTextToolbar
              onCommand={runEditorCommand}
              onLink={insertLink}
              onImage={insertImage}
            />
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              role="textbox"
              aria-label="Email message"
              aria-multiline="true"
              onFocus={() => setFocusTarget("body")}
              onInput={syncEditor}
              className="min-h-56 px-4 py-3 text-sm leading-6 outline-none [&_img]:max-w-full [&_a]:text-primary [&_a]:underline"
            />
          </div>

          <div className="mt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Insert a field
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {workspace.columns.map((column) => (
                <button
                  key={column.id}
                  type="button"
                  onClick={() => insertVariable(columnVariable(column.name))}
                  className="rounded-full border border-border bg-background px-3 py-1.5 font-mono text-xs transition hover:bg-accent"
                >
                  {columnVariable(column.name)}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card/80 p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold">Preview</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Review personalization one row at a time.
              </p>
            </div>
            <select
              aria-label="Preview recipient"
              value={previewRow?.id ?? ""}
              onChange={(event) => setPreviewRowId(event.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus:ring-2"
            >
              {populatedRows.length ? (
                populatedRows.map((row, index) => (
                  <option key={row.id} value={row.id}>
                    Row {workspace.rows.indexOf(row) + 1}:{" "}
                    {row.values[workspace.emailColumnId] || "No email"}
                  </option>
                ))
              ) : (
                <option value={workspace.rows[0]?.id}>Row 1</option>
              )}
            </select>
          </div>
          <div className="mt-4 rounded-lg border border-border bg-background p-4">
            <p className="border-b border-border pb-3 text-sm font-semibold">
              {previewSubject || "No subject"}
            </p>
            <iframe
              title="Email preview"
              sandbox=""
              srcDoc={`<!doctype html><html><body style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#1f2937;margin:0;padding:16px">${previewHtml}</body></html>`}
              className="mt-2 h-64 w-full bg-white"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {signatureConfigured
                ? `${mailProvider} signature is added on the server and is not shown in this preview.`
                : `No ${mailProvider} signature is configured.`}
            </p>
          </div>
        </section>
      </main>

      <div className="fixed inset-x-0 bottom-4 z-40 px-4">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 rounded-xl border border-border bg-[#0a0f1a]/95 px-4 py-3 text-white shadow-2xl backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">
              {batchRows.length
                ? `${batchRows.length} recipients ready for this batch`
                : "Add valid recipient rows to begin"}
            </p>
            <p className="mt-0.5 text-xs text-white/60">
              {statusMessage ||
                `Every draft opens in ${mailProvider} for manual review. Nothing is sent automatically.`}
            </p>
          </div>
          <button
            type="button"
            disabled={
              submitting ||
              !batchRows.length ||
              !workspace.emailColumnId ||
              !workspace.subject.trim() ||
              !htmlToPlainText(workspace.bodyHtml) ||
              mailConfigured === false
            }
            onClick={() => setConfirmOpen(true)}
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Send className="size-4" />
            {submitting ? "Creating drafts..." : `Create ${batchRows.length} email drafts`}
          </button>
        </div>
      </div>

      {confirmOpen ? (
        <ConfirmationDialog
          count={batchRows.length}
          provider={mailProvider}
          onBack={() => setConfirmOpen(false)}
          onCreate={() => void submitBatch()}
        />
      ) : null}
    </div>
  );
}

function CountPill({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "success" | "warning";
}) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 font-medium ${
        tone === "success"
          ? "bg-emerald-500/15 text-emerald-400"
          : tone === "warning"
            ? "bg-amber-500/15 text-amber-400"
            : "bg-accent text-muted-foreground"
      }`}
    >
      {label}
    </span>
  );
}

function RowStatus({
  issue,
  result,
}: {
  issue: "blank" | "missing" | "invalid" | "duplicate" | null;
  result?: BulkSenderRow["result"];
}) {
  if (result) {
    const color =
      result.status === "created"
        ? "text-emerald-400"
        : result.status === "skipped"
          ? "text-sky-400"
          : "text-red-400";
    return (
      <span className={color} title={result.message}>
        {result.status}
      </span>
    );
  }
  if (!issue) return <span className="text-emerald-400">Ready</span>;
  if (issue === "blank") return <span className="text-muted-foreground">Blank</span>;
  return (
    <span className="text-amber-400">
      {issue === "missing" ? "Missing email" : `${issue[0].toUpperCase()}${issue.slice(1)} email`}
    </span>
  );
}

function ToolbarButton({
  label,
  children,
  onClick,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="grid size-8 place-items-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  );
}

function RichTextToolbar({
  onCommand,
  onLink,
  onImage,
}: {
  onCommand: (command: string, value?: string) => void;
  onLink: () => void;
  onImage: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-card/70 p-2">
      <ToolbarButton label="Undo" onClick={() => onCommand("undo")}>
        <Undo2 className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Redo" onClick={() => onCommand("redo")}>
        <Redo2 className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Bold" onClick={() => onCommand("bold")}>
        <Bold className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Italic" onClick={() => onCommand("italic")}>
        <Italic className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Underline" onClick={() => onCommand("underline")}>
        <Underline className="size-4" />
      </ToolbarButton>
      <label
        title="Text color"
        className="relative grid size-8 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Palette className="size-4" />
        <input
          type="color"
          className="absolute inset-0 cursor-pointer opacity-0"
          onChange={(event) => onCommand("foreColor", event.target.value)}
        />
      </label>
      <ToolbarButton label="Link" onClick={onLink}>
        <LinkIcon className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Image" onClick={onImage}>
        <Image className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Bulleted list" onClick={() => onCommand("insertUnorderedList")}>
        <List className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Numbered list" onClick={() => onCommand("insertOrderedList")}>
        <ListOrdered className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Align left" onClick={() => onCommand("justifyLeft")}>
        <AlignLeft className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Align center" onClick={() => onCommand("justifyCenter")}>
        <AlignCenter className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Align right" onClick={() => onCommand("justifyRight")}>
        <AlignRight className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Decrease indent" onClick={() => onCommand("outdent")}>
        <IndentDecrease className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Increase indent" onClick={() => onCommand("indent")}>
        <IndentIncrease className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Clear formatting" onClick={() => onCommand("removeFormat")}>
        <Eraser className="size-4" />
      </ToolbarButton>
    </div>
  );
}

function ConfirmationDialog({
  count,
  provider,
  onBack,
  onCreate,
}: {
  count: number;
  provider: "Outlook" | "Gmail";
  onBack: () => void;
  onCreate: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-confirm-title"
        className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-2xl"
      >
        <h2 id="bulk-confirm-title" className="text-lg font-semibold">
          Check the batch before creating drafts
        </h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Make sure to check that the rows align and read through the drafts before sending.
        </p>
        <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          Any bulk errors will result in restrictions on tool usage.
        </div>
        <p className="mt-4 text-sm font-medium">Nothing will be sent automatically.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          This batch will create {count} {provider} draft{count === 1 ? "" : "s"}.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onBack}
            className="h-10 rounded-md border border-border bg-background px-4 text-sm font-medium transition hover:bg-accent"
          >
            Back
          </button>
          <button
            type="button"
            onClick={onCreate}
            className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
