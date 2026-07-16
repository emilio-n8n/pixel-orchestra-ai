import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useState } from "react";
import { useLibraryProject } from "@/plugins/library/project";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export function DirectorPanel() {
  const pid = useLibraryProject();
  const [input, setInput] = useState("");
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setToken(data.session?.access_token ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) =>
      setToken(s?.access_token ?? null),
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/director",
      body: { projectId: pid },
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    }),
  });

  const busy = status === "streaming" || status === "submitted";

  if (!pid) return <div className="p-6 text-sm text-[var(--text-muted)]">No project.</div>;
  if (!token)
    return (
      <div className="p-6 text-sm text-[var(--text-muted)]">
        Sign in to use the Director. <a href="/auth" className="underline">Sign in</a>
      </div>
    );

  return (
    <div className="flex h-full flex-col bg-[var(--surface-1)]">
      <div className="flex h-9 shrink-0 items-center border-b border-[var(--line)] px-3 text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--text-dim)]">
        Director
      </div>
      <div className="flex-1 space-y-3 overflow-auto p-4 text-sm">
        {messages.length === 0 && (
          <div className="text-[var(--text-muted)]">
            Ask the Director to build a scene. Example: "Create a 3-shot opening: sunset over
            mountains, a lone rider, a title card 'LILIUM'. Add narration."
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className="rounded-md border border-[var(--line)] bg-[var(--surface-2)] p-3">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-[var(--text-dim)]">
              {m.role}
            </div>
            {m.parts.map((p, i) => {
              if (p.type === "text") return <div key={i} className="whitespace-pre-wrap">{p.text}</div>;
              if (typeof p.type === "string" && p.type.startsWith("tool-"))
                return (
                  <div key={i} className="mt-1 rounded bg-[var(--surface-3)] px-2 py-1 text-[11px] text-[var(--text-muted)]">
                    ⚙ {p.type.replace("tool-", "")}
                  </div>
                );
              return null;
            })}
          </div>
        ))}
        {error && <div className="text-red-400">{String(error.message)}</div>}
      </div>
      <form
        className="flex shrink-0 gap-2 border-t border-[var(--line)] p-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!input.trim() || busy) return;
          sendMessage({ text: input });
          setInput("");
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Direct the AI…"
          className="flex-1 rounded-md border border-[var(--line)] bg-[var(--surface-2)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
        />
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "…" : "Send"}
        </Button>
      </form>
    </div>
  );
}