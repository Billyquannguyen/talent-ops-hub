import {
  normalizeTranslationLanguageCode,
  type LanguageDetectionResult,
  type SupportedTranslationLanguageCode,
  type TranslationProvider,
  TranslationProviderError,
  type TranslationResult,
  type TranslationSourceLanguage,
} from "../types";

const googleTranslateBaseUrl = "https://translation.googleapis.com/language/translate/v2";

type GoogleDetectResponse = {
  data?: {
    detections?: Array<
      Array<{
        language?: string;
        confidence?: number;
      }>
    >;
  };
  error?: {
    message?: string;
  };
};

type GoogleTranslateResponse = {
  data?: {
    translations?: Array<{
      translatedText?: string;
      detectedSourceLanguage?: string;
    }>;
  };
  error?: {
    message?: string;
  };
};

export class GoogleTranslateProvider implements TranslationProvider {
  name = "GoogleTranslateProvider";

  constructor(private readonly apiKey: string) {}

  async detectLanguage(text: string): Promise<LanguageDetectionResult> {
    if (!text.trim()) {
      return {
        language: "en",
        confidence: 1,
        provider: this.name,
      };
    }

    const response = await fetch(`${googleTranslateBaseUrl}/detect?key=${this.apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: text }),
    });
    const payload = (await response.json().catch(() => ({}))) as GoogleDetectResponse;

    if (!response.ok) {
      throw new TranslationProviderError(
        payload.error?.message ?? `Google Translate detection failed with ${response.status}.`,
        response.status,
      );
    }

    const detection = payload.data?.detections?.[0]?.[0];

    return {
      language: normalizeTranslationLanguageCode(detection?.language),
      confidence: detection?.confidence,
      provider: this.name,
    };
  }

  async translate(
    text: string,
    sourceLanguage: TranslationSourceLanguage,
    targetLanguage: SupportedTranslationLanguageCode,
  ): Promise<TranslationResult> {
    if (!text.trim() || sourceLanguage === targetLanguage) {
      return {
        translatedText: text,
        sourceLanguage,
        targetLanguage,
        provider: this.name,
      };
    }

    const response = await fetch(`${googleTranslateBaseUrl}?key=${this.apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: text,
        target: targetLanguage,
        format: "text",
        ...(sourceLanguage === "auto" ? {} : { source: sourceLanguage }),
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as GoogleTranslateResponse;

    if (!response.ok) {
      throw new TranslationProviderError(
        payload.error?.message ?? `Google Translate translation failed with ${response.status}.`,
        response.status,
      );
    }

    const translation = payload.data?.translations?.[0];

    return {
      translatedText: decodeHtmlEntities(translation?.translatedText ?? ""),
      sourceLanguage:
        sourceLanguage === "auto"
          ? normalizeTranslationLanguageCode(translation?.detectedSourceLanguage)
          : sourceLanguage,
      targetLanguage,
      provider: this.name,
    };
  }
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
