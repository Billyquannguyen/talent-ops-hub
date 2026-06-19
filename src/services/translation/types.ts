export const supportedTranslationLanguages = [
  { code: "en", label: "English", badge: "🇬🇧 English" },
  { code: "th", label: "Thai", badge: "🇹🇭 Thai" },
  { code: "tl", label: "Filipino", badge: "🇵🇭 Filipino" },
  { code: "vi", label: "Vietnamese", badge: "🇻🇳 Vietnamese" },
  { code: "id", label: "Indonesian", badge: "🇮🇩 Indonesian" },
  { code: "ko", label: "Korean", badge: "🇰🇷 Korean" },
  { code: "es", label: "Spanish", badge: "🇪🇸 Spanish" },
] as const;

export type SupportedTranslationLanguageCode =
  (typeof supportedTranslationLanguages)[number]["code"];

export type TranslationSourceLanguage = SupportedTranslationLanguageCode | "auto";

export type LanguageDetectionResult = {
  language: SupportedTranslationLanguageCode;
  confidence?: number;
  provider: string;
};

export type TranslationResult = {
  translatedText: string;
  sourceLanguage: TranslationSourceLanguage;
  targetLanguage: SupportedTranslationLanguageCode;
  provider: string;
};

export interface TranslationProvider {
  name: string;
  detectLanguage(text: string): Promise<LanguageDetectionResult>;
  translate(
    text: string,
    sourceLanguage: TranslationSourceLanguage,
    targetLanguage: SupportedTranslationLanguageCode,
  ): Promise<TranslationResult>;
}

export class TranslationConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranslationConfigurationError";
  }
}

export class TranslationProviderError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 502,
  ) {
    super(message);
    this.name = "TranslationProviderError";
  }
}

export function normalizeTranslationLanguageCode(
  value: string | undefined,
): SupportedTranslationLanguageCode {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  if (normalized === "fil" || normalized === "tagalog") return "tl";
  if (normalized === "in") return "id";
  if (normalized === "kr") return "ko";

  return supportedTranslationLanguages.some((language) => language.code === normalized)
    ? (normalized as SupportedTranslationLanguageCode)
    : "en";
}
