/**
 * Workspace shell — the single-screen 4-zone studio (spec A).
 *
 *   ┌──────────────────────── header (48 px) ────────────────────────┐
 *   │  Agent │ Assets │        Player 16:9                           │  ← top
 *   ├────────────────────────────────────────────────────────────────┤
 *   │                  NLE timeline (full width)                      │  ← bottom
 *   └────────────────────────────────────────────────────────────────┘
 *
 * No tab navigation: the four zones are always mounted, so the agent, the
 * asset library, the monitor and the timeline stay in sync. Every divider is
 * a `react-resizable-panels` handle, and the panel sizes persist per user.
 *
 * The whole tree sits inside one ProjectTimelineProvider — that shared state
 * is what makes the zones a single tool rather than four independent widgets.
 */

import { useEffect, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { usePanelStore } from "@/stores/panels";
import { useIsMobile } from "@/lib/ui/useIsMobile";
import { UI_LABELS } from "@/lib/ui/labels";
import { ProjectTimelineProvider } from "@/plugins/ui-timeline/ProjectTimelineProvider";
import { TopBar } from "./TopBar";
import { StatusBar } from "./StatusBar";
import { CommandPalette } from "./CommandPalette";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { MobileChatView } from "./MobileChatView";
import { AgentColumn } from "@/workspace/studio/AgentColumn";
import { AssetsColumn } from "@/workspace/studio/AssetsColumn";
import { PlayerMonitor } from "@/workspace/studio/PlayerMonitor";
import { TimelinePanel } from "@/workspace/studio/TimelinePanel";
import { MessageCircle } from "lucide-react";

export function WorkspaceShell({
  workspaceId,
  projectId,
}: {
  workspaceId?: string;
  projectId?: string;
}) {
  const setLayout = usePanelStore((s) => s.setLayout);
  // `defaultSize` must be an INITIAL value, never live state. react-resizable-
  // panels recomputes a group's layout whenever any panel's `defaultSize`
  // changes, and re-notifies `onResize` from that recompute. Feeding
  // `defaultSize` the same store that `onResize` writes to is therefore a
  // cycle — resize → store → new defaultSize → recompute → onResize → … —
  // which React aborts as "Maximum update depth exceeded" (#185). It is
  // invisible with round default percentages and bites as soon as the group
  // has real pixels, where RRP reports fractional sizes.
  //
  // Restoration is already covered twice over: `autoSaveId` persists the group
  // per session, and the panels store persists across sessions. So the store
  // is snapshotted once here and never fed back in; onResize still keeps it
  // fresh for the next mount.
  const [initialLayout] = useState(() => usePanelStore.getState().layout);
  const mobile = useIsMobile();
  const mobileView = usePanelStore((s) => s.mobileView);
  const setMobileView = usePanelStore((s) => s.setMobileView);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useEffect(() => {
    function isTypingTarget(t: EventTarget | null) {
      const el = t as HTMLElement | null;
      if (!el || typeof el.tagName !== "string") return false;
      const tag = el.tagName.toLowerCase();
      return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
    }
    function onKey(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      // "?" opens the shortcuts sheet when not typing (Shift+/ produces "?").
      if (e.key === "?" && !isMod && !isTypingTarget(e.target)) {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
        return;
      }
      if (e.key === "Escape") {
        setPaletteOpen(false);
        setShortcutsOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    // One provider above every branch: the mobile chat view and the desktop
    // studio must share the same clips, or switching views would reload the
    // project and lose the playhead.
    <ProjectTimelineProvider>
      {mobile && mobileView === "chat" ? (
        <MobileChatView />
      ) : (
        <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-[var(--surface-0)] text-[var(--text)]">
          <TopBar
            workspaceId={workspaceId}
            projectId={projectId}
            onOpenCommand={() => setPaletteOpen(true)}
            onOpenShortcuts={() => setShortcutsOpen(true)}
          />

          {mobile ? (
            <MobileStudio />
          ) : (
            <div className="flex min-h-0 flex-1">
              <PanelGroup direction="vertical" className="flex-1" autoSaveId="lilium.v2.v">
                <Panel defaultSize={100 - initialLayout.bottom} minSize={25}>
                  <PanelGroup direction="horizontal" autoSaveId="lilium.v2.h">
                    <Panel
                      defaultSize={initialLayout.agent}
                      minSize={18}
                      maxSize={45}
                      onResize={(size) => setLayout({ agent: size })}
                      className="min-w-0"
                    >
                      <Zone label={UI_LABELS.shell.agentColonne}>
                        <AgentColumn />
                      </Zone>
                    </Panel>
                    <ResizeH />
                    <Panel
                      defaultSize={initialLayout.assets}
                      minSize={16}
                      maxSize={45}
                      onResize={(size) => setLayout({ assets: size })}
                      className="min-w-0"
                    >
                      <Zone label={UI_LABELS.shell.assetsColonne}>
                        <AssetsColumn />
                      </Zone>
                    </Panel>
                    <ResizeH />
                    <Panel defaultSize={initialLayout.player} minSize={30} className="min-w-0">
                      <Zone label={UI_LABELS.shell.moniteurColonne}>
                        <PlayerMonitor />
                      </Zone>
                    </Panel>
                  </PanelGroup>
                </Panel>
                <ResizeV />
                <Panel
                  defaultSize={initialLayout.bottom}
                  minSize={15}
                  maxSize={75}
                  onResize={(size) => setLayout({ bottom: size })}
                >
                  <Zone label={UI_LABELS.shell.timelineZone}>
                    <TimelinePanel />
                  </Zone>
                </Panel>
              </PanelGroup>
            </div>
          )}

          {mobile && mobileView === "studio" ? (
            <button
              type="button"
              onClick={() => setMobileView("chat")}
              title={UI_LABELS.mobile.retourChat}
              aria-label={UI_LABELS.shell.basculeVueMobile}
              className="touch-44 absolute bottom-16 left-1/2 z-50 mb-[env(safe-area-inset-bottom)] flex h-11 -translate-x-1/2 items-center gap-2 rounded-full bg-[var(--surface-3)] px-4 text-[13px] font-medium text-[var(--text)] shadow-2xl ring-1 ring-[var(--line-strong)] transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              <MessageCircle size={16} />
              {UI_LABELS.mobile.chat}
            </button>
          ) : null}

          <StatusBar />
        </div>
      )}

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </ProjectTimelineProvider>
  );
}

/**
 * Phones cannot show four zones at once, so the studio stacks monitor +
 * timeline and keeps the agent one tap away. The timeline context is shared
 * with the chat view through the provider above.
 */
function MobileStudio() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-[3]">
        <PlayerMonitor />
      </div>
      <div className="min-h-0 flex-[4] border-t border-[var(--line)]">
        <TimelinePanel />
      </div>
    </div>
  );
}

/** Thin frame so every zone announces itself and keeps the panel background. */
function Zone({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section
      aria-label={label}
      className="h-full min-h-0 min-w-0 overflow-hidden bg-[var(--surface-1)]"
    >
      {children}
    </section>
  );
}

function ResizeH() {
  return (
    <PanelResizeHandle
      aria-label={UI_LABELS.shell.zoneRedimensionnable}
      className="group relative w-px shrink-0 bg-[var(--line)] transition-colors data-[resize-handle-state=hover]:bg-[var(--accent)] data-[resize-handle-state=drag]:bg-[var(--accent)]"
    >
      <div className="absolute inset-y-0 -left-1 -right-1" />
    </PanelResizeHandle>
  );
}

function ResizeV() {
  return (
    <PanelResizeHandle
      aria-label={UI_LABELS.shell.zoneRedimensionnable}
      className="group relative h-px shrink-0 bg-[var(--line)] transition-colors data-[resize-handle-state=hover]:bg-[var(--accent)] data-[resize-handle-state=drag]:bg-[var(--accent)]"
    >
      <div className="absolute inset-x-0 -top-1 -bottom-1" />
    </PanelResizeHandle>
  );
}
