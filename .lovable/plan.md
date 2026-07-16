
# Lilium — Director IA + Serveur MCP

Deux features indépendantes livrées en un même turn, alignées avec l'archi
plugin-first du kernel.

## Prérequis

1. **Activer Lovable Cloud** (`supabase--enable`) — nécessaire pour :
   - OAuth 2.1 côté serveur (auth du MCP)
   - persistance des projets/timeline côté DB (le MCP tourne côté serveur,
     il ne voit pas le `localStorage` du navigateur)
2. **Créer LOVABLE_API_KEY** (`ai_gateway--create`) pour le Director.
3. **Auth email/password + Google** (défaut Lovable Cloud) — un utilisateur
   connecté = un `app_user_id` pour le MCP OAuth.

Migration des stores Zustand `workspaces`/`projects`/`timeline` vers des
tables Supabase (`workspaces`, `projects`, `assets`, `timeline_clips`) avec
RLS `auth.uid()`. Le shell garde son état UI (panels, layout) en local.

## 1. Plugin `director` (Lovable AI)

Nouveau plugin `src/plugins/director/` contribuant :

- **Panel sidebar "Director"** : chat AI Elements avec `useChat`.
- **Server route** `src/routes/api/director.ts` : `streamText` avec
  `openai/gpt-5.5` + boucle d'outils (`stepCountIs(50)`).
- **Outils** (AI SDK `tool()`), tous exposant les mêmes signatures que le
  MCP plus bas pour partager la logique :
  - `generate_image({ prompt, aspect })` → `/v1/images/generations`
    (`google/gemini-3-pro-image`), sauvegarde blob + row `assets`.
  - `generate_voice({ text, voice })` → `/v1/audio/speech`
    (`openai/gpt-4o-mini-tts`), sauvegarde `.mp3` + row `assets`.
  - `create_html_card({ title, subtitle, style, duration_ms })` → template
    HTML/CSS rendu par le viewer `viewer-html` existant, row `assets`.
  - `add_to_timeline({ asset_id, track, start_ms, duration_ms })` →
    insère un `timeline_clip`.
  - `list_assets`, `list_timeline`.

Les outils lourds (image/TTS) s'exécutent côté serveur, retournent l'id
d'asset ; le Director enchaîne : brief → images → voix → cartes → montage
sur la timeline. Event bus émet `AssetCreated`, `TimelineChanged` pour
que la Timeline et la Library se rafraîchissent en direct.

Panel Timeline (déjà existant) branché sur la nouvelle table pour afficher
le résultat en un preview vidéo (composition des clips par piste).

## 2. Serveur MCP OAuth (`@lovable.dev/mcp-js`)

- Install : `bun add @lovable.dev/mcp-js zod` (+ whitelist dans
  `bunfig.toml`).
- `src/lib/mcp/index.ts` : `defineMcp({ auth: auth.oauth.issuer(...) })`,
  issuer = `https://${VITE_SUPABASE_PROJECT_ID}.supabase.co/auth/v1`.
- `mcpPlugin()` dans `vite.config.ts` (mount `/mcp`).
- Route de consentement `src/routes/[.]lovable.oauth.consent.tsx`
  (approve/deny via `supabase.auth.oauth`, `ssr: false`).
- `supabase--configure_oauth_server` pour activer OAuth 2.1 + DCR.
- Favicon si absent.

**Outils MCP** (mêmes handlers que le Director, factorisés dans
`src/lib/director/tools.ts`), chacun reçoit `ctx.getUserId()` et
forward le bearer à Supabase pour que RLS applique :
- `list_workspaces`, `list_projects`, `open_project`
- `list_assets`, `list_timeline`
- `generate_image`, `generate_voice`, `create_html_card`
- `add_to_timeline`, `remove_from_timeline`

Résultat : Claude Code (ou tout client MCP) se connecte via OAuth Supabase,
opère sur les projets de l'utilisateur signé, et peut piloter le Director
(ou faire du montage manuel) en tant que cet utilisateur.

## 3. Détails techniques

- **Provider AI SDK** : helper `src/lib/ai-gateway.server.ts` selon la
  knowledge `ai-sdk-lovable-gateway` (structuredOutputs off, model par
  défaut `openai/gpt-5.5`).
- **Assets storage** : blobs via l'adapter FS server-only déjà présent
  (`src/kernel/storage/adapters/fs.ts`) ; en migration Cloud on passera à
  Supabase Storage — pour cette itération on garde FS local + row DB qui
  stocke le path.
- **Timeline model** : `timeline_clips(id, project_id, track, asset_id,
  start_ms, duration_ms, order)`. Le panel Timeline compose visuellement
  (les 3 pistes : image, voix, HTML overlay).
- **HTML cards** : SSR d'un template Tailwind (title/subtitle/theme),
  stocké comme HTML, rendu par `viewer-html`.
- **Migration Zustand → Supabase** : hook `useProject(pid)` qui lit
  Supabase via `useSuspenseQuery` + fallback au store local existant
  pendant la transition.

## Structure des fichiers

```text
src/
  lib/
    ai-gateway.server.ts        # provider Lovable AI Gateway
    director/
      tools.ts                  # handlers partagés (AI SDK + MCP)
      html-cards.ts             # templates
    mcp/
      index.ts                  # defineMcp + auth OAuth
      tools/
        list-projects.ts
        generate-image.ts
        generate-voice.ts
        create-html-card.ts
        add-to-timeline.ts
        ...
  plugins/director/
    manifest.ts
    DirectorPanel.tsx
  routes/
    api/director.ts             # streamText avec tools
    [.]lovable.oauth.consent.tsx
supabase/migrations/
  NNN_studio_schema.sql         # workspaces/projects/assets/timeline_clips + RLS
```

## Hors scope (à confirmer ensuite)

- Musique / SFX : pas de modèle audio-génératif dans le catalogue Lovable
  AI aujourd'hui — reporté.
- Export vidéo final rendu côté serveur (ffmpeg) — reporté ; pour l'instant
  la timeline se joue dans le navigateur.

## Confirmation

Je vais activer Cloud (auth requise pour OAuth MCP), ajouter la clé Lovable
AI et coder les deux features. OK pour lancer ?
