// Run a compiled graph. Executes independent nodes in parallel via
// Promise.all at each topological layer. Emits GraphNodeExecuted for
// each node completion and GraphCompleted at the end.

import type { EventBus } from "../event-bus";
import type { NodeExecutor } from "./types";
import { compileGraph } from "./compile";
import type { CompiledGraph } from "./compile";
import type {
  GraphDocument,
  GraphRunEnv,
  GraphRunEvent,
  NodeExecutor as _NodeExecutor,
} from "./types";

function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export interface RunOptions {
  env: GraphRunEnv;
  events: EventBus;
  /** Map of nodeType → executor. */
  executors: Map<string, NodeExecutor>;
  /** Optional id for the run (default: generated). */
  graphRunId?: string;
}

export interface RunResult {
  graphRunId: string;
  status: "ok" | "error";
  okCount: number;
  errorCount: number;
  totalMs: number;
  /** nodeId → output record. */
  outputs: Map<string, Record<string, unknown>>;
  /** nodeId → error message if failed. */
  errors: Map<string, string>;
}

export async function runGraph(graph: GraphDocument, opts: RunOptions): Promise<RunResult> {
  const compiled = compileGraph(graph);
  return executeCompiled(compiled, graph, opts);
}

export async function executeCompiled(
  compiled: CompiledGraph,
  graph: GraphDocument,
  opts: RunOptions,
): Promise<RunResult> {
  const graphRunId = opts.graphRunId ?? newId("gr");
  const startedAt = Date.now();

  // Per-node resolved inputs cache (filled as upstream nodes finish).
  const inputs = new Map<string, Record<string, unknown>>();
  const outputs = new Map<string, Record<string, unknown>>();
  const errors = new Map<string, string>();
  const statuses = new Map<string, "pending" | "running" | "ok" | "error">();
  for (const n of graph.nodes) statuses.set(n.id, "pending");

  const signals = new Map<string, AbortController>();
  for (const n of graph.nodes) signals.set(n.id, new AbortController());

  // Resolve inputs for a node from edges + upstream outputs.
  const resolveInputs = (nodeId: string): Record<string, unknown> => {
    const node = compiled.nodes.get(nodeId)!;
    const result: Record<string, unknown> = { ...(node.params ?? {}) };
    for (const e of graph.edges) {
      if (e.toNodeId !== nodeId) continue;
      const fromOut = outputs.get(e.fromNodeId) ?? {};
      result[e.toPort] = fromOut[e.fromPort];
    }
    return result;
  };

  // Group nodes by topological layer so we can Promise.all each layer.
  const layers: string[][] = [];
  const depth = new Map<string, number>();
  for (const id of compiled.order) {
    const parents = compiled.deps.get(id) ?? [];
    const d = parents.length === 0 ? 0 : Math.max(...parents.map((p) => depth.get(p) ?? 0)) + 1;
    depth.set(id, d);
    if (!layers[d]) layers[d] = [];
    layers[d].push(id);
  }

  let okCount = 0;
  let errorCount = 0;

  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    await Promise.all(
      layer.map(async (nodeId) => {
        const node = compiled.nodes.get(nodeId)!;
        const executor = opts.executors.get(node.type);
        if (!executor) {
          const msg = `no executor for node type: ${node.type}`;
          errors.set(nodeId, msg);
          errorCount++;
          statuses.set(nodeId, "error");
          opts.events.emit({
            type: "GraphNodeExecuted",
            graphRunId,
            nodeId,
            status: "error",
          });
          return;
        }
        statuses.set(nodeId, "running");
        const t0 = Date.now();
        try {
          const input = resolveInputs(nodeId);
          inputs.set(nodeId, input);
          const signal = signals.get(nodeId)!.signal;
          const out = await executor.execute(input, { env: opts.env, signal });
          outputs.set(nodeId, out);
          okCount++;
          statuses.set(nodeId, "ok");
          const ev: GraphRunEvent = {
            type: "GraphNodeExecuted",
            graphRunId,
            nodeId,
            status: "ok",
          };
          opts.events.emit(ev);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.set(nodeId, msg);
          errorCount++;
          statuses.set(nodeId, "error");
          opts.events.emit({
            type: "GraphNodeExecuted",
            graphRunId,
            nodeId,
            status: "error",
          });
        }
      }),
    );
    // If any node in this layer errored, optionally short-circuit — for
    // phase 4 we keep going (downstream nodes get undefined inputs).
  }

  const totalMs = Date.now() - startedAt;
  const status: "ok" | "error" = errorCount > 0 ? "error" : "ok";
  opts.events.emit({
    type: "GraphCompleted",
    graphRunId,
    status,
    stats: { okCount, errorCount, totalMs },
  });

  return { graphRunId, status, okCount, errorCount, totalMs, outputs, errors };
}
