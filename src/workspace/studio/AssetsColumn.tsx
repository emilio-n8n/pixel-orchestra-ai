/**
 * Second column: the asset library (spec A.2.2, C).
 *
 * Four tabs — Media, Text, Transitions, Transcript — over the same asset
 * list. Every asset is HTML5-draggable onto a timeline lane, and each tab
 * offers its own drop targets (text presets onto the titles track,
 * transitions between two clips, transcript lines as jump targets).
 */

import { useState } from "react";
import { LibraryPanel } from "@/plugins/library/LibraryPanel";
import { TextPresetsTab } from "@/plugins/library/tabs/TextPresetsTab";
import { TransitionsTab } from "@/plugins/library/tabs/TransitionsTab";
import { TranscriptTab } from "@/plugins/library/tabs/TranscriptTab";
import { UI_LABELS } from "@/lib/ui/labels";

type AssetsTab = "media" | "text" | "transitions" | "transcript";

const TABS: Array<{ id: AssetsTab; label: string }> = [
  { id: "media", label: UI_LABELS.library.ongletMedia },
  { id: "text", label: UI_LABELS.library.ongletTexte },
  { id: "transitions", label: UI_LABELS.library.ongletTransitions },
  { id: "transcript", label: UI_LABELS.library.ongletTranscript },
];

export function AssetsColumn() {
  const [tab, setTab] = useState<AssetsTab>("media");

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--surface-1)]">
      <div
        role="tablist"
        aria-label={UI_LABELS.shell.assetsColonne}
        className="flex h-9 shrink-0 items-center gap-0.5 border-b border-[var(--line)] px-1.5"
      >
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={`h-7 flex-1 truncate rounded-lg px-1 text-[11.5px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)] ${
                active
                  ? "bg-[var(--surface-3)] text-[var(--text)]"
                  : "text-[var(--text-dim)] hover:text-[var(--text-muted)]"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1">
        {tab === "media" ? <LibraryPanel /> : <LibraryTabPanel tab={tab} />}
      </div>
    </div>
  );
}

/**
 * Non-media tabs live in their own module so the media grid keeps its own
 * scroll and lazy image loading.
 */
function LibraryTabPanel({ tab }: { tab: Exclude<AssetsTab, "media"> }) {
  if (tab === "text") return <TextPresetsTab />;
  if (tab === "transitions") return <TransitionsTab />;
  return <TranscriptTab />;
}
