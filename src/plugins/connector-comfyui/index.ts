// ComfyUI connector — stub for phase 11. ComfyUI exposes a REST API
// (POST /queue, GET /history, WS /ws) for workflow execution. A real
// Connector implementation requires WebSocket support in the kernel's
// ScopedHttp. For now we document the protocol and provide a minimal
// in-proc implementation that integrates with the node graph system.

import type {
  ConnectorContribution,
  Connector,
  ConnectorHealth,
  Capability,
  InvocationController,
  InvocationEvent,
  PluginManifest,
} from "@/kernel";

class ComfyUIConnector implements Connector {
  constructor(private baseUrl: string) {}
  async probe(): Promise<ConnectorHealth> {
    try {
      const r = await globalThis.fetch(`${this.baseUrl}/queue`);
      return { ok: r.ok, latencyMs: 0, message: r.ok ? "ok" : `HTTP ${r.status}` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, message: msg };
    }
  }
  async listCapabilities(): Promise<Capability[]> {
    return [
      {
        id: "comfyui.execute",
        kind: "generate",
        media: ["image"],
        displayName: "ComfyUI workflow",
        inputs: { type: "object", properties: { workflow_json: { type: "string" } } },
        outputs: { type: "object" },
        tags: ["comfyui"],
      },
    ];
  }
  async *invoke(
    capId: string,
    input: unknown,
    ctrl: InvocationController,
  ): AsyncIterable<InvocationEvent> {
    try {
      const r = await globalThis.fetch(`${this.baseUrl}/api/v1/queue`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!r.ok) {
        yield { type: "error", error: `ComfyUI error: ${r.status}` };
        return;
      }
      const json = (await r.json()) as { outputs?: string[] };
      yield { type: "done", outputs: json.outputs ?? [] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      yield { type: "error", error: msg };
    }
  }
  async dispose(): Promise<void> {}
}

export const connectorComfyuiContribution: ConnectorContribution = {
  kind: "comfyui",
  displayName: "ComfyUI endpoint",
  configSchema: {
    type: "object",
    required: ["baseUrl"],
    properties: { baseUrl: { type: "string", title: "ComfyUI URL" } },
  },
  factory: (cfg: unknown) => {
    const c = cfg as { baseUrl: string };
    return new ComfyUIConnector(c.baseUrl);
  },
};

export const connectorComfyuiPlugin: PluginManifest = {
  id: "com.lilium.builtin.connector-comfyui",
  name: "ComfyUI connector",
  version: "0.1.0",
  engines: { lilium: "^0.1.0" },
  description: "REST-based connector for ComfyUI endpoints.",
  permissions: ["net", "net:https://*", "net:http://127.0.0.1:*"],
  contributes: { connectors: [connectorComfyuiContribution] },
};
