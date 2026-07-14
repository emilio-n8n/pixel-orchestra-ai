export function Inspector() {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--surface-2)]">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--line)] px-3">
        <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--text-dim)]">Inspector</div>
      </div>
      <div className="flex-1 overflow-auto p-4 text-sm text-[var(--text-muted)]">
        <div className="rounded-md border border-dashed border-[var(--line)] p-4 text-center text-xs text-[var(--text-dim)]">
          Nothing selected.
          <br />
          Pick an asset, clip, node or job to inspect.
        </div>
      </div>
    </div>
  );
}