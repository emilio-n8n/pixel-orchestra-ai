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
  { id: "opencode-go/kimi-k3", provider: "opencode-go", modelId: "kimi-k3", label: "Kimi K3", capabilities: ["chat"] },
  { id: "opencode-go/kimi-k2.7-code", provider: "opencode-go", modelId: "kimi-k2.7-code", label: "Kimi K2.7 Code", capabilities: ["chat"] },
  { id: "opencode-go/kimi-k2.6", provider: "opencode-go", modelId: "kimi-k2.6", label: "Kimi K2.6", capabilities: ["chat"] },
  { id: "opencode-go/deepseek-v4-pro", provider: "opencode-go", modelId: "deepseek-v4-pro", label: "DeepSeek V4 Pro", capabilities: ["chat"] },
  { id: "opencode-go/deepseek-v4-flash", provider: "opencode-go", modelId: "deepseek-v4-flash", label: "DeepSeek V4 Flash", capabilities: ["chat"] },
  { id: "opencode-go/glm-5.2", provider: "opencode-go", modelId: "glm-5.2", label: "GLM-5.2", capabilities: ["chat"] },
  { id: "opencode-go/grok-4.5", provider: "opencode-go", modelId: "grok-4.5", label: "Grok 4.5", capabilities: ["chat"] },
  { id: "opencode-go/qwen3.7-max", provider: "opencode-go", modelId: "qwen3.7-max", label: "Qwen3.7 Max", capabilities: ["chat"] },
  // ---- image (Cloudflare Workers AI) ----
  { id: "cloudflare/flux-1-schnell", provider: "cloudflare", modelId: "@cf/black-forest-labs/flux-1-schnell", label: "Flux 1 Schnell (Cloudflare)", capabilities: ["image"] },
  { id: "cloudflare/sd-xl-base", provider: "cloudflare", modelId: "@cf/stabilityai/stable-diffusion-xl-base-1.0", label: "Stable Diffusion XL (Cloudflare)", capabilities: ["image"] },
  // ---- subtitles (Groq — only transcription, no generation) ----
  { id: "groq/whisper-large-v3", provider: "groq", modelId: "whisper-large-v3", label: "Whisper Large V3 (Groq)", capabilities: ["audio.transcribe"] },
  // ---- fallback (Lovable AI Gateway — used when nothing else is configured) ----
  { id: "lovable/gemini-image", provider: "lovable", modelId: "google/gemini-2.5-flash-image", label: "Gemini Image (Lovable)", capabilities: ["image"] },
  { id: "lovable/gpt-4o-mini-tts", provider: "lovable", modelId: "openai/gpt-4o-mini-tts", label: "GPT-4o Mini TTS (Lovable)", capabilities: ["audio.speech"] },
];

export function listByCapability(models: DirectorModel[], cap: Capability): DirectorModel[] {
  return models.filter((m) => m.capabilities.includes(cap));
}

export function findModel(models: DirectorModel[], id: string | undefined): DirectorModel | undefined {
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
