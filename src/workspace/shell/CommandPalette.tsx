import { useEffect, useMemo, useRef, useState } from "react";
import { useKernel, useRegistrySnapshot } from "@/kernel/react";

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const registry = useRegistrySnapshot();
  const kernel = useKernel();
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const items = useMemo(() => {
    const all = registry.commands.map((c) => ({
      id: c.id,
      title: c.title,
      category: c.category ?? "General",
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
              setI((v) => Math.min(v + 1, items.length - 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setI((v) => Math.max(v - 1, 0));
            }
            if (e.key === "Enter" && items[i]) {
              e.preventDefault();
              exec(items[i]);
            }
            if (e.key === "Escape") onClose();
          }}
          placeholder="Search commands…"
          className="w-full bg-transparent px-4 py-3 text-[14px] text-[var(--text)] outline-none placeholder:text-[var(--text-dim)]"
        />
        <div className="max-h-[50vh] overflow-auto border-t border-[var(--line)]">
          {items.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-[var(--text-dim)]">no matches</div>
          ) : (
            items.map((c, idx) => (
              <button
                key={c.id}
                onMouseEnter={() => setI(idx)}
                onClick={() => exec(c)}
                className={`flex w-full items-center justify-between px-4 py-2 text-left text-[13px] ${
                  idx === i
                    ? "bg-[var(--accent-quiet)] text-[var(--text)]"
                    : "text-[var(--text-muted)]"
                }`}
              >
                <span>{c.title}</span>
                <span className="mono text-[10px] uppercase tracking-widest text-[var(--text-dim)]">
                  {c.category}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
