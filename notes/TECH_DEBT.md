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
| 8 | Cycle excursions | Read-only links out of the cycle page (Open Draft, Reviews, transfer rows) navigate away with no path back to the cycle; the browser back button is the only return. There is no `return_to` convention anywhere in the app. | Form submissions were the breaking case and are now handled by in-place modals; back-button recovery works for read-only trips because `?stage=` is in the URL. | Either a validated `return_to` query param honoured by the pages reached from the cycle, or those views are reachable without leaving the cycle. |
| 13 | Non-DICOM QC — residual | Per-file non-DICOM QC now exists (see Resolved: `qc_unit` generalization 2026-08-06). Two gaps remain: (a) **mixed drafts** (both DICOM + non-DICOM files) — Verify's "Add Review" offers the DICOM form only; there's no path to add a *separate* `non_dicom` review to a mixed draft, so a mixed draft's non-DICOM files can't be reviewed. (b) **Clone on a `non_dicom` review** (Manage modal) re-runs the series draw (`QC_DRAW_CTE`) and produces an **empty** review — a footgun. Also cosmetic: `QcSeriesSummary` shows file units under `(none)` modality. | Focus was non-DICOM-*only* recordsets (the publish-gate concern); mixed + clone weren't needed yet. | Mixed: let Verify offer a non-DICOM review alongside the DICOM one (e.g. the modal's Type dropdown gains "Non-DICOM (all files)" when `has_non_dicom`). Clone: hide/disable Clone for `review_type='non_dicom'` in `QcReviewLifecycle`. **✅ Clone half done 2026-08-20** — Clone is now gated to stale **and** non-`non_dicom` reviews (see DEV.md), so the empty-clone footgun is closed. The **mixed-draft** gap (a) remains open. |
| 12 | QC "Complete" test shortcut | `POST /qc/assignments/{id}/complete-for-testing` + the yellow **Complete** button in `QcSliceActions` bulk-approve every unit in a slice and complete it, purely to stand up publishable QC state for Bundle-stage testing. Shares the `qc_approve_all_units()` helper with the real non-DICOM Mark-Approved action, but with a "complete for testing" history note; it bypasses real review — anyone can one-click approve. | Needed test data for Bundle before real per-series QC (Mirabelle) is wired for local dev. | Gate behind a dev/test flag or remove before production; at minimum restrict to non-prod. Endpoint + button + `useCompleteAssignmentForTesting` all get removed/gated together. |
| 14 | Dataset picker doesn't scale | `useDatasetOptions()` (`lib/recordsetForm.ts`) fetches `GET /datasets?limit=1000` once (60s cache) and renders every result as a plain `<select>` `<option>`. Two problems as the dataset count grows: (a) **silent truncation** past 1000 datasets — no error, just missing options; (b) **poor UX** well before that — a native dropdown with hundreds of options is unpleasant to scan by eye. Used by `recordsets/Create.tsx` and `RecordsetEditModal` (dataset reassignment, added 2026-08-06). | Raised during the pre-prod consistency cleanup (item 2); current dataset count doesn't warrant the work yet — noted rather than fixed. | Swap the `<select>` for a type-to-filter combobox (client-side, no backend change) once the list gets unwieldy; if/when nearing 1000 datasets, also add a `?search=` param to `GET /datasets` and debounce server-side. |
| 15 | `datasets/Detail` tables load everything | Both tables on the dataset detail page dropped their pagers (2026-08-06, to match the cycle's Setup table) and their fetches now ask for `limit=1000` — recordsets via `GET /recordsets?dataset_id=…`, releases via `GET /datasets/{id}/releases`. Past 1000 rows either list silently truncates: no error, no "showing N of M", just missing rows. Same failure mode as item 14, and note item 4 — the backend currently ignores `page`/`limit` and returns everything anyway, so today the cap is theoretical and the real cost is payload size on a big dataset. | The pagers were visual noise on datasets with a handful of recordsets/releases, which is every dataset we have. | Either the tables paginate client-side over the full list (`DynamicTable` already can) once a dataset gets large, or the endpoints do real server-side windowing per item 4 and the pagers come back. At minimum, surface a "showing first 1000" notice rather than truncating silently. |
| 16 | Two components left with no call sites | The 2026-08-06 detail-page rework orphaned two: **`ui/CollapsibleSection.tsx`** — zero usages app-wide now that both detail pages render plain `CardHeader` sections; and **`CycleStrip.tsx`** — nothing renders `<CycleStrip>` since `CurrentCycleCard` was deleted, but `ui/Tabs.tsx` still imports its `CycleStageState` type, so the file can't simply go. | Deleting components mid-cleanup is easy to regret — `CollapsibleSection` may well be wanted again, and `CycleStrip` needs its type re-homed first, which is a separate edit. | Decide per component: either delete `CollapsibleSection` (it's in git) or keep it as an intentional part of the UI kit; for `CycleStrip`, move `CycleStageState`/`CycleStage` to `ui/Tabs.tsx` (or a small shared types module) and delete the component, or keep it for the Overview page in step 8 of the cycle plan. |
| 9 | Content-identical files in one recordset — residual | Mostly **resolved** 2026-08-02 (option b + per-membership add/remove): `recordset_draft_file` / `recordset_release_file` have a surrogate PK + `file_name`; `files/add` takes `(file_id, file_name?)` items and accepts the same `file_id` repeated under different names; `files/remove` deletes by membership id; counts/size already count per-membership; QC is DICOM-only so unaffected; the clinical manifest (when built) reads one row per membership. Two things stay intentionally loose: (a) the draft **diff** endpoints compare on `file_id` via `EXCEPT`, so a file present twice reads as once — correct for their purpose (the timepoint/other-draft sources are nameless, so a content-level diff is the only well-defined one); (b) the unique index is `(recordset_draft_id, file_id, file_name)` with default NULL-distinct semantics, so a **null-named (DICOM)** file can be double-added via a direct API call (the frontend can't, since its bulk adds come from a de-duped diff set). | Diff semantics are a deliberate content-level choice, not a bug; DICOM double-add needs a deliberate direct API call. | If a membership-exact diff is ever needed, add a name-aware compare path for the release case; if null-named double-add must be blocked, switch the unique index to `NULLS NOT DISTINCT` (PG15+) or always assign a name. Motivating case: identical blank NIfTI segmentations for different subjects in one seg recordset. |

## Resolved

- **2026-08-19 — item 10, the hand-rolled cycle tables.** Extracted
  **`components/ExpandableTable.tsx`**: the `.data-table` shell, the `TH`
  styling (previously a `const TH` copy-pasted into each stage), the leading
  chevron column, the `Fragment` + full-width expand-row plumbing, and a
  `colSpan` computed from the header count instead of the hardcoded `7` both
  stages carried. Assemble and Verify now supply only `renderCells` /
  `renderExpanded` / `canExpand` / `expandLabel`.
  - **Trigger came early.** #10 said "best done when **Bundle** adds a third
    call site" — the third turned out to be the Drafts table on
    `recordsets/Detail`, asked for on 2026-08-19 (Assemble-parity: expander,
    Manage, Mark Ready/Reopen, new-tab name link). Bundle will now be the
    fourth and should use it too.
  - **Not cycle-local after all.** #10 specified `pages/datasets/cycle/`;
    it lives in `components/` because the third caller isn't a cycle page.
  - **Gained pagination**, which neither cycle table had, because the drafts
    list is release *history* and reliably grows. Controlled-only (caller owns
    page state) and it mirrors `DynamicTable`'s dual windowing: pass rows
    through when the server paged them (`totalItems > rows.length`), slice
    locally when it didn't. `DynamicTable` was deliberately **not** touched —
    the cost is that its pager markup ("Page X of Y" + Previous/Next + items
    per page) now exists in two places.
  - Expansion is keyed on the **row key** (`recordset_id`) rather than the
    draft id both stages used. Equivalent, since a recordset has at most one
    open draft.
  - Also folded in: `RecordsetLink` was defined identically in **three** files
    (Assemble, Verify, Bundle) → `components/RecordsetLink.tsx`, with an
    optional `to` override so the drafts table can link drafts.
    ⚠ **Behaviour change:** Bundle's copy lacked `target="_blank"`, so its
    recordset links used to navigate in-tab; they now open a new tab like the
    other stages, matching the documented rule ("Recordset links leave the
    cycle, so they open in a new tab"). Revert by giving the component a
    `newTab` prop if that was deliberate.

- **2026-08-19 — item 11, non-DICOM file names never listed.** `DraftFileList`
  (which already rendered name + size for a draft's non-DICOM files, with a
  Remove action) gained a **`readOnly`** prop, and `DraftSummary` now renders it
  read-only after the chip rows. Both surfaces get it at once: the draft detail
  page's File Summary and Assemble's expanded row. It self-hides when the list
  is empty, so all-DICOM drafts are unchanged — deliberately *not* gated on a
  count, because the summary payload has none that's reliable (`q_modality`
  joins `file_series` and counts join rows, so summing `by_modality.file_count`
  overcounts a file with several series rows). Adding a `non_dicom_file_count`
  to the summary endpoint was offered and declined as not worth a cross-repo
  change; the cost is one extra fetch per summary render, returning an empty
  array on DICOM-only drafts.
  ⚠ **Residual:** `GET .../files?dicom=false` takes no `limit` and returns
  *every* non-DICOM membership. `max-h-52` caps the visible list, not the
  payload, so a draft with tens of thousands of non-DICOM files ships the lot.
  That exposure pre-existed in the Manage modal; this adds a second surface
  reaching it. Cap it server-side (or paginate the list) if such a draft ever
  shows up.

- **2026-08-06 — item 6, the duplicated "latest release" rule.** The
  client-side copy (a `release_status !== "retracted"` filter + highest
  `release_number` reduce in `datasets/Detail.tsx`) went away with
  `LatestReleaseCard`, its only consumer. `NOT_RETRACTED` in `distribution.py`
  — used by `latest_only` and the cycle endpoint — is now the single
  definition, and nothing on the frontend recomputes it. Unrelated: the
  *recordset* pages still take `releases[0]` off a `release_number`-sorted
  list, which is a different (and retraction-unaware) notion.

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
