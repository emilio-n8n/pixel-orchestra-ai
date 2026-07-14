import type { PluginManifest } from "@/kernel";
import { AgentPanel } from "./AgentPanel";

export const agentCopilotPlugin: PluginManifest = {
  id: "com.lilium.builtin.agent-copilot",
  name: "Agent",
  version: "0.1.0",
  engines: { lilium: "^0.1.0" },
  description: "AI copilot — describe what you want, the agent builds the graph.",
  contributes: {
    panels: [
      {
        id: "agent.inspector",
        title: "Agent",
        slot: "inspector",
        component: AgentPanel,
        order: 200,
      },
    ],
  },
};
