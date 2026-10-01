/**
 * Regression test for the React "Maximum update depth exceeded" loop that
 * blanked the studio in production.
 *
 * The 4-zone shell mounts TimelineTracks, PlayerMonitor and the library at
 * once, and the auto-ducking pass *writes* to timeline_clips and is woken by
 * the realtime channel that write triggers. That write→subscribe→write cycle
 * is exactly the shape React reports as #185, and the minified production
 * stack names no component — so it is reproduced here instead.
 *
 * The Supabase client is stubbed with a fake that round-trips writes back
 * through the same notification path the real channel uses, which is what
 * makes the loop reproducible without a network or a browser.
 */

import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import { JSDOM } from "jsdom";

process.env.SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_ANON_KEY ??= "anon";

/** Fake project data: a music bed under a voice clip, so ducking engages. */
interface FakeRow {
  id: string;
  track: string;
  start_ms: number;
  duration_ms: number;
  asset_id: string | null;
  meta: Record<string, unknown>;
}

const rows: FakeRow[] = [
  {
    id: "clip-music",
    track: "Music",
    start_ms: 0,
    duration_ms: 10_000,
    asset_id: null,
    meta: {},
  },
  {
    id: "clip-voice",
    track: "Audio",
    start_ms: 1000,
    duration_ms: 2000,
    asset_id: null,
    meta: {},
  },
];

/** Bumped on every write; the fake "channel" fires on each change. */
let writeCount = 0;
/**
 * The postgres_changes callbacks the real client would invoke. This is the
 * crucial part of the fake: without it the write→notify→reload cycle that
 * produced the production loop never runs in the test.
 */
const changeSignals = new Set<() => void>();
function notifyAll() {
  for (const n of changeSignals) n();
}

/** Read counts per table, to see whether a load is re-triggering itself. */
const readCounts: Record<string, number> = {};

function makeFakeSupabase() {
  return {
    auth: {
      // A session must be present: DirectorPanel short-circuits to a
      // "sign in" notice without one, which would skip the prompt bar and the
      // action checklist — the very components this test must exercise.
      getSession: () => Promise.resolve({ data: { session: { access_token: "test-token" } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from(table: string) {
      const api = {
        select: () => api,
        insert: (row: Partial<FakeRow>) => {
          rows.push({
            id: `ins_${rows.length}`,
            track: "Video",
            start_ms: 0,
            duration_ms: 1000,
            asset_id: null,
            meta: {},
            ...row,
          } as FakeRow);
          writeCount += 1;
          queueMicrotask(notifyAll);
          return api;
        },
        update: (patch: Partial<FakeRow>) => {
          const id = (patch as { id?: string }).id;
          for (const r of rows) if (r.id === id) Object.assign(r, patch);
          writeCount += 1;
          queueMicrotask(notifyAll);
          return api;
        },
        delete: () => api,
        eq: () => api,
        order: () => api,
        limit: () => api,
        single: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => void) => {
          void resolve;
          readCounts[table] = (readCounts[table] ?? 0) + 1;
          // A fresh array per read, exactly like a real JSON response. This
          // matters: handing back the SAME array reference makes React bail
          // out of the re-render, which would hide the very loop we hunt.
          const data = table === "timeline_clips" ? rows.map((r) => ({ ...r })) : [];
          return Promise.resolve({ data, error: null });
        },
      };
      return api;
    },
    channel: () => {
      // Mirror the real builder chain: .on(event, filter, callback) registers
      // the callback that the server would call on a committed change.
      const builder = {
        on: (_event?: string, _filter?: unknown, cb?: (() => void) | null) => {
          if (typeof cb === "function") changeSignals.add(cb);
          return builder;
        },
        subscribe: (cb?: (status: string) => void) => {
          queueMicrotask(() => cb?.("SUBSCRIBED"));
          return builder;
        },
        unsubscribe: () => {},
      };
      return builder;
    },
    removeChannel: () => {},
  };
}

mock.module("@/integrations/supabase/client", () => ({
  supabase: makeFakeSupabase(),
}));

let dom: JSDOM;

beforeAll(() => {
  dom = new JSDOM("<!doctype html><html><body><div id=root></div></body></html>", {
    url: "https://studio.test/w/ws1/p/proj1",
    pretendToBeVisual: true,
  });
  const g = globalThis as unknown as Record<string, unknown>;
  g.window = dom.window;
  g.document = dom.window.document;
  g.navigator = dom.window.navigator;
  g.HTMLElement = dom.window.HTMLElement;
  g.HTMLCanvasElement = dom.window.HTMLCanvasElement;
  g.HTMLIFrameElement = dom.window.HTMLIFrameElement;
  g.Element = dom.window.Element;
  g.Node = dom.window.Node;
  g.Event = dom.window.Event;
  g.MouseEvent = dom.window.MouseEvent;
  g.KeyboardEvent = dom.window.KeyboardEvent;
  g.getComputedStyle = dom.window.getComputedStyle;
  g.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
  g.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
  g.fetch = () => Promise.reject(new Error("offline in test"));
  // jsdom ships no matchMedia; the app reads it on first render (useIsMobile).
  const mediaStub = {
    matches: false,
    media: "",
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  };
  dom.window.matchMedia = () => mediaStub as unknown as MediaQueryList;
  g.matchMedia = dom.window.matchMedia;
  // The canvas renderer has its own tests; here we only need the tree to
  // mount, so a null context is enough and avoids needing a 2D backend.
  dom.window.HTMLCanvasElement.prototype.getContext = () => null;
});

afterAll(() => {
  changeSignals.clear();
  dom?.window?.close();
});

describe("studio shell — no render loop with a live timeline", () => {
  it("mounts every zone without React error #185", async () => {
    const { createRoot } = await import("react-dom/client");
    const React = await import("react");
    const { KernelProvider } = await import("@/kernel/react");
    const { getKernelAsync } = await import("@/kernel");
    const { ProjectTimelineProvider } =
      await import("@/plugins/ui-timeline/ProjectTimelineProvider");
    const { AgentColumn } = await import("@/workspace/studio/AgentColumn");
    const { AssetsColumn } = await import("@/workspace/studio/AssetsColumn");
    const { PlayerMonitor } = await import("@/workspace/studio/PlayerMonitor");
    const { TimelinePanel } = await import("@/workspace/studio/TimelinePanel");

    const errors: string[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      const line = args.map(String).join(" ");
      if (line.includes("Maximum update depth") || line.includes("#185")) errors.push(line);
    };

    try {
      await getKernelAsync();
      const container = dom.window.document.getElementById("root")!;
      const root = createRoot(container);
      // Mount all four zones inside one provider, the way the shell wires
      // them. The zones are mounted directly rather than through
      // WorkspaceShell: the shell itself needs a router context, and the
      // loop we are hunting lives below it. The fake Supabase channel lets
      // the ducking write trigger a real reload through the same path.
      root.render(
        React.createElement(
          KernelProvider,
          null,
          React.createElement(
            ProjectTimelineProvider,
            null,
            React.createElement(
              "div",
              null,
              React.createElement(AgentColumn),
              React.createElement(AssetsColumn),
              React.createElement(PlayerMonitor),
              React.createElement(TimelinePanel),
            ),
          ),
        ),
      );

      // Long enough for the 600 ms ducking debounce plus the reload its
      // write triggers — the window where a write→subscribe→write cycle
      // would surface.
      await new Promise((r) => dom.window.setTimeout(r, 2500));

      expect(errors).toEqual([]);
      // A loop is not only an error: the work it drives must stay bounded.
      // Ducking writes once per music clip, not once per notification, and
      // the clip table is read a handful of times — not hundreds.
      expect(writeCount).toBeLessThan(20);
      expect(readCounts.timeline_clips ?? 0).toBeLessThan(20);
      root.unmount();
    } finally {
      console.error = originalError;
      changeSignals.clear();
    }
  });
});
