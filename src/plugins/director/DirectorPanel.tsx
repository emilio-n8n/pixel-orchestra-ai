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
import {
  Settings,
  History,
  Plus,
  Trash2,
  SendHorizontal,
  Square,
  Paperclip,
  Mic,
  Check,
  Loader2,
  X,
} from "lucide-react";
import { useDirectorStore, OPENCODE_GO_MODELS } from "./store";
import { previewFrameThumbnail } from "./preview-frame";
import { actionsOf, type AgentAction } from "./checklist";
import { usePromptAttachments } from "./usePromptAttachments";
import { useSpeechDictation } from "./useSpeechDictation";
import { useProjectTimeline } from "@/plugins/ui-timeline/ProjectTimelineProvider";
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

  // Tool calls fulfilled by the browser (preview_frame), waiting for their
  // one resubmit. The streamed assistant message accumulates every step of
  // a turn, so its completed tool parts stay in `messages` — resubmitting
  // must be keyed on the fulfilled call id, not on the part state alone.
  const fulfilledClientTools = useRef<Set<string>>(new Set());

  const { messages, sendMessage, regenerate, stop, addToolOutput, status, error, setMessages } =
    useChat({
      id: currentId ?? "new",
      transport,
      // preview_frame has no server execute: the browser renders the frame,
      // gets a vision description, then hands the result back and resubmits.
      onToolCall: ({ toolCall }) => {
        if (toolCall.toolName !== "preview_frame") return;
        const { toolCallId } = toolCall;
        void (async () => {
          try {
            const { runPreviewFrame } = await import("./preview-frame");
            const input = (toolCall.input ?? {}) as {
              clip_id?: string;
              t_ms?: number;
              focus?: string;
            };
            const output = await runPreviewFrame({
              toolCallId,
              clipId: String(input.clip_id ?? ""),
              tMs: typeof input.t_ms === "number" ? input.t_ms : undefined,
              focus: typeof input.focus === "string" ? input.focus : undefined,
              projectId: bodyRef.current.projectId ?? "",
              apiKey: bodyRef.current.apiKey,
              sessionId: bodyRef.current.sessionId,
              token: tokenRef.current,
            });
            fulfilledClientTools.current.add(toolCallId);
            addToolOutput({ tool: "preview_frame", toolCallId, output });
          } catch (e) {
            fulfilledClientTools.current.add(toolCallId);
            addToolOutput({
              tool: "preview_frame",
              toolCallId,
              state: "output-error",
              errorText: e instanceof Error ? e.message : String(e),
            });
          }
        })();
      },
      // Resubmit only once a browser tool got its result — server tools
      // already carry theirs inside the same stream.
      sendAutomaticallyWhen: ({ messages: msgs }) => {
        const last = msgs[msgs.length - 1];
        if (!last || last.role !== "assistant") return false;
        for (const p of last.parts) {
          const part = p as { type?: string; state?: string; toolCallId?: string };
          if (
            part.type === "tool-preview_frame" &&
            part.toolCallId &&
            fulfilledClientTools.current.has(part.toolCallId) &&
            (part.state === "output-available" || part.state === "output-error")
          ) {
            fulfilledClientTools.current.delete(part.toolCallId);
            return true;
          }
        }
        return false;
      },
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
          const actions = actionsOf(m);
          return (
            <div key={m.id} className="min-w-0">
              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--text-dim)]">
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
              {actions.length > 0 ? <ActionChecklist actions={actions} /> : null}
              <div className="space-y-1.5">
                {m.parts.map((p, i) => {
                  if (p.type === "text") {
                    if (!(p as { text?: string }).text?.trim()) return null;
                    return <Markdown key={i} text={(p as { text: string }).text} />;
                  }
                  if (typeof p.type === "string" && p.type.startsWith("tool-")) {
                    // The checklist above already carries the human phrasing;
                    // this row is the compact trace of which tool ran.
                    const Icon = toolIcon(p.type);
                    const thumb =
                      p.type === "tool-preview_frame"
                        ? previewFrameThumbnail((p as { toolCallId?: string }).toolCallId)
                        : undefined;
                    return (
                      <details
                        key={i}
                        className="group rounded-lg border border-[var(--line)] bg-[var(--surface-2)]"
                      >
                        <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2.5 py-1.5 text-[12px] text-[var(--text-muted)]">
                          {thumb ? (
                            <img
                              src={thumb}
                              alt=""
                              className="h-8 w-14 shrink-0 rounded-[4px] border border-[var(--line)] object-cover"
                            />
                          ) : (
                            <Icon size={13} className="shrink-0 text-[var(--accent-strong)]" />
                          )}
                          <span className="truncate">{toolLabel(p.type)}</span>
                        </summary>
                        <pre className="mono max-h-40 overflow-auto border-t border-[var(--line)] px-2.5 py-1.5 text-[10px] text-[var(--text-dim)]">
                          {JSON.stringify(
                            (p as { input?: unknown; output?: unknown }).input ?? {},
                            null,
                            2,
                          )}
                        </pre>
                      </details>
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
      <PromptBar
        input={input}
        setInput={setInput}
        busy={busy}
        canSend={!!apiKey}
        onSend={() => {
          sendMessage({ text: input });
          setInput("");
          requestAnimationFrame(() => {
            composerRef.current?.style.setProperty("height", "auto");
          });
        }}
        onStop={() => stop()}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Checklist of concrete actions (spec D.2)                            */
/* ------------------------------------------------------------------ */

/**
 * Replaces the raw tool log with what the user actually asked for: a
 * checkmarked list of the edits that landed, with clickable preview cards
 * for anything visual. Purely presentational — `actionsOf` derives every
 * line from the tool input.
 */
function ActionChecklist({ actions }: { actions: AgentAction[] }) {
  const { seek, selectClip } = useProjectTimeline();

  return (
    <ul
      aria-label={UI_LABELS.library.actionsExecutees}
      className="mb-2 space-y-1 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-1.5"
    >
      {actions.map((a) => (
        <li key={a.id} className="flex items-center gap-1.5 px-1 py-0.5 text-[12px]">
          <span className="shrink-0" aria-hidden>
            {a.status === "done" ? (
              <Check size={12} className="text-[var(--status-ok)]" />
            ) : a.status === "failed" ? (
              <X size={12} className="text-[var(--status-err)]" />
            ) : (
              <Loader2 size={12} className="animate-spin text-[var(--text-dim)]" />
            )}
          </span>
          <span
            className={
              a.status === "running"
                ? "text-[var(--text-dim)]"
                : a.status === "failed"
                  ? "text-[var(--status-err)]"
                  : "text-[var(--text-muted)]"
            }
          >
            {a.label}
          </span>
          {a.jump ? (
            <button
              type="button"
              onClick={() => {
                if (a.jump?.clipId) selectClip(a.jump.clipId);
                if (a.jump?.tMs != null) seek(a.jump.tMs);
              }}
              className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] text-[var(--text-dim)] transition-colors hover:bg-[var(--surface-4)] hover:text-[var(--accent-strong)]"
            >
              {UI_LABELS.library.actionAsset}
            </button>
          ) : null}
        </li>
      ))}
      {actions.some((a) => a.thumbnail) ? (
        <li className="flex flex-wrap gap-1.5 px-1 pt-1">
          {actions
            .filter((a) => a.thumbnail)
            .map((a) => (
              <button
                key={`${a.id}-thumb`}
                type="button"
                onClick={() => {
                  if (a.jump?.clipId) selectClip(a.jump.clipId);
                  if (a.jump?.tMs != null) seek(a.jump.tMs);
                }}
                title={a.label}
                aria-label={a.label}
                className="h-10 w-[68px] shrink-0 overflow-hidden rounded-md border border-[var(--line)] transition-transform hover:scale-[1.04]"
              >
                <img src={a.thumbnail} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
        </li>
      ) : null}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Prompt bar (spec D.3)                                              */
/* ------------------------------------------------------------------ */

/**
 * Composer with the paperclip (upload rushes straight into the project) and
 * the microphone (Web Speech dictation). Enter sends, Shift+Enter newlines.
 */
function PromptBar({
  input,
  setInput,
  busy,
  canSend,
  onSend,
  onStop,
}: {
  input: string;
  // Functional form keeps the dictation callback from capturing a stale value.
  setInput: React.Dispatch<React.SetStateAction<string>>;
  busy: boolean;
  canSend: boolean;
  onSend: () => void;
  onStop: () => void;
}) {
  const L = UI_LABELS.library;
  // The attachment list lives in the panel (one project = one prompt bar), so
  // it is passed down rather than owned by the hook.
  const attachments = usePromptAttachments();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const speech = useSpeechDictation((text) => {
    // Append to whatever the user already typed; never clobber it.
    setInput((prev) => (prev ? `${prev} ${text}` : text));
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
    });
  });

  const submit = () => {
    if (!input.trim() || busy || !canSend) return;
    onSend();
    attachments.clear();
    if (speech.listening) speech.stop();
  };

  return (
    <form
      className="shrink-0 p-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {attachments.attachments.length > 0 ? (
        <ul className="mb-1.5 flex flex-wrap gap-1">
          {attachments.attachments.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-1 rounded-md border border-[var(--line)] bg-[var(--surface-2)] px-1.5 py-0.5 text-[10.5px] text-[var(--text-muted)]"
            >
              <span className="max-w-[140px] truncate">{a.name}</span>
              <button
                type="button"
                onClick={() => attachments.remove(a.id)}
                title={UI_LABELS.common.fermer}
                aria-label={`${UI_LABELS.common.fermer} — ${a.name}`}
                className="text-[var(--text-dim)] hover:text-[var(--status-err)]"
              >
                <X size={10} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex items-end gap-1 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-1.5 pl-1 transition-colors focus-within:border-[var(--accent)]">
        <button
          type="button"
          onClick={attachments.pick}
          disabled={attachments.busy}
          title={L.attacherFichier}
          aria-label={L.attacherFichier}
          className="touch-44 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--text-dim)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text)] disabled:opacity-40"
        >
          {attachments.busy ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Paperclip size={15} />
          )}
        </button>
        <input
          ref={attachments.inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void attachments.onFiles(e.target.files);
            e.target.value = "";
          }}
        />

        <textarea
          ref={textareaRef}
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
              submit();
            }
          }}
          placeholder={L.invitePlaceholder}
          aria-label={L.invitePlaceholder}
          enterKeyHint="send"
          className="text-ios max-h-[140px] flex-1 resize-none bg-transparent py-2 text-sm outline-none placeholder:text-[var(--text-dim)]"
        />

        <button
          type="button"
          onClick={speech.toggle}
          disabled={!speech.supported}
          title={speech.supported ? L.dicteeVocale : L.dicteeIndispo}
          aria-label={speech.supported ? L.dicteeVocale : L.dicteeIndispo}
          aria-pressed={speech.listening}
          className={`touch-44 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-35 ${
            speech.listening
              ? "bg-[var(--status-err)]/20 text-[var(--status-err)]"
              : "text-[var(--text-dim)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]"
          }`}
        >
          <Mic size={15} />
        </button>

        <button
          type={busy ? "button" : "submit"}
          onClick={busy ? onStop : undefined}
          disabled={!busy && (!input.trim() || !canSend)}
          title={busy ? UI_LABELS.director.arreter : UI_LABELS.director.envoyer}
          aria-label={busy ? UI_LABELS.director.arreter : UI_LABELS.director.envoyer}
          className="touch-44 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-fg)] transition-all hover:bg-[var(--accent-strong)] active:scale-95 disabled:opacity-40"
        >
          {busy ? <Square size={13} className="fill-current" /> : <SendHorizontal size={15} />}
        </button>
      </div>

      {speech.listening && speech.interim ? (
        <p className="mt-1 truncate px-2 text-[10.5px] italic text-[var(--text-dim)]">
          {L.dicteeActive} {speech.interim}
        </p>
      ) : null}
      {attachments.error || speech.error ? (
        <p role="alert" className="mt-1 px-2 text-[10.5px] text-[var(--status-err)]">
          {attachments.error ?? speech.error}
        </p>
      ) : null}
    </form>
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
