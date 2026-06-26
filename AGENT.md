# AGENT.md — posda-remote-module

Working notes for AI/dev collaboration on the POSDA Release & Distribution UI.
This file holds architecture facts, conventions, and per-feature checklists.
For known shortcuts and deferred cleanup, see [TECH_DEBT.md](TECH_DEBT.md).

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

Environment: `.env.local` with `PAPI_TARGET` (backend base URL) and
`PAPI_BEARER_TOKEN`. See `.env.example`.

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
  `transfer_gc`, `transfer_wp`, `transfer_recordset`)
- `recordset` → `recordset_release` (+ `recordset_release_file`);
  drafts via `recordset_draft` (+ `recordset_draft_file`)
- QC: `qc_review` → `qc_series` (+ `qc_series_history`)
- Lookups: `dataset_type`, `recordset_type`, `recordset_license`,
  `transfer_destination`, `transfer_mode`, `dataset_relation_type`
- `wp_object_map` — Posda↔WordPress object linkage
- `user_favorite` — dashboard favorites (datasets/recordsets)

## Active workstreams / checklists

> Add a section per feature as we plan it. Format: goal, then a task checklist
> with `- [ ]` items. Move finished features to the bottom or strike them.
>
> **Status: DISCUSSION ONLY — nothing below is approved for implementation yet.**
>
> **Sequencing (top to bottom):**
> 0. **QC Review enhancements — DATA MODEL FIRST** (see ⭐ below) — the current
>    priority; the model must be finalized before anything else proceeds.
> 1. Interface improvements to support the external visualization-tool team.
> 2. The functional/visual backlog (items 1–9). Within it: 1 → 2 → … → 9;
>    items 1 & 2 are the foundation the page-level cleanups depend on.

### ⭐ PRIORITY 0 — QC Review enhancements (finalize data model first)

Goal: extend the QC model for (a) partial/sampled reviews, (b) assignment &
splitting between users with a "needs QC" pickup queue, and (c) targeted flags
that surface as per-user dashboard action items. **Data model must be finalized
before any UI work.** Touches the existing `qc_review` / `qc_series` /
`qc_series_history` tables. Remember to update all three DB scripts
(DDL / drop / test-data) for every new table/column.

**Schema status (written to SQL):** the DDL below is committed to
`add_dataset_module_tables.sql` and `drop_dataset_module_tables.sql`
(`user_favorite` drop, previously missing, added too). **QC test data is
owned/generated by the user — not added to `create_dataset_module_test_data.sql`.**
Items below are checked when their *schema* exists; cloning/split/pickup behavior
marked separately is application logic, still to build.

**Resolved decisions (from requirements discussion):**
- Q1 → **Uniform %**: one sample percentage applied per modality, stored on
  `qc_review.sample_percentage`. `modality` is denormalized onto `qc_series`
  (snapshot row), so per-modality counts derive via `GROUP BY` — no separate
  `qc_review_modality` table.
- Q2 → **Split by %, stratified per modality**: each reviewer gets an even share
  of *each modality's* series → requires **series-level** assignment
  (`qc_series.assignment_id`), not just a modality label.
- Q3 → **Polymorphic flags**: `object_type`/`object_id` (like `user_favorite`),
  plus optional `series_instance_uid` to narrow within a `qc_review`.
- Q4 → **Per-slice pickup; whole review = one slice unless split**: every review
  auto-creates one assignment on creation (unclaimed → pickup page); splitting
  subdivides into N assignments, each independently claimable.

#### A. Partial reviews + review type

- [ ] `qc_review.review_type` (`full` | `partial`), default `full`
- [ ] `qc_review.sample_percentage numeric` (uniform; NULL when full)
- [ ] `qc_review.sample_seed integer` — **retained.** Sampling is keyed on
      `series_instance_uid` (stable; **not** `file_id`). The persisted `qc_series`
      rows are the source of truth for membership; the seed only reproduces a
      draw or makes a deliberate re-draw / top-up deterministic. A plain clone
      copies the same series, so it never needs the seed.
- [ ] `qc_series.modality` — denormalized onto the snapshot row (populated at
      insert via a `DISTINCT` lookup on `file_series` over `file_series_uid_idx`;
      modality is nullable there). Drives the stratified split + per-modality
      summaries; avoids per-file join+dedup. **Replaces** a `qc_review_modality`
      table. (`file_series` is per-file, so a UID maps to many rows.)
- [ ] Sampled series remain a subset of `qc_series` rows (no change there)

#### B. Cloning a partial review — "carry-forward + reconcile" (recommended)

- [ ] Default clone mode: copy `review_type` + `sample_percentage`; carry forward
      sampled series UIDs **and** their `qc_status`; recompute `series_file_hash`
      → mark changed series `stale`/pending (reuses existing stale machinery)
- [ ] Reconcile to target %: drop series no longer in the draft; if population
      grew and the sample fell below target %, top up with new `pending` series
- [ ] Alternative clone mode (explicit flag): fresh **re-sample** (new seed, no
      carried decisions)
- [ ] Assignments reset on clone: new clone starts with one unclaimed
      whole-review slice (re-splitting is a separate action)

#### C. Assignment / splitting + "needs QC" pickup

- [ ] `qc_review_assignment (assignment_id, qc_review_id, assigned_to NULL=unclaimed,
      assignment_status: needs_qc|in_progress|complete, share_percentage, audit cols)`
- [ ] `qc_series.assignment_id` FK → `qc_review_assignment` (each series belongs to
      exactly one slice; this is how the stratified %-split is recorded)
- [ ] On review create: auto-insert one assignment (share 100, unclaimed,
      `needs_qc`); point every `qc_series` at it
- [ ] Split: insert N assignments with shares; redistribute `qc_series.assignment_id`
      **evenly per modality** (grouping by `qc_series.modality`) across them, with
      deterministic remainder rounding (round-robin leftovers) in the app layer
- [ ] Pickup page query = `assigned_to IS NULL AND assignment_status='needs_qc'`
- [ ] Keep `qc_review.review_status` for lifecycle only (don't overload it with
      assignment state); app validates shares sum to 100%

#### D. `user_flag` — per-user action items (polymorphic)

- [ ] `user_flag (user_flag_id, object_type, object_id, series_instance_uid NULL,
      flagged_for, flagged_by, note, flag_status: open|resolved, resolve audit)`
      — `object_type`/`object_id` like `user_favorite`; `series_instance_uid`
      narrows within a `qc_review`. Named per the `user_*` convention; note the
      target is `flagged_for`, not an owner.
- [ ] Distinct from `qc_status='flagged'` (a review decision, not a targeted task)
- [ ] Dashboard action items = `flagged_for = :me AND flag_status='open'`

### ⭐ PRIORITY 1 — QC API layer (interface + viz tool)

New endpoints under the `/papi/v1/distribution` router, `qc/` namespace
(`distribution.py`). Follow existing conventions: `logged_in_user` dep,
`{data: …}` envelope, `api_error`. The viz tool lives in **Mirabelle** (separate
project) and consumes the viz-tool endpoints below.

**Implemented (first pass):** 21 routes appended to `distribution.py` —
reviews (create/sampling, list, detail, update, cancel, clone, split),
assignments (list, queue, detail, update, claim, release), series (list, summary,
set status, batch status, history), and flags (create, list, update). The draw is
a shared `QC_DRAW_CTE` (used by sampling + clone + the stale reconcile). Pending:
manual API testing against a live DB; frontend pages; the pagination retrofit
(item #10).

**Write policy (decided):** series status writes (B/C) are allowed for **any
authorized user** — no `caller == assigned_to` enforcement; an unclaimed
`needs_qc` slice is still writable. `who_updated` is recorded in
`qc_series_history` regardless.

#### List conventions (filters / pagination / envelope)

Applies to all QC + flag list endpoints.

- **Envelope:** `{ "data": [...], "meta": { "count", "total", "page"?, "limit"? } }`
  — extends the existing `list_response` (`{data, meta:{count}}`) with `total`
  (full filtered match count). Single = `{data: {...}}`; not-found = `{data: null}`.
- **Pagination (decided: `page` + `limit`, 1-based):** optional. **Omit both ⇒
  return all** (preserves current behavior; lets the viz tool grab a whole slice
  in one call). When given, server windows via `offset = (page-1)*limit` and
  `total` reflects the full filtered count (one extra `COUNT(*)`); `page`/`limit`
  echoed in `meta`.
- **Filters (decided: single-value each):** snake_case `Query` params, one value
  per filter (e.g. `qc_status=pending`, `modality=CT`) — matches the existing
  `/datasets` style. No multi-value / array / comma params.
- **Ordering:** stable, server-side default per endpoint (e.g.
  `series_instance_uid` for assignment series; `when_created desc` for flags) so
  paginated windows are deterministic.
- Paginate the unbounded lists (pickup queue, flags, reviews); the viz-tool
  series/summary calls typically omit pagination (full slice).

#### Viz-tool endpoints (Mirabelle consumes)

- [ ] **A. List series in an assignment, filter by status**
      `GET /distribution/qc/assignments/{assignment_id}/series`
      `?qc_status=pending&modality=CT&page=&limit=` (single-value filters) →
      `qc_series WHERE assignment_id=:id` + filters; returns uid, qc_status,
      modality, series_file_hash, notes
- [ ] **B. Set one series' status**
      `PUT /distribution/qc/assignments/{assignment_id}/series/{series_instance_uid}/status`
      body `{ qc_status, notes? }` → validate series ∈ assignment; update
      `qc_series`; append `qc_series_history`; return updated row
- [ ] **C. Batch set status** (avoid one-HTTP-per-series)
      `PUT /distribution/qc/assignments/{assignment_id}/series/status`
      body `{ series_instance_uids[], qc_status, notes? }` → one txn, history per series
- [ ] **D. Supporting reads** — `GET …/qc/assignments/{id}` (assignment + review +
      draft context); `GET …/qc/assignments/{id}/series/summary` (counts by
      qc_status and modality×status, for filter chips + progress)

#### Interface endpoints (Posda UI)

- [ ] Reviews: `GET/POST /distribution/recordsets/drafts/{draft_id}/qc-reviews`
      (POST samples, inserts `qc_series` w/ modality, auto-creates 1 assignment);
      `GET/PUT /distribution/qc/reviews/{review_id}`; `POST …/clone`
- [ ] Split/assign/pickup: `GET …/qc/reviews/{id}/assignments`;
      `POST …/qc/reviews/{id}/split` (even %-per-modality + rounding);
      `POST …/qc/assignments/{id}/claim`; `PUT …/qc/assignments/{id}`;
      `GET …/qc/assignments?status=needs_qc&unassigned=true` (pickup queue)
- [ ] Flags: `POST /distribution/flags`;
      `GET /distribution/flags?flagged_for=me&status=open` (dashboard action items);
      `PUT /distribution/flags/{id}` (resolve)

#### Sampling (`POST /distribution/recordsets/drafts/{draft_id}/qc-reviews`)

Creates the review + its initial assignment + the sampled `qc_series`, one txn.

- **Request:** `{ review_type: full|partial, sample_percentage (req. if partial),
  sample_seed?, review_notes? }`. **Seed: server generates + stores when omitted
  (decided)** → the draw is always reproducible. Validate `0 < pct ≤ 100`.
- **Population query** (reuses the existing content-hash formula —
  `distribution.py` ~L3205):
  ```sql
  SELECT fs.series_instance_uid,
         max(fs.modality)                                AS modality,
         md5(string_agg(f.digest, '' ORDER BY f.digest)) AS series_file_hash
  FROM recordset_draft_file rdf
  JOIN file_series fs ON fs.file_id = rdf.file_id
  JOIN file        f  ON f.file_id  = rdf.file_id
  WHERE rdf.recordset_draft_id = :draft_id
  GROUP BY fs.series_instance_uid
  ```
  - `series_file_hash` = the established series-hash (content-addressed via
    `file.digest`) → drives stale detection. NULL modality = its own stratum.
- **Draw:**
  - full → all series.
  - partial, per modality M: **`n_M = ceil(sample_percentage/100 × count_M)`
    (decided)** — always rounds up, so every non-empty modality gets ≥1. Select
    via `ORDER BY md5(:seed || series_instance_uid) LIMIT n_M`.
  - Rank is a pure fn of `(seed, uid)`, independent of the rest of the
    population → reproducible draw + monotonic top-up for clone.
- **Steps (txn):** insert `qc_review` → insert one `qc_review_assignment`
  (share 100, unclaimed, `needs_qc`) → run draw → bulk-insert `qc_series`
  (`pending`, modality, hash, `assignment_id`).
- **Response:** review + initial assignment + per-modality summary
  (`population_count`, `sampled_count`) — the "CT: 24 of 120 (20%)" audit line.
- **Edge (decided):** empty draft (0 series) ⇒ **reject** with a clear error
  ("draft has no series to review"); no empty review is created.

#### Clone (`POST /distribution/qc/reviews/{review_id}/clone`)

Re-runs the **sampling draw** against the source review's **own draft** (as it now
stands) using the source's seed, then overlays carried statuses. **Reuses the
sampling helper — do not re-implement the draw** (same seed + `md5(seed||uid)`
ranking + ceil that sampling uses).

- **Request:** `{ mode: carry_forward|resample (default carry_forward), review_notes? }`.
  **Same draft only (decided)** — no `target_draft_id`; clone always uses the
  source's `recordset_draft_id`.
- **carry_forward:** `T = sample(P, S.seed, S.sample_percentage, ceil)`
  (full ⇒ all P). Bucket by `series_instance_uid`:
  - carried-unchanged (in T & S, hash matches) → copy `qc_status`
  - carried-changed (in T & S, hash differs) → **reset to `pending` (decided)**
    + store new hash; the old decision is dropped because content changed
  - added (in T, not S) → `pending`
  - dropped (in S, not T) → not carried
- **resample:** new seed, no carried decisions (fresh draw, all `pending`) —
  mechanically the sampling endpoint, recorded with `cloned_from_review_id` for lineage.
- **Assignments reset:** one unclaimed whole-review slice (`needs_qc`); all new
  `qc_series` point at it (re-split separately).
- **Lineage:** new `qc_review.cloned_from_review_id = :review_id`; copy
  `review_type`/`sample_percentage`/`seed` (carry_forward) or regen seed (resample).
- **One txn;** source is read-only.
- **Response:** review + initial assignment + reconcile summary
  (carried-unchanged / changed→pending / added / dropped, + per-modality
  population & sampled counts).

#### Split semantics (`POST /distribution/qc/reviews/{review_id}/split`)

One operation rebalances the **whole review**: create new slices, reassign every
`qc_series.assignment_id`, delete old slices — in one transaction. `count`/`user_ids`
of 1 ⇒ merge to a single slice; ≥2 ⇒ split; re-run ⇒ rebalance.

- **Request (even split only — decided):**
  - `{ "user_ids": [12,34,56] }` → one slice per user (`assigned_to` set), equal shares
  - `{ "count": 3 }` → 3 unclaimed (pickup) slices, equal shares
  - Mixed assigned+unclaimed and custom per-slice shares are **deferred** (would
    need a fuller `slices[]` shape later).
- New slices start `assignment_status='needs_qc'`; `share_percentage = 100/N`
  (display only — allocation is computed from exact fractions, not the rounded %).
- **Distribution, per modality independently:**
  - order that modality's series by `series_instance_uid` (stable/reproducible)
  - even split via **largest-remainder**; **rotate** the leftover recipient across
    modalities (start at `modality_index mod N`) so no reviewer hoards remainders
  - assign **contiguous** UID-ordered chunks (decided; not interleaved)
- **Preserves `qc_status`** — split only moves `assignment_id`, never decisions.
- **Guard (decided):** refuse if any existing slice is `in_progress`/`complete`
  unless `force: true` (protects active reviewers from silent reassignment).
- **Concurrency:** `SELECT … FOR UPDATE` the review's `qc_series` during the split.
- **Response:** new slices with per-slice counts + per-modality breakdown
  (e.g. "Reviewer A: 4 (CT 3, MR 1)").

#### Flags (`/distribution/flags`, polymorphic — not under `qc/`)

`user_flag`-backed per-user action items. Independent of `qc_status='flagged'`
(a review decision); creating a flag never changes `qc_status`.

- **Create** `POST /distribution/flags`
  body `{ object_type, object_id, series_instance_uid?, flagged_for, note? }`;
  `flagged_by`=caller, `flag_status`='open'. **Launch scope: `object_type='qc_review'`
  only (decided)** — `series_instance_uid` narrows to one series in that review;
  widen the allowlist later.
- **List** `GET /distribution/flags?flagged_for=me&status=open&object_type=&object_id=&flagged_by=`
  - dashboard action items = `flagged_for=me&status=open` (uses `(flagged_for, flag_status)` idx)
  - flags on an object = `object_type=qc_review&object_id=:id` (uses `(object_type, object_id)` idx)
  - returns `{ data, total }`; raw ids — frontend builds the link from
    `object_type`+`object_id` and resolves names via `useUsers` (server-side
    object-title enrichment is a later nicety)
- **Update / resolve** `PUT /distribution/flags/{id}` body `{ flag_status?, note?, flagged_for? }`
  - resolve → `flag_status='resolved'`, `when_resolved=now`, `who_resolved=caller`;
    reopen clears those
  - **resolve/reopen allowed for any authorized user (decided)**; also edits the
    note / reassigns `flagged_for`
- **Optional:** `DELETE /distribution/flags/{id}` (creator hard-remove);
  `GET /distribution/flags/count?flagged_for=me&status=open` (nav badge)
- Self-flag allowed (`flagged_for == flagged_by`); duplicates allowed (no unique constraint).

#### Reviews & assignments CRUD (mechanical)

Follows the List conventions (paging / filters / envelope). The logic-heavy
routes (sampling / clone / split / flags) are above; these are the rest.

**Reviews**
- `GET /distribution/recordsets/drafts/{draft_id}/qc-reviews` — list (filters
  `review_status?`, `review_type?`); rows carry per-review series counts (total + by status)
- `GET /distribution/qc/reviews/{review_id}` — detail: review + assignments
  (w/ counts) + overall status breakdown
- `PUT /distribution/qc/reviews/{review_id}` — `{ review_status?, review_notes? }`;
  `review_type` / `sample_percentage` / `seed` are **immutable** (re-draw = clone)
- **No DELETE — soft cancel only (decided):** `PUT review_status='cancelled'`;
  the review + `qc_series` stay for audit

**Assignments**
- `GET /distribution/qc/reviews/{review_id}/assignments` — slices + per-slice
  counts / modality / status
- `GET /distribution/qc/assignments?status=&assigned_to=me&unassigned=true&review_id=`
  — pickup pool (`unassigned=true&status=needs_qc`) and my-queue (`assigned_to=me`)
- `PUT /distribution/qc/assignments/{id}` — `{ assigned_to?, assignment_status? }`
  (reassign / set status)
- `POST …/qc/assignments/{id}/claim` — `assigned_to=caller`,
  `needs_qc→in_progress`; **only if unclaimed** (reassign a claimed slice via PUT)
- `POST …/qc/assignments/{id}/release` — back to pool (`assigned_to=null`, `→needs_qc`)

**Completion (decided — two levels):**
- **Assignment (auto):** `assignment_status → 'complete'` when the slice has
  **0 pending** series (every series decided: approved/rejected/flagged); reverts
  to `in_progress` if a series returns to pending.
- **Review (guarded):** `review_status → 'complete'` only when **all** series are
  `approved` (accepted) — any pending/rejected/flagged blocks it. (Assignment
  complete ≠ review complete.)

**Series history**
- `GET /distribution/qc/assignments/{id}/series/{uid}/history` — read the
  `qc_series_history` trail (status changes, who/when/notes) for the audit view.

#### Staleness (`review_status='stale'`) — persisted (decided)

A review froze its series set + per-series `series_file_hash` from the draft at
sampling time; when the draft moves, in-flight reviews go out of date.

- **Persist (decided):** keep `'stale'` in the `review_status` enum. On any draft
  mutation, mark that draft's **open** reviews `→ 'stale'`. Completed/cancelled
  reviews are terminal and not auto-changed.
- **Trigger:** statement-level trigger on `recordset_draft_file` (INSERT/DELETE) →
  `UPDATE qc_review SET review_status='stale'
   WHERE recordset_draft_id IN (affected) AND review_status='open'`.
  Because Posda files are content-addressed (`file.digest`), a content edit is a
  `file_id` swap = a membership change, so a membership trigger also catches
  content drift. **Written:** function `qc_mark_open_reviews_stale()` + two
  statement-level triggers (`trg_recordset_draft_file_stale_ins/_del`, sharing a
  `changed` transition table) are in `add_dataset_module_tables.sql`; the drop
  script drops the function (triggers fall with the table). (Test-data N/A.)
- **What changed (detail only):** a stale review's detail GET still runs the
  **clone reconcile dry-run** to report `changed` / `would_add` / `would_drop`
  counts (actionable "re-clone" info); the stale *flag* is the persisted status,
  not recomputed for lists.

#### Response bodies (convention)

- Reads return the **full entity row** + **computed counts** where useful.
- **Review detail:** review row + `assignments[]` (each w/ series counts) + overall
  series breakdown by `qc_status` and `modality`; if stale, the changed/add/drop
  breakdown.
- **Assignment detail:** assignment row + parent-review summary + series counts by
  status/modality.
- **Lists:** entity rows + light per-row counts, per the List conventions.

#### Frontend QC roadmap (this app = management UI; series grid = Mirabelle)

**Done:** TanStack foundation (`apiFetch`, `queryClient`, provider) +
`useQcReviews`/`useCreateQcReview` + `QcReviewsCard` (list + create) on draft detail.

- **Phase 0 — Shared primitives (done)**
  - [x] `components/ui/Modal.tsx` (portal, Escape-close, focus trap, scroll lock,
        focus restore) — advances visual #4
  - [x] `components/ui/StatusBadge.tsx` mapping qc / review / assignment / flag
        statuses to variants — advances visual #6
  - [x] Refactored `QcReviewsCard`'s create modal + status badge onto them
  - _Note: existing hand-rolled modals (Publish, WP-link) can migrate to `Modal`
    as a later cleanup; not done yet._
- **Phase A — Review detail page (done)**
  - [x] Route `/qc/reviews/:id` (new top-level `/qc` area in `App.tsx`);
        `QcReviewsCard` rows link to it
  - [x] Hooks: `useQcReview`, `useUpdateQcReview`, `useCancelQcReview`, `useCloneQcReview`
  - [x] `pages/qc/ReviewDetail.tsx`: header (status/type/%), **stale breakdown** +
        re-clone prompt, overview, series-status breakdown, editable notes, cancel,
        clone modal (carry_forward/resample). Assignments shown read-only (Phase B
        adds actions).
- **Phase A.1 — Consistency refactor (done)**
  - [x] `ReviewDetail` Overview → `DynamicSection` (notes read-only full-width;
        Created/Updated metadata-panel as section actions). Dropped `Field` helper.
  - [x] Notes editing → Edit-notes `Modal` (triggered from header actions)
  - [x] Series → compact status badge+count row **+ per-modality progress
        `DynamicTable`** (pivoted). Summaries-only — no per-series list.
  - [x] Assignments → `DynamicTable` (Slice #, Assignee via `useUsers`, Status badge,
        Share %, Progress); non-clickable until Phase B
  - [x] `QcReviewsCard` reviews list → `DynamicTable` (row-click → `/qc/reviews/:id`)
- **Phase B — Assignments & split (done)**
  - [x] Hooks: `useSplitReview`, `useClaimAssignment`, `useReleaseAssignment`,
        `useUpdateAssignment` (reassign) — all invalidate the review-detail query
        (shared `useReviewInvalidation` helper)
  - [x] Assignments `DynamicTable` Actions column: Claim / Release / Reassign
        (user-picker `Modal`) / disabled "Open in Mirabelle" on claimed slices
  - [x] **Split** button → `Modal` (`count` vs `user_ids` checkbox list);
        auto-detects active work → warns + passes `force=true`
  - [x] **Mark Complete** header action, enabled only when all series approved
  - [x] Known gap remains: no in-app series approve/reject until the Mirabelle link
        contract exists
- **Phase C — Work intake (dashboard + queue — done)**
  - [x] **Backend:** `GET /qc/assignments` now joins `qc_review → recordset_draft →
        recordset` (adds `recordset_name`, `review_type`, `review_status`,
        `recordset_draft_id`, `recordset_id`)
  - [x] Hooks: `useAssignmentQueue`, `useMyFlags`, `useResolveFlag`; the assignment
        invalidation helper now also invalidates `["qc-assignments"]`
  - [x] **Pickup queue page `/qc/queue`** — claimable slices, Claim per row, review
        links; server-paginated via `DynamicTable` (25/page, `keepPreviousData`)
  - [x] **Dashboard:** **My Action Items** (open flags + Resolve, capped 8 + "more")
        and **My QC Queue** (my active assignments) with a Pickup Queue link.
        ⚠️ Placed on `pages/Home.tsx` (the `/` landing titled "Dashboard", what the
        navbar logo opens) via a reusable `components/QcWorkItems.tsx` — **not**
        `dashboard/Overview.tsx` (an orphaned `/dashboard` page nothing links to).
  - [x] No navbar change; pagination done now (queue server-paged). #10 still owns
        the pre-existing endpoints + `DynamicTable` explicit-mode/server-sort cleanup
- **Phase D — Flags creation + shared-primitive cleanup**
  - [ ] `useCreateFlag` + "Flag for…" action (review/series → user + note)
  - [ ] Extract shared `StatusBadge` (visual #6) + `Modal` (visual #4); refactor the
        QC create/split/flag modals onto them

**Decisions (settled):**
1. Review detail route = **`/qc/reviews/:id`** — new top-level `/qc` area (matches
   the API namespace); the queue + QC dashboard pages also live under `/qc`.
2. Mirabelle link-out = **omit until defined** — no deep-link yet (placeholder only);
   add once their URL contract exists.
3. Shared primitives = **extract now** — build `Modal` + `StatusBadge` (Phase 0)
   before Phase A, then build review detail on them + refactor `QcReviewsCard`.
4. Design direction = **conform to existing primitives** (`DynamicSection` +
   `DynamicTable` + `StatusBadge` + `Modal`). A card-forward redesign is a
   separate, scheduled effort (visual #8) — not ad-hoc per feature.
5. Series on the review page = **summaries only** — aggregate status counts +
   per-modality progress + assignment slices; **never an unbounded per-series
   list** (that's Mirabelle). A bounded paginated series table here is opt-in/later.
6. Design-system pass (visual #8) = **after** the QC feature phases (refactor +
   B–D); built on the existing primitives, then a dedicated standardization block.

### 1. Loading indicators (consistency)

Goal: replace ad-hoc `<p>Loading…</p>` text with shared, accessible primitives.

- [ ] Add `<Spinner>` / `<LoadingState>` primitive in `components/ui/`
      (consistent copy + `aria-busy`/`aria-live`)
- [ ] Replace the ~20 inline `Loading…` sites across pages with it
- [ ] Add a `loading` prop to `Button` (inline spinner + auto-`disabled`);
      retire the manual `{isSaving ? "Creating…" : …}` text swaps
- [ ] Add a `loading` prop to `DynamicTable` that renders skeleton rows in place
      (removes the layout shift from loading text sitting outside the table)

### 2. Async / data-fetching (highest-leverage)

Goal: stop re-implementing fetch + isLoading + error + cleanup on every page.

- [x] **DECIDED: TanStack Query (React Query).** Free/open-source (MIT), no
      cost. Chosen over SWR and a hand-rolled hook because this app's heaviest
      needs — mutations + invalidation (create/edit/delete/toggle everywhere),
      polling long-running ops (IDC manifest generation via `refetchInterval`),
      and inspecting cache in a data-heavy admin UI (Devtools) — are where
      TanStack leads. (Confirmed no dependency-approval blocker.)
      - It doubles as a **shared server-state cache**, eliminating today's
        duplicate fetches: `useUsers()` is called in 7 pages and `useFavorites()`
        in 6, each re-fetching on every mount; lookups (`dataset-types`,
        `licenses`, `recordset-types`, `destinations`, `transfer-modes`) are
        re-fetched ad-hoc per visit. The cache dedupes these to one fetch, shares
        across pages, and invalidates on mutation.
      - A global client store (Redux/Zustand) is **not** warranted — app-wide
        state (current user, toasts, theme) is already handled by Context. The
        only "state functionality" with payoff here is caching server reads.
- [x] Install `@tanstack/react-query` (+ devtools); wrap the app in
      `QueryClientProvider` (done in `main.tsx`, with `lib/queryClient.ts`)
- [x] `apiFetch()` wrapper added (`lib/apiFetch.ts`) — JSON headers, `res.ok`,
      `extractApiError`; + `ListEnvelope`/`ItemEnvelope` types. First hooks in
      `lib/useQc.ts` (`useQcReviews`, `useCreateQcReview`)
- [ ] Wrap reference-data reads (`useUsers`, lookups) as `useQuery` with
      `staleTime: Infinity` — fetch-once, share across all consumers
- [ ] Convert `useFavorites` to `useQuery` + `useMutation` with optimistic
      toggle and cache invalidation (ties to item 3 / item 6)
- [ ] `apiFetch()` wrapper becomes the shared `queryFn` body (headers, `res.ok`,
      `.json()`, `extractApiError`, normalizers); the lib supplies the
      `AbortSignal`, so the `isMounted` pattern is retired
- [ ] Migrate **incrementally** — wrap new/refactored pages first (start with the
      worst offenders: `datasets/Detail.tsx`, `recordsets/drafts/Files.tsx`);
      leave untouched pages until they're next edited
- [ ] Add an `apiFetch()` wrapper centralizing headers, `res.ok`, `.json()`,
      and `extractApiError`
- [ ] Switch effects from the `isMounted` discard pattern to `AbortController`
      (actually cancels superseded/in-flight requests)
- [ ] Split `datasets/Detail.tsx`'s sequential mega-effect into independent
      resource fetches; remove the `message.includes("releases")` error routing
- [ ] Move large-list search server-side (e.g. draft Files fetches *all*
      `/papi/v1/activities` then filters client-side with a 25-row cap)

### 3. Error handling & resilience

Goal: no silent failures, no full-app blanking.

- [ ] Add a root `ErrorBoundary` in `App.tsx`
- [~] Global 401/auth-expired handling — **partial:** `RootLayout` now checks
      `/auth/users/me` and renders a clear "not logged into Posda" (401) or
      "can't reach API" notice instead of every page showing "Could not load."
      Still TODO: per-call 401 handling for sessions that expire mid-use
      (a global TanStack/queryClient error handler), since the `/me` gate only
      runs on initial load.
- [ ] Surface `useFavorites.toggle()` failures (toast), ideally optimistic
      update with rollback

### 4. Shared Modal / Dialog primitive

Goal: one accessible dialog instead of hand-rolled inline modals.

- [ ] Build `Modal`/`Dialog` in `components/ui/` (Escape-to-close, focus trap,
      scroll lock) or wrap native `<dialog>`
- [ ] Migrate the WP-link modal in `datasets/Detail.tsx` to it
- [ ] Reuse for future confirm dialogs

### 5. DynamicTable improvements

Goal: explicit, predictable paging + in-table loading.

- [ ] Add explicit `mode: "client" | "server"` prop; drop the
      `totalItems > rows.length` heuristic
- [ ] Define sort behavior under server paging (disable, or server-side sort)
- [ ] Wire in the `loading` prop from item 1

### 6. Toast & feedback polish

Goal: don't drop messages; faster perceived response.

- [ ] Queue/stack toasts instead of single-at-a-time replacement
- [ ] Apply optimistic-update pattern to favorites (ties to item 3)

### 7. URL-as-state for list filters

Goal: make list filters durable, shareable, and bookmarkable.

Independent of the item-2 library decision. Today `datasets/List.tsx` (and the
other list pages) hold search / type / active / pagination in local `useState`,
so filters are lost on navigate-away-and-back and can't be linked or bookmarked.

- [ ] Move list filter + pagination state into React Router search params
      (`useSearchParams`) instead of local `useState`
- [ ] Apply across both List pages (datasets, recordsets) and the draft/transfer
      browsers where it fits
- [ ] Ensure deep-linking works: a pasted URL reproduces the filtered view

### 8. Visual / design system

Goal: one coherent, themeable visual language; kill parallel/dead pieces.
Priority within this item: tokens (2) → StatusBadge (6) → theme toggle (1) →
focus ring (4) → navbar (5) → shell sizes (3). Tokens first — StatusBadge and the
theme toggle both build on them.

- [ ] **Color tokens:** add semantic `--success`/`--danger`/`--warning`/`--info`
      tokens; migrate hardcoded Tailwind palette colors (`text-blue-600`,
      `bg-blue-50`, `border-neutral-200`, `text-emerald-600`, inline `#ef4444`)
      onto tokens so status colors follow the dark accent
      (`--accent` is `#2563eb` light / `#4a8fd4` dark — hardcoded blues clash)
- [ ] **Shared `<StatusBadge status=…>`:** extract from the PageDetailHeader
      badge; map the model's enum statuses to variants — transfer
      (`draft/queued/in_progress/success/failed`), draft
      (`open/ready/invalid/published`), qc (`pending/approved/rejected/flagged`).
      Replace raw-text status rendering in tables
- [ ] **Manual theme toggle:** switch to class-based dark mode (`.dark` on
      `<html>`) + a Navbar/Settings toggle persisted to `localStorage`
      (currently `prefers-color-scheme`-only, no user override). Deliberately
      localStorage, not DB — avoids flash-of-wrong-theme on load. See item #9.
- [ ] **Button focus ring:** add a `:focus-visible` ring to `.btn` (inputs have
      a focus outline; buttons have none → invisible keyboard focus)
- [ ] **Navbar:** `Link` → `NavLink` with active-route highlight; surface the
      already-fetched `currentUser` (name/avatar/logout) — today it's never shown
- [ ] **PageShell sizes:** `3xl/5xl/6xl` all resolve to one `72rem` max-width —
      give the tiers real widths or remove the dead prop
- [ ] **Dark-mode surfaces (review):** cards (`--surface #1a2035`) are darker
      than the page (`--background #243050`), so they recede instead of lift —
      confirm intent vs. conventional lighter-surface elevation
- [ ] **Lower priority:** responsive table fallback (card-stack on mobile vs
      horizontal scroll only); standardize on the `text-muted` utility instead of
      inline `style={{ color: "var(--muted)" }}`

### 9. User preferences (DEFERRED)

Goal: decide where per-user preferences live; build the store only once enough
account-level prefs accumulate to justify it.

**Policy (hybrid):**
- **localStorage** for device-local / first-paint-sensitive prefs — theme
  (see item #8), transient UI state (collapsed panels, etc.).
- **Database** for prefs that should follow the user across devices — default
  page size, default transfer destination/mode, saved filter presets, dashboard
  layout, column visibility.
- **URL** for the *current* list filter state — that's item #7, not a stored
  preference (a persisted *default* page size is a pref; the active filter is not).

**Precedent:** `user_favorite` is already a per-user, DB-stored preference keyed
to `auth.users` — extending to other prefs is consistent with the existing model.

**Timing — DEFERRED:** don't build a general preferences subsystem for theme
alone. Wait until there are ≥2–3 real account-level prefs worth syncing.

**When built — proposed schema (single jsonb blob per user):**
```sql
CREATE TABLE "public".user_setting (
  user_id      integer NOT NULL,           -- PK, FK → auth.users(user_id)
  settings     jsonb   NOT NULL DEFAULT '{}'::jsonb,
  when_updated timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_user_setting PRIMARY KEY (user_id)
);
```
- Grows without a migration per new pref; app validates shape.
- Preferred over a generic `user_preference(user_id, key, value)` key-value
  table (fewer rows, single read).
- Mirrors cleanly into TanStack: `useQuery(["user","settings"])` +
  optimistic `useMutation` — reuses item #2 machinery.
- Remember to add the table to all three DB scripts (DDL / drop / test-data).

### 10. Server-side pagination on ALL list endpoints

Goal: every list endpoint honors `page` + `limit` and returns `total`, per the
PRIORITY 1 **List conventions**. Today the existing `/distribution` lists
(`datasets`, `recordsets`, releases, drafts, transfers, lookups, …) ignore the
`page`/`limit` the frontend already sends and return **all** rows
(`list_response` → `{data, meta:{count}}`), so large tables load everything and
paginate client-side. Applies to existing endpoints *and* the new QC/flag ones.
(See [TECH_DEBT.md](TECH_DEBT.md) #4.)

- [ ] Extend the shared `list_response` helper to accept `total`/`page`/`limit`
      and emit `meta.total` (+ echoed page/limit)
- [ ] Retrofit existing `distribution.py` list endpoints to window via
      `page`+`limit` with a `COUNT(*)` for `total`; **omit ⇒ return all**
      (preserves current callers)
- [ ] New QC/flag list endpoints follow the same (already speced)
- [ ] Add a stable server-side default ordering per endpoint (required once windowed)
- [ ] Frontend: read `meta.total`; drive `DynamicTable` server mode (ties to
      item #5) and URL-synced page state (ties to item #7); converge the per-page
      `normalize*Response` shims (tech-debt #3)
