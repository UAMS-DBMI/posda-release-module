# LUSCIDA.md — a dataset that grows while QC runs

LUSCIDA is the first real collection taken through the release module (walkthrough
with the curators, 2026-11-12). It does something the design did not plan for:
its two recordsets keep **gaining files while their QC review is in progress**,
and the first release has to go out without up-versioning for each batch. This
file covers that use case and the fix to QC sync. **Design draft, nothing
decided yet.**

## Contents

1. [The collection](#1-the-collection)
2. [How QC reviews are done for it](#2-how-qc-reviews-are-done-for-it)
3. [What happens today when files are added](#3-what-happens-today-when-files-are-added)
4. [Proposal: sync in place](#4-proposal-sync-in-place)
5. [Decisions and open questions](#5-decisions-and-open-questions)
6. [Other items from the walkthrough](#6-other-items-from-the-walkthrough)
7. [Step plan](#7-step-plan)

---

## 1. The collection

- **Dataset #3 "LUSCIDA"**, type Collection, with a draft DOI. The short name may
  still change (the group has renamed it before); the WP page link is by post id,
  so renaming the dataset and the WP title/slug later doesn't break the link.
- **Two recordsets**, both Radiology Images, both CT only:
  - **Phase 1** (training): draft created from activity **2021**, ~1,109 series.
  - **Phase 2** (validation): draft created from activity **2022**.
  The names may change or the phases may be dropped; the WP pages say more.
- Phases 3/4 won't be in the first release; if they come, they're a new version.
- **Destination:** AWS. There is no AWS destination yet, so both recordsets are
  on **NBIA as a placeholder**, to change later.
- **How data arrives:** several source activities (six so far). Each one is
  curated in Posda, split into phase 1 / phase 2, and its files are **added to
  the same timepoint** of activities 2021 / 2022. Each add makes a new timepoint
  of 2021 / 2022 holding everything so far. The draft is then refreshed from
  that timepoint (series Merge).
- **Deadline:** participants must be able to download by **early January 2027**.
- WP pages for the dataset and both recordsets were created from Setup and
  linked. Both drafts were marked ready.
- **QC review #13** (phase 1, full) was created and is now one slice,
  **assignment #16**, assigned to Erica, who will do the visual review. Nobody is
  working on it yet.

## 2. How QC reviews are done for it

From the curators:

- The team curating the collection does the first reviews in Posda. For the
  release-stage review (what NBIA review used to be) a **second team** does the
  visual review and the public PHI review. One person may do both, or they're
  split between people.
- **Every series is reviewed once.** Splitting a review between people is for
  speed (one slice each), never for review by two people.
- These activities are under ~2,000 series each, so the visual review is
  probably one person per recordset. Splitting is more likely to be one person
  on visual, another on PHI.
- Second-team reviewers **won't use the release module.** The curator sends them
  the Mirabelle QC link for their slice (`.../assignments/16`) and they
  approve / flag there. The Review button's href is that link.

So **#13 / assignment 16 will have someone partway through it when the next
batch of files lands.** Their decisions and their link must not be disturbed.

## 3. What happens today when files are added

From the code (`distribution.py`, `qc_mark_open_reviews_stale()`):

1. To add files the curator reopens the draft (the UI blocks changes on a ready
   draft; the backend doesn't check). Adding the batch fires the staleness
   trigger, so **#13 goes `stale`** (an open or complete review; DICOM changes
   only stale DICOM reviews).
2. Erica can keep deciding units on the stale review; the status endpoints don't
   check `review_status`.
3. The only way out of stale is **Clone** (carry-forward), which:
   - makes a **new review** with **one new unclaimed 100% slice** holding every
     unit, old and new;
   - carries decisions only for series whose hash hasn't changed; changed or new
     series start pending;
   - sets #13 to `replaced`.

What that does to LUSCIDA:

- **Assignment 16's link goes dead.** Its units belong to a replaced review, and
  anything Erica decides after the clone is lost, because decisions were copied
  at clone time.
- **The slice structure is lost.** Who has which series and who has claimed what
  goes back to one unclaimed slice, so it has to be re-split and reassigned, and
  the new links sent out again. That happens for every batch.
- Re-splitting doesn't help either: `split` rebalances **all** units evenly, so
  the old and new series get mixed together across the slices.

The clone design assumed a draft changes because QC found a problem, and the
fix gets a fresh review. LUSCIDA changes because **more data arrived**, and the
work done so far is still valid.

## 4. Proposal: sync in place

**Sync** replaces Clone as the way out of a stale review. It brings the review
back in line with the draft **without a new review and without touching
finished slices**:

| Unit vs. current draft | Sync does |
|---|---|
| Unchanged (same UID, same hash) | Nothing. Same slice, same decision. |
| **Added** (UID not in the review) | New `qc_unit`, pending, in the target slice |
| **Changed** (same UID, new hash) | Back to pending, **moved to the target slice**. The unit keeps its history. |
| Removed (UID no longer in draft) | Unit deleted, with its history |

**Target slice**, which the curator picks in the Sync modal:
- **New slice** (default): one new unclaimed `needs_qc` slice for this sync.
  That means a new link per batch, which suits handing batches to different
  people.
- **Combine into slice #N**: an existing slice. Its reviewer keeps one link
  for every batch, which is LUSCIDA's case if Erica reviews them all. Only
  **unfinished** slices can be picked, so a finished slice never reopens. If
  all slices are finished, only "new slice" is offered. With one unfinished
  slice it is pre-selected.

A sync with only changed series still sends them to the target slice. A sync
with only removed series creates no slice.

**Partial reviews:** draw only the added series, at the review's percentage
(same per-modality rule), so existing series stay in or out of the sample as
they were. Changed series are already in the sample.

Then the review leaves `stale`. `qc_sync_review_status` decides open or
complete (it only touches open ↔ complete now, so sync must set `open` first),
and each touched slice goes through `qc_sync_assignment_status`.

Why this over the other ideas from the call:

- **A separate review for only the new files.** Two reviews would together cover
  the draft, and the publish gate already allows several reviews. But each
  review is "a QC pass over the draft", and a review that covers only part of it
  can't be told apart from a sampled one. With one review, the review stays the
  coverage record and slices stay the division of work, which is what slices are
  for.
- **Clone, then reassign.** That's what we have now, and §3 is the problem.

Same mechanism later for the **PHI review** (§6). Once it's in the module, new
files get their own PHI work item rather than being picked out of the earlier
report.

## 5. Decisions and open questions

**Decided (2026-11-17):**
- **Stale, then wait.** Adding files still stales the review. Nothing changes
  until the curator runs Sync.
- **A changed series is checked again**, pending in the target slice, so
  finished slices stay finished.
- **Target slice: new (default) or combine into an unfinished one**, with
  the rules in §4.
- **Partial reviews: draw only the added series** at the review's percentage.
  How (decided 2026-11-17): nothing records which series the draft had when
  the review was drawn (`recordset_draft_file` has no timestamp), so a
  never-sampled series and a new one look alike. Sync re-runs the review's
  draw (same seed, per modality, `ceil(pct × count)`) over the current draft
  and adds the selected series that have no unit. Existing units never
  leave for falling out of the re-draw. The sample stays at the percentage
  of the current draft. Accepted trade-off: some of what's added can be old
  series that crossed the cutoff as the draft grew. Rejected: storing the
  draft's high-water `recordset_draft_file_id` on the review (schema change,
  and existing reviews would have none).
- **No slice labels.** Slices stay identified by assignment id. No schema
  change.
- **Clone leaves the UI, the endpoint stays.** Clone ends every slice and
  breaks the links reviewers were sent. Sync keeps decisions and slices, so
  Clone has nothing to add for curators. `POST /qc/reviews/{id}/clone` stays
  for admin / scripted use.

- **Sync deletes removed units** (decided 2026-11-17). The unit and its
  `qc_unit_history` (cascade) go. A series removed and later added back
  comes back as an added series, pending, and is reviewed again. That case is
  rare, so the lost decision is accepted. No schema change, and the counts
  need no filter.
  - Rejected: keep the unit and check "still in draft" when reading.
    Tested 2026-11-17 on synthetic session-only temp tables (5M
    `file_series` rows, 1M-file draft): status counts went from ~2 ms to
    861 ms on a 10,200-unit review, and the all-reviews rollup from 2 ms to
    910 ms. LUSCIDA's size (918 units, 90k files) was 23 ms, but the bigger
    drafts rule it out.
  - Rejected: a stored `removed_at` on `qc_unit` set by Sync. Cheap to read,
    but a schema change for a rare case.
  - Between the removal and the sync the units still count, but the review
    is stale then, so the publish gate doesn't pass it anyway.
  - **A slice left with no units is deleted too**, and the Sync modal warns
    first, naming the slices. "Left with no units" is after the sync: a
    slice empties when its series are all removed, or all changed and moved
    to the target. A slice picked as the combine target receives the added
    / changed series, so it stays (with its reviewer's link). Which slices
    are deleted therefore depends on the target choice. An empty slice could never complete
    (`qc_sync_assignment_status` needs at least one unit), so it would sit in
    the queues as unfinished work. Its review link stops working.
- **Non-DICOM reviews get the same Sync**, matched by file name instead of
  series UID (`QC_FILE_COMPARE`: same name + new hash = changed).

- **Review link lands on what's left** (decided 2026-11-17). The slice's
  Review button (`QcSliceActions.tsx`) opens
  `/mira/qc/assignments/{id}/*/Pending/All` instead of
  `/mira/qc/assignments/{id}`. Mirabelle already supports `*`: it redirects
  to the first series in the filtered list (`RouteQCAssignment.jsx`). A
  reviewer whose slice just gained series lands on the new ones.
- **Status casing in Mirabelle** (decided 2026-11-17): statuses show and go in
  the URL as **"Pending", "Approved", "Rejected", "Flagged", "All"**. They
  stay lowercase in the DB and the API. Modalities stay uppercase (as stored).
  Mirabelle work:
  - The Status dropdown options (`QCNavBar.jsx`, `QC_STATUS_OPTIONS`) become
    title case.
  - The route reads the URL status case-insensitively, so old lowercase links
    still work, and lowercases it only when calling the API (`qc.js`,
    `getQCAssignmentSeries`).

## 6. Other items from the walkthrough

Notes-to-self from the call, not part of the sync work. Listed so they aren't
lost:

**Release module**
- [ ] Remove the DOI field from the New Recordset modal until recordset-level
      DOIs exist.
- [ ] Dataset DOI: strip an `https://doi.org/` prefix if one is pasted.
      Reconsider whether the dataset needs a DOI at all, since WP has it. The DOI
      and the short name are the two values kept in both places.
- [ ] WP "Create new" from Setup: prefill the title (and slug) from the
      dataset's short name / the recordset name. It was meant to and didn't.
- [ ] QC: stop auto-assigning the first review to its creator. The release-stage
      review is normally done by another team.
- [ ] Split modal: the slice-count input is too sensitive (it jumped to 15).
- [ ] Activity picker on Create Draft: hint to click the result below the
      search.
- [ ] Draft row expand queries live and is slow. Worry at ~1M files.
- [ ] Pickup queue may need more context per row.
- [ ] Add an AWS destination (LUSCIDA is on NBIA as a placeholder).
- [ ] **PHI review in the module.** The public PHI scan compares against NBIA,
      which isn't in this path. It needs a version over the draft's files.
      (The files are byte-identical to Posda's, so a Posda report is equivalent
      in content.) Keep the current ordering (most likely PHI first, UIDs last).
      Not split the way visual review is. Gets the batch-slice mechanism from §4.

**Mirabelle**
- [x] Download button on the QC review route. Done 2026-11-12, Mirabelle +
      oneposda changes ready to deploy.
- [ ] Re-selecting the current preset doesn't reset it (you have to pick another
      and come back).
- [ ] Reload Image doesn't reset the view-mode buttons.
- [ ] After a refresh the left-click tool (window/level) isn't selected by
      default.

**Posda**
- [ ] `ApplyPrivateDispositions.py`: more verbose confirmation / a report of
      what it changed. Check what its `/tmp` file is.

**Test plan agreed on the call:** the curators add the next completed activity's
files to 2021 / 2022 (add to timepoint). I QC ~10 series on #13 as myself, add
the batch, and check the existing decisions and assignment survive (back out my
decisions with a query afterwards). Then a live run with Erica on a call. Erica
gets her link only once sync is safe.

## 7. Step plan

One step at a time: discuss, build, check, then the next. Statuses in the
release module keep their current text case. Only Mirabelle changes casing.

**1. Backend: Sync.** *(oneposda)* ✅ Built and tested 2026-11-17.
- As built:
  - The plan is one query per review type (`QC_SYNC_SERIES` /
    `QC_SYNC_FILES`) returning a row per unit to add, re-review or delete.
    `qc_sync_counts` maps it to the stale breakdown's keys (`changed`,
    `would_add`, `would_drop`), so the existing UI type still fits.
  - Preview response: those counts plus `targets` (the review's unfinished
    slices, with `unit_count`) and `emptied_assignment_ids` (slices that a
    sync to a new slice would delete).
  - Sync response: `review`, the counts, `target_assignment_id` (the slice
    used, or null when nothing was added or changed) and
    `deleted_assignment_ids`.
  - A sync that would leave the review with no units is refused (422,
    "cancel it instead").
  - The local API container doesn't reload on edits: restart
    `oneposda-posda-api-1` after changing `distribution.py`.
- Test (throwaway draft on recordset 1, deleted after): a full review split
  in two, one slice finished. One added, one changed and one removed series
  synced into the unfinished slice: the finished slice stayed complete,
  shares became 48 / 52, and the changed unit's history reads "approved →
  pending, content changed, re-review (sync)". Combining into the finished
  slice and syncing an open review both gave 409. Removing every series of
  a slice listed it in the preview, and the sync deleted it. A 50% partial
  review previewed nothing right after creation; adding 13 series back drew
  7. A non-DICOM file with a new hash went to a new slice, and its old slice
  was deleted.
- `qc_sync_plan(conn, review)` works out the added, changed and removed units
  against the current draft:
  - DICOM is keyed by series UID. A partial review draws **only the added
    series**, at its percentage, per modality, with the review's seed.
  - Non-DICOM is keyed by file name (`QC_FILE_COMPARE`).
- `GET /qc/reviews/{id}/sync-preview` returns the counts, the slices that
  can be picked as a target (unfinished ones), and the slices that would be
  left empty if the sync goes to a new slice. Picking one of those as the
  combine target keeps it; the UI drops it from the warning. The stale breakdown in review
  detail switches to the same plan, because its full redraw disagrees with
  "draw only the added series".
- `POST /qc/reviews/{id}/sync` with body `{ target_assignment_id: int | null }`
  (null = new slice), in one transaction:
  1. Check: the review is stale, and the target belongs to the review and
     isn't complete. 409 otherwise.
  2. Added series become new pending units. Changed series go to pending, take
     the new hash, and move to the target slice. History records "content
     changed, re-review (sync)".
  3. Removed units are deleted (their history cascades). Then any slice left
     with no units is deleted.
  4. Set the review to `open`. Recompute each slice's `share_percentage` from
     its unit counts, run `qc_sync_assignment_status` on every slice, then the
     review status settles.
  - If nothing is added or changed, no new slice is created.
- Clone's endpoint is unchanged.
- Check: on a test copy, approve a few, add files, sync with new slice, then
  with combine. Finished slices are untouched and the counts add up. Remove
  a pending series and sync: its unit is gone, and its slice completes if
  that was its last pending series. Remove every series in a slice and sync:
  the preview lists the slice, and the sync deletes it.

**2. UI: Sync replaces Clone.** *(release module)*
- In `QcReviewLifecycle`, the stale banner and the header action become
  **Sync**. The modal shows the counts ("N added, N changed, N removed from
  draft") and the target choice: new slice (default) or combine into an
  unfinished slice, pre-selected when there's only one. If the preview lists
  slices that will be left empty, the modal shows a warning naming them
  ("Slice #N will be deleted: none of its series remain in it"). The
  warning follows the target choice: a slice picked as the combine target
  isn't deleted.
- Remove the Clone button and modal, and `useCloneQcReview` if nothing else
  uses it. Remove `onCloned` from its hosts.
- `useSyncQcReview` invalidates the same keys Clone did (`["qc-reviews"]`,
  `["qc-assignments"]`).

**3. Mirabelle: title-case statuses.** *(mirabelle)*
- The `QC_STATUS_OPTIONS` values become "All" / "Pending" / "Approved" /
  "Rejected" / "Flagged".
- The route reads `:qcStatus` without regard to case, writes it title case in
  the URLs it builds, and lowercases it in `qc.js` only for the API.
- **Must deploy before step 4.** Today's Mirabelle would send
  `qc_status=Pending` to the API and match nothing.

**4. UI: the Review link lands on what's left.** *(release module)*
- In `QcSliceActions.tsx`, the href becomes
  `/mira/qc/assignments/{id}/*/Pending/All`.

**5. LUSCIDA test.** As agreed on the call (§6): the curators' next activity
batch, ~10 decisions on #13 first, then sync, check, and back the decisions
out. Then the live run with Erica.
