import { useCallback, useEffect, useState } from "react";
import { useKernelEvents } from "@/kernel/react";
import { useLibraryProject } from "@/plugins/library/project";
import { listCharacters, saveCharacter, deleteCharacter, type CharacterView } from "./server";

export function CharactersPanel() {
  const projectId = useLibraryProject();
  const [chars, setChars] = useState<CharacterView[]>([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    portraitIds: "",
    voiceRef: "",
    styleRef: "",
  });

  const last = useKernelEvents(1)[0];
  useEffect(() => {
    if (!projectId) return;
    listCharacters({ data: { projectId } })
      .then((r) => setChars(r.characters as unknown as CharacterView[]))
      .catch(() => setChars([]));
  }, [projectId, last]);

  const submit = useCallback(async () => {
    if (!projectId || !form.name.trim()) return;
    await saveCharacter({
      data: {
        projectId,
        character: {
          name: form.name.trim(),
          description: form.description,
          portraitIds: form.portraitIds
            ? form.portraitIds
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            : [],
          voiceRef: form.voiceRef || null,
          styleRef: form.styleRef || null,
        },
      },
    });
    setEditing(false);
    setForm({ name: "", description: "", portraitIds: "", voiceRef: "", styleRef: "" });
  }, [projectId, form]);

  const remove = useCallback(
    async (id: string) => {
      if (!projectId) return;
      await deleteCharacter({ data: { projectId, characterId: id } });
    },
    [projectId],
  );

  if (!projectId) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-[var(--text-muted)]">
        No project open.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-auto bg-[var(--surface-1)] p-4 text-xs text-[var(--text-muted)]">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--text-dim)]">
          Characters
        </div>
        <button
          onClick={() => setEditing(true)}
          className="rounded-md bg-[var(--accent)] px-2 py-1 text-[11px] font-medium text-[var(--accent-fg)]"
        >
          + New
        </button>
      </div>
      {editing ? (
        <div className="mt-3 space-y-2 rounded border border-[var(--line)] bg-[var(--surface-2)] p-3">
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Name *"
            className="w-full rounded border border-[var(--line)] bg-[var(--surface-3)] px-2 py-1.5 text-sm"
          />
          <input
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Description"
            className="w-full rounded border border-[var(--line)] bg-[var(--surface-3)] px-2 py-1.5 text-sm"
          />
          <input
            value={form.portraitIds}
            onChange={(e) => setForm((f) => ({ ...f, portraitIds: e.target.value }))}
            placeholder="Portrait asset IDs (comma-separated)"
            className="w-full rounded border border-[var(--line)] bg-[var(--surface-3)] px-2 py-1.5 text-sm"
          />
          <div className="flex gap-2">
            <input
              value={form.voiceRef}
              onChange={(e) => setForm((f) => ({ ...f, voiceRef: e.target.value }))}
              placeholder="Voice ref"
              className="w-full rounded border border-[var(--line)] bg-[var(--surface-3)] px-2 py-1.5 text-sm"
            />
            <input
              value={form.styleRef}
              onChange={(e) => setForm((f) => ({ ...f, styleRef: e.target.value }))}
              placeholder="Style ref"
              className="w-full rounded border border-[var(--line)] bg-[var(--surface-3)] px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setEditing(false)}
              className="rounded border border-[var(--line)] px-2 py-1 text-[11px]"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={!form.name.trim()}
              className="rounded bg-[var(--accent)] px-2 py-1 text-[11px] text-[var(--accent-fg)] disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      ) : null}
      <div className="mt-3 space-y-2">
        {chars.length === 0 ? (
          <div className="text-[var(--text-dim)]">No characters yet.</div>
        ) : null}
        {chars.map((c) => (
          <div
            key={c.id}
            className="flex items-start justify-between rounded border border-[var(--line)] bg-[var(--surface-2)] p-2"
          >
            <div>
              <div className="text-[12px] font-medium text-[var(--text)]">{c.name}</div>
              {c.description ? <div className="text-[10px]">{c.description}</div> : null}
              <div className="mono mt-1 text-[9px] text-[var(--text-dim)]">
                id: {c.id.slice(0, 12)} · portraits: {c.portraitIds.length} · voice:{" "}
                {c.voiceRef ?? "—"} · style: {c.styleRef ?? "—"}
              </div>
            </div>
            <button
              onClick={() => remove(c.id)}
              className="text-[9px] uppercase tracking-widest text-[var(--status-err)] hover:underline"
            >
              Del
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
