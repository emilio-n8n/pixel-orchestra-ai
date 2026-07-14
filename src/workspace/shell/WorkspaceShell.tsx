import { useEffect, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { usePanelStore } from "@/stores/panels";
import { TopBar } from "./TopBar";
import { Sidebar } from "./Sidebar";
import { Inspector } from "./Inspector";
import { BottomDock } from "./BottomDock";
import { StatusBar } from "./StatusBar";
import { CenterView } from "./CenterView";
import { CommandPalette } from "./CommandPalette";

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
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[var(--surface-0)] text-[var(--text)]">
      <TopBar workspaceId={workspaceId} projectId={projectId} onOpenCommand={() => setPaletteOpen(true)} />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

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
                    <Inspector />
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
      </div>

      <StatusBar />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
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