import { describe, expect, it } from "bun:test";
import type { UIMessage } from "ai";
import { actionsOf, allActions, describeAction } from "./checklist";

function msg(parts: unknown[], role: "assistant" | "user" = "assistant"): UIMessage {
  return { id: "m1", role, parts } as unknown as UIMessage;
}

function tool(name: string, input: unknown, extra: Record<string, unknown> = {}): unknown {
  return {
    type: `tool-${name}`,
    toolCallId: `t_${name}`,
    state: "output-available",
    input,
    ...extra,
  };
}

describe("describeAction — the agent speaks in edits, not tool names", () => {
  it("turns a cut into a timecoded sentence", () => {
    const label = describeAction(
      tool("update_timeline_clip", { start_ms: 3120, duration_ms: 900 }) as never,
    );
    expect(label).toBe("Adjusted clip at 00:00:03:04");
    // The raw tool name must never leak into the UI.
    expect(label).not.toContain("update_timeline_clip");
  });

  it("reports ducking in dB", () => {
    expect(describeAction(tool("apply_ducking", { attenuation_db: -14 }) as never)).toBe(
      "Lowered background music by -14 dB",
    );
  });

  it("names the track an asset was added to", () => {
    expect(describeAction(tool("add_to_timeline", { track: "Music", start_ms: 0 }) as never)).toBe(
      "Added to Music at 00:00:00:00",
    );
  });

  it("describes the dynamic component insert", () => {
    expect(describeAction(tool("generate_html_card", { brief: "route" }) as never)).toBe(
      "Inserted a dynamic route map",
    );
  });

  it("falls back to a neutral phrase for an unknown tool", () => {
    const label = describeAction({ type: "tool_some_future_tool", input: {} } as never);
    expect(label).toBe("Ran a creative step");
    expect(label).not.toContain("some_future_tool");
  });
});

describe("actionsOf — status and jump target", () => {
  it("marks a completed call as done", () => {
    const [a] = actionsOf(msg([tool("add_to_timeline", { track: "Video" })]));
    expect(a.status).toBe("done");
  });

  it("marks an in-flight call as running", () => {
    const [a] = actionsOf(
      msg([
        { type: "tool-add_to_timeline", toolCallId: "t1", state: "input-streaming", input: {} },
      ]),
    );
    expect(a.status).toBe("running");
  });

  it("marks an errored call as failed", () => {
    const [a] = actionsOf(
      msg([
        {
          type: "tool-trim_clip",
          toolCallId: "t1",
          state: "output-error",
          input: {},
          errorText: "x",
        },
      ]),
    );
    expect(a.status).toBe("failed");
  });

  it("carries the clip id and time so a card can seek", () => {
    const [a] = actionsOf(msg([tool("trim_clip", { clip_id: "clip-7", start_ms: 4000 })]));
    expect(a.jump).toEqual({ clipId: "clip-7", tMs: 4000 });
  });

  it("omits the jump entirely when the tool has no target", () => {
    const [a] = actionsOf(msg([tool("list_assets", {})]));
    expect(a.jump).toBeUndefined();
  });

  it("returns nothing for a prose-only message", () => {
    expect(actionsOf(msg([{ type: "text", text: "Voilà ce que j'ai fait." }]))).toEqual([]);
  });

  it("returns nothing for a user message", () => {
    expect(actionsOf(msg([tool("add_to_timeline", { track: "Video" })], "user"))).toEqual([]);
  });
});

describe("allActions — one flat checklist across the conversation", () => {
  it("keeps tool-call order and skips non-tools", () => {
    const actions = allActions([
      msg([{ type: "text", text: "Je commence." }, tool("generate_image", { prompt: "vlog" })]),
      msg([
        tool("add_to_timeline", { track: "Video" }),
        tool("apply_ducking", { attenuation_db: -12 }),
      ]),
    ]);
    expect(actions.map((a) => a.label)).toEqual([
      "Generated an image",
      "Added to Video",
      "Lowered background music by -12 dB",
    ]);
  });
});
