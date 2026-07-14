<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

# Lilium Studio — agent guidelines

## Architecture

The project follows `.lovable/plan.md` (the "platform" revision). It is
**plugin-first**: a tiny kernel orchestrates plugins, the rest of the
codebase is plugins.

```
src/
  kernel/           # the kernel — contracts, event bus, plugin host, registry, DB
    contracts/      # the public SDK surface for plugins
    event-bus.ts    # typed pub/sub, persisted to SQLite on the server
    registry.ts     # in-memory catalog of plugin contributions
    plugin-host.ts  # lifecycle: register, activate, unregister
    db/             # DBAdapter interface + bun-sqlite implementation + migrations
  plugins/          # every built-in plugin lives here, one folder per plugin
  workspace/        # the app shell (host UI): TopBar, Sidebar, Center, Inspector, Bottom
  routes/           # TanStack Start routes (file-based)
  stores/           # zustand stores (UI state, layout)
  components/ui/    # shadcn primitives
  lib/              # SSR error capture, error page
  db/migrations/    # → actually src/kernel/db/migrations/*.sql
```

## Kernel contract

The kernel knows nothing about creative domain (no models, no providers,
no media formats). It only knows:

- **plugins** — modules that declare a `PluginManifest` and contribute
  to one or more **extension points** (panels, commands, connectors,
  viewers, nodes, …)
- **events** — every state mutation flows through the typed event bus
- **registry** — a runtime catalog of contributions, observable from
  React via `useRegistrySnapshot`
- **DB** — server-only SQLite via the `DBAdapter` interface
- **storage** — added in phase 2

The kernel exposes hooks for React: `KernelProvider`, `useKernel`,
`useRegistrySnapshot`, `useKernelEvents`.

## How to add a built-in plugin

1. Create `src/plugins/<plugin-id>/` with:
   - `manifest.ts` — exports a `PluginManifest`
   - one or more React components for your panels
2. Append the manifest to `builtinPlugins` in `src/plugins/index.ts`.
3. Restart the dev server. The plugin is registered on boot.

A panel contribution looks like:

```ts
{
  id: "my-plugin.center",
  title: "My Plugin",
  slot: "center",          // "center" | "sidebar" | "inspector" | "bottom"
  component: MyComponent,
  order: 10,               // optional
}
```

The kernel does not import your plugin at all; the only contact point
is the manifest and the `PluginContext` you receive in `activate()`.

## DB & migrations

- Local DB file: `~/.lilium/lilium.db` (override with `LILIUM_DB_PATH`).
- Add a new migration: `src/kernel/db/migrations/NNN_name.sql`. It
  runs automatically on next boot.
- Browser bundle never touches the DB; the kernel runs in RAM-only
  mode on the client.

## Tests

```sh
bun test            # kernel unit tests
bun run lint        # eslint
bunx tsc --noEmit   # typecheck
```

## Commits & Lovable

- Commit messages in English, conventional style (`feat:`, `fix:`,
  `chore:`, `refactor:`).
- One logical change per commit. Push after each phase ends; the
  journal lives in `.lovable/forlovable.md`.
- Never amend / rebase a pushed commit; never push secrets.

## Stack constraints

The runtime is fixed by Lovable: TanStack Start + Nitro, Cloudflare
Workers target. Local dev runs on Bun. `bun:sqlite` is the dev DB.
Worker-friendly DBs (D1, etc.) are an adapter swap in phase 9+.
