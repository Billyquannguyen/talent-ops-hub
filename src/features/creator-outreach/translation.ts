import type { OutreachLanguage } from "./types";

export type TranslationRequest = {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
};

type ApiOutreachResponse =
  | {
      ok: true;
      detectedLanguage: string;
      translatedText: string;
      polishedText: string;
      modelUsed: string;
      warnings: string[];
    }
  | {
      ok: false;
      error: string;
    };

export const suggestedOutreachLanguages = [
  "English",
  "Thai",
  "Vietnamese",
  "Filipino",
  "Indonesian",
  "Korean",
  "Spanish",
  "Chinese",
  "Japanese",
  "Malay",
  "Arabic",
  "French",
  "German",
] as const;

const languageAliases = new Map<string, string>([
  ["en", "English"],
  ["english", "English"],
  ["th", "Thai"],
  ["thai", "Thai"],
  ["vi", "Vietnamese"],
  ["vietnamese", "Vietnamese"],
  ["tl", "Filipino"],
  ["fil", "Filipino"],
  ["tagalog", "Filipino"],
  ["filipino", "Filipino"],
  ["id", "Indonesian"],
  ["indonesian", "Indonesian"],
  ["ko", "Korean"],
  ["kr", "Korean"],
  ["korean", "Korean"],
  ["es", "Spanish"],
  ["spanish", "Spanish"],
  ["zh", "Chinese"],
  ["chinese", "Chinese"],
  ["ja", "Japanese"],
  ["japanese", "Japanese"],
  ["ms", "Malay"],
  ["malay", "Malay"],
  ["ar", "Arabic"],
  ["arabic", "Arabic"],
  ["fr", "French"],
  ["french", "French"],
  ["de", "German"],
  ["german", "German"],
]);

export async function detectLanguage(text: string): Promise<string> {
  if (!text.trim()) return "English";

  const payload = await callOutreachAI({
    action: "detect-language",
    text,
  });

  return getLanguageLabel(payload.detectedLanguage || "English");
}

export async function translateText({
  text,
  sourceLanguage,
  targetLanguage,
}: TranslationRequest): Promise<string> {
  const source = getLanguageLabel(sourceLanguage || "Auto Detect");
  const target = getLanguageLabel(targetLanguage || "English");
  if (!text.trim() || source.toLowerCase() === target.toLowerCase()) return text;

  const payload = await callOutreachAI({
    action: target.toLowerCase() === "english" ? "translate-to-english" : "translate-reply",
    text,
    sourceLanguage: source,
    targetLanguage: target,
  });

  return payload.translatedText || payload.polishedText || text;
}

export async function polishReply(text: string, targetLanguage: string): Promise<string> {
  if (!text.trim()) return text;

  const payload = await callOutreachAI({
    action: "polish-reply",
    text,
    targetLanguage: getLanguageLabel(targetLanguage),
  });

  return payload.polishedText || payload.translatedText || text;
}

export function getLanguageLabel(language: string | OutreachLanguage): string {
  const raw = String(language || "English").trim();
  if (!raw) return "English";
  return languageAliases.get(raw.toLowerCase()) ?? raw;
}

export function getLanguageBadge(language: string | OutreachLanguage): string {
  const label = getLanguageLabel(language);
  const badges: Record<string, string> = {
    English: "🇬🇧 English",
    Thai: "🇹🇭 Thai",
    Filipino: "🇵🇭 Filipino",
    Vietnamese: "🇻🇳 Vietnamese",
    Indonesian: "🇮🇩 Indonesian",
    Korean: "🇰🇷 Korean",
    Spanish: "🇪🇸 Spanish",
    Chinese: "🇨🇳 Chinese",
    Japanese: "🇯🇵 Japanese",
    Malay: "🇲🇾 Malay",
    Arabic: "Arabic",
    French: "🇫🇷 French",
    German: "🇩🇪 German",
  };
  return badges[label] ?? label;
}

async function callOutreachAI(body: {
  action: "detect-language" | "translate-to-english" | "translate-reply" | "polish-reply";
  text: string;
  sourceLanguage?: string;
  targetLanguage?: string;
  tone?: string;
  campaignContext?: string;
}): Promise<Extract<ApiOutreachResponse, { ok: true }>> {
  const response = await fetch("/api/ai/outreach", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({
    ok: false,
    error: "AI outreach API returned an invalid response.",
  }))) as ApiOutreachResponse;

  if (!response.ok || !payload.ok) {
    throw new Error(payload.ok ? "AI outreach request failed." : payload.error);
  }

  return payload;
}
