/**
 * Bridge between the plain objects the UI builds and the `Json` type the
 * generated Supabase client demands for JSONB columns.
 *
 * `Json` is a recursive union with an index signature, so a typed interface
 * (`SubtitleStyle`, `GainPoint`, …) is not assignable to it even though the
 * value is perfectly serialisable. Casting per call site would spread
 * `as unknown as Json` through the codebase; this narrows once, in one place,
 * and is honest about what it does: JSONB has no richer contract than
 * "something that survives a JSON round-trip".
 */

import type { Json } from "@/integrations/supabase/types";

/**
 * Treat a value as JSONB-safe. The round-trip through `JSON.parse` is what
 * makes it a real narrowing rather than a lie: non-serialisable values
 * (`undefined`, functions, symbols, cycles) come back as something else or
 * throw, instead of reaching Postgres.
 */
export function toJson<T>(value: T): Json {
  return JSON.parse(JSON.stringify(value ?? null)) as Json;
}
