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
- Tâches planifiées :
  - `PluginContext.http` (fetch scopé par permissions) +
    `PluginContext.secrets`
  - Plugin `connector-gradio` : `probe()` via `/config`,
    `listCapabilities()`, `invoke()` via `/predict` (SSE)
  - Plugin `connectors-panel` (slot `center`) : liste des
    connectors + bouton "Add Gradio"
  - Form dynamique piloté par JSON Schema
  - Events `ConnectorRegistered`, `ConnectorOnline/Offline`,
    `CapabilityAdded`
  - Tests connector-gradio (mock fetch)
