# Lilium Studio Web — Architecture Plateforme

Révision majeure : Lilium n'est plus une application, c'est une **plateforme extensible**. Le cœur ne connaît ni modèles, ni providers, ni formats. Il ne connaît que des **contrats** (plugins, events, nodes, assets). Tout le reste est branché à chaud.

## 0. Principes fondateurs

1. **Plugin-first** — Tout ce qui touche au domaine créatif (connecteurs, nodes, widgets, processors, exporters, effects, pipelines) est un plugin.
2. **Event-driven** — Le core émet, les plugins écoutent. Aucun couplage direct.
3. **Graph-first** — Timeline et Node Graph sont deux vues du même modèle exécutable.
4. **Everything typed, everything discoverable** — Chaque plugin déclare son manifest (id, version, contributions, schemas). Introspection > convention.
5. **API-first** — L'UI n'est qu'un client de l'API. Tout est scriptable.
6. **Local-first** — SQLite + FS pour développer sans cloud. Adapters pour Postgres/S3/Redis en prod.

---

## 1. Le noyau (Kernel)

Le kernel est minuscule et stable. Il n'évolue quasi jamais. Il fournit :

```text
kernel/
  plugin-host/       # chargement, sandbox, lifecycle des plugins
  event-bus/         # pub/sub typé, replayable, persisté
  registry/          # catalog runtime (connectors, nodes, widgets, ...)
  contracts/         # interfaces TS partagées (SDK plugin)
  scheduler/         # exécute graphs (jobs, workflows, pipelines)
  asset-graph/       # DAG de lineage des assets
  context/           # AI Context projet (characters, styles, ...)
  storage/           # adapter blob (fs/s3)
  db/                # adapter relationnel (sqlite/postgres)
  transport/         # WS/SSE, HTTP, plus tard: gRPC
  auth/              # (plus tard) multi-user, workspaces
```

Le kernel ne connaît **aucun** modèle IA, aucun format média, aucun provider. Il ne sait qu'orchestrer des plugins qui exposent des capabilities.

---

## 2. Modèle d'extension : capability points

Un plugin est un module qui déclare un `manifest` et contribue à un ou plusieurs **extension points**.

```ts
// contracts/plugin.ts
export interface PluginManifest {
  id: string;                    // "com.lilium.connector.gradio"
  name: string;
  version: string;
  engines: { lilium: string };   // semver du kernel requis
  permissions: Permission[];     // "net", "fs:read", "events:*", ...
  contributes: {
    connectors?: ConnectorContribution[];
    nodes?: NodeContribution[];
    widgets?: WidgetContribution[];
    assetProcessors?: ProcessorContribution[];
    exporters?: ExporterContribution[];
    timelineEffects?: EffectContribution[];
    renderPipelines?: PipelineContribution[];
    viewers?: ViewerContribution[];
    commands?: CommandContribution[];
    panels?: PanelContribution[];
  };
  activate?: (ctx: PluginContext) => Promise<void> | void;
  deactivate?: () => Promise<void> | void;
}
```

`PluginContext` expose : `events`, `registry`, `storage`, `db (scoped)`, `logger`, `secrets`, `http`, `ui` (contributions dynamiques), `context` (AI Context read/write).

Un plugin builtin et un plugin tiers passent par la **même API**. Le core lui-même est livré comme un ensemble de plugins builtin (dogfooding).

---

## 3. Connecteurs (remplace "Providers/Models")

Un **Connector** est l'abstraction unifiée. Gradio n'est qu'un type parmi d'autres.

```ts
export interface ConnectorContribution {
  kind: string;                  // "gradio" | "comfyui" | "openai" | "mcp" | "ollama" | "ffmpeg" | "blender" | ...
  displayName: string;
  configSchema: JSONSchema;      // ce que l'user saisit pour créer une instance
  factory: (config: unknown, ctx: PluginContext) => Connector;
}

export interface Connector {
  probe(): Promise<ConnectorHealth>;
  listCapabilities(): Promise<Capability[]>; // = ce que le connector expose (modèles, outils, transforms)
  invoke(capId: string, input: unknown, ctrl: InvocationController): AsyncIterable<InvocationEvent>;
  dispose?(): Promise<void>;
}

export interface Capability {
  id: string;                    // stable dans le connector
  kind: "generate" | "transform" | "analyze" | "tool" | "stream";
  media: Array<"image"|"video"|"audio"|"text"|"3d"|"html"|"doc">;
  inputs: JSONSchema;            // introspecté
  outputs: JSONSchema;
  tags?: string[];
  cost?: CostHint;
}
```

Chaque **Capability** devient automatiquement :
- un **Node** utilisable dans le Node Graph,
- un panneau "Generate" avec form auto-généré,
- une entrée dans l'API publique (`POST /invoke/{connector}/{capability}`).

Connecteurs livrés en builtin (chacun un plugin séparé, désactivable) :
`gradio`, `comfyui`, `automatic1111`, `invokeai`, `openai`, `gemini`, `anthropic`, `ollama`, `elevenlabs`, `mcp`, `n8n`, `ffmpeg`, `blender` (via bridge local), `http-generic`.

---

## 4. Event Bus

Bus typé, structuré, persisté (event log SQLite), rejouable. Toute mutation d'état passe par un event.

```ts
type LiliumEvent =
  | AssetCreated | AssetUpdated | AssetDeleted | AssetImported
  | JobQueued | JobStarted | JobProgress | JobFinished | JobFailed | JobCancelled
  | TimelineUpdated | ClipMoved | ClipSplit
  | SceneCreated | ShotUpdated
  | ProviderRegistered | ConnectorOnline | ConnectorOffline | CapabilityAdded
  | ContextUpdated | CharacterUpdated
  | GraphNodeExecuted | GraphCompleted
  | VersionSnapshotCreated | VersionRestored
  | WorkspaceChanged | ProjectOpened
  | PluginActivated | PluginError
  ;

events.on("JobFinished", async (e) => { ... });      // plugins
events.emit({ type: "AssetCreated", ...payload });   // core & plugins
```

Propriétés : ordering par projet, at-least-once, ack optionnel, filtrage par pattern (`Job.*`, `*.error`). Le WS/SSE côté client n'est **qu'un miroir filtré** du bus serveur. Les panels UI s'abonnent aux events, pas aux endpoints.

---

## 5. Node Graph & Workflow

Le Node Graph n'est pas un module optionnel : c'est **la représentation exécutable** de toute génération. Un clic "Generate Image" crée en interne un graph 1-node.

```text
GraphDocument
  nodes[]      : { id, type, capabilityRef?, params, ports }
  edges[]      : { fromNodeId, fromPort, toNodeId, toPort }
  inputs[]     : ports d'entrée du graph (paramètres)
  outputs[]    : ports de sortie (deviennent assets)
```

Types de nodes contribués par plugins :
- **CapabilityNode** — wrappe une capability de connector (Flux, LTX, TTS, upscaler...).
- **AssetNode** — référence un asset existant du projet.
- **PrimitiveNode** — string, number, seed, prompt-template.
- **ControlNode** — if/switch/for-each/collect.
- **ContextNode** — pull depuis l'AI Context (character.portrait, style.default...).
- **ExporterNode** — envoie vers Timeline / Library / File.

Le **Scheduler** compile le graph en DAG, résout les dépendances, exécute en parallèle quand possible, stream la progression via events (`GraphNodeExecuted`, `JobProgress`). Un graph peut être sauvé comme **template réutilisable** (= un nouveau "node composé", contribué comme s'il venait d'un plugin).

La **Timeline** consomme les outputs d'un graph. Un clip peut être "live" (recalculé quand le graph change) ou "baked" (asset figé). Timeline et Node Graph partagent le même moteur d'exécution.

---

## 6. Asset Graph (lineage)

Chaque asset porte son historique de dérivation.

```text
Asset {
  id, kind, uri, ...
  provenance: {
    graphRunId?     // exécution qui l'a produit
    sourceAssetIds  // parents directs
    capabilityRef?  // "gradio:flux-dev:txt2img"
    params          // snapshot des params
    seed?
  }
}
```

Vue "Lineage" dans l'Inspector : DAG cliquable des ancêtres/descendants d'un asset. Actions : "Re-run this branch", "Fork from here", "Diff with parent". Base parfaite pour le **versioning créatif** (§9).

---

## 7. AI Context (contexte projet global)

Store structuré par projet, lu/écrit par plugins et agent :

```text
ProjectContext {
  characters[]         # nom, description, portraits, voix, style
  locations[]
  styles[]             # style refs, LoRAs, moodboards
  voices[]
  palettes[]
  promptTemplates[]    # {id, template, vars}
  negativePrompts[]
  defaults             # {model preferences, resolutions, fps, ...}
  glossary[]           # termes projet
  history              # derniers prompts efficaces
}
```

Chaque node/capability peut déclarer des **context bindings** (`prompt.character = @context.character.selected`). L'user n'écrit jamais deux fois "cyberpunk detective in neon Tokyo" : il tag le character, le context s'injecte. Résolution côté serveur, traçable dans provenance.

---

## 8. Agent IA (façon Cursor)

L'agent est un plugin builtin qui a accès à une **API haut niveau** (mêmes endpoints que l'API publique) via un jeu de tools :

`createScene`, `createShot`, `addClip`, `enqueueGraph`, `pickCharacter`, `searchAssets`, `updateContext`, `openViewer`, `explainNode`, `suggestPrompt`.

Instructions : "Ajoute une scène d'ouverture avec le personnage principal la nuit sous la pluie" → l'agent lit le context, choisit un graph template (Flux → LTX → ACE-Step), crée Scene+Shot, enqueue, place le résultat dans la timeline.

L'agent utilise l'AI SDK + Lovable AI Gateway. Toutes ses actions passent par le même bus d'events → auditables, annulables, versionnables.

---

## 9. Versioning créatif

Chaque entité versionnable (Scene, Shot, Timeline, Graph, Character, Project) a un flux d'événements. Snapshots automatiques sur milestones (avant "Generate", avant "Delete", toutes les N modifs, avant action agent). UI type Figma : timeline de versions, preview, restore, branch (fork non destructif). Basé sur event sourcing du bus — pas de Git.

---

## 10. Multi-Workspace

```text
Workspace
  ├── Projects[]
  ├── SharedLibrary       # assets/characters/styles partagés
  ├── ConnectorPool       # connectors dispo pour tous les projets
  ├── PluginSet           # plugins installés au niveau workspace
  └── Members (plus tard)
```

L'app démarre sur un **Workspace Switcher** (comme Cursor). Drag & drop d'assets entre projets → duplication contrôlée (avec provenance préservée). Un connector peut être scopé workspace ou projet.

---

## 11. API publique

REST + WebSocket, versionnée (`/api/v1`), auth par API key (dev = clé locale).

```text
POST /projects                     GET /projects/:id
POST /projects/:id/assets          GET /assets/:id  (+ /stream, /thumb)
POST /projects/:id/graphs          POST /graphs/:id/run
POST /projects/:id/jobs            POST /jobs/:id/cancel
GET  /projects/:id/timeline        PATCH /timelines/:id
GET  /connectors                   POST /connectors
GET  /connectors/:id/capabilities
POST /invoke/:connector/:capability      # raccourci (crée un graph 1-node)
GET  /events?filter=Job.*          # SSE stream du bus
POST /agent/messages
GET  /plugins                      POST /plugins/install
```

L'UI web utilise **exclusivement** cette API. Aucun endpoint privé. Un CLI (`lilium`) et un SDK JS/Python sont livrés en même temps que l'API.

---

## 12. Arborescence

```text
src/
  kernel/               # (§1)
    plugin-host/  event-bus/  registry/  scheduler/
    asset-graph/  context/  storage/  db/  transport/  contracts/
  plugins/              # tous builtins ici, chacun autonome
    connector-gradio/
    connector-comfyui/
    connector-openai/
    connector-mcp/
    connector-ollama/
    connector-elevenlabs/
    connector-ffmpeg/
    connector-http/
    node-primitives/
    node-control/
    node-context/
    node-exporters/
    processor-thumbnail/
    processor-transcode/
    exporter-mp4/
    exporter-gif/
    timeline-effects-basic/
    render-pipeline-video/
    viewer-image/ viewer-video/ viewer-audio/ viewer-html/ viewer-pdf/ viewer-md/
    agent-copilot/
    ui-library-panel/
    ui-storyboard/
    ui-timeline/
    ui-node-graph/
    ui-inspector/
    ui-jobs/
    ui-characters/
    ui-versions/
  workspace/            # shell d'app (host UI), lit contributions
    shell/  panels/  command-palette/  hotkeys/  theme/
  routes/               # TanStack — minimal
    __root.tsx
    index.tsx           # Workspace Switcher
    w.$wsId.tsx         # Workspace
    w.$wsId.p.$pid.tsx  # Projet (WorkspaceShell)
    settings.tsx
    api/v1/...          # API publique
  services/             # client: appelle API, s'abonne events
  db/migrations/*.sql
  styles.css
```

Un plugin est un dossier avec `manifest.ts` + `activate.ts` + son code. Chargement en dev = import statique via `plugins/index.ts` généré. En prod = registry + dynamic import (préparé, pas requis en phase 1).

---

## 13. Modèle de données (mis à jour)

Additions par rapport au plan précédent :

```text
Workspace(id, name, settings_json)
Project(..., workspace_id)

Connector(id, workspace_id?, project_id?, plugin_id, kind, name, config_json, status)
Capability(id, connector_id, cap_ref, kind, media[], schema_in, schema_out, tags, detected_at)

Graph(id, project_id, name, doc_json, is_template)
GraphRun(id, graph_id, status, started_at, finished_at, stats_json)
NodeRun(id, graph_run_id, node_id, status, input_json, output_json, logs, capability_id?)

Job(id, project_id, graph_run_id?, node_run_id?, ...)   # jobs = leaves d'exécution

AssetProvenance(asset_id, graph_run_id?, node_run_id?, source_asset_ids[], params_json, capability_id?)

ContextEntry(id, project_id, kind, key, value_json, embedding?)   # characters, styles, ...

EventLog(id, project_id?, ts, type, payload_json, actor)          # event sourcing
Snapshot(id, project_id, entity_type, entity_id, version, blob_json, created_at, reason)

Plugin(id, version, enabled, scope, source, installed_at)
```

---

## 14. Sécurité plugins

- Manifest déclare permissions (`net:https://*.gradio.live`, `fs:project`, `events:emit:Custom.*`).
- Host valide à l'activation.
- HTTP client injecté (pas de `fetch` global) → applique les allowlists.
- DB scopée au projet courant automatiquement.
- Secrets accédés via `ctx.secrets.get(name)` (jamais en dur).
- Plugins tiers exécutés dans worker isolé quand possible.

---

## 15. Roadmap réordonnée

Chaque phase est utilisable, mais l'ordre change pour poser les fondations plateforme d'abord.

1. **Kernel + Event Bus + Plugin Host + Design System + Workspace Shell + Workspace Switcher** — squelette de la plateforme, un plugin builtin "hello" pour valider les contrats.
2. **Storage + DB + Asset model + Library plugin + Viewers** — on peut importer, voir, organiser.
3. **Connector abstraction + Gradio connector + Capability introspection + SchemaForm** — premier vrai plugin utile.
4. **Scheduler + Node Graph engine + UI Node Graph + Jobs panel + StatusBar** — exécution unifiée, même un "generate" simple passe par le graph.
5. **Asset Graph (lineage) + Provenance UI** — chaque output devient traçable.
6. **AI Context + Characters + Context bindings dans les nodes** — plus jamais un prompt réécrit.
7. **Storyboard + Timeline + Render pipeline** — narration et export.
8. **Versioning créatif (snapshots + restore + branches)**.
9. **API publique v1 + SDK + CLI**.
10. **Agent Copilot (plugin) + command palette pilotable par agent**.
11. **Connecteurs additionnels : ComfyUI, OpenAI, Ollama, MCP, ElevenLabs, FFmpeg**.
12. **Marketplace plugins + sandbox durci + multi-user workspaces**.

---

Je démarre par la **phase 1** : je pose le kernel (contracts, event-bus, plugin-host, registry), le workspace shell (TopBar/Sidebar/Viewer/Inspector/Library/Timeline/StatusBar resizables + persistés), le design system studio (dark, dense, tokens oklch), le workspace switcher, la DB SQLite locale + migrations, et un plugin builtin "hello" qui contribue un panel + un event listener pour prouver que la boucle plugin fonctionne de bout en bout. Une fois validé visuellement, j'enchaîne la phase 2 (assets/library/viewers) sans refactor.
