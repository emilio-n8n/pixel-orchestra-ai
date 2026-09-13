import { useEffect, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { usePanelStore } from "@/stores/panels";
import { UI_LABELS } from "@/lib/ui/labels";
import { useIsMobile } from "@/lib/ui/useIsMobile";
import { MessageCircle } from "lucide-react";
import { MobileChatView } from "./MobileChatView";
import { TopBar } from "./TopBar";
import { Sidebar } from "./Sidebar";
import { RightPanel } from "./RightPanel";
import { BottomDock } from "./BottomDock";
import { StatusBar } from "./StatusBar";
import { CenterView } from "./CenterView";
import { CommandPalette } from "./CommandPalette";
import { ShortcutsDialog } from "./ShortcutsDialog";

export function WorkspaceShell({
  workspaceId,
  projectId,
}: {
  workspaceId?: string;
  projectId?: string;
}) {
  const layout = usePanelStore((s) => s.layout);
  const setLayout = usePanelStore((s) => s.setLayout);
  const inspectorCollapsed = usePanelStore((s) => s.inspectorCollapsed);
  const bottomCollapsed = usePanelStore((s) => s.bottomCollapsed);
  const toggle = usePanelStore((s) => s.toggle);
  const mobile = useIsMobile();
  const mobileView = usePanelStore((s) => s.mobileView);
  const setMobileView = usePanelStore((s) => s.setMobileView);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Mobile first run: overlay drawers replace side panels, so start
  // with everything collapsed and let toggles open them on demand.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(max-width: 767px)").matches) return;
    usePanelStore.setState({ sidebarCollapsed: true, bottomCollapsed: true });
    usePanelStore.setState({ inspectorCollapsed: true });
  }, []);

  useEffect(() => {
    function isTypingTarget(t: EventTarget | null) {
      const el = t as HTMLElement | null;
      if (!el || typeof (el as HTMLElement).tagName !== "string") return false;
      const tag = (el as HTMLElement).tagName.toLowerCase();
      return (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        (el as HTMLElement).isContentEditable
      );
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
        // Mobile: Esc also dismisses overlay drawers/sheets.
        if (mobile) {
          const s = usePanelStore.getState();
          if (!s.inspectorCollapsed) s.toggle("inspector");
          else if (!s.bottomCollapsed) s.toggle("bottom");
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobile]);

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-[var(--surface-0)] text-[var(--text)]">
      {mobile && mobileView === "chat" ? (
        <MobileChatView />
      ) : (
        <>
          <TopBar
            workspaceId={workspaceId}
            projectId={projectId}
            onOpenCommand={() => setPaletteOpen(true)}
            onOpenShortcuts={() => setShortcutsOpen(true)}
          />

          <div className="flex flex-1 overflow-hidden">
            <Sidebar />

            {mobile ? (
              <div className="relative min-w-0 flex-1">
                <CenterView />
                {!inspectorCollapsed && (
                  <>
                    <button
                      type="button"
                      aria-label={UI_LABELS.common.fermer}
                      onClick={() => toggle("inspector")}
                      className="absolute inset-0 z-30 bg-black/50"
                    />
                    <div
                      role="dialog"
                      aria-modal="true"
                      aria-label={UI_LABELS.shell.panneauLateral}
                      className="absolute top-0 right-0 bottom-0 z-40 flex w-[85vw] max-w-[340px] flex-col border-l border-[var(--line)] bg-[var(--surface-1)] shadow-2xl"
                    >
                      <RightPanel />
                    </div>
                  </>
                )}
                {/* Sheet below the drawer (z-20/z-10): the inspector wins when
                both are open — no stacked-modal ambiguity. */}
                {!bottomCollapsed && inspectorCollapsed && (
                  <>
                    <button
                      type="button"
                      aria-label={UI_LABELS.common.fermer}
                      onClick={() => toggle("bottom")}
                      className="absolute inset-0 z-20 bg-black/50"
                    />
                    <div
                      role="dialog"
                      aria-modal="true"
                      aria-label={UI_LABELS.shell.panneauMontage}
                      className="absolute inset-x-0 bottom-0 z-30 max-h-[65vh] min-h-[30vh] overflow-hidden rounded-t-2xl border-t border-[var(--line)] bg-[var(--surface-1)] shadow-2xl"
                    >
                      <BottomDock />
                    </div>
                  </>
                )}
              </div>
            ) : (
              <PanelGroup direction="vertical" className="flex-1" autoSaveId="lilium.main.v">
                <Panel defaultSize={100 - layout.bottom} minSize={30}>
                  <PanelGroup direction="horizontal" autoSaveId="lilium.main.h">
                    <Panel
                      defaultSize={inspectorCollapsed ? 100 : layout.center}
                      minSize={30}
                      onResize={(size) => setLayout({ center: size })}
                    >
                      <CenterView />
                    </Panel>
                    {!inspectorCollapsed && (
                      <>
                        <ResizeH />
                        <Panel
                          defaultSize={layout.inspector}
                          minSize={16}
                          maxSize={50}
                          onResize={(size) => setLayout({ inspector: size })}
                        >
                          <RightPanel />
                        </Panel>
                      </>
                    )}
                  </PanelGroup>
                </Panel>
                {!bottomCollapsed && (
                  <>
                    <ResizeV />
                    <Panel
                      defaultSize={layout.bottom}
                      minSize={12}
                      maxSize={70}
                      onResize={(size) => setLayout({ bottom: size })}
                    >
                      <BottomDock />
                    </Panel>
                  </>
                )}
              </PanelGroup>
            )}
          </div>

          {mobile && mobileView === "studio" && inspectorCollapsed && bottomCollapsed ? (
            <button
              type="button"
              onClick={() => setMobileView("chat")}
              title={UI_LABELS.mobile.retourChat}
              aria-label={UI_LABELS.shell.basculeVueMobile}
              className="touch-44 absolute bottom-20 left-1/2 z-50 mb-[env(safe-area-inset-bottom)] flex h-11 -translate-x-1/2 items-center gap-2 rounded-full bg-[var(--surface-3)] px-4 text-[13px] font-medium text-[var(--text)] shadow-2xl ring-1 ring-[var(--line-strong)] transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              <MessageCircle size={16} />
              {UI_LABELS.mobile.chat}
            </button>
          ) : null}

          <StatusBar />
        </>
      )}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}

function ResizeH() {
  return (
    <PanelResizeHandle className="group relative w-px bg-[var(--line)] transition-colors data-[resize-handle-state=hover]:bg-[var(--accent)] data-[resize-handle-state=drag]:bg-[var(--accent)]">
      <div className="absolute inset-y-0 -left-1 -right-1" />
    </PanelResizeHandle>
  );
}
function ResizeV() {
  return (
    <PanelResizeHandle className="group relative h-px bg-[var(--line)] transition-colors data-[resize-handle-state=hover]:bg-[var(--accent)] data-[resize-handle-state=drag]:bg-[var(--accent)]">
      <div className="absolute inset-x-0 -top-1 -bottom-1" />
    </PanelResizeHandle>
  );
}
