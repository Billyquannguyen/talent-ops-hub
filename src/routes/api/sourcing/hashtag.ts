import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const hashtagRequestSchema = z
  .object({
    platform: z.literal("tiktok").default("tiktok"),
    hashtag: z.string().min(1).max(500).optional(),
    source: z.string().min(1).max(500).optional(),
    maxResults: z.number().int().min(1).max(1000).optional(),
  })
  .refine((value) => Boolean(value.hashtag || value.source), {
    message: "Enter a hashtag or TikTok sound link before scraping.",
  });

type CreatorRow = Record<string, string | number | boolean | null | undefined>;

type TikTokCreatorRow = {
  nickname: string;
  username: string;
  description: string;
  platform: "TikTok";
  followers: number | "";
  avgViews: number | "";
  avgLikes: number | "";
  email: string;
  lastPost: string;
  profileUrl: string;
  sampleVideoUrl: string;
  sourceLink: string;
};

type TikTokUser = {
  username: string;
  nickname: string;
  description: string;
  followers: number | "";
};

const outputHeaders = [
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

type TikTokSource = {
  type: "hashtag" | "sound";
  label: string;
  pageUrl: string;
};

export const Route = createFileRoute("/api/sourcing/hashtag")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = hashtagRequestSchema.parse(await request.json());
          const source = resolveTikTokSource(body.source ?? body.hashtag ?? "");
          if (!source) {
            return Response.json(
              { ok: false, error: "Enter a hashtag or TikTok sound link before scraping." },
              { status: 400 },
            );
          }

          const maxResults = body.maxResults ?? 1000;
          const html = await fetchTikTokSourcePage(source);
          const parsed = parseTikTokSourcePage(html, source, maxResults);

          return Response.json({
            ok: true,
            platform: body.platform,
            hashtag: source.label.replace(/^#/, ""),
            sourceType: source.type,
            sourceLabel: source.label,
            headers: outputHeaders,
            rows: parsed.rows.map(toCreatorRow),
            videosFound: parsed.videosFound,
            creatorsFound: parsed.rows.length,
            duplicatesRemoved: parsed.duplicatesRemoved,
            warnings: parsed.warnings,
            sourceUrl: source.pageUrl,
          });
        } catch (error) {
          if (error instanceof z.ZodError) {
            return Response.json(
              {
                ok: false,
                error: "Invalid hashtag scraper request.",
                details: error.flatten(),
              },
              { status: 400 },
            );
          }

          const message = error instanceof Error ? error.message : "Billy scrape failed.";
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});

async function fetchTikTokSourcePage(source: TikTokSource): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(source.pageUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": "KatlasBuddySourcing/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`TikTok returned HTTP ${response.status}. Try again later.`);
    }

    return await response.text();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("TikTok did not respond before the scrape timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function parseTikTokSourcePage(
  html: string,
  source: TikTokSource,
  maxResults: number,
): {
  rows: TikTokCreatorRow[];
  videosFound: number;
  duplicatesRemoved: number;
  warnings: string[];
} {
  const roots = extractJsonRoots(html);
  const users = new Map<string, TikTokUser>();
  const videoRows: TikTokCreatorRow[] = [];

  roots.forEach((root) => {
    visitRecords(root, (record) => {
      const user = parseTikTokUser(record);
      if (user) users.set(user.username.toLowerCase(), user);
    });
  });

  roots.forEach((root) => {
    visitRecords(root, (record) => {
      const row = parseTikTokVideo(record, users, source);
      if (row) videoRows.push(row);
    });
  });

  if (videoRows.length === 0) {
    videoRows.push(...parseTikTokLinksFromHtml(html, source));
  }

  const deduped = dedupeCreatorRows(videoRows).slice(0, maxResults);
  const warnings: string[] = [];

  if (roots.length === 0) {
    warnings.push("TikTok did not expose embedded JSON in the public page response.");
  }

  if (videoRows.length === 0) {
    warnings.push("No creators were found. TikTok did not expose video rows for this source.");
  }

  if (deduped.some((row) => row.followers === "")) {
    warnings.push("Some creators do not include follower counts in the public TikTok response.");
  }

  return {
    rows: deduped,
    videosFound: videoRows.length,
    duplicatesRemoved: Math.max(videoRows.length - deduped.length, 0),
    warnings,
  };
}

function extractJsonRoots(html: string): unknown[] {
  return [
    extractJsonScript(html, "SIGI_STATE"),
    extractJsonScript(html, "__UNIVERSAL_DATA_FOR_REHYDRATION__"),
    extractJsonScript(html, "__NEXT_DATA__"),
  ].filter((value): value is unknown => value !== undefined);
}

function extractJsonScript(html: string, id: string): unknown | undefined {
  const match = html.match(
    new RegExp(`<script[^>]+id=["']${escapeRegex(id)}["'][^>]*>([\\s\\S]*?)<\\/script>`, "i"),
  );
  const raw = match?.[1]?.trim();
  if (!raw) return undefined;

  try {
    return JSON.parse(decodeHtmlEntities(raw));
  } catch {
    return undefined;
  }
}

function visitRecords(
  value: unknown,
  visitor: (record: Record<string, unknown>) => void,
  seen = new WeakSet<object>(),
) {
  if (!value || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);

  if (!Array.isArray(value)) visitor(value as Record<string, unknown>);

  Object.values(value).forEach((child) => visitRecords(child, visitor, seen));
}

function parseTikTokUser(record: Record<string, unknown>): TikTokUser | undefined {
  const username = cleanUsername(
    pickString(record, ["uniqueId", "unique_id", "username", "handle"]),
  );
  if (!username) return undefined;

  const stats = firstRecord(record, ["stats", "statsV2", "authorStats"]);
  const followers =
    pickNumber(record, ["followerCount", "followers"]) ??
    pickNumber(stats, ["followerCount", "followers"]);
  const nickname = pickString(record, ["nickname", "displayName", "name"]);
  const description = pickString(record, ["signature", "bio", "bioDescription", "description"]);

  if (!nickname && !description && followers == null) return undefined;

  return {
    username,
    nickname,
    description,
    followers: followers ?? "",
  };
}

function parseTikTokVideo(
  record: Record<string, unknown>,
  users: Map<string, TikTokUser>,
  source: TikTokSource,
): TikTokCreatorRow | undefined {
  const videoId = pickString(record, ["id", "itemId", "videoId", "aweme_id"]);
  if (!videoId || !/^\d{8,}$/.test(videoId)) return undefined;

  const authorRecord = firstRecord(record, ["author", "authorInfo", "authorData", "user"]);
  const rawAuthor = typeof record.author === "string" ? record.author : "";
  const username = cleanUsername(
    rawAuthor ||
      pickString(record, ["authorUniqueId", "authorName", "username"]) ||
      pickString(authorRecord, ["uniqueId", "unique_id", "username", "handle"]),
  );
  if (!username) return undefined;

  const storedUser = users.get(username.toLowerCase());
  const authorStats = firstRecord(record, ["authorStats", "authorStatsV2"]);
  const videoStats = firstRecord(record, ["stats", "statsV2", "statistics"]);
  const description =
    storedUser?.description ||
    pickString(authorRecord, ["signature", "bio", "bioDescription", "description"]);
  const videoDescription = pickString(record, ["desc", "description", "title"]);
  const followers =
    storedUser?.followers ||
    pickNumber(authorStats, ["followerCount", "followers"]) ||
    pickNumber(authorRecord, ["followerCount", "followers"]) ||
    "";

  return {
    nickname:
      storedUser?.nickname ||
      pickString(authorRecord, ["nickname", "displayName", "name"]) ||
      username,
    username: `@${username}`,
    description: description || videoDescription,
    platform: "TikTok",
    followers,
    avgViews: pickNumber(videoStats, ["playCount", "viewCount", "views"]) ?? "",
    avgLikes: pickNumber(videoStats, ["diggCount", "likeCount", "likes"]) ?? "",
    email: extractEmail(`${description} ${videoDescription}`),
    lastPost: formatUnixDate(pickNumber(record, ["createTime", "create_time"])),
    profileUrl: `https://www.tiktok.com/@${username}`,
    sampleVideoUrl: `https://www.tiktok.com/@${username}/video/${videoId}`,
    sourceLink: source.pageUrl,
  };
}

function parseTikTokLinksFromHtml(html: string, source: TikTokSource): TikTokCreatorRow[] {
  const normalized = html.replace(/\\u002F/g, "/").replace(/\\\//g, "/");
  const regex = /https?:\/\/(?:www\.)?tiktok\.com\/@([^/?#"'<>\\\s]+)\/video\/(\d+)/gi;
  const rows: TikTokCreatorRow[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(normalized))) {
    const username = cleanUsername(match[1] ?? "");
    const videoId = match[2] ?? "";
    if (!username || !videoId) continue;
    rows.push({
      nickname: username,
      username: `@${username}`,
      description: "",
      platform: "TikTok",
      followers: "",
      avgViews: "",
      avgLikes: "",
      email: "",
      lastPost: "",
      profileUrl: `https://www.tiktok.com/@${username}`,
      sampleVideoUrl: `https://www.tiktok.com/@${username}/video/${videoId}`,
      sourceLink: source.pageUrl,
    });
  }

  return rows;
}

function dedupeCreatorRows(rows: TikTokCreatorRow[]): TikTokCreatorRow[] {
  const rowsByCreator = new Map<string, TikTokCreatorRow>();

  for (const row of rows) {
    const key = cleanUsername(row.username).toLowerCase() || row.profileUrl.toLowerCase();
    if (!key) continue;
    const existing = rowsByCreator.get(key);
    if (!existing) {
      rowsByCreator.set(key, row);
      continue;
    }

    rowsByCreator.set(key, {
      ...existing,
      nickname: existing.nickname || row.nickname,
      description: existing.description || row.description,
      followers: maxNumberOrExisting(existing.followers, row.followers),
      avgViews: maxNumberOrExisting(existing.avgViews, row.avgViews),
      avgLikes: maxNumberOrExisting(existing.avgLikes, row.avgLikes),
      email: existing.email || row.email,
      lastPost: maxDateString(existing.lastPost, row.lastPost),
      sampleVideoUrl: existing.sampleVideoUrl || row.sampleVideoUrl,
    });
  }

  return Array.from(rowsByCreator.values());
}

function toCreatorRow(row: TikTokCreatorRow): CreatorRow {
  return {
    Nickname: row.nickname,
    "@Username": row.username,
    Description: row.description,
    Platform: row.platform,
    Followers: row.followers,
    "Avg. Views": row.avgViews,
    "Avg. Likes": row.avgLikes,
    Email: row.email,
    "Last Post": row.lastPost,
    URL: row.profileUrl,
    "Sample Video URL": row.sampleVideoUrl,
    "Source Link": row.sourceLink,
  };
}

function resolveTikTokSource(value: string): TikTokSource | undefined {
  const raw = value.trim();
  if (!raw) return undefined;

  const maybeUrl = normalizeTikTokUrl(raw);
  if (maybeUrl) {
    const parts = maybeUrl.pathname.split("/").filter(Boolean);
    const [pageType, sourceSlug] = parts;

    if (pageType === "tag" && sourceSlug) {
      const hashtag = normalizeHashtag(decodeURIComponent(sourceSlug));
      if (!hashtag) return undefined;
      return {
        type: "hashtag",
        label: `#${hashtag}`,
        pageUrl: `https://www.tiktok.com/tag/${encodeURIComponent(hashtag)}`,
      };
    }

    if (pageType === "music" && sourceSlug) {
      return {
        type: "sound",
        label: decodeURIComponent(sourceSlug).replace(/-/g, " "),
        pageUrl: `https://www.tiktok.com${maybeUrl.pathname}`,
      };
    }

    return undefined;
  }

  const hashtag = normalizeHashtag(raw);
  if (!hashtag) return undefined;
  return {
    type: "hashtag",
    label: `#${hashtag}`,
    pageUrl: `https://www.tiktok.com/tag/${encodeURIComponent(hashtag)}`,
  };
}

function normalizeTikTokUrl(value: string): URL | undefined {
  const raw = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(raw);
    if (!url.hostname.toLowerCase().endsWith("tiktok.com")) return undefined;
    return url;
  } catch {
    return undefined;
  }
}

function normalizeHashtag(value: string): string {
  return value.trim().replace(/^#+/, "").replace(/\s+/g, "");
}

function cleanUsername(value: string): string {
  return value
    .trim()
    .replace(/^@+/, "")
    .replace(/[/?#].*$/, "");
}

function pickString(record: Record<string, unknown> | undefined, keys: string[]): string {
  if (!record) return "";
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function pickNumber(
  record: Record<string, unknown> | undefined,
  keys: string[],
): number | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value.replace(/,/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function firstRecord(
  record: Record<string, unknown> | undefined,
  keys: string[],
): Record<string, unknown> | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return undefined;
}

function maxNumberOrExisting(existing: number | "", candidate: number | ""): number | "" {
  if (typeof existing === "number" && typeof candidate === "number") {
    return Math.max(existing, candidate);
  }
  return existing || candidate;
}

function maxDateString(existing: string, candidate: string): string {
  if (!existing) return candidate;
  if (!candidate) return existing;
  return new Date(candidate).getTime() > new Date(existing).getTime() ? candidate : existing;
}

function formatUnixDate(value: number | undefined): string {
  if (!value) return "";
  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function extractEmail(value: string): string {
  return value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? "";
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
