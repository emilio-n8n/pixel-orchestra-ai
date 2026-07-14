import { getKernelAsync, getKernel } from "./index";
import { builtinPlugins } from "@/plugins";
import { initDb } from "./db";

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
    // Only init the DB on the server. The browser bundle skips this and falls
    // back to an in-RAM kernel.
    const isServer = typeof window === "undefined";
    const db = isServer
      ? await initDb().catch((err) => {
          console.warn("[bootstrap] DB init failed, running in RAM-only mode:", err);
          return undefined;
        })
      : undefined;
    await getKernelAsync({ db, notify: opts.notify });
    const { host } = getKernel();
    for (const p of builtinPlugins) {
      await host.register(p);
    }
    started = true;
  })();
  return startingPromise;
}
