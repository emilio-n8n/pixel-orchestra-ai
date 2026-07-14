import { describe, it, expect, beforeEach } from "bun:test";
import { GradioConnector } from "./index";
import type { ScopedHttp, HttpRequest } from "@/kernel";

function makeMockHttp(handlers: Record<string, () => Response>): ScopedHttp {
  return {
    permissions: () => ["net"],
    async fetch(req: HttpRequest) {
      const fn = handlers[req.url];
      if (!fn) throw new Error(`unmocked url: ${req.url}`);
      return fn();
    },
  };
}

const SAMPLE_CONFIG = {
  version: "4.0.0",
  components: [
    { id: 1, type: "Textbox", label: "prompt" },
    { id: 2, type: "Image", label: null },
    { id: 3, type: "Slider", label: "steps" },
  ],
  dependencies: [
    {
      id: 0,
      api_name: "txt2img",
      title: "Text to Image",
      inputs: [1, 3],
      outputs: [2],
      show_api: true,
    },
  ],
};

describe("GradioConnector", () => {
  let mockHttp: ScopedHttp;
  let connector: GradioConnector;

  beforeEach(() => {
    mockHttp = makeMockHttp({
      "https://gpu.test/config": () => new Response(JSON.stringify(SAMPLE_CONFIG), { status: 200 }),
    });
    connector = new GradioConnector(mockHttp, { baseUrl: "https://gpu.test" });
  });

  it("probe() returns ok when /config responds 200", async () => {
    const h = await connector.probe();
    expect(h.ok).toBe(true);
    expect(typeof h.latencyMs).toBe("number");
  });

  it("probe() returns ok=false with the status on error", async () => {
    const errHttp = makeMockHttp({
      "https://broken.test/config": () => new Response("no", { status: 503 }),
    });
    const c = new GradioConnector(errHttp, { baseUrl: "https://broken.test" });
    const h = await c.probe();
    expect(h.ok).toBe(false);
    expect(h.message).toContain("503");
  });

  it("listCapabilities() returns one Capability per dependency", async () => {
    const caps = await connector.listCapabilities();
    expect(caps.length).toBe(1);
    const c = caps[0];
    expect(c.id).toBe("txt2img");
    expect(c.displayName).toBe("Text to Image");
    expect(c.kind).toBe("generate"); // Image output → generate
    expect(c.media).toContain("image");
    const inputs = c.inputs as { properties: Record<string, { type: string }>; required: string[] };
    expect(inputs.properties.prompt.type).toBe("string");
    expect(inputs.properties.steps.type).toBe("number");
    expect(inputs.required).toContain("prompt");
  });

  it("listCapabilities() caches across calls (one /config fetch)", async () => {
    let calls = 0;
    const tracking = makeMockHttp({
      "https://gpu.test/config": () => {
        calls++;
        return new Response(JSON.stringify(SAMPLE_CONFIG), { status: 200 });
      },
    });
    const c = new GradioConnector(tracking, { baseUrl: "https://gpu.test" });
    await c.listCapabilities();
    await c.listCapabilities();
    await c.listCapabilities();
    expect(calls).toBe(1);
  });

  it("listCapabilities() infers transform kind for text-only outputs", async () => {
    const textConfig = {
      version: "4.0.0",
      components: [
        { id: 1, type: "Textbox", label: "in" },
        { id: 2, type: "Textbox", label: "out" },
      ],
      dependencies: [
        { id: 0, api_name: "echo", title: "Echo", inputs: [1], outputs: [2], show_api: true },
      ],
    };
    const http = makeMockHttp({
      "https://gpu.test/config": () => new Response(JSON.stringify(textConfig), { status: 200 }),
    });
    const c = new GradioConnector(http, { baseUrl: "https://gpu.test" });
    const caps = await c.listCapabilities();
    expect(caps[0].kind).toBe("transform");
  });

  it("invoke() POSTs to /gradio_api/call, polls the event URL, returns outputs", async () => {
    const expectedEventId = "evt_42";
    const seq: string[] = [];
    const http = makeMockHttp({
      "https://gpu.test/config": () => {
        seq.push("config");
        return new Response(JSON.stringify(SAMPLE_CONFIG), { status: 200 });
      },
      "https://gpu.test/gradio_api/call/txt2img": () => {
        seq.push("call");
        return new Response(JSON.stringify({ event_id: expectedEventId }), { status: 200 });
      },
      [`https://gpu.test/gradio_api/call/txt2img/${expectedEventId}`]: () => {
        seq.push("stream");
        return new Response('event: complete\ndata: ["https://cdn.example.com/img.png"]\n\n', {
          status: 200,
        });
      },
    });
    const c = new GradioConnector(http, { baseUrl: "https://gpu.test" });
    const events: { type: string; outputs?: unknown[] }[] = [];
    for await (const ev of c.invoke(
      "txt2img",
      { prompt: "a cat", steps: 30 },
      { signal: new AbortController().signal },
    )) {
      events.push({
        type: ev.type,
        outputs: "outputs" in ev ? (ev.outputs as unknown[]) : undefined,
      });
    }
    expect(seq).toEqual(["config", "call", "stream"]);
    const done = events.find((e) => e.type === "done");
    expect(done?.outputs).toEqual(["https://cdn.example.com/img.png"]);
  });

  it("invoke() yields an error event when capability is unknown", async () => {
    const events: { type: string; error?: string }[] = [];
    for await (const ev of connector.invoke(
      "does_not_exist",
      {},
      { signal: new AbortController().signal },
    )) {
      events.push({ type: ev.type, error: "error" in ev ? ev.error : undefined });
    }
    expect(events.some((e) => e.type === "error" && e.error?.includes("not found"))).toBe(true);
  });
});
