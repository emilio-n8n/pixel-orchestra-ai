import { describe, it, expect, beforeEach } from "bun:test";
import { createRegistry } from "./registry";

describe("registry", () => {
  let reg: ReturnType<typeof createRegistry>;

  beforeEach(() => {
    reg = createRegistry();
  });

  it("stores and retrieves contributions by plugin", () => {
    reg.addPanel("p1", { id: "a", title: "A", slot: "center", component: () => null });
    reg.addCommand("p1", { id: "c1", title: "Cmd 1", run: () => {} });
    expect(reg.panels.length).toBe(1);
    expect(reg.commands.length).toBe(1);
    expect(reg.panels[0].pluginId).toBe("p1");
  });

  it("orders panels by `order` then by insertion", () => {
    reg.addPanel("p", { id: "b", title: "B", slot: "center", component: () => null, order: 5 });
    reg.addPanel("p", { id: "a", title: "A", slot: "center", component: () => null, order: 1 });
    reg.addPanel("p", { id: "c", title: "C", slot: "center", component: () => null, order: 10 });
    const ids = reg.panelsForSlot("center").map((p) => p.id);
    expect(ids).toEqual(["a", "b", "c"]);
  });

  it("filters panels by slot", () => {
    reg.addPanel("p", { id: "x", title: "X", slot: "center", component: () => null });
    reg.addPanel("p", { id: "y", title: "Y", slot: "inspector", component: () => null });
    expect(reg.panelsForSlot("center").map((p) => p.id)).toEqual(["x"]);
    expect(reg.panelsForSlot("inspector").map((p) => p.id)).toEqual(["y"]);
  });

  it("picks the highest-priority viewer for an asset kind", () => {
    reg.addViewer("p", { id: "v1", accepts: ["image"], component: () => null, priority: 5 });
    reg.addViewer("p", { id: "v2", accepts: ["image"], component: () => null, priority: 10 });
    expect(reg.viewerFor("image")?.id).toBe("v2");
  });

  it("removes all contributions belonging to a plugin", () => {
    reg.addPanel("p1", { id: "x", title: "X", slot: "center", component: () => null });
    reg.addCommand("p1", { id: "c", title: "C", run: () => {} });
    reg.addPanel("p2", { id: "y", title: "Y", slot: "center", component: () => null });
    reg.removeByPlugin("p1");
    expect(reg.panels.map((p) => p.id)).toEqual(["y"]);
    expect(reg.commands.length).toBe(0);
  });

  it("notifies subscribers on change", () => {
    let calls = 0;
    reg.subscribe(() => calls++);
    reg.addPanel("p", { id: "x", title: "X", slot: "center", component: () => null });
    reg.addCommand("p", { id: "c", title: "C", run: () => {} });
    expect(calls).toBe(2);
  });
});
