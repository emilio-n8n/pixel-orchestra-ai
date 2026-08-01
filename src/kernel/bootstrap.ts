import { getKernelAsync, getKernel, listNodeExecutors } from "./index";
import { builtinPlugins } from "@/plugins";
import { initDb } from "./db";
import { initStorage } from "./storage";

let started = false;
let startingPromise: Promise<void> | null = null;

export async function bootstrapKernel(
  opts: {
    notify?: (message: string, kind?: "info" | "success" | "warn" | "error") => void;
  } = {},
): Promise<void> {
  if (started) return;
  if (startingPromise) return startingPromise;
  startingPromise = (async () => {
    // Only init the DB + storage on the server. The browser bundle skips
    // these and falls back to an in-RAM kernel.
    const isServer = typeof window === "undefined";
    const db = isServer
      ? await initDb().catch((err) => {
          console.warn("[bootstrap] DB init failed, running in RAM-only mode:", err);
          return undefined;
        })
      : undefined;
    const storage = isServer
      ? await initStorage().catch((err) => {
          console.warn("[bootstrap] storage init failed:", err);
          return undefined;
        })
      : undefined;
    await getKernelAsync({ db, storage, notify: opts.notify });
    const { host, scheduler } = getKernel();
    for (const p of builtinPlugins) {
      await host.register(p);
    }
    // Re-hydrate the scheduler with executors pushed during plugin activation.
    // The kernel builds before plugins register, so the initial snapshot is
    // taken too early — pull them in now that activation is done.
    for (const exec of listNodeExecutors()) {
      scheduler.registerExecutor(exec);
    }
    started = true;
  })();
  return startingPromise;
}
