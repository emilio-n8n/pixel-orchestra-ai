import type {
  CommandContribution,
  ConnectorContribution,
  NodeContribution,
  PanelContribution,
  ViewerContribution,
} from "./contracts/plugin";

export interface Registry {
  panels: ReadonlyArray<PanelContribution & { pluginId: string }>;
  commands: ReadonlyArray<CommandContribution & { pluginId: string }>;
  connectors: ReadonlyArray<ConnectorContribution & { pluginId: string }>;
  viewers: ReadonlyArray<ViewerContribution & { pluginId: string }>;
  nodes: ReadonlyArray<NodeContribution & { pluginId: string }>;

  panelsForSlot(slot: PanelContribution["slot"]): ReadonlyArray<PanelContribution & { pluginId: string }>;
  viewerFor(kind: string): (ViewerContribution & { pluginId: string }) | undefined;
  commandById(id: string): (CommandContribution & { pluginId: string }) | undefined;

  addPanel(pluginId: string, c: PanelContribution): void;
  addCommand(pluginId: string, c: CommandContribution): void;
  addConnector(pluginId: string, c: ConnectorContribution): void;
  addViewer(pluginId: string, c: ViewerContribution): void;
  addNode(pluginId: string, c: NodeContribution): void;
  removeByPlugin(pluginId: string): void;

  subscribe(listener: () => void): () => void;
}

export function createRegistry(): Registry {
  const panels: Array<PanelContribution & { pluginId: string }> = [];
  const commands: Array<CommandContribution & { pluginId: string }> = [];
  const connectors: Array<ConnectorContribution & { pluginId: string }> = [];
  const viewers: Array<ViewerContribution & { pluginId: string }> = [];
  const nodes: Array<NodeContribution & { pluginId: string }> = [];
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());

  return {
    get panels() { return panels; },
    get commands() { return commands; },
    get connectors() { return connectors; },
    get viewers() { return viewers; },
    get nodes() { return nodes; },

    panelsForSlot(slot) {
      return panels
        .filter((p) => p.slot === slot)
        .slice()
        .sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
    },
    viewerFor(kind) {
      return viewers
        .filter((v) => v.accepts.includes(kind))
        .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0];
    },
    commandById(id) {
      return commands.find((c) => c.id === id);
    },

    addPanel(pluginId, c) { panels.push({ ...c, pluginId }); notify(); },
    addCommand(pluginId, c) { commands.push({ ...c, pluginId }); notify(); },
    addConnector(pluginId, c) { connectors.push({ ...c, pluginId }); notify(); },
    addViewer(pluginId, c) { viewers.push({ ...c, pluginId }); notify(); },
    addNode(pluginId, c) { nodes.push({ ...c, pluginId }); notify(); },

    removeByPlugin(pluginId) {
      for (const arr of [panels, commands, connectors, viewers, nodes]) {
        for (let i = arr.length - 1; i >= 0; i--) if (arr[i].pluginId === pluginId) arr.splice(i, 1);
      }
      notify();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}