import { useCallback, useEffect, useState } from "react";
import { useKernelEvents } from "@/kernel/react";
import { SchemaForm } from "./SchemaForm";
import {
  addConnector,
  deleteConnector,
  invokeCapability,
  listCapabilities,
  listConnectors,
  probeConnector,
  type CapabilityView,
  type ConnectorView,
} from "./server";

export function ConnectorsPanel() {
  const [connectors, setConnectors] = useState<ConnectorView[]>([]);
  const [adding, setAdding] = useState(false);

  // Refetch on any connector-related event.
  const last = useKernelEvents(1)[0];
  useEffect(() => {
    listConnectors({})
      .then((r: { connectors: ConnectorView[] }) => setConnectors(r.connectors))
      .catch(() => setConnectors([]));
  }, [last]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--surface-1)]">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--line)] px-3">
        <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--text-dim)]">
          Connectors
        </div>
        <button
          onClick={() => setAdding((v) => !v)}
          className="rounded-md bg-[var(--accent)] px-2 py-1 text-[11px] font-medium text-[var(--accent-fg)] hover:bg-[var(--accent-strong)]"
        >
          {adding ? "Cancel" : "+ Add"}
        </button>
      </div>
      <div className="flex-1 overflow-auto p-3 text-xs text-[var(--text-muted)]">
        {adding ? <AddForm onDone={() => setAdding(false)} /> : null}
        {connectors.length === 0 && !adding ? (
          <div className="text-center text-[var(--text-dim)]">
            No connectors yet. Add a Gradio endpoint to start.
          </div>
        ) : null}
        <div className="mt-3 space-y-3">
          {connectors.map((c) => (
            <ConnectorCard
              key={c.id}
              connector={c}
              onDeleted={() => setConnectors((prev) => prev.filter((x) => x.id !== c.id))}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function AddForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("My Gradio endpoint");
  const [baseUrl, setBaseUrl] = useState("");
  const [auth, setAuth] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = useCallback(async () => {
    if (!baseUrl) return;
    setBusy(true);
    try {
      const config: Record<string, string> = { baseUrl };
      if (auth) config.authHeader = auth;
      await addConnector({
        data: { kind: "gradio", name: name || "Gradio", config },
      });
      onDone();
    } finally {
      setBusy(false);
    }
  }, [name, baseUrl, auth, onDone]);

  return (
    <div className="rounded-md border border-[var(--line)] bg-[var(--surface-2)] p-3">
      <div className="mb-2 text-[10px] font-medium uppercase tracking-widest text-[var(--text-dim)]">
        Add a Gradio connector
      </div>
      <div className="space-y-1">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Display name"
          className="w-full rounded border border-[var(--line)] bg-[var(--surface-3)] px-2 py-1 text-sm"
        />
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://xxx.gradio.live/ or https://gpu.example.com/"
          className="w-full rounded border border-[var(--line)] bg-[var(--surface-3)] px-2 py-1 text-sm"
        />
        <input
          value={auth}
          onChange={(e) => setAuth(e.target.value)}
          placeholder="Authorization: Bearer … (optional)"
          className="w-full rounded border border-[var(--line)] bg-[var(--surface-3)] px-2 py-1 text-sm"
        />
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button
          onClick={onDone}
          className="rounded-md border border-[var(--line)] bg-transparent px-3 py-1 text-[11px] text-[var(--text-muted)] hover:border-[var(--line-strong)]"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={!baseUrl || busy}
          className="rounded-md bg-[var(--accent)] px-3 py-1 text-[11px] font-medium text-[var(--accent-fg)] disabled:opacity-50"
        >
          {busy ? "Adding…" : "Add"}
        </button>
      </div>
    </div>
  );
}

function ConnectorCard({
  connector,
  onDeleted,
}: {
  connector: ConnectorView;
  onDeleted: () => void;
}) {
  const [caps, setCaps] = useState<CapabilityView[]>([]);
  const [probing, setProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<string | null>(null);

  const probe = useCallback(async () => {
    setProbing(true);
    setProbeResult(null);
    try {
      const h = await probeConnector({ data: { id: connector.id } });
      setProbeResult(h.ok ? `online · ${h.latencyMs ?? 0}ms` : `offline · ${h.message ?? "error"}`);
    } catch (e) {
      setProbeResult(`error · ${(e as Error).message}`);
    } finally {
      setProbing(false);
    }
  }, [connector.id]);

  const loadCaps = useCallback(async () => {
    const r = await listCapabilities({ data: { connectorId: connector.id } });
    setCaps(r.capabilities);
  }, [connector.id]);

  const remove = useCallback(async () => {
    await deleteConnector({ data: { id: connector.id } });
    onDeleted();
  }, [connector.id, onDeleted]);

  return (
    <div className="rounded-md border border-[var(--line)] bg-[var(--surface-2)] p-3">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[13px] font-medium text-[var(--text)]">{connector.name}</div>
          <div className="mono mt-0.5 text-[10px] uppercase tracking-widest text-[var(--text-dim)]">
            {connector.kind} · {connector.status}
          </div>
        </div>
        <div className="flex gap-1">
          <button
            onClick={probe}
            disabled={probing}
            className="rounded border border-[var(--line)] px-2 py-0.5 text-[10px] uppercase tracking-widest text-[var(--text-muted)] hover:border-[var(--line-strong)] disabled:opacity-50"
          >
            {probing ? "Probing…" : "Probe"}
          </button>
          <button
            onClick={loadCaps}
            className="rounded border border-[var(--line)] px-2 py-0.5 text-[10px] uppercase tracking-widest text-[var(--text-muted)] hover:border-[var(--line-strong)]"
          >
            Caps
          </button>
          <button
            onClick={remove}
            className="rounded border border-[var(--line)] px-2 py-0.5 text-[10px] uppercase tracking-widest text-[var(--status-err)] hover:border-[var(--status-err)]"
          >
            Del
          </button>
        </div>
      </div>
      {probeResult ? (
        <div className="mt-2 mono text-[10px] text-[var(--text-dim)]">{probeResult}</div>
      ) : null}
      {caps.length > 0 ? (
        <div className="mt-2 space-y-1">
          {caps.map((c) => (
            <CapabilityRow key={c.id} connectorId={connector.id} cap={c} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CapabilityRow({ connectorId, cap }: { connectorId: string; cap: CapabilityView }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const run = useCallback(async () => {
    setRunning(true);
    setResult(null);
    try {
      const r = await invokeCapability({
        data: { connectorId, capId: cap.id, input: values },
      });
      if (r.ok) {
        const out = (r.outputs ?? [])
          .slice(0, 3)
          .map((s) => s.slice(0, 100))
          .join(" · ");
        setResult(`ok · ${out || "(no outputs)"}`);
      } else {
        setResult(`error · ${r.error ?? "unknown"}`);
      }
    } catch (e) {
      setResult(`error · ${(e as Error).message}`);
    } finally {
      setRunning(false);
    }
  }, [connectorId, cap.id, values]);

  return (
    <div className="rounded border border-[var(--line)] bg-[var(--surface-3)] p-2">
      <div className="flex items-center justify-between">
        <div>
          <div className="mono text-[11px] text-[var(--text)]">{cap.displayName || cap.id}</div>
          <div className="text-[9px] uppercase tracking-widest text-[var(--text-dim)]">
            {cap.kind} · {cap.media.join(", ") || "—"}
          </div>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded border border-[var(--line)] px-2 py-0.5 text-[10px] text-[var(--text-muted)] hover:border-[var(--line-strong)]"
        >
          {open ? "Close" : "Invoke"}
        </button>
      </div>
      {open ? (
        <div className="mt-2 space-y-2">
          <SchemaForm
            schema={cap.inputsSchema}
            onChange={(v) =>
              setValues(
                Object.fromEntries(
                  Object.entries(v).map(([k, val]) => [k, val == null ? "" : String(val)]),
                ),
              )
            }
          />
          <div className="flex justify-end">
            <button
              onClick={run}
              disabled={running}
              className="rounded bg-[var(--accent)] px-3 py-1 text-[11px] font-medium text-[var(--accent-fg)] disabled:opacity-50"
            >
              {running ? "Running…" : "Run"}
            </button>
          </div>
          {result ? (
            <div className="mono break-all rounded border border-[var(--line)] bg-[var(--surface-1)] p-2 text-[10px] text-[var(--text-muted)]">
              {result}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
