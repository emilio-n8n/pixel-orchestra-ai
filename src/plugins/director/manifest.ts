import type { PluginManifest } from "@/kernel";

/**
 * The Director plugin no longer contributes a center panel — the DirectorPanel
 * is mounted directly by the workspace shell (RightPanel) so it is always
 * reachable alongside the timeline. This manifest is kept so plugin-discovery
 * code still recognises the plugin id.
 */
export const directorPlugin: PluginManifest = {
  id: "com.lilium.builtin.director",
  name: "Director",
  version: "0.1.0",
  engines: { lilium: "^0.1.0" },
  description:
    "AI Director — generate images, voices, and title cards, and drop them on the timeline.",
  contributes: {},
  activate: (ctx) => ctx.logger.info("director plugin activated"),
};