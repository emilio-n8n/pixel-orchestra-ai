import { addNodeExecutor, type PluginManifest, type NodeExecutor } from "@/kernel";
import type { PortSpec } from "@/kernel";

const STRING_OUT: PortSpec = { id: "out", label: "value", type: "string" };
const NUMBER_OUT: PortSpec = { id: "out", label: "value", type: "number" };

const stringExec: NodeExecutor = {
  id: "primitives.string",
  category: "primitives",
  displayName: "String",
  defaultInputs: [],
  defaultOutputs: [STRING_OUT],
  async execute(input) {
    return { out: String(input.value ?? "") };
  },
};

const numberExec: NodeExecutor = {
  id: "primitives.number",
  category: "primitives",
  displayName: "Number",
  defaultInputs: [],
  defaultOutputs: [NUMBER_OUT],
  async execute(input) {
    const n = Number(input.value ?? 0);
    return { out: Number.isNaN(n) ? 0 : n };
  },
};

const promptTemplateExec: NodeExecutor = {
  id: "primitives.prompt-template",
  category: "primitives",
  displayName: "Prompt template",
  defaultInputs: [],
  defaultOutputs: [{ id: "prompt", label: "prompt", type: "string" }],
  async execute(input) {
    // Very small template engine: replaces {{key}} with the value from
    // input[key] (or input.params if missing). Phase 6 will replace with
    // full context bindings.
    const template = String(input.template ?? "");
    const out = template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
      const v = (input as Record<string, unknown>)[key];
      return v == null ? `{{${key}}}` : String(v);
    });
    return { prompt: out };
  },
};

export const nodePrimitivesPlugin: PluginManifest = {
  id: "com.lilium.builtin.node-primitives",
  name: "Primitive nodes",
  version: "0.1.0",
  engines: { lilium: "^0.1.0" },
  description: "String, number, and prompt-template node executors.",
  contributes: {},
  activate: () => {
    addNodeExecutor({ ...stringExec, pluginId: "com.lilium.builtin.node-primitives" });
    addNodeExecutor({ ...numberExec, pluginId: "com.lilium.builtin.node-primitives" });
    addNodeExecutor({
      ...promptTemplateExec,
      pluginId: "com.lilium.builtin.node-primitives",
    });
  },
  deactivate: () => {
    // No global deregister API in phase 4. The scheduler only uses
    // executors registered before runGraph is called. For phase 12
    // we'll add removeNodeExecutor().
  },
};
