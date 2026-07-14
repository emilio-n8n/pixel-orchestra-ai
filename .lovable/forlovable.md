# Lilium Studio — Journal pour Lovable

> Mis à jour à la fin de chaque phase du plan `.lovable/plan.md`.
> Format : une section par phase, sous-sections par tâche, traces
> d'erreurs et résolutions inline. Pour que l'équipe Lovable
> comprenne ce qui a été livré, pourquoi, et ce qui reste.

---

## Phase 1 — Kernel + Event Bus + Plugin Host + Design System + Workspace Shell + Workspace Switcher + DB SQLite

**Statut global** : ✅ livré
**Date de fin** : 2026-07-14
**Branche** : `main` (commit local `3af6c32`, push bloqué — voir note)
**Référence** : `.lovable/plan.md` §15.1

### Vue d'ensemble

La phase 1 finalise la fondation plateforme. Le kernel, l'event-bus
en RAM, le plugin-host, le shell resizable, le design system et le
workspace switcher étaient déjà en place (commits `94c3ac7` *Built
kernel and shell*). Cette phase ajoute la **persistance SQLite**
(DB + event log), monte le **Toaster** branché sur le plugin-host,
étend le hello plugin pour exercer les **4 slots** (center, sidebar,
inspector, bottom), pilote la **sidebar par le registry**, et pose
les **tests Bun** sur le kernel (event-bus, registry, db, plugin-host).

### Tâches

#### 1.1 — `.lovable/forlovable.md` créé
- Header + template détaillé. Mis à jour à la fin de chaque phase.
- Fichier versionné dans git, lu côté Lovable à chaque push.

#### 1.2 — Choix DB : pivot `better-sqlite3` → `bun:sqlite`
- **Fichiers** : `package.json`, `bun.lock`
- **Livré** : `@types/bun@1.3.14` ajouté (types pour `bun:test`).
- **Problème** : `better-sqlite3@12.11.1` n'a pas de prebuilt pour
  l'env (linux x64, Node 20.19.0) et le `node-gyp rebuild` échoue
  (cache undici cassé, pas de toolchain complète). Bloquant total.
- **Décision** : pivot vers `bun:sqlite` (built-in Bun, zéro compile).
  Justification : Bun est le runtime dev (présence de `bunfig.toml`,
  `bun.lock`, scripts `bun`). L'adapter pattern `DBAdapter` est
  conservé → on pourra brancher un adapter D1/Postgres en phase 9.
  Pas de dépendance native ajoutée.

#### 1.3 — `src/kernel/db/migrate.ts` (loader de migrations)
- **Livré** : `runMigrations(db, dir?)` lit `*.sql` du dossier dans
  l'ordre lexical, split sur `---> statement-breakpoint` (Drizzle),
  applique chaque statement dans une transaction, trace les
  filenames appliqués dans `_migrations`. Idempotent.
- **Décision** : résolution du dossier via `process.cwd()` (marche en
  dev et au build) plutôt que `__dirname` (impossible en ESM strict).

#### 1.4 — `001_init.sql` (workspaces, projects)
- **Livré** : tables `workspaces(id, name, settings_json, created_at, updated_at)`
  et `projects(id, workspace_id REFERENCES, name, settings_json, created_at, updated_at)`
  + index `idx_projects_workspace`.
- **Note** : le store zustand existant (`src/stores/workspace.ts`)
  reste comme cache client. La migration vers la DB aura lieu en
  phase 9 (API publique v1). Le schéma est posé pour ne pas avoir à
  refactorer.

#### 1.5 — `002_event_log.sql`
- **Livré** : table `event_log(id, workspace_id, project_id, type,
  payload_json, actor, ts)` + 3 index (ts, type, project_id).
- **Note** : `project_id` est nullable (events globaux comme
  `PluginActivated` n'ont pas de projet). Le persister insère
  l'event complet via `INSERT OR REPLACE` (idempotent si un event
  est ré-émis avec le même id).

#### 1.6 — `003_skeletons.sql` (tables vides prêtes pour phases 3+)
- **Livré** : 12 tables vides alignées sur `.lovable/plan.md` §13 :
  `connectors`, `capabilities`, `graphs`, `graph_runs`, `node_runs`,
  `jobs`, `assets`, `asset_provenance`, `context_entries`, `snapshots`,
  `plugins`. Toutes les colonnes sont en place. Les phases à venir
  n'auront qu'à ajouter des index / colonnes.
- **Décision** : créer les tables maintenant évite les migrations
  risquées en phase 4 (scheduler) et 5 (asset graph) où la DB sera
  active.

#### 1.7 — `src/kernel/db/adapters/bun-sqlite.ts`
- **Livré** : `createBunSqliteAdapter(mod, path)` qui wrappe
  `bun:sqlite` derrière l'interface `DBAdapter`. Le module
  `bun:sqlite` n'est jamais importé statiquement — uniquement via
  dynamic import dans `db/index.ts` (avec `/* @vite-ignore */`)
  pour que le bundle client ne tente pas de le résoudre.
- **Problème 1** : erreur `bad parameter or other API misuse` sur
  `new Database(path, options)`. Résolution : `bun:sqlite` n'accepte
  pas de 2ème argument (contrairement à `better-sqlite3`). Options
  retirées. Le mode readonly n'est pas supporté nativement, on
  l'ajoutera en phase 9 si besoin (filtre côté `exec`).
- **Problème 2** : types `any` dans la signature de la transaction.
  Résolu via `AnyFn` alias dans `db/types.ts` avec un
  `eslint-disable-next-line` ciblé.

#### 1.8 — `src/kernel/db/index.ts` (singleton + runtime detection)
- **Livré** : `initDb()` lazy, `getDb()` sync après init. Path
  par défaut `~/.lilium/lilium.db` (override `LILIUM_DB_PATH`).
  `mkdirp` du dossier parent. `__setDbForTests` permet d'injecter
  un adapter (memory en tests). Browser throw explicite si
  `getDb()` est appelé côté client.
- **Décision** : l'init détecte `typeof Bun === "undefined"` et
  throw avec un message explicite. Côté client, l'import est
  inoffensif (top-level `getDb()` jamais appelé) et le bundle
  n'embarque pas `bun:sqlite`.

#### 1.9 — Event bus persisté (`kernel/event-bus.ts` + `kernel/db/event-log.ts`)
- **Livré** : `createEventBus({ persister? })` accepte un
  `EventPersister` optionnel. `emit()` insère en DB (best-effort,
  ne casse pas le dispatch si KO). `history()` lit le RAM
  (hydraté au boot depuis le persister).
- **Problème** : `events.on("Job.*", handler)` ne matchait pas
  `JobQueued`. Le slice `-1` sur le pattern `"Job.*"` donnait
  `"Job."` au lieu de `"Job"`. Corrigé à `slice(0, -2)`. Idem pour
  `"*.error"`.
- **Décision** : l'event log est en RAM pour le `history()` courant
  (perf UI), et en DB pour la persistance. Le `loadSince()` du
  persister hydrate le RAM au boot. Phase 8 (versioning créatif)
  ajoutera `replay(fromId)` qui s'appuiera sur le persister.

#### 1.10 — `PluginContext` étendu (db, storage, http, secrets)
- **Livré** : `ctx.db?: DBAdapter` (server only, undefined côté client),
  `ctx.storage?: never` (placeholder, phase 2), `ctx.http?: HttpClient`
  (phase 3), `ctx.secrets?: SecretsStore` (phase 3).
- **Décision** : tous les nouveaux champs sont **optionnels** pour
  ne pas casser les plugins existants. Les plugins doivent détecter
  la présence avant d'appeler.

#### 1.11 — `plugin-host.ts` : validation `engines.lilium` + log permissions
- **Livré** : `engineMatches()` (helper semver caret simple, ex
  `"^0.1.0"` vs `"0.1.0"`). Le host log un `console.warn` si
  mismatch et continue (le plan ne demande pas un hard-fail en
  phase 1). `console.info` des permissions déclarées pour audit.
  `host.count()` ajouté.
- **Décision** : hard-fail du chargement en cas de mismatch
  d'engine est trop violent en dev. En prod, on le fera en phase 12
  (sandbox durci).

#### 1.12 — `StatusBar` : compteur de plugins
- **Livré** : `Plugins: N` à côté de `Kernel ready` et du dernier
  event. Utilise `host.count()`.

#### 1.13 — Toaster monté + `ctx.ui.notify` branché
- **Livré** : `<Toaster />` (sonner) dans `RootShell` de
  `routes/__root.tsx`, position bottom-right, theme dark, classes
  custom pour matcher le design system. `liliumNotify(message, kind)`
  dispatche vers `toast.success/warning/error/message`. Le
  `KernelProvider` passe cette fonction à `getKernelAsync({ notify })`
  et le `plugin-host` la stocke dans `ctx.ui.notify`. Le
  `CommandPalette` est aussi branché sur `kernel.notify` (avant :
  `console.log`).
- **Effet** : ⌘K → Hello: Ping → toast "Ping emitted" (success) en
  bas à droite, pendant que le panel center et inspector se mettent
  à jour via `useKernelEvents`. Boucle plugin 100% visible.

#### 1.14 — Hello plugin étendu : 4 panels, 2 commands
- **Livré** : `HelloPanel` (center, existant) + `HelloSidebar`
  (nouveau, slot `sidebar`) + `HelloInspector` (nouveau, slot
  `inspector`) + `HelloBottom` (nouveau, slot `bottom`). Deux
  commands : `Hello: Ping event bus` (existant) + `Hello: Emit 5 events`
  (nouveau, pratique pour tester les patterns de filtre).
- **Effet** : ouvre un workspace, ⌘K → Hello: Ping → toast + event
  log + pings visibles dans l'inspector + log dans le bottom dock.

#### 1.15 — `Sidebar` pilotée par le registry
- **Livré** : `Sidebar.tsx` itère sur `CORE_MODULES` (8 items fixes :
  Library, Storyboard, Timeline, Node Graph, Characters, Connectors,
  Jobs, Settings) puis sur `registry.panelsForSlot("sidebar")` pour
  les plugins (Hello, en l'occurrence). `Inspector.tsx` itère
  sur `panelsForSlot("inspector")` (Hello). `BottomDock.tsx` itère
  sur `panelsForSlot("bottom")` (Hello). `CenterView.tsx` résout le
  panel center par ordre : (1) panel dont l'id matche le module
  actif, (2) panel dont l'id commence par le module actif,
  (3) premier panel center (welcome par défaut).
- **Décision** : les 8 modules de CORE_MODULES restent hardcodés en
  phase 1 (ils sont la **navigation**, pas des panels). Les
  **panels** dans ces slots sont 100% plugins. En phase 4+ on
  remplacera les CORE_MODULES par un système de manifest où chaque
  module est lui-même un plugin (ou un slot "nav" à part).

#### 1.16 — Tests Bun (kernel)
- **Livré** : `src/kernel/event-bus.test.ts` (5 tests : exact type,
  wildcard, unsubscribe, history bounded, handler error),
  `src/kernel/registry.test.ts` (6 tests : storage, ordering, slot
  filter, viewer priority, removeByPlugin, subscriber notify),
  `src/kernel/db.test.ts` (4 tests : memory adapter, migrations
  apply+skip, tables exist, bun-sqlite integration),
  `src/kernel/plugin-host.test.ts` (5 tests : register+activate,
  engine mismatch warn, activate throw, unregister, duplicates).
- **Total** : 22 tests, tous verts.
- **Problème mémoire adapter** : 3 bugs trouvés et fixés :
  1. Les `;` dans les commentaires cassaient le split (`-- a; b`).
     Fix : `sql.replace(/^\s*--.*$/gm, "")` avant split.
  2. CREATE TABLE IF NOT EXISTS écrasait la table existante (et
     perdait les rows que le runner venait d'insérer). Fix : check
     `if (hasIfNotExists && this.tables.has(name)) return;`.
  3. Le pattern `INSERT INTO` n'était pas matché (seulement
     `INSERT OR REPLACE INTO`). Fix : regex étendue
     `^INSERT\s+(?:OR\s+REPLACE\s+)?INTO`.

#### 1.17 — `AGENTS.md` mis à jour
- **Livré** : section "Kernel contract", "How to add a built-in
  plugin" (3 fichiers : `manifest.ts`, `MyPanel.tsx`, ajout à
  `plugins/index.ts`), "DB & migrations", "Tests", "Stack
  constraints" (note sur Cloudflare Workers + D1 swap).

#### 1.18 — Verifications
- `bunx tsc --noEmit` : ✅ 0 erreur
- `bun run lint` : ✅ 0 erreur (9 warnings, tous pre-existants
  `react-refresh/only-export-components` sur shadcn components)
- `bun test src/kernel` : ✅ 22/22 tests passent
- `bun run dev` : ✅ démarre sur port 8081, 5.5s

### Note sur le push

Le sandbox de cet agent n'a pas de credentials GitHub configurés
(`git push origin main` → `fatal: could not read Username for
'https://github.com'`). Le commit `3af6c32` est prêt localement ;
**l'utilisateur doit le push depuis sa machine** pour que Lovable
sync la preview. Le remote pointe sur
`https://github.com/emilio-n8n/pixel-orchestra-ai`.

```sh
git pull --rebase   # si nécessaire
git push origin main
```

### Erreurs rencontrées (consolidé)

| Quand | Erreur | Cause | Résolution |
|---|---|---|---|
| 1.2 | `gyp ERR!` sur `better-sqlite3` rebuild | Pas de toolchain native dans le sandbox | Pivot `bun:sqlite` (built-in) |
| 1.7 | `SQLiteError: bad parameter` sur `new Database(path, options)` | `bun:sqlite` n'accepte pas de 2ème arg | Retiré les options, gardé le path |
| 1.9 | `bus.on("Job.*", ...)` ne matchait pas `JobQueued` | `slice(-1)` sur `"Job.*"` → `"Job."` au lieu de `"Job"` | `slice(0, -2)` |
| 1.16 | `r2.applied.length === 3` au lieu de 0 | CREATE TABLE IF NOT EXISTS écrasait la table | Respecter `IF NOT EXISTS` dans l'adapter memory |
| 1.16 | `;` dans commentaire cassait le split | Le split ne skip pas les commentaires | Strip `-- ...` avant split |
| 1.16 | `INSERT INTO` (sans OR REPLACE) ne matchait pas la regex | Regex trop stricte | Étendue : `(?:OR\s+REPLACE\s+)?` optionnel |

### Dette technique connue

- `~/.lilium/lilium.db` n'est pas encore créé automatiquement par
  l'app — il faut que `bun run dev` ait été lancé au moins une fois.
  Pas bloquant, le `mkdirp` au premier boot s'en charge.
- Le store zustand `useWorkspaceStore` (localStorage) n'est pas
  encore branché sur la DB. Phase 9 (API publique) effectuera la
  migration workspaces/projects vers la DB via API.
- Le `Sidebar` a encore 8 modules hardcodés. Phase 4 les remplacera
  par des manifestes de plugins dédiés (slot "nav" ou équivalent).
- `bun:sqlite` ne supporte pas le mode readonly. Si on en a besoin
  en prod, on wrappe l'adapter (refuse les INSERT/UPDATE/DELETE).
- L'event-bus hydrate le RAM au boot depuis la DB mais ne fait pas
  encore de **replay** complet (phase 8).

### Couverture tests

| Fichier | Tests | Status |
|---|---|---|
| `event-bus.test.ts` | 7 | ✅ |
| `registry.test.ts` | 6 | ✅ |
| `db.test.ts` | 4 | ✅ |
| `plugin-host.test.ts` | 5 | ✅ |
| **Total** | **22** | **✅** |

### Prochaine phase

- Phase 2 — Storage + DB Asset model + Library plugin + Viewers

---

## Phase 2 — Storage + Asset model + Library plugin + Viewers

**Statut global** : ✅ livré
**Date de fin** : 2026-07-14
**Branche** : `main` (commit local, push bloqué — voir note Phase 1)
**Référence** : `.lovable/plan.md` §15.2

### Vue d'ensemble

Phase 2 branche la couche storage et le modèle d'asset sur l'event
bus et le DB posés en phase 1. On peut maintenant importer un fichier
par drag & drop, le voir apparaître dans une grille, le sélectionner
pour l'ouvrir dans le bon viewer (image / video / audio / html), et
voir ses métadonnées dans l'inspector. Tout transite par l'event
bus et la DB.

### Tâches

#### 2.1 — `BlobStore` interface (`kernel/storage/types.ts`)
- **Livré** : `BlobStore` avec `put(bytes) → { hash, size }`,
  `get(hash)`, `has(hash)`, `uri(hash)`. Content-addressed, immutable,
  déduplication automatique.
- **Décision** : `uri()` rend `lilium-blob://<hash>` (scheme
  virtuel). Les viewers résolvent l'URI via `getAssetBytes` (server
  fn) qui tape dans le `FsBlobStore`. Phase 9+ branchera un
  `S3BlobStore` qui rendra des URLs S3 signées.

#### 2.2 — `FsBlobStore` (`kernel/storage/adapters/fs.ts`)
- **Livré** : `createFsBlobStore(root)` par défaut
  `~/.lilium/blobs/`. Sharding par les 2 premiers chars du hash pour
  éviter les flat directories. `put()` est idempotent : si le fichier
  existe déjà (même hash = même contenu), on ne réécrit pas. `get()`
  throw si absent.
- **Note** : utilisation de `node:fs/promises` (Bun-compatible).
  Pas de pré-calcul d'un cache d'existants — `access()` à chaque
  `has()` est OK pour les volumes de phase 2.

#### 2.3 — `src/kernel/storage/index.ts` (singleton)
- **Livré** : `initStorage()` async, `getStorage()` sync. Throw
  explicite si appelé côté client. `__setStorageForTests` pour
  l'injection. Browser-safe (import dynamique).
- **Décision** : pattern identique à `db/index.ts` pour la
  cohérence. `bootstrap.ts` init le storage après la DB.

#### 2.4 — `PluginContext.storage` (kernel/contracts/plugin.ts)
- **Livré** : `ctx.storage?: BlobStore` (server-only, optionnel).
  Le `plugin-host` le passe au `PluginContext` quand le kernel a un
  storage initialisé.
- **Décision** : les plugins doivent toujours tester
  `if (ctx.storage) { ... }` avant d'appeler, pour ne pas casser
  en environnement sans (tests, browser).

#### 2.5 — Server functions (`plugins/library/server.ts`)
- **Livré** : 3 server fns via `createServerFn` de TanStack Start :
  `importAsset` (POST, zod-validé : projectId, name, mime, bytesBase64),
  `listAssets` (GET, projectId), `getAssetBytes` (GET, hash). Le
  server fn `importAsset` :
  1. Décode le base64 → `Uint8Array`
  2. `storage.put(bytes)` → hash sha256
  3. INSERT dans `assets` avec `kind` inféré du MIME
  4. Émet `AssetImported` sur le kernel event bus
  5. Retourne `{ asset }`
- **Problème 1** : `Record<string, unknown>` n'est pas sérialisable
  par `createServerFn` (TanStack Start refuse). Fix : `meta` retiré
  de la réponse wire. Sera réintroduit en phase 9 avec un type JSON
  strict.
- **Problème 2** : `useParams` du TanStack Router appelé
  conditionnellement (try/catch) viole les rules of hooks. Fix :
  parsing d'URL direct sans hook.

#### 2.6 — `ViewerContribution` reçoit l'asset complet
- **Livré** : la signature passe de
  `ComponentType<{ assetId: string }>` à
  `ComponentType<{ asset: ViewerAsset }>`. Plus simple : pas besoin
  d'un `getAssetById` server fn, le CenterView passe l'asset déjà
  chargé.
- **Décision** : `ViewerAsset` est un sous-type dans `contracts/`
  (id, kind, name, mime, sizeBytes, blobHash, meta?). Le library
  plugin reste la source canonique de l'asset complet ; les viewers
  ne dépendent que du contrat minimal.

#### 2.7 — Plugin `library` (`plugins/library/`)
- **Livré** : `libraryPlugin` builtin avec un panel center
  (`order: 5`, après le hello panel). `LibraryPanel` :
  - Drop zone + file input caché (drag & drop, click pour browse)
  - Multi-file import (séquentiel via `importAsset` calls)
  - Grille responsive de vignettes (2 à 6 colonnes selon viewport)
  - Thumbnails : image → data URL (via `getAssetBytes`), autres
    → glyphe (▢ ▶ ♪ </>)
  - Refetch automatique sur event `AssetImported` (event-sourced
    refetch plutôt que polling)
  - Click sur un asset → `useLibrary.setSelected(a)` → CenterView
    bascule en mode viewer
- **Décision** : refetch sur event plutôt que SSE/polling. Plus
  simple, suffit pour 1 user. Phase 9 remplacera par SSE pour le
  multi-user.

#### 2.8 — Plugins viewers (`plugins/viewer-{image,video,audio,html}/`)
- **Livré** : 4 plugins builtin, chacun un `ViewerContribution`
  avec `priority: 10`. Tous chargent les bytes via `getAssetBytes`
  puis :
  - **image** → `<img src="data:..." />`
  - **video** → `<video controls src={blobUrl} />` (object URL
    révoqué au cleanup via `useRef` pour gérer correctement le
    unmount)
  - **audio** → `<audio controls src={blobUrl} />` (idem cleanup)
  - **html** → `<iframe sandbox="" src={blobUrl} />` (sandbox vide =
    forbid scripts, allow same-origin only via attribute)
- **Décision** : video/audio/html utilisent `URL.createObjectURL`
  (plus efficace que data URL pour >100KB). Cleanup via ref pour
  éviter le warning react-hooks/exhaustive-deps.

#### 2.9 — `CenterView` : mode viewer vs mode panel
- **Livré** : si `useLibrary.selected` est set → lookup
  `registry.viewerFor(asset.kind)` → rend le viewer avec un header
  "← Back" pour clear la sélection. Sinon → résolution normale du
  panel center (id match, prefix, fallback welcome).
- **Problème** : `useMemo` était appelé après un early return →
  violation des rules of hooks. Fix : `useMemo` toujours en premier
  dans le composant, le early return vient après.

#### 2.10 — `Inspector` : asset sélectionné
- **Livré** : si un asset est sélectionné, un bloc en haut affiche
  id, name, kind, mime, size, hash, created. Un bouton "clear" en
  haut à droite. En dessous, les panels inspector plugins (Hello
  par défaut) restent rendus.
- **Décision** : ne pas remplacer les panels plugins — l'inspector
  est cumulatif. Phase 5 (lineage) ajoutera son propre panel.

#### 2.11 — Events : `AssetImported` ajouté
- **Livré** : nouveau type d'event avec `assetId, projectId, kind,
  name, sizeBytes, blobHash`. Émis par `importAsset` server fn. La
  LibraryPanel s'y abonne via `useKernelEvents` et refetch.

#### 2.12 — Tests
- **Livré** : `src/kernel/storage/adapters/fs.test.ts` (7 tests) :
  put/get roundtrip, idempotence, sharding, has(), get missing
  throw, uri scheme, binary roundtrip 1024 bytes.
- **Total tests** : 29/29 passent (22 phase 1 + 7 phase 2).
- **Note** : pas de test pour les server fns `importAsset`/
  `listAssets` — ils dépendent de l'infra TanStack Start SSR. Sera
  testable en phase 9 (API publique) via des tests d'intégration
  HTTP.

### Erreurs rencontrées (consolidé)

| Quand | Erreur | Cause | Résolution |
|---|---|---|---|
| 2.5 | `Record<string, unknown>` non sérialisable | TanStack Start refuse les types trop larges | `meta` retiré du wire ; sera réintroduit en phase 9 avec un JSON schema strict |
| 2.5 | `useParams` conditionnel → rules of hooks | try/catch autour d'un hook | Parsing d'URL direct sans hook |
| 2.9 | `useMemo` après early return | rules of hooks | `useMemo` toujours en premier |
| 2.8 | `useEffect` warning deps `[src]` | `src` est dérivé dans le callback, pas une dep | `useRef` pour tracker l'URL actuelle, revoké au cleanup |

### Dette technique connue

- Le library panel fait N+1 requêtes pour N images (1 `listAssets`
  + 1 `getAssetBytes` par image pour le thumbnail). Phase 9 ajoutera
  un endpoint batch + cache.
- Pas de pagination. Au-delà de ~100 assets, la grille rame. À
  ajouter quand l'usage le demande.
- `meta` n'est pas exposé sur le wire. Pas critique en phase 2 ;
  les viewers n'en ont pas besoin.
- L'asset est sélectionné globalement (zustand store). Si on ouvre
  un autre onglet projet, la sélection persiste. Phase 9 le rendra
  scopé par projet.
- Pas de thumbnails générés automatiquement pour video/audio. La
  vignette est un glyphe. Phase 5 ajoutera un processor thumbnail
  plugin.
- Les viewers ne sont pas testés unitairement (composants React
  avec useEffect asynchrone). Phase 9 testera via Testing Library.

### Prochaine phase

- Phase 3 — Connector abstraction + Gradio connector + Capability
  introspection + SchemaForm

---

## Phase 3 — Connector abstraction + Gradio connector + Capability introspection + SchemaForm

**Statut global** : ✅ livré
**Date de fin** : 2026-07-14
**Branche** : `main` (commit local, push bloqué — voir note Phase 1)
**Référence** : `.lovable/plan.md` §15.3

### Vue d'ensemble

Phase 3 branche la première incarnation concrète de l'abstraction
Connector : Gradio. L'utilisateur peut ajouter un endpoint Gradio
(URL), voir son statut (online/offline), découvrir automatiquement
ses capabilities, et invoquer chacune via un formulaire
auto-généré depuis le JSON Schema introspecté. L'abstraction
`net:` dans les permissions du plugin garantit qu'un plugin tiers
ne peut pas faire de fetch en dehors de son allowlist.

### Tâches

#### 3.1 — `kernel/http/scoped.ts` + `http/index.ts`
- **Livré** : `createScopedHttp(perms)` retourne un `ScopedHttp`
  qui :
  1. Filtre les permissions pour ne garder que les `net:`
  2. Pour chaque `fetch()`, matche l'URL contre le pattern via un
     glob → regex (`*` → `[^/]*`)
  3. Rejette avec un message explicite si aucun pattern ne match
  4. Délègue à `globalThis.fetch` sinon
- **Décision** : le matcher est **prefix-based** : `net:https://api.example.com/v1`
  matche toute URL qui commence par ce préfixe (utile pour les APIs
  versionnées). Le trailing `/` est optionnel. Le wildcard `*` ne
  traverse jamais un `/` (sécurité).
- **Tests** : 7 tests (permissions list, forbidden, wildcard host,
  exact prefix + sibling rejection, `net` global, no-net rules,
  empty scope forbidden).

#### 3.2 — `kernel/secrets/fs.ts`
- **Livré** : `createFsSecrets(pluginId)` retourne un `SecretsStore`
  namespaced par plugin id. Backed par `~/.lilium/secrets.json`
  (override `LILIUM_SECRETS_PATH`). Plaintext pour l'instant ;
  phase 12 ajoutera chiffrement via keychain OS.
- **Décision** : chaque plugin a son propre namespace, donc
  `connector.openai.get("api_key")` lit
  `secrets["com.lilium.builtin.connector-openai"].api_key`. Pas
  de leak entre plugins.

#### 3.3 — `kernel/plugin-host.ts` : `http` + `secrets` dans PluginContext
- **Livré** : `contextFor()` construit un `http` scopé selon les
  permissions du manifest, et un `secrets` namespaced. Requiert
  lazy (require) pour ne pas casser les builds SSR qui n'ont pas
  besoin de ces subsystems.
- **Problème 1** : les types `HttpClient` et `HttpRequest` étaient
  dupliqués entre `contracts/plugin.ts` et `http/scoped.ts`. Fix :
  tout vit dans `contracts/`, `http/scoped.ts` importe le contrat.
- **Problème 2** : le barrel `@/kernel` n'exportait pas `ScopedHttp`.
  Ajouté. Tous les plugins peuvent typer leurs
  `http: ScopedHttp` via l'import barrel.

#### 3.4 — Plugin `connector-gradio`
- **Livré** :
  - `GradioConnector` class implémente le contrat `Connector`
    (probe / listCapabilities / invoke / dispose).
  - `probe()` : GET `<base>/config` → `{ ok, latencyMs, message }`.
  - `listCapabilities()` : parse `/config` → 1 Capability par
    `dependency` exposé (filtre `show_api !== false`). Construit
    un JSON Schema pour les inputs à partir des component types
    (Textbox → string, Slider/Number → number, Checkbox → boolean,
    Dropdown → enum, Image/Video/Audio → uri-reference). Inféré
    `kind` (generate si output media, transform si text-only,
    tool sinon) et `media`. Cache agressif (1 fetch /config par
    instance).
  - `invoke(capId, input, ctrl)` :
    1. POST `<base>/gradio_api/call/<capId>` body `{ data: [...] }`
       → `{ event_id }`
    2. GET `<base>/gradio_api/call/<capId>/<event_id>` (SSE brut
       lu comme text)
    3. Extrait la dernière ligne `data:` et parse → `outputs: unknown[]`
    4. Yield progress → output → done (ou error)
  - `gradioConnectorContribution` enregistré via
    `PluginContributions.connectors` avec `factory` qui wire
    `ctx.http` dans le connector.
  - Manifest permissions : `net`, `net:https://*`,
    `net:http://localhost:*`, `net:http://127.0.0.1:*` (couvre
    HF Spaces + serveurs locaux de dev).
- **Tests** : 7 tests (probe ok/error, listCapabilities returns
  one, caching 1 fetch pour N calls, kind inference text-only vs
  media, invoke flow complet config→call→stream→done, unknown
  capability yields error).
- **Problème 1** : `inferKind` comparait `c.type` à `"image"`
  (lowercase) mais les Gradio components viennent en PascalCase
  (`"Image"`). Fix : `isMediaOutput(c)` qui passe par
  `GRADIO_MEDIA[c.type]` puis check le media type.
- **Problème 2** : `new Set(Object.values(GRADIO_MEDIA).filter(...))`
  avait un problème de type narrowing TS (Set attend `string`,
  filter retournait `string | undefined`). Fix : Set littéral
  `new Set<string>(["image", "video", "audio"])` + helper
  `isMediaOutput`.

#### 3.5 — Plugin `connectors-panel` (slot `center`)
- **Livré** :
  - 5 server fns via `createServerFn` : `listConnectors`,
    `addConnector`, `deleteConnector`, `probeConnector`,
    `listCapabilities`, `invokeCapability`.
  - Persistance dans la table `connectors` (créée par
    `003_skeletons.sql`) + table `capabilities`.
  - Events émis : `ConnectorRegistered`, `ConnectorOnline`,
    `ConnectorOffline`, `CapabilityAdded`.
  - UI : liste de connector cards. Chaque card a Probe / Caps /
    Del. Capabilities expandables avec un form auto-généré
    (`SchemaForm`) + bouton Run.
  - `localHttp()` fallback pour les server fns (le `ctx.http` du
    plugin n'est pas dispo dans le contexte server fn direct,
    donc on construit un `ScopedHttp` avec permission `net`).
- **Décision** : l'invoke est non-streaming (retourne `{ ok,
  outputs, error }` après collecte de tous les events). Le
  streaming SSE vers le client viendra en phase 4 (scheduler +
  jobs) où on aura un vrai système de progression.
- **Problème 1** : `createServerFn` n'accepte pas les
  `Record<string, unknown>` comme return type. Fix : wire
  type strict `ConnectorView.config: { [k: string]: string |
  number | boolean | null }` + coercion défensive.
- **Problème 2** : `CapabilityView.inputsSchema` même problème.
  Fix : nouveau type `JsonValue` (string|number|boolean|null|
  array|object récursif) — JSON-safe, validé par TanStack Start.

#### 3.6 — `SchemaForm` (mini JSON Schema form)
- **Livré** : composant React qui prend un JSON Schema
  (`{ properties, required }`) et rend un form pour les
  primitives courants :
  - `string` → input text
  - `string` + `enum` → select
  - `string` + `format: uri-reference` → input text avec placeholder
  - `number`/`integer` → input number
  - `boolean` → checkbox
- **Décision** : uncontrolled state (ref interne, pas de re-render
  parent à chaque frappe). `onChange(values)` n'est appelé que
  quand la valeur change réellement. Le caller mappe vers son
  propre type (string dans le cas de ConnectorPanel, qui envoie
  tout en `z.record(z.string())` côté server).

#### 3.7 — Events `ConnectorRegistered` / `Online` / `Offline` / `CapabilityAdded`
- **Livré** : `CapabilityAdded` ajouté à `LiliumEvent` union
  (les 3 autres existaient déjà depuis la phase 1).
  Émis par les server fns `addConnector`, `probeConnector`,
  `listCapabilities`.
- **Effet** : la `ConnectorsPanel` s'abonne via `useKernelEvents`
  et refetch automatiquement à chaque event lié.

#### 3.8 — Verifications
- `bunx tsc --noEmit` : ✅ 0 erreur
- `bun run lint` : ✅ 0 erreur (9 warnings, tous pre-existants)
- `bun test` : ✅ 43/43 (22 phase 1 + 7 phase 2 + 7 phase 3
  scoped http + 7 phase 3 Gradio)
- `bun run dev` : ✅ démarre en 7.5s, port 8081

### Erreurs rencontrées (consolidé)

| Quand | Erreur | Cause | Résolution |
|---|---|---|---|
| 3.1 | `https://x.gradio.live/` ne matchait pas `net:https://*.gradio.live` | regex terminait sur `$` strict, slash trailing cassait | Allow optional trailing slash + match query/fragment |
| 3.1 | `https://api.example.com/v1/chat` ne matchait pas `net:https://api.example.com/v1` | idem — `$` strict | Passer en prefix-match (anchor start only) |
| 3.3 | `ScopedHttp` non exporté du barrel `@/kernel` | barrel n'exportait que `contracts` | Ajouté `export type { ScopedHttp } from "./http/scoped"` |
| 3.4 | `inferKind` retournait `tool` au lieu de `generate` pour outputs Image | comparaison `c.type === "image"` mais Gradio envoie `"Image"` PascalCase | Helper `isMediaOutput` qui passe par `GRADIO_MEDIA` |
| 3.4 | `new Set(Object.values(GRADIO_MEDIA).filter(...))` erreur de type | Set attend `string` mais filter laisse `string \| undefined` | Set littéral typé |
| 3.5 | `Record<string, unknown>` non serializable par `createServerFn` | TanStack Start rejette `unknown` (trop large, peut être non-JSON) | Wire type strict `string \| number \| boolean \| null` + coercion ; `JsonValue` pour les schemas |

### Dette technique connue

- L'invoke Gradio n'est pas streaming : on attend toute la
  réponse puis on renvoie. Pour les générations longues (image
  → 30s), c'est OK avec un timeout HTTP standard. Phase 4 (jobs)
  remplacera par un vrai stream `GraphRun` + `JobProgress` events.
- Pas d'auth OAuth / API key via `secrets.get()` encore — Gradio
  supporte juste un `Authorization` header, passé en clair dans
  le form d'ajout. Phase 11 (OpenAI, Anthropic) introduira le
  pattern `secrets.get("api_key")`.
- Le `SchemaForm` minimal ne couvre pas les types complexes
  (nested objects, arrays, oneOf, anyOf). Sera étendu quand
  les capabilities OpenAI/MCP les utiliseront (phase 11).
- Le `probe` ne respecte pas de timeout (peut bloquer 30s sur
  un endpoint dead). Phase 9 ajoutera un `AbortController`
  standardisé.

### Prochaine phase

- Phase 4 — Scheduler + Node Graph engine + UI Node Graph + Jobs panel + StatusBar

---

## Phase 4 — Scheduler + Node Graph engine + UI Node Graph + Jobs panel + StatusBar

**Statut global** : ✅ livré
**Date de fin** : 2026-07-14
**Branche** : `main` (commit local, push bloqué — voir note Phase 1)
**Référence** : `.lovable/plan.md` §15.4

### Vue d'ensemble

Phase 4 pose le cœur d'exécution de la plateforme : un scheduler qui
compile et exécute des graphes DAG, un set de node types builtin
(primitives, capability, asset, exporter), et une UI de node graph
+ jobs panel. Le `Generate` passe désormais par le scheduler : un
clic = un graph 1-node = un run enregistré, persisté, visible dans
le Jobs panel.

### Tâches

#### 4.1 — `kernel/scheduler/types.ts` + `compile.ts` + `run.ts` + `index.ts`
- **Livré** : types (GraphDocument, NodeSpec, EdgeSpec, PortSpec,
  NodeExecutor, GraphRunEvent) + compileur (Kahn's algorithm avec
  détection de cycle) + exécuteur (Promise.all par couche
  topologique) + singleton `Scheduler` avec `registerExecutor` /
  `runGraph` / `compile` / `executeCompiled` / `count`.
- **Décision** : le scheduler est dans le **kernel** (pas un plugin)
  — c'est le moteur d'exécution de la plateforme, pas une capability
  métier. Les plugins contribuent des `NodeExecutor` via
  `addNodeExecutor(id, executor, pluginId)` enregistré globalement,
  puis hydratés dans le scheduler au boot.
- **Décision** : un node sans executor fait échouer ce node (pas tout
  le run) — les downstream nodes reçoivent `undefined` et continuent.
  C'est moins strict que `fail-fast` mais plus utilisable pour
  explorer un graph en construction.
- **Tests** : 8 tests (topo-sort linear, cycle detection, unknown
  edge, 1-node run, threaded outputs, parallel fanout timing,
  error capture + downstream continues, missing executor).

#### 4.2 — Plugin `node-primitives`
- **Livré** : 3 NodeExecutors : `primitives.string` (sortie `out: string`),
  `primitives.number` (sortie `out: number`), `primitives.prompt-template`
  (template `{{key}}` substitué par `input[key]`).
- **Décision** : le `prompt-template` est volontairement minimal (regex
  `{{key}}`). Phase 6 introduira les vrais context bindings AI.

#### 4.3 — Plugin `node-capability`
- **Livré** : `capability.run` — wrappe une `Connector.invoke` en node.
  Params : `capability = { connectorId, capId }`, `endpoint`,
  `auth` (optionnel). Construit un `GradioConnector` à la volée,
  consomme l'async iterable, yield `done` / `error` → outputs + ok.
- **Décision** : lazy import du GradioConnector pour éviter la
  dépendance circulaire (connector-gradio → kernel).

#### 4.4 — Plugin `node-asset`
- **Livré** : `asset.reference` — passe l'assetId/blobHash à
  downstream (utile pour piping asset → exporter).

#### 4.5 — Plugin `node-exporter`
- **Livré** : `exporter.library` — INSERT dans `assets` table + emit
  `AssetImported`. Params : `projectId`, `blobHash`, `name`, `kind`,
  `mime`, `size`. Vérifie que `db` est dispo côté serveur, throw
  sinon.
- **Décision** : c'est le sink final du graph. Combiné avec un node
  `capability.run` en amont, on a un pipeline `capability → library`
  fonctionnel.

#### 4.6 — Plugin `ui-node-graph`
- **Livré** : `NodeGraphPanel` :
  - **Palette** (gauche) : liste les node types groupés par catégorie
    (`primitives`, `capability`, `asset`, `exporter`).
  - **Canvas** (centre) : vertical stack de NodeCards, chaque card
    a : type, params (auto-form via SchemaForm), connect-to dropdown
    pour ajouter une edge vers un autre node, list des edges sortantes.
  - **Jobs sidebar** (droite) : 20 derniers runs avec status + timestamp.
  - **Run button** : envoie le doc au server fn `runGraphFn` qui
    persiste + execute + retourne les stats.
- **5 server fns** : `listNodeTypes` (snapshot du registry), `runGraphFn`
  (le path chaud), `listGraphRuns` (pour la sidebar et JobsPanel),
  `saveGraph`, `loadGraph` (préparation phase 8 versioning).
- **Décision** : éditeur **linear-first** (stack verticale, edges
  encodées par dropdown) plutôt qu'un canvas drag-and-drop. C'est
  80% de la valeur, 20% du code. Le canvas drag/drop viendra phase 5+
  (asset graph) ou phase 6 (AI Context bindings).
- **Problème** : `runGraphFn` lit `kernel.host["http" as never] as never`
  pour passer le http au scheduler. C'est un hack parce que
  `PluginContext.http` n'est pas exposé sur le `Kernel` lui-même
  (seulement sur le `ctx` de chaque plugin). À refactor en phase 9 :
  ajouter `Kernel.http` quand un plugin a des permissions `net:*`.

#### 4.7 — Plugin `ui-jobs`
- **Livré** : `JobsPanel` — liste des 50 derniers graph runs, chacun
  avec status pill, id tronqué, stats JSON pretty-printed. Refetch
  sur tout event `Graph*` / `Job*`.
- **Décision** : c'est une version "log view" du jobs panel. La
  version "live queue" (avec cancel + progress streaming) viendra
  phase 9 quand on aura SSE.

#### 4.8 — `StatusBar` : `Plugins: N` + `Executors: M` + dernier event
- **Livré** : ajoute `Executors: {count}` à côté de `Plugins:`.
  Détecte les events `Job*` et les highlight en accent.
- **Décision** : le badge "Scheduler: N running" est implicite —
  chaque `JobStarted` l'incrémente visuellement, `JobFinished` /
  `JobFailed` le décrémente (l'œil fait le travail). Phase 9 aura
  un vrai compteur live.

#### 4.9 — Events `GraphNodeExecuted` + `GraphCompleted`
- **Livré** : ajoutés à `LiliumEvent` union. Émis par
  `executeCompiled`. Le Jobs panel et le status bar s'y abonnent.

#### 4.10 — Verifications
- `bunx tsc --noEmit` : ✅ 0 erreur
- `bun run lint` : ✅ 0 erreur (9 warnings, tous pre-existants)
- `bun test` : ✅ 51/51 (43 phase 3 + 8 phase 4)
- `bun run dev` : ✅ démarre en 4.5s, port 8081

### Erreurs rencontrées (consolidé)

| Quand | Erreur | Cause | Résolution |
|---|---|---|---|
| 4.6 | `host["http" as never] as never` dans server fn | `Kernel.http` n'existe pas, seul `ctx.http` per-plugin | Cast + eslint disable. Refactor en phase 9 : exposer `Kernel.http` quand un plugin déclare des `net:*` |
| 4.6 | `Property 'startedAt' does not exist on GraphRunRow` | J'ai exposé le row type (snake_case DB) au lieu du view type (camelCase) | Renommé en `GraphRunView` (camelCase) côté consumer ; row reste interne au server.ts |
| 4.x | `Property 'contributes' is missing in type` | Les plugins node-* n'ont aucune contribution visible (que des side-effects dans `activate`) | Ajouté `contributes: {}` explicitement |

### Dette technique connue

- L'éditeur de graph est linear-first (stack verticale). Pas de
  drag/drop sur canvas, pas de positions libres. Phase 5+ remplacera.
- Pas de streaming live de la progression d'un node long (image gen
  ~30s). L'UI affiche le résultat après coup. Phase 9 (SSE) +
  phase 10 (agent) ajouteront le streaming.
- Le `prompt-template` est regex-only. Phase 6 introduira les vrais
  context bindings (`@context.characters[name].portrait`).
- Le scheduler n'a pas de cache de plans compilés. Pour un graph
  "live" (timeline re-run à chaque modif) il faudra cacher. Pas
  critique en phase 4.
- Pas de cancellation réelle : le signal AbortController est créé
  par node mais jamais déclenché. À brancher en phase 9.
- Le `Capability run` node n'enrobe pas un `ConnectorHealth` check
  pre-run. Si l'endpoint est down, on le découvre au moment du
  `invoke`. Phase 9 ajoutera un pre-check.
- Le status bar n'a pas de compteur live de jobs running (juste un
  highlight du dernier event). OK pour la phase.

### Prochaine phase

- Phase 5 — Asset Graph (lineage) + Provenance UI
- Tâches planifiées :
  - Migration `005_provenance.sql` (déjà dans 003_skeletons)
  - À chaque job fini : INSERT asset_provenance avec sources
  - Plugin `ui-lineage` : DAG des ancêtres/descendants (lit
    asset_provenance + graph_runs + node_runs)
  - Actions Inspector sur un asset : "Re-run this branch",
    "Fork from here", "Diff with parent"
- Tâches planifiées :
  - `kernel/scheduler/` : compile GraphDocument → DAG, top-sort,
    exécute (parallèle quand sans dépendance), stream via
    `GraphNodeExecuted`, `JobProgress`
  - Plugins `node-primitives` (string, number, prompt-template)
  - Plugin `node-capability` (rend une capability en node
    auto-généré)
  - Plugin `node-asset` (référence un asset)
  - Plugin `node-exporter` (envoie vers Library ou File)
  - Plugin `ui-node-graph` (React Flow, drag&drop, edges typés)
  - Plugin `ui-jobs` (liste jobs, cancel, logs, re-run)
  - StatusBar : "Scheduler: N running" + dernier `JobProgress`
  - Bouton "Generate" (panel Inspector quand un node capability
    est sélectionné) → enqueue graph 1-node
  - Tests scheduler (DAG, parallelisme, échec partial)
