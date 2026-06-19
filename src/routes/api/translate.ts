import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { createTranslationService } from "@/services/translation/translationService.server";
import {
  supportedTranslationLanguages,
  TranslationConfigurationError,
  TranslationProviderError,
} from "@/services/translation/types";

const languageCodeSchema = z.enum(
  supportedTranslationLanguages.map((language) => language.code) as [
    (typeof supportedTranslationLanguages)[number]["code"],
    ...Array<(typeof supportedTranslationLanguages)[number]["code"]>,
  ],
);

const translateRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("detect"),
    text: z.string(),
  }),
  z.object({
    action: z.literal("translate"),
    text: z.string(),
    sourceLanguage: z.union([languageCodeSchema, z.literal("auto")]),
    targetLanguage: languageCodeSchema,
  }),
]);

export const Route = createFileRoute("/api/translate")({
  server: {
    handlers: {
      GET: async () => {
        return Response.json({
          ok: true,
          provider: "google",
          configured: Boolean(String(process.env.GOOGLE_TRANSLATE_API_KEY ?? "").trim()),
        });
      },
      POST: async ({ request }) => {
        try {
          const body = translateRequestSchema.parse(await request.json());
          const service = createTranslationService();

          if (body.action === "detect") {
            const detection = await service.detectLanguage(body.text);

            return Response.json({
              ok: true,
              action: "detect",
              detectedLanguage: detection.language,
              confidence: detection.confidence,
              provider: detection.provider,
            });
          }

          const translation = await service.translate(
            body.text,
            body.sourceLanguage,
            body.targetLanguage,
          );

          return Response.json({
            ok: true,
            action: "translate",
            translatedText: translation.translatedText,
            sourceLanguage: translation.sourceLanguage,
            targetLanguage: translation.targetLanguage,
            provider: translation.provider,
          });
        } catch (error) {
          if (error instanceof z.ZodError) {
            return Response.json(
              {
                ok: false,
                error: "Invalid translation request.",
                details: error.flatten(),
              },
              { status: 400 },
            );
          }

          if (error instanceof TranslationConfigurationError) {
            return Response.json(
              {
                ok: false,
                error: error.message,
              },
              { status: 503 },
            );
          }

          if (error instanceof TranslationProviderError) {
            return Response.json(
              {
                ok: false,
                error: error.message,
              },
              { status: error.statusCode },
            );
          }

          const message = error instanceof Error ? error.message : "Translation request failed.";
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});
