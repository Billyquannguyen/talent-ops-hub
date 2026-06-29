import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { createAIService, type ContactExtractionResponse } from "@/services/ai/aiService.server";
import { AIConfigurationError, AIProviderError } from "@/services/ai/types";

const creatorSchema = z.object({
  creatorId: z.string(),
  data: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()]).optional()),
});

const enrichContactsRequestSchema = z.object({
  creators: z.array(creatorSchema),
  maxCreators: z.number().int().min(1).max(10).optional(),
  dryRun: z.boolean().optional(),
});

type CreatorInput = z.infer<typeof creatorSchema>;

type EnrichedCreatorResult = {
  creatorId: string;
  contactsText: string;
  contacts: ContactExtractionResponse["contacts"];
  confidence: ContactExtractionResponse["confidence"];
  source: string;
  reasoning: string;
  sourcesChecked: string[];
  warnings: string[];
  modelUsed: string;
};

export const Route = createFileRoute("/api/ai/enrich-contacts")({
  server: {
    handlers: {
      GET: async () => {
        return Response.json({
          ok: true,
          provider: "openrouter",
          configured: Boolean(String(process.env.OPENROUTER_API_KEY ?? "").trim()),
        });
      },
      POST: async ({ request }) => {
        try {
          const body = enrichContactsRequestSchema.parse(await request.json());
          const maxCreators = Math.min(body.maxCreators ?? 10, 10);
          const selectedCreators = body.creators.slice(0, maxCreators);
          const service = createAIService();
          const results: EnrichedCreatorResult[] = [];

          for (const creator of selectedCreators) {
            try {
              const collected = await collectCreatorContactSourceText(creator);

              if (body.dryRun) {
                results.push({
                  creatorId: creator.creatorId,
                  contactsText: "Contacts: Not found",
                  contacts: createEmptyContacts(),
                  confidence: "low",
                  source: "Dry run",
                  reasoning: "Dry run requested. No AI extraction was performed.",
                  sourcesChecked: collected.sourcesChecked,
                  warnings: collected.warnings,
                  modelUsed: "",
                });
                continue;
              }

              const extraction = await service.extractContacts({
                creatorIdentifier: getCreatorIdentifier(creator),
                sourceText: collected.sourceText,
                sourcesChecked: collected.sourcesChecked,
              });
              const contacts = normalizeContacts(extraction.data.contacts);

              results.push({
                creatorId: creator.creatorId,
                contactsText: formatContactsText(contacts),
                contacts,
                confidence: extraction.data.confidence || "low",
                source: extraction.data.source || collected.sourcesChecked.join(", "),
                reasoning: extraction.data.reasoning || "",
                sourcesChecked: collected.sourcesChecked,
                warnings: [
                  ...collected.warnings,
                  ...(extraction.data.warnings ?? []),
                  ...extraction.warnings,
                ].filter(Boolean),
                modelUsed: extraction.modelUsed,
              });
            } catch (error) {
              results.push({
                creatorId: creator.creatorId,
                contactsText: "Contacts: Not found",
                contacts: createEmptyContacts(),
                confidence: "low",
                source: "Enrichment failed",
                reasoning: error instanceof Error ? error.message : "Contact enrichment failed.",
                sourcesChecked: [],
                warnings: [error instanceof Error ? error.message : "Contact enrichment failed."],
                modelUsed: "",
              });
            }
          }

          return Response.json({
            ok: true,
            results,
            processed: results.length,
            skipped: Math.max(body.creators.length - selectedCreators.length, 0),
            maxCreators,
          });
        } catch (error) {
          return handleAIError(error, "AI contact enrichment failed.");
        }
      },
    },
  },
});

async function collectCreatorContactSourceText(creator: CreatorInput): Promise<{
  sourceText: string;
  sourcesChecked: string[];
  warnings: string[];
}> {
  const rowText = buildCreatorRowText(creator);
  const urls = extractUrlsFromCreator(creator);
  const sourcesChecked = ["Uploaded EasyKOL fields"];
  const warnings: string[] = [];
  const fetchedTexts: string[] = [];

  for (const url of urls.slice(0, 4)) {
    const safeUrl = normalizeSafeUrl(url);
    if (!safeUrl) continue;
    if (isSocialLoginWallUrl(safeUrl)) {
      sourcesChecked.push(`${safeUrl} unavailable`);
      warnings.push(`Skipped ${safeUrl}: public fetch is usually blocked or login-gated.`);
      continue;
    }

    try {
      const text = await fetchPublicPageText(safeUrl);
      sourcesChecked.push(safeUrl);
      if (text) fetchedTexts.push(`Source URL: ${safeUrl}\n${text}`);
    } catch (error) {
      sourcesChecked.push(`${safeUrl} unavailable`);
      warnings.push(error instanceof Error ? error.message : `Could not fetch ${safeUrl}.`);
    }
  }

  return {
    sourceText: [rowText, ...fetchedTexts].join("\n\n---\n\n").slice(0, 26000),
    sourcesChecked,
    warnings,
  };
}

function buildCreatorRowText(creator: CreatorInput): string {
  const priorityFields = [
    "Nickname",
    "@Username",
    "Description",
    "Email",
    "URL",
    "Platform",
    "Region",
    "Language",
  ];
  const lines: string[] = [];
  const usedKeys = new Set<string>();

  for (const field of priorityFields) {
    const value = getRowValue(creator.data, field);
    if (!value) continue;
    usedKeys.add(field.toLowerCase());
    lines.push(`${field}: ${value}`);
  }

  for (const [key, value] of Object.entries(creator.data)) {
    const cleanValue = stringValue(value);
    if (!cleanValue || usedKeys.has(key.toLowerCase())) continue;
    if (/email|url|link|bio|description|contact|username|handle|platform/i.test(key)) {
      lines.push(`${key}: ${cleanValue}`);
    }
  }

  return lines.join("\n");
}

function extractUrlsFromCreator(creator: CreatorInput): string[] {
  const text = Object.values(creator.data).map(stringValue).join(" ");
  const matches = text.match(/https?:\/\/[^\s"'<>),\]]+/gi) ?? [];
  return Array.from(new Set(matches.map((url) => url.replace(/[.,;]+$/, ""))));
}

async function fetchPublicPageText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "KatlasBuddyContactEnrichment/1.0",
        Accept: "text/html,text/plain,application/xhtml+xml",
      },
    });

    if (!response.ok) {
      throw new Error(`Could not fetch ${url}: HTTP ${response.status}.`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!/text|html|xml/i.test(contentType)) {
      throw new Error(`Skipped ${url}: unsupported content type.`);
    }

    const html = await response.text();
    return htmlToText(html).slice(0, 10000);
  } finally {
    clearTimeout(timeout);
  }
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSafeUrl(value: string): string {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function isSocialLoginWallUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.replace(/^www\./, "").toLowerCase();
    return [
      "instagram.com",
      "tiktok.com",
      "youtube.com",
      "youtu.be",
      "facebook.com",
      "threads.net",
      "x.com",
      "twitter.com",
    ].some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return true;
  }
}

function getCreatorIdentifier(creator: CreatorInput): string {
  return (
    getRowValue(creator.data, "Nickname") ||
    getRowValue(creator.data, "@Username") ||
    getRowValue(creator.data, "URL") ||
    creator.creatorId
  );
}

function getRowValue(data: CreatorInput["data"], requestedKey: string): string {
  const exactValue = stringValue(data[requestedKey]);
  if (exactValue) return exactValue;
  const match = Object.entries(data).find(
    ([key]) => key.trim().toLowerCase() === requestedKey.toLowerCase(),
  );
  return stringValue(match?.[1]);
}

function normalizeContacts(
  contacts: Partial<ContactExtractionResponse["contacts"]>,
): ContactExtractionResponse["contacts"] {
  return {
    email: stringValue(contacts.email),
    line: stringValue(contacts.line),
    whatsapp: stringValue(contacts.whatsapp),
    phone: stringValue(contacts.phone),
    instagram: stringValue(contacts.instagram),
    tiktok: stringValue(contacts.tiktok),
    youtube: stringValue(contacts.youtube),
    website: stringValue(contacts.website),
    other: stringValue(contacts.other),
  };
}

function createEmptyContacts(): ContactExtractionResponse["contacts"] {
  return {
    email: "",
    line: "",
    whatsapp: "",
    phone: "",
    instagram: "",
    tiktok: "",
    youtube: "",
    website: "",
    other: "",
  };
}

function formatContactsText(contacts: ContactExtractionResponse["contacts"]): string {
  const lines = [
    ["Email", contacts.email],
    ["LINE", contacts.line],
    ["WhatsApp", contacts.whatsapp],
    ["Phone", contacts.phone],
    ["Instagram", contacts.instagram],
    ["TikTok", contacts.tiktok],
    ["YouTube", contacts.youtube],
    ["Website", contacts.website],
    ["Other", contacts.other],
  ]
    .filter(([, value]) => value.trim())
    .map(([label, value]) => `${label}: ${value}`);

  return lines.length ? lines.join("\n") : "Contacts: Not found";
}

function stringValue(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function handleAIError(error: unknown, fallbackMessage: string): Response {
  if (error instanceof z.ZodError) {
    return Response.json(
      {
        ok: false,
        error: "Invalid AI contact enrichment request.",
        details: error.flatten(),
      },
      { status: 400 },
    );
  }

  if (error instanceof AIConfigurationError) {
    return Response.json({ ok: false, error: error.message }, { status: 503 });
  }

  if (error instanceof AIProviderError) {
    return Response.json({ ok: false, error: error.message }, { status: error.statusCode });
  }

  const message = error instanceof Error ? error.message : fallbackMessage;
  return Response.json({ ok: false, error: message }, { status: 500 });
}
