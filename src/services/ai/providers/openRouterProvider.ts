import { AIProviderError, type AIJsonRequest, type AIJsonResult, type AIProvider } from "../types";

const openRouterChatCompletionsUrl = "https://openrouter.ai/api/v1/chat/completions";

type OpenRouterResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

export class OpenRouterProvider implements AIProvider {
  name = "OpenRouterProvider";

  constructor(
    private readonly apiKey: string,
    private readonly defaultModel: string,
    private readonly fallbackModel?: string,
    private readonly referer?: string,
  ) {}

  async runJson<T>(request: AIJsonRequest): Promise<AIJsonResult<T>> {
    const models = [this.defaultModel, this.fallbackModel].filter(Boolean) as string[];
    const warnings: string[] = [];
    let lastError: unknown;

    for (const model of models) {
      try {
        const data = await this.callModel<T>(model, request);
        return {
          data,
          modelUsed: model,
          warnings,
        };
      } catch (error) {
        lastError = error;
        warnings.push(
          error instanceof Error
            ? `${model}: ${error.message}`
            : `${model}: OpenRouter request failed.`,
        );
      }
    }

    if (lastError instanceof AIProviderError) throw lastError;
    if (lastError instanceof Error) throw new AIProviderError(lastError.message);
    throw new AIProviderError("OpenRouter request failed.");
  }

  private async callModel<T>(model: string, request: AIJsonRequest): Promise<T> {
    const response = await fetch(openRouterChatCompletionsUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "X-OpenRouter-Title": "Katlas Buddy",
        ...(this.referer ? { "HTTP-Referer": this.referer } : {}),
      },
      body: JSON.stringify({
        model,
        temperature: request.temperature ?? 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: request.systemPrompt,
          },
          {
            role: "user",
            content: request.userPrompt,
          },
        ],
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as OpenRouterResponse;

    if (!response.ok) {
      throw new AIProviderError(
        payload.error?.message ?? `OpenRouter request failed with ${response.status}.`,
        response.status,
      );
    }

    const content = payload.choices?.[0]?.message?.content ?? "";
    if (!content.trim()) {
      throw new AIProviderError("OpenRouter returned an empty response.");
    }

    return parseJsonContent<T>(content);
  }
}

function parseJsonContent<T>(content: string): T {
  const trimmed = content.trim();
  const unfenced = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(unfenced) as T;
  } catch {
    const start = unfenced.indexOf("{");
    const end = unfenced.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(unfenced.slice(start, end + 1)) as T;
    }
    throw new AIProviderError("OpenRouter returned invalid JSON.");
  }
}
