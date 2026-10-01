/**
 * Turn the agent's tool calls into a readable checklist of concrete edits
 * (spec D.2).
 *
 * The raw tool names are an implementation detail; what the user wants to
 * read is "Cut clip at 00:03:12", "Lowered background music by −14 dB". Each
 * entry is derived from the tool input alone (no server round-trip), so the
 * checklist renders live while the turn streams.
 */

import type { UIMessage } from "ai";
import { formatSmpte } from "@/plugins/ui-timeline/smpte";

export type ActionStatus = "done" | "running" | "failed";

export interface AgentAction {
  id: string;
  /** Short imperative phrase, e.g. "Cut clip at 00:03:12". */
  label: string;
  status: ActionStatus;
  /** Preview thumbnail (data URL) when the tool produced one. */
  thumbnail?: string;
  /** Click-through target for asset-bearing actions. */
  jump?: { clipId?: string; tMs?: number };
}

interface ToolPart {
  type: string;
  toolCallId?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
}

/** Tools that produce a visual result worth a preview card. */
const VISUAL_TOOLS = new Set([
  "generate_image",
  "generate_video",
  "generate_music",
  "generate_voice",
  "generate_voice_takes",
  "generate_sfx",
  "generate_html_card",
  "preview_frame",
]);

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function trackLabel(track: unknown): string {
  return str(track) ?? "la timeline";
}

/** One human sentence for a completed (or running) tool call. */
export function describeAction(part: ToolPart): string {
  const i = (part.input ?? {}) as Record<string, unknown>;
  const name = part.type.replace(/^tool-/, "");

  switch (name) {
    case "add_to_timeline": {
      const at = num(i.start_ms);
      return `Added to ${trackLabel(i.track)}${at != null ? ` at ${formatSmpte(at)}` : ""}`;
    }
    case "remove_from_timeline":
      return "Removed a clip from the timeline";
    case "trim_clip": {
      const at = num(i.start_ms) ?? num(i.from_ms);
      return `Trimmed clip${at != null ? ` at ${formatSmpte(at)}` : ""}`;
    }
    case "update_timeline_clip": {
      const at = num(i.start_ms);
      if (typeof i.start_ms === "number" || typeof i.duration_ms === "number") {
        return `Adjusted clip${at != null ? ` at ${formatSmpte(at)}` : ""}`;
      }
      if (typeof i.fade_in_ms === "number" || typeof i.fade_out_ms === "number") {
        return "Applied a volume fade";
      }
      if (str(i.track)) return `Moved clip to ${trackLabel(i.track)}`;
      return "Adjusted a clip";
    }
    case "set_clip_transitions":
      return "Inserted a transition between two clips";
    case "apply_ducking": {
      const db = num(i.attenuation_db);
      return `Lowered background music by ${db != null ? `${db} dB` : "a few dB"}`;
    }
    case "insert_silence_clip":
      return "Inserted a silence";
    case "edit_subtitles":
      return "Rewrote the subtitles";
    case "generate_subtitles":
      return "Transcribed the narration into subtitles";
    case "generate_image":
      return "Generated an image";
    case "generate_video":
      return "Generated a video";
    case "generate_music":
      return "Generated a music bed";
    case "generate_voice":
      return "Generated a voice take";
    case "generate_voice_takes":
      return "Generated several voice takes";
    case "generate_sfx":
      return "Generated a sound effect";
    case "generate_html_card":
      return "Inserted a dynamic route map";
    case "set_clip_transform":
      return "Positioned a clip on the frame";
    case "set_clip_keyframes":
      return "Animated a clip";
    case "replace_clip_asset":
      return "Swapped the media of a clip";
    case "add_marker":
      return "Added a chapter marker";
    case "remove_marker":
      return "Removed a chapter marker";
    case "preview_frame":
      return "Checked a frame visually";
    default:
      return "Ran a creative step";
  }
}

function statusOf(part: ToolPart): ActionStatus {
  if (part.state === "output-error" || part.errorText) return "failed";
  if (part.state === "output-available") return "done";
  if (part.state === "input-available" || part.state === "input-streaming") return "running";
  return "running";
}

/**
 * Flatten one assistant message into checklist entries. Returns an empty list
 * for messages that are pure prose.
 */
export function actionsOf(message: UIMessage): AgentAction[] {
  if (message.role !== "assistant") return [];
  const out: AgentAction[] = [];
  for (const raw of message.parts) {
    const part = raw as ToolPart;
    if (typeof part.type !== "string" || !part.type.startsWith("tool-")) continue;
    const name = part.type.replace(/^tool-/, "");
    out.push({
      id: part.toolCallId ?? `${message.id}-${out.length}`,
      label: describeAction(part),
      status: statusOf(part),
      thumbnail: VISUAL_TOOLS.has(name) ? thumbnailFor(part) : undefined,
      jump: jumpOf(part),
    });
  }
  return out;
}

/** Normalise a possibly-absent jump target to the optional-field shape. */
function jumpOf(part: ToolPart): AgentAction["jump"] {
  const i = (part.input ?? {}) as Record<string, unknown>;
  const clipId = str(i.clip_id) ?? str(i.clipId) ?? undefined;
  const tMs = num(i.t_ms) ?? num(i.start_ms) ?? undefined;
  if (clipId === undefined && tMs === undefined) return undefined;
  return { clipId, tMs };
}

/** Checklist for a whole conversation, oldest turn first. */
export function allActions(messages: UIMessage[]): AgentAction[] {
  return messages.flatMap(actionsOf);
}

function thumbnailFor(part: ToolPart): string | undefined {
  const out = part.output as { thumbnail?: unknown; image?: unknown } | undefined;
  if (out && typeof out.thumbnail === "string") return out.thumbnail;
  if (out && typeof out.image === "string") return out.image;
  return undefined;
}
