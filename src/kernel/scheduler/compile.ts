// Compile a GraphDocument into a topological order, detect cycles, and
// return per-node "depth" so the executor can parallelize independent
// branches. Pure functions — no side effects.

import type { GraphDocument, NodeSpec } from "./types";

export interface CompiledGraph {
  /** Topologically sorted node ids. */
  order: string[];
  /** Upstream node ids per node (i.e. dependencies). */
  deps: Map<string, string[]>;
  /** Reverse map: nodes that depend on this one. */
  dependents: Map<string, string[]>;
  /** Map nodeId → node spec. */
  nodes: Map<string, NodeSpec>;
}

export class GraphCompileError extends Error {
  constructor(
    message: string,
    public readonly path: string[] = [],
  ) {
    super(message);
    this.name = "GraphCompileError";
  }
}

export function compileGraph(graph: GraphDocument): CompiledGraph {
  const nodes = new Map<string, NodeSpec>();
  for (const n of graph.nodes) nodes.set(n.id, n);

  const deps = new Map<string, string[]>();
  const dependents = new Map<string, string[]>();
  for (const n of graph.nodes) {
    deps.set(n.id, []);
    dependents.set(n.id, []);
  }
  for (const e of graph.edges) {
    if (!nodes.has(e.fromNodeId)) {
      throw new GraphCompileError(`edge references unknown fromNodeId: ${e.fromNodeId}`);
    }
    if (!nodes.has(e.toNodeId)) {
      throw new GraphCompileError(`edge references unknown toNodeId: ${e.toNodeId}`);
    }
    deps.get(e.toNodeId)!.push(e.fromNodeId);
    dependents.get(e.fromNodeId)!.push(e.toNodeId);
  }

  // Kahn's algorithm with cycle detection.
  const inDegree = new Map<string, number>();
  for (const n of graph.nodes) inDegree.set(n.id, deps.get(n.id)!.length);
  const queue: string[] = [];
  for (const [id, d] of inDegree) if (d === 0) queue.push(id);
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const child of dependents.get(id) ?? []) {
      const next = (inDegree.get(child) ?? 0) - 1;
      inDegree.set(child, next);
      if (next === 0) queue.push(child);
    }
  }
  if (order.length !== graph.nodes.length) {
    const stuck = graph.nodes.filter((n) => !order.includes(n.id)).map((n) => n.id);
    throw new GraphCompileError(`graph has a cycle`, stuck);
  }
  return { order, deps, dependents, nodes };
}
