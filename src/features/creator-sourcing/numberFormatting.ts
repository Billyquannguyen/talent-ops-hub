import { parseMetric } from "./filters";
import type { EasyKolField } from "./types";

const compactNumberFields = new Set<EasyKolField>([
  "Followers",
  "Avg. Views",
  "Median Views",
  "Avg. Likes",
  "Posts (7d)",
  "Posts (30d)",
]);

export function formatSourcingFieldValue(field: EasyKolField, value: string): string {
  if (!compactNumberFields.has(field)) return value;
  return formatCompactNumber(value);
}

export function formatCompactNumber(value: string | number): string {
  const parsed = parseMetric(value);
  if (parsed === undefined) return String(value);

  const absoluteValue = Math.abs(parsed);
  if (absoluteValue >= 1_000_000) {
    return `${formatScaledNumber(parsed / 1_000_000)}M`;
  }
  if (absoluteValue >= 1_000) {
    return `${formatScaledNumber(parsed / 1_000)}K`;
  }

  return Number.isInteger(parsed) ? String(parsed) : String(roundToOneDecimal(parsed));
}

function formatScaledNumber(value: number): string {
  return String(roundToOneDecimal(value));
}

function roundToOneDecimal(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}
