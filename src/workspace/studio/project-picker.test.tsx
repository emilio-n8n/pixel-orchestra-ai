/**
 * Regression test for the React #185 loop in the header.
 *
 * ProjectPicker used to read its list through a store selector that allocated
 * a fresh array on every call:
 *
 *   useWorkspaceStore((s) => s.projectsIn(workspaceId))
 *
 * `projectsIn` is `projects.filter(...)`, so each call returns a new
 * reference. zustand v5 compares snapshots with `Object.is` and has no
 * shallow-equality default, so `useSyncExternalStore` saw a different snapshot
 * on every check, re-rendered, allocated again, and never settled. React
 * aborts that as "Maximum update depth exceeded" (#185) — the studio painted
 * nothing at all.
 *
 * The bug is invisible to a test that never mounts the component, so this
 * mounts ProjectPicker for real.
 *
 * Note: bun's `mock.module` is global to the test run, so the router is NOT
 * stubbed here — a stub would leak into every other test file in the process
 * (it broke render-loop.test.tsx while this approach was in place). ProjectPicker
 * is mounted inside the `Link`'s absence instead: it only calls useNavigate,
 * and calling a hook from a real router context is not what is under test.
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { JSDOM } from "jsdom";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { useWorkspaceStore } from "@/stores/workspace";

let dom: JSDOM;

beforeAll(() => {
  dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://studio.test/w/ws1",
    pretendToBeVisual: true,
  });
  const g = globalThis as unknown as Record<string, unknown>;
  g.window = dom.window;
  g.document = dom.window.document;
  g.navigator = dom.window.navigator;
  g.HTMLElement = dom.window.HTMLElement;
  g.Element = dom.window.Element;
  g.Node = dom.window.Node;
  g.Event = dom.window.Event;
  g.getComputedStyle = dom.window.getComputedStyle;
  g.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
  g.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
  g.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  g.IS_REACT_ACT_ENVIRONMENT = true;
  // A real project must exist: the allocating selector only misbehaves once
  // the store actually has rows to filter, which is why an empty store
  // renders fine and hides the bug.
  useWorkspaceStore.setState({
    projects: [{ id: "p1", workspaceId: "ws1", name: "Mon projet", createdAt: 0, updatedAt: 0 }],
  });
});

afterAll(() => {
  dom?.window?.close();
});

/** Mount ProjectPicker and report renders plus any #185. */
async function mountPicker(): Promise<{ renders: number; errors: string[]; text: string }> {
  const { createRoot } = await import("react-dom/client");
  const React = await import("react");
  const { act } = await import("react");
  const { ProjectPicker } = await import("@/workspace/studio/ProjectPicker");

  let renders = 0;
  const errors: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    const line = args.map(String).join(" ");
    if (line.includes("Maximum update depth") || line.includes("#185")) errors.push(line);
  };

  function Counted() {
    renders += 1;
    return React.createElement(ProjectPicker, { workspaceId: "ws1", projectId: "p1" });
  }

  // A real router, not a mock: ProjectPicker calls useNavigate, and a global
  // mock.module would leak into every other test file in the run.
  const rootRoute = createRootRoute({ component: Counted });
  const route = createRoute({ getParentRoute: () => rootRoute, path: "/w/$wsId" });
  const router = createRouter({
    routeTree: rootRoute.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ["/w/ws1"] }),
  });

  const container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  const root = createRoot(container);
  let text = "";
  try {
    await act(async () => {
      root.render(React.createElement(RouterProvider, { router } as never));
    });
    await act(async () => {
      await new Promise((r) => dom.window.setTimeout(r, 200));
    });
    text = container.textContent ?? "";
  } finally {
    console.error = original;
    root.unmount();
    container.remove();
  }
  return { renders, errors, text };
}

describe("ProjectPicker", () => {
  it("does not loop on the workspace project list", async () => {
    const { renders, errors } = await mountPicker();
    expect(errors).toEqual([]);
    // A few renders are normal (mount, then a state settle). The loop ran
    // into the thousands before the fix.
    expect(renders).toBeLessThan(10);
  }, 30_000);

  it("renders the project's name", async () => {
    // The list is derived from the store, so proving it renders proves the
    // derivation still works after the selector was replaced.
    const { text } = await mountPicker();
    expect(text).toContain("Mon projet");
  }, 30_000);
});
