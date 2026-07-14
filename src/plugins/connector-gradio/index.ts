// Gradio Connector — implements the Connector contract for any Gradio app
// reachable at a base URL. The Connector is the kernel's abstraction (see
// .lovable/plan.md §3); Gradio is just one of many implementations.
//
// Protocol summary (auto-detects Gradio 3.x vs 4.x):
//   GET  <base>/config         → JSON: { version, components, dependencies, ... }
//   POST <base>/gradio_api/call/<fn>   body: { data: [...] }  → { event_id }
//   GET  <base>/gradio_api/call/<fn>/<event_id>  (SSE)        → streamed result
//
// We expose one Capability per Gradio API endpoint (`dependencies[*].api_name`).
// The Capability's `inputs` is a JSON Schema built from the dependency's
// `inputs` (component list). Outputs are typed heuristically based on the
// component types in the `outputs` array (image/video/audio/...).

import type {
  Capability,
  Connector,
  ConnectorHealth,
  ConnectorContribution,
  HttpRequest,
  InvocationController,
  InvocationEvent,
  PluginManifest,
  ScopedHttp,
} from "@/kernel";

interface GradioConfig {
  version?: string;
  dependencies?: GradioDependency[];
  components?: GradioComponent[];
  api_info?: Record<string, unknown>;
}

interface GradioDependency {
  id?: number;
  api_name?: string;
  title?: string;
  inputs?: (string | number)[];
  outputs?: (string | number)[];
  show_api?: boolean;
  targets?: string[];
}

interface GradioComponent {
  id?: number;
  type: string;
  label?: string;
  props?: Record<string, unknown>;
  component_class_id?: string;
}

export interface GradioConnectorConfig {
  baseUrl: string;
  name?: string;
  authHeader?: string;
  lazy?: boolean;
}

const GRADIO_MEDIA: Record<string, Capability["media"][number] | undefined> = {
  Image: "image",
  Video: "video",
  Audio: "audio",
  AudioOutput: "audio",
  VideoOutput: "video",
  ImageOutput: "image",
  HTML: "html",
  Textbox: "text",
  Markdown: "doc",
  JSON: "doc",
  File: "doc",
  Dataframe: "doc",
  Model3D: "3d",
};

const IMAGE_TYPES = new Set<string>(["image", "video", "audio"]);
const TEXT_TYPES = new Set<string>(["text", "number", "boolean"]);

function normalizeBaseUrl(raw: string): string {
  let u = raw.trim();
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  return u.replace(/\/+$/, "");
}

async function fetchConfig(http: ScopedHttp, base: string): Promise<GradioConfig> {
  const r = await http.fetch({ url: `${base}/config` });
  if (!r.ok) throw new Error(`gradio /config returned ${r.status}`);
  return (await r.json()) as GradioConfig;
}

function buildInputSchema(
  dep: GradioDependency,
  comps: GradioComponent[],
): Record<string, unknown> {
  const inputs = (dep.inputs ?? [])
    .map((id) => comps.find((c) => c.id === id))
    .filter(Boolean) as GradioComponent[];
  if (inputs.length === 0) return { type: "object", properties: {}, additionalProperties: true };
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const c of inputs) {
    const name = (c.label || c.type || `in${c.id}`).replace(/\s+/g, "_");
    if (TEXT_TYPES.has(c.type.toLowerCase())) {
      properties[name] = {
        type: c.type.toLowerCase() === "textbox" ? "string" : c.type.toLowerCase(),
      };
    } else if (c.type === "Slider" || c.type === "Number") {
      properties[name] = { type: "number" };
    } else if (c.type === "Checkbox") {
      properties[name] = { type: "boolean" };
    } else if (c.type === "Dropdown") {
      properties[name] = { type: "string", enum: (c.props?.choices as string[]) ?? [] };
    } else if (isMediaOutput(c)) {
      properties[name] = { type: "string", format: "uri-reference" };
    } else {
      properties[name] = { type: "string" };
    }
    required.push(name);
  }
  return { type: "object", properties, required };
}

function buildOutputSchema(
  dep: GradioDependency,
  comps: GradioComponent[],
): Record<string, unknown> {
  const outputs = (dep.outputs ?? [])
    .map((id) => comps.find((c) => c.id === id))
    .filter(Boolean) as GradioComponent[];
  const types = outputs.map((c) => GRADIO_MEDIA[c.type] ?? "doc");
  return { type: "array", items: { type: "string" }, media: Array.from(new Set(types)) };
}

function isMediaOutput(c: GradioComponent): boolean {
  const media = GRADIO_MEDIA[c.type];
  return Boolean(media) && IMAGE_TYPES.has(media as string);
}

function inferKind(_dep: GradioDependency, outs: GradioComponent[]): Capability["kind"] {
  const hasMedia = outs.some(isMediaOutput);
  if (hasMedia) return "generate";
  const allText = outs.every((c) => TEXT_TYPES.has(c.type.toLowerCase()) || c.type === "Textbox");
  if (allText) return "transform";
  return "tool";
}

function inferMedia(outs: GradioComponent[]): Capability["media"] {
  const set = new Set<Capability["media"][number]>();
  for (const c of outs) {
    const m = GRADIO_MEDIA[c.type];
    if (m) set.add(m);
  }
  return Array.from(set);
}

export class GradioConnector implements Connector {
  private grConfig: GradioConfig | null = null;
  private _capabilities: Capability[] | null = null;

  constructor(
    private http: ScopedHttp,
    public readonly userConfig: GradioConnectorConfig,
  ) {}

  private get base(): string {
    return normalizeBaseUrl(this.userConfig.baseUrl);
  }

  private async ensureConfig(): Promise<GradioConfig> {
    if (this.grConfig) return this.grConfig;
    this.grConfig = await fetchConfig(this.http, this.base);
    this._capabilities = null;
    return this.grConfig;
  }

  async probe(): Promise<ConnectorHealth> {
    const t0 = Date.now();
    try {
      const r = await this.http.fetch({ url: `${this.base}/config` });
      return {
        ok: r.ok,
        latencyMs: Date.now() - t0,
        message: r.ok ? "ok" : `HTTP ${r.status}`,
      };
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - t0, message: (err as Error).message };
    }
  }

  async listCapabilities(): Promise<Capability[]> {
    if (this._capabilities) return this._capabilities;
    const cfg = await this.ensureConfig();
    const comps = cfg.components ?? [];
    const deps = (cfg.dependencies ?? []).filter((d) => d.show_api !== false);
    this._capabilities = deps.map((dep) => {
      const name = dep.api_name || dep.title || `dep_${dep.id}`;
      const outputs = (dep.outputs ?? [])
        .map((id) => comps.find((c) => c.id === id))
        .filter(Boolean) as GradioComponent[];
      return {
        id: name,
        kind: inferKind(dep, outputs),
        media: inferMedia(outputs),
        displayName: dep.title || name,
        inputs: buildInputSchema(dep, comps),
        outputs: buildOutputSchema(dep, comps),
        tags: ["gradio"],
      };
    });
    return this._capabilities;
  }

  async *invoke(
    capId: string,
    input: unknown,
    ctrl: InvocationController,
  ): AsyncIterable<InvocationEvent> {
    const cfg = await this.ensureConfig();
    const dep = (cfg.dependencies ?? []).find(
      (d) => (d.api_name || d.title || `dep_${d.id}`) === capId,
    );
    if (!dep) {
      yield { type: "error", error: `capability not found: ${capId}` };
      return;
    }
    const obj = (input ?? {}) as Record<string, unknown>;
    const inputs = dep.inputs ?? [];
    const comps = cfg.components ?? [];
    const data: unknown[] = inputs.map((id) => {
      const c = comps.find((cc) => cc.id === id);
      const name = (c?.label || c?.type || `in${id}`).replace(/\s+/g, "_");
      return obj[name];
    });

    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.userConfig.authHeader) headers.authorization = this.userConfig.authHeader;

    const callRes: Response = await this.http.fetch({
      url: `${this.base}/gradio_api/call/${capId}`,
      method: "POST",
      headers,
      body: JSON.stringify({ data }),
    });
    if (!callRes.ok) {
      yield { type: "error", error: `gradio call failed: ${callRes.status}` };
      return;
    }
    const callJson = (await callRes.json()) as { event_id?: string };
    const eventId = callJson.event_id;
    if (!eventId) {
      yield { type: "error", error: "no event_id in gradio response" };
      return;
    }
    yield { type: "progress", value: 0.2, note: "queued" };

    if (ctrl.signal.aborted) {
      yield { type: "error", error: "aborted" };
      return;
    }

    const stream = await this.http.fetch({
      url: `${this.base}/gradio_api/call/${capId}/${eventId}`,
      method: "GET",
      headers,
    });
    if (!stream.ok) {
      yield { type: "error", error: `gradio stream failed: ${stream.status}` };
      return;
    }
    const text = await stream.text();
    yield { type: "progress", value: 0.7, note: "received" };
    const dataLines = text
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trim());
    const last = dataLines[dataLines.length - 1];
    if (!last) {
      yield { type: "error", error: "empty gradio response" };
      return;
    }
    try {
      const parsed = JSON.parse(last) as unknown[];
      yield { type: "output", data: parsed };
      yield { type: "done", outputs: parsed };
    } catch (err) {
      yield { type: "error", error: `parse error: ${(err as Error).message}` };
    }
  }

  async dispose(): Promise<void> {
    /* nothing to release */
  }
}

export const gradioConnectorContribution: ConnectorContribution = {
  kind: "gradio",
  displayName: "Gradio endpoint",
  configSchema: {
    type: "object",
    required: ["baseUrl"],
    properties: {
      baseUrl: { type: "string", title: "Endpoint URL" },
      name: { type: "string", title: "Display name (optional)" },
      authHeader: { type: "string", title: "Authorization header (optional)" },
    },
  },
  factory: (cfg: unknown, ctx) => {
    const c = cfg as GradioConnectorConfig;
    if (!ctx.http) throw new Error("PluginContext.http is required for the Gradio connector");
    return new GradioConnector(ctx.http, c);
  },
};

export const connectorGradioPlugin: PluginManifest = {
  id: "com.lilium.builtin.connector-gradio",
  name: "Gradio connector",
  version: "0.1.0",
  engines: { lilium: "^0.1.0" },
  description:
    "Connector for Gradio endpoints (HF Spaces, local GPU servers). Probes /config, lists capabilities, invokes via /gradio_api/call.",
  permissions: ["net", "net:https://*", "net:http://localhost:*", "net:http://127.0.0.1:*"],
  contributes: {
    connectors: [gradioConnectorContribution],
  },
};

// Silence "unused" warning when imported by index.ts barrel that doesn't use HttpRequest.
void (null as unknown as HttpRequest);
