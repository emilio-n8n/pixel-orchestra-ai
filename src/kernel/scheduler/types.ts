// Graph document & scheduler — .lovable/plan.md §5.
//
// A GraphDocument is a DAG: nodes[] with typed ports, edges[] wiring
// outputs to inputs. The scheduler top-sorts, runs independent nodes in
// parallel, and streams events (GraphNodeExecuted, JobProgress) for
// downstream UI / persistence.

export interface PortSpec {
  id: string;
  label?: string;
  /** TypeScript-like type hint for the port. Kept loose for phase 4. */
  type: "string" | "number" | "boolean" | "any" | "asset" | "image" | "video" | "audio";
}

export interface NodeSpec {
  id: string;
  /** Plugin contribution id, e.g. "primitives.string" or "capability.flux". */
  type: string;
  /** Position on the canvas (free-form; UI uses it). */
  position?: { x: number; y: number };
  /** Static params for the node (e.g. prompt template). */
  params: Record<string, unknown>;
  /** Input ports declared by this node instance (often == type defaults). */
  inputs: PortSpec[];
  /** Output ports. */
  outputs: PortSpec[];
}

export interface EdgeSpec {
  fromNodeId: string;
  fromPort: string;
  toNodeId: string;
  toPort: string;
}

export interface GraphDocument {
  id: string;
  projectId?: string;
  name: string;
  nodes: NodeSpec[];
  edges: EdgeSpec[];
  inputs: PortSpec[];
  outputs: PortSpec[];
}

export interface NodeRunResult {
  nodeId: string;
  status: "ok" | "error";
  outputs: Record<string, unknown>;
  error?: string;
  startedAt: number;
  finishedAt: number;
}

export interface GraphRunContext {
  graph: GraphDocument;
  /** Per-node cancellation signals. */
  signals: Map<string, AbortController>;
  /** Resolved params for each node (after binding upstream values). */
  resolveInputs(nodeId: string): Record<string, unknown>;
  /** Per-plugin HTTP, DB, storage (sourced from PluginContext). */
  env: GraphRunEnv;
  /** Emit events through the kernel. */
  emit(event: GraphRunEvent): void;
}

export interface GraphRunEnv {
  db?: import("../db/types").DBAdapter;
  storage?: import("../storage/types").BlobStore;
  http?: import("../http/scoped").ScopedHttp;
}

export type GraphRunEvent =
  | { type: "GraphNodeExecuted"; graphRunId: string; nodeId: string; status: "ok" | "error" }
  | {
      type: "GraphCompleted";
      graphRunId: string;
      status: "ok" | "error";
      stats: { okCount: number; errorCount: number; totalMs: number };
    };

/** What each node type must implement. */
export interface NodeExecutor {
  /** Stable id matching NodeContribution.id. */
  id: string;
  /** Human category, e.g. "primitives", "capability", "asset", "exporter". */
  category: string;
  displayName: string;
  /** Default ports for new instances. */
  defaultInputs: PortSpec[];
  defaultOutputs: PortSpec[];
  /** Run the node. Throws to mark the run as error. */
  execute(
    input: Record<string, unknown>,
    ctx: { env: GraphRunEnv; signal: AbortSignal },
  ): Promise<Record<string, unknown>>;
}

export interface NodeContributionRegistered extends NodeExecutor {
  pluginId: string;
}
