import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { createAIService } from "@/services/ai/aiService.server";
import { AIConfigurationError, AIProviderError } from "@/services/ai/types";

const outreachRequestSchema = z.object({
  action: z.enum(["detect-language", "translate-to-english", "translate-reply", "polish-reply"]),
  text: z.string(),
  sourceLanguage: z.string().optional(),
  targetLanguage: z.string().optional(),
  tone: z.string().optional(),
  campaignContext: z.string().optional(),
});

export const Route = createFileRoute("/api/ai/outreach")({
  server: {
    handlers: {
      GET: async () => {
        return Response.json({
          ok: true,
          provider: "openrouter",
          configured: Boolean(String(process.env.OPENROUTER_API_KEY ?? "").trim()),
        });
      },
      POST: async ({ request }) => {
        try {
          const body = outreachRequestSchema.parse(await request.json());
          const service = createAIService();
          const result = await service.runOutreachAction(body);

          return Response.json({
            ok: true,
            detectedLanguage: result.data.detectedLanguage || "",
            translatedText: result.data.translatedText || "",
            polishedText: result.data.polishedText || "",
            modelUsed: result.modelUsed,
            warnings: [...(result.data.warnings ?? []), ...result.warnings].filter(Boolean),
          });
        } catch (error) {
          return handleAIError(error, "AI outreach request failed.");
        }
      },
    },
  },
});

function handleAIError(error: unknown, fallbackMessage: string): Response {
  if (error instanceof z.ZodError) {
    return Response.json(
      {
        ok: false,
        error: "Invalid AI outreach request.",
        details: error.flatten(),
      },
      { status: 400 },
    );
  }

  if (error instanceof AIConfigurationError) {
    return Response.json({ ok: false, error: error.message }, { status: 503 });
  }

  if (error instanceof AIProviderError) {
    return Response.json({ ok: false, error: error.message }, { status: error.statusCode });
  }

  const message = error instanceof Error ? error.message : fallbackMessage;
  return Response.json({ ok: false, error: message }, { status: 500 });
}
