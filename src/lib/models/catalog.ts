// Unified model catalogue. Every model the Director can use lives here,
// regardless of provider. Each entry declares its capabilities so the
// Director can pick the right model for a task (image, voice, subtitles…).

export type Capability = "chat" | "image" | "audio.speech" | "audio.transcribe";

export type Provider = "opencode-go" | "cloudflare" | "groq" | "lovable" | "gradio";

export interface DirectorModel {
  id: string;
  provider: Provider;
  /** Real model id at the provider (or the endpoint URL for gradio). */
  modelId: string;
  label: string;
  capabilities: Capability[];
  /** User-added via the Models settings tab. */
  custom?: boolean;
}

export const CATALOG: DirectorModel[] = [
  // ---- chat (OpenCode Go only — Cloudflare is never used for text) ----
  // Reconciled 2026-09-07 vs GET https://opencode.ai/zen/go/v1/models (35 live).
  // Excluded: muse-spark-1.3-contributor + muse-spark-1.2-contributor
  // (Responses API only — no Responses router in WS1, chat/completions only).
  {
    id: "opencode-go/minimax-m3",
    provider: "opencode-go",
    modelId: "minimax-m3",
    label: "MiniMax M3",
    capabilities: ["chat"],
  },
  {
    id: "opencode-go/minimax-m2.7",
    provider: "opencode-go",
    modelId: "minimax-m2.7",
    label: "MiniMax M2.7",
    capabilities: ["chat"],
  },
  {
    id: "opencode-go/minimax-m2.5",
    provider: "opencode-go",
    modelId: "minimax-m2.5",
    label: "MiniMax M2.5",
    capabilities: ["chat"],
  },
  {
    id: "opencode-go/kimi-k3",
    provider: "opencode-go",
    modelId: "kimi-k3",
    label: "Kimi K3",
    capabilities: ["chat"],
  },
  {
    id: "opencode-go/kimi-k2.7-code",
    provider: "opencode-go",
    modelId: "kimi-k2.7-code",
    label: "Kimi K2.7 Code",
    capabilities: ["chat"],
  },
  {
    id: "opencode-go/kimi-k2.6",
    provider: "opencode-go",
    modelId: "kimi-k2.6",
    label: "Kimi K2.6",
    capabilities: ["chat"],
  },
  {
    id: "opencode-go/longcat-2.0",
    provider: "opencode-go",
    modelId: "longcat-2.0",
    label: "Longcat 2.0",
    capabilities: ["chat"],
  },
  {
    id: "opencode-go/kimi-k2.5",
    provider: "opencode-go",
    modelId: "kimi-k2.5",
    label: "Kimi K2.5",
    capabilities: ["chat"],
  },
  {
    id: "opencode-go/glm-5.2",
    provider: "opencode-go",
    modelId: "glm-5.2",
    label: "GLM-5.2",
    capabilities: ["chat"],
  },
  {
    id: "opencode-go/glm-5.3-flash",
    provider: "opencode-go",
    modelId: "glm-5.3-flash",
    label: "GLM-5.3 Flash",
    capabilities: ["chat"],
  },
  {
    id: "opencode-go/glm-5.3",
    provider: "opencode-go",
    modelId: "glm-5.3",
    label: "GLM-5.3",
    capabilities: ["chat"],
  },
  {
    id: "opencode-go/glm-5.1",
    provider: "opencode-go",
    modelId: "glm-5.1",
    label: "GLM-5.1",
    capabilities: ["chat"],
  },
  {
    id: "opencode-go/glm-5",
    provider: "opencode-go",
    modelId: "glm-5",
    label: "GLM-5",
    capabilities: ["chat"],
  },
  {
    id: "opencode-go/deepseek-v4-pro",
    provider: "opencode-go",
    modelId: "deepseek-v4-pro",
    label: "DeepSeek V4 Pro",
    capabilities: ["chat"],
  },
  {
    id: "opencode-go/deepseek-v4-flash",
    provider: "opencode-go",
    modelId: "deepseek-v4-flash",
    label: "DeepSeek V4 Flash",
    capabilities: ["chat"],
  },
  {
    id: "opencode-go/deepseek-v4-flash-vision-exp",
    provider: "opencode-go",
    modelId: "deepseek-v4-flash-vision-exp",
    label: "DeepSeek V4 Flash Vision Exp",
    capabilities: ["chat"],
  },
  {
    id: "opencode-go/qwen3.7-max",
    provider: "opencode-go",
    modelId: "qwen3.7-max",
    label: "Qwen3.7 Max",
    capabilities: ["chat"],
  },
  {
    id: "opencode-go/qwen3.8-max",
    provider: "opencode-go",
    modelId: "qwen3.8-max",
    label: "Qwen3.8 Max",
    capabilities: ["chat"],
  },
  {
    id: "opencode-go/qwen3.8-flash",
    provider: "opencode-go",
    modelId: "qwen3.8-flash",
    label: "Qwen3.8 Flash",
    capabilities: ["chat"],
  },
  {
    id: "opencode-go/qwen3.7-plus",
    provider: "opencode-go",
    modelId: "qwen3.7-plus",
    label: "Qwen3.7 Plus",
    capabilities: ["chat"],
  },
  {
    id: "opencode-go/qwen3.6-plus",
    provider: "opencode-go",
    modelId: "qwen3.6-plus",
    label: "Qwen3.6 Plus",
    capabilities: ["chat"],
  },
  {
    id: "opencode-go/qwen3.5-plus",
    provider: "opencode-go",
    modelId: "qwen3.5-plus",
    label: "Qwen3.5 Plus",
    capabilities: ["chat"],
  },
  {
    id: "opencode-go/mimo-v2-pro",
    provider: "opencode-go",
    modelId: "mimo-v2-pro",
    label: "MiMo-V2 Pro",
    capabilities: ["chat"],
  },
  {
    id: "opencode-go/mimo-v2-omni",
    provider: "opencode-go",
    modelId: "mimo-v2-omni",
    label: "MiMo-V2 Omni",
    capabilities: ["chat"],
  },
  {
    id: "opencode-go/mimo-v2.5-pro",
    provider: "opencode-go",
    modelId: "mimo-v2.5-pro",
    label: "MiMo-V2.5-Pro",
    capabilities: ["chat"],
  },
  {
    id: "opencode-go/mimo-v2.5",
    provider: "opencode-go",
    modelId: "mimo-v2.5",
    label: "MiMo-V2.5",
    capabilities: ["chat"],
  },
  {
    id: "opencode-go/hy4-preview",
    provider: "opencode-go",
    modelId: "hy4-preview",
    label: "HY4 Preview",
    capabilities: ["chat"],
  },
  {
    id: "opencode-go/hy3",
    provider: "opencode-go",
    modelId: "hy3",
    label: "HY3",
    capabilities: ["chat"],
  },
  {
    id: "opencode-go/hy3-preview",
    provider: "opencode-go",
    modelId: "hy3-preview",
    label: "HY3 Preview",
    capabilities: ["chat"],
  },
  {
    id: "opencode-go/gpt-5.6-luna",
    provider: "opencode-go",
    modelId: "gpt-5.6-luna",
    label: "GPT-5.6 Luna",
    capabilities: ["chat"],
  },
  {
    id: "opencode-go/grok-4.5",
    provider: "opencode-go",
    modelId: "grok-4.5",
    label: "Grok 4.5",
    capabilities: ["chat"],
  },
  {
    id: "opencode-go/grok-4.6",
    provider: "opencode-go",
    modelId: "grok-4.6",
    label: "Grok 4.6",
    capabilities: ["chat"],
  },
  {
    id: "opencode-go/omen-alpha",
    provider: "opencode-go",
    modelId: "omen-alpha",
    label: "Omen Alpha",
    capabilities: ["chat"],
  },
  // ---- image (Cloudflare Workers AI) ----
  {
    id: "cloudflare/flux-1-schnell",
    provider: "cloudflare",
    modelId: "@cf/black-forest-labs/flux-1-schnell",
    label: "Flux 1 Schnell (Cloudflare)",
    capabilities: ["image"],
  },
  {
    id: "cloudflare/sd-xl-base",
    provider: "cloudflare",
    modelId: "@cf/stabilityai/stable-diffusion-xl-base-1.0",
    label: "Stable Diffusion XL (Cloudflare)",
    capabilities: ["image"],
  },
  // ---- subtitles (Groq — only transcription, no generation) ----
  {
    id: "groq/whisper-large-v3",
    provider: "groq",
    modelId: "whisper-large-v3",
    label: "Whisper Large V3 (Groq)",
    capabilities: ["audio.transcribe"],
  },
  // ---- fallback (Lovable AI Gateway — used when nothing else is configured) ----
  {
    id: "lovable/gemini-image",
    provider: "lovable",
    modelId: "google/gemini-2.5-flash-image",
    label: "Gemini Image (Lovable)",
    capabilities: ["image"],
  },
  {
    id: "lovable/gpt-4o-mini-tts",
    provider: "lovable",
    modelId: "openai/gpt-4o-mini-tts",
    label: "GPT-4o Mini TTS (Lovable)",
    capabilities: ["audio.speech"],
  },
];

export function listByCapability(models: DirectorModel[], cap: Capability): DirectorModel[] {
  return models.filter((m) => m.capabilities.includes(cap));
}

export function findModel(
  models: DirectorModel[],
  id: string | undefined,
): DirectorModel | undefined {
  if (!id) return undefined;
  return models.find((m) => m.id === id || m.modelId === id);
}

/** Pick a model for a task: explicit id wins, otherwise first matching entry. */
export function pickModel(
  models: DirectorModel[],
  cap: Capability,
  preferredId?: string,
): DirectorModel | undefined {
  if (preferredId) {
    const explicit = findModel(models, preferredId);
    if (explicit && explicit.capabilities.includes(cap)) return explicit;
  }
  return listByCapability(models, cap)[0];
}

/** Human-readable capability label. */
export function capLabel(c: Capability): string {
  switch (c) {
    case "chat":
      return "Chat";
    case "image":
      return "Image generation";
    case "audio.speech":
      return "Voice / TTS";
    case "audio.transcribe":
      return "Subtitles / transcription";
  }
}
