import type { PluginManifest } from "@/kernel";
import { HelloPanel } from "./HelloPanel";
import { HelloInspector } from "./HelloInspector";
import { HelloBottom } from "./HelloBottom";
import { HelloSidebar } from "./HelloSidebar";

export const helloPlugin: PluginManifest = {
  id: "com.lilium.builtin.hello",
  name: "Hello",
  version: "0.1.0",
  engines: { lilium: "^0.1.0" },
  description:
    "Reference plugin — exercises every panel slot (center, sidebar, inspector, bottom), a command, and an event listener.",
  contributes: {
    panels: [
      { id: "hello.center", title: "Welcome", slot: "center", component: HelloPanel, order: 0 },
      { id: "hello.sidebar", title: "Hello", slot: "sidebar", component: HelloSidebar, order: 0 },
      {
        id: "hello.inspector",
        title: "Hello",
        slot: "inspector",
        component: HelloInspector,
        order: 100,
      },
      { id: "hello.bottom", title: "Hello log", slot: "bottom", component: HelloBottom, order: 0 },
    ],
    commands: [
      {
        id: "hello.ping",
        title: "Hello: Ping event bus",
        category: "Debug",
        run: (ctx) => {
          ctx.events.emit({ type: "Custom.hello.ping", payload: { at: Date.now() } });
          ctx.ui.notify("Ping emitted", "success");
        },
      },
      {
        id: "hello.flurry",
        title: "Hello: Emit 5 events",
        category: "Debug",
        run: (ctx) => {
          for (let i = 0; i < 5; i++) {
            ctx.events.emit({ type: "Custom.hello.ping", payload: { at: Date.now(), i } });
          }
          ctx.ui.notify("Emitted 5 pings", "info");
        },
      },
    ],
  },
  activate: (ctx) => {
    ctx.logger.info("hello plugin activated");
    ctx.events.on("Custom.hello.ping", (e) => ctx.logger.info("received ping", e));
  },
};
