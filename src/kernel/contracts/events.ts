// Kernel event contracts. All state mutations flow through named events.
// This file is the source of truth for the event union — plugins import it.

export type EventBase = {
  id: string;
  ts: number;
  actor?: string;
  projectId?: string;
  workspaceId?: string;
};

export type AssetCreated = EventBase & {
  type: "AssetCreated";
  assetId: string;
  kind: string;
  name: string;
};
export type AssetUpdated = EventBase & { type: "AssetUpdated"; assetId: string };
export type AssetDeleted = EventBase & { type: "AssetDeleted"; assetId: string };

export type JobQueued = EventBase & { type: "JobQueued"; jobId: string };
export type JobStarted = EventBase & { type: "JobStarted"; jobId: string };
export type JobProgress = EventBase & { type: "JobProgress"; jobId: string; progress: number; note?: string };
export type JobFinished = EventBase & { type: "JobFinished"; jobId: string; resultAssetIds: string[] };
export type JobFailed = EventBase & { type: "JobFailed"; jobId: string; error: string };

export type ConnectorRegistered = EventBase & { type: "ConnectorRegistered"; connectorId: string; kind: string };
export type ConnectorOnline = EventBase & { type: "ConnectorOnline"; connectorId: string };
export type ConnectorOffline = EventBase & { type: "ConnectorOffline"; connectorId: string };

export type WorkspaceChanged = EventBase & { type: "WorkspaceChanged"; workspaceId: string };
export type ProjectOpened = EventBase & { type: "ProjectOpened"; projectId: string };

export type PluginActivated = EventBase & { type: "PluginActivated"; pluginId: string };
export type PluginError = EventBase & { type: "PluginError"; pluginId: string; error: string };

// Extensible: plugins may emit custom events with type = "Custom.<ns>.<name>".
export type CustomEvent = EventBase & { type: `Custom.${string}`; payload?: unknown };

export type LiliumEvent =
  | AssetCreated | AssetUpdated | AssetDeleted
  | JobQueued | JobStarted | JobProgress | JobFinished | JobFailed
  | ConnectorRegistered | ConnectorOnline | ConnectorOffline
  | WorkspaceChanged | ProjectOpened
  | PluginActivated | PluginError
  | CustomEvent;

export type EventType = LiliumEvent["type"];
export type EventOf<T extends EventType> = Extract<LiliumEvent, { type: T }>;

export type EventHandler<T extends EventType = EventType> = (event: EventOf<T>) => void | Promise<void>;
export type EventPattern = EventType | "*" | `${string}.*` | `*.${string}`;