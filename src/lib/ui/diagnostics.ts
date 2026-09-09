/**
 * One-click diagnostics: deployment-id + time + url + error.
 * Every error surface copies the same shape so support can
 * reproduce from a single paste.
 */
export interface DiagnosticsExtra {
  context?: string;
  detail?: string;
  model?: string;
  session?: string;
}

export function deploymentId(): string {
  if (typeof document === "undefined") return "inconnu";
  return (
    document.querySelector('meta[name="x-deployment-id"]')?.getAttribute("content") ?? "inconnu"
  );
}

export function buildDiagnostics(error: unknown, extra?: DiagnosticsExtra): string {
  const err = error instanceof Error ? error : new Error(String(error ?? "(sans message)"));
  const stack = err.stack ? err.stack.split("\n").slice(0, 3).join(" | ") : "(aucune)";
  return [
    `heure : ${new Date().toISOString()}`,
    `url : ${typeof window !== "undefined" ? window.location.href : "n/a"}`,
    `déploiement : ${deploymentId()}`,
    extra?.context ? `contexte : ${extra.context}` : null,
    extra?.model ? `modèle : ${extra.model}` : null,
    extra?.session ? `session : ${extra.session}` : null,
    extra?.detail ? `détail : ${extra.detail}` : null,
    `erreur : ${err.message || "(sans message)"}`,
    `pile : ${stack}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function copyDiagnostics(error: unknown, extra?: DiagnosticsExtra): Promise<boolean> {
  const text = buildDiagnostics(error, extra);
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path.
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    return true;
  } catch {
    return false;
  }
}
