import { addNodeExecutor, type PluginManifest, type NodeExecutor, type ScopedHttp } from "@/kernel";

interface CapabilityRef {
  /** connectorId from the `connectors` table. */
  connectorId: string;
  /** cap_ref from the `capabilities` table (= the Capability.id). */
  capId: string;
}

export const CAPABILITY_NODE_ID = "capability.run";

const capabilityExec: NodeExecutor = {
  id: CAPABILITY_NODE_ID,
  category: "capability",
  displayName: "Capability run",
  defaultInputs: [],
  defaultOutputs: [
    { id: "outputs", label: "outputs", type: "any" },
    { id: "ok", label: "ok", type: "boolean" },
  ],
  async execute(input, ctx) {
    const ref = input.capability as CapabilityRef | undefined;
    if (!ref || !ref.connectorId || !ref.capId) {
      throw new Error("missing capability reference (connectorId/capId)");
    }
    // Lazy import to avoid a hard dep cycle (connector-gradio → kernel).
    const { GradioConnector } = await import("@/plugins/connector-gradio");
    const http: ScopedHttp = ctx.env.http ?? {
      permissions: () => ["net"],
      async fetch(req) {
        return globalThis.fetch(req.url, {
          method: req.method ?? "GET",
          headers: req.headers,
          body: req.body ?? undefined,
        });
      },
    };
    const url = String(input.endpoint ?? "");
    const auth = input.auth ? String(input.auth) : undefined;
    if (!url)
      throw new Error("capability node: missing endpoint (connect a string node to `endpoint`)");
    const connector = new GradioConnector(http, {
      baseUrl: url,
      ...(auth ? { authHeader: auth } : {}),
    });
    const ctrl = new AbortController();
    ctx.signal.addEventListener("abort", () => ctrl.abort());
    const out: unknown[] = [];
    let ok = true;
    for await (const ev of connector.invoke(ref.capId, input, { signal: ctrl.signal })) {
      if (ev.type === "done") {
        for (const o of ev.outputs) out.push(o);
      } else if (ev.type === "output") {
        const d = ev.data;
        if (Array.isArray(d)) out.push(...d);
      } else if (ev.type === "error") {
        ok = false;
        throw new Error(ev.error);
      }
    }
    return { outputs: out, ok };
  },
};

export const nodeCapabilityPlugin: PluginManifest = {
  id: "com.lilium.builtin.node-capability",
  name: "Capability node",
  version: "0.1.0",
  engines: { lilium: "^0.1.0" },
  permissions: ["net", "net:https://*", "net:http://localhost:*", "net:http://127.0.0.1:*"],
  description: "Wraps a connector capability as a node-graph node.",
  contributes: {},
  activate: () => {
    addNodeExecutor({ ...capabilityExec, pluginId: "com.lilium.builtin.node-capability" });
  },
};
