// Lilium API v1 — server routes. For now a thin proxy over the server fns;
// phase 9+ will flesh out full validation, auth, pagination, SSE streaming.
import { createServerFn } from "@tanstack/react-start";
export const apiOK = createServerFn({ method: "GET" }).handler(async () => ({
  ok: true,
  version: "0.1.0",
  phase: "9",
}));
