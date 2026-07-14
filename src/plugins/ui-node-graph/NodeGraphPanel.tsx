import { useCallback, useEffect, useMemo, useState } from "react";
import { useKernelEvents } from "@/kernel/react";
import { SchemaForm } from "@/plugins/connectors-panel/SchemaForm";
import { listGraphRuns, listNodeTypes, runGraphFn } from "./server";
import type { EdgeSpec, GraphDocument, NodeSpec } from "@/kernel";

interface NodeType {
  id: string;
  category: string;
  displayName: string;
}

interface GraphRunView {
  id: string;
  graphId: string;
  status: string;
  startedAt: number;
  finishedAt: number | null;
  stats: Record<string, unknown>;
}

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

export function NodeGraphPanel() {
  const [types, setTypes] = useState<NodeType[]>([]);
  const [doc, setDoc] = useState<GraphDocument>(emptyDoc());
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<{
    status: string;
    okCount: number;
    errorCount: number;
    totalMs: number;
  } | null>(null);
  const [runs, setRuns] = useState<GraphRunView[]>([]);

  // Refresh job list on any Graph* / Job* event.
  const lastEvent = useKernelEvents(1)[0];
  useEffect(() => {
    listGraphRuns({ data: { limit: 20 } })
      .then((r) => setRuns(r.runs as unknown as GraphRunView[]))
      .catch(() => setRuns([]));
  }, [lastEvent]);

  useEffect(() => {
    listNodeTypes({})
      .then((r) => setTypes(r.types as unknown as NodeType[]))
      .catch(() => setTypes([]));
  }, []);

  const addNode = useCallback(
    (typeId: string) => {
      const id = uid("nd");
      const newNode: NodeSpec = {
        id,
        type: typeId,
        position: { x: 0, y: doc.nodes.length * 100 },
        params: {},
        inputs: [],
        outputs: [],
      };
      setDoc((d) => ({ ...d, nodes: [...d.nodes, newNode] }));
    },
    [doc.nodes.length],
  );

  const removeNode = useCallback((nodeId: string) => {
    setDoc((d) => ({
      ...d,
      nodes: d.nodes.filter((n) => n.id !== nodeId),
      edges: d.edges.filter((e) => e.fromNodeId !== nodeId && e.toNodeId !== nodeId),
    }));
  }, []);

  const addEdge = useCallback((from: string, to: string) => {
    setDoc((d) => {
      // Find the first output port of `from` and the first input port of `to`.
      const fromNode = d.nodes.find((n) => n.id === from);
      const toNode = d.nodes.find((n) => n.id === to);
      if (!fromNode || !toNode) return d;
      const fromPort = fromNode.outputs[0]?.id ?? "out";
      const toPort = toNode.inputs[0]?.id ?? "in";
      // Don't add duplicates.
      if (d.edges.some((e) => e.fromNodeId === from && e.toNodeId === to)) return d;
      const edge: EdgeSpec = { fromNodeId: from, fromPort, toNodeId: to, toPort };
      return { ...d, edges: [...d.edges, edge] };
    });
  }, []);

  const removeEdge = useCallback((idx: number) => {
    setDoc((d) => ({ ...d, edges: d.edges.filter((_, i) => i !== idx) }));
  }, []);

  const updateNodeParams = useCallback((nodeId: string, params: Record<string, unknown>) => {
    setDoc((d) => ({
      ...d,
      nodes: d.nodes.map((n) => (n.id === nodeId ? { ...n, params } : n)),
    }));
  }, []);

  const run = useCallback(async () => {
    if (doc.nodes.length === 0) return;
    setRunning(true);
    setLastResult(null);
    try {
      const r = await runGraphFn({ data: { doc: doc as unknown as Record<string, unknown> } });
      setLastResult({
        status: r.status,
        okCount: r.okCount ?? 0,
        errorCount: r.errorCount ?? 0,
        totalMs: r.totalMs ?? 0,
      });
    } catch (e) {
      setLastResult({ status: "error", okCount: 0, errorCount: 1, totalMs: 0 });
      console.error(e);
    } finally {
      setRunning(false);
    }
  }, [doc]);

  const grouped = useMemo(() => {
    const m: Record<string, NodeType[]> = {};
    for (const t of types) {
      (m[t.category] ??= []).push(t);
    }
    return m;
  }, [types]);

  return (
    <div className="flex h-full overflow-hidden bg-[var(--surface-1)]">
      {/* Palette */}
      <div className="w-56 shrink-0 overflow-auto border-r border-[var(--line)] p-3 text-xs">
        <div className="text-[10px] font-medium uppercase tracking-widest text-[var(--text-dim)]">
          Palette
        </div>
        {Object.entries(grouped).map(([cat, ts]) => (
          <div key={cat} className="mt-3">
            <div className="text-[9px] uppercase tracking-widest text-[var(--text-dim)]">{cat}</div>
            <div className="mt-1 space-y-1">
              {ts.map((t) => (
                <button
                  key={t.id}
                  onClick={() => addNode(t.id)}
                  className="block w-full rounded border border-[var(--line)] bg-[var(--surface-2)] px-2 py-1 text-left text-[11px] hover:border-[var(--accent)]"
                >
                  {t.displayName}
                  <span className="mono ml-1 text-[9px] text-[var(--text-dim)]">{t.id}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Canvas */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--line)] px-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--text-dim)]">
            Node graph · {doc.nodes.length} nodes · {doc.edges.length} edges
          </div>
          <button
            onClick={run}
            disabled={running || doc.nodes.length === 0}
            className="rounded-md bg-[var(--accent)] px-3 py-1 text-[11px] font-medium text-[var(--accent-fg)] hover:bg-[var(--accent-strong)] disabled:opacity-50"
          >
            {running ? "Running…" : "Run"}
          </button>
        </div>
        <div className="flex-1 overflow-auto p-3 text-xs text-[var(--text-muted)]">
          {doc.nodes.length === 0 ? (
            <div className="text-center text-[var(--text-dim)]">
              Add nodes from the palette to start.
            </div>
          ) : (
            <div className="space-y-3">
              {doc.nodes.map((n) => (
                <NodeCard
                  key={n.id}
                  node={n}
                  types={types}
                  otherNodes={doc.nodes.filter((x) => x.id !== n.id)}
                  onUpdateParams={(p) => updateNodeParams(n.id, p)}
                  onRemove={() => removeNode(n.id)}
                  onConnectTo={(target) => addEdge(n.id, target)}
                  onRemoveEdge={(idx) => removeEdge(idx)}
                  edgesFromThis={doc.edges
                    .map((e, i) => ({ edge: e, idx: i }))
                    .filter((x) => x.edge.fromNodeId === n.id)}
                />
              ))}
            </div>
          )}
          {lastResult ? (
            <div className="mono mt-3 rounded border border-[var(--line)] bg-[var(--surface-2)] p-2 text-[10px]">
              {lastResult.status} · ok={lastResult.okCount} err={lastResult.errorCount} ·{" "}
              {lastResult.totalMs}ms
            </div>
          ) : null}
        </div>
      </div>

      {/* Jobs sidebar */}
      <div className="w-64 shrink-0 overflow-auto border-l border-[var(--line)] p-3 text-xs">
        <div className="text-[10px] font-medium uppercase tracking-widest text-[var(--text-dim)]">
          Recent runs
        </div>
        {runs.length === 0 ? (
          <div className="mt-2 text-[var(--text-dim)]">No runs yet.</div>
        ) : (
          <ul className="mt-2 space-y-1">
            {runs.map((r) => (
              <li
                key={r.id}
                className="rounded border border-[var(--line)] bg-[var(--surface-2)] p-2 text-[10px]"
              >
                <div className="flex items-center justify-between">
                  <span className="mono text-[var(--text-dim)]">{r.id.slice(0, 12)}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[9px] uppercase ${
                      r.status === "ok"
                        ? "bg-[var(--status-ok)]/20 text-[var(--status-ok)]"
                        : r.status === "error"
                          ? "bg-[var(--status-err)]/20 text-[var(--status-err)]"
                          : "bg-[var(--status-warn)]/20 text-[var(--status-warn)]"
                    }`}
                  >
                    {r.status}
                  </span>
                </div>
                <div className="mono mt-1 text-[9px] text-[var(--text-dim)]">
                  {new Date(r.startedAt).toLocaleTimeString()}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function NodeCard({
  node,
  types,
  otherNodes,
  onUpdateParams,
  onRemove,
  onConnectTo,
  onRemoveEdge,
  edgesFromThis,
}: {
  node: NodeSpec;
  types: NodeType[];
  otherNodes: NodeSpec[];
  onUpdateParams: (p: Record<string, unknown>) => void;
  onRemove: () => void;
  onConnectTo: (targetId: string) => void;
  onRemoveEdge: (idx: number) => void;
  edgesFromThis: { edge: EdgeSpec; idx: number }[];
}) {
  const type = types.find((t) => t.id === node.type);
  const schemaForParams: Record<string, unknown> = {
    type: "object",
    properties: Object.fromEntries(
      Object.keys(node.params).map((k) => [
        k,
        { type: typeof node.params[k] === "number" ? "number" : "string" },
      ]),
    ),
  };
  return (
    <div className="rounded border border-[var(--line)] bg-[var(--surface-2)] p-3">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[12px] font-medium text-[var(--text)]">
            {type?.displayName ?? node.type}
          </span>
          <span className="mono ml-2 text-[10px] text-[var(--text-dim)]">{node.id}</span>
        </div>
        <button
          onClick={onRemove}
          className="rounded border border-[var(--line)] px-2 py-0.5 text-[10px] uppercase tracking-widest text-[var(--status-err)] hover:border-[var(--status-err)]"
        >
          Del
        </button>
      </div>
      <div className="mt-2">
        <SchemaForm schema={schemaForParams} onChange={onUpdateParams} initial={node.params} />
      </div>
      {otherNodes.length > 0 ? (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">
            Connect →
          </span>
          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) onConnectTo(e.target.value);
              e.target.value = "";
            }}
            className="rounded border border-[var(--line)] bg-[var(--surface-3)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]"
          >
            <option value="">pick a target</option>
            {otherNodes.map((n) => (
              <option key={n.id} value={n.id}>
                {types.find((t) => t.id === n.type)?.displayName ?? n.type} ({n.id})
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {edgesFromThis.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {edgesFromThis.map(({ edge, idx }) => (
            <li
              key={idx}
              className="flex items-center justify-between rounded border border-[var(--line)] bg-[var(--surface-3)] px-2 py-0.5 text-[10px]"
            >
              <span className="mono text-[var(--text-dim)]">
                → {edge.toNodeId}.{edge.toPort}
              </span>
              <button
                onClick={() => onRemoveEdge(idx)}
                className="text-[var(--text-dim)] hover:text-[var(--status-err)]"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function emptyDoc(): GraphDocument {
  return {
    id: uid("gph"),
    name: "Ad-hoc graph",
    nodes: [],
    edges: [],
    inputs: [],
    outputs: [],
  };
}
