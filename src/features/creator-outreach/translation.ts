import type { OutreachLanguage } from "./types";

export type TranslationRequest = {
  text: string;
  sourceLanguage: OutreachLanguage;
  targetLanguage: OutreachLanguage;
};

type ApiDetectResponse =
  | {
      ok: true;
      action: "detect";
      detectedLanguage: TranslationApiLanguageCode;
      confidence?: number;
      provider: string;
    }
  | {
      ok: false;
      error: string;
    };

type ApiTranslateResponse =
  | {
      ok: true;
      action: "translate";
      translatedText: string;
      sourceLanguage: TranslationApiLanguageCode | "auto";
      targetLanguage: TranslationApiLanguageCode;
      provider: string;
    }
  | {
      ok: false;
      error: string;
    };

type TranslationApiLanguageCode = "en" | "th" | "tl" | "vi" | "id" | "ko" | "es";

const outreachToApiLanguage: Record<OutreachLanguage, TranslationApiLanguageCode> = {
  english: "en",
  thai: "th",
  filipino: "tl",
  vietnamese: "vi",
  indonesian: "id",
  korean: "ko",
  spanish: "es",
};

const apiToOutreachLanguage: Record<TranslationApiLanguageCode, OutreachLanguage> = {
  en: "english",
  th: "thai",
  tl: "filipino",
  vi: "vietnamese",
  id: "indonesian",
  ko: "korean",
  es: "spanish",
};

export async function detectLanguage(text: string): Promise<OutreachLanguage> {
  if (!text.trim()) return "english";

  const response = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "detect", text }),
  });
  const payload = (await response.json().catch(() => ({
    ok: false,
    error: "Translation API returned an invalid response.",
  }))) as ApiDetectResponse;

  if (!response.ok || !payload.ok) {
    throw new Error(payload.ok ? "Language detection failed." : payload.error);
  }

  return apiToOutreachLanguage[payload.detectedLanguage] ?? "english";
}

export async function translateText({
  text,
  sourceLanguage,
  targetLanguage,
}: TranslationRequest): Promise<string> {
  if (!text.trim() || sourceLanguage === targetLanguage) return text;

  const response = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "translate",
      text,
      sourceLanguage: outreachToApiLanguage[sourceLanguage],
      targetLanguage: outreachToApiLanguage[targetLanguage],
    }),
  });
  const payload = (await response.json().catch(() => ({
    ok: false,
    error: "Translation API returned an invalid response.",
  }))) as ApiTranslateResponse;

  if (!response.ok || !payload.ok) {
    throw new Error(payload.ok ? "Translation failed." : payload.error);
  }

  return payload.translatedText;
}

export function getLanguageLabel(language: OutreachLanguage): string {
  const labels: Record<OutreachLanguage, string> = {
    english: "English",
    thai: "Thai",
    filipino: "Filipino",
    vietnamese: "Vietnamese",
    indonesian: "Indonesian",
    korean: "Korean",
    spanish: "Spanish",
  };
  return labels[language];
}

export function getLanguageBadge(language: OutreachLanguage): string {
  const labels: Record<OutreachLanguage, string> = {
    english: "🇬🇧 English",
    thai: "🇹🇭 Thai",
    filipino: "🇵🇭 Filipino",
    vietnamese: "🇻🇳 Vietnamese",
    indonesian: "🇮🇩 Indonesian",
    korean: "🇰🇷 Korean",
    spanish: "🇪🇸 Spanish",
  };
  return labels[language];
}
