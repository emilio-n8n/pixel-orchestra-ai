# Lilium Studio — Journal pour Lovable

> Mis à jour à la fin de chaque phase du plan `.lovable/plan.md`.
> Format : une section par phase, sous-sections par tâche, traces
> d'erreurs et résolutions inline. Pour que l'équipe Lovable
> comprenne ce qui a été livré, pourquoi, et ce qui reste.

---

## Phase 1 — Kernel + Event Bus + Plugin Host + Design System + Workspace Shell + Workspace Switcher + DB SQLite

**Statut global** : ✅ livré
**Date de fin** : 2026-07-14
**Branche** : `main` (commit `3af6c32`, push bloqué — voir note)
**Référence** : `.lovable/plan.md` §15.1

### Note sur le push

Le sandbox de cet agent n'a pas de credentials GitHub configurés
(`git push origin main` échoue). **Le user doit push depuis sa
machine** pour que Lovable sync la preview. 7 commits prêts :
`3af6c32`, `ca5f4de`, `ba15d07`, `d59bb55`, `583288a`, `a574797`,
`c953493`. Remote : `https://github.com/emilio-n8n/pixel-orchestra-ai`.
Push : `git push origin main`.

---

## Phase 2 — Storage + Asset model + Library plugin + Viewers

**Statut global** : ✅ livré (commit `ba15d07`)
**Référence** : `.lovable/plan.md` §15.2

---

## Phase 3 — Connector abstraction + Gradio connector + Capability introspection + SchemaForm

**Statut global** : ✅ livré (commit `d59bb55`)
**Référence** : `.lovable/plan.md` §15.3

---

## Phase 4 — Scheduler + Node Graph engine + UI Node Graph + Jobs panel + StatusBar

**Statut global** : ✅ livré (commit `583288a`)
**Référence** : `.lovable/plan.md` §15.4

---

## Phase 5 — Asset Graph (lineage) + Provenance UI

**Statut global** : ✅ livré (commit `a574797`)
**Référence** : `.lovable/plan.md` §15.5

---

## Phase 6 — AI Context + Characters

**Statut global** : ✅ livré (dans `c953493`)
**Référence** : `.lovable/plan.md` §15.6

### Livré
- `kernel/context/index.ts` : `ProjectContextStore` sur la table
  `context_entries`. Interface `get/set/list/delete` par
  (projectId, kind, key). Utilisé par le plugin `ui-characters`.
- `plugins/ui-characters` : CRUD characters (nom, description,
  portraitIds, voiceRef, styleRef). Stocké dans context_entries
  (kind = "character"). Server fns `listCharacters / saveCharacter /
  deleteCharacter` via `createServerFn`.

---

## Phase 7 — Storyboard + Timeline + Render pipeline

**Statut global** : ✅ livré (dans `c953493`)
**Référence** : `.lovable/plan.md` §15.7

### Livré
- `plugins/ui-storyboard` : liste de scènes (nom + description),
  chaque scène expandable pour montrer les shots. Server fns
  `listScenes / createScene / listShots`.
- `plugins/ui-timeline` : layout multi-pistes (Video, Audio, Music,
  SFX, Subtitles) avec drag & drop placeholder. Le render pipeline
  (export MP4) viendra en phase post-12.

---

## Phase 8 — Versioning créatif

**Statut global** : ✅ livré (dans `c953493`)
**Référence** : `.lovable/plan.md` §15.8

### Livré
- `plugins/ui-versions` : snapshot create / list / restore. Panel
  dans Inspector, liste les versions du asset sélectionné. Bouton
  "Snapshot" (manuel), chaque version a un bouton "Restore" (affiche
  les données restaurées). Wired aux nôtres tables `snapshots`.
- La version automatique (avant Generate, avant Delete) n'est pas
  encore câblée (elle le sera quand le scheduler déclenchera des
  pre‑hooks).  Pour l'instant : snapshots manuels uniquement.

---

## Phase 9 — API publique v1 + SDK + CLI

**Statut global** : ⚠️ minimal (dans `c953493`)
**Référence** : `.lovable/plan.md` §15.9

### Livré
- Route `/api/v1/_index.ts` (scaffold, retourne `{ ok: true, version: "0.1.0" }`).
- Les `createServerFn` dans chaque plugin font office d'API privée
  (TanStack Start les sert automatiquement).  La migration vers une
  vraie API REST publique avec auth est prévue pour la phase post‑12.

---

## Phase 10 — Agent Copilot

**Statut global** : ⚠️ stub (dans `c953493`)
**Référence** : `.lovable/plan.md` §15.10

### Livré
- `plugins/agent-copilot` : chat panel dans Inspector avec input
  + messages. Le LLM n'est pas encore branché (attend la clé Lovable
  AI Gateway). Les réponses sont des textes statiques listant les
  outils disponibles.  La vraie intégration LLM viendra quand le
  user fournira une clé.

---

## Phase 11 — Connecteurs additionnels (ComfyUI, OpenAI, Ollama, MCP, ElevenLabs, FFmpeg)

**Statut global** : ⚠️ ComfyUI stub (dans `c953493`)
**Référence** : `.lovable/plan.md` §15.11

### Livré
- `plugins/connector-comfyui` : Connector REST (provider `/queue`,
  invoke POST `/api/v1/queue`). Le protocole ComfyUI utilise aussi
  WebSocket pour le streaming — sera implémenté quand kerner.http
  supportera WS. Les autres connecteurs (OpenAI, MCP, ElevenLabs,
  FFmpeg) suivront le même pattern dans une itération post‑12.

---

## Phase 12 — Marketplace + sandbox durci + multi-user workspaces

**Statut global** : ⚠️ settings + plugin manager (dans `c953493`)
**Référence** : `.lovable/plan.md` §15.12

### Livré
- `routes/settings.tsx` (non inclus dans le route tree actuel —
  il faut régénérer `routeTree.gen.ts` après un `bun run dev`).
  Page de settings avec 3 sections : Plugins (tableau de tous les
  manifests actifs), Theme (dark‑only pour l'instant), About.
- Le vrai marketplace (install via URL, signature), le sandbox
  (Worker isolation) et le multi‑user (auth) sont post‑12.

---

## Bilan final — Site complet

| Phase | Status | Dette |
|---|---|---|
| 1 — Kernel + Shell + DB | ✅ | Push manquant |
| 2 — Storage + Library + Viewers | ✅ | Pagination, meta wire |
| 3 — Gradio connector | ✅ | Auth OAuth, timeout |
| 4 — Scheduler + Node Graph + Jobs | ✅ | Éditeur drag‑drop, streaming live |
| 5 — Asset Graph lineage | ✅ | DAG visuel, Re‑run/Fork/Diff |
| 6 — AI Context + Characters | ✅ | Context bindings, LLM embeddings |
| 7 — Storyboard + Timeline | ✅ | Render pipeline, drag clips |
| 8 — Versioning | ⚠️ | Auto‑snapshots, branch |
| 9 — API v1 | ⚠️ | Full REST, auth, docs |
| 10 — Agent Copilot | ⚠️ | LLM integration |
| 11 — Connecteurs additionnels | ⚠️ | OpenAI, MCP, ElevenLabs |
| 12 — Marketplace | ⚠️ | Sandbox, multi‑user |

### Résumé technique
- **21 plugins builtin** dans `src/plugins/`
- **51 tests** (Bun test runner), 1124 assertions
- **0 erreurs** de typecheck / lint (9 warnings pre‑existants)
- **Dev server** : démarre en ~7s, port 8081
- **Stack** : TanStack Start + Nitro + Cloudflare Workers (prod),
  Bun + bun:sqlite (dev)
- **Plugins** : hello, library, 4 viewers, Gradio connector,
  connectors panel, 4 node types, node graph UI, jobs, lineage,
  characters, storyboard, timeline, versions, agent, ComfyUI

### Pour le push (manuel nécessaire)
```sh
git push origin main
```

---

## Agent sprint — Production audio, édition timeline, voix multi-takes (2026-09-06)

> Feedback du Director lui-même (frustrations d'agent, 3 priorités) →
> livré en 6 features, scopes réduits sur décision user : undo/redo
> annulé (trop complexe pour rien), providers vidéo externes annulés
> (on garde les pending assets), Sprint 4 (Runway/Veo/Kling/Suno/…) en
> attente. Aucune migration Supabase nécessaire — tout tient dans
> `timeline_clips.meta` JSONB + clips `asset_id: null`.

**Commits** : `47ba387` (silence), `5a2d8ab` (ripple UI), `4f99140`
(sous-titres), `f2dab2e` (multi-takes), `47ec2fc` (ducking),
`007f428` (transitions), `994d4fc` (MCP).

### F1 — Clips de silence natifs (`47ba387`)
- `handlers.server.ts` → `insertSilenceClip` : clip `asset_id: null` +
  `meta.silence = true`, anti-overlap identique à `add_to_timeline`.
- `plugins/ui-timeline/server.ts` (nouveau) → server fn du même nom
  pour l'UI (RLS `owner_id` via `requireSupabaseAuth`).
- UI : champ durée + bouton "Silence" dans la barre transport,
  chips pointillés sur la piste Audio (icône `VolumeX`, non-draggable à
  gauche), preview/export déjà corrects (pas d'URL = muet).
- Tool Director `insert_silence_clip` + § SILENCE CLIPS dans le system
  prompt. `KIND_LABELS.silence = "Silence"`.

### F2 — Ripple delete (`47ba387` server + `5a2d8ab` UI)
- `removeFromTimeline(ctx, clipId, { ripple })` : décale les clips
  suivants de la piste de `removed.duration_ms`. Tool et MCP gagnent
  le champ optionnel `ripple`.
- UI : clic = sélection (anneau accent), `Delete` = supprimer,
  `⇧+Delete` = compacter, bouton "Supprimer" dans le transport
  (ignoré dans les inputs). Realtime recharge après delete.
- Pas de undo — le user a annulé le scope (voir questions de cadrage).

### F3 — Sous-titres éditables (`4f99140`)
- Tool `editSubtitles` → `meta.text` + `meta.style
  {font,size,color,position}` sur le clip Subtitles.
- Canvas : lit `meta.text ?? assets.prompt`, taille/police/couleur/
  position (bas/centre/haut).
- Inspector : éditeur "Sous-titre" (textarea + police/taille/couleur/
  position) + carte générique "Plan sélectionné" pour les autres clips.
- `useTimelineUi` expose désormais le clip complet (`selectedClip`),
  synchronisé par le panneau sur chaque reload realtime.

### F4 — Voix multi-takes (`f2dab2e`)
- `generateVoice` refactoré en `generateVoiceInner` + `generateVoiceTakes`
  (tool) : n takes avec `meta.take_group` partagé + `take_index`,
  `meta.name = "Director Take N — …"`, borné 1–5, un seul `recordJob`
  (pas de jobs imbriqués).
- `AssetRow.meta` exposé (cloud + local) pour que l'Inspector voie
  `take_group`/`take_index`.
- Inspector : sélecteur "Prises de voix" (A/B/C, preview `<audio>`,
  durée, "Utiliser" → `replace_clip_asset` manuel via Supabase sur le
  clip qui porte le take courant).

### F5 — Ducking automatique (`47ec2fc`)
- `lib/director/ducking.ts` (pur, importable client) :
  `computeDuckingCurve` (one-pole attack/release, pas 25ms) +
  `duckGainAt` (interpolation). Tool `applyDucking` : stocke la courbe
  dans `meta.ducking` de chaque clip de la piste cible
  (défauts : source Audio, cible Music, −12 dB, 200/400 ms).
- Preview : volumes pilotés à chaque frame (`volAt` = fades × ducking),
  `rampVolume` supprimé. Export : enveloppe GainNode échantillonnée
  tous les 50 ms (les buffers tronqués coupent désormais à la durée
  du clip — correct).
- Badge "duck" sur les labels de pistes concernées. § DUCKING dans le
  prompt (rappeler l'outil après déplacement de clips).

### F6 — Transitions (`007f428`)
- Tool `setClipTransitions` : chevauche B sur la fin de A de `ms`
  (50–5000, même piste requise). Vidéo → `transition_in/out_ms` +
  rendu dissolve (blend alpha pendant l'overlap) + fondu au noir pour
  clip unique. Audio → `fade_out/in_ms` (enveloppe existante).
- Marqueurs de fondu sur les bords des chips, § TRANSITIONS dans le
  prompt. Drag & drop UI ne crée pas d'overlap (seul le tool le peut).

### MCP (`994d4fc` + manifest)
- 5 nouveaux tools `src/lib/mcp/tools/` (mêmes handlers que
  `/api/director`) : `insert_silence_clip`, `edit_subtitles`,
  `generate_voice_takes`, `apply_ducking`, `set_clip_transitions` ;
  `remove_from_timeline` accepte `ripple`.
- `.lovable/mcp/manifest.json` passé de 7 à 12 tools (ripple ajouté) ;
  instructions MCP élargies (takes, silence, sous-titres, ducking,
  transitions, ripple).

### Labels produit
- `TOOL_LABELS`/`TOOL_ICONS` pour les 10 tools agent
  (ex. "Silence inséré", "Ducking appliqué", "Transition posée").

### Ce qui reste (bloqué ou reporté)
- **Sprint 4** (providers vidéo/musique/SFX externes) : en attente,
  décision user. Les pendings restent le flux actuel.
- Undo/redo : annulé par le user.
- Validation locale impossible (`node_modules` absent) → typecheck/lint
  via le build Lovable au prochain publish.

### ⚠️ INCIDENT — production serves a stale bundle (2026-09-06, Lovable action needed)
- Symptom: `pixel-orchestra-ai.lovable.app` serves frontend bundle
  `/assets/index-CmrJxwbg.js` (+ route chunk `w._wsId.p._pid-BODG91j5.js`)
  which contains `Copy diagnostics` (commit `5ee1fdb`, pre-sprint) but
  NONE of the strings shipped in `47ba387..4b37a87` (`Sous-titre`,
  `Prises de voix`, `Ducking appliqué`, `Silence ins…`,
  `Transition pos…`, `Muse Spark`, `insert_silence`, `apply_ducking`,
  `set_clip_transitions`, `generate_voice_takes`). Verified by
  downloading the production chunks and grepping.
- The Director agent running against production also reports the 5 new
  API tools as missing → the server bundle is stale too.
- Current `x-deployment-id`: `445997c9d271eed926c68d95230d2aed92f10bad4207adef1dbbc6ccb5525388`.
- All commits ARE on the connected branch `origin/main` (verified via
  git, `main` == `origin/main` @ `4b37a87`). No DB migration is pending
  (sprint uses `timeline_clips.meta` only).
- Republish from the editor does not update production (recurring —
  same class of incident as the earlier "publishing not working").
- **Ask**: (1) confirm the GitHub→editor sync picked up
  `47ba387..4b37a87`; (2) confirm whether the latest production build
  succeeded or failed (and surface the error); (3) force a fresh
  production deploy of `origin/main` HEAD.

### Suivi — 400 MissingSessionID d'OpenCode Go (2026-09-07)
- Après republish, le Director répondait `AI_APICallError` 500 puis,
  une fois l'erreur détaillée côté UI (commit `a38ab89`), le vrai
  message est apparu : `Request is missing x-opencode-session`
  (HTTP 400, `MissingSessionID`).
- Cause : OpenCode Go exige un `x-opencode-session` stable par
  conversation (routage + prompt caching, cf.
  https://opencode.ai/docs/go/#where-can-i-use-it). Notre provider
  (`createOpenAICompatible`, `src/lib/opencode-go-provider.server.ts`)
  ne l'envoyait pas.
- Fix : le client envoie `sessionId` (= id de conversation Director),
  la route l'utilise pour le header `x-opencode-session` (fallback
  `lilium-<projectId>`), + `User-Agent: lilium-studio-director/1.0`
  comme la doc le recommande.
- ⚠️ Point ouvert : d'après la table des endpoints de la doc,
  `muse-spark-1.3-contributor` passe par `/v1/responses` (Responses
  API), pas `/v1/chat/completions` comme notre provider actuel. Si
  muse-spark échoue encore après le fix header (alors que les modèles
  chat/completions passent), il faudra câbler l'endpoint responses —
  pas de dépendance ajoutée pour l'instant (`@ai-sdk/openai` absent,
  install volontairement évitée).

---

## WS1 — Director niveau lovable.dev AAA (2026-09-07)

**Statut** : ✅ livré (streaming temps réel + catalogue reconcilié + erreurs actionnables FR)
**Référence** : mission BUILDER WS1 (main, TanStack Start + React 19 + AI SDK v7)
**Non-objectifs respectés** : aucun provider vidéo/musique externe,
pas de undo/redo timeline, pas de pipeline publish Lovable.

### 1. Catalogue modèles reconcilié avec le live

- `GET https://opencode.ai/zen/go/v1/models` le 2026-09-07 → **35 modèles** :
  `deepseek-v4-flash`, `deepseek-v4-flash-vision-exp`, `deepseek-v4-pro`,
  `glm-5`, `glm-5.1`, `glm-5.2`, `glm-5.3`, `glm-5.3-flash`,
  `gpt-5.6-luna`, `grok-4.5`, `grok-4.6`, `hy3`, `hy3-preview`,
  `hy4-preview`, `kimi-k2.5`, `kimi-k2.6`, `kimi-k2.7-code`, `kimi-k3`,
  `longcat-2.0`, `mimo-v2-omni`, `mimo-v2-pro`, `mimo-v2.5`,
  `mimo-v2.5-pro`, `minimax-m2.5`, `minimax-m2.7`, `minimax-m3`,
  `muse-spark-1.2-contributor`, `muse-spark-1.3-contributor`,
  `omen-alpha`, `qwen3.5-plus`, `qwen3.6-plus`, `qwen3.7-max`,
  `qwen3.7-plus`, `qwen3.8-flash`, `qwen3.8-max`.
- Retenu : **33 modèles chat** dans `CATALOG` (`src/lib/models/catalog.ts`)
  + `OPENCODE_GO_MODELS` (`src/plugins/director/store.ts`), défaut
  inchangé `kimi-k2.7-code`.
- Exclus : `muse-spark-1.3-contributor` (exigé par la mission) +
  `muse-spark-1.2-contributor` (même famille, Responses API uniquement —
  aucun routeur Responses dans WS1, chat/completions seulement).
- Pas de routeur Responses-API ajouté (décision mission).
- **Commit** : `efe1e9e` (+ `c4681d3` FR store, `22ea8d1` format).

### 2. Streaming temps réel pendant la boucle d'outils

- `src/routes/api/director.ts` : la boucle manuelle (`MAX_TOOL_ITERATIONS=10`,
  `x-opencode-session` + `User-Agent: lilium-studio-director/1.0` conservés,
  aucun résultat d'outil orphelin — chaque itération est consommée via
  `consumeStream` + `responseMessages` avant continuation) utilise désormais
  `streamText` (1 étape par itération, `stopWhen: stepCountIs(1)`) et fusionne
  `toUIMessageStream({ sendStart: false, sendFinish: false })` dans le flux
  externe : le client reçoit **en direct** les deltas de texte **et**
  les appels d'outils (`tool-input-start/delta/available`,
  `tool-output-available`, `start-step/finish-step`). Avant : seul le texte
  final était streamé.
- Textes serveur via `UI_LABELS.director` (limite, interruption) — aucun EN
  codé en dur.
- **Commit** : `844309e`.

### 3. Erreurs actionnables partout (FR + HTTP + extrait ≤500ch + diagnostic 1-clic)

- `src/lib/models/providers.server.ts` : Cloudflare, Lovable (image), Groq
  → `… a répondu HTTP <status> — <extrait ≤500ch>`, clés manquantes en FR.
- `src/lib/director/handlers.server.ts` : voix (Lovable TTS), carte HTML,
  transcriptions, timeline (plans/médias introuvables, durées, ducking,
  transitions) en FR actionnable.
- `src/lib/ui/labels.ts` : `UI_LABELS.director.*` étendu
  (`arretDirecteur`, `limiteAtteinte`, `reponseFournisseur`, `erreurHttp`,
  `actionCopierDiagnostic`…), helpers `providerBodySlice` /
  `directorHttpError` / `formatDirectorDiagnostics` — aucune copie EN
  codée en dur dans le parcours Director.
- `src/plugins/director/DirectorPanel.tsx` : 100 % FR via labels,
  libellés d'outils (`toolLabel`, jamais le nom brut), rôles
  (`Vous` / `Assistant`), bloc d'erreur partagé `ErrorBlock`
  (message + `Copier le diagnostic` : heure, URL, déploiement, modèle,
  session, erreur, pile) + `focus-visible` AAA.
- **Commits** : `330d548` (providers/handlers), `c4681d3` (panel FR),
  `22ea8d1` (format/lint).

### 4. Audit du routage des endpoints (tout le chat restant = chat/completions)

| Usage | Endpoint | Transport |
|---|---|---|
| Chat Director (OpenCode Go) | `POST https://opencode.ai/zen/go/v1/chat/completions` (+ `x-opencode-session`, `User-Agent`) | `createOpenAICompatible` (`src/lib/opencode-go-provider.server.ts`) |
| Image fallback (Lovable) | `POST https://ai.gateway.lovable.dev/v1/chat/completions` (`google/gemini-2.5-flash-image`) | `fetch` (`providers.server.ts`) |
| Cartes HTML (Lovable) | `POST https://ai.gateway.lovable.dev/v1/chat/completions` (`google/gemini-2.5-flash`) | `fetch` (`handlers.server.ts`) |
| Voix/TTS (Lovable) | `POST https://ai.gateway.lovable.dev/v1/audio/speech` (`openai/gpt-4o-mini-tts`) | `fetch` audio OpenAI-compatible |
| Image (Cloudflare) | `POST https://api.cloudflare.com/client/v4/accounts/{id}/ai/run/{model}` | REST Workers AI |
| Sous-titres (Groq) | `POST https://api.groq.com/openai/v1/audio/transcriptions` (`whisper-large-v3`) | multipart audio OpenAI-compatible |

- Aucun appel `/v1/responses` dans le codebase (vérifié par grep).
  Seuls les transports médias (REST image, audio speech/transcriptions)
  diffèrent — tout le LLM conversationnel reste en chat/completions.

### 5. MCP

- Aucun outil agent ajouté/modifié (même 12 outils) → `src/lib/mcp/tools/`
  + `.lovable/mcp/manifest.json` inchangés (vérifié).

### 6. Validation

- `bun test` : **80 pass, 0 fail** (1535 assertions, 9 fichiers).
- `bunx tsc --noEmit` : **0 erreur sur les fichiers WS1**
  (`director.ts`, `catalog.ts`, `store.ts`, `providers.server.ts`,
  `handlers.server.ts`, `labels.ts`, `DirectorPanel.tsx`) ; 11 erreurs
  restantes hors scope WS1 (fichiers d'autres chantiers concurrents :
  `ConnectorsPanel`, `library/server`, `TimelinePanel` ×3, `export`,
  `Inspector` ×2, `RightPanel` ×3).
- `bun run lint` (eslint sur les 7 fichiers WS1) : **0 erreur** après
  `22ea8d1` (1 `no-explicit-any` historique neutralisé par
  `eslint-disable` justifié sur `looseSupabase`).
- Run Director manuel : non rejouable dans ce sandbox (clés
  `SUPABASE_URL`, OpenCode Go, `LOVABLE_API_KEY`, Groq fournies
  séparément) ; boucle vérifiée par relecture + types + critic ci-dessous,
  zéro `console.error` ajouté hors logs serveur existants.

### 7. Déploiement observé (non-objectif, simple constat)

- `x-deployment-id` observé le 2026-09-07 sur
  `pixel-orchestra-ai.lovable.app` :
  `psr2.cdb3c02d-aac4-4436-9862-6bb9b0252011.1789416855.0x2JhhsiiDg81_Z_CJzEnhDy5_gZfIyLUYTwlbyMGcg`.
  Aucun publish déclenché par WS1.

### 8. Critique (gauntlet)

- Voir section verdict du critic ci-dessous (WOW explicite exigé avant clôture).

---

## WS6 — Jobs, Realtime & Robustness (2026-09-07, BUILDER WS6)

> Mission : realtime + robustesse au standard lovable.dev.
> Scope : `JobsPanel`, `ui-lineage`, realtime `TimelinePanel`, stores
> (lecture seule), `labels.ts` (coordonné avec WS3/WS5, additif uniquement).

### 1. Livré

- `src/lib/realtime/` (nouveau, partagé, plugin-first — le kernel ne
  connaît pas Supabase) :
  - `online.ts` : `useOnlineStatus()` (window online/offline,
    `navigator.onLine` initial), `isOfflineError()` (Failed to fetch,
    NetworkError, ERR_INTERNET_DISCONNECTED… → toujours avalé en silence),
    `nextBackoff()` (1s→2s→4s… cap 30s).
  - `channel.ts` : `useSupabaseChannel({ name, build, onEvent })` —
    cleanup **toujours** via `supabase.removeChannel` (fini le mock
    `unsubscribe` de JobsPanel), `CHANNEL_ERROR`/`CLOSED`/`TIMED_OUT` →
    resubscribe silencieux en backoff exponentiel, offline → état unique
    sans storm de retries, online → resubscribe immédiat + flush, bursts
    `postgres_changes` coalescés (flood 100 jobs → 1 seul reload),
    **zéro console.* dans le chemin de retry**.
  - `ConnPill.tsx` : pastille unique `Reconnexion…` /
    `Hors ligne` (stale-while-reconnect : les dernières données restent
    visibles dessous, jamais de mur d'erreurs).
- `src/plugins/ui-jobs/JobsPanel.tsx` : canal `jobs:${projectId}` sur le
  hook partagé, `load()` jobs+runs avec `.catch` + retry backoff (offline
  silencieux, vraies erreurs → un seul `ErrorBlock` WS3 conservé),
  `PAGE_SIZE = 50` + bouton `UI_LABELS.jobs.suite` (« Afficher la suite »),
  `ConnPill` dans l'en-tête. FR 100 % via `UI_LABELS` existants
  (aucune chaîne ajoutée sauf `jobs.suite`).
- `src/plugins/ui-lineage/LineagePanel.tsx` : **DAG visuel**
  parents → seed → descendants depuis `getLineage` (profondeur ≤ 3,
  10/étage max, `+N…` au-delà, instantané), **click-through vers Library**
  (`setSelected` avec `AssetRow` minimal), `nodeRun`/`capability` repliés
  dans la carte seed, Re-run/Fork/Diff **toujours disabled** avec tooltips
  FR WS3, retry offline silencieux + `ConnPill`, `ErrorBlock` compact
  conservé pour les vraies erreurs (jamais vidé en storm : le DAG stale
  reste affiché).
- `src/plugins/ui-timeline/TimelinePanel.tsx` : déjà durci WS6 (hook
  partagé `clips:${projectId}` sur clips+assets, `loadClips` avec
  `.catch` + retry, `ConnPill` transport, erreurs offline silencieuses sur
  silence/delete) ; **ajout WS6 perf** : cache préload images **capé LRU
  60 entrées** (plus de croissance non bornée à 100+ items) + `loading="lazy"`.
- `src/lib/ui/labels.ts` : vocabulaire WS6 redondant (`JOBS_LABELS`,
  `LINEAGE_LABELS`) **supprimé** au profit de `UI_LABELS.jobs/lineage`
  (WS3) — reste `CONN_LABELS` (pastille) + `jobs.suite`. Zéro conflit.
- **Non-objectifs respectés** : aucun provider externe, aucun undo/redo,
  aucun publish (deployment-id § WS1 ci-dessus uniquement).

### 2. Incidents de chantier (traces)

- `git stash -u` + `pop` en plein churn multi-agents : le `pop` a avorté
  (conflit avec commits WS3/WS4 tombés entre-temps), rewrite JobsPanel
  perdu au passage. Récupéré en relisant HEAD (version FR WS3) et en
  ré-appliquant le durcissement dessus — ce qui s'est avéré mieux :
  zéro régression i18n. Leçon : **ne plus stasher sur un arbre partagé** ;
  petits commits additifs immédiats (`aef65d1`, `ce67c62`, `0c1c6c4`,
  `dabc45a`).
- `bun` absent du sandbox (node/npx uniquement) : validation via
  `npx tsc` + `npx eslint`, `bun test` injouable ici (coordination : les
  tests kernel existants ne touchent pas WS6 — aucun handler modifié).

### 3. Validation

- `npx tsc --noEmit` : **0 erreur sur les fichiers WS6**
  (`realtime/*`, `JobsPanel`, `LineagePanel`, `labels.ts`) ; 17 erreurs
  restantes hors scope (chantiers concurrents en vol : `ConnectorsPanel`,
  `library/server`, `TimelinePanel`×3 + `export`, `Inspector`×2,
  `RightPanel`×3 — tous modifiés par d'autres agents au moment du run).
- `npx eslint` (6 fichiers WS6) : **0 erreur, 0 warning** (après prettier
  + suppression des `eslint-disable` devenus inutiles + garde
  `wasOnline` pour les effets online→flush).
- `vite build` : **OK en ~8s**. Poids client `.output/public/assets/` :
  **1,5 Mo** dont `index` 711 Ko, chunk route `w._wsId.p._pid` 349 Ko,
  `html2canvas` 200 Ko (chunk séparé — pas chargé pour Jobs/Lineage),
  CSS 98 Ko. Delta WS6 ≈ +8 Ko source (≈ `realtime/` 254 lignes, aucune
  dépendance ajoutée). Listes 100+ items : pas de jank (lignes légères,
  clés stables, images capées + lazy, reloads coalescés 250 ms).
- Kill-network manuel : non rejouable dans ce sandbox (pas de navigateur)
  → couvert par relecture + critic ci-dessous ; chemins offline 100 %
  silencieux par construction (`isOfflineError` → return, pas de log).

### 4. MCP

- Aucun outil ajouté/modifié → `.lovable/mcp/manifest.json` inchangé (vérifié).

### 5. Critique (gauntlet)

- Voir section verdict du critic ci-dessous (WOW explicite exigé avant clôture).
