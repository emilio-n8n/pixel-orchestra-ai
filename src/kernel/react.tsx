import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getKernel, type Kernel } from "./index";
import type { LiliumEvent } from "./contracts/events";

const KernelContext = createContext<Kernel | null>(null);

export function KernelProvider({ children }: { children: ReactNode }) {
  const [kernel] = useState(() => getKernel());
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