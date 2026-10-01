/**
 * Left column: the conversational AI agent (spec A.2.1, D).
 *
 * The Director panel moved here permanently — no more chat/inspector tab
 * dance. It renders a conversation, a checklist of the concrete edits the
 * agent performed, clickable preview cards for the assets it produced, and
 * the prompt bar (paperclip upload + voice dictation, Enter to send).
 */

import { DirectorPanel } from "@/plugins/director/DirectorPanel";

export function AgentColumn() {
  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--surface-1)]">
      <DirectorPanel />
    </div>
  );
}
