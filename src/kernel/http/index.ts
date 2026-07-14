// Per-plugin HTTP scopes. Each plugin can declare its own `net:` permissions
// in its manifest. The host resolves the effective scope for the plugin and
// hands a ScopedHttp instance via ctx.http.

import type { PluginManifest } from "../contracts/plugin";
import { createScopedHttp, type ScopedHttp } from "./scoped";

export function httpForPlugin(manifest: PluginManifest): ScopedHttp {
  return createScopedHttp(manifest.permissions ?? []);
}
