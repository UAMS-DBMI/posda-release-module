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
- [ ] **2 — Setup stage.** Everything downstream of the dataset but done once.
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
- [ ] **5 — Bundle.** Extract `lib/publishForm.ts` (migrating the
      **hand-rolled** publish modal in `drafts/Detail.tsx` onto `Modal` while
      there) and `lib/datasetReleaseForm.ts`. The page lists drafts to publish
      and composes the release with **include-latest checkboxes** — one per
      recordset meaning "include its latest release", with an expander to pick an
      older version. **This is where carry-forward is expressed**: a just-frozen
      recordset and an unchanged one look the same in the list, differing only in
      which version they contribute. **Updated 2026-07-24:** the draft
      `dataset_release` already exists by this point (created via "Start Next
      Cycle") — the confirm modal now *finalizes* it (release notes, flip
      `release_status` → `released`, which auto-stamps `release_date`) rather
      than creating one; `release_number` was already auto-assigned at
      cycle-start. New `publish` + `release` endpoints (`release` becomes an
      update against the existing draft, not an insert).
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
