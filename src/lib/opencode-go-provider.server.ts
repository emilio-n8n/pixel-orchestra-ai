import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export function createOpenCodeGoProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "opencode-go",
    baseURL: "https://opencode.ai/zen/go/v1",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
}
