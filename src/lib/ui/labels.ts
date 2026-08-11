/**
 * Product vocabulary layer.
 *
 * The kernel, plugins and AI tools keep their technical identifiers
 * (`generate_image`, `library.center`, `add_to_timeline`…). This module is the
 * single place that translates them into the words a creator sees.
 */
import {
  Boxes,
  Clapperboard,
  Film,
  Image as ImageIcon,
  LayoutGrid,
  Library,
  ListVideo,
  Music,
  Plug,
  Sparkles,
  Type as TypeIcon,
  Users,
  Waves,
  type LucideIcon,
} from "lucide-react";

export interface ModuleMeta {
  label: string;
  icon: LucideIcon;
  group: "create" | "produce";
  order: number;
}

export const MODULES: Record<string, ModuleMeta> = {
  timeline: { label: "Éditeur", icon: Film, group: "create", order: 10 },
  library: { label: "Médias", icon: Library, group: "create", order: 20 },
  storyboard: { label: "Scènes", icon: LayoutGrid, group: "create", order: 30 },
  characters: { label: "Personnages", icon: Users, group: "create", order: 40 },
  jobs: { label: "Rendus", icon: ListVideo, group: "produce", order: 50 },
  graph: { label: "Flux créatif", icon: Boxes, group: "produce", order: 60 },
  connectors: { label: "Connexions", icon: Plug, group: "produce", order: 70 },
};

export const GROUP_LABELS: Record<ModuleMeta["group"], string> = {
  create: "Création",
  produce: "Production",
};

export function moduleMeta(id: string, fallbackTitle?: string): ModuleMeta {
  return (
    MODULES[id] ?? {
      label: fallbackTitle ?? id,
      icon: Sparkles,
      group: "produce",
      order: 900,
    }
  );
}

/** Human label for an AI tool call — never expose the raw tool name. */
const TOOL_LABELS: Record<string, string> = {
  generate_image: "Image générée",
  generate_video: "Vidéo générée",
  generate_music: "Musique générée",
  generate_voice: "Voix générée",
  generate_sfx: "Effet sonore généré",
  generate_html_card: "Carte titre créée",
  generate_subtitles: "Sous-titres créés",
  add_to_timeline: "Ajout à la timeline",
  remove_from_timeline: "Retrait de la timeline",
  list_timeline: "Lecture de la timeline",
  list_assets: "Consultation de la médiathèque",
  list_models: "Sélection du moteur créatif",
};

export function toolLabel(rawType: string): string {
  const name = rawType.replace(/^tool-/, "");
  return TOOL_LABELS[name] ?? "Étape créative";
}

const TOOL_ICONS: Record<string, LucideIcon> = {
  generate_image: ImageIcon,
  generate_video: Film,
  generate_music: Music,
  generate_voice: Waves,
  generate_sfx: Waves,
  generate_html_card: TypeIcon,
  generate_subtitles: TypeIcon,
  add_to_timeline: Clapperboard,
  remove_from_timeline: Clapperboard,
  list_timeline: Clapperboard,
  list_assets: Library,
  list_models: Sparkles,
};

export function toolIcon(rawType: string): LucideIcon {
  return TOOL_ICONS[rawType.replace(/^tool-/, "")] ?? Sparkles;
}

/** Human label for an asset kind. */
export const KIND_LABELS: Record<string, string> = {
  image: "Image",
  video: "Vidéo",
  audio: "Audio",
  html: "Carte titre",
  doc: "Document",
  other: "Fichier",
  pending: "En attente",
};

export function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? "Fichier";
}

export const TRACK_LABELS: Record<string, string> = {
  Video: "Vidéo",
  Audio: "Audio",
  Music: "Musique",
  SFX: "Effets",
  Subtitles: "Texte",
};