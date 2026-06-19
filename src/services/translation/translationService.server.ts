import { GoogleTranslateProvider } from "./providers/googleTranslateProvider";
import {
  type SupportedTranslationLanguageCode,
  TranslationConfigurationError,
  type TranslationProvider,
  type TranslationSourceLanguage,
} from "./types";

export class TranslationService {
  constructor(private readonly provider: TranslationProvider) {}

  detectLanguage(text: string) {
    return this.provider.detectLanguage(text);
  }

  translate(
    text: string,
    sourceLanguage: TranslationSourceLanguage,
    targetLanguage: SupportedTranslationLanguageCode,
  ) {
    return this.provider.translate(text, sourceLanguage, targetLanguage);
  }
}

export function createTranslationService(): TranslationService {
  const providerName = String(process.env.TRANSLATION_PROVIDER ?? "google")
    .trim()
    .toLowerCase();

  if (providerName !== "google") {
    throw new TranslationConfigurationError(
      `Unsupported TRANSLATION_PROVIDER "${providerName}". Supported provider: google.`,
    );
  }

  const apiKey = String(process.env.GOOGLE_TRANSLATE_API_KEY ?? "").trim();

  if (!apiKey) {
    throw new TranslationConfigurationError(
      "GOOGLE_TRANSLATE_API_KEY is missing. Add it to local .env and Vercel environment variables.",
    );
  }

  return new TranslationService(new GoogleTranslateProvider(apiKey));
}
