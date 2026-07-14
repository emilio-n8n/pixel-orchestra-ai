// Agent copilot — minimal chat panel. The agent is built-in but the
// AI integration (via Lovable AI Gateway) is stubbed until the user
// provides an API key. The panel shows a chat-like interface; messages
// are processed locally for now (phase 10 will add real LLM inference).

import { useState, useCallback } from "react";

export function AgentPanel() {
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; text: string }>>([]);
  const [input, setInput] = useState("");

  const send = useCallback(async () => {
    if (!input.trim()) return;
    const userMsg = input.trim();
    setInput("");
    setMessages((m) => [...m, { role: "user", text: userMsg }]);
    // Stub: reply with the plan description. Phase 10 will call
    // the AI Gateway with Lovable API key.
    setTimeout(() => {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: `I understand you want to "${userMsg}". In this phase of the platform, I can help you:\n• Create characters (via Characters panel)\n• Add Gradio connectors (via Connectors panel)\n• Build and run node graphs (via Node Graph panel)\n• Import and view assets (via Library panel)\n\nPhase 10 will make me a real agent wired to the LLM.`,
        },
      ]);
    }, 400);
  }, [input]);

  return (
    <div className="flex h-full flex-col overflow-hidden border-b border-[var(--line)] bg-[var(--surface-2)] text-xs text-[var(--text-muted)]">
      <div className="flex h-8 shrink-0 items-center border-b border-[var(--line)] px-3 text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--text-dim)]">
        Agent Copilot
      </div>
      <div className="flex-1 overflow-auto p-3 text-[11px] leading-relaxed">
        {messages.length === 0 ? (
          <div className="text-[var(--text-dim)]">
            Describe what you want to create. Example: "Add a scene with a cyberpunk detective in
            neon Tokyo."
          </div>
        ) : (
          messages.map((m, i) => (
            <div
              key={i}
              className={`mb-2 ${m.role === "assistant" ? "text-[var(--text)]" : "text-[var(--accent)]"}`}
            >
              <span className="text-[9px] font-medium uppercase tracking-widest text-[var(--text-dim)]">
                {m.role}
              </span>
              <div className="mt-0.5 whitespace-pre-wrap">{m.text}</div>
            </div>
          ))
        )}
      </div>
      <div className="flex shrink-0 gap-1 border-t border-[var(--line)] p-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Type a message…"
          className="flex-1 rounded border border-[var(--line)] bg-[var(--surface-3)] px-2 py-1 text-[11px] outline-none"
        />
        <button
          onClick={send}
          disabled={!input.trim()}
          className="rounded bg-[var(--accent)] px-2 text-[11px] text-[var(--accent-fg)] disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
