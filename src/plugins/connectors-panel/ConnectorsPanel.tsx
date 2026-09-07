import { useCallback, useEffect, useState } from "react";
import { useKernelEvents } from "@/kernel/react";
import { SchemaForm } from "./SchemaForm";
import { UI_LABELS } from "@/lib/ui/labels";
import { ErrorBlock } from "@/components/ui/error-block";
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
  const [reloadToken, setReloadToken] = useState(0);

  // Refetch on any connector-related event or explicit reload.
  const last = useKernelEvents(1)[0];
  useEffect(() => {
    listConnectors({})
      .then((r: { connectors: ConnectorView[] }) => setConnectors(r.connectors))
      .catch(() => setConnectors([]));
  }, [last, reloadToken]);

  const reload = useCallback(() => setReloadToken((t) => t + 1), []);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--surface-1)]">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--line)] px-3">
        <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--text-dim)]">
          {UI_LABELS.connectors.titre}
        </div>
        <button
          onClick={() => setAdding((v) => !v)}
          title={adding ? UI_LABELS.connectors.annuler : UI_LABELS.connectors.ajouter}
          className="rounded-md bg-[var(--accent)] px-2 py-1 text-[11px] font-medium text-[var(--accent-fg)] transition-colors hover:bg-[var(--accent-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          {adding ? UI_LABELS.connectors.annuler : UI_LABELS.connectors.ajouter}
        </button>
      </div>
      <div className="flex-1 overflow-auto p-3 text-xs text-[var(--text-muted)]">
        {adding ? <AddForm onDone={() => { setAdding(false); reload(); }} /> : null}
        {connectors.length === 0 && !adding ? (
          <div className="mx-auto max-w-[42ch] py-10 text-center text-[12px] leading-relaxed text-[var(--text-dim)]">
            {UI_LABELS.connectors.vide}
          </div>
        ) : null}
        <div className="mt-3 space-y-3">
          {connectors.map((c) => (
            <ConnectorCard
              key={c.id}
              connector={c}
              onDeleted={reload}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function AddForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState(UI_LABELS.connectors.nomDefaut);
  const [baseUrl, setBaseUrl] = useState("");
  const [auth, setAuth] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = useCallback(async () => {
    if (!baseUrl) return;
    setBusy(true);
    setError(null);
    try {
      const config: Record<string, string> = { baseUrl };
      if (auth) config.authHeader = auth;
      await addConnector({
        data: { kind: "gradio", name: name || "Gradio", config },
      });
      onDone();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }, [name, baseUrl, auth, onDone]);

  return (
    <div className="rounded-md border border-[var(--line)] bg-[var(--surface-2)] p-3">
      <div className="mb-2 text-[10px] font-medium uppercase tracking-widest text-[var(--text-dim)]">
        {UI_LABELS.connectors.formulaireTitre}
      </div>
      <div className="space-y-1">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={UI_LABELS.connectors.nomAffiche}
          aria-label={UI_LABELS.connectors.nomAffiche}
          className="w-full rounded border border-[var(--line)] bg-[var(--surface-3)] px-2 py-1 text-sm outline-none focus:border-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]"
        />
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder={UI_LABELS.connectors.urlPlaceholder}
          aria-label={UI_LABELS.connectors.urlPlaceholder}
          inputMode="url"
          className="w-full rounded border border-[var(--line)] bg-[var(--surface-3)] px-2 py-1 text-sm outline-none focus:border-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]"
        />
        <input
          value={auth}
          onChange={(e) => setAuth(e.target.value)}
          placeholder={UI_LABELS.connectors.authPlaceholder}
          aria-label={UI_LABELS.connectors.authPlaceholder}
          className="w-full rounded border border-[var(--line)] bg-[var(--surface-3)] px-2 py-1 text-sm outline-none focus:border-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]"
        />
      </div>
      {error ? (
        <div className="mt-2">
          <ErrorBlock message={String((error as Error)?.message ?? error)} error={error} context="connectors.add" compact />
        </div>
      ) : null}
      <div className="mt-3 flex justify-end gap-2">
        <button
          onClick={onDone}
          className="rounded-md border border-[var(--line)] bg-transparent px-3 py-1 text-[11px] text-[var(--text-muted)] transition-colors hover:border-[var(--line-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          {UI_LABELS.connectors.annuler}
        </button>
        <button
          onClick={submit}
          disabled={!baseUrl || busy}
          className="rounded-md bg-[var(--accent)] px-3 py-1 text-[11px] font-medium text-[var(--accent-fg)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          {busy ? UI_LABELS.connectors.ajoutEnCours : UI_LABELS.connectors.ajoutBouton}
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
  const [actionError, setActionError] = useState<unknown>(null);

  const probe = useCallback(async () => {
    setProbing(true);
    setProbeResult(null);
    setActionError(null);
    try {
      const h = await probeConnector({ data: { id: connector.id } });
      setProbeResult(
        h.ok
          ? UI_LABELS.connectors.enLigne(h.latencyMs ?? 0)
          : UI_LABELS.connectors.horsLigne(h.message ?? UI_LABELS.connectors.erreurInconnue),
      );
    } catch (e) {
      setProbeResult(UI_LABELS.connectors.erreur((e as Error).message));
      setActionError(e);
    } finally {
      setProbing(false);
    }
  }, [connector.id]);

  const loadCaps = useCallback(async () => {
    setActionError(null);
    try {
      const r = await listCapabilities({ data: { connectorId: connector.id } });
      setCaps(r.capabilities);
    } catch (e) {
      setActionError(e);
    }
  }, [connector.id]);

  const remove = useCallback(async () => {
    setActionError(null);
    try {
      await deleteConnector({ data: { id: connector.id } });
      onDeleted();
    } catch (e) {
      setActionError(e);
    }
  }, [connector.id, onDeleted]);

  return (
    <div className="rounded-md border border-[var(--line)] bg-[var(--surface-2)] p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium text-[var(--text)]">{connector.name}</div>
          <div className="mono mt-0.5 text-[10px] uppercase tracking-widest text-[var(--text-dim)]">
            {connector.kind} · {connector.status}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            onClick={probe}
            disabled={probing}
            className="rounded border border-[var(--line)] px-2 py-0.5 text-[10px] uppercase tracking-widest text-[var(--text-muted)] transition-colors hover:border-[var(--line-strong)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            {probing ? UI_LABELS.connectors.testEnCours : UI_LABELS.connectors.tester}
          </button>
          <button
            onClick={loadCaps}
            className="rounded border border-[var(--line)] px-2 py-0.5 text-[10px] uppercase tracking-widest text-[var(--text-muted)] transition-colors hover:border-[var(--line-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            {UI_LABELS.connectors.capacites}
          </button>
          <button
            onClick={remove}
            title={UI_LABELS.connectors.effacer}
            className="rounded border border-[var(--line)] px-2 py-0.5 text-[10px] uppercase tracking-widest text-[var(--status-err)] transition-colors hover:border-[var(--status-err)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            {UI_LABELS.connectors.effacer}
          </button>
        </div>
      </div>
      {probeResult ? (
        <div className="mono mt-2 text-[10px] text-[var(--text-dim)]">{probeResult}</div>
      ) : null}
      {actionError ? (
        <div className="mt-2">
          <ErrorBlock
            message={String((actionError as Error)?.message ?? actionError)}
            error={actionError}
            context={`connectors.${connector.id}`}
            compact
          />
        </div>
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
        setResult(out ? `ok · ${out}` : UI_LABELS.connectors.okSansSortie);
      } else {
        setResult(UI_LABELS.connectors.erreur(r.error ?? UI_LABELS.connectors.erreurInconnue));
      }
    } catch (e) {
      setResult(UI_LABELS.connectors.erreur((e as Error).message));
    } finally {
      setRunning(false);
    }
  }, [connectorId, cap.id, values]);

  return (
    <div className="rounded border border-[var(--line)] bg-[var(--surface-3)] p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="mono truncate text-[11px] text-[var(--text)]">{cap.displayName || cap.id}</div>
          <div className="text-[9px] uppercase tracking-widest text-[var(--text-dim)]">
            {cap.kind} · {cap.media.join(", ") || "—"}
          </div>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 rounded border border-[var(--line)] px-2 py-0.5 text-[10px] text-[var(--text-muted)] transition-colors hover:border-[var(--line-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          {open ? UI_LABELS.connectors.fermer : UI_LABELS.connectors.appeler}
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
              className="rounded bg-[var(--accent)] px-3 py-1 text-[11px] font-medium text-[var(--accent-fg)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              {running ? UI_LABELS.connectors.executionEnCours : UI_LABELS.connectors.lancer}
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
