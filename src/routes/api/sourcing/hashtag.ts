import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const hashtagRequestSchema = z.object({
  platform: z.literal("tiktok").default("tiktok"),
  hashtag: z.string().min(1).max(120),
  maxResults: z.number().int().min(1).max(1000).optional(),
});

type CreatorRow = Record<string, string | number | boolean | null | undefined>;

type TikTokCreatorRow = {
  nickname: string;
  username: string;
  description: string;
  platform: "TikTok";
  followers: number | "";
  following: number | "";
  avgViews: number | "";
  avgLikes: number | "";
  email: string;
  lastPost: string;
  profileUrl: string;
  sampleVideoUrl: string;
  sourceHashtag: string;
};

type TikTokUser = {
  username: string;
  nickname: string;
  description: string;
  followers: number | "";
  following: number | "";
};

const outputHeaders = [
  "Nickname",
  "@Username",
  "Description",
  "Platform",
  "Followers",
  "Following",
  "Avg. Views",
  "Avg. Likes",
  "Email",
  "Last Post",
  "URL",
  "Sample Video URL",
  "Source Hashtag",
];

export const Route = createFileRoute("/api/sourcing/hashtag")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = hashtagRequestSchema.parse(await request.json());
          const hashtag = normalizeHashtag(body.hashtag);
          if (!hashtag) {
            return Response.json(
              { ok: false, error: "Enter a hashtag before scraping." },
              { status: 400 },
            );
          }

          const maxResults = body.maxResults ?? 500;
          const html = await fetchTikTokHashtagPage(hashtag);
          const parsed = parseTikTokHashtagPage(html, hashtag, maxResults);

          return Response.json({
            ok: true,
            platform: body.platform,
            hashtag,
            headers: outputHeaders,
            rows: parsed.rows.map(toCreatorRow),
            videosFound: parsed.videosFound,
            creatorsFound: parsed.rows.length,
            duplicatesRemoved: parsed.duplicatesRemoved,
            warnings: parsed.warnings,
            sourceUrl: `https://www.tiktok.com/tag/${encodeURIComponent(hashtag)}`,
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

          const message = error instanceof Error ? error.message : "Hashtag scrape failed.";
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});

async function fetchTikTokHashtagPage(hashtag: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(`https://www.tiktok.com/tag/${encodeURIComponent(hashtag)}`, {
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

function parseTikTokHashtagPage(
  html: string,
  hashtag: string,
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
      const row = parseTikTokVideo(record, users, hashtag);
      if (row) videoRows.push(row);
    });
  });

  if (videoRows.length === 0) {
    videoRows.push(...parseTikTokLinksFromHtml(html, hashtag));
  }

  const deduped = dedupeCreatorRows(videoRows).slice(0, maxResults);
  const warnings: string[] = [];

  if (roots.length === 0) {
    warnings.push("TikTok did not expose embedded JSON in the public page response.");
  }

  if (videoRows.length === 0) {
    warnings.push("No creators were found. TikTok may have blocked or limited the public page.");
  }

  if (deduped.some((row) => row.followers === "")) {
    warnings.push("Some creators do not include follower counts in the public hashtag response.");
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
  const following =
    pickNumber(record, ["followingCount", "following"]) ??
    pickNumber(stats, ["followingCount", "following"]);
  const nickname = pickString(record, ["nickname", "displayName", "name"]);
  const description = pickString(record, ["signature", "bio", "bioDescription", "description"]);

  if (!nickname && !description && followers == null && following == null) return undefined;

  return {
    username,
    nickname,
    description,
    followers: followers ?? "",
    following: following ?? "",
  };
}

function parseTikTokVideo(
  record: Record<string, unknown>,
  users: Map<string, TikTokUser>,
  hashtag: string,
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
  const following =
    storedUser?.following ||
    pickNumber(authorStats, ["followingCount", "following"]) ||
    pickNumber(authorRecord, ["followingCount", "following"]) ||
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
    following,
    avgViews: pickNumber(videoStats, ["playCount", "viewCount", "views"]) ?? "",
    avgLikes: pickNumber(videoStats, ["diggCount", "likeCount", "likes"]) ?? "",
    email: extractEmail(`${description} ${videoDescription}`),
    lastPost: formatUnixDate(pickNumber(record, ["createTime", "create_time"])),
    profileUrl: `https://www.tiktok.com/@${username}`,
    sampleVideoUrl: `https://www.tiktok.com/@${username}/video/${videoId}`,
    sourceHashtag: `#${hashtag}`,
  };
}

function parseTikTokLinksFromHtml(html: string, hashtag: string): TikTokCreatorRow[] {
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
      following: "",
      avgViews: "",
      avgLikes: "",
      email: "",
      lastPost: "",
      profileUrl: `https://www.tiktok.com/@${username}`,
      sampleVideoUrl: `https://www.tiktok.com/@${username}/video/${videoId}`,
      sourceHashtag: `#${hashtag}`,
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
      following: maxNumberOrExisting(existing.following, row.following),
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
    Following: row.following,
    "Avg. Views": row.avgViews,
    "Avg. Likes": row.avgLikes,
    Email: row.email,
    "Last Post": row.lastPost,
    URL: row.profileUrl,
    "Sample Video URL": row.sampleVideoUrl,
    "Source Hashtag": row.sourceHashtag,
  };
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
