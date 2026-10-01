/**
 * Text presets for the Text tab (spec C.3) and transition presets for the
 * Transitions tab (spec C.4).
 *
 * Both are pure data: dropping a preset onto the timeline resolves to a row
 * insert with a `meta` payload the shared renderer already understands, so
 * there is no second rendering path to keep in sync.
 */

import type { SubtitleStyle } from "@/plugins/ui-timeline/store";

export type TextPresetId = "title" | "lower-third" | "subtitle" | "callout";

export interface TextPreset {
  id: TextPresetId;
  label: string;
  /** Preview glyph shown in the picker card. */
  sample: string;
  /** Track the preset is designed for (row id from TRACK_ROWS). */
  rowId: "titles" | "stickers";
  track: string;
  durationMs: number;
  text: string;
  style: Partial<SubtitleStyle>;
  /** Extra meta merged into the inserted clip. */
  meta?: Record<string, unknown>;
}

export const TEXT_PRESETS: readonly TextPreset[] = [
  {
    id: "title",
    label: "Titre animé",
    sample: "TITRE",
    rowId: "titles",
    track: "Subtitles",
    durationMs: 3000,
    text: "Votre titre",
    style: { size: 72, position: "center", font: "system-ui, sans-serif" },
    meta: { animation: "fade-up" },
  },
  {
    id: "lower-third",
    label: "Tier inférieur",
    sample: "Nom · Fonction",
    rowId: "titles",
    track: "Subtitles",
    durationMs: 4000,
    text: "Nom · Fonction",
    style: { size: 34, position: "bottom", font: "system-ui, sans-serif" },
    meta: { animation: "slide-in" },
  },
  {
    id: "subtitle",
    label: "Sous-titre",
    sample: "Sous-titre automatique",
    rowId: "titles",
    track: "Subtitles",
    durationMs: 2500,
    text: "Sous-titre automatique",
    style: { size: 28, position: "bottom", font: "system-ui, sans-serif" },
  },
  {
    id: "callout",
    label: "Callout",
    sample: "💡 Astuce",
    rowId: "stickers",
    track: "Stickers",
    durationMs: 2000,
    text: "💡 Astuce",
    style: { size: 44, position: "center", font: "system-ui, sans-serif" },
    meta: { animation: "pop" },
  },
] as const;

export type TransitionId = "dissolve" | "crossfade" | "dip-to-black" | "glitch" | "whip-pan";

export interface TransitionPreset {
  id: TransitionId;
  label: string;
  description: string;
  /** Default overlap between the two clips, in ms. */
  overlapMs: number;
  /**
   * How the transition is expressed on the clips: `transition_in_ms` /
   * `transition_out_ms` (dissolve, dip to black) or `fade_in_ms` /
   * `fade_out_ms` (audio cross-fade).
   */
  meta: { videoIn: number; videoOut: number; audioFade: number };
}

export const TRANSITION_PRESETS: readonly TransitionPreset[] = [
  {
    id: "dissolve",
    label: "Dissolve",
    description: "Fondu enchaîné entre deux plans",
    overlapMs: 600,
    meta: { videoIn: 600, videoOut: 600, audioFade: 0 },
  },
  {
    id: "crossfade",
    label: "Crossfade",
    description: "Chevauchement audio avec fondu",
    overlapMs: 500,
    meta: { videoIn: 0, videoOut: 0, audioFade: 500 },
  },
  {
    id: "dip-to-black",
    label: "Dip to Black",
    description: "Plongée dans le noir puis remontée",
    overlapMs: 400,
    meta: { videoIn: 400, videoOut: 400, audioFade: 200 },
  },
  {
    id: "glitch",
    label: "Glitch",
    description: "Décrochage rapide, style montage",
    overlapMs: 120,
    meta: { videoIn: 120, videoOut: 120, audioFade: 0 },
  },
  {
    id: "whip-pan",
    label: "Whip Pan",
    description: "Balayage latéral très rapide",
    overlapMs: 180,
    meta: { videoIn: 180, videoOut: 180, audioFade: 0 },
  },
] as const;

export function textPreset(id: string): TextPreset | undefined {
  return TEXT_PRESETS.find((p) => p.id === id);
}

export function transitionPreset(id: string): TransitionPreset | undefined {
  return TRANSITION_PRESETS.find((p) => p.id === id);
}

/** DataTransfer type for a text preset drag. */
export const TEXT_DRAG_TYPE = "application/x-lilium-text-preset";
/** DataTransfer type for a transition click. */
export const TRANSITION_DRAG_TYPE = "application/x-lilium-transition";
