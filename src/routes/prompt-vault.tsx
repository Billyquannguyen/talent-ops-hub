import { createFileRoute } from "@tanstack/react-router";

import { PromptVault } from "@/features/prompt-vault/PromptVault";

export const Route = createFileRoute("/prompt-vault")({
  component: PromptVault,
});
