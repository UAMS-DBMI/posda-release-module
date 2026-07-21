# CLAUDE.md — posda-remote-module

Working notes for AI/dev collaboration on the POSDA Release & Distribution UI.
This file holds the system overview, conventions, and general behavioral
guidelines. Active feature work, decisions, and checklists live in `notes/`:

- [notes/DEV.md](notes/DEV.md) — active development notes: in-flight feature
  checklists, design decisions, and the full workstream history
- [notes/TECH_DEBT.md](notes/TECH_DEBT.md) — known shortcuts and deferred cleanup
- [notes/IDC_TRANSFER.md](notes/IDC_TRANSFER.md) — current IDC transfer focus

## Behavioral Guidelines

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### Communication Style

- Be concise. Skip preamble and filler phrases.
- Before touching code, briefly state what you're about to do and why.
- If something is ambiguous, ask before proceeding — don't guess and write a bunch of code.
- If multiple interpretations exist, present them; don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- When explaining code, explain the *why*, not just the *what*.

### Think Before Coding

- State your assumptions explicitly. If uncertain, ask.
- If something is unclear, stop. Name what's confusing. Ask.

### Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't reformat files you weren't asked to touch.
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it; don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

### Code Style

- Python 3.14+. Type hints on all function signatures.
- Black formatting, 88-char line length.
- Prefer explicit over clever. Readable > compact.
- f-strings over `.format()` or `%`.
- Raise specific exceptions, not bare `Exception`.
- Never silently swallow exceptions — log or re-raise.
- Write small functions with descriptive names, rather than long functions with lots of if/else statements.

### Project Conventions

- Tests go in `tests/`, mirroring the source structure.
- Use `pytest`. No `unittest`.
- Don't add dependencies without asking first.

### Workflow

- Make small, focused commits. Don't bundle unrelated changes.
- If a change affects the public API or DB schema, flag it explicitly.
- Don't run `git push` without explicit instruction.

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## What this repo is

A React SPA (the "release module") for managing biomedical datasets, recordsets,
releases, drafts, QC reviews, and multi-destination data transfers in POSDA.
It is a thin client over the PAPI (FastAPI) backend that lives in the sibling
`oneposda` repo.

- **Frontend:** this repo (`posda-remote-module`), branch `dev`.
- **Backend + DB:** `../oneposda` — FastAPI routes and Postgres migrations.

### ⭐ Main data-model DDL script

**`../oneposda/database/migrations/posda_files/add_dataset_module_tables.sql`**
is the **canonical / source-of-truth DDL** for this module's data model. When
planning features or reasoning about entities, columns, FKs, enums, or status
values, consult this script first. Keep it in sync — new tables/columns for this
module land here.

Its companion teardown script is
**`../oneposda/database/migrations/posda_files/drop_dataset_module_tables.sql`**,
which `DROP TABLE ... CASCADE`s every table in the model in FK-safe order.

Seed/test data lives in
**`../oneposda/database/migrations/posda_files/create_dataset_module_test_data.sql`**
— a single `BEGIN;` transaction that populates lookups then sample
datasets/recordsets/releases/etc., and `setval`s each identity sequence after
explicit-id inserts. Use it to stand up a working dataset for local dev.

Keep all three in sync: whenever a table or column is added to / removed from the
DDL script, update the drop script and the test-data script to match.

These SQL scripts are **generated/managed by DbSchema**. Hand edits to the `.sql`
must also be made in the DbSchema model, or a regenerate will clobber them (and
DbSchema may not detect drift from out-of-band SQL changes).

## Tech stack

- React 19, React Router 7 (client-side routing, no SSR)
- Vite 7 (dev server + bundler); `@` aliases to `src/`
- TypeScript 5, strict mode — no `any` on new code; prefer `unknown` + narrowing
- Tailwind CSS 4 (via `@tailwindcss/vite`), light/dark theme
- No state library, no data-fetching library — plain `fetch` + hooks

## Commands

- `npm run dev` — dev server at http://localhost:5173 (proxies `/papi` → backend)
- `npm run build` — `tsc --noEmit` typecheck + Vite production build
- `npm run preview` — serve the production build

Environment: `.env.development.local` (used by `npm run dev`) and
`.env.production.local` (used by `npm run build`/`preview`) — **not**
`.env.local`, which doesn't exist in this project. Vite loads the mode-specific
file for the mode it's running in; both hold `PAPI_TARGET` (backend base URL)
and `PAPI_BEARER_TOKEN`. See `.env.example` for the shape.

## Backend API surface

All calls go through the Vite proxy under `/papi`:
- `/papi/v1/distribution/` — datasets, recordsets, releases, drafts, transfers, lookups
- `/papi/v1/manager/` — WordPress object maps, collections, analysis results
- `/papi/v1/download/` — file downloads
- `/papi/auth/users/me` — current user

### ⭐ Distribution API source (the backend this UI drives)

**`../oneposda/posda/fastapi/app/papi/routes/distribution.py`** (~3700 lines) is
the FastAPI router backing every `/papi/v1/distribution/*` call. It is the
source of truth for request/response shapes — Pydantic models are defined at the
top of the file, routes below. Consult it when wiring a page to confirm exact
params, body fields, and response envelopes. Endpoint groups:
- `lookups/*` — dataset-types, recordset-types, transfer-modes, licenses,
  destinations, relation-types, users
- `favorites` — GET / POST / DELETE `{object_type}/{object_id}`
- `datasets` — CRUD + `{id}/recordsets`, `{id}/releases`
- `datasets/releases/{id}` — CRUD + `recordsets` add/remove, `transfers`,
  `destinations`
- `recordsets` — CRUD + `{id}/drafts`, `{id}/releases`, `{id}/destinations`
- `recordsets/drafts/{id}` — CRUD + `files` add/remove, `summary`, `diff`,
  `publish`
- `recordsets/releases/{id}` — `files`, `summary`, `diff/{other_release_id}`
- `transfers/{id}` — CRUD + per-destination subresources (`idc`, `gc`, `aspera`,
  `nbia`, `wp`, `recordsets`) and manifest-generation endpoints

Sibling routers in the same dir: `manager.py` (WordPress/manager API),
`download.py`. Router is mounted with `tags=["Distribution"]` and a
`logged_in_user` dependency.

### Manager API source (WordPress bridge)

**`../oneposda/posda/fastapi/app/papi/routes/manager.py`** backs all
`/papi/v1/manager/*` calls (`tags=["Manager"]`). Two halves:
- **WordPress content reads** — read-only `GET /<type>` (list) and
  `GET /<type>/{post_id}` for each WP content type: `media`, `citations`,
  `collections`, `analysis-results`, `downloads`, `versions`,
  `version-downloads`, `cancer-types`, `locations`, `species`, `data-types`,
  `supporting-data`, `file-types`, `licenses`, `requirements`, `programs`.
- **Posda↔WP object map CRUD** — `wp-object-map` GET/POST/PUT/DELETE plus
  lookups: `wp-object-map/{map_id}/wp-object`,
  `posda/{posda_object_type}/{posda_object_id}/wp-map` and `.../wp-object`.

### Backend app entry / route mounting

**`../oneposda/posda/fastapi/app/main.py`** wires the API: app `root_path="/papi"`,
a `router_v1` mounted at `/v1`, and each route module added with its own prefix
(`/distribution`, `/manager`, `/download`, …). So a UI call to
`/papi/v1/distribution/datasets` resolves to `distribution.py`'s `GET /datasets`.
Check here to map any `/papi/...` path back to its route file.

## Source layout & conventions

```
src/
  App.tsx              Route table (nested routes under a RootLayout)
  components/          Shared building blocks
    ui/                Primitives: Button, Card, Page, Section
    Dynamic*.tsx       DynamicForm / DynamicSection / DynamicTable (config-driven)
    Toast.tsx          ToastProvider + useToast
  lib/                 Hooks + helpers (apiUtils, useCurrentUser, useFavorites, useUsers)
  pages/<feature>/     One folder per feature; List/Create/Detail/Edit pattern
  types/               Shared TS types (currently thin; types are mostly co-located)
```

Patterns to follow when adding features:
- **Pages** mirror existing CRUD shape: `List.tsx`, `Create.tsx`, `Detail.tsx`,
  `Edit.tsx`, with nested sub-resources in subfolders (see `datasets/releases/`).
- **Routing:** register new pages in `src/App.tsx` using nested `<Route>`s; keep
  URL params named (`:dataset_id`, `:release_id`, etc.).
- **Forms/tables:** prefer the `DynamicForm` / `DynamicTable` config-driven
  components over hand-rolled markup — see `pages/datasets/List.tsx` for the
  canonical example.
- **API responses:** backend envelope shapes vary; normalize with
  `extractArray` / `extractApiError` from `lib/apiUtils.ts`, and write a small
  `normalize<X>Response()` when a list endpoint needs it.
- **Errors:** surface via `extractApiError(json, fallback)`; show user-facing
  toasts, not raw errors.
- **UI primitives:** compose from `components/ui/*` (PageShell, SectionCard,
  Button/LinkButton) rather than raw divs, for consistent theming.

## Data model quick reference

Core entities (see SQL migration for full DDL):
- `dataset` → `dataset_release` → `dataset_release_transfer` → per-destination
  transfer tables (`transfer_idc`, `transfer_nbia`, `transfer_aspera`,
  `transfer_gc`, `transfer_wp`, `transfer_recordset`). `transfer_idc` also has
  a per-file child table `transfer_idc_file` (status per file: pending/completed/
  failed) — see [notes/IDC_TRANSFER.md](notes/IDC_TRANSFER.md).
- `recordset` → `recordset_release` (+ `recordset_release_file`);
  drafts via `recordset_draft` (+ `recordset_draft_file`)
- QC: `qc_review` → `qc_series` (+ `qc_series_history`)
- Lookups: `dataset_type`, `recordset_type`, `recordset_license`,
  `transfer_destination`, `transfer_mode`, `dataset_relation_type`
- `wp_object_map` — Posda↔WordPress object linkage
- `user_favorite` — dashboard favorites (datasets/recordsets)

## Active workstreams / checklists

In-flight feature work, design decisions, and the full history of completed
work live in [notes/DEV.md](notes/DEV.md) — check there before starting new
work to see what's already decided or in progress.
