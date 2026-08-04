import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef, useState } from "react";
import { useLibraryProject } from "@/plugins/library/project";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Settings, History, Plus, Trash2 } from "lucide-react";
import { useDirectorStore, OPENCODE_GO_MODELS } from "./store";
import type { DirectorModel } from "@/lib/models/catalog";

export function DirectorPanel() {
  const pid = useLibraryProject();
  const [input, setInput] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const apiKey = useDirectorStore((s) => s.apiKey);
  const model = useDirectorStore((s) => s.model);
  const showSettings = useDirectorStore((s) => s.showSettings);
  const customModel = useDirectorStore((s) => s.customModel);
  const setApiKey = useDirectorStore((s) => s.setApiKey);
  const setModel = useDirectorStore((s) => s.setModel);
  const setShowSettings = useDirectorStore((s) => s.setShowSettings);
  const setCustomModel = useDirectorStore((s) => s.setCustomModel);

  const cloudflareAccountId = useDirectorStore((s) => s.cloudflareAccountId);
  const cloudflareApiKey = useDirectorStore((s) => s.cloudflareApiKey);
  const groqApiKey = useDirectorStore((s) => s.groqApiKey);
  const customModels = useDirectorStore((s) => s.customModels);
  const setCloudflareAccountId = useDirectorStore((s) => s.setCloudflareAccountId);
  const setCloudflareApiKey = useDirectorStore((s) => s.setCloudflareApiKey);
  const setGroqApiKey = useDirectorStore((s) => s.setGroqApiKey);
  const addCustomModel = useDirectorStore((s) => s.addCustomModel);
  const removeCustomModel = useDirectorStore((s) => s.removeCustomModel);

  const conversationsByProject = useDirectorStore((s) => s.conversationsByProject);
  const currentByProject = useDirectorStore((s) => s.currentByProject);
  const conversations = pid ? conversationsByProject[pid] ?? [] : [];
  const currentId = pid ? currentByProject[pid] ?? null : null;
  const setMessagesStore = useDirectorStore((s) => s.setMessages);
  const createConversation = useDirectorStore((s) => s.createConversation);
  const setCurrentConversation = useDirectorStore((s) => s.setCurrentConversation);
  const deleteConversation = useDirectorStore((s) => s.deleteConversation);

  // Guards the store-sync effect during conversation/project switches,
  // so stale useChat messages never overwrite the target conversation.
  const hydratingRef = useRef(false);
  const hydrateTimerRef = useRef<number | null>(null);
  function markHydrating() {
    hydratingRef.current = true;
    if (hydrateTimerRef.current != null) window.clearTimeout(hydrateTimerRef.current);
    hydrateTimerRef.current = window.setTimeout(() => {
      hydratingRef.current = false;
      hydrateTimerRef.current = null;
    }, 150);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setToken(data.session?.access_token ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) =>
      setToken(s?.access_token ?? null),
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  const effectiveModel = model === "__custom__" ? customModel : model;

  const { messages, sendMessage, status, error, setMessages } = useChat({
    id: currentId ?? "new",
    transport: new DefaultChatTransport({
      api: "/api/director",
      body: {
        projectId: pid,
        apiKey,
        model: effectiveModel,
        customModels,
        cloudflareAccountId,
        cloudflareApiKey,
        groqApiKey,
      },
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    }),
  });

  const busy = status === "streaming" || status === "submitted";

  // Ensure a conversation exists on first mount for this project
  useEffect(() => {
    if (!pid) return;
    const s = useDirectorStore.getState();
    const hasAny = (s.conversationsByProject[pid] ?? []).length > 0;
    if (!s.currentByProject[pid] && !hasAny) {
      createConversation(pid);
    }
  }, [pid, currentId, conversations.length, createConversation]);

  // Hydrate useChat when switching conversations / projects
  useEffect(() => {
    if (!pid || !currentId) return;
    const conv = (useDirectorStore.getState().conversationsByProject[pid] ?? []).find(
      (c) => c.id === currentId,
    );
    if (!conv) return;
    markHydrating();
    setMessages(conv.messages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid, currentId]);

  // Sync messages from useChat to the store
  useEffect(() => {
    if (!pid || !currentId) return;
    if (hydratingRef.current) return;
    setMessagesStore(pid, messages);
  }, [messages, pid, currentId, setMessagesStore]);

  function handleNewConversation() {
    if (!pid) return;
    createConversation(pid);
    markHydrating();
    setMessages([]);
    setShowHistory(false);
  }

  function handleSwitchConversation(id: string) {
    if (!pid) return;
    if (id === currentId) {
      setShowHistory(false);
      return;
    }
    markHydrating();
    setCurrentConversation(pid, id);
    setShowHistory(false);
  }

  function handleDeleteConversation(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!pid) return;
    if (!confirm("Delete this conversation?")) return;
    deleteConversation(pid, id);
    markHydrating();
  }

  const currentTitle = conversations.find((c) => c.id === currentId)?.title ?? "Director";

  if (!pid) return <div className="p-6 text-sm text-[var(--text-muted)]">No project.</div>;
  if (!token)
    return (
      <div className="p-6 text-sm text-[var(--text-muted)]">
        Sign in to use the Director. <a href="/auth" className="underline">Sign in</a>
      </div>
    );

  return (
    <div className="flex h-full flex-col bg-[var(--surface-1)]">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--line)] px-3">
        <span
          onClick={() => { setShowHistory(!showHistory); setShowSettings(false); }}
          className={`flex-1 cursor-pointer truncate pr-2 text-[11px] font-medium uppercase tracking-[0.16em] ${
            showHistory ? "text-[var(--text)]" : "text-[var(--text-dim)] hover:text-[var(--text)]"
          }`}
          title="Past conversations"
        >
          {currentTitle}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={handleNewConversation}
            className="rounded p-1 text-[var(--text-dim)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]"
            title="New conversation"
          >
            <Plus size={14} />
          </button>
          <button
            onClick={() => { setShowHistory(!showHistory); setShowSettings(false); }}
            className={`rounded p-1 hover:bg-[var(--surface-3)] ${
              showHistory ? "text-[var(--text)] bg-[var(--surface-3)]" : "text-[var(--text-dim)] hover:text-[var(--text)]"
            }`}
            title="History"
          >
            <History size={14} />
          </button>
          <button
            onClick={() => { setShowSettings(!showSettings); setShowHistory(false); }}
            className={`rounded p-1 hover:bg-[var(--surface-3)] ${
              showSettings ? "text-[var(--text)] bg-[var(--surface-3)]" : "text-[var(--text-dim)] hover:text-[var(--text)]"
            }`}
            title="Settings"
          >
            <Settings size={14} />
          </button>
        </div>
      </div>

      {showHistory && (
        <div className="border-b border-[var(--line)] bg-[var(--surface-2)] p-2 text-xs">
          <button
            onClick={handleNewConversation}
            className="mb-2 flex w-full items-center gap-1.5 rounded border border-dashed border-[var(--line)] px-2 py-1.5 text-[var(--text-dim)] hover:border-[var(--accent)] hover:text-[var(--text)]"
          >
            <Plus size={12} />
            New chat
          </button>
          <div className="max-h-64 space-y-0.5 overflow-auto">
            {conversations.length === 0 ? (
              <div className="px-2 py-2 text-[11px] text-[var(--text-dim)]">
                No conversations yet.
              </div>
            ) : (
              conversations.map((c) => (
                <div
                  key={c.id}
                  onClick={() => handleSwitchConversation(c.id)}
                  className={`group flex cursor-pointer items-center justify-between gap-1 rounded px-2 py-1.5 ${
                    c.id === currentId
                      ? "bg-[var(--surface-3)] text-[var(--text)]"
                      : "text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]"
                  }`}
                >
                  <div className="flex-1 truncate text-[11px]">
                    {c.title || "New conversation"}
                  </div>
                  <button
                    onClick={(e) => handleDeleteConversation(c.id, e)}
                    className="rounded p-0.5 text-[var(--text-dim)] opacity-0 hover:text-red-400 group-hover:opacity-100"
                    title="Delete"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {showSettings && (
        <div className="border-b border-[var(--line)] bg-[var(--surface-2)] p-3 space-y-2 text-xs">
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wider text-[var(--text-dim)]">
              OpenCode Go API Key
            </label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="h-7 text-xs"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wider text-[var(--text-dim)]">
              Model
            </label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPENCODE_GO_MODELS.map((m) => (
                  <SelectItem key={m.id} value={m.id} className="text-xs">
                    {m.label}
                  </SelectItem>
                ))}
                <SelectItem value="__custom__" className="text-xs">
                  Other…
                </SelectItem>
              </SelectContent>
            </Select>
            {model === "__custom__" && (
              <Input
                type="text"
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                placeholder="model-id (e.g. deepseek-v4-flash)"
                className="mt-1 h-7 text-xs"
              />
            )}
          </div>

          <div className="border-t border-[var(--line)] pt-2">
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-[var(--text-dim)]">
              Cloudflare (image generation)
            </div>
            <Input
              type="text"
              value={cloudflareAccountId}
              onChange={(e) => setCloudflareAccountId(e.target.value)}
              placeholder="Account ID"
              className="mb-1.5 h-7 text-xs"
            />
            <Input
              type="password"
              value={cloudflareApiKey}
              onChange={(e) => setCloudflareApiKey(e.target.value)}
              placeholder="API Token"
              className="h-7 text-xs"
            />
            <p className="mt-1 text-[10px] text-[var(--text-dim)]">
              Used for image models (flux-1-schnell…). Chat always stays on OpenCode Go.
            </p>
          </div>

          <div className="border-t border-[var(--line)] pt-2">
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-[var(--text-dim)]">
              Groq (subtitles)
            </div>
            <Input
              type="password"
              value={groqApiKey}
              onChange={(e) => setGroqApiKey(e.target.value)}
              placeholder="Groq API Key"
              className="h-7 text-xs"
            />
            <p className="mt-1 text-[10px] text-[var(--text-dim)]">
              whisper-large-v3 (pré-configuré) — transcription des narrations en sous-titres.
            </p>
          </div>

          <div className="border-t border-[var(--line)] pt-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-dim)]">
                My models
              </span>
              <span className="text-[10px] text-[var(--text-dim)]">{customModels.length} custom</span>
            </div>
            {customModels.length > 0 && (
              <div className="mb-2 space-y-1">
                {customModels.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between rounded border border-[var(--line)] bg-[var(--surface-3)] px-2 py-1"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[11px] text-[var(--text)]">{m.label}</div>
                      <div className="mono truncate text-[9px] text-[var(--text-dim)]">
                        {m.provider} · {m.modelId}
                      </div>
                    </div>
                    <button
                      onClick={() => removeCustomModel(m.id)}
                      className="ml-1 shrink-0 rounded p-0.5 text-[var(--text-dim)] hover:text-red-400"
                      title="Remove"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <AddModelForm onAdd={addCustomModel} />
          </div>
        </div>
      )}

      <div className="flex-1 space-y-3 overflow-auto p-4 text-sm">
        {!apiKey && (
          <div className="rounded-md border border-[var(--line)] bg-[var(--surface-2)] p-3 text-xs text-[var(--text-muted)]">
            Configure your OpenCode Go API key in the Director settings (gear icon above) to start
            chatting.
          </div>
        )}
        {messages.length === 0 && apiKey && (
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
          if (!input.trim() || busy || !apiKey) return;
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
        <Button type="submit" size="sm" disabled={busy || !apiKey}>
          {busy ? "…" : "Send"}
        </Button>
      </form>
    </div>
  );
}

const CAP_OPTIONS: { value: DirectorModel["capabilities"][number]; label: string }[] = [
  { value: "image", label: "Image" },
  { value: "audio.speech", label: "Voice" },
  { value: "audio.transcribe", label: "Subtitles" },
];

/** Form to add a custom model (Cloudflare by id, or a Gradio endpoint). */
function AddModelForm({ onAdd }: { onAdd: (m: DirectorModel) => void }) {
  const [provider, setProvider] = useState<"cloudflare" | "gradio">("cloudflare");
  const [modelId, setModelId] = useState("");
  const [label, setLabel] = useState("");
  const [caps, setCaps] = useState<Set<string>>(new Set(["image"]));

  function toggleCap(c: string) {
    setCaps((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }

  function submit() {
    const idVal = modelId.trim();
    if (!idVal) return;
    onAdd({
      id: `custom/${provider}/${idVal}`,
      provider,
      modelId: idVal,
      label: label.trim() || (provider === "gradio" ? "Gradio endpoint" : idVal),
      capabilities: [...caps] as DirectorModel["capabilities"],
      custom: true,
    });
    setModelId("");
    setLabel("");
  }

  return (
    <div className="rounded border border-dashed border-[var(--line)] p-2">
      <div className="flex items-center gap-2">
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as "cloudflare" | "gradio")}
          className="h-6 rounded border border-[var(--line)] bg-[var(--surface-3)] px-1.5 text-[10px] text-[var(--text-muted)]"
        >
          <option value="cloudflare">Cloudflare</option>
          <option value="gradio">Gradio endpoint</option>
        </select>
        <Input
          type="text"
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
          placeholder={provider === "cloudflare" ? "model id (e.g. @cf/black-forest-labs/flux-1-schnell)" : "endpoint URL"}
          className="h-6 flex-1 text-[10px]"
        />
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <Input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label (optional)"
          className="h-6 flex-1 text-[10px]"
        />
        <div className="flex items-center gap-2">
          {CAP_OPTIONS.map((c) => (
            <label key={c.value} className="flex cursor-pointer items-center gap-0.5 text-[10px] text-[var(--text-muted)]">
              <input
                type="checkbox"
                checked={caps.has(c.value)}
                onChange={() => toggleCap(c.value)}
                className="h-3 w-3 accent-[var(--accent)]"
              />
              {c.label}
            </label>
          ))}
        </div>
        <Button size="sm" onClick={submit} disabled={!modelId.trim()} className="h-6 px-2 text-[10px]">
          Add
        </Button>
      </div>
    </div>
  );
}
