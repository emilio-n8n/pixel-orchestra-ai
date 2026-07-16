import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, tool, stepCountIs, type UIMessage } from "ai";
import { z } from "zod";

export const Route = createFileRoute("/api/director")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("Authorization") ?? "";
        const token = auth.replace(/^Bearer\s+/i, "");
        if (!token) return new Response("Unauthorized", { status: 401 });

        const body = (await request.json()) as { messages: UIMessage[]; projectId: string };
        if (!body?.projectId) return new Response("projectId required", { status: 400 });

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("LOVABLE_API_KEY missing", { status: 500 });

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

        const H = await import("@/lib/director/handlers.server");
        const ctx = { supabase, userId, projectId };

        const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
        const gateway = createLovableAiGatewayProvider(key);

        const result = streamText({
          model: gateway("openai/gpt-5.5"),
          system:
            "You are the Director inside Lilium Studio — an AI video/creative producer. You can generate images, voiceovers, and HTML title cards, then place them on the timeline (tracks: Video, Audio, Music, SFX, Subtitles). After generating any asset, add it to the appropriate track so the user sees a live preview. Be concise; act, do not narrate.",
          messages: await convertToModelMessages(body.messages),
          stopWhen: stepCountIs(50),
          tools: {
            generate_image: tool({
              description: "Generate an image from a text prompt.",
              inputSchema: z.object({ prompt: z.string() }),
              execute: ({ prompt }) => H.generateImage(ctx, prompt),
            }),
            generate_voice: tool({
              description: "Generate a voiceover / narration (TTS).",
              inputSchema: z.object({
                text: z.string(),
                voice: z.enum(["alloy", "echo", "fable", "onyx", "nova", "shimmer"]).optional(),
              }),
              execute: ({ text, voice }) => H.generateVoice(ctx, text, voice),
            }),
            generate_html_card: tool({
              description: "Generate a styled HTML card (title, lower third, credits).",
              inputSchema: z.object({ brief: z.string() }),
              execute: ({ brief }) => H.generateHtmlCard(ctx, brief),
            }),
            add_to_timeline: tool({
              description: "Place an existing asset on a timeline track.",
              inputSchema: z.object({
                asset_id: z.string(),
                track: z.enum(["Video", "Audio", "Music", "SFX", "Subtitles"]),
                start_ms: z.number().int().optional(),
                duration_ms: z.number().int().optional(),
              }),
              execute: (args) => H.addToTimeline(ctx, args),
            }),
            list_timeline: tool({
              description: "List the current timeline clips.",
              inputSchema: z.object({}),
              execute: () => H.listTimeline(ctx),
            }),
            list_assets: tool({
              description: "List recently created assets in this project.",
              inputSchema: z.object({}),
              execute: () => H.listAssets(ctx),
            }),
          },
        });

        return result.toUIMessageStreamResponse();
      },
    },
  },
});