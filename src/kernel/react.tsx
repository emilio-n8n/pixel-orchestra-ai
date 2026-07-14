import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getKernel, getKernelAsync, type Kernel } from "./index";
import type { LiliumEvent } from "./contracts/events";

const KernelContext = createContext<Kernel | null>(null);

/**
 * Renders its children inside a KernelContext.Provider once the kernel
 * singleton is ready. The kernel is built by bootstrapKernel() in
 * __root.tsx — this component never builds it, it just waits.
 *
 * We force a re-render every 50ms until getKernel() stops throwing (the
 * singleton was set by bootstrapKernel). Once set, we stop polling.
 * This avoids the race where __root.tsx sets `ready = true` before
 * KernelProvider has picked up the singleton.
 */
export function KernelProvider({ children }: { children: ReactNode }) {
  const [, tick] = useState(0);
  const [stopped, setStopped] = useState(false);

  useEffect(() => {
    if (stopped) return;
    const iv = setInterval(() => {
      try {
        getKernel();
        setStopped(true);
        clearInterval(iv);
      } catch {
        tick((n) => n + 1);
      }
    }, 50);
    return () => clearInterval(iv);
  }, [stopped]);

  let kernel: Kernel | null = null;
  try {
    kernel = getKernel();
  } catch {
    /* not ready */
  }
  if (!kernel) return null;
  return <KernelContext.Provider value={kernel}>{children}</KernelContext.Provider>;
}

export function useKernel(): Kernel {
  const k = useContext(KernelContext);
  if (!k) throw new Error("useKernel must be used within <KernelProvider>");
  return k;
}

export function useRegistrySnapshot() {
  const { registry } = useKernel();
  const [, force] = useState(0);
  useEffect(() => registry.subscribe(() => force((v) => v + 1)), [registry]);
  return registry;
}

export function useKernelEvents(limit = 100): LiliumEvent[] {
  const { events } = useKernel();
  const [list, setList] = useState<LiliumEvent[]>(() => events.history(limit));
  useEffect(() => {
    return events.on("*", () => setList(events.history(limit)));
  }, [events, limit]);
  return list;
}
