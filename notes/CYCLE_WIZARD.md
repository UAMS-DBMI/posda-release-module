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
| `lib/recordsetForm.ts` | `recordsets/Create.tsx`, `CreateRecordsetModal` (Setup + Assemble) | ✅ done; destinations still to add |
| `components/ActivitySourcePicker.tsx` | Assemble source modal, draft `Files.tsx` | ⚠ built; `Files.tsx` not yet migrated |
| `lib/qcReviewForm.ts` | `QcReviewsCard.tsx`, Verify modal | ☐ |
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
POST /datasets/{id}/cycle/drafts      [{recordset_id, activity_timepoint_id}]   ✅ built
POST /datasets/{id}/cycle/qc-reviews  [{recordset_draft_id}] -- full review each,
                                      assignment assigned_to = caller            ☐
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
      - **Recordsets** created here via `CreateRecordsetModal`; a shortcut to the
        same modal stays on Assemble. Destination + transfer mode are collected as
        part of creation (this is where the old "step 5a" lives) — extend
        `lib/recordsetForm.ts` and the create endpoint to accept destinations and
        write them in **one transaction**, so a recordset is never created
        unshippable.
      - **WP collection + downloads** attached-or-created here via
        `lib/wpObjectForm.ts` (search-before-create; created as `draft`). Depends
        on the `manager.py` WP routes — build those with this step.
      - **Relations** (`dataset_relation`, isDerivedFrom / isSourceOf) — an
        analysis result points at its source collection here.
      - Setup has no bulk write of its own; it's create/attach actions plus a
        readiness view. A dataset with zero recordsets can't leave Setup.
- [ ] **3 — Assemble stage does the work.** The page lists recordsets with
      checkboxes; each selected row gets a **Choose Source** button opening a
      one-recordset modal (`ActivitySourcePicker`), and shows the chosen
      activity/timepoint + file count once picked. **Create N Drafts** fires the
      already-built `POST /cycle/drafts`. Delete `StartCycle.tsx` and its route
      once absorbed. **Scope:** this stage *starts* cycles. Topping up a draft
      that already exists stays on its Files page, reached by the row's Open
      Draft link — that flow works, and its diff-and-add logic is the messiest
      code in the app.
- [ ] **4 — Verify.** Select drafts, then one action creates **one full
      review per draft, assigned to the current user**. No sampling choice and no
      splitting in this pass — the model supports several reviews per draft and
      partial sampling, but the common path is one full review. Splitting and
      reassignment stay on the review detail page. Extract
      `lib/qcReviewForm.ts` from `QcReviewsCard` so both create reviews the same
      way. New bulk `qc-reviews` endpoint.
- [ ] **5 — Bundle.** Extract `lib/publishForm.ts` (migrating the
      **hand-rolled** publish modal in `drafts/Detail.tsx` onto `Modal` while
      there) and `lib/datasetReleaseForm.ts`. The page lists drafts to publish
      and composes the release with **include-latest checkboxes** — one per
      recordset meaning "include its latest release", with an expander to pick an
      older version. **This is where carry-forward is expressed**: a just-frozen
      recordset and an unchanged one look the same in the list, differing only in
      which version they contribute. Release number/date/notes go in a small
      confirm modal. New `publish` + `release` endpoints.
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
- [ ] **9 — Cleanup.** Migrate `Files.tsx` onto `ActivitySourcePicker`; migrate
      the remaining hand-rolled modals (draft publish, WP-link in
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
- **Mirabelle link-out.** QC series are reviewed in Mirabelle, an external tool.
  The Verify stage can show progress but has nowhere to send a reviewer. Decided
  earlier as "omit until their URL contract exists" — still outstanding, and it
  is the one stage whose real work happens outside this app.
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
