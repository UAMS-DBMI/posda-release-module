# CYCLE_WIZARD.md — the guided release cycle

Build plan and running record for the release-cycle wizard: the guided path that
takes a dataset from "some recordsets changed" through to "distributed", without
a curator ever leaving the cycle view.

See [DEV.md](DEV.md) for the wider workstream history, [TECH_DEBT.md](TECH_DEBT.md)
for deferred cleanup, and [IDC_TRANSFER.md](IDC_TRANSFER.md) for the destination
side of distribution.

## Why

The cycle page shows the pipeline but behaves as a launchpad: every action
navigates away to a form that re-asks for values the system already knows, and
the surface contradicts itself — `?stage=draft` is a read-only tab while
`/cycle/start` is a separate route that does the work. Two addresses for one
stage. `Cycle.tsx` already holds four panels and was about to absorb four sets of
action modals.

Shipping one version of a 4-recordset dataset currently takes ~30 screens. Most
of that is bookkeeping the UI outsources to the curator — draft names, release
numbers, dates, which recordset releases belong in a release, which destination
to use. All of it is derivable.

**These processes are new to the curators.** The interface has to teach the
pipeline, not merely speed it up for people who already know it.

## Decisions

| | |
|---|---|
| **Routes are stages** | Each stage gets its own route and file; the tab strip is navigation, not local state |
| **The stage page is the working surface** | Lists, selection, and that stage's primary action live on the page — there is no multi-step wizard modal |
| **Modals are single-purpose inputs** | One modal, one thing to fill in, addressed `?action=…`. Nothing navigates away, and nothing nests |
| **Six stages** | `/cycle/setup`, `/cycle/assemble`, `/cycle/verify`, `/cycle/bundle`, `/cycle/transfer`, `/cycle/disseminate` — routes match tab labels |
| **Stage vs. entity naming** | Stage names are activities (Assemble, Verify, Bundle); the data keeps its own names — Assemble creates **drafts**, Verify runs **QC reviews**, Bundle publishes **releases** |
| **`/cycle` is an overview** | A real landing view, not a redirect |
| **Forms are extracted, never duplicated** | Pattern set by `lib/recordsetForm.ts` |
| **Bulk writes are transactional** | One endpoint per stage action, all-or-nothing, so the page can be honest about what it will do |
| **The cycle is built on a draft `dataset_release`** | A draft release is the cycle's identity, created explicitly via "Start Next Cycle" before Assemble does anything — but it does **not** constrain composition; Bundle still freely decides membership (see below) |

**The cycle sits on a draft `dataset_release` (added 2026-07-24).** Until now,
no `dataset_release` existed before Bundle composed one — "the cycle" had no
identity, only inferred from which recordsets happened to have an open draft.
Found while planning step 3: this is also *why* two known gaps existed (no
one-draft-per-dataset guard; no way to say "what ends a cycle"). Both are now
solved by giving the cycle an explicit container.

- **Option A, not B:** the draft release is created early and gives the cycle
  identity + the one-draft-per-dataset guard (via `unq_dataset_release_release_number`
  + `release_status`), but `recordset_draft` stays **unlinked** to it. Bundle
  still composes membership via include-latest checkboxes exactly as planned —
  this preserves "recordsets don't move together" (above), which a tighter
  Option B (drafts tied to a release from creation) would have broken.
- **"Start Next Cycle"** (`CycleNextAction.tsx`, `useStartNextCycle` in
  `lib/useCycle.ts`) creates the draft release by calling the existing
  `POST /datasets/{id}/releases` with an empty body — `release_number`
  auto-assigns (max+1 for the dataset) and `release_notes`/`release_doi` stay
  null; deferred to Bundle. Surfaces in the next-action banner's "nothing
  outstanding" branch (renamed "no cycle in progress"), which is only reached
  when no draft exists (an existing draft keeps Bundle `active` until
  released, so `nextAction()` is never null while one exists). **Also needs a
  home on the Overview page (step 8)** once that's built — not done yet since
  Overview doesn't exist.
- **Gate:** `isCycleActive(cycle)` (`lib/useCycle.ts`) = `latest_dataset_release
  ?.release_status === "draft"`. Assemble/Verify should show read-only "last
  completed cycle" state and hide their working controls when false — this is
  step 3's starting point, not yet wired into `AssembleStage.tsx`.
- **Bug found immediately after landing:** `CycleNextAction` originally showed
  the button only when `nextAction(cycle)` was `null` — but `nextAction()`
  returns *Setup's* next-action first whenever Setup isn't fully done (WP
  linking etc.), which is true for nearly every dataset, so the null branch
  was practically unreachable and the button never appeared. Fixed to check
  `isCycleActive(cycle)` directly, independent of per-stage readiness — a
  cycle can start regardless of Setup's state. Also added the release number
  to `CycleLayout`'s header subtitle (`· vN (status)` / `· no release yet`).
- **Prerequisite landed same day:** `dataset_release.release_date` was
  `NOT NULL`, which blocked creating a draft release before a date is known.
  Made nullable (DDL + live DB + `DatasetReleaseInsert`); null while draft,
  auto-stamped `now()` when `release_status` → `released` (`coalesce(release
  _date, now())` in both `create_dataset_release` and `update_dataset_release`,
  so an explicit caller-supplied date still wins). `recordset_release
  .release_date` unaffected — freezing is a concrete moment, stays required.
  Every frontend read of a dataset release's date is now null-guarded
  (`useCycle.ts`, `BundleStage.tsx`, `LatestReleaseCard.tsx`, `datasets/Detail.tsx`,
  `datasets/releases/Detail.tsx`, `transfers/List.tsx`); `releases/Create.tsx`
  dropped the date field entirely (new releases always start as drafts);
  `releases/Edit.tsx` made it optional with a "leave blank to auto-stamp" hint.
  Fixture: dataset 3's draft release in `create_dataset_module_test_data.sql`
  changed from a placeholder `NOW()` to `NULL`.
- **Changes step 5 (Bundle)'s scope:** the plan had Bundle's confirm modal
  *create* the release (collecting number/date/notes). Now the draft release
  already exists by the time Bundle runs, so that step becomes an **update**
  (finalize notes, flip `release_status` to `released`) rather than an insert.

**Why no wizard modals.** An earlier draft had a multi-step `WizardModal` per
stage. Once routes became stages, that collapsed: the stage page already provides
the list, the selection, and the primary action, so a wizard modal would just be
a second copy of the page floating above it. Per-item input (choose a source for
*this* recordset, publish settings for *this* draft) is a small modal opened from
a row. This also removes modal-over-modal entirely — the `Modal` primitive
registers a document-level Escape listener per instance, so two at once would
both close.

**Recordsets do not move together.** A dataset release v3 may bundle rs1 v3
(newly frozen) beside rs2 v1 (unchanged, carried forward). The fan-in is a
*composition*, not a synchronised freeze. This is the single most important thing
the UI has to make visible, and it drives the Bundle step.

## Architecture

```
/datasets/:dataset_id/cycle              CycleLayout: header + next-action banner
                                         + tab strip + <Outlet/>
  index                                  Overview — whole pipeline at a glance
  setup         ready the dataset        ?action=new-recordset | wp-collection
  assemble      gather files into drafts ?action=source
  verify        QC review                ?action=setup-qc
  bundle        freeze + compose release ?action=publish | new-release
  transfer      ship the data            ?action=new-transfer
  disseminate   landing pages, go live   ?action=new-version | go-live
```

Six stages: **Setup · Assemble · Verify · Bundle · Transfer · Disseminate**.

Stage names are the *activity*; the data keeps its own name. **Assemble** builds
`recordset_draft`s, **Verify** runs `qc_review`s, **Bundle** publishes drafts
into `recordset_release`s and composes the `dataset_release`. So a route is
`/cycle/verify` even though the entity is a QC review — the tab tells a curator
what they're doing, not which table it touches.

**Setup vs. cycle — the dataset itself is created first, outside the cycle.** A
dataset is made from the Datasets list (that flow is unchanged). Everything
*downstream of the dataset but done once* lives in Setup: attach or create the
WordPress collection page, add or attach recordsets with their WP downloads and
transfer destinations, and dataset relations. Setup is where a dataset becomes
*ready to run cycles*; Assemble onward is the per-version work that repeats. This
is the one-time-vs-per-version split that was previously smuggled into Assemble,
step 5a, and Disseminate — now it has a home.

Setup is **not** a second dataset detail page. `datasets/Detail.tsx` stays the
general record view reached from the Datasets list; Setup shows readiness in
cycle context through the **same shared form modules**, framed as "is this
dataset ready?" rather than a metadata form.

**Transfer**, not "Distribute" — it matches the model (`dataset_release_transfer`,
the `transfer_*` tables) and the existing Transfers nav section, and it stays
clearly distinct from Disseminate. Two near-synonyms adjacent in a tab strip
would not be guessable.

**Bundle covers both acts** — freezing changed drafts into recordset releases
*and* composing the dataset release from everyone's latest. They almost always
happen in one sitting, and keeping them together is what lets the include-latest
list show the fan-in in the same view. ⚠ Freezing is irreversible (a
`recordset_release` can't be deleted); the name emphasises the composition, so
the Bundle confirm step must make the permanence explicit.

**Transfer moves data; Disseminate publishes pages.** These are genuinely
different facts — `transfer_wp` moves *files* into WordPress
(`wp_media_file_id`), while Disseminate is about the *landing page* being
public. See the `data_is_live` / `page_is_live` open question below.

Modals addressed by `?action=` stay URL-addressable (the dashboard's next-action
links depend on it), the back button closes them, and context is preserved.
Stage state comes from the single `useDatasetCycle` query held by the layout.

### Form reuse — the core constraint

Each entity gets a `lib/<entity>Form.ts` owning **field configs, lookup hooks,
validation, and payload builder**. Callers supply only layout and what happens
after a save.

| Module | Consumers | Status |
|---|---|---|
| `lib/recordsetForm.ts` | `recordsets/Create.tsx`, `CreateRecordsetModal` (Setup + Assemble) | ✅ done |
| `components/ActivitySourcePicker.tsx` | Assemble source modal, draft `Files.tsx` | ⚠ built; `Files.tsx` not yet migrated |
| ~~`lib/qcReviewForm.ts`~~ → `components/QcReviewModal.tsx` (shared modal, not a pure lib — see step 4; gained a `nonDicom` mode 2026-08-06) | `QcReviewsCard.tsx`, Verify | ✅ done |
| `lib/publishForm.ts` | `drafts/Detail.tsx`, Bundle modal | ☐ |
| `lib/datasetReleaseForm.ts` | `releases/Create.tsx`, `releases/Edit.tsx`, Bundle modal | ☐ |
| `lib/transferForm.ts` | `releases/transfers/Create.tsx`, Transfer stage modal | ☐ |
| `lib/wpObjectForm.ts` | Setup (collection/download), Disseminate (version), dataset/recordset create | ☐ |

> **Rule:** any step that adds a modal without extracting the form first is doing
> it wrong.

### Shared shells

- **`Modal`** needs an `xl` size — it caps at `max-w-lg`, too narrow for the
  activity browser in the source modal.
- **`Tabs`** needs optional `href` per tab so the strip renders `Link`s.
- No `WizardModal` — see "Why no wizard modals" above.

### Bulk endpoints — `distribution.py`, `cycle/` namespace

One transaction each, reusing `item_response` / `api_error` / `logged_in_user`.

```
POST /datasets/{id}/cycle/drafts      [{recordset_id, activity_timepoint_id}]   ✂ retired 2026-08-04
POST /datasets/{id}/cycle/qc-reviews  -- never built; ✂ dropped for per-row
                                      POST /recordsets/drafts/{id}/qc-reviews    ✂ retired 2026-08-06
POST /datasets/{id}/cycle/publish     [{recordset_draft_id, release_number?}]    ☐
POST /datasets/{id}/cycle/release     release_number?, [{recordset_release_id}]  ☐
POST /datasets/{id}/cycle/transfers   [{destination_id}], generate_manifests?    ☐
```

WordPress routes for Disseminate live in `manager.py`, not here:

```
POST /manager/wp-objects                     create WP post + map row            ☐
PUT  /manager/wp-objects/{id}/status         flip draft <-> publish              ☐
POST /manager/posda/dataset/{id}/wp/publish  bulk go-live for a dataset's set    ☐
```

## Steps

Each lands and is reviewed before the next.

- [x] **1 — Route restructure.** *(done 2026-07-22)* Create `CycleLayout`; split `Cycle.tsx`'s panels
      into `pages/datasets/cycle/{SetupStage,AssembleStage,VerifyStage,BundleStage,TransferStage}.tsx`
      (Disseminate arrives in step 7). Add `href` to `Tabs`. Rewrite the
      `StageKey` union in `lib/useCycle.ts` to
      `setup | assemble | verify | bundle | transfer | disseminate` (from the old
      `draft | qc | release | distribute`) — which touches `stageSummaries`,
      `firstUnfinishedStage`, and `nextAction`. Redirect `?stage=` to the new
      routes so existing links survive. Pure movement — no behaviour change.
      (`SetupStage` starts empty; step 2 fills it. Its `stageSummaries` entry:
      `done` once every recordset has a destination and a WP collection map,
      else `active`.)
- [x] **2 — Setup stage.** Everything downstream of the dataset but done once.
      The page lists recordsets with their readiness (destination set? WP
      download mapped?), plus the dataset's WP collection page status.
      - [x] **Recordsets** created here via `CreateRecordsetModal`; a shortcut to
        the same modal stays on Assemble, unchanged by this step.
      - [x] **Destinations** managed via a row-level "Destinations" button
        (`RecordsetDestinationModal`, add/edit one at a time) rather than at
        creation — reversed from the original "collect at create" plan (see
        log). Same shared component is used from `recordsets/Detail.tsx`.
        *(done 2026-07-22)*
      - [x] **Destination pills.** *(done 2026-07-22)* `DATASET_CYCLE_RECORDSETS_SQL`
        (the CTE backing `GET /datasets/{id}/cycle`) gained a `dest` CTE — two
        parallel `array_agg`s (destination_abbr, default_display) joined per
        recordset, avoiding `json_agg` (no precedent for it in
        `distribution.py`). Also added a `wp_download` CTE / `wp_linked` flag in
        the same query while touching it — used starting with the WP work below.
        `CycleRecordset` gained `destinations`/`wp_linked`; `SetupStage.tsx`
        renders one `StatusBadge` per destination (`success` for the default,
        `neutral` for the rest) in its own column, instead of only a bare
        button — reuses the pill primitive already used for QC/review/assignment
        status, no new chip component.
      - [x] **WP collection + downloads — link now, create is new backend work.**
        *(done 2026-07-22, incl. Setup wiring)* `SetupStage.tsx` gained a
        "Collection Page" card above the table (dataset-level, `useWpMap`)
        and a per-row WordPress column (status badge + button, using the
        `wp_linked` flag added to the cycle query alongside destinations).
        `useSaveWpLink`/`useCreateWpObject` also invalidate `["dataset-cycle"]`
        on success — same fix as the destinations save, so the Setup table
        doesn't need a reload to reflect a change.
        Search-and-link to an *existing* WP post already works today, hand-rolled
        near-identically in `recordsets/Detail.tsx` (recordset → `download`) and
        `datasets/Detail.tsx` (dataset → `collection`/`analysis_result`), both via
        `GET/POST/PUT /manager/wp-object-map` +
        `GET /manager/posda/{type}/{id}/wp-map`. Extracting it once:
        - `lib/wpObjectMap.ts` — `useWpMap` (404 → `null`, not an error),
          `useSaveWpLink`, plain `searchWpObjects` helper; consolidates the
          `WpMap`/`WpSearchResult` types currently duplicated in both Detail
          pages.
        - `components/WpLinkModal.tsx` — shared modal (built on `Modal`, same
          shape as `RecordsetDestinationModal`), parameterized by
          `posdaObjectType` (`dataset`/`recordset`) and a `typeOptions` list
          (1 entry ⇒ no selector; 2 ⇒ the dropdown `datasets/Detail.tsx`
          already has for collection vs analysis_result). Two tabs: **Link
          Existing** (today's search UI, moved verbatim) and **Create New**.
        - **Create New is genuinely new backend work** — `POST /manager/wp-objects`
          and `PUT /manager/wp-objects/{id}/status`, reusing `WP_TYPE_MAP` /
          `wp_post` / `wp_patch` from `util/wp.py` (write plumbing exists, no
          route has called it until now) and mirroring the existing
          `create_wp_object_map` insert. Every `format_*` spreads `_base(item)`,
          so `id`/`edit_url`/`view_url` exist regardless of WP type — one
          generic route works for all of them. **DOI assignment stays out of
          scope** — DEV.md says "Posda supplies title, slug, and DOI" but no
          DOI-minting scheme exists anywhere yet; create with title+slug as a
          draft stub, DOI stays a manual WP edit until that's designed.
        - Both Detail pages migrate onto `WpLinkModal`/`useWpMap`, replacing
          their hand-rolled state/effect/modal — refactor only, no behavior
          change there.
        - `SetupStage.tsx` gets two new surfaces: a dataset-level "Collection
          Page" card above the recordset table (`useWpMap("dataset", id)`,
          `typeOptions=[collection]`), and a per-row "WordPress" button
          (`typeOptions=[download]`) beside the row's "Destinations" button.
          Row-level linked/not-linked status reuses the same cycle-query
          extension pattern as destination pills (another `left join` against
          `wp_object_map`, not a per-row fetch).
      - [x] **WordPress links required to leave Setup.** *(done 2026-07-22)*
        `get_dataset_cycle` gained `dataset_wp_linked` (a `wp_object_map` lookup
        for the dataset's `collection`). `setupStage()` in `useCycle.ts` is no
        longer a placeholder: `done` requires every recordset's `wp_linked` **and**
        `dataset_wp_linked` — otherwise `active` with a detail naming what's
        missing (`"N not linked"` / `"Collection not linked"`). New
        `unlinkedRecordsets()` helper (mirrors `unbundledRecordsets()`).
        **Destinations are not part of this gate** — only WP links, per this
        decision; the original step-1 note ("done once every recordset has a
        destination and a WP collection map") is superseded on the destination
        half until/unless that's explicitly asked for too.
      - [x] **Destination pill delete + button label.** *(done 2026-07-22)*
        New `DELETE /recordsets/{id}/destinations/{destination_id}` (no delete
        route existed — only get/put). `dest` CTE in
        `DATASET_CYCLE_RECORDSETS_SQL` gained `destination_ids` (needed to
        target the delete); `CycleRecordsetDestination` gained `destination_id`.
        `lib/recordsetDestinations.ts` gained `useDeleteRecordsetDestination()`
        — takes `{recordsetId, destinationId}` **per call, not per hook**, so
        one instance in `SetupStage.tsx` can serve every row in the table
        (calling a hook inside a `.map()` render callback would break the
        Rules of Hooks). Setup's destination pills now carry an inline "−"
        button; the WordPress buttons (dataset collection card + per-row) were
        relabeled "Link".
      - [x] **WP link robustness pass.** *(done 2026-07-23)* Fixed Analysis
        Result datasets always creating/linking a `collection` object instead
        of `analysis_result` — neither Setup nor `datasets/Detail.tsx` derived
        WP type from `dataset_type_name`; new `wpTypeOptionForDataset()` fixes
        both. Live status is now fetched by immutable `wp_object_id` rather
        than ever caching a slug (`useWpObject` + `wpObjectQueryKey`), and
        shows "Broken Link" (deleted WP post) and "Trashed" (real WP `status`
        field, not slug string-matching) states, with a skeleton placeholder
        to avoid a "Linked" flash before the slug loads. Backend
        `wp_collection_q` had a hardcoded `wp_object_type = 'collection'`
        filter that silently broke Analysis Result linkage; removed (the
        `wp_object_map` unique constraint means existence alone is enough).
        `WpLinkModal` gained an **Unlink** action. Setup's status
        message/gating now checks the dataset's WP link before recordsets',
        matching the required link order.
      - [x] **Recordset downloads auto-attach to the dataset's WP page.**
        *(done 2026-07-23)* Linking a recordset's WP `download` now also adds
        its post id to the dataset's `collection_downloads` /
        `result_downloads` field (`manager.py`'s `_attach_download_to_dataset`),
        non-fatal on failure (surfaces as a toast warning, doesn't fail the
        link). A read-only banner flags downloads listed on the dataset's page
        that aren't linked to any recordset here (detection only, no
        auto-remediation), excluding trashed downloads from the count.
      - [x] **Quick-edit modals.** *(done 2026-07-23)* `DatasetEditModal` /
        `RecordsetEditModal` let a curator edit the dataset's or a recordset's
        own record (name, type, DOI, license, active) without leaving Setup —
        opened from a pencil-icon button beside each name. Built on new
        `lib/datasetForm.ts` and an edit-mode extension of
        `lib/recordsetForm.ts`, both shared with the full `Edit.tsx` pages
        (migrated onto the same modules, refactor only).
      - [x] **UI polish.** *(done 2026-07-23)* Icon-only action buttons
        (`components/icons.tsx` — Edit/ExternalLink/Link, hand-rolled SVG
        matching `FavoriteStar.tsx`) with tooltips replace text buttons for
        WordPress link/view/edit and record-edit actions; dataset/recordset
        name links open in a new tab so Setup stays in place; modal
        backdrop-click-to-close disabled globally (`Modal`'s `closeOnBackdrop`
        now defaults `false` — Escape and explicit buttons still work); tab
        strip status dots gained a checkmark for `done` and a pulse for
        `active`; WP search results decode HTML entities in titles.
      - **Relations** (`dataset_relation`, isDerivedFrom / isSourceOf) — an
        analysis result points at its source collection here. Not yet planned
        in detail.
      - [x] **"Latest release" ambiguity fixed.** *(done 2026-07-24)*
        `DATASET_CYCLE_RECORDSETS_SQL` gained a `last_bundled` CTE — max
        `dataset_release.release_number` reachable via
        `dataset_release_recordset` for any of that recordset's releases —
        exposed as `CycleRecordset.last_bundled_dataset_release_number`
        (nullable). Both `SetupStage.tsx` ("Latest Release" column) and
        `AssembleStage.tsx` ("Frozen At" column) now show a second line
        ("last bundled: dataset vN") under the recordset's own version when
        present.
      - No removal action for recordsets in Setup — **confirmed correct, not
        a gap.** Dataset↔recordset membership is structural; what varies per
        release is only which `recordset_release` gets bundled (Bundle
        stage's include-latest checkboxes — a recordset just goes unchecked,
        it isn't removed). True recordset deletion is a rarer, heavier
        operation and stays on `recordsets/Detail.tsx`/Edit, outside the
        guided cycle.
      - Setup has no bulk write of its own; it's create/attach actions plus a
        readiness view. A dataset with zero recordsets can't leave Setup.
- [x] **3 — Assemble stage does the work.** *(done 2026-08-04 — see log)* The
      page is a hand-rolled table over the cycle's recordsets. Each row without a
      draft gets **Create Draft** (`CreateDraftModal`, per-recordset source pick);
      each row with one gets **Mark Ready / Reopen** (a `draft_status` action,
      gated on `file_count > 0`) and **Manage** (`ManageFilesModal`), plus an
      expand chevron that reveals `DraftSummary` inline. Draft editing now lives
      **inside the cycle** — no more Open-Draft excursion to `Files.tsx` (its
      diff-and-add flow was replaced by the series endpoints below). The old
      checkbox / Choose-Source / Create-N-Drafts / `POST /cycle/drafts` design
      and `StartCycle.tsx` were all removed.
      - **New prerequisite (2026-07-24):** gate on `isCycleActive(cycle)`
        (`lib/useCycle.ts`) — the checkboxes/source-picker/Create-N-Drafts
        controls only render when a draft `dataset_release` exists. When it
        doesn't, show the read-only "last completed cycle" state instead,
        with a pointer to "Start Next Cycle" (the next-action banner already
        has it; Overview will too once built). Also add the same gate note to
        step 4 (Verify) below — both stages need it, not just Assemble.
      - `Modal` needs its `xl` size added first (see "Shared shells" above) —
        the activity/timepoint browser is cramped at today's `max-w-lg` cap.
- [x] **4 — Verify.** *(done 2026-08-06 — see log)* Bring QC-review *creation* into the cycle. **Design
      settled 2026-08-04** (supersedes the original checkbox/bulk sketch —
      Verify mirrors the Assemble rework: per-row actions, no bulk endpoint):
      - **No bulk `POST /cycle/qc-reviews`** — dropped for the same reason
        `/cycle/drafts` was retired. Per-row create hits the existing
        `POST /recordsets/drafts/{id}/qc-reviews`.
      - **`VerifyStage.tsx` rewritten to mirror `AssembleStage`:** hand-rolled
        table with a per-row expand chevron. Row actions gated on
        `isCycleActive`:
        - `reviews_total === 0` → primary **Start QC** → create modal defaulting
          to **full**, `assign_to_caller: true` (first review = the caller's).
        - `reviews_total > 0` → row shows progress/status; **expanding** lazily
          fetches `useQcReviews(draftId)` (like `DraftSummary` self-fetches) and
          lists the draft's reviews, each linking out to `/qc/reviews/:id`; a
          secondary **Add Review** creates with `assign_to_caller: false`
          (unclaimed → pickup pool). Stale reviews surface here and point to the
          review page's re-clone.
        - `!isCycleActive` → read-only, no create (same as Assemble).
      - **Review-type default = full, partial available** in the modal.
      - **Assignment rule:** first review on a draft is **claimed by the caller**
        (born `in_progress`); every later review is **unclaimed** (`needs_qc`,
        pickup pool). The frontend picks `assign_to_caller` from
        `reviews_total === 0`.
      - **Backend:** add `assign_to_caller: bool = False` to `QCReviewCreate`;
        when set, `create_qc_review` inserts the initial `qc_review_assignment`
        claimed (`assigned_to = caller`, `assignment_status = 'in_progress'`)
        instead of `null / needs_qc`, same transaction. ⚠ uvicorn has no
        `--reload` — restart after pulling.
      - **Form reuse via a shared *component*, not a lib.** Extract the create
        form out of `QcReviewsCard` into `components/QcReviewModal.tsx`
        (parameterized by `draftId`, `onSuccess`, `defaultType`,
        `assignToCaller`); both `QcReviewsCard`'s "New Review" and Verify's
        Start/Add open it. The layout is identical in both places, so a shared
        modal component dedups more than the planned `lib/qcReviewForm.ts` pure
        split would — that lib entry in the form-reuse table is superseded.
      - **Creation shipped 2026-08-04**, visually confirmed: `QcReviewModal`,
        the `assign_to_caller` backend param + assignee rollup on the list
        endpoint, and the expand's borderless review grid all landed.
      - **Review MANAGEMENT ported into the cycle (design settled 2026-08-05).**
        Reversed the earlier "excursion accepted" call — `/qc/reviews/:id` is
        really a *management* surface (assignment slices + review lifecycle +
        a status summary; the actual per-series approve/reject is in Mirabelle),
        so that management belongs in the cycle. Scope **a/b/c** below, hosted
        in a **per-review Manage modal** opened from the expand; the read-only
        **expand** stays a lightweight review list (one `useQcReviews` call, no
        per-review detail fetches). Built from components **shared** with
        `ReviewDetail.tsx` (not copied — the two surfaces must not drift):
        - **`components/qc/QcSeriesSummary.tsx`** (c) — series-status badges +
          per-modality progress table. Pure display.
        - **`components/qc/QcAssignments.tsx`** (a) — assignments table +
          Claim / Release / Reassign + **Split**, owning its Split/Reassign
          modals. Self-contained on `reviewId`. This is where per-slice
          **assignment** status shows (distinct from **review** status — the
          two were conflated in the first cut).
        - **`components/qc/QcReviewLifecycle.tsx`** (b) — stale banner +
          Mark Complete / Clone / Cancel, owning its Clone/Cancel modals.
        - Each takes an optional **`onChanged`** callback so the Verify modal
          can invalidate the `["dataset-cycle", datasetId]` rollup after a
          mutation (the QC hooks already invalidate `qc-review(s)` /
          `qc-assignments`, but not the cycle query). `ReviewDetail` passes
          none and is refactored onto the three (its header actions move into
          the `QcReviewLifecycle` block — a minor layout shift, acceptable).
        - **`components/QcReviewManageModal.tsx`** — fetches
          `useQcReview(reviewId)` once and stacks the three shared components;
          opened per-review from the Verify expand (which keeps a **Manage**
          button + an **Open** link to the full page for the metadata/notes
          tail (d), left out of scope for now).
      - **Not ported (d):** notes editing + created/updated audit stay on
        `/qc/reviews/:id` only.
      - No backend change for the management port — per-slice data comes from
        the existing `GET /qc/reviews/{id}` detail; all mutation hooks already
        exist in `useQc.ts`.
- [x] **5 — Bundle.** *(done 2026-08-23)* Freeze drafts into
      recordset releases, choose which version each recordset contributes, then
      finalize the dataset release. **This is where carry-forward is expressed**:
      a just-frozen recordset and an unchanged one look the same in the list,
      differing only in which version they contribute.

      **Findings from reading the code (the earlier spec was wrong in places):**
      - ~~**Nothing stamps `release_date`**~~ — **this finding was wrong**
        (corrected 2026-08-23 while starting 5.3). There is no *trigger*, which
        is what I checked, but `update_dataset_release` has always handled it:
        `if payload.release_status == "released" and payload.release_date is
        None: updates.append("release_date = coalesce(release_date, now())")`.
        `create_dataset_release` covers the insert path. **So 5.3 needed no
        backend change** — the PUT already does the right thing.
      - **Recordset publish can't auto-number.** `RecordsetReleaseInsert`
        requires `release_number`, `release_date` *and* `release_notes`, which is
        why `drafts/Detail.tsx` makes the curator type a version. Copy the
        auto-assign pattern from `create_dataset_release`.
      - **Composition needs no new endpoints.**
        `POST /datasets/releases/{id}/recordsets/add` and `/remove` already
        exist. Only *finalize* needs backend work — contradicting the old note's
        "new `publish` + `release` endpoints".
      - **Cycle payload already carries** per-recordset `latest_release`,
        `in_latest_dataset_release`, `last_bundled_dataset_release_number`,
        `open_draft`, `qc`. Only the older-release *list* is missing.

      **Decisions (2026-08-23):**
      - **Stage does both** — publishes ready drafts *and* composes the release,
        so a curator never leaves mid-cycle to freeze something.
      - **Older versions load lazily** on row expand via the existing
        `GET /recordsets/{id}/releases`; the cycle payload is left alone, since
        most rows are never expanded and latest is the near-universal default.

      **Steps:**
      - [x] **5.1 — Publish flow.** *(done 2026-08-23)* New `lib/publishForm.ts`
        (`PublishFormValues`, `publishPayload`, `usePublishDraft`) and
        `components/PublishDraftModal.tsx` on `Modal`, replacing the hand-rolled
        overlay in `drafts/Detail.tsx` — which also closes that item from step 9.
        Version number and date left the UI entirely; the server assigns them.
        - **Two live bugs fixed on the way.** The Release Number field's
          placeholder read `e.g. 1.0.0`, but the column is `integer NOT NULL` and
          the model typed it `int` — a semver string 422'd. And the page sent
          `release_notes: null` for an empty box against a required non-nullable
          `str`, so **publishing with no notes always failed**.
        - **Backend:** `RecordsetReleaseInsert` all-optional; insert uses the
          `coalesce(max(release_number), 0) + 1` idiom copied from
          `create_dataset_release`, with `coalesce($3, now())` for the NOT NULL
          date. `(recordset_id, release_number)` unique index backstops it.
        - **Republish guard added** (asked for): publish now 422s when
          `draft_status` is already `published`/`deleted`. Without it a second
          call cut another release from a spent draft — reachable by double
          submit, and 5.2 adds a second caller.
        - ⚠ **Pre-existing bug found and fixed:** the endpoint's
          `except Exception → db_error` had no `except HTTPException: raise`
          ahead of it, so its own 404 ("Draft not found") was being swallowed and
          re-raised as a 500. The new 422 would have gone the same way.
        - **`usePublishDraft` deliberately does not navigate** — the draft page
          passes `onPublished` to go to the recordset; 5.2's Bundle row will stay
          put. Destination is the caller's call.
        - QC gate (`canPublish` / `publishBlockedReason`) untouched on the page.
      - [x] **5.2 — Bundle stage.** *(done 2026-08-23)* Rebuilt on
        `ExpandableTable` (fourth call site, as tech-debt #10 anticipated). Rows
        are **all** recordsets now, not just frozen ones — an unfrozen one needs
        to be visible to get a Publish action. Columns: Recordset / Frozen At /
        Contributing / In Release / actions; expander is the version picker.
        - **Two integrity holes found in the composition endpoints**, both fixed
          in `add_recordset_release_to_dataset_release`:
          1. **Not idempotent.** `dataset_release_recordset`'s PK is
             `(dataset_release_id, recordset_release_id)` and the insert looped
             with no `ON CONFLICT`, so re-adding raised a PK violation that
             `db_error` surfaced as a **500**. Now a set-based insert with
             `on conflict do nothing`.
          2. **Nothing stopped two versions of the same recordset** being
             bundled — the PK is on *release* ids, not recordset id. The version
             picker is exactly a swap, so this was reachable in normal use. Add
             now **evicts any other release of the same recordset first**, making
             "include this version" one safe idempotent call.
          Also wrapped in a transaction: the old per-id loop ran outside one, so
          a partial add was possible. Response gained
          `replaced_recordset_release_ids`.
        - **No swap endpoint needed** after that — include/exclude is enough.
        - `lib/datasetReleaseForm.ts`: `useBundledRecordsets` (the cycle payload
          only has a per-recordset boolean, not *which* version is in), plus
          `useIncludeRecordsetRelease` / `useExcludeRecordsetRelease`.
        - **Version picker** reuses the existing `useRecordsetReleases`, fetched
          on expand. A row contributing an older version than its own latest is
          labelled **"carried forward"** rather than flagged — that's the whole
          point of the stage.
        - **Publish** per row opens `PublishDraftModal` from 5.1, gated on
          `isPublishable`; it stays on the cycle (the hook doesn't navigate).
        - Kept the pre-existing "N frozen but not bundled" warning banner.
        - **Follow-ups from first use (2026-08-23):**
          - Version picker went from chips to a list carrying **file count, date,
            creator, notes and DOI** — all already returned by
            `GET /recordsets/{id}/releases`; the frontend type just declared four
            fields. Sorted newest-first *locally*, so `ReleasePicker` keeps its
            order. (Also corrected `useRecordsetReleases`' docstring: it claimed
            newest-first, but the SQL orders ascending.)
          - Picker button renamed **Use this → Include**, matching the row action.
            The row's Include always takes the recordset's *latest* release; the
            expander exists to deliberately pick an older one.

### 🧹 Verify emptied out when drafts were published — fixed 2026-08-23

Reported on first real use of Bundle: "now that the drafts are releases, all
recordsets disappear from the verify cycle and it looks incomplete."

**Cause:** Assemble and Verify keyed entirely off `open_draft`, and publishing
sets `draft_status = 'published'`, which the cycle SQL's `open_draft` CTE
excludes. So **the stage flipped from Complete to — precisely because the work
finished**. Worse, the `qc` CTE joined `open_draft`, so the QC rollup zeroed too:
the evidence that justified freezing vanished with the draft.

**Fixes:**
- **Backend:** new `qc_draft` CTE — the latest non-deleted draft, open or
  published — now feeds the `qc` rollup. Identical mid-cycle; after publishing
  the counts persist. `open_draft` itself is unchanged, so Assemble's semantics
  and `isPublishable` (which short-circuits on `!open_draft`) are untouched.
  The cycle payload's `latest_dataset_release` also gained **`when_created`** —
  `release_date` is null while draft, so it was the only available marker of
  "during this cycle".
- **Frontend:** `frozenThisCycle(cycle, r)` — true when the recordset has no open
  draft but its release is either bundled into the current draft release or was
  frozen after the cycle started; and `cycleRecordsets(cycle)` = open drafts plus
  those. Verify's table and `verifyStage()` both use it, and a frozen row shows a
  **Frozen vN** badge in the publish-gate column. A recordset carried forward
  from an earlier cycle is correctly excluded — its release predates the cycle.
- Assemble needed no change: its table already lists every recordset, and its
  summary already fell through to "N ready to bundle".

**Gap closed same day:** a frozen row can now **expand to its reviews**. The
cycle payload exposes **`qc_draft_id`** — the draft the QC rollup came from (open
while one exists, else the published draft it became) — and Verify's `canExpand`
/ `renderExpanded` key off it instead of `open_draft`. So a frozen recordset's
reviews stay readable, and the slice actions inside `ReviewList` keep working
against a real draft id.
      - [x] **5.3 — Finalize.** *(done 2026-08-23)* `useFinalizeDatasetRelease`
        in `lib/datasetReleaseForm.ts` + `components/FinalizeReleaseModal.tsx`,
        opened from a **Finalize Release** button beside the release identity in
        the Bundle header (shown only while a cycle is active).
        - **No backend change was needed** — see the corrected finding above.
          The modal sends `release_status: "released"` plus optional notes/DOI;
          `update_dataset_release` already stamps `release_date` on that
          transition, so the frontend deliberately sends no date.
        - **The summary is the point**, not the form: the modal lists every
          recordset release going in (name + version), warns when frozen
          recordsets are being left out (`unbundledRecordsets`), and **disables
          Finalize when nothing is bundled**. The release is immutable
          afterwards, so the last look matters more than the two fields.

      ⚠ **Tech-debt #12 becomes load-bearing here**: the yellow "Complete for
      testing" button exists to stand up publishable QC state for exactly this
      stage. Gate or remove it before production.

- [ ] **6 — Transfer.** Extract `lib/transferForm.ts`. The page lists
      destinations defaulted from `recordset_destination` (`default_display`,
      `transfer_mode_id`); a modal collects per-transfer settings. New
      `transfers` endpoint creates the transfers **and generates their
      manifests** (where `IDC_TRANSFER.md` says manifest generation belongs),
      leaving them at `transfer_status = 'draft'`.
      ⚠ **Queueing stays a separate, deliberate click per transfer.** Setting
      `queued` fires `notify_transfer_queued()`, which hands the work to the Go
      daemon and starts real uploads to an external bucket — and there is no
      un-queue path back through `transfer_status`. That step should never be a
      side effect of a bulk action.

      **Findings from reading the code (2026-08-24):**
      - **The orchestration already exists — in the browser.**
        `releases/transfers/List.tsx`'s "Sync with Default Config" fetches
        destinations, then per destination fetches expected recordsets, creates
        missing transfers, and diffs membership add/remove. ~6 sequential round
        trips, `Promise.allSettled`, non-atomic, partial failure reported as a
        toast. This is what `POST /cycle/transfers` was meant to replace.
      - **Composition needs no new endpoint** (same as Bundle).
        `POST /datasets/releases/{id}/transfers` is **already transactional** and
        already defaults membership to every recordset release in the dataset
        release when `recordset_release_ids` is omitted.
        `GET /datasets/releases/{id}/destinations` derives destinations *from
        what Bundle composed* and carries `transfer_mode_id` — so destination
        **and** mode are already defaulted. `transfer_name` is the only real
        input, and List.tsx already auto-derives it as `"<dataset> v<n> — <ABBR>"`.
      - **A recordset with no configured destination vanishes silently.** The
        destinations query inner-joins `recordset_destination`, so a recordset
        Bundle included but Setup never gave a destination contributes to no
        transfer at all — no error. Warrants a warning banner in the spirit of
        Bundle's "N frozen but not bundled".

      **Decisions (2026-08-24):**
      - **Rows are destinations, not transfers.** Every destination configured
        for the release gets a row whether or not a transfer exists yet, so a
        destination you haven't acted on is visible. Same shape as Bundle, where
        unfrozen recordsets still get a row.
      - **Per-destination settings + transfer manifests live in a Manage modal**,
        built from components **shared** with `transfers/Detail.tsx` so the two
        can't drift — same pattern as `QcAssignments` / `QcReviewLifecycle` with
        `ReviewDetail`. The expand stays a lightweight read-only summary.
      - **The expand groups recordsets by which manifest they feed**, not one row
        per recordset — the imaging manifest is **one per transfer**, spanning
        every Radiology Images recordset, with a single dataset-level
        `dataset_hash`. Grouping makes that structure self-evident and matches
        the bucket layout (`<dataset>/<version>/imaging_manifest.csv`).
      - **Retriever manifests are out of scope** — they are per-recordset and
        belong to Disseminate. See step 7.
      - **Manifest generation stays an explicit action, not a side effect of
        creation** — revisit after 6.0. (The 2026-07-16 "generated at transfer
        initialization" decision is not yet honoured; wiring it in before the
        generator is fixed would bake the bug below into every transfer.)
      - **Close TECH_DEBT #5 here**: `POST /datasets/releases/{id}/transfers` and
        the queue transition reject a release whose `release_status = 'draft'`,
        with a 422 the UI surfaces. Now that Bundle has a real Finalize, the
        UI-only gate is the last thing between a half-composed release and a
        live upload.

      **✅ Not a bug — the IDC scope rule.** `generate_idc_imaging_manifest`'s
      `rt.recordset_type_name = 'Radiology Images'` filter reads like a
      hardcoded oversight and was initially flagged as one. It is **correct and
      deliberate**: IDC is only ever assigned imaging it can house plus clinical
      data it parses. Histopathology goes to Aspera; DICOM SEG/RTSTRUCT
      annotations are bundled *inside* Radiology Images recordsets rather than
      living in an `Image Annotations` recordset. Destination assignment per
      recordset is the real control. Leave the filter alone.

      **Steps:**
      - [x] **6.0 — Fix the imaging manifest generator first.** *(done
        2026-08-24)* Prerequisite to deciding anything about auto-generation.
        **Three** defects, all in the `files` CTE, all **silent**:
        - **INNER joins on `file_patient` / `file_study` / `file_series` /
          `file_sop_common`** drop any DICOM file missing a row in one of them.
          Because `series_hash` → `study_hash` → `patient_hash` → `dataset_hash`
          are all computed over the same CTE, a dropped file doesn't merely go
          missing — **it changes the dataset-level hash for the whole
          submission**, and the manifest still looks internally consistent. This
          is a data-integrity bug, not a completeness one.
        - **`file_patient.patient_id` is nullable**, so an inner join can match
          and still yield null. `patient_hashes` groups by it, collapsing every
          null-patient file into one bogus patient bucket that feeds
          `dataset_hash`. Not fixed by switching to LEFT JOIN.
        - **Third defect, found while implementing: no `DISTINCT`.** The same
          `file_id` can appear in two Radiology Images recordset releases in one
          transfer (overlapping recordsets are legal) — emitting duplicate SOP
          instance rows and feeding the digest into `string_agg` twice, which
          corrupts `series_hash` and everything above it.
        - **Resolved: refuse and report.** A **preflight query** runs before any
          bytes are written — same FROM/WHERE, but LEFT JOINs so incomplete files
          are *counted* rather than dropped. Any incomplete file ⇒ **422
          `MANIFEST_INCOMPLETE`** carrying `dicom_file_count`,
          `incomplete_file_count`, a per-cause breakdown
          (`missing_patient_row` / `missing_study_row` / `missing_series_row` /
          `missing_sop_row` / `blank_patient_id`) and up to 20 `sample_file_ids`
          so a curator can chase the indexing. Chosen over generate-and-warn
          because `dataset_hash` describes the entire submission: a manifest
          built over a partial set tells IDC something false *while looking
          valid*, and unlike a missing manifest there is no way for them to
          detect it. `SELECT DISTINCT` added to the `files` CTE, and
          `except HTTPException: raise` ahead of the `except Exception →
          db_error` — without it `api_error`'s own 422 would be swallowed and
          resurface as a 500 (the identical bug fixed on the publish endpoint in
          5.1).
        - **Verified against the local `posda_files` DB**, not by eye: both
          queries `PREPARE` cleanly (syntax + every column reference); the
          preflight reports the seeded fixture clean (transfer 1 = 10 DICOM, 0
          incomplete, so no false positives); and in a **rolled-back**
          transaction, deleting one `file_sop_common` row, nulling a
          `patient_id`, and duplicating a file each got detected, with `DISTINCT`
          collapsing the duplicate. That same test demonstrated the original bug:
          removing one index row silently took the manifest from 10 rows to 9
          with no error raised.
      - [x] **6.1 — `lib/transferForm.ts`.** *(done 2026-08-24)*
        `useReleaseDestinations`, `useReleaseTransfers`, `useTransferRecordsets`,
        `useCreateTransfer` (auto-name, auto-mode, destination-filtered
        membership), `useSyncTransferRecordsets`, `useQueueTransfer`, plus a pure
        `transferName()`. Moves List.tsx's inline sync orchestration into hooks.
        No consumers yet — 6.2 wires it.
        - **Transfers are fetched separately from the cycle payload.** The
          rollup's `CycleTransfer` has no `destination_id`, which the stage needs
          to line transfers up against destination rows.
        - **`useCreateTransfer` refuses an empty membership set.** Passing `[]`
          (or null) to `POST .../transfers` does **not** mean "no recordsets" —
          the endpoint falls through to *every* recordset in the release, which
          for a destination-scoped transfer ships the wrong data. Normally
          unreachable (the destinations endpoint derives from recordsets, so
          every listed destination has ≥1), but reachable if a recordset's
          destination is removed between page load and click.
        - **Queueing is deliberately its own hook** with the one-way warning on
          it, never folded into create or sync.
        - **Response shapes verified against the live API**, not assumed — all
          four endpoints return `{data, meta:{count}}` matching the declared
          types. Noted in passing: `meta` never carries `total` though
          `ListEnvelope` declares it required (pre-existing, nothing reads it).
        - **Membership drift is detected server-side** *(backend addition,
          2026-08-24)*. A transfer's membership is snapshotted into
          `transfer_recordset` at creation, but what it *should* carry moves
          afterwards — a recordset gains/loses the destination in Setup, or
          **Bundle's version picker swaps which `recordset_release` is bundled**,
          leaving the transfer pointed at a superseded release. That last case is
          not a misconfiguration; it is the picker working as designed, and it
          would silently ship the wrong version to an external destination.
          `GET /datasets/releases/{id}/transfers` now returns `recordset_count`,
          `expected_recordset_count` and `membership_drifted`, via two CTEs
          (`actual` / `expected`) compared with `is distinct from`.
          - **Counts alone are insufficient** — one added plus one removed leaves
            the count unchanged — so the id *sets* are compared. Confirmed
            empirically: the version-swap case reports
            `has=3 expected=3 drifted=true`.
          - Chosen over client-side detection, which would have cost 2 fetches
            per destination row on a page that otherwise loads in two.
          - **Verified against the local DB** in a rolled-back transaction: the
            fixture reports every transfer in sync (no false positives), removing
            a `recordset_destination` flips `drifted` true with unequal counts,
            and a Bundle-style version swap flips it true with *equal* counts.
      - [x] **6.2 — Transfer stage on `ExpandableTable`.** *(done 2026-08-24)*
        Fifth call site. Rows are destinations; columns Destination / Transfer /
        Recordsets / Status / actions. Replaced the read-only chip strip +
        `DynamicTable` launchpad — the last pure launchpad in the cycle.
        - **Rows are a union, not just the destination list.** A transfer whose
          destination has since been unconfigured on every recordset has no
          destination row of its own; listing only configured destinations would
          **hide a real transfer**. Those rows render with
          "no longer configured" and no Create action.
        - **The expand groups by manifest** (`manifestGroups`), keyed on
          `destination_abbr` to match `transfers/Detail.tsx`'s
          `SETTINGS_ENDPOINT`. For IDC: Radiology Images → *Imaging manifest*,
          Clinical Data → *Clinical manifest* (flagged "generator not
          implemented yet" until 6.5), anything else → *Not manifested for IDC*
          with a pointer to check that recordset's destinations. Non-IDC
          destinations get a plain list — they ship recordsets directly, and
          retriever manifests belong to step 7.
        - **Two warning banners**, both surfacing things nothing else reported:
          drifted transfers (from `membership_drifted`), and **stranded
          recordsets** — bundled into the release but with no destination
          configured at all, so their files ship nowhere.
        - **Per-row Open still links to `/transfers/:id`** — deliberate, so the
          stage doesn't lose access to settings and manifest generation before
          6.3 brings them inline. Remove it when the Manage modal lands.
        - `TransferChip` now has **no component call sites** (only `useCycle.ts`
          imports its *type*) — exactly the shape of `CycleStrip` in TECH_DEBT
          #16. Left in place, not deleted.
        - ⚠ **Transfer mode was re-surfaced by accident and removed again.** The
          first cut showed `transfer_mode_name` as the destination sub-line,
          contradicting the 2026-07-24 decision to hide the concept everywhere.
          It is internal plumbing only (NOT NULL on the row, derived from the
          destination), now documented as such on `ReleaseDestination`. Direction
          is to eliminate it entirely and let grouping belong to the transfer
          destination — recorded as TECH_DEBT #17.
        - `npm run build` clean.
      - [x] **6.3 — Manage modal.** *(done 2026-08-24)* Destination settings and
        IDC manifest generation without leaving the cycle.
        - **`lib/transferSettings.ts`** — `SETTINGS_ENDPOINT` (note `asp` →
          `aspera`; abbr and route segment differ), `useTransferSettings`,
          `useSaveTransferSettings`, `useGenerateIdcManifest`, plus pure
          `settingsToValues` / `settingsPayload` / `manifestDownloadUrl` /
          `hasManifest`. `settingsPayload` sends **only** the destination's own
          fields — each settings table has its own Pydantic model, so a foreign
          field would 422.
        - **`components/transfers/TransferSettingsForm.tsx`** — the
          destination-specific fields (GCS URL / Faspex URL / NBIA
          collection+site / WP media id), published/public, and IDC's three
          manifests. Self-contained on `transferId`.
        - **`components/TransferManageModal.tsx`** — hosts it at `xl`.
        - **`transfers/Detail.tsx` migrated onto the same component**, not a
          copy: **23,253 → 10,923 chars**. Its `DestSettings` type, its own
          `SETTINGS_ENDPOINT`, eleven pieces of settings form state,
          `populateSettingsFields`, `saveSettings` and `generateIdcManifest` all
          went. It keeps the transfer load, the **retriever** manifest row
          actions (step 7's concern, deliberately not moved) and Queue.
        - The manifest list is labelled "one set per transfer, covering the whole
          submission — not per recordset", since that is the thing most likely
          to be misread.
        - **The imaging generator's 422 message is passed through** rather than
          flattened to "could not generate" — it names how many files are
          unindexed, which is the whole point of 6.0.
        - **"Open" button dropped; the Transfer column links instead.** The
          transfer name is now a new-tab link to `/transfers/{id}` (reusing
          `RecordsetLink`'s `to` override — its third entity after recordsets and
          drafts), matching how every other cycle table links out. Frees the
          action column for Create / Sync / Manage, and still reaches Queue on
          the detail page until 6.4 brings it inline.
        - Settings endpoint shapes verified live for idc/gc/nbia/wp;
          `npm run build` clean.
      - [x] **6.4 — Queue.** *(done 2026-08-25)* `QueueTransferModal`, opened
        from a per-row **Queue** button shown only on a `draft` transfer. Never
        bulk, never a side effect — the modal names the destination, says
        plainly that there is no un-queue, and shows what will ship.
        - **Blocks on drift.** Queue is disabled when `membership_drifted`,
          since queueing a stale transfer irreversibly ships the wrong contents
          — the exact failure the 6.1 backend addition exists to catch.
        - **Warns on missing IDC manifests.** For IDC only, the modal fetches
          settings while open and flags any of the three manifests not yet
          generated: IDC reads the submission *from* its manifests, so queueing
          without them ships an incomplete package that can't be recalled. A
          warning, not a block — the clinical generator is still a stub (6.5),
          so blocking would make IDC unqueueable.
        - **TECH_DEBT #5 closed server-side** (both halves — see TECH_DEBT
          Resolved): creating a transfer for a `draft` release 422s, and so does
          the `queued` transition while the parent release is a draft. The guard
          runs only for that transition, leaving other field updates alone.
        - Guard queries verified against the local DB; `npm run build` clean.

      - [x] **6.5 — Clinical manifest.** *(done 2026-08-25)* `generate_idc_clinical_manifest` is a
        501 stub; **in scope for this step** *(2026-08-24)*. An IDC transfer
        does **not** always carry clinical data — it only *may*. Per the
        2026-07-30 rule, the manifest's presence is itself the signal: present =
        complete, absent = nothing clinical in this release. So a transfer with
        no clinical content is correct and unremarkable, **not** a warning state.
        Spec and field list live in
        [IDC_TRANSFER.md](IDC_TRANSFER.md) → *Clinical manifest*.
        - **Implemented 2026-08-25.** Replaces the 501 stub.
        - **The filter is just `is_dicom_file is not true`.** `file.file_type`
          cannot classify anything — Posda stores a libmagic description there
          (every non-DICOM file in the fixture reads *"ASCII text, with CRLF line
          terminators"*), so the spec's CSV/TSV/XLS/XLSX stage-2 filter has no
          Posda equivalent. `is not true` rather than `= false` because the
          column is nullable and `= false` would silently skip an unprocessed
          file. **No recordset-type filter**: destination assignment already made
          the selection, and silently dropping a file from a manifest is the
          exact failure 6.0 existed to eliminate. `file_name` carries the
          identity (populated for non-DICOM, null for DICOM).
        - **`file_type` in the manifest is the filename extension**, uppercased
          — CM keeps its own file_type list, and the extension is the closest
          honest answer from Posda's side.
        - **CM columns are fetched once per recordset**, not per file
          (`wp_object_map` is unique both ways), and **best-effort**: a failed
          lookup leaves those cells blank and is reported back in
          `wp_lookup_failures` rather than swallowed or fatal, since CM may not
          be live when a transfer is prepared.
        - **⚠ WordPress takes precedence over IDC** *(raised in review, added
          2026-08-25)*. The manifest hands IDC a **`download_url` into Collection
          Manager**, not a copy of the file. So when the Posda clinical file is
          an *update* of what CM holds, generating before the WordPress transfer
          refreshes CM makes IDC resolve the **previous version** — while the
          manifest looks valid. Checking that CM has *a* file attached does not
          help: the stale one is attached too.
          - `_wp_precedence_block()` gates **clinical-manifest generation** on
            this release's WordPress transfer being `success` (422
            `WP_TRANSFER_REQUIRED`, naming the recordsets). WordPress is
            `default_display` for these recordsets, so it ships first and the
            manifest is generated from the refreshed CM metadata.
          - Scoped to **IDC** transfers carrying non-DICOM files whose
            `default_display` is WordPress. Other destinations have no such
            ordering — and **without that scoping the WordPress transfer blocked
            on itself**, making the gate impossible to ever satisfy. Caught by
            testing the gate against every fixture transfer, not by reading it.
          - ⚠ **Corrected in review:** the first cut also gated *queueing* on the
            WordPress transfer, and described IDC as not "carrying its own copy"
            of the file. Both were wrong. It is one file in one recordset bound
            for two destinations; nobody carries a separate copy. The dependency
            is only that the new file must reach WordPress so the **metadata the
            clinical manifest is generated from** is current. Queueing is gated
            on **manifests existing** (below), which makes the WordPress ordering
            **transitive** and removes the need to state it twice:
            *WP delivers → CM current → clinical manifest generates → IDC has its
            manifests → IDC can queue.*
        - **⚠ A transfer cannot be queued without its manifests**
          *(raised in review, added 2026-08-25)*. `_idc_manifest_state()` derives
          what a transfer **needs** from what it actually carries — dataset
          always, imaging when it carries Radiology Images DICOM, clinical when
          it carries non-DICOM — and the `queued` transition 422s
          (`MANIFESTS_REQUIRED`) while any are ungenerated. IDC reads a
          submission *from* its manifests, so queueing without them ships a
          package it cannot interpret, and the upload cannot be recalled.
          - Requirements are **derived, not fixed**: a transfer with no clinical
            content needs no clinical manifest, so the absent-manifest signal
            stays meaningful.
          - `GET /transfers/{id}/idc` now returns `required_manifests` /
            `missing_manifests`, so the Queue button **disables against the same
            rule the API enforces** rather than re-deriving it client-side. The
            modal explains the WordPress dependency only when `clinical` is among
            the missing — which is where that explanation actually belongs.
          - Non-IDC transfers have no transfer-level manifests and are not gated.
        - **No clinical files → 404**, not an empty CSV — absence of the manifest
          is itself the signal that nothing clinical changed.
        - **Verified against the local DB:** both queries `PREPARE`; per-transfer
          row selection checked across all 10 fixture transfers (3 have clinical
          content, 7 correctly 404); CSV output rendered and inspected. ⚠ The
          live path — including the WordPress fetch that fills the CM columns —
          is **not yet exercised**: the running backend still served the 501 stub
          when probed, so it needs the restart first.
        - **Source is Posda, not a live Collection Manager read** *(settled
          2026-08-24)*. By the time a transfer runs, clinical files have already
          been pulled into Posda — from CM downloads or anywhere else — and
          verified through QC. So the generator reads the transfer's own
          recordset releases; **assume the content is always accessible in
          Posda**. This closes three of the spec's open follow-ups at once:
          - *"Is the relevance decision recorded anywhere, or re-made each
            time?"* — **recorded**, as which recordsets exist, what they hold,
            and which have IDC as a destination. Decided once during
            Setup/Assemble, not re-made per generation.
          - *"CM may not be live yet at generation time"* — largely dissolves;
            the files were imported at Assemble time. Only the CM **metadata**
            columns still need a live read (or a stored snapshot).
          - No new table, picker UI, or import step is needed —
            `POST /recordsets/drafts/{id}/files/from-wp` is already the import
            path the manifest's `posda_file_id` field anticipates.
        - **One row per file, download metadata repeated.** The spec says "one
          row per selected CM download", but `file_hash` and `relative_file_url`
          are inherently per-file and each clinical file is dropped into the
          bucket individually. A recordset may hold several files, so rows are
          per-file and the CM download columns repeat — exactly the precedent
          the imaging manifest set with `dataset_hash`.
        - **CM columns are nullable.** Clinical data pulled from somewhere other
          than a CM download has no `wp_object_map` link, so `download_slug` /
          `download_id` / `download_url` etc. emit blank. Not an error.
        - **Filter still to confirm when 6.5 starts:** the Posda-side equivalent
          of the spec's two-stage CM filter is most likely
          `is_dicom_file = false` **and** `file.file_type` in
          (CSV / TSV / XLS / XLSX), over recordsets of type Clinical Data /
          Image Annotations / Other. Confirm before implementing — it decides
          whether e.g. a non-tabular README or a NIfTI segmentation is swept in.
### 🧹 The cycle declared itself over at `released` — fixed 2026-08-25

Reported on first real use of the Transfer stage: the banner read *"Last
release: v1 (released). No cycle is currently in progress"* with a **Start Next
Cycle** button — while that release had an unsent draft transfer and had never
been disseminated.

**Cause:** `CycleNextAction` short-circuited on `!isCycleActive(cycle)`, and
`isCycleActive` is `release_status === "draft"`. So **finalizing in Bundle ended
the cycle**, exactly as publishing a draft used to empty out Verify (see the
2026-08-23 fix above — same shape of bug, one stage later). Two different
questions were being answered by one predicate:

1. **Is composition still open?** — only while the release is a draft. This is
   what Assemble/Verify/Bundle correctly gate their controls on.
2. **Is there still work on this release?** — true until it has shipped and gone
   live.

**Fixes:**
- **`isCycleInProgress(cycle)`** = release status `draft` **or** `released`.
  `isCycleActive` is unchanged and still gates the composition stages; only the
  banner moved to the new predicate. The two are documented as
  not-interchangeable at the definition site, since conflating them is what
  caused this.
- **`transferStage` returns `active`, not `pending`,** for a released release
  with no transfers ("None yet") or with unsent ones ("N to queue"). `pending`
  hid the work from `nextAction()`, which only surfaces `blocked`/`active` — so
  even after the banner was fixed it would have had nothing to report.
- **`stageMessage("transfer")` no longer says "0 transfers in flight"**, which
  was reachable whenever every transfer was still a draft. Now: in flight →
  ready to queue → all delivered.
- **The "nothing outstanding" branch carries the Start Next Cycle button.** It
  used to be documented as unreachable; it is now the normal end state of a
  released cycle, and without the button a released cycle would have had **no
  way forward at all** (dissemination, which would set `live`, is step 7).

⚠ **Known and not addressed here:** starting the next cycle while the previous
release is still shipping makes that release's transfer state disappear from the
cycle view, since every stage reads `latest_dataset_release`. Pre-existing, and
more likely to be hit now that a released cycle stays visible. Worth resolving
with step 8's Overview.

- [ ] **7 — Disseminate.** The go-live stage — **per-release** WordPress objects
      and publishing. Setup (step 2) already created the dataset's `collection`
      and per-recordset `download` pages; this stage adds the `version` and
      `version_download` pages for the release just frozen, and flips the whole
      set live.
      - Per-release mapping: dataset_release → `version`; recordset_release →
        `version_download`. (Collection/download mapping lives in Setup.)
      - Lists every WP object for the dataset and this release, which are
        **missing**, and each one's current post status (read live from
        WordPress — `wp_object_map` stores no status). Actions: create a missing
        version page, and a **bulk go-live switch** flipping the set from draft
        to published at once.
      - **Created as `draft`.** Posda supplies title, slug, and DOI — a correctly
        named stub. Abstract, cancer types, species, citations stay curator work
        in Collection Manager.
      - **Search before create.** Every WP list route already accepts `?slug=`
        and `?search=`, so offer to link an existing post rather than creating a
        duplicate public page. `wp_object_map` enforces one-to-one both ways.
      - **Go-live flips WordPress post status only** — nothing in Posda changes
        (see the open question below).
      - Reuses `lib/wpObjectForm.ts` and the `manager.py` WP routes built in
        step 2. Write plumbing already exists: `util/wp.py` has `wp_post` /
        `wp_patch` / `wp_delete` authenticated via `POSDA_WP_USER` /
        `POSDA_WP_PASSWORD`. The routes to add:
        `POST /manager/wp-objects`,
        `PUT /manager/wp-objects/{id}/status`,
        `POST /manager/posda/dataset/{id}/wp/publish`.
      - **Retriever manifests belong to this stage, not Transfer**
        *(settled 2026-08-24 while planning step 6).* There are **two distinct
        manifest families**, and they were being conflated:

        | Family | Scope | Stored on | Consumer |
        |---|---|---|---|
        | dataset / imaging / clinical | per **transfer**, dataset-level | `transfer_idc.*_manifest_file_id` | IDC submission |
        | **retriever** | per **recordset**, per transfer | `transfer_recordset.retriever_manifest_file_id` | TCIA Data Retriever |

        The retriever manifest is a per-recordset **series-UID CSV** used by the
        Data Retriever app to pull files from whichever destination holds them,
        and it gets **attached to the recordset's WordPress `version_download`
        page** — which is why it is dissemination work, not transfer work.
        - **Already implemented:**
          `POST /transfers/{id}/recordsets/{rrid}/manifest/generate` builds and
          stores it. Nothing new is needed to *generate* one; this stage needs
          to trigger it per recordset release and attach the resulting
          `downloadable_file` to the WP page.
        - ⚠ **Stale comment:** that route is commented "Generate (or replace) an
          **IDC** download manifest CSV". It is not IDC's — same naming lag as
          the `file_manifest` → `imaging_manifest` rename. The column name
          (`retriever_manifest_file_id`) is correct; fix the comment.
        - ⚠ **Keying question to resolve here.** It is keyed
          `(dataset_release_transfer_id, recordset_release_id)`, so a recordset
          release shipped to two destinations gets two rows. Today the payload is
          a bare series-UID list, so both are byte-identical and content-addressed
          storage collapses them to a single `file` — harmless. **But** if the
          manifest ever needs a `downloadServerUrl` (the real `.tcia` format
          carries one), per-destination keying stops being incidental and becomes
          load-bearing — and "which destination's manifest goes on the WP page?"
          becomes a real question. Decide before the WP attachment depends on it.
        - ⚠ **Silent empty:** the generator joins `file_series`, so a non-DICOM
          recordset produces a **header-only CSV** and still returns 200.
- [ ] **8 — Overview page.** Per-stage summary cards plus a recordset × stage
      matrix (rows = recordsets, columns = Setup / Assemble / Verify / Frozen), then
      fan-in, transfer, and landing-page rows.
- [ ] **9 — Cleanup.** ~~Migrate `Files.tsx` onto `ActivitySourcePicker`~~
      (obsolete — the standalone draft-Files flow was retired in step 3; draft
      editing is now the Assemble stage's `ManageFilesModal`). Still open:
      migrate the remaining hand-rolled modals (draft publish, WP-link in
      `datasets/Detail.tsx`) onto `Modal`.
- [ ] **10 — Tests.** Add **vitest** (a one-line Vite integration; the project has
      no frontend test runner at all today) and cover the pure modules this plan
      creates: `validateRecordsetForm`, `recordsetCreatePayload`,
      `stageSummaries`, `nextAction`, `unbundledRecordsets`, `isPublishable`, and
      the carry-forward composition. These are dependency-free functions with
      many branches — the branches manual clicking won't reach.
      ⚠ Deliberately last, which means the rules ship unverified first. Backfilled
      tests tend to encode what the code *does* rather than what it *should*, so
      write them against this document's stated rules, not against the
      implementation.

## Planned — pin the cycle to a dataset release *(proposed 2026-08-26)*

**Not built. Design settled, including the Assemble wrinkle (see below) --
which is separate work and should not hold up the pinning.**

### The problem this solves

Every stage resolves `latest_dataset_release` from the dataset-scoped
`GET /datasets/{id}/cycle` payload. So the instant cycle N+1 starts, release N's
Bundle / Transfer / Disseminate state becomes **unreachable — while it is still
shipping**. Transfers take days; the next cycle can easily begin first. This is
the concern parked during step 6 ("we'll address your last concern in a bit").

Secondary benefit: cycle URLs become stable. `/datasets/5/cycle/transfer` means
something different next month; a pinned URL is shareable and bookmarkable.

### Shape

```
datasets/:dataset_id/releases/:release_id/cycle/:stage    <- the real route
datasets/:dataset_id/cycle                                <- entry point, redirects
```

- The bare `/cycle` entry point resolves the dataset's latest release and
  **redirects with `replace`** to the pinned URL. That keeps "most current is the
  default" without any stage component guessing, and existing menu/dashboard
  links keep working. When the dataset has no release at all, it shows the
  start-a-cycle state as today.
- Backend: `GET /datasets/{id}/cycle?release_id=` — optional, defaults to
  latest. Small change; the release half of the payload is already a single
  lookup on `latest_release`.
- **Rename `latest_dataset_release` → `dataset_release`** in that payload at the
  same time. Once it can be pinned, the old name is simply false. Mechanical
  rename across `useCycle.ts` and the stage components.
- **`isCycleInProgress` and `CycleNextAction` stay dataset-scoped.** They answer
  "what should I do next", which is about the *current* cycle. If they followed
  the pinned release, opening release 2 would start telling you to do work on a
  release that shipped a year ago.
- "Start Next Cycle" navigates to the new release's pinned URL.

### ⚠ The wrinkle: the six stages are not equally release-scoped

- **Bundle / Transfer / Disseminate** genuinely belong to a `dataset_release`.
  Pinning makes them historically accurate. This is where all the value is.
- **Setup / Assemble / Verify** operate on **recordset drafts and QC**, which
  hang off `recordset`, not off any dataset release. Nothing in the schema ties
  a draft to the cycle it is being prepared for. So viewing release 1's cycle at
  Assemble shows *today's* open drafts — which probably belong to the release 2
  cycle. Pinning does not make those stages historical; there is no history there
  to show.

**Interim handling (agreed):** a banner when pinned ≠ latest — *"Viewing release
3; the current cycle is release 4"* — with the early stages plainly labeled as
showing current recordset state. Cheap and honest. Rejected alternatives:
disabling the early stages (loses the ability to look, and there is nothing to
reconstruct anyway) and ignoring it (Assemble would silently show the wrong
cycle's work).

### ✅ Fixing the wrinkle — tie Assemble to the dataset release *(designed 2026-08-26)*

**Design settled; not built, and deliberately not a blocker for the pinning
above.** The banner handles the wrinkle honestly until this lands.

Three entities, easy to conflate — the whole design turns on keeping them apart:

| | what it is |
|---|---|
| `dataset_release` | the cycle's output. One per cycle. draft → released → live |
| `recordset_release` | one version of one recordset. Many per dataset release |
| `dataset_release_recordset` | which recordset versions this dataset version ships |

**The flow:**

1. **Cycle start** — create the draft `dataset_release`, and copy the previous
   dataset release's `dataset_release_recordset` **rows** across to it.
   ⚠ This creates **no recordset releases**. It copies only the link rows, which
   keep pointing at the *same already-published* `recordset_release` rows the
   previous dataset release shipped. The new dataset release simply starts out
   shipping exactly what the last one shipped.
2. **Assemble** — for each recordset being worked, create a `recordset_draft`
   *and* a draft `recordset_release` (`release_number` null), tie the draft to it,
   and **swap that one link row's pointer** from the old published release to the
   new draft one. Recordsets never touched keep pointing at their existing
   release — that is the carry-forward, and it needs no click.
3. **Bundle** — publish flips those same `recordset_release` rows to `released`,
   assigns `release_number`, stamps `release_date`, writes
   `recordset_release_file`. Bundle becomes review-and-finalize rather than
   assembly.

✅ **Confirmed 2026-08-26.** Starting from the previous dataset release's
membership is the intended behaviour: the cycle opens with last release's
recordset releases in place, and each is then left alone, replaced, or removed.
(The alternative considered and dropped: start empty and require an explicit
"include this unchanged recordset" action per carry-forward at Bundle.)

Once seeded, a membership row supports exactly three fates during the cycle:

| | how | result |
|---|---|---|
| **carry forward** | do nothing — no draft is created | keeps pointing at the previously published `recordset_release` |
| **update** | create a draft + draft release at Assemble | pointer swaps to the new draft release, which Bundle publishes |
| **remove** | drop the link row | the recordset ships in the previous dataset release but not this one |

Removal is a real case, not an edge one — a recordset can leave a dataset
release without being retracted from the ones that already shipped it.

**Why the link is written at Assemble, not Bundle:** the membership row is then
written **once and never rewritten**. It already points at the right
`recordset_release`; publishing mutates the row it points at, not the link. It
also means Assemble and Verify are scopeable by dataset release immediately,
which is the entire point — `qc_review.recordset_draft_id` → draft →
`recordset_release` → `dataset_release_recordset` → `dataset_release`.

### Schema changes — written 2026-08-26, not yet applied

✅ In the DDL scripts (`add_dataset_module_tables.sql` and the test data), and
synced into the DbSchema model. The drop script needed no change —
`recordset_draft` already drops before `recordset_release`, with CASCADE.
No migration script: a drop-and-reseed is the intended path for now.
⚠ **The application code does not use any of it yet** — nothing creates a draft
`recordset_release`, and publish still creates rather than finalizes one.

- **`recordset_release.release_status`** — new, presumably the `dataset_release`
  vocabulary (`draft | released | live | retracted`). Without it there is no way
  to tell a draft release from a real one.
- **`recordset_release.release_date`** — currently `NOT NULL`; must become
  nullable, mirroring `dataset_release.release_date` ("set when release_status
  transitions to released -- null while draft").
- **`recordset_release.release_number`** — currently `NOT NULL`; must become
  nullable and be **assigned at publish, not at creation**. This is what keeps
  numbering gapless: an abandoned draft never claimed a number. The unique index
  on `(recordset_id, release_number)` tolerates it — Postgres allows multiple
  NULLs in a unique index.
- **`recordset_draft.recordset_release_id`** — new FK to the draft release it is
  filling, alongside the existing `cloned_from_release_id` (which points the
  other way, at the release it was cloned *from*).

Per [CLAUDE.md](../CLAUDE.md) all of this lands in the DbSchema model first, with
the drop and test-data scripts moving alongside.

### ⚠ Consequences to handle

- **`dataset_release_recordset` will hold unpublished members.** It is a bare
  join table with no status of its own, and it will now carry a mix: draft
  releases for recordsets being worked, published ones carried forward. **Every
  query reading it needs auditing for a `release_status = 'released'` filter.**
  This is the largest ripple and the one most likely to bite quietly. It is the
  accepted cost of writing the link at Assemble.
- **Publish inverts.** `POST /recordsets/drafts/{id}/publish` currently *creates*
  the release, assigning `release_number` as `coalesce($2, max+1)`. It becomes
  "finalize the release that already exists". The number assignment moves here
  rather than disappearing.
- **Abandoning a draft needs a cleanup path** — its draft `recordset_release` and
  its `dataset_release_recordset` row both have to go, and
  `fk_dataset_release_recordset_recordset_release` is **`ON DELETE RESTRICT`**,
  so the membership row must be deleted first. Nothing does this today because
  there is nothing to clean up. Note the carry-forward row it replaced should
  presumably be restored.
### ✅ Settled: recordset drafts stay a separate table

Asked 2026-08-26 whether `recordset_draft` is still needed once
`recordset_release` can be draft. **Keep it.**

*The case for merging* is real: one table instead of two, no
`recordset_draft_file` / `recordset_release_file` split, no publish conversion —
just a status flip. It kills a class of draft-vs-release divergence bugs.

*The case for keeping* wins on one point: **immutability stops being structural
and becomes a convention.** Today a published `recordset_release` cannot be
edited by the draft endpoints — not because anyone remembered to check, but
because they operate on a different table. Merge them and every mutating
endpoint needs a status guard; the first one anybody forgets silently rewrites a
release that a shipped dataset release and a completed transfer already point
at. That is unrecoverable.

Secondary: `draft_status` (open/ready/invalid/published/deleted) is work state a
release has no business carrying; abandonment is free with a draft and messy with
a release row; and the diff / carry-forward machinery depends on the draft and
its base release being two distinct things to compare.

### ⚠ Pre-existing: dataset release numbers can already gap

`dataset_release.release_number` is `NOT NULL` and assigned when the draft
release is created, so abandoning a cycle **skips a dataset version number
today**. If gapless numbering matters, the same nullable-until-publish treatment
applies — but that is an existing bug, independent of this work.

## Frontend change map — pinning + draft releases *(mapped 2026-08-26)*

Two workstreams. **A is deliverable now and depends on nothing else. B is gated
on backend work that does not exist yet** — the schema landed but no code writes
it.

### ✅ A. Pin the cycle to a release — built 2026-08-26

Smaller than it looks, because URL construction is already funnelled through one
helper.

| # | file | change |
|---|---|---|
| 1 | `App.tsx:138` | add `datasets/:dataset_id/releases/:release_id/cycle` wrapping the six stage routes; keep `datasets/:dataset_id/cycle` as a bare entry point |
| 2 | `useCycle.ts:280` | `stagePath(datasetId, stage)` → `stagePath(datasetId, releaseId, stage)`. **The only place cycle URLs are built** — 5 call sites, all inside `CycleLayout` |
| 3 | `CycleLayout.tsx` | read `release_id`; when absent, resolve latest and `<Navigate replace>` to the pinned URL. Slots in beside the existing legacy-`?stage=` and bare-`/cycle` redirects, which already do exactly this shape |
| 4 | `useCycle.ts:108` | `useDatasetCycle(datasetId, releaseId)` → append `?release_id=`; **the query key must include it** or two releases share a cache entry |
| 5 | everywhere | rename `latest_dataset_release` → `dataset_release` — **23 references across 7 files**. Mechanical, but it is the change that makes the rest honest: once pinnable, the old name lies |
| 6 | `CycleLayout.tsx` | banner when pinned ≠ latest ("Viewing release 3; the current cycle is release 4") |

**Left alone:** `Detail.tsx:320` links to `/datasets/{id}/cycle` and keeps
working via the redirect — that is the point of keeping the bare entry point.

✅ **Resolved:** the payload now carries `latest_dataset_release_id` alongside
the (possibly pinned) `dataset_release`, so "am I looking at the current cycle?"
is one comparison and no second fetch is needed.

**Also renamed `in_latest_dataset_release` → `in_dataset_release`** (backend SQL
alias + 7 frontend references). Same lie as the other name: it means "in the
release this rollup describes", which is no longer necessarily the latest.

⚠ **The banner is unverified.** Every dataset in the fixtures has exactly one
release, so `pinned ≠ latest` cannot occur — seeing it requires starting a
second cycle on a dataset.

### B. Draft releases (gated on backend)

The schema exists; nothing writes it. Until the API creates a draft
`recordset_release` at Assemble and publish finalizes rather than creates, there
is nothing for the UI to show. **Do not start B before that lands.**

When it does, the frontend work is smaller than the backend work:

- **Assemble** — creating a draft also creates its draft release. UI gain: show
  the version being worked toward per recordset ("v3, draft") instead of only the
  draft name. `CycleRecordset` gains the draft release's id and status.
- **Bundle** — changes meaning more than markup. Membership already exists when
  the stage opens, so its recordset list goes from *choose what to include* to
  *review what carried forward and adjust*. The publish action becomes finalize.
  The add/remove endpoints already exist in `datasetReleaseForm.ts`
  (`recordsets/add`, `recordsets/remove`), so removal is wiring, not new API.
- **Removal becomes a visible action**, per the three-fates table above. Today
  nothing in Bundle drops a recordset from a release.

## Workstream B — build order and progress

Schema applied to dev 2026-08-26. Steps, in the order they can safely land:

| step | what | state |
|---|---|---|
| **B1** | `release_status = 'released'` filters on every membership reader | ✅ done 2026-08-26 |
| **B3+B4+B5** | Assemble creates the draft release · publish finalizes · abandon cleans up · `worked_this_cycle` | ✅ done 2026-08-26 |
| **B2** | cycle start copies membership forward | after B3 |
| **B6** | UI: Assemble version display + remove action, Bundle as review/adjust | last |

**Why B3/B4/B5 cannot be split:** publish must invert the moment Assemble starts
creating releases, or every draft yields two. And `DELETE /recordsets/drafts/{id}`
is a hard delete — without cleanup it orphans the draft release and its
membership row, and the `ON DELETE RESTRICT` on
`fk_dataset_release_recordset_recordset_release` turns that into a *failed*
delete rather than a silent one.

**Why B2 moved after B3:** copying membership forward is what would break the
old "worked this cycle" test, and the replacement for that test needs B3 to
exist. Landing B2 first leaves Verify wrong in between.

### ✅ B3+B4+B5 — the draft-release lifecycle (2026-08-26)

- **Create** (`create_recordset_draft`) also inserts a `recordset_release` with
  `release_status='draft'`, number and date null; links the draft to it; and,
  when the dataset has a **draft** `dataset_release`, evicts whatever that
  recordset was contributing and writes the membership row.
- **Publish** finalizes that same release — assigns `release_number`
  (`max+1` over released rows), stamps the date, flips the status. A draft with
  a null `recordset_release_id` (predating this) still takes the old insert
  path, so no backfill was needed.
- **Delete** stays a soft delete on the draft, but now drops the membership row,
  restores the recordset's latest *released* release in its place, and deletes
  the draft release. Restoring is a reconstruction of carry-forward, not an undo
  — nothing records what was evicted.
- **Decisions:** a draft created with no cycle open still gets its release, just
  no membership row (B2 will adopt those). Abandoning restores the latest
  released release rather than dropping the recordset from the dataset release.

**Verified end to end against the live API** on dataset 3: create → release 12
(draft, no number), membership written; publish → same release becomes
released n2 with **the membership row never rewritten**; a second draft swaps the
pointer to release 13; abandon deletes 13 and restores 12. Release numbering
stayed gapless — the two abandoned releases never claimed a number.

#### Two bugs this surfaced

- **`order by release_number desc` puts NULLs FIRST in Postgres**, so all three
  "latest release" queries would have returned the new draft release. One of
  them computes `next_number = release_number + 1`, i.e. a 500 on draft
  creation. All three now filter to `release_status = 'released'`.
- **The legacy publish path produced a `draft` release**: its insert never named
  `release_status`, which now defaults to `'draft'`. Caught by testing, not
  inspection — the row looked right until its status was read.

### ✅ B1 — membership readers filtered (2026-08-26)

Eight sites touch `dataset_release_recordset`. Two are writes and need nothing
(and the add/replace at ~1455 already contains the "evict any other release of
the same recordset" logic that B3's pointer swap needs — reuse it). The rest now
filter to `release_status = 'released'`:

| site | what a leaked draft would have done |
|---|---|
| transfer creation's "all recordsets" fallback | **shipped unpublished files** — an upload that cannot be recalled |
| `get_recordsets_for_dataset_release` (both branches) | same exposure, via the transfer membership picker |
| transfer drift `expected` CTE | false drift, and "Sync" would *add* the draft release to the transfer |
| destinations for a release | a not-yet-published recordset contributing destinations |
| `last_bundled` | a draft inflating "last bundled into vN" |
| `bundled` CTE → `in_dataset_release` | see below |

Verified in a rolled-back transaction by swapping a draft release into dataset
release 1's membership: every consumer returned 3 members where the raw table
held 4.

### ✅ "Worked this cycle" — ask the structure, not the clock

`in_dataset_release` keeps meaning *"a finished version of this recordset is part
of that release"*. A separate signal answers *"did this cycle work on it"*, which
is what drives **who appears in Verify** (`frozenThisCycle` → `cycleRecordsets`,
its only consumer).

The old test had a shortcut (in the membership) plus a date fallback
(`release_date >= dataset_release.when_created`). Both are being replaced:

- The **shortcut** dies with B2 — once membership is copied forward, everything is
  in it from day one.
- The **date fallback** was rejected 2026-08-26. `dataset_release.when_created` is
  **nullable**, and the helper returns false when it is, so Verify would silently
  show nothing. And it has no upper bound: with the cycle now pinnable, viewing
  release 3 counts release 4's work as release 3's, and gets worse with age. It
  is a time heuristic standing in for a structural question — the same mistake as
  `recordset_type` standing in for `is_dicom_file`.

**The replacement:** *this recordset has a draft whose `recordset_release_id` is
in this dataset release's membership.*

| case | result | why |
|---|---|---|
| being drafted now | true | draft → draft release → membership row |
| published this cycle | **still true** | same draft, same release, same row |
| carried forward | false | membership points at a release no draft here created |
| removed | false | no membership row |

"Still true after publish" is the entire reason the old helper existed — the
stage emptied out the moment its work completed.

⚠ **Depends on published drafts sticking around.** Publish sets
`draft_status = 'published'` and does not delete the draft (verified). If
anything ever purges published drafts, this signal dies — say so in the SQL.
⚠ Only true once B3 lands; drafts predating it have a null `recordset_release_id`.

## Open question — `data_is_live` vs `page_is_live`

`transfer_wp.published` / `.public` describe the **data objects transferred into
WordPress** (hence `wp_media_file_id`), *not* the landing page. Two distinct
facts, either true without the other:

- **data is live** — files actually available at a destination; per-destination,
  and IDC's happens on IDC's schedule.
- **page is live** — the Collection Manager post is published.

`dataset_release.release_status = 'live'` currently blurs these. Resolving it
likely means separate flags, which is a schema change and its own decision — so
this plan **stores neither**: go-live flips WP post status, and Disseminate reads
page state from WordPress. Revisit before anything depends on a stored answer.

## Risks

- **The publish QC gate is frontend-only today.** The bulk publish endpoint
  **must** enforce it server-side, or the Bundle modal becomes a way around the
  rule. See [TECH_DEBT.md](TECH_DEBT.md).
- **Two paths to every action.** Modals and standalone pages must share the
  `lib/*Form.ts` modules or they will drift.
- **Activity list scale.** `ActivitySourcePicker` fetches *all* activities and
  filters client-side; server-side search is a prerequisite at scale.

## Open items — known, not yet planned

Recorded so they aren't rediscovered late.

- **Dashboard integration.** The favorites-driven "Next Actions" work (batched
  `GET /datasets/cycles?favorites=true`, `lib/cycleTasks.ts`, a Next Actions list
  on `Home`) is specified in [DEV.md](DEV.md) but nothing connects it to this
  plan. Its whole premise is deep-linking to a stage's action — **and those
  targets just changed** to the new stage routes (`/cycle/verify`, `?action=…`).
  Sequence it after step 8 so the link targets are stable.
- **Mirabelle link-out — DONE 2026-08-05.** Verify's Manage modal (and the
  `/qc/reviews/:id` page, via the shared `QcAssignments`) now link each claimed
  slice to `/mira/qc/assignments/{assignment_id}` (same server, `basename:/mira`,
  opens to the first series). ⚠ **Mirabelle reviews DICOM only.**
- **Non-DICOM verification path — DONE 2026-08-06.** Non-DICOM-only recordsets
  now get a real QC review through the **same** Verify UI. `qc_series` was
  generalized to `qc_unit` (unit_type `series|file`; see TECH_DEBT resolved) so a
  `review_type='non_dicom'` review creates **one unit per non-DICOM file** — the
  row shows N/N, the expand lists the slice, and the per-slice **Review** button
  opens an approve modal ("Mark Approved", file download deferred) instead of the
  Mirabelle link. The review then completes and passes `isPublishable` like any
  other. `Start QC`/`Add Review` picks non-DICOM mode when the draft is
  non-DICOM-only. **Residual** (TECH_DEBT #13): mixed drafts and Clone-on-non_dicom.
  See memory `mirabelle-dicom-only`.
- **Should Setup be a cycle stage at all? — considered 2026-08-06, deferred.**
  Setup manages dataset *configuration* (which recordsets exist, their
  destinations, the WordPress links) — state that persists across every release,
  unlike the five stages after it, which each operate on one release. Moving it
  onto `datasets/Detail` would make a cycle genuinely start at **Assemble**, and
  would also delete the duplicate recordset table (that page and Setup render
  the same objects two ways) plus Setup's one-row dataset table, which just
  repeats the detail page's header and WP pill. **Not done because** the
  readiness checks in `stageMessage`/`stageSummaries` — no recordsets, dataset
  not WP-linked, missing destinations, unlinked recordset downloads, orphaned
  downloads — are real release preconditions that currently surface *as* the
  Setup tab; they'd have to be re-homed (most naturally a blocking prerequisites
  banner in `CycleNextAction` that links to the dataset page) before the tab can
  go, and a curator mid-cycle would then leave the wizard to fix them. Mechanical
  fallout if revisited: `STAGE_ORDER` / `STAGE_LABELS` / `STAGE_BLURBS` /
  `ACTION_LABELS` setup entries, the `setup` route, `LEGACY_STAGE.setup`,
  `firstUnfinishedStage`'s `?? "setup"` fallback, and a redirect from
  `/datasets/:id/cycle/setup` → `/datasets/:id`. Revisit once Bundle and
  Transfer are done and it's clear how often Setup is touched mid-cycle.
- **One draft dataset release at a time.** Bundle can cut a release while another
  is still `draft`, producing two half-assembled releases and an ambiguous
  "latest". The equivalent rule for drafts (one open per recordset) is now
  enforced server-side by `POST /cycle/drafts`; the release side has no guard.
- **Roles.** Every endpoint is `logged_in_user` with no role model. Freezing and
  transferring are consequential and currently available to anyone signed in.
- **What ends a cycle.** There's no explicit "this cycle is done" state; it's
  inferred from everything being distributed. Fine for now, but the Overview and
  the next-action banner both have to decide what to say when nothing is
  outstanding.

## Verification

Against the seeded fixture — dataset 1 (4 recordsets, one stale QC review, one
frozen-unbundled at v2), dataset 3 (mid-first-cycle, draft dataset release),
dataset 4 (bare):

1. Every stage route loads directly by URL; the tab strip highlights correctly.
2. `?action=…` opens the right modal; back closes it without leaving the stage.
3. Assemble: drafts for 2 recordsets from *different* activities; file counts
   match the timepoints; the modal never navigates away.
4. Bundle: compose a release **mixing** a newly frozen recordset with a
   carried-forward one.
5. Bulk failure is atomic — force one item to fail, confirm nothing was written.
6. Each extracted form still works from its original page.
7. `npm run build` clean at every step.

## Log

**2026-08-06 — Verify stage completed (step 4): non-DICOM through the same UI.**
The last piece of Verify — non-DICOM content — now flows through the *identical*
QC UI as DICOM, after two rejected attempts (a review-level "Verify" attestation,
then a separate non-DICOM sub-UI with `—` columns and a pill). What landed:

- **Data model generalized** (see TECH_DEBT resolved 2026-08-06): `qc_series` →
  `qc_unit` with a `unit_type` (`series | file`) discriminator, surrogate PK, a
  CHECK enforcing one natural key per type, `series_file_hash` → `unit_hash`, and
  `qc_series_history` → `qc_unit_history` re-keyed on `qc_unit_id`. Model **A**
  (single-table inheritance) chosen over a separate `qc_file` table because ~12
  count/rollup sites feed the same UI columns — two tables would make all of them
  type-aware forever; one table pays a one-time mechanical rename (Mirabelle is
  API-only, so no second consumer). Full DB reset applied.
- **Backend:** `create_qc_review` accepts `review_type='non_dicom'` → inserts one
  `qc_unit` per non-DICOM file (`unit_hash` = file digest). New shared helper
  `qc_approve_all_units()` backs both the yellow test-Complete and a new real
  `POST /qc/assignments/{id}/approve-units` (the modal's Mark Approved). Deleted
  the special-case `verify/unverify-non-dicom` endpoints. Cycle payload: dropped
  `non_dicom_verified*`, removed the `review_type <> 'non_dicom'` exclusion so
  these reviews count in the normal rollup; kept `has_dicom`/`has_non_dicom`.
  `split_qc_review` now allocates by `qc_unit_id` (type-agnostic).
- **Frontend:** `isPublishable` back to the uniform `qc` gate; `QcReviewModal`
  gained a `nonDicom` mode (no sampling controls); `QcSliceActions` Review button
  is `reviewType`-aware — non-DICOM opens a "Review Non-DICOM Files" modal
  (Mark Approved; download deferred), DICOM keeps Mirabelle. `VerifyStage`
  reverted to one uniform table; "Add Review"/"Start QC" opens non-DICOM mode
  when the draft is non-DICOM-only.
- **Residual** (TECH_DEBT #13): mixed drafts have no path to a separate non-DICOM
  review; Clone on a `non_dicom` review produces an empty review.
- ⚠ uvicorn has no `--reload` — restart after pulling. Restarted + visually
  confirmed 2026-08-06.

**2026-08-04 — Assemble stage built (step 3).** The stage went from a
read-only table to the working surface for draft assembly, decomposed so no
single modal is overloaded:

- **Row-hosted lifecycle + summary.** `AssembleStage.tsx` is now a hand-rolled
  table (not `DynamicTable`). Per draft row: **Mark Ready / Reopen**
  (`draft_status` → `ready`/`open`, gated on `file_count > 0`; `ready` pill is
  green via a new `StatusBadge` `success` mapping), a plain **Manage** button,
  and an expand chevron that renders `DraftSummary` in a full-width detail row.
  `useCycle.ts` `assembleStage()` is now real: **done when every open draft is
  `ready`** (`ready === open.length`), else `N/M ready` / `N open`.
- **`DraftSummary`** (self-fetches `/summary`): borderless inline stat line
  (files · size · patients/studies/series) + inline-labelled wrapping chips for
  file types and modalities. No inner scrollbars (rejected), no `max-w` cap
  (was clipping modality chips onto a second line).
- **`ManageFilesModal`** (replaced the deleted `EditDraftModal.tsx`): tabs
  **Add / Remove / Details**. Add = `DraftAddFiles`; Remove = `DraftFileList`
  (non-DICOM, per-row red Remove w/ confirm) + `DraftSeriesRemove`; Details =
  name/notes + **Discard** (soft-delete via `DELETE`). Opens on the launcher's
  chosen tab.
- **Draft sources.** `CreateDraftModal` gained **WordPress** (pull the file on
  the recordset's WP `download` object — new `POST …/files/from-wp`, reuses the
  importer pipeline) and **folder upload** (relative subpath kept as filename)
  alongside activity/release/upload/empty.
- **Series reconcile — counts-driven, scales.** For release/activity-derived
  drafts, `DraftSeriesReconcile` offers **Merge** (add-new / replace-**changed**
  series / add non-DICOM — "changed" detected by comparing per-series `file_id`
  sets, since files are content-addressed, so identical series are skipped) and
  **Replace-all** (destructive, exact-count confirm). No upfront series lists.
- **Series removal — search, not lists.** `DraftSeriesRemove` searches by any
  of patient / study UID / series UID / SOP UID / file id (paged at 10); a
  result drills into `DraftSeriesFiles` for per-file removal. Matched by
  `SeriesInstanceUID`.
- **New backend endpoints** (`distribution.py`, all under
  `recordsets/drafts/{id}`): `series-summary`, `series-search`
  (`series|files` granularity), `series/merge`, `content/replace-all`,
  `series/remove`, `series/apply` (not yet wired to UI), `files/from-wp`, and a
  `dicom` filter on `files`. **Removed:** the `series-diff` endpoint + models,
  and `create_cycle_drafts` / `POST /cycle/drafts` (superseded by per-recordset
  Create Draft). ⚠ uvicorn runs without `--reload` — restart after pulling.
- **Deleted:** `StartCycle.tsx` (+ `/cycle/start` route), `EditDraftModal.tsx`,
  a transient `Dropdown.tsx`.

**2026-07-30 — `except HTTPException: raise` bug, found and fixed twice.**
The draft-release guard above didn't actually block anything: `api_error()`
raises `HTTPException`, but the surrounding `except Exception as e:
db_error(...)` had no `except HTTPException: raise` before it, and `db_error`
only special-cases `UniqueViolationError`/`ForeignKeyViolationError` before
falling through to a generic `500 INTERNAL_ERROR` — so the 409 CONFLICT was
getting swallowed and replaced. Fixed by adding `except HTTPException: raise`
(the pattern `create_cycle_drafts` already used correctly). Auditing further
found the **identical pre-existing bug** in `update_recordset_destination`'s
"required for insert" 422 validation (unrelated to this session's changes
there) — fixed the same way. Scanned the whole file afterward for the same
shape (`api_error()` inside a `try:` whose `except` chain lacks `except
HTTPException: raise`) — these two were the only instances.

**2026-07-30 — one-draft-release-per-dataset guard added.** Flagged in this
doc's "Open items" long before this session ("the release side has no
guard") but low-stakes until now — with "Start Next Cycle" making release
creation a one-click, repeatable action, a double-click, an invalidation
race, or the standalone `releases/Create.tsx` form while a cycle is already
active could all silently create a second `draft` `dataset_release` for the
same dataset (`isCycleActive`/`latest_dataset_release` only look at the
highest release number, so a stray second draft would go unseen). Fixed in
`create_dataset_release` (`distribution.py`): check-then-insert inside a
transaction, `409 CONFLICT` if the dataset already has a `draft` release —
mirrors the existing one-open-draft-per-recordset guard in
`create_cycle_drafts`. No frontend change needed; `extractApiError` already
surfaces the message via toast on both call sites.

**2026-07-30 — Assemble gated on `isCycleActive`.** After starting a cycle
via the banner, nothing on the Assemble page changed — `AssembleStage.tsx`
never referenced `isCycleActive`/`latest_dataset_release` at all, so the only
visible feedback was the header subtitle and the banner itself. Gated the
one real action there (the "Start a Cycle" prompt/link, which is how
`recordset_draft`s get created) behind `isCycleActive(cycle)`: inactive shows
a plain "no cycle in progress — start one from the banner above" line
instead. The per-recordset status table stays visible either way — it's
informational, not an action, same as Setup/Verify's tables. Checked
`VerifyStage.tsx` while here: it's a pure read-only table today with no
creation action yet (that's step 4's job), so the gate note added under step
4 was corrected — nothing to gate there until that action exists.

**2026-07-24 — `dataset_release.release_date` made nullable (prep for
building the cycle on a draft release).** Raised while discussing step 3:
today no `dataset_release` exists until Bundle composes one, so "the cycle"
has no identity before then -- it's inferred from which recordsets have an
open draft. Making the cycle sit on an explicit draft `dataset_release`
created at cycle-start would fix two known gaps for free (one-draft-per-dataset
guard, "what ends a cycle") **without** abandoning the locked-in "recordsets
don't move together" composition model (Option A: release is an early
container; Bundle still freely composes membership via include-latest
checkboxes -- recordset_draft stays unlinked to any release). Blocker: a
draft release created at cycle-start has no known `release_date` yet, and
the column was `NOT NULL`. Fixed: `release_date` is now nullable (DDL +
live DB, user-applied), null while draft, and auto-stamped `now()` server-side
when `release_status` transitions to `released` (`create_dataset_release` /
`update_dataset_release` in `distribution.py`, both via `coalesce(...,
now())` so an explicit caller-supplied date always wins). `recordset_release
.release_date` is unaffected -- freezing is a concrete moment, stays required.
Frontend: `datasets/releases/Create.tsx` dropped the date field entirely (new
releases always start as drafts); `Edit.tsx` made it optional with a
"leave blank to auto-stamp" hint; every read path that renders a dataset
release's date (`useCycle.ts`, `BundleStage.tsx`, `LatestReleaseCard.tsx`,
`datasets/Detail.tsx`, `datasets/releases/Detail.tsx`, `transfers/List.tsx`)
now null-guards it. Test fixture: dataset 3's draft release (`create_dataset
_module_test_data.sql`) changed from a placeholder `NOW()` to `NULL` to match.
**Still open:** the actual cycle-start flow (where "start next cycle" lives,
whether Assemble requires an active draft release to create recordset_drafts)
-- this was a prerequisite, not the decision itself.

**2026-07-24 — Setup completion gates all five incomplete states.** `setupStage()`
(`lib/useCycle.ts`) previously only checked recordset count + dataset WP link +
recordset WP links. Added the two missing gates: recordsets with no destination
configured (`recordsetsMissingDestinations()`), and orphaned WordPress
downloads. The orphan check used to be computed client-side only in
`SetupStage.tsx` (via `useQueries` hitting `manager/downloads/{id}` per
candidate) and never fed the shared stage-summary/tab-dot/next-action logic.
Moved server-side: `GET /datasets/{id}/cycle` now returns
`orphaned_download_count`, computed by a new `count_orphaned_wp_downloads()`
helper in `distribution.py` that reads the dataset's WP collection/analysis-result
object directly (`wp_get`) and checks each unattached download's status
(best-effort — a WordPress hiccup returns 0 rather than failing the whole
cycle payload). This makes the orphan signal consistent everywhere the cycle
payload is read, at the cost of every cycle-stage page now carrying that
external WP round-trip, not just Setup. `SetupStage.tsx`'s client-side
computation was deleted in favor of reading `cycle.orphaned_download_count`.
Also: the destinations column's "None" text became a `StatusBadge` (`warning`
variant, distinct from the WordPress column's `neutral` "Not Linked" pill) so
both missing-state pills read as pills, not one styled and one bare text.

**2026-07-24 — default-destination integrity + pill click-to-edit.** Auditing
`update_recordset_destination` while hiding transfer mode surfaced a gap: a
recordset could end up with destinations but zero marked default (insert
doesn't force the first one default; the unique index only forbids *two*
defaults, not zero). Insert-time fix deferred (flagged below); **delete-time
fix landed**: `delete_recordset_destination` now runs in a transaction and,
if the deleted row was the default and others remain, promotes the lowest
`destination_id` to default rather than leaving none. Since an auto-promote
can't know which destination the user actually wants, `RecordsetDestinationModal`
gained a `editingDestinationId` prop (replacing `editing: RecordsetDestination`)
that resolves the row from the recordset's own fetched destinations, so
callers only need to hold an id. `SetupStage.tsx`'s destination pills are now
clickable (opens the modal in edit mode, e.g. to flip which one is default)
instead of only add (+) / remove (−); `recordsets/Detail.tsx` migrated to the
same prop, no behavior change there (row click already opened edit).
**Insert-time gap closed same day:** `update_recordset_destination` now checks
whether the recordset has any destination at all before inserting; if not,
`effective_default` is forced `True` regardless of the payload. Frontend
mirrors it — `RecordsetDestinationModal` pre-checks and disables the "Default
Display" box (with an explanatory line) when adding a recordset's first
destination, so the UI doesn't show unchecked while the server would force it
checked anyway.

**2026-07-24 — transfer mode hidden from the user.** The Transfer Mode picker
in `RecordsetDestinationModal` (used by both `SetupStage.tsx` and
`recordsets/Detail.tsx`) was confusing — curators don't have a real choice to
make, since each destination is meant to always use the same mode. Replaced
with a hardcoded frontend lookup, **`transferModeIdForDestination`**
(`lib/recordsetForm.ts`): `idc`/`gc`/`nbia` → `grouped bundle`,
`wp`/`asp` → `single dataset`; the recordset_destination save silently derives
`transfer_mode_id` from the chosen destination's abbr. `clinical update` is
unused by this mapping and left as dead lookup data. Also removed the
now-redundant read-only "Transfer Mode"/"Mode" displays across
`recordsets/Detail.tsx`, `datasets/releases/transfers/{List,Create}.tsx`, and
`transfers/Detail.tsx` — the concept is now purely internal plumbing, no
longer surfaced anywhere. `create_dataset_module_test_data.sql`'s
`recordset_destination` seed rows updated to match (gc/nbia rows moved from
`single dataset` to `grouped bundle`). Backend untouched — the upsert endpoint
still accepts `default_transfer_mode_id`, the frontend just always sends the
hardcoded value now.

**2026-07-22 — planned.** Architecture agreed (routes as stages, the stage page
as the working surface, modals as single-purpose inputs, shared form modules).
Already in place from earlier work: the cycle endpoint, the four-tab cycle page,
`POST /cycle/drafts` (verified incl. rollback), `ActivitySourcePicker`,
`lib/recordsetForm.ts`, `CreateRecordsetModal`, and the next-action banner. The
`/cycle/start` page exists and is superseded by step 2.

**2026-07-22 — simplified.** Dropped the per-stage `WizardModal` after realising
the stage route already *is* the wizard: it lists, selects, and acts, so a wizard
modal would duplicate the page above itself. Per-item input became small
row-level modals. This also removed the modal-nesting problem rather than solving
it. QC setup narrowed to one full review per draft assigned to the caller;
composition settled on include-latest checkboxes. Distribute stops at
manifests-generated/`draft` — queueing stays a deliberate per-transfer click,
since it starts real uploads and can't be undone. Existing drafts keep using
their Files page.

**2026-07-22 — fifth stage restored, stages renamed.** The publicize stage had
been dropped when this doc was written; it's back as **Disseminate** (step 6),
covering WordPress landing pages and the bulk go-live switch. **Release →
Freeze** (it names the act, and still covers bundling). **Distribute →
Transfer**, because "Distribute" and "Disseminate" are near-synonyms and would
have sat adjacent in the tab strip with no way to guess which held what;
"Transfer" also matches `dataset_release_transfer` and the existing nav section.
Strip at this point (later superseded): **Draft · QC · Freeze · Transfer ·
Disseminate**.

**2026-07-22 — gap sweep.** Two holes found by checking the plan against the
code. (1) Nothing in the cycle path writes `recordset_destination`, so a
recordset created here reaches Transfer with no defaults — destinations move into
recordset creation as step 5a, and the create endpoint should accept them so it
stays one transaction. (2) The project has **no frontend test runner**, while
this plan moves its trickiest rules into pure functions; vitest added as step 9,
deliberately last. Also recorded five known-unplanned items (dashboard
integration, Mirabelle link-out, the draft-release guard, roles, and what ends a
cycle) rather than leaving them to be rediscovered.

**2026-07-22 — Setup stage added.** The plan had no home for the
one-time-per-dataset work; it was smuggled into Draft (recordset creation), an
awkward "step 5a" (destinations), and Disseminate (the WP collection page). Added
**Setup** as stage 0: attach/create the WP collection page, add/attach recordsets
with their WP downloads and destinations, and dataset relations. The dataset
*itself* is still created from the Datasets list, before the cycle. Setup is not
a second `datasets/Detail.tsx` — same shared form modules, framed as readiness.
Steps renumbered; Disseminate narrowed to per-release (`version` /
`version_download`) plus go-live. Strip is now
**Setup · Assemble · Verify · Bundle · Transfer · Disseminate**.

**2026-07-22 — stage verbs.** Renamed the middle three from the earlier
noun/entity mix to activity verbs: Draft → **Assemble**, QC → **Verify**,
Freeze → **Bundle**. "Verify" drops the QC jargon; "Assemble" names the activity
rather than the `recordset_draft` state. Bundle names the composition — the
stage still freezes drafts first (irreversible), so its confirm step must say so.
Entities keep their names: Assemble creates drafts, Verify runs QC reviews,
Bundle publishes releases. Routes/`StageKey`/stage files follow the verbs.

**2026-07-22 — step 2, destinations landed (reversed once, then via a shared
modal).** First attempt made `destinations` required on `POST /recordsets`,
writing `recordset` + `recordset_destination` in one transaction with a
repeatable row editor on the create form/modal. **Reversed same day** — fully
reverted the backend and `recordsetForm.ts` changes. Landed instead: a
**"Destinations" button per recordset row** on `SetupStage.tsx` opening
`RecordsetDestinationModal` (add/edit **one** destination at a time, matching
scope already proven on `recordsets/Detail.tsx`), backed by the existing `PUT
/recordsets/{id}/destinations/{destination_id}` upsert — no backend change
needed. The modal and its data hooks (`lib/recordsetDestinations.ts` —
`useRecordsetDestinations`, `useSaveRecordsetDestination`) are shared: `Detail.tsx`'s
hand-rolled destination-modal state/effect (~150 lines) was extracted and
replaced with the same component, so Setup and Detail now read/write through
one cache entry instead of two independent fetches. `lib/recordsetForm.ts`
keeps `useDestinationLookups` (used by the new modal) but the create
form/payload/validation stay destination-free. Remaining step 2 pieces (WP
collection/downloads, relations, the readiness view) are still open.

**2026-07-23 — Setup WP linking hardened, quick-edit modals added.** Fixed
Analysis Result datasets always creating a `collection` WP object (missing
type derivation in Setup and `datasets/Detail.tsx`, plus a hardcoded
`wp_object_type = 'collection'` filter in the backend's `wp_collection_q`).
Replaced the "Linked" pill with the live WP slug, fetched by immutable
`wp_object_id` rather than ever storing a slug — with "Broken Link" and
"Trashed" detection and a loading skeleton to avoid a flash. Added Unlink to
`WpLinkModal`, and required the dataset to link before its recordsets can
(gate + reordered status message). Linking a recordset's `download` now
auto-attaches it to the dataset's `collection_downloads`/`result_downloads`,
with a read-only orphaned-download notice for anything left unlinked
(excluding trashed items). Added `DatasetEditModal`/`RecordsetEditModal` for
quick in-place edits, backed by new `lib/datasetForm.ts` and an edit-mode
extension of `lib/recordsetForm.ts`, also adopted by the full `Edit.tsx`
pages. Polish: icon-only action buttons with tooltips
(`components/icons.tsx`), name links open in a new tab, modal
backdrop-click-to-close disabled globally, tab-strip status dots redesigned,
WP search results decode HTML entities. Build clean throughout.

**2026-07-22 — step 1 done.** Route restructure landed. `CycleLayout` owns the
`useDatasetCycle` query and renders header + next-action banner + routed tab
strip + `<Outlet context={{cycle, datasetId}}>`; stages read it via
`useCycleContext()`. Six stage files under `pages/datasets/cycle/`; the old
`Cycle.tsx` deleted. `Tabs` gained `href` (renders `Link`s). `StageKey` rewritten
to the six verbs; all rollups/labels/messages updated. Legacy `?stage=` redirects
to the new routes (`qc`→`verify`, etc.); bare `/cycle` redirects to the first
unfinished stage. Setup and Disseminate are thin placeholders (filled in steps 2
and 7); their `stageSummaries` are provisional (Setup keys off recordset count,
Disseminate stays `pending`). `StartCycle` route kept until step 3. Build clean.
