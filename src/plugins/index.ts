import type { PluginManifest } from "@/kernel";
import { helloPlugin } from "./hello/manifest";

// Static list of builtin plugins loaded at boot.
export const builtinPlugins: PluginManifest[] = [helloPlugin];