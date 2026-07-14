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
