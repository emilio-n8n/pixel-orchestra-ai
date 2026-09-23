import { createFileRoute } from "@tanstack/react-router";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
  streamText,
  stepCountIs,
  toUIMessageStream,
  tool,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { CATALOG, listByCapability, capLabel, type DirectorModel } from "@/lib/models/catalog";
import { UI_LABELS, providerBodySlice } from "@/lib/ui/labels";
import { sanitizeUiMessages } from "@/lib/director/history";

/**
 * Actionable FR provider error (HTTP status + body ≤500ch). Single
 * source used by the catch block AND both streams' onError — the SDK
 * defaults to masking server errors as "An error occurred.", which is
 * why failed turns used to surface zero diagnostics.
 */
function formatProviderError(err: unknown): string {
  const eRec = (err ?? {}) as Record<string, unknown>;
  const statusCode = typeof eRec.statusCode === "number" ? ` — HTTP ${eRec.statusCode}` : "";
  let providerBody = "";
  const rawBody = eRec.responseBody;
  if (typeof rawBody === "string" && rawBody.length > 0) {
    providerBody = `\n${UI_LABELS.director.reponseFournisseur} : ${providerBodySlice(rawBody)}`;
  } else if (rawBody != null) {
    try {
      providerBody = `\n${UI_LABELS.director.reponseFournisseur} : ${providerBodySlice(JSON.stringify(rawBody))}`;
    } catch {
      /* ignore */
    }
  }
  const baseMessage = (err as Error)?.message ?? String(err);
  return `${UI_LABELS.director.arretDirecteur} : ${baseMessage}${statusCode}${providerBody}`;
}

type UiPart = { type: string; state?: string; output?: unknown; toolCallId?: string };

function isToolPart(p: unknown): p is UiPart {
  if (typeof p !== "object" || p === null) return false;
  const t = (p as { type?: unknown }).type;
  return typeof t === "string" && (t.startsWith("tool-") || t === "dynamic-tool");
}

/**
 * Vision model used by `preview_frame`. The browser renders the frame (no
 * server-side renderer on Workers) and posts it here as a data URL; this
 * model turns it into text the Director can read back in the tool result
 * (OpenAI-compatible tool messages cannot carry images).
 */
/** Timeline tracks the Director can place clips on (Video 2/3 = overlays). */
const TRACK_ENUM = z.enum(["Video", "Video 2", "Video 3", "Audio", "Music", "SFX", "Subtitles"]);

const VISION_MODEL_ID = "deepseek-v4-flash-vision-exp";
const VISION_SYSTEM =
  "Tu regardes une frame 1280×720 d'une timeline vidéo, capturée à un instant précis. " +
  "Décris en français, en 3 à 6 phrases maximum, ce que tu vois réellement : cadrage, sujet, texte affiché (recopie-le tel quel), couleurs dominantes, chevauchements ou éléments manquants, et tout défaut visible (texte coupé, image noire, sous-titre illisible…). " +
  "Sois factuel et précis ; ne suppose rien au-delà de l'image.";

/**
 * Append a notice as a text part of the streamed message. Only protocol
 * chunks are written: `message-start`/`message-end` do not exist in the
 * UI message protocol and make the client reject the whole stream
 * ("Type validation failed") — i.e. the turn shows a raw error.
 */
function writeNotice(writer: { write: (chunk: never) => void }, id: string, text: string): void {
  writer.write({ type: "text-start", id } as never);
  writer.write({ type: "text-delta", id, delta: text } as never);
  writer.write({ type: "text-end", id } as never);
}

export const Route = createFileRoute("/api/director")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("Authorization") ?? "";
        const token = auth.replace(/^Bearer\s+/i, "");
        if (!token) return new Response("Non autorisé", { status: 401 });

        const body = (await request.json()) as {
          kind?: "preview_frame";
          messages: UIMessage[];
          projectId: string;
          apiKey: string;
          model?: string;
          customModels?: DirectorModel[];
          cloudflareAccountId?: string;
          cloudflareApiKey?: string;
          groqApiKey?: string;
          sessionId?: string;
          imageDataUrl?: string;
          focus?: string;
        };
        if (!body?.projectId) return new Response("projectId requis", { status: 400 });
        if (!body?.apiKey) return new Response("apiKey requise", { status: 400 });

        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY!,
          {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { persistSession: false, autoRefreshToken: false },
          },
        );
        const { data: userData, error: userErr } = await supabase.auth.getUser(token);
        if (userErr || !userData.user) return new Response("Non autorisé", { status: 401 });
        const userId = userData.user.id;
        const projectId = body.projectId;
        // Trim every pasted credential/id: stray whitespace produces an
        // opaque provider 500 — fail clean instead.
        const modelId = (body.model ?? "kimi-k2.7-code").trim() || "kimi-k2.7-code";
        const apiKey = (body.apiKey ?? "").trim();
        if (!apiKey) return new Response("apiKey requise", { status: 400 });
        // Stable session id per conversation — OpenCode Go requires it as
        // x-opencode-session for routing + prompt caching (400 otherwise).
        // Falls back to a per-project id when the client sends none.
        const sessionId = (body.sessionId ?? "").trim() || `lilium-${projectId}`;

        // Unified catalogue = builtin + sanitized user custom models
        // (dedupe by id keeping builtin, drop malformed entries so the
        // LLM is never advertised a model that cannot run).
        const seenIds = new Set(CATALOG.map((m) => m.id));
        const customModels = (body.customModels ?? []).flatMap((m) => {
          if (!m || typeof m.id !== "string" || typeof m.modelId !== "string") return [];
          const id = m.id.trim();
          const mid = m.modelId.trim();
          if (!id || !mid || seenIds.has(id)) return [];
          if (!Array.isArray(m.capabilities) || m.capabilities.length === 0) return [];
          seenIds.add(id);
          return [{ ...m, id, modelId: mid }];
        });
        const models = [...CATALOG, ...customModels];
        const creds = {
          cloudflareAccountId: body.cloudflareAccountId?.trim() || undefined,
          cloudflareApiKey: body.cloudflareApiKey?.trim() || undefined,
          groqApiKey: body.groqApiKey?.trim() || undefined,
        };

        const H = await import("@/lib/director/handlers.server");
        const ctx = { supabase, userId, projectId, models, creds };

        const { createOpenCodeGoProvider } = await import("@/lib/opencode-go-provider.server");
        const provider = createOpenCodeGoProvider(apiKey);
        const model = provider(modelId);

        // -----------------------------------------------------------------
        // preview_frame: the browser posts a captured frame (data URL) and
        // gets back a vision description. Separate from the chat turn — no
        // messages, no tools, just the image.
        // -----------------------------------------------------------------
        if (body.kind === "preview_frame") {
          const image = (body.imageDataUrl ?? "").trim();
          const isImage = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(image);
          if (!isImage || image.length > 4_000_000) {
            return new Response(UI_LABELS.director.frameImageInvalide, { status: 400 });
          }
          const focus = (body.focus ?? "").trim().slice(0, 300);
          try {
            const { text } = await generateText({
              model: provider(VISION_MODEL_ID),
              system: VISION_SYSTEM,
              messages: [
                {
                  role: "user",
                  content: [
                    {
                      type: "text",
                      text: focus ? `Consigne de vérification : ${focus}` : "Décris cette frame.",
                    },
                    { type: "image", image },
                  ],
                },
              ],
              headers: {
                "x-opencode-session": `preview-${sessionId}`,
                "User-Agent": "lilium-studio-director/1.0",
              },
            });
            return Response.json({ description: text.trim() });
          } catch (err) {
            console.error("[/api/director] preview_frame vision failed:", err);
            return new Response(UI_LABELS.director.frameVision, { status: 502 });
          }
        }

        const { generateHtmlCard } = await import("@/lib/director/html-cards.server");

        // Tell the Director which image models exist so it can pick one.
        const imageModels = listByCapability(models, "image")
          .map((m) => `- ${m.id} (${m.label}, ${m.provider})`)
          .join("\n");
        const transcribeModels = listByCapability(models, "audio.transcribe")
          .map((m) => `- ${m.id} (${m.label}, ${m.provider})`)
          .join("\n");
        const hasCloudflare = Boolean(creds.cloudflareAccountId && creds.cloudflareApiKey);

        const systemPrompt =
          "You are the Director inside Lilium Studio — an AI video/creative producer. You can generate images, voiceovers, and HTML title cards, then place them on the timeline (tracks: Video, Audio, Music, SFX, Subtitles). After generating any asset, add it to the appropriate track so the user sees a live preview. Be concise; act, do not narrate.\n\n" +
          `AVAILABLE IMAGE MODELS (pass one as model_id to generate_image, or omit for the default):\n${imageModels}\n\n` +
          `AVAILABLE TRANSCRIPTION MODELS (generate_subtitles):\n${transcribeModels}\n\n` +
          (hasCloudflare
            ? "Cloudflare Workers AI is configured — prefer a Cloudflare image model (flux-1-schnell, sd-xl-base) for image generation."
            : "Cloudflare is NOT configured — use the Lovable fallback for images (no model_id needed).") +
          "\n\n" +
          "USER-ASSISTED GENERATION: For video, music, or when the user wants a better quality generation (complex image, special video), you do NOT generate — call generate_image/generate_video/generate_music with external:true. That creates a PENDING asset visible in the user's Library, waiting for a file. Tell the user what is pending and that you will wait. Then use wait_for_user_assets (or list_pending_assets) to check when it is ready; once ready, place it on the timeline. For audio, wait until you know the real duration_ms before placing.\n" +
          "IMPORTANT: NEVER poll wait_for_user_assets repeatedly — check it at most ONCE after the user says the files are ready. If the assets are still pending, stop and wait for the user to confirm they dropped the files. Do not loop on the same tool call; do not retry a failed generation more than once." +
          "\n\n" +
          "AUDIO OVERLAP: Never let two audio clips overlap on the same track. generate_voice returns the real duration_ms of the audio file in its metadata — trust it, never estimate or guess the duration. add_to_timeline uses that real duration automatically for overlap detection (it never underestimates), so do NOT pass duration_ms for audio clips unless you intentionally want a longer clip. Pay attention to the _warning field returned by add_to_timeline: if present, the clip was shifted or its duration was adjusted. Use separate tracks for different audio types: Audio=voiceover, Music=background, SFX=effects. If you need silence, remove the existing clip first with remove_from_timeline, then re-add." +
          "\n\n" +
          'HTML CARDS (generate_html_card): for titles, intros, outros, scene transitions, lower thirds and any typographic/graphic overlay, ALWAYS prefer an ANIMATED HTML card over a static image — the timeline renders the card frame-by-frame, so its CSS animations (entrance + ambient motion) become real video motion. Describe the motion explicitly in the brief (e.g. "fade-in + slide-up title with a slow gradient shift and pulsing glow"). The card generator produces the keyframes itself; give it the text, the vibe, the colors and the motion you want. Only use generate_image for actual imagery (scenes, subjects, backgrounds) — not for text titles.' +
          "\n\n" +
          'TRIM & RIPPLE: trim_clip works at frame level (30 fps) — edge "in"/"out", delta_frames (positive = cut, negative = extend), snap (magnetic to clip edges) and ripple (shift every later clip to close the gap). update_timeline_clip also takes ripple:true to move a clip together with everything after it. Prefer frame-accurate deltas over eyeballed ms, and check the returned _warning/shifted_clips.' +
          "\n\n" +
          "MARKERS & CHAPTERS: add_marker(t_ms, label) drops a YouTube chapter marker on the timeline; list_markers returns the markers plus the chapter text ready to paste in the description (first chapter at 0:00). Add one marker at each section start when the user asks for chapters or a structured video." +
          "\n\n" +
          "KEYFRAMES (set_clip_keyframes): animate a clip transform over its own time — t_ms is CLIP-LOCAL (0 = clip start), properties interpolate linearly and omitted ones keep the static transform. Zoom-in = [{t_ms:0,scale:1},{t_ms:2000,scale:1.15}]; slide-in from the left = [{t_ms:0,x:0.2},{t_ms:800,x:0.5}]; fade-in = [{t_ms:0,opacity:0},{t_ms:600,opacity:1}]. Combine with set_clip_transform for a static base (e.g. PiP scale 0.35 then a slow zoom to 0.4)." +
          "\n\n" +
          'TRACKS & OVERLAYS: video tracks are Video (base), Video 2 and Video 3 (overlays, composited on top in that order). Use Video 2/Video 3 for B-roll, picture-in-picture and split-screen: add_to_timeline with track "Video 2", then set_clip_transform to place it (PiP top-right = scale 0.35, x 0.8, y 0.2). Never let two clips overlap on the SAME track (the anti-overlap system shifts them) — overlapping across tracks is normal and intended.' +
          "\n\n" +
          'VISUAL CHECK (preview_frame): you can look at an actual frame of the timeline. Call preview_frame with a clip_id (optionally t_ms — ABSOLUTE timeline ms — and focus, e.g. "is the title text cut off?") and you get back a vision-model description of what is really on screen: framing, on-screen text, colors, overlaps, glitches. Use it after generating or placing a title card / image, before declaring a visual result done, or whenever the user doubts what the frame looks like.' +
          "\n\n" +
          'TIMELINE EDITING: to move or resize an existing clip use update_timeline_clip (start_ms to shift it, duration_ms to resize, track to move it, fade_in_ms/fade_out_ms for volume fades) — never remove+re-add for a simple edit. To swap an asset inside an existing clip use replace_clip_asset (e.g. a regenerated voiceover: generate_voice first, then replace_clip_asset) — it keeps the clip position and resizes to the real duration. Only remove_from_timeline when a clip must disappear (pass ripple:true to close the gap — later clips on the track slide left). Subtitles (generate_subtitles) must match the voice duration exactly; do not resize subtitle clips manually. When the user asks to "start the music at Xs with a fade-in", use update_timeline_clip with start_ms + fade_in_ms on the music clip.' +
          "\n\n" +
          'SILENCE CLIPS: for pauses, pacing and "rhythmic narration" templates, use insert_silence_clip (duration_ms + optional start_ms) — never compute start_ms gaps by hand. A silence clip on a track blocks that time range: other clips placed after it are shifted right by the anti-overlap system automatically. Use silences to create natural pacing between voiceover lines, or to reserve space before/after sounds.' +
          "\n\n" +
          "SUBTITLES: generate_subtitles transcribes a voice and places the captions. To fix a word or restyle captions (font, size, color, position) use edit_subtitles on the subtitle clip — the timeline renders text from the clip meta. Never resize subtitle clips manually; their duration comes from the voice." +
          "\n\n" +
          "VOICE TAKES: when the user wants options or you're unsure about delivery, call generate_voice_takes (3 variations of the same line, one take_group). Place the takes on the Audio track for A/B, or leave them in the Library and tell the user to pick; once chosen, swap the winner onto the clip with replace_clip_asset (it keeps the position and resizes to the real duration)." +
          "\n\n" +
          "DUCKING: once voice (Audio) and music (Music) are both placed, call apply_ducking ONCE — the music automatically drops under the voice with smooth attack/release (default -12 dB, 200ms attack, 400ms release). You do NOT need to manage music fades manually when ducking is on. If the user later moves clips, call apply_ducking again to recompute the curve." +
          "\n\n" +
          "TRANSITIONS: to crossfade between two clips on the same track (a dissolve for video, a volume cross-fade for audio), call set_clip_transitions with both clip ids and the overlap ms — clip B is moved automatically to overlap clip A's tail. For a simple fade to black at the start/end of one video clip, use update_timeline_clip (fade_in_ms/fade_out_ms on audio, transition_in_ms/transition_out_ms on video clips)." +
          "\n\n" +
          "SFX (generate_sfx): for sound effects there is no built-in model — create a pending asset with a precise description; the user provides the file and you place it on the SFX track when ready (wait_for_user_assets)." +
          "\n\n" +
          'LINEAGE: every generated asset records its provenance (tool, prompt, source assets). If the user asks "what depends on this asset" or "how was this made", use get_lineage with the asset id.';

        const tools = {
          generate_image: tool({
            description:
              "Generate an image from a text prompt. Pass model_id (one of the AVAILABLE IMAGE MODELS) to choose a model, or set external=true to create a pending asset for the user to generate elsewhere.",
            inputSchema: z.object({
              prompt: z.string(),
              model_id: z.string().optional(),
              external: z.boolean().optional(),
            }),
            execute: async ({ prompt, model_id, external }) => {
              if (external) return H.createPendingAsset(ctx, "image", prompt);
              return H.generateImage(ctx, prompt, model_id);
            },
          }),
          generate_video: tool({
            description:
              "Request a video. There is no built-in video model — always creates a pending asset so the user can generate the video elsewhere and drop it into the Library. Pass a detailed brief as the prompt.",
            inputSchema: z.object({ brief: z.string() }),
            execute: ({ brief }) => H.createPendingAsset(ctx, "video", brief),
          }),
          generate_music: tool({
            description:
              "Request a music / background track. There is no built-in music model — always creates a pending asset so the user can provide the audio file. Pass a description of the mood/style as the prompt.",
            inputSchema: z.object({ brief: z.string() }),
            execute: ({ brief }) => H.createPendingAsset(ctx, "audio", brief),
          }),
          wait_for_user_assets: tool({
            description:
              "Check the status of pending assets (created with external generation). Returns pending/ready per asset id; ready entries include the real url and duration_ms (for audio) plus the supabase_id to use with add_to_timeline.",
            inputSchema: z.object({ asset_ids: z.array(z.string()) }),
            execute: ({ asset_ids }) => H.waitForUserAssets(ctx, asset_ids),
          }),
          list_pending_assets: tool({
            description:
              "List all pending assets (id, kind, prompt) waiting for the user to provide a file.",
            inputSchema: z.object({}),
            execute: () => H.listPendingAssets(ctx),
          }),
          generate_voice: tool({
            description:
              "Generate a voiceover / narration (TTS). The returned asset includes the real duration_ms of the audio in its meta — always read it and never estimate the duration yourself.",
            inputSchema: z.object({
              text: z.string(),
              voice: z.enum(["alloy", "echo", "fable", "onyx", "nova", "shimmer"]).optional(),
            }),
            execute: ({ text, voice }) => H.generateVoice(ctx, text, voice),
          }),
          generate_voice_takes: tool({
            description:
              "Generate n (default 3) variations of the SAME line so the user can pick the best one. Use when the user wants options, or for narration you want to A/B. All takes share a take_group; place them all on the Audio track (or leave them in the Library) and tell the user to pick — then swap the winner with replace_clip_asset.",
            inputSchema: z.object({
              text: z.string(),
              voice: z.enum(["alloy", "echo", "fable", "onyx", "nova", "shimmer"]).optional(),
              n: z.number().int().min(1).max(5).optional(),
            }),
            execute: ({ text, voice, n }) => H.generateVoiceTakes(ctx, text, voice, n),
          }),
          generate_html_card: tool({
            description:
              "Generate an ANIMATED HTML card (title, lower third, credits, transition) — the card ships with CSS keyframes (entrance + ambient motion) that become real video motion at export. Pass the text, vibe, colors and the motion you want in the brief.",
            inputSchema: z.object({ brief: z.string() }),
            execute: ({ brief }) => generateHtmlCard(ctx, model, brief, { sessionId }),
          }),
          generate_subtitles: tool({
            description:
              "Transcribe an audio asset with Groq (whisper-large-v3) and place the text as a Subtitles clip on the timeline. Pass the audio asset_id.",
            inputSchema: z.object({ asset_id: z.string() }),
            execute: ({ asset_id }) => H.transcribeAudio(ctx, asset_id),
          }),
          add_to_timeline: tool({
            description:
              "Place an existing asset on a timeline track. For audio assets, the real duration_ms from the asset metadata is used automatically for overlap detection (never underestimated); pass duration_ms only if you intentionally want a longer clip. If the clip would overlap existing clips on the same track, it is automatically shifted. Check the _warning field in the result — if present, the clip was moved or its duration was adjusted. Audio clips (Audio, Music, SFX) should never overlap on the same track.",
            inputSchema: z.object({
              asset_id: z.string(),
              track: TRACK_ENUM,
              start_ms: z.number().int().optional(),
              duration_ms: z.number().int().optional(),
            }),
            execute: (args) => H.addToTimeline(ctx, args),
          }),
          remove_from_timeline: tool({
            description:
              "Remove a clip from the timeline by its id. Pass ripple:true to also shift every later clip on the same track left by the removed clip's duration (closing the gap).",
            inputSchema: z.object({
              clip_id: z.string(),
              ripple: z.boolean().optional(),
            }),
            execute: ({ clip_id, ripple }) => H.removeFromTimeline(ctx, clip_id, { ripple }),
          }),
          insert_silence_clip: tool({
            description:
              "Insert a native SILENCE clip on an audio track (Audio, Music, SFX). This is a pause with no asset — it occupies space on the track so nothing plays during its duration. Use it instead of manually computing start_ms gaps between clips: pass duration_ms (e.g. 1200) and optionally start_ms (default: 0; if the spot is occupied the silence is shifted right).",
            inputSchema: z.object({
              duration_ms: z.number().int().positive(),
              track: z.enum(["Audio", "Music", "SFX"]),
              start_ms: z.number().int().min(0).optional(),
            }),
            execute: (args) => H.insertSilenceClip(ctx, args),
          }),
          edit_subtitles: tool({
            description:
              "Edit a subtitle clip's text and/or style (font, size, color, position: bottom|center|top). Use when the transcription has an error, or to restyle captions. The timeline renders subtitles from the clip's meta, so no asset change is needed.",
            inputSchema: z.object({
              clip_id: z.string(),
              text: z.string(),
              style: z
                .object({
                  font: z.string().optional(),
                  size: z.number().int().min(10).max(120).optional(),
                  color: z.string().optional(),
                  position: z.enum(["bottom", "center", "top"]).optional(),
                })
                .optional(),
            }),
            execute: ({ clip_id, text, style }) => H.editSubtitles(ctx, clip_id, text, style),
          }),
          apply_ducking: tool({
            description:
              "Automatic ducking: while the source track (default Audio = voiceover) is playing, the target track (default Music) drops by attenuation_db (default -12, i.e. ~25% volume) with a smooth attack/release. Call this once after placing voice + music so the music breathes under the voice — no manual fades needed. Returns the number of curve points and the target clips it touched.",
            inputSchema: z.object({
              source_track: z.enum(["Audio", "Music", "SFX"]).optional(),
              target_track: z.enum(["Audio", "Music", "SFX"]).optional(),
              attenuation_db: z.number().min(-40).max(0).optional(),
              attack_ms: z.number().int().min(0).max(2000).optional(),
              release_ms: z.number().int().min(0).max(4000).optional(),
            }),
            execute: (args) => H.applyDucking(ctx, args),
          }),
          set_clip_transitions: tool({
            description:
              "Crossfade two clips on the SAME track: clip B is pulled to overlap the tail of clip A by ms. Video → dissolve (both blend while overlapping, or fade to/from black). Audio → volume cross-fade (fade_out on A, fade_in on B). For a simple fade to/from black on one video clip (no second clip), use update_timeline_clip — but the tool needs both clips.",
            inputSchema: z.object({
              clip_a_id: z.string(),
              clip_b_id: z.string(),
              ms: z.number().int().min(50).max(5000),
            }),
            execute: (args) => H.setClipTransitions(ctx, args),
          }),
          update_timeline_clip: tool({
            description:
              'Edit an existing clip WITHOUT removing/re-adding it: shift it (start_ms), resize it (duration_ms), move it to another track, or apply volume fades (fade_in_ms / fade_out_ms, in milliseconds — used by preview and export). Use this for any surgical edit the user asks for ("shift the voice by 0.5s", "music fade-in of 1s", "start the music at 2s"). Returns a _warning if the new position overlaps another clip on the track.',
            inputSchema: z.object({
              clip_id: z.string(),
              start_ms: z.number().int().optional(),
              duration_ms: z.number().int().optional(),
              track: TRACK_ENUM.optional(),
              fade_in_ms: z.number().int().min(0).optional(),
              fade_out_ms: z.number().int().min(0).optional(),
              ripple: z
                .boolean()
                .optional()
                .describe(
                  "Also shift every later clip on the same track by the same delta (moves the gap with the clip).",
                ),
            }),
            execute: (args) => H.updateTimelineClip(ctx, args),
          }),
          set_clip_transform: tool({
            description:
              "Static transform of a clip: scale (1 = fit the frame, 0.35 = picture-in-picture, 2 = punch-in), x/y (normalized CENTER position, 0.5/0.5 = centered, 0.8/0.2 = top-right), opacity (0..1, 0 hides it). Use it for PiP, split-screen and B-roll overlays on Video 2 / Video 3. Pass reset:true to clear the transform. Preview and export both apply it.",
            inputSchema: z.object({
              clip_id: z.string(),
              scale: z.number().min(0.05).max(4).optional(),
              x: z.number().min(-1).max(2).optional(),
              y: z.number().min(-1).max(2).optional(),
              opacity: z.number().min(0).max(1).optional(),
              reset: z.boolean().optional(),
            }),
            execute: (args) => H.setClipTransform(ctx, args),
          }),
          set_clip_keyframes: tool({
            description:
              "Animate a clip's transform over time: keyframes [{t_ms, scale?, x?, y?, opacity?}] where t_ms is CLIP-LOCAL time in ms (0 = clip start). Values are interpolated linearly between keyframes; omitted properties keep the clip's static transform (set_clip_transform). Use for zoom-in/out (ken burns: scale 1 → 1.15), slide-ins (x 0.2 → 0.5), fade-ins (opacity 0 → 1), punch-ins, animated PiP. Pass reset:true (or an empty array) to remove the animation.",
            inputSchema: z.object({
              clip_id: z.string(),
              keyframes: z
                .array(
                  z.object({
                    t_ms: z.number().int().min(0),
                    scale: z.number().min(0.05).max(4).optional(),
                    x: z.number().min(-1).max(2).optional(),
                    y: z.number().min(-1).max(2).optional(),
                    opacity: z.number().min(0).max(1).optional(),
                  }),
                )
                .max(50)
                .optional(),
              reset: z.boolean().optional(),
            }),
            execute: (args) => H.setClipKeyframes(ctx, args),
          }),
          trim_clip: tool({
            description:
              "Frame-accurate trim of ONE edge of a clip. edge:'out' (default) moves the tail, edge:'in' moves the head (the tail stays). Positive delta trims, negative extends (never below 100 ms). delta_frames is in 30 fps frames (1 frame ≈ 33 ms); delta_ms is snapped to the frame grid. snap (default true) magnetises the moving edge to the nearest clip edge or 0 (within 100 ms). ripple:true closes the gap by shifting every later clip on the track. Returns the clip and the number of shifted clips.",
            inputSchema: z.object({
              clip_id: z.string(),
              edge: z.enum(["in", "out"]).optional(),
              delta_ms: z.number().optional(),
              delta_frames: z.number().int().optional(),
              ripple: z.boolean().optional(),
              snap: z.boolean().optional(),
            }),
            execute: (args) => H.trimClip(ctx, args),
          }),
          add_marker: tool({
            description:
              "Add a timeline marker / YouTube chapter at t_ms (absolute timeline time). Give a short label (the chapter title). list_markers returns the ready-to-paste chapter list.",
            inputSchema: z.object({
              t_ms: z.number().int().min(0),
              label: z.string().optional(),
            }),
            execute: (args) => H.addMarker(ctx, args),
          }),
          list_markers: tool({
            description:
              "List the timeline markers ordered by time, plus the YouTube chapter text ready to paste (first chapter at 0:00).",
            inputSchema: z.object({}),
            execute: () => H.listMarkers(ctx),
          }),
          remove_marker: tool({
            description: "Remove a marker by its id (see list_markers).",
            inputSchema: z.object({ marker_id: z.string() }),
            execute: ({ marker_id }) => H.removeMarker(ctx, marker_id),
          }),
          replace_clip_asset: tool({
            description:
              "Swap the asset of an existing clip in place, keeping its position on the timeline. Use this when regenerating an asset that is already placed (e.g. a regenerated voiceover with corrected text, a new version of an image): generate the new asset first, then replace_clip_asset(clip_id, new_asset_id). For audio, the clip is resized to the new asset's real duration.",
            inputSchema: z.object({
              clip_id: z.string(),
              new_asset_id: z.string(),
            }),
            execute: ({ clip_id, new_asset_id }) => H.replaceClipAsset(ctx, clip_id, new_asset_id),
          }),
          generate_sfx: tool({
            description:
              "Request a sound effect (engine roar, explosion, whoosh, beep, ambient hum…). There is no built-in SFX model — always creates a pending asset so the user can generate the sound elsewhere and drop it into the Library. Pass a precise description (and an optional target duration_ms) as the prompt.",
            inputSchema: z.object({
              brief: z.string(),
              duration_ms: z.number().int().optional(),
            }),
            execute: ({ brief, duration_ms }) =>
              H.createPendingAsset(
                ctx,
                "audio",
                duration_ms ? `${brief} (target duration: ${duration_ms}ms)` : brief,
              ),
          }),
          get_lineage: tool({
            description:
              'Show the lineage of an asset: how it was generated (tool + params) and what other assets depend on it. Use to answer questions like "what depends on this asset?" or "how was this made?".',
            inputSchema: z.object({ asset_id: z.string() }),
            execute: ({ asset_id }) => H.getLineage(ctx, asset_id),
          }),
          list_timeline: tool({
            description: "List the current timeline clips.",
            inputSchema: z.object({}),
            execute: () => H.listTimeline(ctx),
          }),
          list_assets: tool({
            description:
              "List recently created assets in this project. Audio assets include their real duration_ms in meta.",
            inputSchema: z.object({}),
            execute: () => H.listAssets(ctx),
          }),
          list_models: tool({
            description:
              "List all available models across providers with their capabilities. Pass an optional capability filter (chat, image, audio.speech, audio.transcribe).",
            inputSchema: z.object({
              capability: z.enum(["chat", "image", "audio.speech", "audio.transcribe"]).optional(),
            }),
            execute: ({ capability }) => {
              const list = capability ? listByCapability(models, capability) : models;
              return list.map((m) => ({
                id: m.id,
                provider: m.provider,
                model_id: m.modelId,
                label: m.label,
                capabilities: m.capabilities.map(capLabel),
              }));
            },
          }),
          preview_frame: tool({
            description:
              "Look at an actual frame of the timeline (visual check: framing, on-screen text, colors, overlaps, glitches). The frame is rendered in the user's browser and described by a vision model, returned as text. Pass the clip_id, optionally t_ms (ABSOLUTE timeline time in ms — default: middle of the clip) and focus (what you want to verify, e.g. 'is the title text cut off?').",
            inputSchema: z.object({
              clip_id: z.string(),
              t_ms: z.number().int().min(0).optional(),
              focus: z.string().optional(),
            }),
            // No execute: fulfilled by the browser (client tool). The loop
            // stops on this call and the client resubmits with the result.
          }),
        };

        // -------------------------------------------------------------------
        // Manual tool loop with REALTIME streaming — every iteration runs
        // a single-step streamText whose deltas (text + tool-call inputs +
        // tool outputs) are merged into the outer UIMessage stream DURING
        // generation, so the UI shows live tool activity instead of only
        // the final text.
        //
        // No orphaned tool results: each iteration is fully consumed
        // (await consumeStream + responseMessages) before continuation —
        // every tool call is awaited, fixing AI_MissingToolResultsError.
        // -------------------------------------------------------------------
        const MAX_TOOL_ITERATIONS = 10;
        const startedAt = Date.now();
        let baseConversation: unknown[];
        try {
          baseConversation = await convertToModelMessages(
            sanitizeUiMessages(Array.isArray(body.messages) ? body.messages : []),
          );
        } catch (err) {
          // A history the SDK cannot rebuild must not surface as an opaque
          // 500 (HTML error page): fail clean with an actionable FR message.
          console.error("[/api/director] history conversion failed:", err);
          return new Response(UI_LABELS.director.historiqueIllisible, { status: 422 });
        }
        const toolsCalled: string[] = [];
        let iterations = 0;

        const stream = createUIMessageStream({
          // Never the SDK's masked "An error occurred." — our user gets
          // the real provider diagnostics (authenticated private app).
          onError: (e) => formatProviderError(e),
          execute: async ({ writer }) => {
            let conversation: unknown[] = baseConversation;
            let completed = false;
            try {
              for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
                iterations++;
                const result = streamText({
                  model,
                  system: systemPrompt,
                  messages: conversation as never,
                  tools: tools as never,
                  stopWhen: stepCountIs(1),
                  // The client's Stop button aborts the request: forward it so
                  // the provider calls stop too (no orphaned generations).
                  abortSignal: request.signal,
                  headers: {
                    "x-opencode-session": sessionId,
                    "User-Agent": "lilium-studio-director/1.0",
                  },
                } as never);

                // Stream text + tool-call deltas live to the client.
                // Full message framing per step so useChat mounts each
                // step as it streams (no frameless pop-in at the end).
                writer.merge(
                  toUIMessageStream({
                    stream: result.stream as never,
                    tools: tools as never,
                    sendStart: true,
                    sendFinish: true,
                    onError: (e: unknown) => formatProviderError(e),
                  } as never) as never,
                );
                await result.consumeStream();
                const finishReason = await result.finishReason;
                const stepToolCalls = await result.toolCalls;
                for (const tc of stepToolCalls ?? []) toolsCalled.push(tc.toolName);
                // Client tools (no server execute — e.g. preview_frame) are
                // fulfilled by the browser: stop the loop here and let the
                // client capture + resubmit with the tool result, otherwise
                // the next iteration would be missing that tool result.
                const hasClientTool = (stepToolCalls ?? []).some((tc) => {
                  const def = (tools as Record<string, { execute?: unknown }>)[tc.toolName];
                  return typeof def?.execute !== "function";
                });
                const responseMessages = await result.responseMessages;
                if (responseMessages?.length) {
                  conversation = [...conversation, ...(responseMessages as unknown[])];
                }

                if (
                  finishReason === "tool-calls" &&
                  (stepToolCalls?.length ?? 0) > 0 &&
                  !hasClientTool
                ) {
                  continue;
                }
                if (finishReason === "length") {
                  writeNotice(writer, "tronquee", UI_LABELS.director.reponseTronquee);
                }
                completed = true;
                break;
              }

              console.error(
                "[/api/director] manual loop finished: iterations:",
                iterations,
                "tools:",
                toolsCalled.join(",") || "none",
                "ms:",
                Date.now() - startedAt,
              );

              if (!completed) {
                writeNotice(writer, "limite", UI_LABELS.director.limiteAtteinte);
              }
            } catch (err) {
              let detail: string;
              if (err instanceof Error) detail = `${err.name}: ${err.message}\n${err.stack ?? ""}`;
              else if (typeof err === "object" && err !== null) {
                try {
                  detail = JSON.stringify(err, Object.getOwnPropertyNames(err));
                } catch {
                  detail = String(err);
                }
              } else detail = String(err);
              // Full provider body + failing turn shape, server-side only
              // (approved for debugging; never sent to the client).
              const eRecFull = (err ?? {}) as Record<string, unknown>;
              const fullBody =
                typeof eRecFull.responseBody === "string"
                  ? eRecFull.responseBody
                  : (() => {
                      try {
                        return JSON.stringify(eRecFull.responseBody);
                      } catch {
                        return String(eRecFull.responseBody);
                      }
                    })();
              const shape = body.messages.map((m) => {
                const parts = Array.isArray((m as { parts?: unknown }).parts)
                  ? ((m as { parts: unknown[] }).parts.length as number)
                  : 0;
                const toolStates = Array.isArray((m as { parts?: unknown }).parts)
                  ? (m as { parts: Array<{ type?: unknown; state?: unknown }> }).parts
                      .filter(
                        (p) =>
                          typeof p?.type === "string" &&
                          (p.type.startsWith("tool-") || p.type === "dynamic-tool"),
                      )
                      .map((p) => String(p.state ?? "?"))
                      .join(",") || "-"
                  : "-";
                return `${m.role}[${parts}](tools:${toolStates})`;
              });
              console.error("[/api/director] manual-loop error:", detail);
              console.error("[/api/director] provider body (full):", fullBody);
              console.error("[/api/director] failing turn shape:", shape.join(" | "));
              const message = formatProviderError(err);
              const errId = "err";
              writer.write({ type: "message-start", id: errId } as never);
              writer.write({ type: "text-start", id: errId } as never);
              writer.write({ type: "text-delta", id: errId, delta: message } as never);
              writer.write({ type: "text-end", id: errId } as never);
              writer.write({ type: "message-end", id: errId } as never);
              writer.write({ type: "error", errorText: message } as never);
            }
          },
        });

        return createUIMessageStreamResponse({ stream });
      },
    },
  },
});
