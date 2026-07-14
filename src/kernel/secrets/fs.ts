// Per-plugin secret store. Backed by a single JSON file at
// `~/.lilium/secrets.json` (plaintext for now — phase 12 will add OS-keychain
// integration). Each plugin's secrets are namespaced by its plugin id, so
// `ctx.secrets.get("api_key")` resolves to `secrets[pluginId].api_key`.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import type { SecretsStore } from "../contracts/plugin";

function defaultPath(): string {
  if (typeof process !== "undefined" && process.env?.LILIUM_SECRETS_PATH) {
    return process.env.LILIUM_SECRETS_PATH;
  }
  const home = (typeof process !== "undefined" && process.env?.HOME) || ".";
  return `${home}/.lilium/secrets.json`;
}

export interface FsSecretsOptions {
  path?: string;
}

export function createFsSecrets(pluginId: string, options: FsSecretsOptions = {}): SecretsStore {
  const file = options.path ?? defaultPath();
  const readAll = (): Record<string, Record<string, string>> => {
    if (!existsSync(file)) return {};
    try {
      return JSON.parse(readFileSync(file, "utf8")) as Record<string, Record<string, string>>;
    } catch {
      return {};
    }
  };
  const writeAll = (data: Record<string, Record<string, string>>) => {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  };
  const get = (name: string) => readAll()[pluginId]?.[name];
  const set = (name: string, value: string) => {
    const all = readAll();
    all[pluginId] = { ...(all[pluginId] ?? {}), [name]: value };
    writeAll(all);
  };
  const del = (name: string) => {
    const all = readAll();
    if (all[pluginId]) {
      delete all[pluginId][name];
      writeAll(all);
    }
  };
  const list = () => Object.keys(readAll()[pluginId] ?? {});
  return { get, set: (n, v) => set(n, v), delete: del, list };
}

export { defaultPath as defaultSecretsPath, join };
