import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const tiktokProfileImportSchema = z.object({
  sourceLabel: z.string().max(500).optional(),
  sourceUrl: z.string().max(1000).optional(),
  videosFound: z.number().int().min(0).max(5000).optional(),
  creators: z
    .array(
      z.object({
        username: z.string().min(1).max(120),
        profileUrl: z.string().max(1000).optional(),
        sampleVideoUrl: z.string().max(1000).optional(),
        videoDescription: z.string().max(5000).optional(),
        sourceLink: z.string().max(1000).optional(),
        videos: z.array(z.string().max(1000)).optional(),
      }),
    )
    .min(1)
    .max(250),
});

type CreatorRow = Record<string, string | number | boolean | null | undefined>;

type ImportedTikTokCreator = z.infer<typeof tiktokProfileImportSchema>["creators"][number];

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

export const Route = createFileRoute("/api/sourcing/tiktok-profiles")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = tiktokProfileImportSchema.parse(await request.json());
          const creators = dedupeImportedCreators(body.creators);
          const { rows, failedProfiles } = await enrichImportedCreators(
            creators,
            body.sourceUrl ?? "",
          );
          const warnings: string[] = [];

          if (failedProfiles > 0) {
            warnings.push(
              `${failedProfiles.toLocaleString()} creator profile${
                failedProfiles === 1 ? "" : "s"
              } could not be enriched. Billy kept the profile and video links.`,
            );
          }

          return Response.json({
            ok: true,
            platform: "tiktok",
            sourceLabel: body.sourceLabel || "TikTok extension import",
            sourceUrl: body.sourceUrl || "",
            headers: outputHeaders,
            rows: rows.map(toCreatorRow),
            videosFound: body.videosFound ?? creators.length,
            creatorsFound: rows.length,
            duplicatesRemoved: Math.max(body.creators.length - creators.length, 0),
            warnings,
          });
        } catch (error) {
          if (error instanceof z.ZodError) {
            return Response.json(
              {
                ok: false,
                error: "Invalid TikTok extension import.",
                details: error.flatten(),
              },
              { status: 400 },
            );
          }

          const message = error instanceof Error ? error.message : "TikTok import failed.";
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});

async function enrichImportedCreators(
  creators: ImportedTikTokCreator[],
  fallbackSourceLink: string,
): Promise<{ rows: TikTokCreatorRow[]; failedProfiles: number }> {
  const rows: TikTokCreatorRow[] = [];
  let failedProfiles = 0;

  for (const batch of chunk(creators, 5)) {
    const enriched = await Promise.all(
      batch.map(async (creator) => {
        try {
          const html = await fetchTikTokProfilePage(creator);
          return parseTikTokProfilePage(html, creator, fallbackSourceLink);
        } catch {
          failedProfiles += 1;
          return createFallbackCreatorRow(creator, fallbackSourceLink);
        }
      }),
    );
    rows.push(...enriched);
  }

  return { rows, failedProfiles };
}

async function fetchTikTokProfilePage(creator: ImportedTikTokCreator): Promise<string> {
  const username = cleanUsername(creator.username);
  const profileUrl = creator.profileUrl || `https://www.tiktok.com/@${username}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(profileUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      },
    });

    if (!response.ok) {
      throw new Error(`TikTok returned HTTP ${response.status}.`);
    }

    return await response.text();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("TikTok profile request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function parseTikTokProfilePage(
  html: string,
  creator: ImportedTikTokCreator,
  fallbackSourceLink: string,
): TikTokCreatorRow {
  const username = cleanUsername(creator.username);
  const structuredProfile = parseTikTokStructuredProfile(html);
  const description = decodeHtmlEntities(
    getMetaContent(html, "description") ||
      getMetaContent(html, "og:description") ||
      getMetaContent(html, "twitter:description"),
  );
  const nickname =
    structuredProfile?.nickname || extractNickname(description, username) || username;
  const followers = structuredProfile?.followers || extractFollowerCount(description);
  const bio = structuredProfile?.bio || extractBio(description, creator.videoDescription ?? "");
  const sampleVideoUrl = getSampleVideoUrl(creator);
  const sourceLink = creator.sourceLink || fallbackSourceLink;

  return {
    nickname,
    username: `@${username}`,
    description: bio,
    platform: "TikTok",
    followers,
    avgViews: "",
    avgLikes: "",
    email: extractEmail(bio),
    lastPost: "",
    profileUrl: `https://www.tiktok.com/@${username}`,
    sampleVideoUrl,
    sourceLink,
  };
}

function parseTikTokStructuredProfile(
  html: string,
): { nickname: string; bio: string; followers: number | "" } | undefined {
  const root = extractJsonScript(html, "__UNIVERSAL_DATA_FOR_REHYDRATION__");
  const defaultScope = readRecord(root)?.["__DEFAULT_SCOPE__"];
  const userDetail = readRecord(defaultScope)?.["webapp.user-detail"];
  const userInfo = readRecord(userDetail)?.userInfo;
  const user = readRecord(userInfo)?.user;
  const stats = readRecord(userInfo)?.statsV2 ?? readRecord(userInfo)?.stats;
  const nickname = pickString(user, "nickname");
  const bio = pickString(user, "signature");
  const followers = pickNumber(stats, "followerCount") ?? "";

  if (!nickname && !bio && followers === "") return undefined;

  return {
    nickname,
    bio,
    followers,
  };
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

function createFallbackCreatorRow(
  creator: ImportedTikTokCreator,
  fallbackSourceLink: string,
): TikTokCreatorRow {
  const username = cleanUsername(creator.username);
  const description = creator.videoDescription ?? "";
  return {
    nickname: username,
    username: `@${username}`,
    description,
    platform: "TikTok",
    followers: "",
    avgViews: "",
    avgLikes: "",
    email: extractEmail(description),
    lastPost: "",
    profileUrl: `https://www.tiktok.com/@${username}`,
    sampleVideoUrl: getSampleVideoUrl(creator),
    sourceLink: creator.sourceLink || fallbackSourceLink,
  };
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

function dedupeImportedCreators(creators: ImportedTikTokCreator[]): ImportedTikTokCreator[] {
  const byUsername = new Map<string, ImportedTikTokCreator>();

  creators.forEach((creator) => {
    const username = cleanUsername(creator.username);
    if (!username) return;
    const existing = byUsername.get(username.toLowerCase());
    if (!existing) {
      byUsername.set(username.toLowerCase(), {
        ...creator,
        username,
        videos: [...(creator.videos ?? [])],
      });
      return;
    }

    byUsername.set(username.toLowerCase(), {
      ...existing,
      sampleVideoUrl: existing.sampleVideoUrl || creator.sampleVideoUrl,
      videoDescription: existing.videoDescription || creator.videoDescription,
      sourceLink: existing.sourceLink || creator.sourceLink,
      videos: Array.from(new Set([...(existing.videos ?? []), ...(creator.videos ?? [])])),
    });
  });

  return Array.from(byUsername.values());
}

function getMetaContent(html: string, name: string): string {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];

  for (const tag of tags) {
    const nameMatch = tag.match(/(?:name|property)=["']([^"']+)["']/i);
    if (nameMatch?.[1]?.toLowerCase() !== name.toLowerCase()) continue;
    const contentMatch = tag.match(/content=(["'])(.*?)\1/i);
    if (contentMatch?.[2]) return contentMatch[2];
  }

  return "";
}

function extractNickname(description: string, username: string): string {
  if (!description) return "";
  const match = description.match(new RegExp(`^(.+?)\\s*\\(@${escapeRegex(username)}\\)`, "i"));
  return match?.[1]?.trim() ?? "";
}

function extractFollowerCount(description: string): number | "" {
  const match = description.match(/([\d,.]+)\s*([KMB]?)\s*Followers/i);
  if (!match) return "";
  return parseCompactNumber(`${match[1]}${match[2]}`);
}

function extractBio(description: string, fallbackDescription: string): string {
  if (!description) return fallbackDescription;
  const followersMatch = description.match(/Followers\.?/i);
  if (!followersMatch?.index) return fallbackDescription || description;
  const afterFollowers = description.slice(followersMatch.index + followersMatch[0].length);
  const beforePopularVideos = afterFollowers.split(/\.Watch\b/i)[0];
  const beforeJoin = beforePopularVideos.split(/\.Join\b/i)[0];
  return beforeJoin.replace(/^[\s.:|]+/, "").trim() || fallbackDescription;
}

function getSampleVideoUrl(creator: ImportedTikTokCreator): string {
  return creator.sampleVideoUrl || creator.videos?.[0] || "";
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function pickString(value: unknown, key: string): string {
  const record = readRecord(value);
  const picked = record?.[key];
  return typeof picked === "string" ? picked.trim() : "";
}

function pickNumber(value: unknown, key: string): number | undefined {
  const record = readRecord(value);
  const picked = record?.[key];

  if (typeof picked === "number" && Number.isFinite(picked)) return picked;
  if (typeof picked !== "string") return undefined;

  const numericValue = Number(picked.replace(/,/g, ""));
  return Number.isFinite(numericValue) ? numericValue : undefined;
}

function cleanUsername(value: string): string {
  return value
    .trim()
    .replace(/^@+/, "")
    .replace(/[/?#].*$/, "");
}

function parseCompactNumber(value: string): number | "" {
  const match = value.trim().match(/^([\d,.]+)\s*([KMB])?$/i);
  if (!match) return "";
  const base = Number((match[1] ?? "").replace(/,/g, ""));
  if (!Number.isFinite(base)) return "";
  const suffix = (match[2] ?? "").toUpperCase();
  const multiplier =
    suffix === "K" ? 1_000 : suffix === "M" ? 1_000_000 : suffix === "B" ? 1_000_000_000 : 1;
  return Math.round(base * multiplier);
}

function extractEmail(value: string): string {
  return value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? "";
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
