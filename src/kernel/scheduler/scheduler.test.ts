import { describe, it, expect } from "bun:test";
import { compileGraph, GraphCompileError } from "./compile";
import { executeCompiled } from "./run";
import { createEventBus } from "../event-bus";
import type { EventBus } from "../event-bus";
import type { GraphDocument, NodeExecutor } from "./types";

function mkExec(
  id: string,
  category: string,
  displayName: string,
  fn: (input: Record<string, unknown>) => Promise<Record<string, unknown>>,
): NodeExecutor {
  return {
    id,
    category,
    displayName,
    defaultInputs: [],
    defaultOutputs: [{ id: "out", label: "out", type: "any" }],
    execute: fn,
  };
}

function eventCollector(events: EventBus) {
  const seen: string[] = [];
  events.on("*", (e) => {
    seen.push(e.type);
  });
  return seen;
}

describe("graph compile", () => {
  it("topologically sorts a linear chain", () => {
    const g: GraphDocument = {
      id: "g1",
      name: "chain",
      nodes: [
        { id: "a", type: "x.string", params: {}, inputs: [], outputs: [] },
        { id: "b", type: "x.string", params: {}, inputs: [], outputs: [] },
        { id: "c", type: "x.string", params: {}, inputs: [], outputs: [] },
      ],
      edges: [
        { fromNodeId: "a", fromPort: "out", toNodeId: "b", toPort: "in" },
        { fromNodeId: "b", fromPort: "out", toNodeId: "c", toPort: "in" },
      ],
      inputs: [],
      outputs: [],
    };
    const c = compileGraph(g);
    expect(c.order).toEqual(["a", "b", "c"]);
  });

  it("detects a cycle and throws", () => {
    const g: GraphDocument = {
      id: "g1",
      name: "cycle",
      nodes: [
        { id: "a", type: "x", params: {}, inputs: [], outputs: [] },
        { id: "b", type: "x", params: {}, inputs: [], outputs: [] },
      ],
      edges: [
        { fromNodeId: "a", fromPort: "out", toNodeId: "b", toPort: "in" },
        { fromNodeId: "b", fromPort: "out", toNodeId: "a", toPort: "in" },
      ],
      inputs: [],
      outputs: [],
    };
    expect(() => compileGraph(g)).toThrow(GraphCompileError);
  });

  it("throws on unknown edge endpoints", () => {
    const g: GraphDocument = {
      id: "g1",
      name: "bad",
      nodes: [{ id: "a", type: "x", params: {}, inputs: [], outputs: [] }],
      edges: [{ fromNodeId: "a", fromPort: "out", toNodeId: "missing", toPort: "in" }],
      inputs: [],
      outputs: [],
    };
    expect(() => compileGraph(g)).toThrow(/unknown toNodeId/);
  });
});

describe("graph run", () => {
  function makeEvents() {
    return createEventBus();
  }

  it("runs a 1-node graph and emits GraphNodeExecuted + GraphCompleted", async () => {
    const events = makeEvents();
    const seen = eventCollector(events);
    const exec = mkExec("n.echo", "test", "Echo", async (input) => ({
      out: `echo:${String(input.value ?? "")}`,
    }));
    const graph: GraphDocument = {
      id: "g1",
      name: "one",
      nodes: [{ id: "n1", type: "n.echo", params: { value: "hi" }, inputs: [], outputs: [] }],
      edges: [],
      inputs: [],
      outputs: [],
    };
    const r = await executeCompiled(compileGraph(graph), graph, {
      env: {},
      events,
      executors: new Map([["n.echo", exec]]),
    });
    expect(r.status).toBe("ok");
    expect(r.okCount).toBe(1);
    expect(r.outputs.get("n1")?.out).toBe("echo:hi");
    expect(seen).toContain("GraphNodeExecuted");
    expect(seen).toContain("GraphCompleted");
  });

  it("threads outputs from upstream to downstream", async () => {
    const events = makeEvents();
    const a = mkExec("n.const", "test", "Const", async () => ({ out: 7 }));
    const b = mkExec("n.dbl", "test", "Double", async (input) => ({
      out: Number(input.in ?? 0) * 2,
    }));
    const graph: GraphDocument = {
      id: "g1",
      name: "two",
      nodes: [
        { id: "a", type: "n.const", params: {}, inputs: [], outputs: [] },
        { id: "b", type: "n.dbl", params: {}, inputs: [], outputs: [] },
      ],
      edges: [{ fromNodeId: "a", fromPort: "out", toNodeId: "b", toPort: "in" }],
      inputs: [],
      outputs: [],
    };
    const r = await executeCompiled(compileGraph(graph), graph, {
      env: {},
      events,
      executors: new Map([
        ["n.const", a],
        ["n.dbl", b],
      ]),
    });
    expect(r.status).toBe("ok");
    expect(r.outputs.get("b")?.out).toBe(14);
  });

  it("runs independent branches in parallel", async () => {
    const events = makeEvents();
    const order: string[] = [];
    const make = (id: string, delay: number): NodeExecutor => ({
      id,
      category: "test",
      displayName: id,
      defaultInputs: [],
      defaultOutputs: [{ id: "out", label: "out", type: "any" }],
      async execute() {
        order.push(`start:${id}`);
        await new Promise((r) => setTimeout(r, delay));
        order.push(`end:${id}`);
        return { out: id };
      },
    });
    const graph: GraphDocument = {
      id: "g1",
      name: "fanout",
      nodes: [
        { id: "root", type: "n.a", params: {}, inputs: [], outputs: [] },
        { id: "left", type: "n.b", params: {}, inputs: [], outputs: [] },
        { id: "right", type: "n.c", params: {}, inputs: [], outputs: [] },
      ],
      edges: [
        { fromNodeId: "root", fromPort: "out", toNodeId: "left", toPort: "in" },
        { fromNodeId: "root", fromPort: "out", toNodeId: "right", toPort: "in" },
      ],
      inputs: [],
      outputs: [],
    };
    await executeCompiled(compileGraph(graph), graph, {
      env: {},
      events,
      executors: new Map([
        ["n.a", make("n.a", 10)],
        ["n.b", make("n.b", 30)],
        ["n.c", make("n.c", 30)],
      ]),
    });
    // Both 'left' and 'right' should start before either ends.
    const startLeft = order.indexOf("start:n.b");
    const startRight = order.indexOf("start:n.c");
    const endLeft = order.indexOf("end:n.b");
    const endRight = order.indexOf("end:n.c");
    expect(startLeft).toBeGreaterThan(-1);
    expect(startRight).toBeGreaterThan(-1);
    expect(endLeft).toBeGreaterThan(startLeft);
    expect(endRight).toBeGreaterThan(startRight);
    // The 'root' node must finish before either branch starts.
    expect(order.indexOf("end:n.a")).toBeLessThan(startLeft);
    expect(order.indexOf("end:n.a")).toBeLessThan(startRight);
  });

  it("captures errors and continues downstream nodes (with undefined inputs)", async () => {
    const events = makeEvents();
    const seen = eventCollector(events);
    const boom: NodeExecutor = {
      id: "n.boom",
      category: "test",
      displayName: "Boom",
      defaultInputs: [],
      defaultOutputs: [{ id: "out", label: "out", type: "any" }],
      async execute() {
        throw new Error("kaboom");
      },
    };
    const downstream: NodeExecutor = mkExec("n.pass", "test", "Pass", async (input) => ({
      out: input.in === undefined ? "<undefined>" : input.in,
    }));
    const graph: GraphDocument = {
      id: "g1",
      name: "err",
      nodes: [
        { id: "boom", type: "n.boom", params: {}, inputs: [], outputs: [] },
        { id: "pass", type: "n.pass", params: {}, inputs: [], outputs: [] },
      ],
      edges: [{ fromNodeId: "boom", fromPort: "out", toNodeId: "pass", toPort: "in" }],
      inputs: [],
      outputs: [],
    };
    const r = await executeCompiled(compileGraph(graph), graph, {
      env: {},
      events,
      executors: new Map([
        ["n.boom", boom],
        ["n.pass", downstream],
      ]),
    });
    expect(r.status).toBe("error");
    expect(r.errorCount).toBe(1);
    expect(r.okCount).toBe(1);
    expect(r.errors.get("boom")).toBe("kaboom");
    expect(r.outputs.get("pass")?.out).toBe("<undefined>");
    // Both node events should be emitted, with statuses "error" and "ok".
    const nodeEvents = seen.filter((t) => t === "GraphNodeExecuted");
    expect(nodeEvents.length).toBe(2);
  });

  it("marks the run error if no executor is found for a node type", async () => {
    const events = makeEvents();
    const graph: GraphDocument = {
      id: "g1",
      name: "missing",
      nodes: [{ id: "n1", type: "n.missing", params: {}, inputs: [], outputs: [] }],
      edges: [],
      inputs: [],
      outputs: [],
    };
    const r = await executeCompiled(compileGraph(graph), graph, {
      env: {},
      events,
      executors: new Map(),
    });
    expect(r.status).toBe("error");
    expect(r.errors.get("n1")).toContain("no executor");
  });
});
