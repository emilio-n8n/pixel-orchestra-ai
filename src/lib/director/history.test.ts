/**
 * Director history sanitizer — second-turn repair unit tests.
 *
 * An assistant tool call streamed on a previous turn can arrive without
 * its output (interrupted stream, dropped part). The provider then
 * rejects the whole history and the turn dies with zero diagnostics.
 * Run with `bun test`.
 */
import { describe, it, expect } from "bun:test";
import type { UIMessage } from "ai";
import { sanitizeUiMessages } from "./history";
import { UI_LABELS } from "@/lib/ui/labels";

function msg(over: Partial<UIMessage> = {}): UIMessage {
  return {
    id: "m1",
    role: "assistant",
    parts: [{ type: "text", text: "ok" }],
    ...over,
  } as UIMessage;
}

function toolPart(over: Record<string, unknown> = {}) {
  return {
    type: "tool-generate_image",
    toolCallId: "call_1",
    state: "input-available",
    input: { prompt: "x" },
    ...over,
  };
}

describe("sanitizeUiMessages", () => {
  it("rewrites input-available calls without output as output-error", () => {
    const out = sanitizeUiMessages([msg({ parts: [toolPart()] as never })]);
    const p = out[0].parts[0] as { state: string; errorText: string; output?: unknown };
    expect(p.state).toBe("output-error");
    expect(p.errorText).toBe(UI_LABELS.director.outilInterrompu);
  });
  it("rewrites input-streaming calls without output as output-error", () => {
    const out = sanitizeUiMessages([
      msg({ parts: [toolPart({ state: "input-streaming" })] as never }),
    ]);
    expect((out[0].parts[0] as { state: string }).state).toBe("output-error");
  });
  it("keeps completed calls (output-available) untouched", () => {
    const part = toolPart({ state: "output-available", output: { id: "a1" } });
    const out = sanitizeUiMessages([msg({ parts: [part] as never })]);
    expect(JSON.stringify(out[0].parts[0])).toBe(JSON.stringify(part));
  });
  it("rewrites non-terminal states even when a stray output is present", () => {
    const part = toolPart({ state: "input-available", output: { id: "a1" } });
    const out = sanitizeUiMessages([msg({ parts: [part] as never })]);
    expect((out[0].parts[0] as { state: string }).state).toBe("output-error");
  });
  it("ignores user messages and text-only assistant messages", () => {
    const user = msg({ id: "u", role: "user", parts: [{ type: "text", text: "hi" }] });
    const before = JSON.stringify([user]);
    expect(JSON.stringify(sanitizeUiMessages([user]))).toBe(before);
  });
  it("handles empty history and mixed turns", () => {
    expect(sanitizeUiMessages([])).toEqual([]);
    const mixed = [
      msg({ id: "u1", role: "user", parts: [{ type: "text", text: "go" }] }),
      msg({ id: "a1", parts: [toolPart(), { type: "text", text: "done" }] as never }),
    ];
    const out = sanitizeUiMessages(mixed);
    expect((out[1].parts[0] as { state: string }).state).toBe("output-error");
    expect((out[1].parts[1] as { type: string }).type).toBe("text");
  });
  it("gives a rewritten orphan a JSON-object input (deepseek rejects missing arguments)", () => {
    const out = sanitizeUiMessages([
      msg({
        parts: [
          { type: "tool-generate_image", toolCallId: "call_1", state: "input-streaming" },
        ] as never,
      }),
    ]);
    const p = out[0].parts[0] as { state: string; input: unknown };
    expect(p.state).toBe("output-error");
    expect(p.input).toEqual({});
  });
  it("parses a raw (unparsed) input string back into an object", () => {
    const out = sanitizeUiMessages([
      msg({
        parts: [
          {
            type: "tool-generate_image",
            toolCallId: "call_1",
            state: "input-available",
            rawInput: '{"prompt":"x"}',
          },
        ] as never,
      }),
    ]);
    const p = out[0].parts[0] as { input: unknown };
    expect(p.input).toEqual({ prompt: "x" });
  });
  it("repairs an output-error part that lost its input", () => {
    const out = sanitizeUiMessages([
      msg({
        parts: [
          {
            type: "tool-list_timeline",
            toolCallId: "call_1",
            state: "output-error",
            errorText: "x",
          },
        ] as never,
      }),
    ]);
    expect((out[0].parts[0] as { input: unknown }).input).toEqual({});
  });
  it("normalizes a string input on a terminal part", () => {
    const out = sanitizeUiMessages([
      msg({
        parts: [
          {
            type: "tool-list_timeline",
            toolCallId: "call_1",
            state: "output-error",
            input: '{"track":"Video"}',
            errorText: "x",
          },
        ] as never,
      }),
    ]);
    expect((out[0].parts[0] as { input: unknown }).input).toEqual({ track: "Video" });
  });
  it("repairs output-available without an output field", () => {
    const out = sanitizeUiMessages([
      msg({ parts: [toolPart({ state: "output-available", output: undefined })] as never }),
    ]);
    const p = out[0].parts[0] as { output: unknown; input: unknown };
    expect(p.output).toBeNull();
    expect(p.input).toEqual({ prompt: "x" });
  });
  it("rewrites tool parts with an unknown state", () => {
    const out = sanitizeUiMessages([msg({ parts: [toolPart({ state: undefined })] as never })]);
    expect((out[0].parts[0] as { state: string }).state).toBe("output-error");
  });
  it("drops parts the SDK cannot convert (source-url) but keeps the rest", () => {
    const out = sanitizeUiMessages([
      msg({
        parts: [
          { type: "source-url", sourceId: "s1", url: "https://x" },
          { type: "text", text: "done" },
        ] as never,
      }),
    ]);
    expect(out[0].parts).toHaveLength(1);
    expect((out[0].parts[0] as { type: string }).type).toBe("text");
  });
});
