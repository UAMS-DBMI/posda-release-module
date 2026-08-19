# DEV.md — posda-remote-module

Active development notes: in-flight feature checklists, decisions, and the
workstream history. See [../CLAUDE.md](../CLAUDE.md) for the system overview,
behavioral guidelines, and links to the other notes files.

## Active workstreams / checklists

> Add a section per feature as we plan it. Format: goal, then a task checklist
> with `- [ ]` items. Move finished features to the bottom or strike them.
>
> **Status: DISCUSSION ONLY — nothing below is approved for implementation yet.**
>
> **Sequencing (top to bottom):**

### 🧹 Pre-prod consistency cleanup — port cycle modals to non-cycle pages

Goal: the standalone dataset/recordset/draft pages should use the same modals the
cycle stages already use, and the now-redundant page routes get removed. All
modals below **already exist** (built for Setup/Assemble/Verify). Work one item
at a time; each = wire the modal in, repoint inbound links, delete the page +
route + unused imports. Full analysis in the 2026-08-06 discussion.

**Direction set 2026-08-19 — pages stay, navigation goes.** Asked whether the
goal was to *eliminate* pages: no. The goal is that **a page accomplishes as
much as possible without navigating away**, the way the cycle stages do.
Sub-pages that exist only to edit something (`/edit`, `/files`, `/create`) get
folded into modals on the page that owns the thing; the owning page stays.
Applied to `recordsets/drafts/:id`, which keeps its route and becomes
self-sufficient (files, details, discard, ready/reopen, publish, QC all in
place) rather than being absorbed into `recordsets/:id`. The rejected
alternative — Assemble-style draft rows on `recordsets/:id` and no draft page
at all — would also have orphaned the inbound links from `/qc/reviews/:id`.

- [x] **1. `datasets/Detail` → `DatasetEditModal`.** *(done 2026-08-06)* Replaced
      the "Edit Dataset" link with a button opening `DatasetEditModal`; removed
      page **`datasets/:id/edit`** (`Edit.tsx`) + its route. Along the way,
      switched `Detail.tsx`'s dataset fetch from a hand-rolled `useEffect` to the
      shared `useDataset` react-query hook (`lib/datasetForm.ts`) — needed so the
      page reflects a save made through the modal (the modal's `useSaveDataset`
      already invalidates `["dataset", id]`); recordsets/releases fetching
      un-nested from the dataset load and now runs independently, keyed only on
      `datasetId`. `DatasetRecord` gained an optional `dataset_type_name` field
      (present on API reads, just wasn't declared since the edit form doesn't
      need it). Build clean.
- [x] **2. `recordsets/Detail` → `RecordsetEditModal`.** *(done 2026-08-06)*
      **Gap found and closed first:** `RecordsetEditModal` deliberately had no
      dataset selector (fixed by context), unlike `Edit.tsx` which allowed
      reassigning a recordset's dataset — removing the page would have silently
      dropped that capability. User chose to add it to the modal instead.
      `lib/recordsetForm.ts`: `RecordsetEditFormValues` gained `dataset_id`;
      `recordsetEditFormFields` takes a required `datasets` list and prepends a
      Dataset select; `recordsetEditPayload`/`useSaveRecordset` simplified to
      read `dataset_id` from `values` instead of a separate param.
      `RecordsetEditModal` now calls `useDatasetOptions`. Replaced the "Edit
      Recordset" link on `Detail.tsx` with a button opening the modal; removed
      page **`recordsets/:id/edit`** (`Edit.tsx`) + its route. Same as item 1,
      switched `Detail.tsx`'s recordset fetch to the shared `useRecordset`
      hook so the page reflects modal saves; releases/drafts fetch decoupled
      from it. `RecordsetRecord` gained optional `dataset_name`/
      `license_label`/`recordset_type_name` (present on reads). Build clean.
- [x] **3. `recordsets/Detail` → `CreateDraftModal`.** *(done 2026-08-19)*
      Replaced the "New Draft" `LinkButton` in the Drafts section header with a
      `Button` opening `CreateDraftModal`; removed page
      **`recordsets/drafts/create`** (`Create.tsx`) + its route. Three decisions:
      - **Open question answered: (B) stay put + refresh.** The modal gained an
        optional `onCreated` (same escape hatch as `RecordsetEditModal`'s
        `onSaved` in item 7) that bumps a local `draftsRefreshKey` in the
        hand-rolled fetch effect's deps — the modal's `["dataset-cycle"]`
        invalidation can't reach that list. `AssembleStage` is untouched (prop
        is optional). ⚠ Known cost: the Drafts table pages at 4/row, so a new
        draft may land off the visible page.
      - **Fields dropped, deliberately.** The removed page collected
        `draft_name` / `draft_status` / `draft_notes`; the modal collects none.
        Not a real loss — the backend auto-names (`"Version N Draft"` /
        `"Initial Draft"`, `distribution.py` ~L2379), notes are editable on
        draft detail, and the page's `draft_status` was a free-text `input`
        writing into a status field. The modal also *gains* Activity / Upload /
        WordPress sources the page never had.
      - **WordPress source kept at parity.** The modal's WP tab (pull the file
        on the recordset's WP `download` object) needs a `wpLinked` flag, but
        the 2026-08-06 rework had removed this page's `useWpMap` call when
        `WpLinkPill` took over the WP section. Re-added one `useWpMap` call for
        the flag only — react-query shares the request with the pill's.
- [x] **4 + 5. `recordsets/drafts/Detail` → `ManageFilesModal`.** *(done
      2026-08-19)* Done as one change with item 8, under a goal set this day:
      **the draft page should accomplish everything without navigating away**,
      like the cycle stages. Both entry points collapsed into **one ghost
      "Manage" button** in the page header (matching `AssembleStage:224`,
      opening on the `add` tab) — not the two separate Edit Draft / Edit Files
      buttons originally planned. Removed pages **`recordsets/drafts/:id/edit`**
      (`Edit.tsx`) and **`recordsets/drafts/:id/files`** (`Files.tsx`) + routes;
      ~1,340 lines deleted.
      - **Item 4's check passed.** `Files.tsx` was add-only — its two write
        paths bulk-added an activity diff's and a release diff's missing files.
        Both are covered: `DraftAddFiles` has the same sources, and
        `DraftSeriesReconcile`'s Merge is the same idea done better (detects
        *changed* series, not just missing files). Its File Browser and
        Activities/Releases explorers have no equivalent — judged read-only
        browsing, not editing, so deliberately not ported.
      - **Item 5's check failed — gap found.** `Edit.tsx` had five fields; the
        Details tab has name + notes + Discard. Resolved: `draft_status` (free
        text into a status field, same as item 3) and `cloned_from_release_id`
        (the provenance/staleness baseline — hand-editing it silently rewrites
        what the draft diffs against) are **dropped**. `recordset_id`
        reassignment also **dropped** — unlike item 2's dataset selector, a
        draft's files came from that recordset's lineage, so moving it strands
        the provenance; discard and recreate instead.
      - **Staying fresh:** File Summary moved onto the shared `useDraftSummary`
        query (`DraftSummary.tsx`), which `DraftAddFiles` already invalidates,
        so file changes reflect behind the modal. Its **richer table markup was
        kept** rather than swapping in the compact `DraftSummary` component,
        which is tuned for Assemble's expander row — so the page keeps a
        duplicate `formatBytes` and ~120 lines of summary markup. The draft
        record itself isn't behind a shared query, so a local `refreshKey`
        bumps on modal close and on the status mutation.
- [ ] **6. (optional) `recordsets/List` → `CreateRecordsetModal`.** Replace "New
      Recordset" (`List:269` + `datasets/Detail:429`); remove page
      **`recordsets/create`**. Lower value (list→page create is fine).
- [x] **7. `datasets/Detail` "New Recordset" → `CreateRecordsetModal`.**
      *(done 2026-08-06)* Opens in place instead of navigating to
      `/recordsets/create`; the page (and item 6) still stand. Because the
      page's recordsets list is a hand-rolled `useEffect` fetch, not
      react-query, the modal's `["dataset-cycle"]` invalidation can't reach it —
      the page passes `onCreated` to bump a local `refreshKey` that sits in the
      effect's deps. `RecordsetEditModal` gained the same escape hatch as an
      optional `onSaved`. See the dataset-detail rework below.
- [x] **8. `recordsets/drafts/Detail` Assemble parity** *(done 2026-08-19,
      promoted from optional and folded into 4+5)* — **Mark Ready / Reopen** in
      the page header, shown by `draft_status` exactly as Assemble does. The
      mutation was inline in `AssembleStage`; extracted to
      `lib/useCycle.ts` as **`useSetDraftStatus(datasetId)`** and called from
      both (toasts stay at the call sites, per the other hooks there).
      ⚠ This item's own wording said "inline `DraftSummary`" — stale: the page
      already had an inline File Summary, richer than the shared component. Its
      real content was only the lifecycle action.
- [ ] **9. (optional) `QcReviewsCard` → open `QcReviewManageModal`** in place;
      keep `ReviewDetail` as the deep-link/audit page.

**Explicitly out of scope for this pass:**
- **`datasets/create`** — no create modal exists (`DatasetEditModal` is edit-only,
  no `CreateDatasetModal`). Needs new work; leave as a page.
- **Release-level pages** (`datasets/releases/create` · `releases/:id/edit` ·
  `releases/:id/transfers/create`) — belong to Bundle (step 5) / Transfer
  (step 6); leave until those land.

**Already consistent (no work):** `RecordsetDestinationModal`, `WpLinkModal`,
`QcReviewModal`, and the shared `Qc*` review components are already used by both
the cycle and the non-cycle pages.

### 🧹 `datasets/Detail` rework — done 2026-08-06

Ran alongside the checklist above, driven by "the page carries too much
furniture for what it shows". Net effect: header + one panel with two tables.

- **`LatestReleaseCard` deleted** (component + its only usage). It duplicated
  the header (name/type), the Releases table (version/date/status), and the
  cycle's Transfer stage (transfer chips + View Transfers). Its
  latest-non-retracted `reduce` went with it — which also **removes one of the
  three "latest release" definitions** flagged as tech-debt item 6.
- **"Record Details" section deleted** — dataset id, created, updated moved
  into the header subtitle as `#id · doi · type · updated <date> by <user>`.
  Created-by/created-date are deliberately **not** shown (asked for and
  declined); date only, no time-of-day.
- **WordPress section → `WpLinkPill`** in the header (new
  `components/WpLinkPill.tsx`; same treatment applied to
  `recordsets/Detail.tsx`). The pill owns its own `WpLinkModal`, so both pages
  dropped their `useWpMap` call, `showWpModal` state, and modal instance. It
  shows the **live slug** via `useWpObject` (Broken Link / Trashed states),
  which the old sections couldn't. Dropped in the trade: the synced timestamp
  and the explicit WP object type/ID.
  - `wpBadgeState` / `WpBadgeSkeleton` / the per-row badge moved out of
    `SetupStage.tsx` into that file (now exported as `WpBadge`); Setup imports
    them, so there's one copy.
  - `PageDetailHeader` gained an optional **`subActions`** slot: its body is now
    a two-row `grid-cols-[1fr_auto]`, so second-row actions land on the
    subtitle's line instead of stacking below the taller button row. Additive —
    pages passing only `actions` are unchanged. Note `items-center`: a wrapping
    subtitle will center the subActions against the whole block.
- **Recordsets table** — ID column gone; Name is now a ✏ (opens
  `RecordsetEditModal`) plus a `target="_blank"` link, mirroring Setup's cell.
  Unlike Setup, this table has `onRowClick`, which `DynamicTable` puts on the
  `<tr>`, so the cell **stops propagation** — otherwise the pencil/link would
  also navigate the current tab. Row-click-elsewhere still navigates in-tab.
- **Both tables unpaginated** — `hideSummary`, no pager, fetches switched to
  `limit=1000` (see tech-debt item 15).
- **One panel** — everything below the page header is a single `SectionCard`
  (like `CycleLayout`), with the two `CardHeader`s acting as in-card dividers
  instead of each table sitting in its own card.

### 🧹 `recordsets/Detail` rework — done 2026-08-06

Same treatment as the dataset page above, so the two detail pages read alike.

- **WordPress collapsible → `WpLinkPill`** in the header (shared with the dataset
  page; see above for what that pill gains and drops).
- **"Record Details" collapsible deleted** — `#id` moved into the header
  subtitle, which now reads `#id · doi · dataset · type · license · updated
  <date>`. ⚠ **Deliberately different from the dataset page**, which shows
  `updated <date> by <user>`: here "only the updated date" was asked for, so
  there's no `by <user>`. Pick one if the inconsistency ever grates.
  `useUsers`/`userMap` went with the card — nothing else on the page used it.
- **`CurrentCycleCard` deleted** (component + its only usage). It duplicated the
  cycle page's own strip, and took its `["draft-diff", …]` query and `useQcReviews`
  call with it. `openDraft` is still computed — the Drafts header uses it to
  decide whether to offer **New Draft**.
- **Sections reordered and un-collapsed** — now **Destinations → Drafts →
  Releases** (was Releases → Draft History → Destinations), each a plain
  `CardHeader` + body instead of a `CollapsibleSection`. The old `summary`
  counts survive as a muted `(N)` beside the title; the section action buttons
  moved into the header row unchanged.
- **One panel** — everything below the page header is a single `SectionCard`,
  as on the dataset page.
- **Not done here, unlike the dataset page:** all three tables keep their pagers
  and per-page pickers, and the tables have no ✏ / new-tab name cell.

**Left-behind components** (not deleted, flagged instead — tech-debt 16):
`CollapsibleSection` now has **zero** call sites app-wide; `CycleStrip` has no
render sites but `ui/Tabs.tsx` still imports its `CycleStageState` type.

**Considered and deferred, don't re-litigate from scratch:** giving this page
Setup's full recordset table (destinations chips, WP column) via a shared
`RecordsetSetupTable` — and, going further, **moving the whole Setup stage onto
this page** so a cycle starts at Assemble. Setup is dataset *configuration*
that outlives any one release, so it sits oddly in a per-release wizard, and
moving it would delete the duplicate-table problem outright. Not done: the
readiness checks in `stageMessage`/`stageSummaries` (no recordsets, dataset not
WP-linked, missing destinations, unlinked downloads, orphaned downloads) are
real release preconditions that currently surface *as* the Setup tab, and they'd
have to be re-homed as a prerequisites banner first; and a curator mid-cycle
would leave the wizard to fix them. Revisit once Bundle/Transfer are finished
and it's clear how often Setup is touched mid-cycle. Full reasoning in the
2026-08-06 discussion.

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
(`user_favorite` drop, previously missing, added too).
**QC test data: decision REVERSED 2026-07-21 — QC fixtures now live in
`create_dataset_module_test_data.sql`** (previously "owned/generated by the
user"). The cycle/task work needs reproducible QC state, and there was none in
the database at all. Seeds 5 reviews covering open / stale / complete /
cancelled and full / partial, one assignment each (review 4's left unclaimed
for the pickup queue), plus `qc_series` and `qc_series_history`.
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

- [x] `qc_review.review_type` (`full` | `partial`), default `full`
- [x] `qc_review.sample_percentage numeric` (uniform; NULL when full)
- [x] `qc_review.sample_seed integer` — **retained.** Sampling is keyed on
      `series_instance_uid` (stable; **not** `file_id`). The persisted `qc_series`
      rows are the source of truth for membership; the seed only reproduces a
      draw or makes a deliberate re-draw / top-up deterministic. A plain clone
      copies the same series, so it never needs the seed.
- [x] `qc_series.modality` — denormalized onto the snapshot row (populated at
      insert via a `DISTINCT` lookup on `file_series` over `file_series_uid_idx`;
      modality is nullable there). Drives the stratified split + per-modality
      summaries; avoids per-file join+dedup. **Replaces** a `qc_review_modality`
      table. (`file_series` is per-file, so a UID maps to many rows.)
- [x] Sampled series remain a subset of `qc_series` rows (no change there)

#### B. Cloning a partial review — "carry-forward + reconcile" (recommended)

- [x] Default clone mode: copy `review_type` + `sample_percentage`; carry forward
      sampled series UIDs **and** their `qc_status`; recompute `series_file_hash`
      → mark changed series `stale`/pending (reuses existing stale machinery)
- [x] Reconcile to target %: drop series no longer in the draft; if population
      grew and the sample fell below target %, top up with new `pending` series
- [x] Alternative clone mode (explicit flag): fresh **re-sample** (new seed, no
      carried decisions)
- [x] Assignments reset on clone: new clone starts with one unclaimed
      whole-review slice (re-splitting is a separate action)

#### C. Assignment / splitting + "needs QC" pickup

- [x] `qc_review_assignment (assignment_id, qc_review_id, assigned_to NULL=unclaimed,
      assignment_status: needs_qc|in_progress|complete, share_percentage, audit cols)`
- [x] `qc_series.assignment_id` FK → `qc_review_assignment` (each series belongs to
      exactly one slice; this is how the stratified %-split is recorded)
- [x] On review create: auto-insert one assignment (share 100, unclaimed,
      `needs_qc`); point every `qc_series` at it
- [x] Split: insert N assignments with shares; redistribute `qc_series.assignment_id`
      **evenly per modality** (grouping by `qc_series.modality`) across them, with
      deterministic remainder rounding (round-robin leftovers) in the app layer
- [x] Pickup page query = `assigned_to IS NULL AND assignment_status='needs_qc'`
- [x] Keep `qc_review.review_status` for lifecycle only (don't overload it with
      assignment state); app validates shares sum to 100%

#### D. `user_flag` — per-user action items (polymorphic)

- [x] `user_flag (user_flag_id, object_type, object_id, series_instance_uid NULL,
      flagged_for, flagged_by, note, flag_status: open|resolved, resolve audit)`
      — `object_type`/`object_id` like `user_favorite`; `series_instance_uid`
      narrows within a `qc_review`. Named per the `user_*` convention; note the
      target is `flagged_for`, not an owner.
- [x] Distinct from `qc_status='flagged'` (a review decision, not a targeted task)
- [x] Dashboard action items = `flagged_for = :me AND flag_status='open'`

### ⭐ PRIORITY 1 — QC API layer (interface + viz tool)

New endpoints under the `/papi/v1/distribution` router, `qc/` namespace
(`distribution.py`). Follow existing conventions: `logged_in_user` dep,
`{data: …}` envelope, `api_error`. The viz tool lives in **Mirabelle** (separate
project) and consumes the viz-tool endpoints below.

**Implemented:** 22 routes in `distribution.py` — reviews (create/sampling, list,
detail, update, cancel, clone, split), assignments (list, queue, detail, update,
claim, release), series (list, summary, set status, batch status, history, files),
and flags (create, list, update). The draw is a shared `QC_DRAW_CTE` (used by
sampling + clone + the stale reconcile). Frontend Phases 0–C done; pagination
retrofitted (item #10).

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

- [x] **A. List series in an assignment, filter by status**
      `GET /distribution/qc/assignments/{assignment_id}/series`
      `?qc_status=pending&modality=CT&page=&limit=` (single-value filters) →
      `qc_series WHERE assignment_id=:id` + filters; returns uid, qc_status,
      modality, series_file_hash, notes
- [x] **A+. Files for a series in an assignment** _(added for Mirabelle)_
      `GET /distribution/qc/assignments/{assignment_id}/series/{series_uid}/files`
      → ordered by instance_number; returns file_id, num_of_frames, file_path;
      404 if series not in assignment
- [x] **B. Set one series' status**
      `PUT /distribution/qc/assignments/{assignment_id}/series/{series_instance_uid}/status`
      body `{ qc_status, notes? }` → validate series ∈ assignment; update
      `qc_series`; append `qc_series_history`; return updated row
- [x] **C. Batch set status** (avoid one-HTTP-per-series)
      `PUT /distribution/qc/assignments/{assignment_id}/series/status`
      body `{ series_instance_uids[], qc_status, notes? }` → one txn, history per series
- [x] **D. Supporting reads** — `GET …/qc/assignments/{id}` (assignment + review +
      draft context); `GET …/qc/assignments/{id}/series/summary` (counts by
      qc_status and modality×status, for filter chips + progress)

#### Interface endpoints (Posda UI)

- [x] Reviews: `GET/POST /distribution/recordsets/drafts/{draft_id}/qc-reviews`
      (POST samples, inserts `qc_series` w/ modality, auto-creates 1 assignment);
      `GET/PUT /distribution/qc/reviews/{review_id}`; `POST …/clone`
- [x] Split/assign/pickup: `GET …/qc/reviews/{id}/assignments`;
      `POST …/qc/reviews/{id}/split` (even %-per-modality + rounding);
      `POST …/qc/assignments/{id}/claim`; `PUT …/qc/assignments/{id}`;
      `GET …/qc/assignments?status=needs_qc&unassigned=true` (pickup queue)
- [x] Flags: `POST /distribution/flags`;
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
  - each slice gets `count // N` of the modality; the `count % N` leftovers are
    handed out by a **running round-robin pointer that persists across
    modalities** (updated 2026-08-06 — was keyed to `modality_index mod N`,
    which could skew totals, e.g. 5/3 for 8 series across many single-series
    modalities). The pointer advances only when a modality actually has a
    leftover, so **slice totals stay balanced to within 1** across the review.
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
        **2026-07-14: "My Action Items" commented out** — flags aren't in use yet
        (user decision, no creation UI exists anyway); "My QC Queue" stays live.
  - [x] No navbar change; pagination done now (queue server-paged). #10 still owns
        the pre-existing endpoints + `DynamicTable` explicit-mode/server-sort cleanup
- **Phase D — Flags creation (DEFERRED)**
  - [x] Extract shared `StatusBadge` (visual #6) + `Modal` (visual #4) — done in
        Phase 0; QC create/split modals already use them
  - [ ] `useCreateFlag` + "Flag for…" action (review/series → user + note) — deferred

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

### ⭐ PRIORITY 2 — UX efficiency plan (approved 2026-07-01)

Goal: make the app task-shaped, not entity-shaped — answer "what needs my
attention / where was I / what's the status" without click-diving. Diagnosis:
(1) navigation amnesia (list filters lost on back-nav), (2) context loss in the
3–4-level hierarchy (breadcrumb is just "← Section"), (3) status buried in
detail pages instead of surfaced on lists. Tiers ordered by user payoff; Tier 1
items are small and independent. Functional (Tier 1–2) work may interleave with
QC phases; the visual #8 design pass stays sequenced after QC.

**Tier 1 — stop wasting clicks**
- [x] Nav rework (user-directed, 2026-07-01): tabs merged into the top navbar
      (+ Dashboard tab), SubNav bar deleted, top gap tightened — see the
      updated Navbar bullet under item #8 for details
- [x] URL-as-state list filters (= item #7): filters + page in `useSearchParams`
      on datasets/recordsets lists → back button restores view; shareable URLs.
      Only non-defaults serialized; filter submits push history, page changes
      `replace`. Draft/transfer browsers still local-state (item #7 remainder).
- [x] Real breadcrumbs: `PageDetailHeader` gained a `breadcrumbs` trail prop
      (single `breadcrumb` still supported); deep pages (release detail,
      release transfers list/create, transfer detail, draft detail/files,
      recordset release, QC review) now show full trails. Labels use real names
      where the page already has them, else `Entity {id}` — upgrades free when
      pages later fetch names. No new API calls. Also fixed QC Queue breadcrumb
      pointing at orphaned `/dashboard` (→ `/`).
- [x] Loading primitives (= item #1) — **BUILT 2026-07-21**, except skeleton
      tables which were **tried and rejected** (see below):
      - [x] `components/ui/Spinner.tsx`: `Spinner` (`currentColor`) +
        `LoadingState` (spinner + label, `role="status"` +
        `aria-live="polite"`). Note `LoadingState` renders `text-muted`, so
        loading text is now gray rather than full-contrast foreground.
      - [x] Swept **27** inline `<p className="text-sm">Loading...</p>` sites
        across 21 files (estimate said ~23), incl. `DynamicSection` (one line,
        upgrades ~10 detail pages)
      - [x] `Button loading` prop: spinner beside the label + `gap-2` +
        `aria-busy` + auto-`disabled`; swept **20** text-swap sites (estimate
        said 15). Where a button had both a pending flag and a validity gate,
        they were split (`loading={x.isPending}` + `disabled={…}`). Three raw
        `<button className="btn …">` were converted to `Button` to take the
        prop, leaving those clusters mixed raw/component.
      - [x] ~~`DynamicTable loading` prop / skeleton rows~~ — **REJECTED
        2026-07-21.** Built as designed (header + N pulsing bars, 3 paginated
        tables restructured to always-rendered), then reverted on sight: the
        user disliked the skeleton flash and prefers the spinner. **Do not
        re-propose.** The call sites are back to
        `{isLoading && <LoadingState />}` / `{!isLoading && data && <DynamicTable>}`.
      - Kept from that work (independent of skeletons): `DynamicTable`'s
        empty-rows early return moved **below all hooks** — it previously sat
        above `useState`/`useMemo`, a conditional-hooks violation that throws
        "Rendered more hooks than during the previous render" when a mounted
        table goes 0 → N rows; and `renderBody()` now collapses what were two
        verbatim copies of the `<tbody>` block.
      - Out of scope: keep-previous-rows-while-refetching = TanStack
        `keepPreviousData`, belongs to item #2 migration
- [ ] StatusBadge coverage + semantic tokens (= item #8 subset): transfer +
      draft variants; `--success/--danger/--warning/--info` tokens

**Tier 2 — the app comes to the user**
- [ ] Dashboard 2.0: add Recently Viewed (localStorage ring buffer) and
      My In-flight Transfers to `Home`; fold/remove orphaned `/dashboard` pages
- [ ] Global quick-open (Ctrl+K palette): jump to dataset/recordset/draft by
      name (federate existing list endpoints; dedicated search endpoint later)
- [ ] Empty states with next-action CTA ("No drafts yet → Create draft")
- [ ] Row-level quick actions on lists (edit/favorite without detail round-trip)

**Design center (decided 2026-07-01): the RELEASE CYCLE.** Pages are organized
around "get version N checked, frozen, and distributed" — not around entity
metadata. Each page answers: where in the pipeline (assemble → verify → freeze
→ distribute → publicize), what changed since the last frozen version, what's
blocking / who has the ball, and what's the next action from here. Static
metadata (DOI, type, license, audit cols) is demoted to compact headers /
collapsed sections. Page-level redesign to this framing is in discussion.

**Release lifecycle — `dataset_release.release_status` (added 2026-07-21):**
`draft | released | live | retracted`. Every other stage of the pipeline already
carried a status; the releases did not. Three states that are **not derivable**:
- **draft** — being assembled. Previously unrepresentable: `POST` made a release
  the dataset's latest immediately, so there was no way to stage v3 while
  attaching recordset releases one at a time.
- **live** — a destination has published it externally. This is the state the IDC
  rule depends on ("changes pushed before ingestion overwrite in place; a new
  version number is only needed once IDC has gone live"). Posda cannot compute
  it — `transfer_status='success'` means *we uploaded*, not that IDC published.
- **retracted** — withdrawn after release. These carry DOIs.

Derivable state stays derived (superseded = `release_number < max`; distribution
progress = roll up `transfer_status`). **Nothing added to `recordset_release`** —
born final from a publish action, no assembly phase, superseded is derivable.

**"Latest release" now means highest non-retracted** (a draft still counts — a
release being assembled is the one you want to see). Defined as `NOT_RETRACTED`
in `distribution.py` and applied at both server call sites; `datasets/Detail.tsx`
filters client-side and must match — see [TECH_DEBT.md](TECH_DEBT.md) #6.
A draft release blocks distribution **in the UI only** (TECH_DEBT #5).

**Release-cycle decisions (2026-07-01):**
- **QC blocks publishing (strict — updated 2026-07-01).** Publishing requires
  **≥1 complete QC review AND none open/stale** (cancelled reviews don't
  count either way). A draft with zero reviews is NOT publishable. Implemented
  in the draft-detail Publish gate + `CurrentCycleCard` Publish stage
  ("Requires QC" when no reviews). ⚠ Backend does not enforce this yet —
  server-side guard on the publish endpoint is future backend work (flag:
  public API behavior change).
- **One open draft per recordset.** Unlikely to have more than one; can be
  restricted. UI: hide/disable "New Draft" while a draft is open; Current
  Cycle panel is a singleton. ⚠ DB/API-level restriction (unique partial
  index or endpoint guard) is future backend work.
- **Accent bar slims** 16px → 4px in the compact header (visual identity kept).
- Dashboard "cycles in flight" scope (mine vs all) — deferred, discuss later.

**Build order (approved):** 1. compact header (global) ✅ → 2. CycleStrip +
recordset detail restructure ✅ → 3. dataset detail restructure ✅ → 4. dashboard
cycles-in-flight (needs scope decision + maybe a backend aggregation endpoint)
→ loading primitives + StatusBadge/tokens slot in where natural.

**Step 2 done (2026-07-01):**
- `components/CycleStrip.tsx` — generic pipeline strip; stages
  `{key,label,state:done|active|blocked|pending,detail?,href?}`; accent dots,
  amber = blocked, hollow = pending. Reused by steps 3–4.
- `components/ui/CollapsibleSection.tsx` — CardHeader chevron toggle +
  SectionCard body, `title/summary/actions/defaultOpen`.
- `components/CurrentCycleCard.tsx` — recordset cycle cockpit: open draft
  (status ≠ published/deleted; singleton per one-draft policy) + QC aggregate
  from `useQcReviews` + diff vs latest release (`GET drafts/{id}/diff` bare =
  vs latest; response is **unenveloped** `DraftDiffResponse` w/ added_count /
  removed_count). Stale reviews → blocked stage + warning row. Empty state
  offers New Draft.
- `pages/recordsets/Detail.tsx` restructured: title = recordset name;
  subtitle = metadata strip (DOI · dataset · type · license · updated);
  Overview `DynamicSection` deleted; order = Current Cycle → Releases →
  collapsed (Draft History / Destinations / WordPress / Record Details w/
  audit). "New Draft" only shows when no open draft exists.
- `pages/recordsets/drafts/Detail.tsx`: Publish button disabled while any
  review is open/stale (`useQcReviews`), tooltip explains. UI-only gate —
  server-side enforcement still future backend work.

**Step 3 done (2026-07-01):**
- `components/LatestReleaseCard.tsx` — dataset-level distribute cockpit:
  latest release (max `release_number`) + per-destination transfer status
  **chips** (parallel destinations, so chips instead of the linear CycleStrip;
  colors by `transfer_status`, chip links to transfer detail). Empty states:
  no releases → New Release CTA; release w/o transfers → note.
- `pages/datasets/Detail.tsx` restructured same as recordset: title = dataset
  name, subtitle = DOI · type · updated strip, Overview `DynamicSection`
  deleted; order = Latest Release → Recordsets → Releases → collapsed
  (WordPress / Record Details w/ audit).
- Per-recordset-row draft/QC status chips on the Recordsets table = **deferred**
  (needs a backend aggregate to avoid N+1; revisit with step 4's endpoint).

**Tier 3 — workflow visibility (bigger design)**
- [ ] Lifecycle stepper on recordset/dataset detail: draft → QC → publish →
      release → transfer status strip
- [ ] Live transfer progress: TanStack `refetchInterval` polling on in-flight
      transfers / manifest generation
- [ ] **Per-file transfer progress** on transfer detail — `transfer_file`
      (one row per file per transfer, `status` pending/completed/failed,
      `error`, `attempts`, `file_dest_url`) is generic across all destinations
      now, but **no API and no UI touch it yet**. Needs a backend list endpoint
      first (paginated + `status` filter, per the List conventions) and a
      counts/summary aggregate so the transfer page can show progress without
      pulling every row. Pairs with the polling item above. See
      [IDC_TRANSFER.md](IDC_TRANSFER.md) DDL section.

Explicitly out of scope: component-library swap, mobile-first redesign,
replacing DynamicForm/DynamicTable.

### 1. Loading indicators (consistency) — DONE 2026-07-21

Goal: replace ad-hoc `<p>Loading…</p>` text with shared, accessible primitives.

- [x] Add `<Spinner>` / `<LoadingState>` primitive in `components/ui/`
      (consistent copy + `aria-busy`/`aria-live`)
- [x] Replace the inline `Loading…` sites across pages with it (27 sites)
- [x] Add a `loading` prop to `Button` (inline spinner + auto-`disabled`);
      retire the manual `{isSaving ? "Creating…" : …}` text swaps (20 sites)
- [~] ~~Add a `loading` prop to `DynamicTable` that renders skeleton rows~~ —
      **REJECTED 2026-07-21.** Built, viewed, reverted: the skeleton flash
      reads worse than the spinner. Lists keep the spinner-then-table pattern.
      Don't re-propose. Full rationale under Tier 1 above.

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

- [x] Build `Modal`/`Dialog` in `components/ui/` (Escape-to-close, focus trap,
      scroll lock) — done in Phase 0 (`components/ui/Modal.tsx`)
- [ ] Migrate the WP-link modal in `datasets/Detail.tsx` to it
- [ ] Reuse for future confirm dialogs

### 5. DynamicTable improvements

Goal: explicit, predictable paging.

- [ ] Add explicit `mode: "client" | "server"` prop; drop the
      `totalItems > rows.length` heuristic
- [ ] Define sort behavior under server paging (disable, or server-side sort)
- [~] ~~Wire in the `loading` prop from item 1~~ — **dropped**, skeleton rows
      rejected (item #1). Loading stays outside the table, as a spinner.
- [x] **Fixed 2026-07-21:** the empty-rows early return sat *above* every
      `useState`/`useMemo`, a conditional-hooks violation (React throws when a
      mounted table goes 0 → N rows). Moved below all hooks; column inference
      now guards `rows[0]` itself rather than relying on that return.
- [x] **Restyle 2026-07-21 (user-directed):** `.data-table` in `globals.css`
      gives cells a real grid — `td` `1px solid var(--border-strong)`, table
      `2px` (wider border wins under `border-collapse`, so the outer edge reads
      stronger), `th` translucent white 20% to stay visible on the accent
      header. Replaced the old near-invisible `border-black/5` row rule. Row
      height tightened `py-2` → `py-1` on `th`/`td` (~37px → ~29px); the
      `scroll.maxVisibleRows` row-height constant went `41` → `33` to match.
      ⚠ Rows containing `.btn-sm` (h-8) keep a 32px floor, so action rows are
      taller than text rows in the same table.

### 6. Toast & feedback polish

Goal: don't drop messages; faster perceived response.

- [ ] Queue/stack toasts instead of single-at-a-time replacement
- [ ] Apply optimistic-update pattern to favorites (ties to item 3)

### 7. URL-as-state for list filters

Goal: make list filters durable, shareable, and bookmarkable.

Independent of the item-2 library decision. Today `datasets/List.tsx` (and the
other list pages) hold search / type / active / pagination in local `useState`,
so filters are lost on navigate-away-and-back and can't be linked or bookmarked.

- [x] Move list filter + pagination state into React Router search params
      (`useSearchParams`) instead of local `useState` — done for the two List pages
- [~] Apply across both List pages (datasets ✓, recordsets ✓); the draft/transfer
      browsers still TODO
- [x] Ensure deep-linking works: a pasted URL reproduces the filtered view
      (non-default params only, so bare URLs stay clean)

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
- [~] **Shared `<StatusBadge status=…>`:** `components/ui/StatusBadge.tsx` exists
      (done in Phase 0) with QC/review/assignment/flag variants. Still needed:
      transfer (`draft/queued/in_progress/success/failed`) and recordset draft
      (`open/ready/invalid/published`) variants; replace raw-text status rendering
      in those tables
- [ ] **Manual theme toggle:** switch to class-based dark mode (`.dark` on
      `<html>`) + a Navbar/Settings toggle persisted to `localStorage`
      (currently `prefers-color-scheme`-only, no user override). Deliberately
      localStorage, not DB — avoids flash-of-wrong-theme on load. See item #9.
- [ ] **Button focus ring:** add a `:focus-visible` ring to `.btn` (inputs have
      a focus outline; buttons have none → invisible keyboard focus)
- [x] **Navbar (single-bar, 2026-07-01):** section tabs (Dashboard / Datasets /
      Recordsets / Transfers / QC) live **in the top navbar** next to the logo;
      active section via prefix match (Dashboard = exact `/`). The interim
      `SubNav` bar was removed (component deleted, `--subnav-height` gone,
      `body` padding-top / `page-shell` min-height back to navbar-only).
      `page-shell` top padding tightened `py-10` → `pt-4 pb-10`; breadcrumb
      margin `mb-2` → `mb-1`. "Logged in as: username" hides below `lg` to
      avoid crowding the tabs.
- [ ] **PageShell sizes:** `3xl/5xl/6xl` all resolve to one `72rem` max-width —
      give the tiers real widths or remove the dead prop
- [x] **Dark-mode surfaces (confirmed intentional, 2026-07-14):** cards
      (`--surface #1a2035`) are darker than the page (`--background #243050`) —
      a "recessed panel" look, not the more common lighter-card elevation
      (Material/GitHub/Discord/Linear all lighten surfaces in dark mode). Tried
      flipping it (background `#1a2035` / surface `#243050`) as a live test;
      user disliked it — reverted. Keep the recessed direction.
- [x] **Color scheme — LOCKED IN (2026-07-14): muted slate-navy (Variation B).**
      Tried 3 base families live (neutral gray, warm neutral, deeper-contrast
      navy) → picked deeper-contrast navy. Tried 3 hue-lean variations on it
      (indigo, muted slate, teal) → **muted slate-navy is the winner** (a teal
      re-look and a "go back to the blue" round confirmed it over teal).
      Dark mode: background lightened in three passes from the first pass
      (`#12161f` felt "REALLY dark") up to `#303950`, and the background/surface
      relationship **flipped to recessed** (cards darker than page) — confirmed
      on two different palettes now, so recessed dark cards are the settled
      house style. `--border-strong` was bumped from `#2c3550` to `#4a5680`
      after the lighter background made the page-header divider unreadable —
      **if the dark background changes again, re-check this border still has
      contrast against it.**
      ```
      Light: --background #e2e5eb  --foreground #1c2333  --surface #ffffff
             --surface-alt #d5d9e2 --muted #55606f
             --accent #3a5ba0 --accent-hover #2f4c86
             --border rgba(74,86,107,.2) --border-strong rgba(74,86,107,.35)

      Dark:  --background #303950  --foreground #dde1e8  --surface #1a2130
             --surface-alt #1e2636 --muted #8b95a8
             --accent #7c93c9 --accent-hover #93a8d6
             --border #222a3c --border-strong #4a5680
      ```
- [x] **Sub-header consistency (2026-07-14):** `.card-header` (the "Releases",
      "Current Cycle", etc. section headers used via `CardHeader`/`CardTitle`
      and `CollapsibleSection`) had an `8px` left accent bar — double the main
      `.page-header`'s `4px` bar from the compact-header pass, and `text-sm
      font-bold uppercase tracking-wider` titles that read loud despite the
      small font size. Replaced the left bar with a full-width `2px` accent
      **bottom** border, dropped `uppercase`/`tracking-wider`/`font-bold` →
      `font-semibold`, trimmed padding/`min-height` slightly. Applies
      everywhere via the shared `.card-header`/`.card-title` classes.

**Current baseline tokens (as of 2026-07-14, post brightness-tune):**
```
Light: --background #e7ebf2  --foreground #1f2937  --surface #ffffff
       --surface-alt #e0e6ef --muted #516079
       --accent #2563eb --accent-hover #1d4ed8
       --border rgba(148,163,184,.18) --border-strong rgba(100,116,139,.35)

Dark:  --background #243050  --foreground #d0d8e8  --surface #1a2035
       --surface-alt #1e2840 --muted #8899b8
       --accent #4a8fd4 --accent-hover #5a9fe4
       --border #263352 --border-strong #2e4270
```
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

### 11. Browser tab titles (document.title)

Goal: pages currently all show the static `index.html` title ("Posda Release
Module") in the browser tab, regardless of route — no page sets
`document.title`. Add per-page tab titles so tabs are distinguishable when a
user has several open (e.g. two dataset detail pages, a draft + its QC review).

- [ ] Add a small `usePageTitle(title: string)` hook in `lib/` — sets
      `document.title` (format TBD, e.g. `"${title} · Posda"`) on mount/update,
      restores the previous title on unmount
- [ ] Call it from each page component with a short, often dynamic string
      (e.g. `Dataset ${dataset.name}`, `"Edit Dataset"`, `"QC Queue"`) — static
      pages get a literal, detail/edit pages use the fetched entity name once
      loaded (fall back to a generic label while loading)
- [ ] Sweep all routes in `App.tsx` for coverage; no route should be left on
      the default title
- [ ] Decide title format/suffix convention and whether loading state shows a
      generic title or the id until the name resolves

### 10. Server-side pagination on ALL list endpoints

Goal: every list endpoint honors `page` + `limit` and returns `total`, per the
PRIORITY 1 **List conventions**. Today the existing `/distribution` lists
(`datasets`, `recordsets`, releases, drafts, transfers, lookups, …) ignore the
`page`/`limit` the frontend already sends and return **all** rows
(`list_response` → `{data, meta:{count}}`), so large tables load everything and
paginate client-side. Applies to existing endpoints *and* the new QC/flag ones.
(See [TECH_DEBT.md](TECH_DEBT.md) #4.)

**Scoping decision (2026-07-01):** Paginate only the four endpoints that can grow
large. Lookup tables, sub-resource lists, and other bounded lists stay as-is
(return all rows). Also noted: `GET /recordsets/{id}/destinations/{dest_id}` uses
`list_response` but is semantically a single item — fix to `item_response` separately.

**Paginated** (use `paged_response` / `page_clause`):
- `GET /recordsets/drafts/{draft_id}/qc-reviews`
- `GET /qc/assignments`
- `GET /qc/assignments/{assignment_id}/series`
- `GET /distribution/flags`
- [x] `GET /datasets` — order by `dataset_id desc`
- [x] `GET /recordsets` — order by `recordset_id desc`
- [x] `GET /recordsets/drafts/{draft_id}/files` — order by `file_id`
- [x] `GET /recordsets/releases/{release_id}/files` — order by `file_id`

**Infrastructure:**
- [x] Unified `paged_response` + `page_clause` helpers (renamed from `qc_*`; all
      existing QC call sites updated)
- [x] Frontend `datasets/List.tsx` + `recordsets/List.tsx`: normalize functions
      updated to prefer `meta.total` over `meta.count` for `totalItems`
- [ ] Frontend: URL-synced page state (ties to item #7)
- [ ] Frontend: explicit `DynamicTable` server mode prop (ties to item #5)
- [ ] Converge per-page `normalize*Response` shims (tech-debt #3)
