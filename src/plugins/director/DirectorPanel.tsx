import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { Settings, History, Plus, Trash2, SendHorizontal, Square } from "lucide-react";
import { useDirectorStore, OPENCODE_GO_MODELS } from "./store";
import type { DirectorModel } from "@/lib/models/catalog";
import { UI_LABELS, toolLabel, toolIcon } from "@/lib/ui/labels";
import { ErrorBlock } from "@/components/ui/error-block";
import { Markdown } from "@/components/ui/markdown";

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
  const conversations = pid ? (conversationsByProject[pid] ?? []) : [];
  const currentId = pid ? (currentByProject[pid] ?? null) : null;
  const setMessagesStore = useDirectorStore((s) => s.setMessages);
  const createConversation = useDirectorStore((s) => s.createConversation);
  const setCurrentConversation = useDirectorStore((s) => s.setCurrentConversation);
  const deleteConversation = useDirectorStore((s) => s.deleteConversation);

  // Guards the store-sync effect during conversation/project switches,
  // so stale useChat messages never overwrite the target conversation.
  const hydratingRef = useRef(false);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
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

  // Request body as a function of a ref: DefaultChatTransport resolves
  // `body`/`headers` at request time, so conversation switches always send
  // the current sessionId (stable per-conversation id → x-opencode-session).
  const bodyRef = useRef({
    projectId: pid,
    apiKey,
    model: effectiveModel,
    customModels,
    cloudflareAccountId,
    cloudflareApiKey,
    groqApiKey,
    sessionId: currentId ?? undefined,
  });
  bodyRef.current = {
    projectId: pid,
    apiKey,
    model: effectiveModel,
    customModels,
    cloudflareAccountId,
    cloudflareApiKey,
    groqApiKey,
    // Stable per-conversation id → forwarded as x-opencode-session
    // (required by OpenCode Go for routing + prompt caching).
    sessionId: currentId ?? undefined,
  };
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = token;
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/director",
        body: () => ({ ...bodyRef.current }),
        headers: (): Record<string, string> => {
          const t = tokenRef.current;
          return t ? { Authorization: `Bearer ${t}` } : {};
        },
        // Enrich transport failures: AI SDK surfaces a bare
        // "An error occurred." — capture HTTP status + body snippet so
        // the error card + diagnostics are actually actionable.
        fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
          let res: Response;
          try {
            res = await fetch(input, init);
          } catch (e) {
            throw new Error(
              `${UI_LABELS.director.erreurReseau} (${e instanceof Error ? e.message : String(e)})`,
            );
          }
          if (!res.ok) {
            let extrait = "";
            try {
              extrait = (await res.text()).slice(0, 300);
            } catch {
              /* body unreadable */
            }
            throw new Error(
              `${UI_LABELS.director.erreurHttpTransport(res.status)}${extrait ? ` — ${extrait}` : ""}`,
            );
          }
          return res;
        }) as typeof fetch,
      }),
    [],
  );

  const { messages, sendMessage, regenerate, stop, status, error, setMessages } = useChat({
    id: currentId ?? "new",
    transport,
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
    if (!confirm(UI_LABELS.director.supprimerConversation)) return;
    deleteConversation(pid, id);
    markHydrating();
  }

  const currentTitle =
    conversations.find((c) => c.id === currentId)?.title ?? UI_LABELS.director.titre;

  if (!pid)
    return (
      <div className="p-6 text-sm text-[var(--text-muted)]">{UI_LABELS.director.sansProjet}</div>
    );
  if (!token)
    return (
      <div className="p-6 text-sm text-[var(--text-muted)]">
        {UI_LABELS.director.connexionRequise}{" "}
        <a href="/auth" className="underline">
          {UI_LABELS.director.seConnecter}
        </a>
      </div>
    );

  return (
    <div className="flex h-full flex-col bg-[var(--surface-1)]">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--line)] px-3">
        <button
          type="button"
          onClick={() => {
            setShowHistory(!showHistory);
            setShowSettings(false);
          }}
          aria-expanded={showHistory}
          className={`flex-1 truncate pr-2 text-left text-[11px] font-medium uppercase tracking-[0.16em] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
            showHistory ? "text-[var(--text)]" : "text-[var(--text-dim)] hover:text-[var(--text)]"
          }`}
          title={UI_LABELS.director.conversationsTitre}
        >
          {currentTitle}
        </button>
        <div className="flex items-center gap-1">
          <button
            onClick={handleNewConversation}
            className="touch-44 rounded p-1 text-[var(--text-dim)] hover:bg-[var(--surface-3)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            title={UI_LABELS.director.nouvelleConversation}
            aria-label={UI_LABELS.director.nouvelleConversation}
          >
            <Plus size={14} />
          </button>
          <button
            onClick={() => {
              setShowHistory(!showHistory);
              setShowSettings(false);
            }}
            className={`touch-44 rounded p-1 hover:bg-[var(--surface-3)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
              showHistory
                ? "text-[var(--text)] bg-[var(--surface-3)]"
                : "text-[var(--text-dim)] hover:text-[var(--text)]"
            }`}
            title={UI_LABELS.director.historique}
            aria-label={UI_LABELS.director.historique}
          >
            <History size={14} />
          </button>
          <button
            onClick={() => {
              setShowSettings(!showSettings);
              setShowHistory(false);
            }}
            className={`touch-44 rounded p-1 hover:bg-[var(--surface-3)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
              showSettings
                ? "text-[var(--text)] bg-[var(--surface-3)]"
                : "text-[var(--text-dim)] hover:text-[var(--text)]"
            }`}
            title={UI_LABELS.director.reglages}
            aria-label={UI_LABELS.director.reglages}
          >
            <Settings size={14} />
          </button>
        </div>
      </div>

      {showHistory && (
        <div className="border-b border-[var(--line)] bg-[var(--surface-2)] p-2 text-xs">
          <button
            onClick={handleNewConversation}
            className="mb-2 flex w-full items-center gap-1.5 rounded border border-dashed border-[var(--line)] px-2 py-1.5 text-[var(--text-dim)] hover:border-[var(--accent)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            <Plus size={12} />
            {UI_LABELS.director.nouveauMessage}
          </button>
          <div
            className="max-h-[40vh] space-y-0.5 overflow-auto"
            role="listbox"
            aria-label={UI_LABELS.director.conversationsTitre}
          >
            {conversations.length === 0 ? (
              <div className="px-2 py-2 text-[11px] text-[var(--text-dim)]">
                {UI_LABELS.director.aucuneConversation}
              </div>
            ) : (
              conversations.map((c) => (
                <div
                  key={c.id}
                  role="option"
                  tabIndex={0}
                  aria-selected={c.id === currentId}
                  onClick={() => handleSwitchConversation(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleSwitchConversation(c.id);
                    }
                  }}
                  className={`group flex cursor-pointer items-center justify-between gap-1 rounded px-2 py-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
                    c.id === currentId
                      ? "bg-[var(--surface-3)] text-[var(--text)]"
                      : "text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]"
                  }`}
                >
                  <div className="flex-1 truncate text-[11px]">
                    {c.title || UI_LABELS.director.conversationSansTitre}
                  </div>
                  <button
                    onClick={(e) => handleDeleteConversation(c.id, e)}
                    className="touch-44 rounded p-0.5 text-[var(--text-dim)] opacity-0 hover:text-red-400 group-hover:opacity-100 focus-visible:opacity-100 [@media(pointer:coarse)]:opacity-60"
                    title={UI_LABELS.director.effacer}
                    aria-label={UI_LABELS.director.effacer}
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
              {UI_LABELS.director.cleApi}
            </label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={UI_LABELS.director.cleApiPlaceholder}
              className="h-7 text-xs"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wider text-[var(--text-dim)]">
              {UI_LABELS.director.modele}
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
                  {UI_LABELS.director.autreModele}
                </SelectItem>
              </SelectContent>
            </Select>
            {model === "__custom__" && (
              <Input
                type="text"
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                placeholder={UI_LABELS.director.modelePersoPlaceholder}
                className="mt-1 h-7 text-xs"
              />
            )}
          </div>

          <div className="border-t border-[var(--line)] pt-2">
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-[var(--text-dim)]">
              {UI_LABELS.director.cloudflareTitre}
            </div>
            <Input
              type="text"
              value={cloudflareAccountId}
              onChange={(e) => setCloudflareAccountId(e.target.value)}
              placeholder={UI_LABELS.director.compteId}
              className="mb-1.5 h-7 text-xs"
            />
            <Input
              type="password"
              value={cloudflareApiKey}
              onChange={(e) => setCloudflareApiKey(e.target.value)}
              placeholder={UI_LABELS.director.jetonApi}
              className="h-7 text-xs"
            />
            <p className="mt-1 text-[10px] text-[var(--text-dim)]">
              {UI_LABELS.director.cloudflareAide}
            </p>
          </div>

          <div className="border-t border-[var(--line)] pt-2">
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-[var(--text-dim)]">
              {UI_LABELS.director.groqTitre}
            </div>
            <Input
              type="password"
              value={groqApiKey}
              onChange={(e) => setGroqApiKey(e.target.value)}
              placeholder={UI_LABELS.director.jetonApi}
              className="h-7 text-xs"
            />
            <p className="mt-1 text-[10px] text-[var(--text-dim)]">{UI_LABELS.director.groqAide}</p>
          </div>

          <div className="border-t border-[var(--line)] pt-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-dim)]">
                {UI_LABELS.director.mesModeles}
              </span>
              <span className="text-[10px] text-[var(--text-dim)]">
                {UI_LABELS.director.modelePersoCompteur(customModels.length)}
              </span>
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
                      className="touch-44 ml-1 shrink-0 rounded p-0.5 text-[var(--text-dim)] hover:text-red-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                      title={UI_LABELS.director.retirer}
                      aria-label={UI_LABELS.director.retirer}
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

      <div className="flex-1 space-y-4 overflow-auto p-4 text-sm">
        {!apiKey && (
          <div className="rounded-md border border-[var(--line)] bg-[var(--surface-2)] p-3 text-xs text-[var(--text-muted)]">
            {UI_LABELS.director.cleRequise}
          </div>
        )}
        {messages.length === 0 && apiKey && (
          <div className="text-[var(--text-muted)]">{UI_LABELS.director.exempleInvite}</div>
        )}
        {messages.map((m) => {
          if (m.role === "user") {
            const text = m.parts
              .filter((p) => p.type === "text")
              .map((p) => (p as { text: string }).text)
              .join("");
            return (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-[var(--accent)] px-3.5 py-2 text-[13.5px] leading-relaxed text-[var(--accent-fg)]">
                  <div className="whitespace-pre-wrap">{text}</div>
                </div>
              </div>
            );
          }
          return (
            <div key={m.id} className="min-w-0">
              <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--text-dim)]">
                <span
                  aria-hidden
                  className="inline-block h-[14px] w-[14px] rounded-[4px]"
                  style={{
                    background:
                      "conic-gradient(from 210deg, var(--accent-strong), var(--accent), var(--accent-quiet), var(--accent))",
                  }}
                />
                {UI_LABELS.director.titre}
              </div>
              <div className="space-y-1.5">
                {m.parts.map((p, i) => {
                  if (p.type === "text") {
                    if (!(p as { text?: string }).text?.trim()) return null;
                    return <Markdown key={i} text={(p as { text: string }).text} />;
                  }
                  if (typeof p.type === "string" && p.type.startsWith("tool-")) {
                    const Icon = toolIcon(p.type);
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-2.5 py-1.5 text-[12px] text-[var(--text-muted)]"
                      >
                        <Icon size={13} className="shrink-0 text-[var(--accent-strong)]" />
                        <span className="truncate">{toolLabel(p.type)}</span>
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          );
        })}
        {busy &&
          (() => {
            const last = messages[messages.length - 1];
            const hasText =
              last &&
              last.role === "assistant" &&
              last.parts.some((p) => p.type === "text" && (p as { text?: string }).text?.trim());
            if (hasText) return null;
            return (
              <div
                className="flex items-center gap-1.5 px-1 py-1"
                aria-label={UI_LABELS.director.envoiEnCours}
              >
                {[0, 1, 2].map((d) => (
                  <span
                    key={d}
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--text-dim)]"
                    style={{ animationDelay: `${d * 150}ms` }}
                  />
                ))}
              </div>
            );
          })()}
        {error ? (
          <div className="mx-3 mb-3">
            <ErrorBlock
              message={String((error as Error)?.message || UI_LABELS.director.erreurGenerique)}
              error={error}
              context="director.chat"
              model={effectiveModel || undefined}
              session={currentId ?? undefined}
              onRetry={() => regenerate()}
            />
          </div>
        ) : null}
      </div>
      <form
        className="shrink-0 p-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!input.trim() || busy || !apiKey) return;
          sendMessage({ text: input });
          setInput("");
          requestAnimationFrame(() => {
            composerRef.current?.style.setProperty("height", "auto");
          });
        }}
      >
        <div className="flex items-end gap-2 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-2 pl-3 transition-colors focus-within:border-[var(--accent)]">
          <textarea
            ref={composerRef}
            value={input}
            rows={1}
            onChange={(e) => {
              setInput(e.target.value);
              const el = e.target;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (!input.trim() || busy || !apiKey) return;
                sendMessage({ text: input });
                setInput("");
                requestAnimationFrame(() => {
                  composerRef.current?.style.setProperty("height", "auto");
                });
              }
            }}
            placeholder={UI_LABELS.director.invitePlaceholder}
            aria-label={UI_LABELS.director.invitePlaceholder}
            enterKeyHint="send"
            className="text-ios max-h-[140px] flex-1 resize-none bg-transparent py-2 text-sm outline-none placeholder:text-[var(--text-dim)]"
          />
          <button
            type={busy ? "button" : "submit"}
            onClick={busy ? () => stop() : undefined}
            disabled={!busy && (!input.trim() || !apiKey)}
            title={busy ? UI_LABELS.director.arreter : UI_LABELS.director.envoyer}
            aria-label={busy ? UI_LABELS.director.arreter : UI_LABELS.director.envoyer}
            className="touch-44 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-fg)] transition-all hover:bg-[var(--accent-strong)] active:scale-95 disabled:opacity-40"
          >
            {busy ? <Square size={14} className="fill-current" /> : <SendHorizontal size={16} />}
          </button>
        </div>
      </form>
    </div>
  );
}

const CAP_OPTIONS: { value: DirectorModel["capabilities"][number]; label: string }[] = [
  { value: "image", label: UI_LABELS.director.capaciteImage },
  { value: "audio.speech", label: UI_LABELS.director.voix },
  { value: "audio.transcribe", label: UI_LABELS.director.sousTitres },
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
      label: label.trim() || (provider === "gradio" ? UI_LABELS.director.pointGradio : idVal),
      capabilities: [...caps] as DirectorModel["capabilities"],
      custom: true,
    });
    setModelId("");
    setLabel("");
  }

  return (
    <div className="rounded border border-dashed border-[var(--line)] p-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as "cloudflare" | "gradio")}
          className="touch-44 h-6 rounded border border-[var(--line)] bg-[var(--surface-3)] px-1.5 text-[10px] text-[var(--text-muted)]"
        >
          <option value="cloudflare">Cloudflare</option>
          <option value="gradio">{UI_LABELS.director.pointGradio}</option>
        </select>
        <Input
          type="text"
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
          placeholder={
            provider === "cloudflare"
              ? UI_LABELS.director.modeleIdPlaceholderCloudflare
              : UI_LABELS.director.pointAccesPlaceholder
          }
          className="h-6 min-w-0 flex-1 text-[10px]"
        />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <Input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={UI_LABELS.director.etiquettePersoPlaceholder}
          className="h-6 min-w-0 flex-1 text-[10px]"
        />
        <div className="flex items-center gap-2">
          {CAP_OPTIONS.map((c) => (
            <label
              key={c.value}
              className="flex cursor-pointer items-center gap-1.5 py-2 text-[10px] text-[var(--text-muted)]"
            >
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
        <Button
          size="sm"
          onClick={submit}
          disabled={!modelId.trim()}
          className="touch-44 h-6 px-2 text-[10px]"
        >
          {UI_LABELS.common.ajouter}
        </Button>
      </div>
    </div>
  );
}
