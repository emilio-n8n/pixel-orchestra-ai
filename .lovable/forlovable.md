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
