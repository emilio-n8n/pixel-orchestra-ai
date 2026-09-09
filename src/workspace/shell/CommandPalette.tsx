import { useEffect, useMemo, useRef, useState } from "react";
import { useKernel, useRegistrySnapshot } from "@/kernel/react";
import { UI_LABELS, categoryLabel } from "@/lib/ui/labels";

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const registry = useRegistrySnapshot();
  const kernel = useKernel();
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const items = useMemo(() => {
    const all = registry.commands.map((c) => ({
      id: c.id,
      title: c.title,
      category: categoryLabel(c.category ?? UI_LABELS.palette.categorieDefaut),
      run: c.run,
      pluginId: c.pluginId,
    }));
    const ql = q.trim().toLowerCase();
    if (!ql) return all;
    return all.filter((c) => `${c.title} ${c.category}`.toLowerCase().includes(ql));
  }, [registry, q]);

  useEffect(() => {
    if (open) {
      setQ("");
      setI(0);
      queueMicrotask(() => inputRef.current?.focus());
    }
  }, [open]);

  // Keep the active row visible while navigating with ↑↓.
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${i}"]`)?.scrollIntoView({ block: "nearest" });
  }, [i]);

  if (!open) return null;

  function exec(cmd: (typeof items)[number]) {
    onClose();
    cmd.run({
      pluginId: cmd.pluginId,
      events: kernel.events,
      registry: kernel.registry,
      logger: { info: console.info, warn: console.warn, error: console.error },
      ui: {
        notify: (message, kind) => kernel.notify?.(message, kind),
      },
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[10vh]"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={UI_LABELS.palette.placeholder}
        className="w-[560px] max-w-[90vw] overflow-hidden rounded-xl border border-[var(--line-strong)] bg-[var(--surface-3)] shadow-[var(--shadow-pop)]"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setI(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setI((v) => (items.length > 0 ? (v + 1) % items.length : 0));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setI((v) => (items.length > 0 ? (v - 1 + items.length) % items.length : 0));
            }
            if (e.key === "Home") {
              e.preventDefault();
              setI(0);
            }
            if (e.key === "End") {
              e.preventDefault();
              setI(items.length - 1);
            }
            if (e.key === "Enter" && items[i]) {
              e.preventDefault();
              exec(items[i]);
            }
            if (e.key === "Escape") onClose();
          }}
          placeholder={UI_LABELS.palette.placeholder}
          aria-label={UI_LABELS.palette.placeholder}
          role="combobox"
          aria-expanded
          aria-controls="palette-list"
          aria-activedescendant={items[i] ? `palette-${items[i].id}` : undefined}
          className="w-full bg-transparent px-4 py-3 text-[14px] text-[var(--text)] outline-none placeholder:text-[var(--text-dim)] focus-visible:bg-[var(--accent-quiet)]/40"
        />
        <div
          ref={listRef}
          id="palette-list"
          role="listbox"
          className="max-h-[50vh] overflow-auto border-t border-[var(--line)]"
        >
          {items.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-[var(--text-dim)]">
              {UI_LABELS.palette.aucunResultat}
            </div>
          ) : (
            items.map((c, idx) => (
              <button
                key={c.id}
                id={`palette-${c.id}`}
                data-idx={idx}
                role="option"
                aria-selected={idx === i}
                onMouseEnter={() => setI(idx)}
                onFocus={() => setI(idx)}
                onClick={() => exec(c)}
                className={`flex w-full items-center justify-between px-4 py-2 text-left text-[13px] outline-none transition-colors ${
                  idx === i
                    ? "bg-[var(--accent-quiet)] text-[var(--text)]"
                    : "text-[var(--text-muted)]"
                } focus-visible:bg-[var(--accent-quiet)] focus-visible:text-[var(--text)]`}
              >
                <span>{c.title}</span>
                <span className="mono text-[10px] uppercase tracking-widest text-[var(--text-dim)]">
                  {c.category}
                </span>
              </button>
            ))
          )}
        </div>
        <div className="border-t border-[var(--line)] px-4 py-1.5 text-[10px] text-[var(--text-dim)]">
          {UI_LABELS.palette.aideClavier}
        </div>
      </div>
    </div>
  );
}
