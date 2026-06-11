import type { ColumnMap, CreatorRow, EasyKolField, FilterSettings, UploadedCreator } from "./types";

export const emptyFilters: FilterSettings = {
  followersMin: "",
  followersMax: "",
  followerRanges: [],
  averageViewsMin: "",
  averageViewsMax: "",
  averageViewRanges: [],
  medianViewsMin: "",
  medianViewsMax: "",
  region: "",
  regions: [],
  language: "",
  languages: [],
  platform: "",
  platforms: [],
  lastPostAfter: "",
  posts7dMin: "",
  posts30dMin: "",
  hasEmail: false,
  emailAvailability: "",
  emailAvailabilitySelections: [],
  keyword: "",
};

const metricRangeMap = {
  "followers-1k-10k": { min: "1000", max: "10000" },
  "followers-10k-100k": { min: "10000", max: "100000" },
  "followers-100k-1m": { min: "100000", max: "1000000" },
  "followers-1m-plus": { min: "1000000", max: "" },
  "views-under-1k": { min: "", max: "1000" },
  "views-1k-10k": { min: "1000", max: "10000" },
  "views-10k-100k": { min: "10000", max: "100000" },
  "views-100k-plus": { min: "100000", max: "" },
} as const;

const columnHints: Record<EasyKolField, string[]> = {
  Nickname: ["nickname", "creator name", "name"],
  "@Username": ["@username", "username", "handle", "account"],
  Description: ["description", "bio", "profile description"],
  Region: ["region", "creator country", "country", "location"],
  Language: ["language", "lang"],
  Platform: ["platform", "channel", "source"],
  Followers: ["followers", "follower", "fans", "subscribers"],
  "Avg. Views": ["avg. views", "avg views", "average views", "average view"],
  "Median Views": ["median views", "median view"],
  "Crawler Updated At": ["crawler updated at", "crawler updated", "updated at", "last updated"],
  "Avg. Likes": ["avg. likes", "avg likes", "average likes"],
  Email: ["email", "e-mail", "business email", "contact email"],
  "Last Post": ["last post", "latest post", "last posted"],
  "Posts (7d)": ["posts (7d)", "posts 7d", "7d posts", "posts last 7 days"],
  "Posts (30d)": ["posts (30d)", "posts 30d", "30d posts", "posts last 30 days"],
  URL: ["url", "profile url", "link", "profile link"],
};

export function inferColumnMap(headers: string[]): ColumnMap {
  const normalizedHeaders = headers.map((header) => ({
    original: header,
    normalized: normalizeHeader(header),
  }));

  return Object.entries(columnHints).reduce<ColumnMap>((map, [field, hints]) => {
    const exact = normalizedHeaders.find(({ normalized }) =>
      hints.some((hint) => normalized === normalizeHeader(hint)),
    );
    const partial = normalizedHeaders.find(({ normalized }) =>
      hints.some((hint) => normalized.includes(normalizeHeader(hint))),
    );
    const match = exact ?? partial;
    if (match) {
      map[field as EasyKolField] = match.original;
    }
    return map;
  }, {});
}

export function filterCreators(
  creators: UploadedCreator[],
  filters: FilterSettings,
  columnMap: ColumnMap,
): UploadedCreator[] {
  return creators.filter(({ data }) => {
    if (
      !matchesMetricGroup(
        data,
        columnMap,
        "Followers",
        filters.followerRanges,
        filters.followersMin,
        filters.followersMax,
      )
    ) {
      return false;
    }
    if (
      !matchesMetricGroup(
        data,
        columnMap,
        "Avg. Views",
        filters.averageViewRanges,
        filters.averageViewsMin,
        filters.averageViewsMax,
      )
    ) {
      return false;
    }
    if (
      !matchesMetric(
        data,
        columnMap,
        "Median Views",
        filters.medianViewsMin,
        filters.medianViewsMax,
      )
    ) {
      return false;
    }
    if (
      !matchesAnyExact(
        data,
        columnMap,
        "Region",
        mergeLegacySelection(filters.region, filters.regions),
      )
    ) {
      return false;
    }
    if (
      !matchesAnyExact(
        data,
        columnMap,
        "Language",
        mergeLegacySelection(filters.language, filters.languages),
      )
    ) {
      return false;
    }
    if (
      !matchesAnyExact(
        data,
        columnMap,
        "Platform",
        mergeLegacySelection(filters.platform, filters.platforms),
      )
    ) {
      return false;
    }
    if (!matchesDateAfter(data, columnMap, "Last Post", filters.lastPostAfter)) return false;
    if (!matchesMinimum(data, columnMap, "Posts (7d)", filters.posts7dMin)) return false;
    if (!matchesMinimum(data, columnMap, "Posts (30d)", filters.posts30dMin)) return false;
    const hasEmail = rowHasEmail(data, columnMap);
    const emailSelections = mergeLegacyEmailSelection(filters);
    if (emailSelections.length > 0) {
      if (hasEmail && !emailSelections.includes("has")) return false;
      if (!hasEmail && !emailSelections.includes("none")) return false;
    }
    if (filters.keyword.trim() && !matchesKeyword(data, columnMap, filters.keyword)) return false;
    return true;
  });
}

export function getCell(data: CreatorRow, columnMap: ColumnMap, field: EasyKolField): string {
  const column = columnMap[field];
  if (!column) return "";
  return stringifyCell(data[column]).trim();
}

export function getUniqueValues(
  creators: UploadedCreator[],
  columnMap: ColumnMap,
  field: EasyKolField,
): string[] {
  const values = new Set<string>();
  creators.forEach(({ data }) => {
    const value = getCell(data, columnMap, field);
    if (value) values.add(value);
  });
  return Array.from(values).sort((a, b) => a.localeCompare(b));
}

export function parseMetric(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = stringifyCell(value).trim().toLowerCase();
  if (!raw) return undefined;
  const multiplier = raw.includes("m")
    ? 1_000_000
    : raw.includes("k")
      ? 1_000
      : raw.includes("b")
        ? 1_000_000_000
        : 1;
  const number = Number(raw.replace(/[^0-9. -]/g, ""));
  if (!Number.isFinite(number)) return undefined;
  return number * multiplier;
}

export function rowHasEmail(data: CreatorRow, columnMap: ColumnMap): boolean {
  return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(
    `${getCell(data, columnMap, "Email")} ${getCell(data, columnMap, "Description")}`,
  );
}

function matchesMetric(
  data: CreatorRow,
  columnMap: ColumnMap,
  field: EasyKolField,
  min: string,
  max: string,
): boolean {
  const minValue = parseMetric(min);
  const maxValue = parseMetric(max);
  if (minValue == null && maxValue == null) return true;
  const value = parseMetric(getCell(data, columnMap, field));
  if (value == null) return false;
  if (minValue != null && value < minValue) return false;
  if (maxValue != null && value > maxValue) return false;
  return true;
}

function matchesMetricGroup(
  data: CreatorRow,
  columnMap: ColumnMap,
  field: EasyKolField,
  selectedRangeKeys: string[],
  customMin: string,
  customMax: string,
): boolean {
  const hasCustomRange = Boolean(customMin || customMax);
  if (selectedRangeKeys.length === 0 && !hasCustomRange) return true;
  const rawValue = getCell(data, columnMap, field);
  const matchesPreset = selectedRangeKeys.some((key) => {
    const range = metricRangeMap[key as keyof typeof metricRangeMap];
    return range ? matchesMetricValue(rawValue, range.min, range.max) : false;
  });
  const matchesCustom = hasCustomRange && matchesMetricValue(rawValue, customMin, customMax);
  return matchesPreset || matchesCustom;
}

function matchesMetricValue(value: unknown, min: string, max: string): boolean {
  const minValue = parseMetric(min);
  const maxValue = parseMetric(max);
  if (minValue == null && maxValue == null) return true;
  const metric = parseMetric(value);
  if (metric == null) return false;
  if (minValue != null && metric < minValue) return false;
  if (maxValue != null && metric > maxValue) return false;
  return true;
}

function matchesMinimum(
  data: CreatorRow,
  columnMap: ColumnMap,
  field: EasyKolField,
  min: string,
): boolean {
  const minValue = parseMetric(min);
  if (minValue == null) return true;
  const value = parseMetric(getCell(data, columnMap, field));
  return value != null && value >= minValue;
}

function matchesExact(
  data: CreatorRow,
  columnMap: ColumnMap,
  field: EasyKolField,
  selected: string,
): boolean {
  if (!selected) return true;
  return getCell(data, columnMap, field).toLowerCase() === selected.toLowerCase();
}

function matchesAnyExact(
  data: CreatorRow,
  columnMap: ColumnMap,
  field: EasyKolField,
  selected: string[],
): boolean {
  if (selected.length === 0) return true;
  const value = getCell(data, columnMap, field).toLowerCase();
  return selected.some((item) => value === item.toLowerCase());
}

function mergeLegacySelection(legacyValue: string, values: string[]): string[] {
  return Array.from(new Set([legacyValue, ...values].filter(Boolean)));
}

function mergeLegacyEmailSelection(filters: FilterSettings): Array<"has" | "none"> {
  return Array.from(
    new Set(
      [
        ...filters.emailAvailabilitySelections,
        filters.emailAvailability || undefined,
        filters.hasEmail ? "has" : undefined,
      ].filter((value): value is "has" | "none" => value === "has" || value === "none"),
    ),
  );
}

function matchesDateAfter(
  data: CreatorRow,
  columnMap: ColumnMap,
  field: EasyKolField,
  dateValue: string,
): boolean {
  if (!dateValue) return true;
  const raw = getCell(data, columnMap, field);
  if (!raw) return false;
  const rowDate = new Date(raw);
  const filterDate = new Date(dateValue);
  if (Number.isNaN(rowDate.getTime()) || Number.isNaN(filterDate.getTime())) return false;
  return rowDate >= filterDate;
}

function matchesKeyword(data: CreatorRow, columnMap: ColumnMap, keyword: string): boolean {
  const target = keyword.trim().toLowerCase();
  const searchable = [
    getCell(data, columnMap, "Nickname"),
    getCell(data, columnMap, "@Username"),
    getCell(data, columnMap, "Description"),
  ]
    .join(" ")
    .toLowerCase();
  return searchable.includes(target);
}

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function stringifyCell(value: unknown): string {
  if (value == null) return "";
  return String(value);
}
