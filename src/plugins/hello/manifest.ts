import type { PluginManifest } from "@/kernel";
import { HelloPanel } from "./HelloPanel";

export const helloPlugin: PluginManifest = {
  id: "com.lilium.builtin.hello",
  name: "Hello",
  version: "0.1.0",
  engines: { lilium: "^0.1.0" },
  description: "Reference plugin — contributes a center panel, a command, and listens to events.",
  contributes: {
    panels: [
      { id: "hello.panel", title: "Welcome", slot: "center", component: HelloPanel, order: 0 },
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
    ],
  },
  activate: (ctx) => {
    ctx.logger.info("hello plugin activated");
    ctx.events.on("Custom.hello.ping", (e) => ctx.logger.info("received ping", e));
  },
};