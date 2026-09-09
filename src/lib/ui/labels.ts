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
    envoiEnCours: "…",
    vous: "Vous",
    cleApiPlaceholder: "Clé API (p. ex. zen-go-…)",
    etiquettePersoPlaceholder: "Étiquette (facultatif)",
    modeleIdPlaceholderCloudflare: "identifiant du modèle (p. ex. @cf/…/flux-1-schnell)",
    pointAccesPlaceholder: "URL du point d’accès",
    erreurGenerique: "La requête à l’Assistant a échoué.",
    arretDirecteur: "L’Assistant s’est interrompu",
    limiteAtteinte:
      "L’Assistant a atteint sa limite de planification. Reformulez avec une consigne plus courte et directe.",
    reponseTronquee:
      "La réponse a été tronquée (limite de longueur). Demandez la suite ou raccourcissez la consigne.",
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
  },
  timeline: {
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
    aucuneTache: "Aucune tâche",
    tachesEnCours: (n: number) => `${n} tâche${n > 1 ? "s" : ""} en cours`,
    journalDev: "Journal développeur",
    aucunEvenement: "Aucun évènement.",
    basculeTimeline: "Afficher / masquer la timeline",
    basculePanneau: "Afficher / masquer le panneau IA",
    modeDev: "Mode développeur",
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
    positionBas: "Bas",
    positionCentre: "Centre",
    positionHaut: "Haut",
  },
  diagnostics: {
    copier: "Copier le diagnostic",
    copie: "Diagnostic copié",
    erreurCopie: "Échec de la copie",
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

export interface DirectorDiagnostics {
  url: string;
  deployment: string;
  model?: string;
  session?: string;
  error: string;
  stack?: string;
}

/** One-click diagnostics block copied from the Director error card. */
export function formatDirectorDiagnostics(d: DirectorDiagnostics): string {
  const lines = [
    `heure : ${new Date().toISOString()}`,
    `url : ${d.url}`,
    `déploiement : ${d.deployment}`,
  ];
  if (d.model) lines.push(`modèle : ${d.model}`);
  if (d.session) lines.push(`session : ${d.session}`);
  lines.push(`erreur : ${d.error}`);
  lines.push(`pile : ${d.stack ?? "(aucune)"}`);
  return lines.join("\n");
}
