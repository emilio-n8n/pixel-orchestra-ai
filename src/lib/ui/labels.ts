/**
 * Product vocabulary layer.
 *
 * The kernel, plugins and AI tools keep their technical identifiers
 * (`generate_image`, `library.center`, `add_to_timeline`…). This module is the
 * single place that translates them into the words a creator sees.
 */
import {
  Bookmark,
  Boxes,
  Clapperboard,
  Eye,
  Film,
  Image as ImageIcon,
  LayoutGrid,
  Library,
  ListVideo,
  Move,
  Music,
  Plug,
  Sparkles,
  Trash2,
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
  generate_voice_takes: "Prises de voix générées",
  generate_sfx: "Effet sonore généré",
  generate_html_card: "Carte titre créée",
  generate_subtitles: "Sous-titres créés",
  add_to_timeline: "Ajout à la timeline",
  remove_from_timeline: "Retrait de la timeline",
  update_timeline_clip: "Plan ajusté",
  replace_clip_asset: "Média du plan remplacé",
  insert_silence_clip: "Silence inséré",
  edit_subtitles: "Sous-titre édité",
  apply_ducking: "Ducking appliqué",
  set_clip_transitions: "Transition posée",
  get_lineage: "Origine consultée",
  wait_for_user_assets: "Attente des médias",
  list_pending_assets: "Médias en attente listés",
  list_timeline: "Lecture de la timeline",
  list_assets: "Consultation de la médiathèque",
  list_models: "Sélection du moteur créatif",
  preview_frame: "Frame vérifiée à l'œil",
  set_clip_transform: "Transform appliqué",
  set_clip_keyframes: "Animation posée",
  trim_clip: "Trim au frame",
  add_marker: "Marqueur ajouté",
  list_markers: "Chapitres lus",
  remove_marker: "Marqueur retiré",
};

export function toolLabel(rawType: string): string {
  const name = rawType.replace(/^tool-/, "");
  return TOOL_LABELS[name] ?? UI_LABELS.director.etapeCreative;
}

const TOOL_ICONS: Record<string, LucideIcon> = {
  generate_image: ImageIcon,
  generate_video: Film,
  generate_music: Music,
  generate_voice: Waves,
  generate_voice_takes: Waves,
  generate_sfx: Waves,
  generate_html_card: TypeIcon,
  generate_subtitles: TypeIcon,
  add_to_timeline: Clapperboard,
  remove_from_timeline: Clapperboard,
  update_timeline_clip: Clapperboard,
  replace_clip_asset: Clapperboard,
  insert_silence_clip: Clapperboard,
  edit_subtitles: TypeIcon,
  apply_ducking: Waves,
  set_clip_transitions: Clapperboard,
  get_lineage: Library,
  wait_for_user_assets: Library,
  list_pending_assets: Library,
  list_timeline: Clapperboard,
  list_assets: Library,
  list_models: Sparkles,
  preview_frame: Eye,
  set_clip_transform: Move,
  set_clip_keyframes: Sparkles,
  trim_clip: Clapperboard,
  add_marker: Bookmark,
  list_markers: ListVideo,
  remove_marker: Trash2,
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
  silence: "Silence",
  text: "Texte",
  "3d": "3D",
};

export function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? "Fichier";
}

/**
 * Canonical 7-row NLE track model (Manus Studio V2). Order matters: this is
 * the visual top → bottom order of the timeline, and the single source for
 * label + color of every row. `tracks` lists the legacy Supabase `track`
 * values a row owns, so existing data keeps rendering in the right place.
 */
export interface TrackRow {
  /** Stable row id — also the DOM key and the drag/drop track id. */
  id: string;
  /** Legacy `timeline_clips.track` values owned by this row. */
  tracks: string[];
  label: string;
  /** Short label for the 88px track-header gutter. */
  short: string;
  /** CSS custom property holding the row color (never a raw hex). */
  colorVar: string;
  /** Audio rows get a real waveform + the ducking badge. */
  audio: boolean;
  /** Video rows get the frame-by-frame thumbnail ribbon. */
  video: boolean;
}

export const TRACK_ROWS: readonly TrackRow[] = [
  {
    id: "titles",
    tracks: ["Subtitles"],
    label: "Titres · Textes · Sous-titres",
    short: "Titres",
    colorVar: "--track-text",
    audio: false,
    video: false,
  },
  {
    id: "stickers",
    tracks: ["Stickers"],
    label: "Stickers · Callouts · Emojis",
    short: "Stickers",
    colorVar: "--track-sticker",
    audio: false,
    video: false,
  },
  {
    id: "dynamic",
    tracks: ["Video 3"],
    label: "Composants dynamiques · Scripting",
    short: "Dynamique",
    colorVar: "--track-dynamic",
    audio: false,
    video: true,
  },
  {
    id: "video",
    tracks: ["Video", "Video 2"],
    label: "Vidéo · A-Roll & B-Roll",
    short: "Vidéo",
    colorVar: "--track-film",
    audio: false,
    video: true,
  },
  {
    id: "voice",
    tracks: ["Audio"],
    label: "Voix · Dialogues",
    short: "Voix",
    colorVar: "--track-voice",
    audio: true,
    video: false,
  },
  {
    id: "sfx",
    tracks: ["SFX"],
    label: "Bruitages (SFX)",
    short: "SFX",
    colorVar: "--track-sfx",
    audio: true,
    video: false,
  },
  {
    id: "music",
    tracks: ["Music"],
    label: "Musique de fond",
    short: "Musique",
    colorVar: "--track-music",
    audio: true,
    video: false,
  },
] as const;

/** Every legacy track name owned by a row → the row that renders it. */
const TRACK_ROW_BY_NAME = new Map<string, TrackRow>(
  TRACK_ROWS.flatMap((row) => row.tracks.map((t) => [t, row] as const)),
);

/** Row that renders a legacy track name, or undefined for unknown names. */
export function trackRowOf(track: string): TrackRow | undefined {
  return TRACK_ROW_BY_NAME.get(track);
}

/** The legacy track name a row writes to when a clip is dropped on it. */
export function defaultTrackOf(rowId: string): string | undefined {
  return TRACK_ROWS.find((r) => r.id === rowId)?.tracks[0];
}

export const TRACK_LABELS: Record<string, string> = {
  Video: "Vidéo",
  "Video 2": "Vidéo 2",
  "Video 3": "Dynamique",
  Audio: "Voix",
  Music: "Musique",
  SFX: "SFX",
  Subtitles: "Titres",
  Stickers: "Stickers",
};

/** Audio rows that auto-duck the music bed (E.1 auto-ducking). */
export const DUCKING_SOURCE_TRACKS = ["Audio", "SFX"] as const;
export const DUCKING_TARGET_TRACK = "Music";

/* ------------------------------------------------------------------ */
/* Export timeline — FR copy, single source.                          */
/*                                                                    */
/* The export engine (plugins/ui-timeline/export.ts) and the panel    */
/* must never hardcode French strings: every user-facing export word  */
/* goes through the helpers below.                                    */
/* ------------------------------------------------------------------ */

export type ExportPhase = "prerender" | "audio" | "encode" | "finalize";

export const EXPORT_LABELS = {
  button: "Export MP4",
  cancel: "Annuler",
  dismiss: "Fermer",
  dureeEstimee: (duree: string) => `Durée estimée ≈ ${duree} + pré-rendu des cartes`,
  imagesIgnorees: (n: number) =>
    `${n} image${n > 1 ? "s" : ""} de carte ignorée${n > 1 ? "s" : ""} au pré-rendu (animation non capturable) — le reste du fichier est intact.`,
  canvasIndisponible: "canvas 2d indisponible",
  canvasExportRequis: "canvas d’export 1920×1080 requis",
} as const;

/** Per-phase progress line shown under the preview while exporting. */
export function exportPhaseLabel(
  phase: ExportPhase,
  done: number,
  total: number,
  pct: number,
): string {
  switch (phase) {
    case "prerender":
      return total > 0 ? `Pré-rendu des cartes… ${done}/${total}` : "Pré-rendu des cartes…";
    case "audio":
      return "Préparation de l'audio…";
    case "encode":
      return `Encodage… ${pct}%`;
    case "finalize":
      return "Finalisation…";
  }
}

/** Download filename — the extension always matches the container. */
export function exportFileName(ext: "mp4" | "webm"): string {
  return `lilium-timeline.${ext}`;
}

/**
 * Actionable FR error for every export failure path. `detail` names the
 * offending clip (track + time) so the creator knows what to fix.
 * Never a silent skip: the engine throws these instead of dropping media.
 */
export function exportErrorMessage(code: string, detail?: string): string {
  const what = detail ? ` (${detail})` : "";
  switch (code) {
    case "cancelled":
      return "Export annulé.";
    case "no-clips":
      return "Aucun plan à exporter — ajoutez des médias à la timeline puis relancez l'export.";
    case "relative-url":
      return `Média sans URL signée${what} — régénérez-le ou réimportez le fichier, puis relancez l'export.`;
    case "fetch-failed":
      return `Téléchargement impossible${what} — l'URL signée a peut-être expiré, régénérez le média puis relancez l'export.`;
    case "decode-failed":
      return `Audio illisible${what} — régénérez le fichier audio puis relancez l'export.`;
    case "prerender-failed":
      return `Pré-rendu impossible${what} — vérifiez le contenu de la carte puis relancez l'export.`;
    case "capture-failed":
      return `Capture d'image impossible${what} — vérifiez que le média est chargé, puis réessayez.`;
    case "recorder-unsupported":
      return "Export impossible — ce navigateur ne supporte pas l'enregistrement vidéo, réessayez avec Chrome.";
    default:
      return `Export impossible${what} — réessayez, et signalez le problème si l'erreur persiste.`;
  }
}

/**
 * 100% French product strings for the shell, jobs, lineage, palette,
 * connectors, toasts, empty states and shortcuts.
 *
 * Rule: every user-visible literal lives here. Components import from
 * this module — raw English is reserved for server / console logs.
 */
export const UI_LABELS = {
  common: {
    annuler: "Annuler",
    ajouter: "Ajouter",
    ajout: "Ajout…",
    fermer: "Fermer",
    enregistrer: "Enregistrer",
    enregistrement: "Enregistrement…",
    envoyer: "Envoi…",
    reessayer: "Réessayer",
    retour: "Retour",
    supprimer: "Supprimer",
    utiliser: "Utiliser",
    executer: "Exécuter",
    enCours: "En cours…",
    valider: "Valider",
    comprendre: "Compris",
  },
  palette: {
    placeholder: "Rechercher une commande…",
    aucunResultat: "Aucune commande correspondante",
    categorieDefaut: "Général",
    aideClavier: "↑↓ pour naviguer · Entrée pour lancer · Échap pour fermer",
  },
  jobs: {
    titre: "Rendus",
    enCours: "en cours",
    total: "au total",
    videTitre: "Aucun rendu pour l’instant",
    videDescription:
      "Demandez au Director de générer un média, ou lancez un flux créatif depuis le panneau Flux.",
    graphe: "flux",
    statistiqueVide: "—",
    suite: "Afficher la suite",
    erreur: "Impossible de charger les rendus.",
    echecRendu: "Ce rendu a échoué — le détail technique est copiable pour diagnostic.",
  },
  lineage: {
    titre: "Origines",
    chargement: "Chargement des origines…",
    erreur: "Impossible de charger les origines de ce média.",
    noeudProducteur: "Nœud producteur",
    moteur: "Moteur créatif",
    sourcesDirectes: (n: number) => `Sources directes (${n})`,
    ancetres: "Médias parents",
    descendants: "Médias dérivés",
    racine: "aucun parent — média racine",
    rejouer: "Rejouer",
    dupliquer: "Dupliquer",
    comparer: "Comparer",
    astuceRejouer: "Relance le flux qui a produit ce média (bientôt disponible)",
    astuceDupliquer: "Duplique le média avec un nouvel identifiant, en gardant l’origine",
    astuceComparer: "Affiche les paramètres modifiés par rapport au parent (bientôt disponible)",
  },
  connectors: {
    titre: "Connexions",
    ajouter: "+ Ajouter",
    annuler: "Annuler",
    vide: "Aucune connexion. Ajoutez un point d’accès Gradio pour commencer.",
    formulaireTitre: "Ajouter une connexion Gradio",
    nomAffiche: "Nom d’affichage",
    nomDefaut: "Mon point d’accès Gradio",
    urlPlaceholder: "https://xxx.gradio.live/ ou https://gpu.exemple.fr/",
    authPlaceholder: "Autorisation : Bearer … (facultatif)",
    ajoutBouton: "Ajouter",
    ajoutEnCours: "Ajout…",
    tester: "Tester",
    testEnCours: "Test…",
    capacites: "Capacités",
    effacer: "Retirer",
    fermer: "Fermer",
    appeler: "Appeler",
    lancer: "Lancer",
    executionEnCours: "Exécution…",
    enLigne: (ms: number) => `en ligne · ${ms} ms`,
    horsLigne: (msg: string) => `hors ligne · ${msg}`,
    erreur: (msg: string) => `erreur · ${msg}`,
    okSansSortie: "ok · (aucune sortie)",
    erreurInconnue: "erreur · cause inconnue",
    echecAppel: "L’appel a échoué — le détail technique est copiable pour diagnostic.",
    erreurAjout: "Ajout de la connexion impossible.",
    erreurAction: "Opération sur la connexion impossible.",
    ou: "ou",
    statut: (kind: string, status: string) => {
      const s =
        status === "online"
          ? "en ligne"
          : status === "offline"
            ? "hors ligne"
            : "non pris en charge";
      const k = kind === "gradio" ? "Gradio" : kind === "comfyui" ? "ComfyUI" : kind;
      return `${k} · ${s}`;
    },
    reussite: (sortie: string) => `ok · ${sortie}`,
    capacite: (kind: string, media: string) => {
      const k =
        kind === "generate"
          ? "génération"
          : kind === "transform"
            ? "transformation"
            : kind === "analyze"
              ? "analyse"
              : kind === "tool"
                ? "outil"
                : kind === "stream"
                  ? "flux"
                  : kind;
      return `${k} · ${media}`;
    },
  },
  director: {
    titre: "Assistant",
    sansProjet: "Aucun projet ouvert.",
    connexionRequise: "Connectez-vous pour utiliser l’Assistant.",
    seConnecter: "Se connecter",
    nouvelleConversation: "Nouvelle conversation",
    nouveauMessage: "Nouvelle discussion",
    historique: "Historique",
    reglages: "Réglages",
    conversationsTitre: "Conversations passées",
    aucuneConversation: "Aucune conversation pour l’instant.",
    conversationSansTitre: "Nouvelle conversation",
    supprimerConversation: "Supprimer cette conversation ?",
    effacer: "Supprimer",
    cleApi: "Clé API OpenCode Go",
    modele: "Modèle",
    autreModele: "Autre…",
    modelePersoPlaceholder: "identifiant du modèle (p. ex. deepseek-v4-flash)",
    cloudflareTitre: "Cloudflare (génération d’images)",
    compteId: "Identifiant de compte",
    jetonApi: "Jeton API",
    cloudflareAide:
      "Utilisé pour les modèles d’image (flux-1-schnell…). La discussion reste sur OpenCode Go.",
    groqTitre: "Groq (sous-titres)",
    groqAide: "whisper-large-v3 (pré-configuré) — transcription des narrations en sous-titres.",
    mesModeles: "Mes modèles",
    modelePersoCompteur: (n: number) => `${n} perso.`,
    retirer: "Retirer",
    cleRequise:
      "Configurez votre clé API OpenCode Go dans les réglages de l’Assistant (icône d’engrenage ci-dessus) pour commencer.",
    exempleInvite:
      "Demandez à l’Assistant de construire une scène. Exemple : « Crée une ouverture en 3 plans : coucher de soleil sur les montagnes, un cavalier solitaire, un carton titre “LILIUM”. Ajoute une narration. »",
    invitePlaceholder: "Dirigez l’IA…",
    envoyer: "Envoyer",
    arreter: "Arrêter l’Assistant",
    envoiEnCours: "…",
    vous: "Vous",
    cleApiPlaceholder: "Clé API (p. ex. zen-go-…)",
    etiquettePersoPlaceholder: "Étiquette (facultatif)",
    modeleIdPlaceholderCloudflare: "identifiant du modèle (p. ex. @cf/…/flux-1-schnell)",
    pointAccesPlaceholder: "URL du point d’accès",
    pointGradio: "Point Gradio",
    capaciteImage: "Image",
    erreurGenerique: "La requête à l’Assistant a échoué.",
    erreurReseau: "Connexion au studio impossible",
    erreurHttpTransport: (status: number) => `La requête a échoué (HTTP ${status})`,
    reessayer: "Réessayer",
    arretDirecteur: "L’Assistant s’est interrompu",
    limiteAtteinte:
      "L’Assistant a atteint sa limite de planification. Reformulez avec une consigne plus courte et directe.",
    reponseTronquee:
      "La réponse a été tronquée (limite de longueur). Demandez la suite ou raccourcissez la consigne.",
    outilInterrompu: "Appel d’outil interrompu au tour précédent — poursuivez sans son résultat.",
    historiqueIllisible:
      "Historique de conversation illisible — ouvrez une nouvelle conversation et relancez votre demande.",
    reponseFournisseur: "Réponse du fournisseur",
    statutHttp: (status: number) => `HTTP ${status}`,
    erreurHttp: (service: string, status: number, extrait: string) =>
      `${service} a répondu ${`HTTP ${status}`} — ${extrait}`,
    erreurConfigCloudflare: "Cloudflare non configuré (identifiant de compte + jeton API requis).",
    erreurConfigGroq: "Clé Groq non configurée (Réglages de l’Assistant → Groq).",
    erreurConfigLovable: "Clé Lovable non configurée.",
    erreurImageVide: (service: string) =>
      `${service} n’a renvoyé aucune image. Reformulez le brief ou réessayez.`,
    echecTeleversement: (detail: string) => `Échec du téléversement : ${detail}`,
    avertissementDureeAudio: (reelleS: string, demandeeS: string) =>
      `⚠️ Le fichier audio dure ${reelleS} s mais vous avez demandé ${demandeeS} s — le plan aurait été tronqué. Durée réelle ${reelleS} s utilisée.`,
    avertissementChevauchement: (n: number, piste: string, actuelMs: number, demandeMs: number) =>
      `⚠️ Chevauchement avec ${n} plan(s) sur la piste « ${piste} ». Début décalé à ${actuelMs} ms (demandé : ${demandeMs} ms). Libérez de la place avec remove_from_timeline, ou utilisez des pistes séparées (Audio = voix, Musique = fond, Effets = bruitages) pour superposer les sons.`,
    avertissementChevauchementMaj: (piste: string, debutMs: number, finMs: number) =>
      `⚠️ Ce plan chevauche désormais un autre plan sur « ${piste} » (${debutMs} ms → ${finMs} ms). Déplacez ou raccourcissez l’un des deux pour garder un mix propre.`,
    modeleImageNonPrisEnCharge: (id: string) =>
      `Le modèle « ${id} » n’est pas pris en charge pour la génération d’images ici (seuls les modèles Cloudflare configurés le sont). Relancez sans model_id pour utiliser le moteur par défaut.`,
    envoiMediaImpossible: (detail: string) => `Envoi du média impossible — ${detail}`,
    mediaIntrouvable: "Média introuvable — vérifiez son identifiant",
    mediaSansUrl: "Média sans URL signée — régénérez la voix ou réimportez le fichier",
    transcriptionVide: "Transcription vide — l’audio est peut-être silencieux ou illisible",
    planIntrouvable: "Plan introuvable — vérifiez l’identifiant du clip",
    trimNul: "Trim de zéro image — indiquez au moins 1 image (delta_frames) ou une durée",
    trimBorne: "Trim borné : le plan ne peut pas descendre sous 100 ms",
    transformHorsBornes: (min: number, max: number) =>
      `Valeur hors bornes — utilisez un nombre entre ${min} et ${max}`,
    frameChargement: "Impossible de lire la timeline — réessayez",
    frameVision: "Analyse visuelle impossible — réessayez",
    frameImageInvalide: "Image de vérification invalide ou trop lourde",
    planAIntrouvable: "Plan A introuvable — vérifiez son identifiant",
    planBIntrouvable: "Plan B introuvable — vérifiez son identifiant",
    transitionMemePiste: "La transition exige deux plans sur la même piste",
    dureePositive: "La durée doit être positive (duration_ms > 0)",
    attenuationPlage: "L’atténuation doit être entre −40 et 0 dB",
    pisteCibleVide: (piste: string) =>
      `Aucun plan sur la piste cible « ${piste} » — rien à atténuer`,
    actionCopierDiagnostic: "Copier le diagnostic",
    diagnosticCopie: "Diagnostic copié.",
    etapeCreative: "Étape créative",
    voix: "Voix",
    sousTitres: "Sous-titres",
  },
  library: {
    sansProjet: "Aucun projet ouvert.",
    choisirEspace: "Choisir un espace",
    depot: "Déposez vos fichiers ici ou",
    parcourir: "parcourez",
    formats: "images · vidéos · audio · html · docs",
    vide: "Aucun média. Importez un fichier ci-dessus.",
    videTitre: "Aucun média pour l’instant",
    videDescription:
      "Importez vos fichiers ou demandez au Director de générer images, voix et musiques.",
    importer: "Importer",
    demanderDirector: "Demander au Director",
    aideAssistant: "Décrivez votre scène à l’Assistant, dans le panneau de droite.",
    rechercher: "Rechercher un média…",
    filtreTous: "Tous",
    importEnCours: "Import…",
    chargerPlus: (n: number, total: number) => `Charger plus (${n}/${total})`,
    chargement: "Chargement…",
    echecChargement: "Impossible de charger les médias",
    echecImport: "Échec de l’import",
    enAttente: "En attente",
    fichierAttendu: "fichier attendu",
    enAttenteFichier: "en attente du fichier",
    pendingTitre: (kind: string) => `En attente — ${kind}`,
    inviteGeneration: "Prompt de génération",
    sansPrompt: "(sans prompt)",
    aidePending: (kind: string) =>
      `Générez ce ${kind} avec l’outil de votre choix (Cloudflare, une IA locale, un service en ligne…), puis déposez le fichier ici — ou cliquez pour parcourir.`,
    depotFichier: "Déposez le fichier généré ici",
    depotEnCours: "Enregistrement…",
    depotCompleter: "Déposez pour compléter ce média en attente",
    mediaComplete: "Média complété — prêt à l’emploi.",
    doublonIgnore: "Doublon ignoré — déjà dans la médiathèque.",
    toutFormat: (kind: string) => `${kind} · tout format`,
    origine: "Origine",
    voirOrigine: "Voir l’origine",
    prises: (n: number) => `${n} prise${n > 1 ? "s" : ""}`,
    priseBadge: (label: string) => `Prise ${label}`,
    duree: (s: string) => `${s}s`,
    /* --- onglets de la colonne Assets (spec C) --- */
    ongletMedia: "Media",
    ongletTexte: "Text",
    ongletTransitions: "Transitions",
    ongletTranscript: "Transcript",
    dossierDepose: (n: number) => `${n} fichier${n > 1 ? "s" : ""} importé${n > 1 ? "s" : ""}`,
    categorizeParType: "Catégorisé automatiquement par type (vidéo · audio · photo)",
    glisserVersTimeline: "Glissez un asset sur une piste de la timeline",
    texteTitre: "Titre animé",
    texteLowerThird: "Tier inférieur",
    texteSousTitre: "Sous-titre",
    texteCaller: "Callout",
    transitionDuree: "Durée",
    transitionInseree: (label: string) => `Transition « ${label} » insérée`,
    transitionCible: "Sélectionnez deux plans consécutifs sur la même piste",
    transcriptVide: "Aucune transcription pour l'instant.",
    transcriptAide:
      "Demandez à l'Agent de transcrire la narration, puis cliquez sur une ligne pour vous y déplacer.",
    transcriptEnCours: (name: string) => `Lecture à ${name}`,
    /* --- prompt de l'agent (spec D.3) --- */
    invitePlaceholder: "Ask Manus to edit your video...",
    attacherFichier: "Joindre un rush",
    dicteeVocale: "Dictée vocale",
    dicteeActive: "Dictée en cours…",
    dicteeIndispo: "Dictée vocale indisponible dans ce navigateur",
    /* --- checklist d'actions (spec D.2) --- */
    actionsExecutees: "Actions exécutées",
    actionAsset: "Aperçu de l'asset",
  },
  timeline: {
    /* --- barre d'outils (spec B.1) --- */
    outilSelecteur: "Outil Sélecteur",
    outilCiseaux: "Outil Ciseaux",
    outilSupprimer: "Supprimer le plan",
    zoomTimeline: "Zoom de la timeline",
    zoomAvant: "Zoomer",
    zoomArriere: "Dézoomer",
    zoomReinit: "Réinitialiser le zoom",
    scissorAide: "C — couper le plan sélectionné ou tous les plans sous la tête de lecture",
    splitEffectue: (n: number) => `${n} plan${n > 1 ? "s" : ""} coupé${n > 1 ? "s" : ""}`,
    splitAucun: "Aucun plan à couper ici — placez la tête de lecture sur un plan.",
    undo: "Annuler (⌘Z)",
    redo: "Rétablir (⇧⌘Z)",
    undoIndisponible: "Rien à annuler",
    redoIndisponible: "Rien à rétablir",
    /* --- lecture / audio --- */
    pisteVideo: "Piste Vidéo",
    audioDucking: "Atténuation automatique de la musique sous la voix",
    waveform: "Forme d'onde",
    miniatures: "Miniatures",
    /* --- bibliothèque SFX --- */
    sfxTitre: "Bruitages",
    sfxAide: "Cliquez pour générer et poser sur la piste SFX.",
    sfxPose: (label: string) => `« ${label} » ajouté sur la piste SFX`,
    /* --- auto-ducking --- */
    duckingApplique: (db: number, n: number) =>
      `Musique atténuée de ${db} dB sous ${n} segment${n > 1 ? "s" : ""} audio`,
    duckingVide: "Aucune voix ni bruitage à atténuer pour l'instant.",
    sansProjet: "Aucun projet ouvert.",
    sansProjetAide: "Ouvrez un projet pour monter votre film.",
    lecture: "Lecture",
    pause: "Pause",
    arret: "Arrêter",
    pleinEcran: "Plein écran",
    quitterPleinEcran: "Quitter le plein écran",
    aidePleinEcran: "Aperçu plein écran (capture avec Cmd+Maj+5)",
    exportMp4: "Exporter MP4",
    exportFichier: (ext: string) => `Exporter ${ext.toUpperCase()}`,
    exportVideo: "Exporter la vidéo finale",
    enregistrementExport: (pct: number) => `Enregistrement… ${Math.round(pct * 100)} %`,
    plans: (n: number) => `${n} plan${n > 1 ? "s" : ""}`,
    silence: "Silence",
    silenceDuree: "Durée du silence en secondes",
    insererSilence: "Insérer un silence (Audio) à la fin de la piste",
    duckBadge: "Atténuation active sur cette piste",
    duckCourt: "duck",
    videTitre: "Timeline vide",
    videDescription:
      "Ajoutez des médias depuis la médiathèque ou demandez au Director de générer une scène.",
    erreurChargement: "Impossible de charger la timeline.",
    erreurSuppression: "Suppression impossible — réessayez.",
    erreurHorsLigne: "Hors ligne — modification non enregistrée. Reconnectez-vous puis réessayez.",
    erreurSilence: "Insertion du silence impossible — vérifiez la durée puis réessayez.",
    astuceLecture: "Lecture / Pause — Espace",
    astuceArret: "Arrêter — retour au début",
    astuceSupprimer: "Supprimer le plan — Suppr (Maj+Suppr = compacter)",
    astuceDeplacer: "Glisser pour déplacer — aimant 10 ms",
    astuceRedimensionner: "Tirer pour redimensionner — pas 10 ms, min 100 ms",
    astuceSelection: "Cliquer pour sélectionner — Échap pour désélectionner",
    astuceNudge: "←/→ ±100 ms, Maj+←/→ ±1 s",
    astuceCurseur: "Cliquer pour déplacer la tête de lecture",
    duckGain: (db: string) => `Atténué ${db} dB — le point respire avec le volume réel`,
    fonduEntree: (ms: number) => `Fondu d’entrée ${ms} ms`,
    fonduSortie: (ms: number) => `Fondu de sortie ${ms} ms`,
    appercuCarte: "Aperçu de la carte",
    animation: "Transform animé (keyframes)",
  },
  shell: {
    aucunEspace: "Aucun espace",
    rechercher: "Rechercher",
    notifications: "Notifications",
    parametres: "Paramètres",
    exporter: "Exporter",
    aideExporter: "Exporter la vidéo finale depuis l’éditeur",
    annulerAction: "Annuler",
    retablirAction: "Rétablir",
    replier: "Replier",
    deplierMenu: "Déplier le menu",
    replierMenu: "Replier le menu",
    proprietes: "Propriétés",
    espaceMontage: "Espace de montage",
    aideMontage: "Ouvrez l’Éditeur pour composer votre séquence sur la timeline.",
    arriveBientot: (label: string) => `${label} arrive bientôt`,
    aideBientot:
      "Cet espace de travail est en cours de préparation. Utilisez l’Éditeur et la médiathèque en attendant.",
    aucuneSelection: "Aucune sélection",
    aideSelection: "Sélectionnez un média ou un plan de la timeline pour ajuster ses propriétés.",
    mediaSelectionne: "Média sélectionné",
    planSelectionne: "Plan sélectionné",
    deselectionner: "Désélectionner",
    studioPret: "Studio prêt",
    renduCloud: "Rendu cloud",
    stockage: "Stockage",
    stockageValeur: "Lilium Cloud",
    navigationPrincipale: "Navigation principale",
    navigationModules: "Modules du studio",
    panneauLateral: "Panneau latéral",
    panneauMontage: "Panneau de montage",
    basculeVueMobile: "Basculer entre le chat et le studio",
    aucuneTache: "Aucune tâche",
    tachesEnCours: (n: number) => `${n} tâche${n > 1 ? "s" : ""} en cours`,
    journalDev: "Journal développeur",
    aucunEvenement: "Aucun évènement.",
    basculeTimeline: "Afficher / masquer la timeline",
    basculePanneau: "Afficher / masquer le panneau IA",
    modeDev: "Mode développeur",
    aucunProjet: "Aucun projet",
    nouveauProjet: "Nouveau projet",
    projets: "Projets",
    changerProjet: "Changer de projet",
    renommerProjet: "Renommer le projet",
    /* --- studio v2 : header + 4 zones --- */
    agent: "Agent",
    agentColonne: "Colonne Agent",
    assets: "Assets",
    assetsColonne: "Colonne Assets",
    moniteur: "Moniteur",
    moniteurColonne: "Colonne Moniteur",
    timelineZone: "Timeline",
    exportEnCours: "Rendu en cours…",
    syncOk: "Synchronisé",
    syncSync: "Synchronisation…",
    syncErreur: "Hors ligne",
    zoneRedimensionnable: "Redimensionner la zone",
  },
  inspector: {
    piste: "Piste",
    debut: "Début",
    duree: "Durée",
    contenu: "Contenu",
    nom: "Nom",
    type: "Type",
    poids: "Poids",
    creeLe: "Créé le",
    modifierVisuel: "Modifier le visuel",
    remplacerFichier: "Remplacer le fichier",
    prisesVoix: (n: number) => `Prises de voix (${n})`,
    remplacerTake: "Remplacer ce take sur le clip de la timeline",
    takeApplique: "Take appliqué — le clip garde sa position et sa durée a été ajustée.",
    takeSansTimeline:
      "Ce take n’est pas encore posé sur la timeline — ajoutez-le depuis la médiathèque.",
    priseAppliquee: (label: string) => `Prise ${label} appliquée — le plan garde sa position.`,
    ecouterPrise: (label: string) => `Écouter la prise ${label}`,
    sousTitre: "Sous-titre",
    texte: "Texte",
    police: "Police",
    taille: "Taille",
    couleur: "Couleur",
    position: "Position",
    sousTitreCompteur: (n: number) => `${n}/120`,
    sousTitreLimite: "120 caractères max — l’aperçu coupe avec …",
    sousTitreApercu: "Aperçu fidèle au rendu",
    consigne: "Consigne",
    actif: "actif",
    priseDefaut: (label: string) => `Prise ${label}`,
    erreurPrise: "Impossible d’appliquer cette prise.",
    erreurSousTitre: "Enregistrement du sous-titre impossible.",
    erreurMedia: "Opération sur le média impossible.",
    positionBas: "Bas",
    positionCentre: "Centre",
    positionHaut: "Haut",
  },
  diagnostics: {
    copier: "Copier le diagnostic",
    copie: "Diagnostic copié",
    erreurCopie: "Échec de la copie",
  },
  personnages: {
    titre: "Personnages",
    nouveau: "+ Nouveau",
    nom: "Nom *",
    description: "Description",
    portraits: "IDs des portraits (séparés par des virgules)",
    voix: "Réf. voix",
    style: "Réf. style",
    annuler: "Annuler",
    enregistrer: "Enregistrer",
    vide: "Aucun personnage pour l’instant.",
    supprimer: "Suppr.",
    sansProjet: "Aucun projet ouvert.",
    details: (id: string, portraits: number, voix: string, style: string) =>
      `id : ${id} · portraits : ${portraits} · voix : ${voix} · style : ${style}`,
  },
  scenes: {
    titre: "Scènes",
    nouvelleScene: "Nom de la nouvelle scène",
    ajouterScene: "Ajouter la scène",
    vide: "Aucune scène pour l’instant.",
    sansProjet: "Aucun projet ouvert.",
    plans: "Plans",
    erreur: "Impossible de charger les scènes.",
  },
  agent: {
    saisirMessage: "Écrivez un message…",
    envoyer: "Envoyer",
    vous: "Vous",
    assistant: "Assistant",
    titre: "Copilote",
    vide: "Décrivez ce que vous voulez créer. Exemple : « Ajoute une scène avec un détective cyberpunk dans un Tokyo au néon. »",
    reponseStub: (demande: string) =>
      `J’ai bien noté : « ${demande} ». À ce stade de la plateforme, je peux vous aider à :\n• Créer des personnages (panneau Personnages)\n• Ajouter des connecteurs Gradio (panneau Connexions)\n• Construire et lancer des flux (panneau Flux créatif)\n• Importer et voir des médias (panneau Médias)`,
  },
  mobile: {
    studio: "Studio",
    ouvrirStudio: "Ouvrir le studio",
    chat: "Chat",
    retourChat: "Retour au chat",
  },
  versions: {
    titre: "Versions",
    instantane: "Instantané",
    vide: "Aucun instantané pour l’instant.",
    restaurer: "Restaurer",
    raisonManuelle: "manuel",
  },
  graphe: {
    palette: "Palette",
    titre: (noeuds: number, liens: number) =>
      `Flux créatif · ${noeuds} nœud${noeuds > 1 ? "s" : ""} · ${liens} lien${liens > 1 ? "s" : ""}`,
    executer: "Exécuter",
    executionEnCours: "Exécution…",
    vide: "Ajoutez des nœuds depuis la palette pour commencer.",
    resultat: (statut: string, ok: number, err: number, ms: number) =>
      `${statut} · ok=${ok} err=${err} · ${ms}ms`,
    executionsRecentes: "Exécutions récentes",
    aucuneExecution: "Aucune exécution pour l’instant.",
    supprimer: "Suppr.",
    connecter: "Connecter →",
    choisirCible: "choisir une cible",
    connecteur: "Connecteur",
    choisirConnecteur: "choisir un connecteur",
    capacite: "Capacité",
    chargementCapacites: "chargement…",
    choisirCapacite: "choisir une capacité",
    sansCapacites:
      "Aucune capacité détectée — le point d’accès est peut-être injoignable. Essayez « Tester » dans l’onglet Connexions.",
    sansConnecteurs:
      "Aucun connecteur enregistré — ajoutez un point d’accès Gradio dans l’onglet Connexions.",
  },
  visionneuse: {
    modifierHtml: (nom: string) => `Modifier le HTML — ${nom}`,
    annuler: "Annuler",
    enregistrement: "Enregistrement…",
    enregistrer: "Enregistrer",
    modifier: "Modifier",
    chargementHtml: "Chargement du HTML…",
    chargementImage: "Chargement de l’image…",
    chargementVideo: "Chargement de la vidéo…",
    chargementAudio: "Chargement de l’audio…",
    erreurChargement: "Chargement du média impossible.",
    erreurEnregistrement: "Enregistrement impossible.",
  },
  toasts: {
    biblioActualisee: "Actualisation de la médiathèque demandée",
    pingEmis: "Ping émis",
    pingsEmis: "5 pings émis",
    mediaPret: "Média prêt — disponible dans la médiathèque.",
    priseUtilisee: "Prise appliquée sur le plan.",
  },
  etat: {
    enAttente: "En attente",
    enCours: "En cours",
    termine: "Terminé",
    echoue: "Échoué",
  },
  raccourcis: {
    titre: "Raccourcis clavier",
    description: "Naviguez dans le studio sans quitter le clavier.",
    palette: "Palette de commandes",
    lecture: "Lecture / pause de l’aperçu",
    supprimer: "Supprimer le plan sélectionné",
    compacter: "Supprimer + compacter (ripple)",
    nudge: "Décaler le plan de 100 ms",
    nudgeRapide: "Décaler le plan de 1 s",
    envoyerInvite: "Envoyer l’invite (⇧Entrée = nouvelle ligne)",
    fermer: "Fermer / désélectionner",
    aide: "Afficher cette aide",
  },
} as const;

/** French label for a palette command category. */
const CATEGORY_LABELS: Record<string, string> = {
  General: "Général",
  Library: "Médias",
  Debug: "Débogage",
};

export function categoryLabel(raw: string): string {
  return CATEGORY_LABELS[raw] ?? raw;
}

/** French label for a job / graph-run status. */
export function jobStatusLabel(status: string): string {
  switch (status) {
    case "queued":
      return UI_LABELS.etat.enAttente;
    case "running":
      return UI_LABELS.etat.enCours;
    case "completed":
    case "ok":
      return UI_LABELS.etat.termine;
    case "failed":
    case "error":
      return UI_LABELS.etat.echoue;
    default:
      return UI_LABELS.etat.enAttente;
  }
}

/** Connection / realtime status pill (WS6 — single pill, no error storm). */
export const CONN_LABELS = {
  reconnecting: "Reconnexion…",
  offline: "Hors ligne — reconnexion auto…",
  horsLigneCourt: "Hors ligne",
} as const;

/* ------------------------------------------------------------------ */
/* Director — actionable provider errors (WS1).                        */
/*                                                                     */
/* Every provider failure surfaced in the Director chat carries        */
/* `HTTP <status> + provider body slice ≤500ch`, formatted in French   */
/* through these helpers. Server code imports them — no hardcoded EN   */
/* user copy anywhere in the Director path.                            */
/* ------------------------------------------------------------------ */

/** Keep only the first 500 chars of a provider body for UI display. */
export function providerBodySlice(body: string): string {
  return body.slice(0, 500);
}

/** FR wrapper for any provider HTTP failure. */
export function directorHttpError(service: string, status: number, body: string): string {
  const extrait = providerBodySlice(body);
  return UI_LABELS.director.erreurHttp(service, status, extrait);
}
