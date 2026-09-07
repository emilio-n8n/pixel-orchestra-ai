import { useState } from "react";
import { Check, ClipboardCopy } from "lucide-react";
import { UI_LABELS } from "@/lib/ui/labels";
import { copyDiagnostics } from "@/lib/ui/diagnostics";

/**
 * French error surface with one-click diagnostics copy
 * (deployment-id + time + url + error).
 */
export function ErrorBlock({
  message,
  error,
  context,
  compact,
}: {
  message: string;
  error: unknown;
  context?: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    const ok = await copyDiagnostics(error, { context });
    setCopied(ok);
    if (ok) window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      role="alert"
      className={`rounded border border-[var(--status-err)] bg-[var(--status-err)]/10 text-[var(--status-err)] ${
        compact ? "p-1.5 text-[10px]" : "p-2 text-[11px]"
      }`}
    >
      <div className="whitespace-pre-wrap break-words">{message}</div>
      <button
        type="button"
        onClick={() => void onCopy()}
        title={UI_LABELS.diagnostics.copier}
        className="mt-1.5 inline-flex items-center gap-1.5 rounded border border-[var(--status-err)]/40 px-2 py-1 text-[10px] font-medium uppercase tracking-widest transition-colors hover:bg-[var(--status-err)]/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        {copied ? <Check size={11} /> : <ClipboardCopy size={11} />}
        {copied ? UI_LABELS.diagnostics.copie : UI_LABELS.diagnostics.copier}
      </button>
    </div>
  );
}
