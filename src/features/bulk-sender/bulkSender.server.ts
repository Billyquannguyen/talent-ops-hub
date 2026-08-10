import crypto from "node:crypto";
import process from "node:process";

import {
  listAppSettingsInGoogleSheets,
  upsertAppSettingInGoogleSheets,
} from "@/storage/googleSheets.server";
import type { AppSettingRecord } from "@/storage/schema";
import type { BulkSenderDraftInput, BulkSenderJob, BulkSenderRowResult } from "./types";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;
const USER_COOLDOWN_MS = 10_000;
const MAX_BATCH_SIZE = 50;
const CONCURRENCY = 2;

let gmailTokenCache: { accessToken: string; expiresAt: number } | null = null;
let sharedQueue = Promise.resolve();

type SubmitInput = {
  workspaceId: string;
  idempotencyKey: string;
  drafts: BulkSenderDraftInput[];
};

type StoredDraftResult = BulkSenderRowResult & {
  rowId: string;
  fingerprint: string;
  createdAt: string;
};

export function getBulkSenderConfiguration() {
  const missing = [
    ["GMAIL_CLIENT_ID", process.env.GMAIL_CLIENT_ID],
    ["GMAIL_CLIENT_SECRET", process.env.GMAIL_CLIENT_SECRET],
    ["GMAIL_REFRESH_TOKEN", process.env.GMAIL_REFRESH_TOKEN],
  ]
    .filter(([, value]) => !String(value ?? "").trim())
    .map(([name]) => name);
  return { configured: missing.length === 0, missing };
}

export function isBulkSenderRequestAuthenticated(request: Request) {
  const expected = String(process.env.KATLAS_APP_PASSWORD ?? "").trim();
  const deployed = process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);
  if (!expected) return !deployed || process.env.NODE_ENV !== "production";
  const provided = request.headers.get("x-katlas-password") ?? "";
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  return (
    expectedBuffer.length === providedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, providedBuffer)
  );
}

export async function submitBulkSenderJob(input: SubmitInput): Promise<BulkSenderJob> {
  if (!input.workspaceId.trim() || !input.idempotencyKey.trim()) {
    throw new BulkSenderError("Workspace and submission IDs are required.", 400);
  }
  if (!input.drafts.length || input.drafts.length > MAX_BATCH_SIZE) {
    throw new BulkSenderError("A batch must contain between 1 and 50 drafts.", 400);
  }

  const existingSettings = await listBulkSenderSettings();
  const existingJob = findJobByIdempotencyKey(existingSettings, input.idempotencyKey);
  if (existingJob) return existingJob;

  const cooldown = parseSetting<{ submittedAt: string }>(
    existingSettings.find((record) => record.settingKey === userKey(input.workspaceId)),
  );
  if (cooldown && Date.now() - Date.parse(cooldown.submittedAt) < USER_COOLDOWN_MS) {
    const seconds = Math.ceil(
      (USER_COOLDOWN_MS - (Date.now() - Date.parse(cooldown.submittedAt))) / 1000,
    );
    throw new BulkSenderError(`Wait ${seconds} seconds before creating another batch.`, 429);
  }

  const now = new Date().toISOString();
  const job: BulkSenderJob = {
    id: `bulk-job-${crypto.randomUUID()}`,
    workspaceId: input.workspaceId,
    idempotencyKey: input.idempotencyKey,
    status: "queued",
    total: input.drafts.length,
    completed: 0,
    created: 0,
    skipped: 0,
    failed: 0,
    results: [],
    createdAt: now,
    updatedAt: now,
  };

  // Serialize new AppSettings rows so they never race for the same next row.
  await saveJsonSetting(jobKey(job.id), job);
  await saveJsonSetting(userKey(input.workspaceId), { submittedAt: now });

  const queued = sharedQueue.then(() => processJob(job, input.drafts));
  sharedQueue = queued.then(
    () => undefined,
    () => undefined,
  );
  return queued;
}

async function processJob(job: BulkSenderJob, drafts: BulkSenderDraftInput[]) {
  const processing: BulkSenderJob = {
    ...job,
    status: "processing",
    updatedAt: new Date().toISOString(),
  };
  await saveJsonSetting(jobKey(job.id), processing);

  try {
    const signature = await getDefaultGmailSignature();
    const recentResults = await listRecentSuccessfulResults();
    const resultByFingerprint = new Map(
      recentResults.map((result) => [result.fingerprint, result]),
    );
    const results: StoredDraftResult[] = new Array(drafts.length);
    let nextIndex = 0;

    async function worker() {
      while (nextIndex < drafts.length) {
        const index = nextIndex++;
        const draft = drafts[index];
        const fingerprint = draftFingerprint(draft);
        const prior = resultByFingerprint.get(fingerprint);

        if (prior) {
          results[index] = {
            rowId: draft.rowId,
            status: "skipped",
            message: "Skipped because an identical draft was created in the last 24 hours.",
            fingerprint,
            createdAt: new Date().toISOString(),
          };
          continue;
        }

        try {
          const draftId = await createGmailDraft(draft, signature);
          const result: StoredDraftResult = {
            rowId: draft.rowId,
            status: "created",
            message: "Gmail draft created.",
            draftId,
            fingerprint,
            createdAt: new Date().toISOString(),
          };
          results[index] = result;
          resultByFingerprint.set(fingerprint, result);
        } catch (error) {
          results[index] = {
            rowId: draft.rowId,
            status: "failed",
            message: error instanceof Error ? error.message : "Gmail draft creation failed.",
            fingerprint,
            createdAt: new Date().toISOString(),
          };
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, drafts.length) }, () => worker()));
    for (const result of results) {
      await saveJsonSetting(resultKey(job.id, result.rowId), result);
    }
    const created = results.filter((result) => result.status === "created").length;
    const skipped = results.filter((result) => result.status === "skipped").length;
    const failed = results.filter((result) => result.status === "failed").length;
    const finished: BulkSenderJob = {
      ...processing,
      status: failed === 0 ? "completed" : created + skipped > 0 ? "partially_failed" : "failed",
      completed: results.length,
      created,
      skipped,
      failed,
      results: results.map(
        ({ fingerprint: _fingerprint, createdAt: _createdAt, ...result }) => result,
      ),
      updatedAt: new Date().toISOString(),
    };
    await saveJsonSetting(jobKey(job.id), finished);
    return finished;
  } catch (error) {
    const failed: BulkSenderJob = {
      ...processing,
      status: "failed",
      failed: drafts.length,
      completed: drafts.length,
      results: drafts.map((draft) => ({
        rowId: draft.rowId,
        status: "failed",
        message: error instanceof Error ? error.message : "The draft batch failed.",
      })),
      updatedAt: new Date().toISOString(),
    };
    await saveJsonSetting(jobKey(job.id), failed);
    return failed;
  }
}

async function getDefaultGmailSignature() {
  const token = await getGmailAccessToken();
  const response = await fetch(`${GMAIL_API}/settings/sendAs`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(
      response.status === 403
        ? "Gmail settings permission is missing. Reconnect with gmail.settings.basic scope."
        : `Gmail signature could not be read (${response.status}).`,
    );
  }
  const payload = (await response.json()) as {
    sendAs?: Array<{ isDefault?: boolean; signature?: string }>;
  };
  return payload.sendAs?.find((entry) => entry.isDefault)?.signature ?? "";
}

async function createGmailDraft(draft: BulkSenderDraftInput, signature: string) {
  const token = await getGmailAccessToken();
  const boundary = `katlas_${crypto.randomBytes(12).toString("hex")}`;
  const subject = stripHeaderBreaks(draft.subject);
  const to = stripHeaderBreaks(draft.to);
  const htmlMessage = sanitizeEmailHtml(draft.html);
  const signatureHtml = sanitizeEmailHtml(signature);
  const html = `${htmlMessage}${signatureHtml ? `<div class="gmail_signature">${signatureHtml}</div>` : ""}`;
  const plainSignature = signatureHtml.replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]+>/g, "");
  const plain = `${draft.plainText.trim()}${plainSignature.trim() ? `\n\n${plainSignature.trim()}` : ""}`;
  const mime = [
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(Buffer.from(plain).toString("base64")),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(Buffer.from(html).toString("base64")),
    `--${boundary}--`,
  ].join("\r\n");
  const raw = Buffer.from(mime).toString("base64url");

  const response = await fetchWithRetry(`${GMAIL_API}/drafts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message: { raw } }),
  });
  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`Gmail rejected the draft (${response.status}): ${payload.slice(0, 180)}`);
  }
  const payload = (await response.json()) as { id?: string };
  if (!payload.id) throw new Error("Gmail created a draft without returning its ID.");
  return payload.id;
}

async function getGmailAccessToken() {
  if (gmailTokenCache && gmailTokenCache.expiresAt > Date.now() + 30_000) {
    return gmailTokenCache.accessToken;
  }
  const config = getBulkSenderConfiguration();
  if (!config.configured) {
    throw new Error(`Gmail is not configured. Missing: ${config.missing.join(", ")}.`);
  }
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: String(process.env.GMAIL_CLIENT_ID),
      client_secret: String(process.env.GMAIL_CLIENT_SECRET),
      refresh_token: String(process.env.GMAIL_REFRESH_TOKEN),
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) throw new Error(`Gmail authorization failed (${response.status}).`);
  const payload = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!payload.access_token) throw new Error("Gmail did not return an access token.");
  gmailTokenCache = {
    accessToken: payload.access_token,
    expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
  };
  return payload.access_token;
}

async function fetchWithRetry(url: string, init: RequestInit) {
  let response: Response | undefined;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    response = await fetch(url, init);
    if (response.status !== 429 && response.status < 500) return response;
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
  }
  return response as Response;
}

async function listBulkSenderSettings() {
  const result = await listAppSettingsInGoogleSheets();
  return result.records.filter((record) => record.settingKey.startsWith("bulk-sender:"));
}

async function listRecentSuccessfulResults() {
  const cutoff = Date.now() - DUPLICATE_WINDOW_MS;
  return (await listBulkSenderSettings())
    .filter((record) => record.settingKey.startsWith("bulk-sender:result:"))
    .map((record) => parseSetting<StoredDraftResult>(record))
    .filter(
      (result): result is StoredDraftResult =>
        Boolean(result) && result.status === "created" && Date.parse(result.createdAt) >= cutoff,
    );
}

function findJobByIdempotencyKey(settings: AppSettingRecord[], idempotencyKey: string) {
  for (const record of settings) {
    if (!record.settingKey.startsWith("bulk-sender:job:")) continue;
    const job = parseSetting<BulkSenderJob>(record);
    if (job?.idempotencyKey === idempotencyKey) return job;
  }
  return undefined;
}

async function saveJsonSetting(settingKey: string, value: unknown) {
  await upsertAppSettingInGoogleSheets({
    settingKey,
    settingValue: JSON.stringify(value),
    updatedAt: new Date().toISOString(),
  });
}

function parseSetting<T>(record?: AppSettingRecord): T | undefined {
  if (!record) return undefined;
  try {
    return JSON.parse(record.settingValue) as T;
  } catch {
    return undefined;
  }
}

function draftFingerprint(draft: BulkSenderDraftInput) {
  return crypto
    .createHash("sha256")
    .update(`${draft.to.trim().toLowerCase()}\n${draft.subject}\n${draft.html}`)
    .digest("hex");
}

function sanitizeEmailHtml(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript\s*:/gi, "");
}

function stripHeaderBreaks(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function wrapBase64(value: string) {
  return value.match(/.{1,76}/g)?.join("\r\n") ?? value;
}

function jobKey(id: string) {
  return `bulk-sender:job:${id}`;
}

function resultKey(jobId: string, rowId: string) {
  return `bulk-sender:result:${jobId}:${rowId}`;
}

function userKey(workspaceId: string) {
  return `bulk-sender:user:${workspaceId}`;
}

export class BulkSenderError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
  }
}
