export type AIJsonRequest = {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
};

export type AIJsonResult<T> = {
  data: T;
  modelUsed: string;
  warnings: string[];
};

export interface AIProvider {
  name: string;
  runJson<T>(request: AIJsonRequest): Promise<AIJsonResult<T>>;
}

export class AIConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIConfigurationError";
  }
}

export class AIProviderError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 502,
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}
