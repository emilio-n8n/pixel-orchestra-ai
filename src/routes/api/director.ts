import { createFileRoute } from "@tanstack/react-router";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  stepCountIs,
  toUIMessageStream,
  tool,
  type UIMessage,
} from "ai";
import { z } from "zod";
import {
  CATALOG,
  listByCapability,
  capLabel,
  type DirectorModel,
} from "@/lib/models/catalog";
import { UI_LABELS } from "@/lib/ui/labels";

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
          sessionId?: string;
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
        // Trim: a pasted model id or API key with stray whitespace
        // produces an opaque provider 500 — fail clean instead.
        const modelId = (body.model ?? "kimi-k2.7-code").trim() || "kimi-k2.7-code";
        const apiKey = (body.apiKey ?? "").trim();
        // Stable session id per conversation — OpenCode Go requires it as
        // x-opencode-session for routing + prompt caching (400 otherwise).
        // Falls back to a per-project id when the client sends none.
        const sessionId = (body.sessionId ?? "").trim() || `lilium-${projectId}`;

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
        const provider = createOpenCodeGoProvider(apiKey);
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
          "HTML CARDS (generate_html_card): for titles, intros, outros, scene transitions, lower thirds and any typographic/graphic overlay, ALWAYS prefer an ANIMATED HTML card over a static image — the timeline renders the card frame-by-frame, so its CSS animations (entrance + ambient motion) become real video motion. Describe the motion explicitly in the brief (e.g. \"fade-in + slide-up title with a slow gradient shift and pulsing glow\"). The card generator produces the keyframes itself; give it the text, the vibe, the colors and the motion you want. Only use generate_image for actual imagery (scenes, subjects, backgrounds) — not for text titles." +
          "\n\n" +
          "TIMELINE EDITING: to move or resize an existing clip use update_timeline_clip (start_ms to shift it, duration_ms to resize, track to move it, fade_in_ms/fade_out_ms for volume fades) — never remove+re-add for a simple edit. To swap an asset inside an existing clip use replace_clip_asset (e.g. a regenerated voiceover: generate_voice first, then replace_clip_asset) — it keeps the clip position and resizes to the real duration. Only remove_from_timeline when a clip must disappear (pass ripple:true to close the gap — later clips on the track slide left). Subtitles (generate_subtitles) must match the voice duration exactly; do not resize subtitle clips manually. When the user asks to \"start the music at Xs with a fade-in\", use update_timeline_clip with start_ms + fade_in_ms on the music clip." +
          "\n\n" +
          "SILENCE CLIPS: for pauses, pacing and \"rhythmic narration\" templates, use insert_silence_clip (duration_ms + optional start_ms) — never compute start_ms gaps by hand. A silence clip on a track blocks that time range: other clips placed after it are shifted right by the anti-overlap system automatically. Use silences to create natural pacing between voiceover lines, or to reserve space before/after sounds." +
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
          "LINEAGE: every generated asset records its provenance (tool, prompt, source assets). If the user asks \"what depends on this asset\" or \"how was this made\", use get_lineage with the asset id.";

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
            description: "List all pending assets (id, kind, prompt) waiting for the user to provide a file.",
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
            execute: ({ brief }) => generateHtmlCard(ctx, model, brief),
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
              track: z.enum(["Video", "Audio", "Music", "SFX", "Subtitles"]),
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
        const baseConversation: unknown[] = await convertToModelMessages(body.messages);
        const toolsCalled: string[] = [];
        let iterations = 0;

        const stream = createUIMessageStream({
          execute: async ({ writer }) => {
            let conversation: unknown[] = baseConversation;
            try {
              for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
                iterations++;
                const result = streamText({
                  model,
                  system: systemPrompt,
                  messages: conversation as never,
                  tools: tools as never,
                  stopWhen: stepCountIs(1),
                  headers: {
                    "x-opencode-session": sessionId,
                    "User-Agent": "lilium-studio-director/1.0",
                  },
                } as never);

                // Stream text + tool-call deltas live to the client.
                // Inner start/finish are suppressed — the outer stream
                // owns the message lifecycle; steps still flow through.
                writer.merge(
                  toUIMessageStream({
                    stream: result.stream as never,
                    tools: tools as never,
                    sendStart: false,
                    sendFinish: false,
                  } as never) as never,
                );
                await result.consumeStream();
                const finishReason = await result.finishReason;
                const stepToolCalls = await result.toolCalls;
                for (const tc of stepToolCalls ?? []) toolsCalled.push(tc.toolName);
                const responseMessages = await result.responseMessages;
                if (responseMessages?.length) {
                  conversation = [...conversation, ...(responseMessages as unknown[])];
                }

                if (finishReason === "tool-calls" && (stepToolCalls?.length ?? 0) > 0) {
                  continue;
                }
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

              if (iterations >= MAX_TOOL_ITERATIONS) {
                const limitId = "limite";
                const limitText = UI_LABELS.director.limiteAtteinte;
                writer.write({ type: "text-start", id: limitId } as never);
                writer.write({ type: "text-delta", id: limitId, delta: limitText } as never);
                writer.write({ type: "text-end", id: limitId } as never);
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
              console.error("[/api/director] manual-loop error:", detail);
              // Actionable FR diagnostics: HTTP status + provider body ≤500ch.
              const eRec = (err ?? {}) as Record<string, unknown>;
              const statusCode =
                typeof eRec.statusCode === "number" ? ` — HTTP ${eRec.statusCode}` : "";
              let providerBody = "";
              const rawBody = eRec.responseBody;
              if (typeof rawBody === "string" && rawBody.length > 0) {
                providerBody = `\n${UI_LABELS.director.reponseFournisseur} : ${rawBody.slice(0, 500)}`;
              } else if (rawBody != null) {
                try {
                  providerBody = `\n${UI_LABELS.director.reponseFournisseur} : ${JSON.stringify(rawBody).slice(0, 500)}`;
                } catch {
                  /* ignore */
                }
              }
              const baseMessage = (err as Error)?.message ?? String(err);
              const message = `${UI_LABELS.director.arretDirecteur} : ${baseMessage}${statusCode}${providerBody}`;
              const errId = "err";
              writer.write({ type: "text-start", id: errId } as never);
              writer.write({ type: "text-delta", id: errId, delta: message } as never);
              writer.write({ type: "text-end", id: errId } as never);
              writer.write({ type: "error", errorText: message } as never);
            }
          },
        });

        return createUIMessageStreamResponse({ stream });
      },
    },
  },
});
