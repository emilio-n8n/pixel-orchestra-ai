/**
 * Imperative handle to the shared timeline, for code outside React's tree
 * (the prompt bar, the SFX generator).
 *
 * The provider publishes itself on module load so these helpers can trigger a
 * reload without threading a context through every caller. Falls back to a
 * no-op when no project is open, which is the only case where the studio is
 * not mounted.
 */

import { useProjectTimeline } from "@/plugins/ui-timeline/ProjectTimelineProvider";

type ReloadFn = () => Promise<void>;

let reloadHandle: ReloadFn | null = null;

/** Registered by ProjectTimelineProvider on mount. */
export function registerTimelineReload(fn: ReloadFn | null): void {
  reloadHandle = fn;
}

/** Reload clips + markers, or resolve immediately when nothing is open. */
export async function reloadTimeline(): Promise<void> {
  if (reloadHandle) await reloadHandle();
}

/** React hook wrapper for components that want the same behaviour. */
export function useTimelineReload(): ReloadFn {
  const { reload } = useProjectTimeline();
  return reload;
}
