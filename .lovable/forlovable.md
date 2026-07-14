# Lilium Studio — Journal pour Lovable

> Mis à jour à la fin de chaque phase du plan `.lovable/plan.md`.
> Format : une section par phase, sous-sections par tâche, traces
> d'erreurs et résolutions inline. Pour que l'équipe Lovable
> comprenne ce qui a été livré, pourquoi, et ce qui reste.

---

## Phase 1 — Kernel + Event Bus + Plugin Host + Design System + Workspace Shell + Workspace Switcher + DB SQLite

**Statut global** : ✅ livré
**Date de fin** : 2026-07-14
**Branche** : `main` (poussée)
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
- Tâches planifiées :
  - `BlobStore` interface + `FsBlobStore` (content-addressed)
  - Migration `004_assets.sql`
  - Plugin builtin `library-panel` (slot `center`, drop zone, grille)
  - Plugins viewers (image, video, audio, html)
  - Sélection d'asset → ouverture dans le bon viewer
  - Inspector contextual sur un asset sélectionné
  - Tests storage + library
