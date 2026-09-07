import type { PluginManifest } from "@/kernel";
import { HelloPanel } from "./HelloPanel";
import { HelloInspector } from "./HelloInspector";
import { HelloBottom } from "./HelloBottom";
import { HelloSidebar } from "./HelloSidebar";
import { UI_LABELS } from "@/lib/ui/labels";

export const helloPlugin: PluginManifest = {
  id: "com.lilium.builtin.hello",
  name: "Bonjour",
  version: "0.1.0",
  engines: { lilium: "^0.1.0" },
  description:
    "Plugin de référence — exerce chaque emplacement (centre, barre, inspecteur, bas), une commande et un écouteur d’évènements.",
  contributes: {
    panels: [
      { id: "hello.center", title: "Bienvenue", slot: "center", component: HelloPanel, order: 0 },
      { id: "hello.sidebar", title: "Bonjour", slot: "sidebar", component: HelloSidebar, order: 0 },
      {
        id: "hello.inspector",
        title: "Bonjour",
        slot: "inspector",
        component: HelloInspector,
        order: 100,
      },
      { id: "hello.bottom", title: "Journal Bonjour", slot: "bottom", component: HelloBottom, order: 0 },
    ],
    commands: [
      {
        id: "hello.ping",
        title: "Bonjour : Ping du bus d’évènements",
        category: "Débogage",
        run: (ctx) => {
          ctx.events.emit({ type: "Custom.hello.ping", payload: { at: Date.now() } });
          ctx.ui.notify(UI_LABELS.toasts.pingEmis, "success");
        },
      },
      {
        id: "hello.flurry",
        title: "Bonjour : Émettre 5 évènements",
        category: "Débogage",
        run: (ctx) => {
          for (let i = 0; i < 5; i++) {
            ctx.events.emit({ type: "Custom.hello.ping", payload: { at: Date.now(), i } });
          }
          ctx.ui.notify(UI_LABELS.toasts.pingsEmis, "info");
        },
      },
    ],
  },
  activate: (ctx) => {
    ctx.logger.info("hello plugin activated");
    ctx.events.on("Custom.hello.ping", (e) => ctx.logger.info("received ping", e));
  },
};
