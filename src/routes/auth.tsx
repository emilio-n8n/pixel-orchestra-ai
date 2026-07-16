import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" ? s.next : "",
  }),
});

function AuthPage() {
  const { next } = Route.useSearch();
  const nextPath = next && next.startsWith("/") ? next : "/";
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) window.location.href = nextPath;
    });
  }, [nextPath]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const fn = mode === "signin" ? supabase.auth.signInWithPassword({ email, password })
      : supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
    const { error } = await fn;
    setBusy(false);
    if (error) return setErr(error.message);
    window.location.href = nextPath;
  }

  async function google() {
    setErr(null);
    const r = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + nextPath,
    });
    if (r.error) setErr(r.error.message);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--surface-1)] p-6">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-6">
        <div>
          <h1 className="text-lg font-semibold">Lilium Studio</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {mode === "signin" ? "Sign in to continue." : "Create your account."}
          </p>
        </div>
        <Button onClick={google} variant="outline" className="w-full">Continue with Google</Button>
        <div className="text-center text-xs text-[var(--text-dim)]">or</div>
        <form onSubmit={submit} className="space-y-3">
          <input type="email" required placeholder="Email" value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-[var(--line)] bg-[var(--surface-1)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]" />
          <input type="password" required minLength={6} placeholder="Password" value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-[var(--line)] bg-[var(--surface-1)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]" />
          {err && <div className="text-xs text-red-400">{err}</div>}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "…" : mode === "signin" ? "Sign in" : "Sign up"}
          </Button>
        </form>
        <button onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="w-full text-center text-xs text-[var(--text-muted)] hover:text-[var(--text)]">
          {mode === "signin" ? "No account? Sign up" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}