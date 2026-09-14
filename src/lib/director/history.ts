import type { UIMessage } from "ai";
import { UI_LABELS } from "@/lib/ui/labels";

type UiPart = { type: string; state?: string; output?: unknown; toolCallId?: string };

function isToolPart(p: unknown): p is UiPart {
  if (typeof p !== "object" || p === null) return false;
  const t = (p as { type?: unknown }).type;
  return typeof t === "string" && (t.startsWith("tool-") || t === "dynamic-tool");
}

/**
 * Second-turn repair: an assistant tool call streamed on a previous turn
 * can arrive without its output (interrupted stream, dropped part). The
 * provider then rejects the whole history (400) and the turn dies with
 * zero diagnostics. Rewrite such orphans as explicit output-errors so
 * the conversation survives and the model continues without the result.
 */
export function sanitizeUiMessages(messages: UIMessage[]): UIMessage[] {
  return messages.map((m) => {
    if (m.role !== "assistant" || !Array.isArray(m.parts)) return m;
    let fixed = 0;
    const parts = m.parts.map((p) => {
      if (
        isToolPart(p) &&
        (p.state === "input-streaming" || p.state === "input-available") &&
        p.output === undefined
      ) {
        fixed++;
        return {
          ...p,
          state: "output-error" as const,
          errorText: UI_LABELS.director.outilInterrompu,
        };
      }
      return p;
    });
    if (fixed > 0) {
      console.error(`[/api/director] sanitized ${fixed} orphaned tool part(s) in history`);
    }
    // Cast: the rewritten parts keep the runtime shape convertToModelMessages
    // reads (state/output/errorText); the SDK union type can't express it.
    return { ...m, parts: parts as UIMessage["parts"] };
  });
}
