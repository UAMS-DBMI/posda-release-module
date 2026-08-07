# TECH_DEBT.md — posda-remote-module

Running log of shortcuts taken, deferred cleanup, and known rough edges.
Each entry: what, why it was deferred, and what "done" looks like.
See [CLAUDE.md](../CLAUDE.md) for architecture and active feature checklists.

## Conventions for this file

- Add an entry whenever we knowingly defer work or take a shortcut to ship.
- Keep entries actionable: a reader should be able to pick one up cold.
- When resolved, move it to **Resolved** with the date, don't delete it.

## Open

| # | Area | Item | Why deferred | Done when |
|---|------|------|--------------|-----------|
| 1 | Types | Response/entity types are co-located per page and partly duplicated (e.g. `Dataset` redefined across List/Detail). | Fast iteration. | Shared types live in `src/types/` and pages import them. |
| 2 | Data fetching | Hand-rolled `fetch` + `useEffect` + manual loading/error state in every page. | No data lib chosen yet. | A shared `useApi`/query hook (or library) standardizes fetch, caching, and error handling. |
| 3 | API envelopes | Backend list responses have inconsistent shapes, worked around with per-page `normalize*` + `extractArray`. | Backend not yet standardized. | Backend settles on one envelope; normalizers collapse to one helper. |
| 4 | API pagination | List endpoints ignore the `page`/`limit` the frontend sends and return **all** rows (`list_response` → `{data, meta:{count}}`); tables paginate client-side and big lists load fully. | Server-side pagination not yet built. | All list endpoints window via `page`+`limit` and return `total` per the List conventions (CLAUDE.md item #10); omit ⇒ return all. |
| 5 | Release gating | A `draft` dataset release can still be given transfers and queued via the API. The cycle page hides the transfer actions while a release is a draft, but the endpoints are permissive. | Matches the existing QC-blocks-publishing precedent, which is also UI-only. Deliberate: keeps the `release_status` change to schema + display, without altering existing endpoint behavior. | `POST /datasets/releases/{id}/transfers` (and the queue transition) reject a release whose `release_status = 'draft'`, with a 422 the UI surfaces. |
| 6 | "Latest release" rule | Defined in three places: `NOT_RETRACTED` in `distribution.py` (used by `latest_only` and the cycle endpoint) and a client-side filter in `datasets/Detail.tsx`. | The dataset detail page computes latest from an already-fetched list rather than asking the server. | Detail.tsx gets its latest from the server (e.g. `?latest_only=true` or the cycle endpoint), so the rule lives in exactly one place. |
| 8 | Cycle excursions | Read-only links out of the cycle page (Open Draft, Reviews, transfer rows) navigate away with no path back to the cycle; the browser back button is the only return. There is no `return_to` convention anywhere in the app. | Form submissions were the breaking case and are now handled by in-place modals; back-button recovery works for read-only trips because `?stage=` is in the URL. | Either a validated `return_to` query param honoured by the pages reached from the cycle, or those views are reachable without leaving the cycle. |
| 13 | Non-DICOM QC — residual | Per-file non-DICOM QC now exists (see Resolved: `qc_unit` generalization 2026-08-06). Two gaps remain: (a) **mixed drafts** (both DICOM + non-DICOM files) — Verify's "Add Review" offers the DICOM form only; there's no path to add a *separate* `non_dicom` review to a mixed draft, so a mixed draft's non-DICOM files can't be reviewed. (b) **Clone on a `non_dicom` review** (Manage modal) re-runs the series draw (`QC_DRAW_CTE`) and produces an **empty** review — a footgun. Also cosmetic: `QcSeriesSummary` shows file units under `(none)` modality. | Focus was non-DICOM-*only* recordsets (the publish-gate concern); mixed + clone weren't needed yet. | Mixed: let Verify offer a non-DICOM review alongside the DICOM one (e.g. the modal's Type dropdown gains "Non-DICOM (all files)" when `has_non_dicom`). Clone: hide/disable Clone for `review_type='non_dicom'` in `QcReviewLifecycle`. |
| 12 | QC "Complete" test shortcut | `POST /qc/assignments/{id}/complete-for-testing` + the yellow **Complete** button in `QcSliceActions` bulk-approve every unit in a slice and complete it, purely to stand up publishable QC state for Bundle-stage testing. Shares the `qc_approve_all_units()` helper with the real non-DICOM Mark-Approved action, but with a "complete for testing" history note; it bypasses real review — anyone can one-click approve. | Needed test data for Bundle before real per-series QC (Mirabelle) is wired for local dev. | Gate behind a dev/test flag or remove before production; at minimum restrict to non-prod. Endpoint + button + `useCompleteAssignmentForTesting` all get removed/gated together. |
| 10 | Cycle tables hand-rolled | The Assemble and Verify stages each hand-roll a `.data-table` with an expand chevron, a full-width expanded detail row, and bespoke per-row action cells — `DynamicTable` (column-config only, no row expansion) couldn't host them, so the chevron + expand-row scaffold + TH conventions are duplicated across both (a chevron tweak already had to be made twice). **Do not** retrofit expandable rows into `DynamicTable` (used app-wide; high blast radius). | Deliberate — the expandable-row + custom-action pattern is cycle-only, and two call sites isn't enough to design a good abstraction. | Extract a small cycle-local `ExpandableTable` / `useExpandableRows` scaffold (chevron button + expand-row plumbing + `.data-table`/TH conventions) shared by Assemble/Verify — best done when **Bundle** adds a third call site. |
| 11 | Assemble expand-down lists no file names | The Assemble stage's expanded detail row (`DraftSummary`) shows only aggregate chips — file-type counts/sizes and DICOM modalities — never individual `file_name`s. For **non-DICOM** files the per-membership `file_name` is the only meaningful identifier (no patient/study/series to summarize by), so a curator can't see *which* files are in the draft. | Aggregate-only summary shipped first; per-file listing wasn't needed for DICOM. | The non-DICOM section of the expand-down lists each file's `file_name` (with size), so a curator can see the actual files without opening Manage. Data is available from the draft `files` endpoint / summary. |
| 9 | Content-identical files in one recordset — residual | Mostly **resolved** 2026-08-02 (option b + per-membership add/remove): `recordset_draft_file` / `recordset_release_file` have a surrogate PK + `file_name`; `files/add` takes `(file_id, file_name?)` items and accepts the same `file_id` repeated under different names; `files/remove` deletes by membership id; counts/size already count per-membership; QC is DICOM-only so unaffected; the clinical manifest (when built) reads one row per membership. Two things stay intentionally loose: (a) the draft **diff** endpoints compare on `file_id` via `EXCEPT`, so a file present twice reads as once — correct for their purpose (the timepoint/other-draft sources are nameless, so a content-level diff is the only well-defined one); (b) the unique index is `(recordset_draft_id, file_id, file_name)` with default NULL-distinct semantics, so a **null-named (DICOM)** file can be double-added via a direct API call (the frontend can't, since its bulk adds come from a de-duped diff set). | Diff semantics are a deliberate content-level choice, not a bug; DICOM double-add needs a deliberate direct API call. | If a membership-exact diff is ever needed, add a name-aware compare path for the release case; if null-named double-add must be blocked, switch the unique index to `NULLS NOT DISTINCT` (PG15+) or always assign a name. Motivating case: identical blank NIfTI segmentations for different subjects in one seg recordset. |

## Resolved

- **2026-08-06 — `qc_series` generalized to `qc_unit` (per-file non-DICOM QC).**
  Replaced the DICOM-only `qc_series` (PK `(qc_review_id, series_instance_uid)`)
  with `qc_unit`: surrogate PK `qc_unit_id`, a `unit_type` discriminator
  (`series | file`), nullable `series_instance_uid`, new `recordset_draft_file_id`
  FK, `series_file_hash` → `unit_hash`, and a CHECK enforcing exactly one natural
  key per type (single-table inheritance — chose it over a separate `qc_file`
  table because ~12 count/rollup sites feed the same UI columns and two tables
  would make all of them type-aware forever). `qc_series_history` → `qc_unit_history`
  re-keyed on `qc_unit_id`. A `non_dicom` review now creates one `qc_unit` per
  non-DICOM file, flows through the **same** Verify UI as DICOM (counts show N/N,
  same Complete/publish gate), and the per-slice Review button opens an approve
  modal instead of Mirabelle. Superseded the rejected review-level-only approach
  (old #13). All ~38 `qc_series` refs in `distribution.py`, the 3 DDL scripts,
  and the frontend updated; `split_qc_review` now allocates by `qc_unit_id` so
  it's type-agnostic. Residual gaps tracked in #13.

- **2026-07-22 — Recordset create form duplicated.** Briefly there were two
  definitions of the recordset create form (the full page and a hand-rolled
  modal). Collapsed into `src/lib/recordsetForm.ts`, which owns the field
  configs, lookups, validation, and POST payload; `pages/recordsets/Create.tsx`
  and `components/CreateRecordsetModal.tsx` supply only layout and what happens
  after a save. Fixed a real bug in passing: **neither** form validated
  `license_id`, which is `NOT NULL`, so an omitted license failed at the
  database instead of in the UI.
