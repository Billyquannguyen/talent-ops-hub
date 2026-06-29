import { OpenRouterProvider } from "./providers/openRouterProvider";
import { AIConfigurationError, type AIJsonResult, type AIProvider } from "./types";

export type OutreachAIAction =
  | "detect-language"
  | "translate-to-english"
  | "translate-reply"
  | "polish-reply";

export type OutreachAIRequest = {
  action: OutreachAIAction;
  text: string;
  sourceLanguage?: string;
  targetLanguage?: string;
  tone?: string;
  campaignContext?: string;
};

export type OutreachAIResponse = {
  detectedLanguage: string;
  translatedText: string;
  polishedText: string;
  warnings: string[];
};

export type ContactExtractionInput = {
  creatorIdentifier: string;
  sourceText: string;
  sourcesChecked: string[];
};

export type ContactExtractionResponse = {
  contacts: {
    email: string;
    line: string;
    whatsapp: string;
    phone: string;
    instagram: string;
    tiktok: string;
    youtube: string;
    website: string;
    other: string;
  };
  confidence: "high" | "medium" | "low";
  source: string;
  reasoning: string;
  warnings: string[];
};

export class AIService {
  constructor(private readonly provider: AIProvider) {}

  async runOutreachAction(request: OutreachAIRequest): Promise<AIJsonResult<OutreachAIResponse>> {
    return this.provider.runJson<OutreachAIResponse>({
      temperature: request.action === "polish-reply" ? 0.25 : 0,
      systemPrompt: [
        "You are Katlas Buddy's multilingual outreach assistant.",
        "You only help with language detection, translation, and light tone cleanup.",
        "Do not invent campaign details, rates, deliverables, claims, names, or promises.",
        "Keep creator communication natural, concise, and faithful to the source.",
        "Return structured JSON only with keys: detectedLanguage, translatedText, polishedText, warnings.",
        "Use empty strings for fields that do not apply.",
      ].join("\n"),
      userPrompt: JSON.stringify({
        task: request.action,
        text: request.text,
        sourceLanguage: normalizeOptionalLanguage(request.sourceLanguage),
        targetLanguage: normalizeOptionalLanguage(request.targetLanguage),
        tone: request.tone || "natural, professional creator outreach",
        campaignContext: request.campaignContext || "",
        outputRules: {
          detectLanguage:
            "For detect-language, identify the human-readable language name. If uncertain, explain in warnings.",
          translateToEnglish:
            "For translate-to-english, translate naturally into English and preserve meaning.",
          translateReply:
            "For translate-reply, translate the English reply naturally into targetLanguage.",
          polishReply: "For polish-reply, make the text sound natural while preserving meaning.",
        },
      }),
    });
  }

  async extractContacts(
    input: ContactExtractionInput,
  ): Promise<AIJsonResult<ContactExtractionResponse>> {
    return this.provider.runJson<ContactExtractionResponse>({
      temperature: 0,
      systemPrompt: [
        "You are Katlas Buddy's multilingual contact extraction engine.",
        "Extract only contact methods that are explicitly present in the provided text.",
        "Do not invent emails, handles, numbers, links, agencies, or contacts.",
        "Recognize business contact wording across languages, scripts, and local creator bios.",
        "Return structured JSON only with keys: contacts, confidence, source, reasoning, warnings.",
        "contacts must include keys: email, line, whatsapp, phone, instagram, tiktok, youtube, website, other.",
        "Use empty strings when a contact field is not found.",
        "confidence must be one of: high, medium, low.",
      ].join("\n"),
      userPrompt: JSON.stringify({
        creatorIdentifier: input.creatorIdentifier,
        sourcesChecked: input.sourcesChecked,
        sourceText: input.sourceText.slice(0, 24000),
        examplesOfRelevantLocalPhrases: [
          "ติดต่องาน",
          "รับงาน",
          "แอดไลน์",
          "liên hệ công việc",
          "hợp tác",
          "kerja sama",
          "kontak bisnis",
          "business inquiries",
          "collab",
          "商务合作",
          "工作联系",
          "비즈니스 문의",
          "お仕事のご依頼",
        ],
      }),
    });
  }
}

export function createAIService(): AIService {
  const providerName = String(process.env.AI_PROVIDER ?? "openrouter")
    .trim()
    .toLowerCase();

  if (providerName !== "openrouter") {
    throw new AIConfigurationError(
      `Unsupported AI_PROVIDER "${providerName}". Supported provider: openrouter.`,
    );
  }

  const apiKey = String(process.env.OPENROUTER_API_KEY ?? "").trim();
  const defaultModel = String(process.env.OPENROUTER_DEFAULT_MODEL ?? "").trim();
  const fallbackModel = String(process.env.OPENROUTER_FALLBACK_MODEL ?? "").trim();

  if (!apiKey) {
    throw new AIConfigurationError(
      "OPENROUTER_API_KEY is missing. Add it to local .env and Vercel environment variables.",
    );
  }

  if (!defaultModel) {
    throw new AIConfigurationError(
      "OPENROUTER_DEFAULT_MODEL is missing. Add it to local .env and Vercel environment variables.",
    );
  }

  return new AIService(
    new OpenRouterProvider(
      apiKey,
      defaultModel,
      fallbackModel || undefined,
      getOpenRouterReferer(),
    ),
  );
}

function normalizeOptionalLanguage(value: string | undefined): string {
  const language = String(value ?? "").trim();
  if (!language || /^auto(?: detect)?$/i.test(language)) return "Auto Detect";
  return language;
}

function getOpenRouterReferer(): string | undefined {
  const explicit = String(process.env.OPENROUTER_HTTP_REFERER ?? "").trim();
  if (explicit) return explicit;

  const productionUrl = String(process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "").trim();
  if (productionUrl) return ensureHttps(productionUrl);

  const vercelUrl = String(process.env.VERCEL_URL ?? "").trim();
  if (vercelUrl) return ensureHttps(vercelUrl);

  return undefined;
}

function ensureHttps(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}
