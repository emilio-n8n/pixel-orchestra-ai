/**
 * Regression test for the studio's panel layout feedback loop.
 *
 * The shipped wiring feeds `defaultSize` from a value that `onResize` also
 * writes. react-resizable-panels recomputes a group's layout whenever a
 * panel's `defaultSize` changes, and re-notifies `onResize` from that
 * recompute, so a live `defaultSize` is a cycle: resize → store → new
 * defaultSize → recompute → onResize → … React aborts it as "Maximum update
 * depth exceeded" (#185) and the studio never paints.
 *
 * The cycle is invisible under jsdom, which reports every panel as 0×0 and
 * keeps RRP on its percentage path where `100 - bottom` lands exactly on
 * RRP's own number. It appears with real pixels, where RRP reports
 * fractional sizes that never coincide. So this test cannot observe the bug
 * fail; it guards the *invariant* instead — the sizes RRP is given must not
 * come from the store `onResize` writes to — which is checkable statically
 * and holds regardless of the environment.
 *
 * Keep in sync with the <PanelGroup> tree in WorkspaceShell.
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { usePanelStore } from "@/stores/panels";

let dom: JSDOM;

beforeAll(() => {
  dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://studio.test/w/ws1/p/proj1",
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
  // react-resizable-panels registers listeners with an AbortSignal; jsdom's
  // EventTarget rejects a signal that is not one of *its* AbortSignal
  // instances, so jsdom's has to shadow Node's global.
  g.AbortSignal = dom.window.AbortSignal;
  g.AbortController = dom.window.AbortController;
  g.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  g.IS_REACT_ACT_ENVIRONMENT = true;
  // The persisted layout is what a returning user actually loads; jsdom gives
  // us an empty localStorage, which is the one case that never loops.
  dom.window.localStorage.setItem(
    "lilium.panels.v2",
    JSON.stringify({
      state: { layout: { agent: 25, assets: 25, player: 50, bottom: 38 } },
      version: 0,
    }),
  );
});

afterAll(() => {
  dom?.window?.close();
});

/** Mirrors WorkspaceShell after the fix: sizes snapshotted once, never fed back. */
function StudioPanels({ liveSizes }: { liveSizes: boolean }) {
  // liveSizes=true is only needed to render the previous wiring; the shipped
  // wiring never subscribes to the store at all, which is the point.
  const layout = usePanelStore((s) => (liveSizes ? s.layout : INITIAL_SIZES));
  const setLayout = usePanelStore((s) => s.setLayout);
  const size = layout;
  return (
    <PanelGroup direction="vertical" autoSaveId="lilium.v2.v">
      <Panel defaultSize={100 - size.bottom} minSize={25}>
        <PanelGroup direction="horizontal" autoSaveId="lilium.v2.h">
          <Panel
            defaultSize={size.agent}
            minSize={18}
            maxSize={45}
            onResize={(s) => setLayout({ agent: s })}
          >
            <span>agent</span>
          </Panel>
          <PanelResizeHandle />
          <Panel
            defaultSize={size.assets}
            minSize={16}
            maxSize={45}
            onResize={(s) => setLayout({ assets: s })}
          >
            <span>assets</span>
          </Panel>
          <PanelResizeHandle />
          <Panel defaultSize={size.player} minSize={30}>
            <span>player</span>
          </Panel>
        </PanelGroup>
      </Panel>
      <PanelResizeHandle />
      <Panel
        defaultSize={size.bottom}
        minSize={15}
        maxSize={75}
        onResize={(s) => setLayout({ bottom: s })}
      >
        <span>timeline</span>
      </Panel>
    </PanelGroup>
  );
}

/** What the shipped wiring snapshots once at mount. */
const INITIAL_SIZES = { agent: 25, assets: 25, player: 50, bottom: 38 };

async function mountPanels(liveSizes: boolean): Promise<string[]> {
  const { createRoot } = await import("react-dom/client");
  const React = await import("react");
  const { act } = await import("react");

  const errors: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    const line = args.map(String).join(" ");
    if (line.includes("Maximum update depth") || line.includes("#185")) errors.push(line);
  };

  const container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(React.createElement(StudioPanels, { liveSizes }));
    });
    // Long enough for a resize→store→defaultSize→re-validate cycle to settle
    // (or, if it exists, to blow React's nested-update budget).
    await act(async () => {
      await new Promise((r) => dom.window.setTimeout(r, 400));
    });
  } finally {
    console.error = original;
    root.unmount();
    container.remove();
  }
  return errors;
}

describe("studio panel layout wiring", () => {
  it("does not loop with defaultSize snapshotted once", async () => {
    expect(await mountPanels(false)).toEqual([]);
  }, 30_000);

  it("does not loop with a live defaultSize under jsdom either", async () => {
    // Expected to pass: jsdom reports every panel as 0×0, so RRP stays on its
    // percentage path and the cycle cannot manifest. Kept as the control for
    // the case above — if this one ever starts throwing, the environment
    // changed rather than the wiring, and the first test's guarantee weakens.
    expect(await mountPanels(true)).toEqual([]);
  }, 30_000);
});

describe("WorkspaceShell panel wiring", () => {
  const src = readFileSync(new URL("../shell/WorkspaceShell.tsx", import.meta.url), "utf8");

  it("never derives defaultSize from the store onResize writes to", () => {
    // The invariant that actually prevents the loop. `s.layout` read straight
    // in a defaultSize prop is the cycle; snapshotting it once via
    // useState/useRef is not. This is checkable without a browser, which the
    // runtime loop is not.
    const liveReads = [...src.matchAll(/defaultSize=\{([^}]*)\}/g)]
      .map((m) => m[1])
      .filter((expr) => /(?<!initial)Layout\./.test(expr) || /\blayout\./.test(expr));
    expect(liveReads).toEqual([]);
  });

  it("keeps defaultSize bound to the one-time snapshot", () => {
    // Guards the other half: a snapshot only helps if it is actually a
    // snapshot. useState with an initializer, not a plain const.
    expect(src).toMatch(/useState\(\(\)\s*=>\s*usePanelStore\.getState\(\)\.layout\s*\)/);
  });

  it("still persists sizes through onResize", () => {
    // The store is not dead weight: it keeps the user's choice for the next
    // mount and for the mobile studio. Only feeding it back was wrong.
    const onResize = src.match(/onResize=\{\(size\) => setLayout\(\{ \w+: size \}\)\}/g) ?? [];
    expect(onResize.length).toBe(3);
  });
});
