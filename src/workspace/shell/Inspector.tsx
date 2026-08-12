import { useCallback, useEffect, useState } from "react";
import { MousePointerSquareDashed, Code2, Upload, X, Type as TypeIcon } from "lucide-react";
import { useRegistrySnapshot } from "@/kernel/react";
import { useLibrary } from "@/plugins/library/store";
import { replaceAsset, updateHtmlAsset, getAssetBytes } from "@/plugins/library/server";
import { EmptyState } from "@/components/ui/empty-state";
import { kindLabel } from "@/lib/ui/labels";
import { usePanelStore } from "@/stores/panels";
import { supabase } from "@/integrations/supabase/client";
import { useTimelineUi, type TimelineClip } from "@/plugins/ui-timeline/store";
import type { AssetRow } from "@/plugins/library/types";

const FONT_OPTIONS = [
  { value: "system-ui, sans-serif", label: "Système" },
  { value: "Arial, sans-serif", label: "Arial" },
  { value: "Helvetica, sans-serif", label: "Helvetica" },
  { value: "Georgia, serif", label: "Georgia" },
  { value: "Courier New, monospace", label: "Courier" },
  { value: "Verdana, sans-serif", label: "Verdana" },
  { value: "Impact, sans-serif", label: "Impact" },
];

const POSITION_OPTIONS = [
  { value: "bottom", label: "Bas" },
  { value: "center", label: "Centre" },
  { value: "top", label: "Haut" },
];

export function Inspector() {
  const registry = useRegistrySnapshot();
  const panels = registry.panelsForSlot("inspector");
  const selected = useLibrary((s) => s.selected);
  const setSelected = useLibrary((s) => s.setSelected);
  const selectedClip = useTimelineUi((s) => s.selectedClip);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--surface-2)]">
      <div className="flex-1 overflow-auto">
        {selectedClip ? (
          selectedClip.track === "Subtitles" ? (
            <SubtitleClipEditor key={selectedClip.id} clip={selectedClip} />
          ) : (
            <ClipSummary clip={selectedClip} />
          )
        ) : null}
        {selected ? (
          <AssetInspector asset={selected} onClose={() => setSelected(null)} />
        ) : selectedClip ? null : (
          <EmptyState
            compact
            icon={MousePointerSquareDashed}
            title="Aucune sélection"
            description="Sélectionnez un média ou un plan de la timeline pour ajuster ses propriétés."
          />
        )}
        {panels.map((p) => {
          const Comp = p.component;
          return <Comp key={p.id} />;
        })}
      </div>
    </div>
  );
}

/** A/B/C take switcher for multi-take voice assets (generate_voice_takes). */
function VoiceTakeSwitcher({ asset }: { asset: AssetRow }) {
  const takeGroup = typeof asset.meta?.take_group === "string" ? asset.meta.take_group : null;
  const currentIndex =
    typeof asset.meta?.take_index === "number" ? asset.meta.take_index : null;
  const [takes, setTakes] = useState<
    Array<{ id: string; url: string | null; name: string | null; meta: unknown; created_at: string }>
  >([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState(false);

  useEffect(() => {
    if (!takeGroup) return;
    let alive = true;
    supabase
      .from("assets")
      .select("id, url, name, meta, created_at")
      .eq("meta->>take_group", takeGroup)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (alive) setTakes((data ?? []) as typeof takes);
      });
    return () => {
      alive = false;
    };
  }, [takeGroup]);

  const useTake = useCallback(
    async (takeId: string) => {
      setBusyId(takeId);
      setError(null);
      try {
        const { data: clip } = await supabase
          .from("timeline_clips")
          .select("id, duration_ms")
          .eq("asset_id", asset.id)
          .maybeSingle();
        if (!clip) {
          setError("Ce take n'est pas encore posé sur la timeline — ajoutez-le depuis la médiathèque.");
          return;
        }
        const t = takes.find((x) => x.id === takeId);
        const tMeta = (t?.meta ?? {}) as Record<string, unknown>;
        await supabase
          .from("timeline_clips")
          .update({
            asset_id: takeId,
            ...(typeof tMeta.duration_ms === "number" && tMeta.duration_ms > 0
              ? { duration_ms: tMeta.duration_ms }
              : {}),
          })
          .eq("id", clip.id);
        setPlaced(true);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusyId(null);
      }
    },
    [asset.id, takes],
  );

  if (!takeGroup) return null;

  return (
    <div className="mt-3 rounded border border-[var(--line)] bg-[var(--surface-1)] p-2">
      <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-[var(--text-dim)]">
        Prises de voix ({takes.length})
      </div>
      <div className="space-y-1.5">
        {takes.map((t, i) => {
          const label = ["A", "B", "C", "D", "E"][i] ?? `${i + 1}`;
          const isCurrent = t.id === asset.id;
          const tMeta = (t.meta ?? {}) as Record<string, unknown>;
          const tDur =
            typeof tMeta.duration_ms === "number"
              ? `${(tMeta.duration_ms / 1000).toFixed(1)}s`
              : null;
          return (
            <div
              key={t.id}
              className={`rounded border p-1.5 ${isCurrent ? "border-[var(--accent)]/60 bg-[var(--accent-quiet)]" : "border-[var(--line)]"}`}
            >
              <div className="mb-1 flex items-center justify-between">
                <div className="flex items-center gap-2 text-[11px] text-[var(--text)]">
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold ${
                      isCurrent ? "bg-[var(--accent)] text-[var(--accent-fg)]" : "bg-[var(--surface-3)] text-[var(--text-muted)]"
                    }`}
                  >
                    {label}
                  </span>
                  <span className="truncate">{t.name ?? `Take ${i + 1}`}</span>
                  {tDur ? <span className="mono text-[10px] text-[var(--text-dim)]">{tDur}</span> : null}
                  {isCurrent ? (
                    <span className="text-[9px] uppercase tracking-widest text-[var(--accent-strong)]">
                      actif
                    </span>
                  ) : null}
                </div>
                {!isCurrent ? (
                  <button
                    onClick={() => void useTake(t.id)}
                    disabled={busyId !== null}
                    className="rounded border border-[var(--line)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text)] disabled:opacity-40"
                    title="Remplacer ce take sur le clip de la timeline"
                  >
                    {busyId === t.id ? "…" : "Utiliser"}
                  </button>
                ) : null}
              </div>
              {t.url ? <audio controls src={t.url} className="h-7 w-full" preload="none" /> : null}
            </div>
          );
        })}
      </div>
      {placed ? (
        <div className="mt-1.5 text-[10px] text-[var(--text-muted)]">
          Take appliqué — le clip garde sa position et sa durée a été ajustée.
        </div>
      ) : null}
      {error ? (
        <div className="mt-1.5 rounded border border-[var(--status-err)] bg-[var(--status-err)]/10 p-1.5 text-[10px] text-[var(--status-err)]">
          {error}
        </div>
      ) : null}
    </div>
  );
}

/** Generic info card for a selected timeline clip (non-subtitle). */
function ClipSummary({ clip }: { clip: TimelineClip }) {
  const selectClip = useTimelineUi((s) => s.selectClip);
  const isSilence = clip.meta?.silence === true;
  return (
    <div className="animate-fade-in border-b border-[var(--line)] p-3 text-xs text-[var(--text-muted)]">
      <div className="flex items-center justify-between">
        <div className="t-meta">Plan sélectionné</div>
        <button onClick={() => selectClip(null)} title="Désélectionner" className="ghost-btn h-6 w-6">
          <X size={12} />
        </button>
      </div>
      <div className="mt-2.5 space-y-1.5">
        <Row k="Piste" v={clip.track} />
        <Row k="Début" v={`${((clip.start_ms ?? 0) / 1000).toFixed(2)} s`} />
        <Row k="Durée" v={`${((clip.duration_ms ?? 0) / 1000).toFixed(2)} s`} />
        <Row k="Contenu" v={isSilence ? "Silence" : kindLabel(clip.assets?.kind ?? "other")} />
        {clip.assets?.prompt ? (
          <div className="pt-1">
            <div className="text-[11px] text-[var(--text-dim)]">Prompt</div>
            <div className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-[11.5px] text-[var(--text)]">
              {clip.assets.prompt}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Inline subtitle editor: text + style (font, size, color, position). */
function SubtitleClipEditor({ clip }: { clip: TimelineClip }) {
  const selectClip = useTimelineUi((s) => s.selectClip);
  const meta = clip.meta ?? {};
  const prevStyle = (meta.style ?? {}) as {
    font?: string;
    size?: number;
    color?: string;
    position?: string;
  };
  const [text, setText] = useState<string>(
    (meta.text as string | undefined) ?? clip.assets?.prompt ?? "",
  );
  const [font, setFont] = useState(prevStyle.font ?? "system-ui, sans-serif");
  const [size, setSize] = useState(prevStyle.size ?? 28);
  const [color, setColor] = useState(prevStyle.color ?? "#ffffff");
  const [position, setPosition] = useState(prevStyle.position ?? "bottom");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const nextMeta = { ...meta, text, style: { font, size, color, position } };
      await supabase.from("timeline_clips").update({ meta: nextMeta }).eq("id", clip.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [clip.id, meta, text, font, size, color, position]);

  return (
    <div className="animate-fade-in border-b border-[var(--line)] p-3 text-xs text-[var(--text-muted)]">
      <div className="flex items-center justify-between">
        <div className="t-meta flex items-center gap-1.5">
          <TypeIcon size={11} /> Sous-titre
        </div>
        <button onClick={() => selectClip(null)} title="Désélectionner" className="ghost-btn h-6 w-6">
          <X size={12} />
        </button>
      </div>

      <div className="mt-2.5 space-y-2">
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-wider text-[var(--text-dim)]">Texte</div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            className="w-full resize-y rounded border border-[var(--line)] bg-[var(--surface-1)] p-2 text-[11.5px] text-[var(--text)] outline-none focus:border-[var(--accent)]"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wider text-[var(--text-dim)]">Police</div>
            <select
              value={font}
              onChange={(e) => setFont(e.target.value)}
              className="h-7 w-full rounded border border-[var(--line)] bg-[var(--surface-1)] px-1.5 text-[11px] text-[var(--text)] outline-none"
            >
              {FONT_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wider text-[var(--text-dim)]">Taille</div>
            <input
              type="number"
              min={10}
              max={120}
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
              className="h-7 w-full rounded border border-[var(--line)] bg-[var(--surface-1)] px-1.5 text-[11px] text-[var(--text)] outline-none"
            />
          </div>
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wider text-[var(--text-dim)]">Couleur</div>
            <div className="flex h-7 items-center gap-1.5 rounded border border-[var(--line)] bg-[var(--surface-1)] px-1.5">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-4 w-6 cursor-pointer border-none bg-transparent p-0"
              />
              <span className="mono text-[10px] text-[var(--text-muted)]">{color}</span>
            </div>
          </div>
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wider text-[var(--text-dim)]">Position</div>
            <select
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              className="h-7 w-full rounded border border-[var(--line)] bg-[var(--surface-1)] px-1.5 text-[11px] text-[var(--text)] outline-none"
            >
              {POSITION_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={() => selectClip(null)}
            className="h-7 rounded-lg border border-[var(--line)] px-2.5 text-[11.5px] text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            Annuler
          </button>
          <button
            onClick={save}
            disabled={busy}
            className="h-7 rounded-lg bg-[var(--accent)] px-3 text-[11.5px] font-medium text-[var(--accent-fg)] transition-colors hover:bg-[var(--accent-strong)] disabled:opacity-50"
          >
            {busy ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>

        {error ? (
          <div className="rounded border border-[var(--status-err)] bg-[var(--status-err)]/10 p-2 text-[10px] text-[var(--status-err)]">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function AssetInspector({
  asset,
  onClose,
}: {
  asset: AssetRow;
  onClose: () => void;
}) {
  const [editingHtml, setEditingHtml] = useState(false);
  const [htmlDraft, setHtmlDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const devMode = usePanelStore((s) => s.devMode);

  // Load HTML content when starting to edit.
  useEffect(() => {
    if (!editingHtml || !asset.blobHash) return;
    let cancelled = false;
    getAssetBytes({ data: { hash: asset.blobHash } })
      .then((r) => {
        if (cancelled) return;
        setHtmlDraft(atob(r.bytesBase64));
      })
      .catch((e) => !cancelled && setError((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [editingHtml, asset.blobHash]);

  const onReplaceFile = useCallback(
    async (file: File) => {
      setBusy(true);
      setError(null);
      try {
        const buf = new Uint8Array(await file.arrayBuffer());
        await replaceAsset({
          data: { assetId: asset.id, mime: file.type || "application/octet-stream", bytesBase64: bytesToBase64(buf) },
        });
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [asset.id],
  );

  const saveHtml = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await updateHtmlAsset({ data: { assetId: asset.id, html: htmlDraft } });
      setEditingHtml(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [asset.id, htmlDraft]);

  return (
    <div className="animate-fade-in border-b border-[var(--line)] p-3 text-xs text-[var(--text-muted)]">
      <div className="flex items-center justify-between">
        <div className="t-meta">Média sélectionné</div>
        <button onClick={onClose} title="Désélectionner" className="ghost-btn h-6 w-6">
          <X size={12} />
        </button>
      </div>
      <div className="mt-2.5 space-y-1.5">
        <Row k="Nom" v={asset.name} />
        <Row k="Type" v={kindLabel(asset.kind)} />
        <Row k="Poids" v={formatBytes(asset.sizeBytes)} />
        <Row k="Créé le" v={new Date(asset.createdAt).toLocaleString("fr-FR")} />
        {devMode ? (
          <>
            <Row k="id" v={asset.id} />
            <Row k="mime" v={asset.mime ?? "—"} />
            <Row k="hash" v={asset.blobHash ?? "—"} />
          </>
        ) : null}
      </div>

      {asset.kind === "audio" && asset.meta?.take_group ? (
        <VoiceTakeSwitcher key={asset.id} asset={asset} />
      ) : null}

      {asset.status !== "pending" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {asset.kind === "html" && !editingHtml ? (
            <button
              onClick={() => setEditingHtml(true)}
              disabled={busy}
              className="flex h-7 items-center gap-1.5 rounded-lg border border-[var(--line)] px-2.5 text-[11.5px] text-[var(--text-muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text)] disabled:opacity-50"
            >
              <Code2 size={12} /> Modifier le visuel
            </button>
          ) : null}
          <label className="flex h-7 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--line)] px-2.5 text-[11.5px] text-[var(--text-muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text)]">
            <Upload size={12} />
            {busy ? "Envoi…" : "Remplacer le fichier"}
            <input
              type="file"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onReplaceFile(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      ) : null}

      {editingHtml ? (
        <div className="mt-3">
          <textarea
            value={htmlDraft}
            onChange={(e) => setHtmlDraft(e.target.value)}
            rows={10}
            className="mono w-full resize-y rounded border border-[var(--line)] bg-[var(--surface-1)] p-2 text-[10px] text-[var(--text)] outline-none focus:border-[var(--accent)]"
          />
          <div className="mt-1.5 flex justify-end gap-2">
            <button
              onClick={() => setEditingHtml(false)}
              className="h-7 rounded-lg border border-[var(--line)] px-2.5 text-[11.5px] text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              Annuler
            </button>
            <button
              onClick={saveHtml}
              disabled={busy}
              className="h-7 rounded-lg bg-[var(--accent)] px-3 text-[11.5px] font-medium text-[var(--accent-fg)] transition-colors hover:bg-[var(--accent-strong)] disabled:opacity-50"
            >
              Enregistrer
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="mt-2 rounded border border-[var(--status-err)] bg-[var(--status-err)]/10 p-2 text-[10px] text-[var(--status-err)]">
          {error}
        </div>
      ) : null}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-[11px] text-[var(--text-dim)]">{k}</span>
      <span className="truncate text-right text-[11.5px] text-[var(--text)]" title={v}>
        {v}
      </span>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
