import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { bootstrapKernel } from "@/kernel/bootstrap";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// The kernel (and its SQLite DB) must be initialized on the server before any
// createServerFn runs. `bootstrapKernel` is idempotent, so the first server
// fn call does the init (DB + storage + plugin registration) and the rest no-op.
const bootstrapMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  await bootstrapKernel();
  return next();
});

export const startInstance = createStart(() => ({
  functionMiddleware: [bootstrapMiddleware, attachSupabaseAuth],
  requestMiddleware: [errorMiddleware],
}));
