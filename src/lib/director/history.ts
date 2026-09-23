import type { UIMessage } from "ai";
import { UI_LABELS } from "@/lib/ui/labels";

type UiPart = {
  type: string;
  state?: string;
  input?: unknown;
  rawInput?: unknown;
  output?: unknown;
  errorText?: string;
  toolCallId?: string;
};

function isToolPart(p: unknown): p is UiPart {
  if (typeof p !== "object" || p === null) return false;
  const t = (p as { type?: unknown }).type;
  return typeof t === "string" && (t.startsWith("tool-") || t === "dynamic-tool");
}

/** Terminal tool states for which convertToModelMessages() emits a result. */
const RESULT_STATES = new Set(["output-available", "output-error", "output-denied"]);

/** Part types convertToModelMessages() knows how to rebuild (others throw). */
function isSupportedAssistantPart(p: UiPart): boolean {
  return (
    p.type === "text" ||
    p.type === "reasoning" ||
    p.type === "reasoning-file" ||
    p.type === "file" ||
    p.type === "custom" ||
    p.type === "step-start" ||
    p.type.startsWith("data-") ||
    isToolPart(p)
  );
}

/**
 * Replayed tool calls must carry a JSON OBJECT as arguments: the provider
 * rejects `arguments` that is missing or a JSON string (400). A raw
 * (unparsed) input string is parsed back, anything else falls back to {}.
 */
function normalizeToolInput(input: unknown): unknown {
  if (typeof input === "string") {
    try {
      const parsed: unknown = JSON.parse(input);
      return typeof parsed === "object" && parsed !== null ? parsed : {};
    } catch {
      return {};
    }
  }
  if (typeof input !== "object" || input === null) return {};
  return input;
}

/**
 * Second-turn repair: an assistant tool call streamed on a previous turn
 * can arrive without its output (interrupted stream, dropped part). The
 * provider then rejects the whole history (400) and the turn dies with
 * zero diagnostics. Rewrite such orphans as explicit output-errors so
 * the conversation survives and the model continues without the result.
 *
 * Every rewritten tool call keeps a JSON-object `input`: OpenAI-compatible
 * APIs reject a tool call without `arguments` (400 "function.arguments
 * must be a JSON object") — deepseek does, kimi tolerates it.
 */
export function sanitizeUiMessages(messages: UIMessage[]): UIMessage[] {
  return messages.map((m) => {
    if (m.role !== "assistant" || !Array.isArray(m.parts)) return m;
    let fixed = 0;
    let dropped = 0;
    const parts: UIMessage["parts"] = [];
    for (const raw of m.parts) {
      const p = raw as UiPart;
      if (!isSupportedAssistantPart(p)) {
        // e.g. legacy `source-url` parts: convertToModelMessages() throws
        // "Unsupported part" before streaming → opaque 500 on the next turn.
        dropped++;
        continue;
      }
      if (!isToolPart(p)) {
        parts.push(raw);
        continue;
      }
      const input = normalizeToolInput(p.input ?? p.rawInput);
      if (!RESULT_STATES.has(p.state ?? "")) {
        fixed++;
        parts.push({
          ...p,
          state: "output-error",
          input,
          errorText: UI_LABELS.director.outilInterrompu,
        } as UIMessage["parts"][number]);
        continue;
      }
      if (p.state === "output-available" && p.output === undefined) {
        fixed++;
        parts.push({ ...p, output: null, input } as UIMessage["parts"][number]);
        continue;
      }
      const inputOk = typeof p.input === "object" && p.input !== null && !Array.isArray(p.input);
      if (!inputOk) {
        fixed++;
        parts.push({ ...p, input } as UIMessage["parts"][number]);
        continue;
      }
      parts.push(raw);
    }
    if (fixed > 0) {
      console.error(`[/api/director] sanitized ${fixed} orphaned tool part(s) in history`);
    }
    if (dropped > 0) {
      console.error(`[/api/director] dropped ${dropped} unsupported part(s) in history`);
    }
    // Cast: the rewritten parts keep the runtime shape convertToModelMessages
    // reads (state/input/output/errorText); the SDK union type can't express it.
    return { ...m, parts: parts as UIMessage["parts"] };
  });
}
