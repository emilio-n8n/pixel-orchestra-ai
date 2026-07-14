// Characters panel — CRUD for AI Context characters. Each character has
// a name, description, optional portrait image ids, voice ref, style ref.
// All stored in the context_entries table (kind = "character").

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createContextStore, type ContextEntryKind } from "@/kernel/context";

// We init the store lazily from the server fn context.
async function getStore() {
  const { getDb } = await import("@/kernel/db");
  return createContextStore(getDb());
}

export interface CharacterView {
  id: string;
  name: string;
  description: string;
  portraitIds: string[];
  voiceRef: string | null;
  styleRef: string | null;
}

export const listCharacters = createServerFn({ method: "GET" })
  .validator(z.object({ projectId: z.string() }))
  .handler(async ({ data }) => {
    const store = await getStore();
    const entries = await store.list(data.projectId, "character" as ContextEntryKind);
    return {
      characters: entries.map((e) => ({
        id: e.key,
        ...(e.value as Omit<CharacterView, "id">),
      })),
    };
  });

export const saveCharacter = createServerFn({ method: "POST" })
  .validator(
    z.object({
      projectId: z.string(),
      character: z.object({
        id: z.string().optional(),
        name: z.string().min(1),
        description: z.string().default(""),
        portraitIds: z.array(z.string()).default([]),
        voiceRef: z.string().nullable().default(null),
        styleRef: z.string().nullable().default(null),
      }),
    }),
  )
  .handler(async ({ data }) => {
    const store = await getStore();
    const id = data.character.id ?? `char_${Math.random().toString(36).slice(2, 10)}`;
    await store.set(data.projectId, "character" as ContextEntryKind, id, {
      name: data.character.name,
      description: data.character.description,
      portraitIds: data.character.portraitIds,
      voiceRef: data.character.voiceRef,
      styleRef: data.character.styleRef,
    });
    return { id };
  });

export const deleteCharacter = createServerFn({ method: "POST" })
  .validator(z.object({ projectId: z.string(), characterId: z.string() }))
  .handler(async ({ data }) => {
    const store = await getStore();
    await store.delete(data.projectId, "character" as ContextEntryKind, data.characterId);
    return { ok: true };
  });
