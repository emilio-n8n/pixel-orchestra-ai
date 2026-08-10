import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, tool, stepCountIs, type UIMessage } from "ai";
import { z } from "zod";
import { CATALOG, listByCapability, capLabel, type DirectorModel } from "@/lib/models/catalog";

export const Route = createFileRoute("/api/director")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("Authorization") ?? "";
        const token = auth.replace(/^Bearer\s+/i, "");
        if (!token) return new Response("Unauthorized", { status: 401 });

        const body = (await request.json()) as {
          messages: UIMessage[];
          projectId: string;
          apiKey: string;
          model?: string;
          customModels?: DirectorModel[];
          cloudflareAccountId?: string;
          cloudflareApiKey?: string;
          groqApiKey?: string;
        };
        if (!body?.projectId) return new Response("projectId required", { status: 400 });
        if (!body?.apiKey) return new Response("apiKey required", { status: 400 });

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
        if (userErr || !userData.user) return new Response("Unauthorized", { status: 401 });
        const userId = userData.user.id;
        const projectId = body.projectId;
        const modelId = body.model ?? "kimi-k2.7-code";

        // Unified catalogue = builtin + user custom models.
        const models = [...CATALOG, ...(body.customModels ?? [])];
        const creds = {
          cloudflareAccountId: body.cloudflareAccountId,
          cloudflareApiKey: body.cloudflareApiKey,
          groqApiKey: body.groqApiKey,
        };

        const H = await import("@/lib/director/handlers.server");
        const ctx = { supabase, userId, projectId, models, creds };

        const { createOpenCodeGoProvider } = await import("@/lib/opencode-go-provider.server");
        const provider = createOpenCodeGoProvider(body.apiKey);
        const model = provider(modelId);

        const { generateHtmlCard } = await import("@/lib/director/html-cards.server");

        // Tell the Director which image models exist so it can pick one.
        const imageModels = listByCapability(models, "image")
          .map((m) => `- ${m.id} (${m.label}, ${m.provider})`)
          .join("\n");
        const transcribeModels = listByCapability(models, "audio.transcribe")
          .map((m) => `- ${m.id} (${m.label}, ${m.provider})`)
          .join("\n");
        const hasCloudflare = Boolean(creds.cloudflareAccountId && creds.cloudflareApiKey);

        const result = streamText({
          model,
          system:
            "You are the Director inside Lilium Studio — an AI video/creative producer. You can generate images, voiceovers, and HTML title cards, then place them on the timeline (tracks: Video, Audio, Music, SFX, Subtitles). After generating any asset, add it to the appropriate track so the user sees a live preview. Be concise; act, do not narrate.\n\n" +
            `AVAILABLE IMAGE MODELS (pass one as model_id to generate_image, or omit for the default):\n${imageModels}\n\n` +
            `AVAILABLE TRANSCRIPTION MODELS (generate_subtitles):\n${transcribeModels}\n\n` +
            (hasCloudflare
              ? "Cloudflare Workers AI is configured — prefer a Cloudflare image model (flux-1-schnell, sd-xl-base) for image generation."
              : "Cloudflare is NOT configured — use the Lovable fallback for images (no model_id needed).") +
            "\n\n" +
            "USER-ASSISTED GENERATION: For video, music, or when the user wants a better quality generation (complex image, special video), you do NOT generate — call generate_image/generate_video/generate_music with external:true. That creates a PENDING asset visible in the user's Library, waiting for a file. Tell the user what is pending and that you will wait. Then use wait_for_user_assets (or list_pending_assets) to check when it is ready; once ready, place it on the timeline. For audio, wait until you know the real duration_ms before placing." +
            "\n\n" +
            "AUDIO OVERLAP: Never let two audio clips overlap on the same track. generate_voice returns the real duration_ms of the audio file in its metadata — trust it, never estimate or guess the duration. add_to_timeline uses that real duration automatically for overlap detection (it never underestimates), so do NOT pass duration_ms for audio clips unless you intentionally want a longer clip. Pay attention to the _warning field returned by add_to_timeline: if present, the clip was shifted or its duration was adjusted. Use separate tracks for different audio types: Audio=voiceover, Music=background, SFX=effects. If you need silence, remove the existing clip first with remove_from_timeline, then re-add." +
            "\n\n" +
            "HTML CARDS (generate_html_card): for titles, intros, outros, scene transitions, lower thirds and any typographic/graphic overlay, ALWAYS prefer an ANIMATED HTML card over a static image — the timeline renders the card frame-by-frame, so its CSS animations (entrance + ambient motion) become real video motion. Describe the motion explicitly in the brief (e.g. \"fade-in + slide-up title with a slow gradient shift and pulsing glow\"). The card generator produces the keyframes itself; give it the text, the vibe, the colors and the motion you want. Only use generate_image for actual imagery (scenes, subjects, backgrounds) — not for text titles." +
            "\n\n" +
            "TIMELINE EDITING: to move or resize an existing clip use update_timeline_clip (start_ms to shift it, duration_ms to resize, track to move it, fade_in_ms/fade_out_ms for volume fades) — never remove+re-add for a simple edit. To swap an asset inside an existing clip use replace_clip_asset (e.g. a regenerated voiceover: generate_voice first, then replace_clip_asset) — it keeps the clip position and resizes to the real duration. Only remove_from_timeline when a clip must disappear. Subtitles (generate_subtitles) must match the voice duration exactly; do not resize subtitle clips manually. When the user asks to \"start the music at Xs with a fade-in\", use update_timeline_clip with start_ms + fade_in_ms on the music clip." +
            "\n\n" +
            "SFX (generate_sfx): for sound effects there is no built-in model — create a pending asset with a precise description; the user provides the file and you place it on the SFX track when ready (wait_for_user_assets)." +
            "\n\n" +
            "LINEAGE: every generated asset records its provenance (tool, prompt, source assets). If the user asks \"what depends on this asset\" or \"how was this made\", use get_lineage with the asset id.",
          messages: await convertToModelMessages(body.messages),
          stopWhen: stepCountIs(50),
          onError: (err) => {
            // The stream error is otherwise swallowed into the client's
            // generic "An error occurred." — log it for Lovable Cloud logs.
            let detail: string;
            if (err instanceof Error) {
              detail = `${err.name}: ${err.message}\n${err.stack ?? ""}`;
            } else if (typeof err === "object" && err !== null) {
              const seen = new WeakSet<object>();
              const parts: string[] = [];
              for (const k of Object.keys(err)) {
                const v = (err as Record<string, unknown>)[k];
                if (typeof v === "object" && v !== null) {
                  if (seen.has(v)) { parts.push(`${k}: [circular]`); continue; }
                  seen.add(v);
                }
                try {
                  parts.push(`${k}: ${JSON.stringify(v)}`);
                } catch {
                  parts.push(`${k}: [unserializable:${String(v)}]`);
                }
              }
              detail = `[plain object]\n${parts.join("\n")}`;
            } else {
              detail = String(err);
            }
            console.error("[/api/director] stream error:", detail);
          },
          tools: {
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
              description: "List all pending assets (id, kind, prompt) waiting for the user to provide a file.",
              inputSchema: z.object({}),
              execute: () => H.listPendingAssets(ctx),
            }),
            generate_voice: tool({
              description: "Generate a voiceover / narration (TTS). The returned asset includes the real duration_ms of the audio in its meta — always read it and never estimate the duration yourself.",
              inputSchema: z.object({
                text: z.string(),
                voice: z.enum(["alloy", "echo", "fable", "onyx", "nova", "shimmer"]).optional(),
              }),
              execute: ({ text, voice }) => H.generateVoice(ctx, text, voice),
            }),
            generate_html_card: tool({
              description:
                "Generate an ANIMATED HTML card (title, lower third, credits, transition) — the card ships with CSS keyframes (entrance + ambient motion) that become real video motion at export. Pass the text, vibe, colors and the motion you want in the brief.",
              inputSchema: z.object({ brief: z.string() }),
              execute: ({ brief }) => generateHtmlCard(ctx, model, brief),
            }),
            generate_subtitles: tool({
              description:
                "Transcribe an audio asset with Groq (whisper-large-v3) and place the text as a Subtitles clip on the timeline. Pass the audio asset_id.",
              inputSchema: z.object({ asset_id: z.string() }),
              execute: ({ asset_id }) => H.transcribeAudio(ctx, asset_id),
            }),
            add_to_timeline: tool({
              description: "Place an existing asset on a timeline track. For audio assets, the real duration_ms from the asset metadata is used automatically for overlap detection (never underestimated); pass duration_ms only if you intentionally want a longer clip. If the clip would overlap existing clips on the same track, it is automatically shifted. Check the _warning field in the result — if present, the clip was moved or its duration was adjusted. Audio clips (Audio, Music, SFX) should never overlap on the same track.",
              inputSchema: z.object({
                asset_id: z.string(),
                track: z.enum(["Video", "Audio", "Music", "SFX", "Subtitles"]),
                start_ms: z.number().int().optional(),
                duration_ms: z.number().int().optional(),
              }),
              execute: (args) => H.addToTimeline(ctx, args),
            }),
            remove_from_timeline: tool({
              description: "Remove a clip from the timeline by its id.",
              inputSchema: z.object({ clip_id: z.string() }),
              execute: ({ clip_id }) => H.removeFromTimeline(ctx, clip_id),
            }),
            update_timeline_clip: tool({
              description:
                "Edit an existing clip WITHOUT removing/re-adding it: shift it (start_ms), resize it (duration_ms), move it to another track, or apply volume fades (fade_in_ms / fade_out_ms, in milliseconds — used by preview and export). Use this for any surgical edit the user asks for (\"shift the voice by 0.5s\", \"music fade-in of 1s\", \"start the music at 2s\"). Returns a _warning if the new position overlaps another clip on the track.",
              inputSchema: z.object({
                clip_id: z.string(),
                start_ms: z.number().int().optional(),
                duration_ms: z.number().int().optional(),
                track: z.enum(["Video", "Audio", "Music", "SFX", "Subtitles"]).optional(),
                fade_in_ms: z.number().int().min(0).optional(),
                fade_out_ms: z.number().int().min(0).optional(),
              }),
              execute: (args) => H.updateTimelineClip(ctx, args),
            }),
            replace_clip_asset: tool({
              description:
                "Swap the asset of an existing clip in place, keeping its position on the timeline. Use this when regenerating an asset that is already placed (e.g. a new voiceover with corrected text, a new version of an image): generate the new asset first, then replace_clip_asset(clip_id, new_asset_id). For audio, the clip is resized to the new asset's real duration.",
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
                H.createPendingAsset(ctx, "audio", duration_ms ? `${brief} (target duration: ${duration_ms}ms)` : brief),
            }),
            get_lineage: tool({
              description:
                "Show the lineage of an asset: how it was generated (tool + params) and what other assets depend on it. Use to answer questions like \"what depends on this asset?\" or \"how was this made?\".",
              inputSchema: z.object({ asset_id: z.string() }),
              execute: ({ asset_id }) => H.getLineage(ctx, asset_id),
            }),
            list_timeline: tool({
              description: "List the current timeline clips.",
              inputSchema: z.object({}),
              execute: () => H.listTimeline(ctx),
            }),
            list_assets: tool({
              description: "List recently created assets in this project. Audio assets include their real duration_ms in meta.",
              inputSchema: z.object({}),
              execute: () => H.listAssets(ctx),
            }),
            list_models: tool({
              description:
                "List all available models across providers with their capabilities. Pass an optional capability filter (chat, image, audio.speech, audio.transcribe).",
              inputSchema: z.object({
                capability: z
                  .enum(["chat", "image", "audio.speech", "audio.transcribe"])
                  .optional(),
              }),
              execute: ({ capability }) => {
                const list = capability
                  ? listByCapability(models, capability)
                  : models;
                return list.map((m) => ({
                  id: m.id,
                  provider: m.provider,
                  model_id: m.modelId,
                  label: m.label,
                  capabilities: m.capabilities.map(capLabel),
                }));
              },
            }),
          },
        });

        return result.toUIMessageStreamResponse();
      },
    },
  },
});
