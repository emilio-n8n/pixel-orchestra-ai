// Server-side model resolution. Each provider has its own transport:
//   - Cloudflare Workers AI → REST /ai/run/{model} (image)
//   - Groq → OpenAI-compatible audio transcriptions (subtitles)
//   - Lovable AI Gateway → fallback for image/voice (LOVABLE_API_KEY)
// These return raw bytes / text; the caller (handlers.server.ts) is
// responsible for storing the result as an asset.

import type { DirectorModel } from "./catalog";

export interface ModelCreds {
  cloudflareAccountId?: string;
  cloudflareApiKey?: string;
  groqApiKey?: string;
}

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1";

function lovableKey(): string {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  return key;
}

/** Generate an image via Cloudflare Workers AI. Returns PNG/JPEG bytes. */
export async function generateImageCloudflare(
  model: DirectorModel,
  prompt: string,
  creds: ModelCreds,
): Promise<{ mime: string; bytes: Uint8Array }> {
  if (!creds.cloudflareAccountId || !creds.cloudflareApiKey) {
    throw new Error("Cloudflare not configured (account id + API token required)");
  }
  const url = `https://api.cloudflare.com/client/v4/accounts/${creds.cloudflareAccountId}/ai/run/${model.modelId}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.cloudflareApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) {
    throw new Error(`cloudflare image failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("image/")) {
    return { mime: contentType.split(";")[0], bytes: new Uint8Array(await res.arrayBuffer()) };
  }
  // Some models return JSON with a base64 payload.
  const data = (await res.json()) as { result?: { image?: string } };
  const b64 = data?.result?.image;
  if (!b64) throw new Error("cloudflare image returned no image payload");
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return { mime: "image/png", bytes };
}

/** Fallback image generation via the Lovable AI Gateway (Gemini). */
export async function generateImageLovable(prompt: string): Promise<{ mime: string; bytes: Uint8Array }> {
  const res = await fetch(`${LOVABLE_AI_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableKey()}`,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-image",
      messages: [{ role: "user", content: prompt }],
      modalities: ["image", "text"],
    }),
  });
  if (!res.ok) throw new Error(`image gen failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const url: string | undefined = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url || !url.startsWith("data:")) throw new Error("image gen returned no image");
  const [meta, b64] = url.split(",");
  const mime = /data:([^;]+)/.exec(meta)?.[1] ?? "image/png";
  return { mime, bytes: Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)) };
}

/** Transcribe audio via Groq (whisper-large-v3). Returns the transcript text. */
export async function transcribeAudioGroq(
  bytes: Uint8Array,
  mime: string,
  groqApiKey: string,
): Promise<{ text: string }> {
  if (!groqApiKey) throw new Error("Groq API key not configured (Director settings → Groq)");
  const form = new FormData();
  const ext = mime.includes("mp3") ? "mp3" : mime.includes("wav") ? "wav" : "m4a";
  form.append("file", new Blob([bytes as unknown as BlobPart], { type: mime }), `audio.${ext}`);
  form.append("model", "whisper-large-v3");
  form.append("temperature", "0");
  form.append("response_format", "verbose_json");

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${groqApiKey}` },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`groq transcription failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  }
  const data = (await res.json()) as { text?: string };
  return { text: (data?.text ?? "").trim() };
}
