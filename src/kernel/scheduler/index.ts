// Scheduler singleton. Owns the registry of NodeExecutors (populated by
// plugins via `kernel.registry.addNode(...)` and the host scanning for
// executor implementations). Exposes a single `runGraph` entry point.

import type { EventBus } from "../event-bus";
import type { NodeExecutor } from "./types";
import { runGraph as runGraphImpl, executeCompiled, type RunResult, type RunOptions } from "./run";
import { compileGraph } from "./compile";
import type { GraphDocument } from "./types";
import type { Registry } from "../registry";

export interface Scheduler {
  registerExecutor(exec: NodeExecutor & { pluginId: string }): void;
  executors(): ReadonlyMap<string, NodeExecutor>;
  runGraph(graph: GraphDocument, opts: Omit<RunOptions, "executors">): Promise<RunResult>;
  compile(graph: GraphDocument): ReturnType<typeof compileGraph>;
  executeCompiled: typeof executeCompiled;
  count(): number;
}

export function createScheduler(deps: { events: EventBus; registry?: Registry }): Scheduler {
  const execs = new Map<string, NodeExecutor>();
  // Pull in executors that plugins have already registered. Plugins push
  // their NodeExecutor onto `kernel.executors` via the
  // `addNodeExecutor` helper (see below). We snapshot at construction
  // time and re-pull on demand.
  return {
    registerExecutor(exec) {
      execs.set(exec.id, exec);
    },
    executors() {
      return execs;
    },
    count() {
      return execs.size;
    },
    compile(graph) {
      return compileGraph(graph);
    },
    async runGraph(graph, opts) {
      return runGraphImpl(graph, { ...opts, executors: execs });
    },
    executeCompiled,
  };
}

/** Tiny module-level side-channel for plugins to register their
 *  NodeExecutor without going through the registry (which is UI-shaped,
 *  not executor-shaped). The scheduler scans this map on first run. */
const _globalExecutors = new Map<string, NodeExecutor & { pluginId: string }>();
export function addNodeExecutor(exec: NodeExecutor & { pluginId: string }): void {
  _globalExecutors.set(exec.id, exec);
}
export function listNodeExecutors(): ReadonlyMap<string, NodeExecutor & { pluginId: string }> {
  return _globalExecutors;
}
