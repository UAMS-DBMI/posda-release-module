# QC_STAGING.md — QC before assembly

Doing QC on staged data before it is known how it will be split into
recordsets. Started 2026-09-30. **Design draft, no decision made yet.**

## Contents

1. [The problem](#1-the-problem)
2. [What makes it workable](#2-what-makes-it-workable)
3. [The staging area](#3-the-staging-area)
4. [Data model](#4-data-model)
5. [Flow](#5-flow)
6. [Rules](#6-rules)
7. [What changes in code](#7-what-changes-in-code)
8. [Alternatives considered](#8-alternatives-considered)
9. [Open questions](#9-open-questions)
10. [Step plan](#10-step-plan)

---

## 1. The problem

Data is staged in Posda activities until it is known how it will be split into
recordsets. The split may not be decided until the last minute, but QC still has
to happen, and today QC can only start once a recordset draft exists
(`qc_review.recordset_draft_id` is `NOT NULL`). So QC ends up squeezed in after
the split, at the point where time is shortest.

Established so far:

- **Splits always keep whole series together.** A series is never divided
  between recordsets.
- **Staged data can span several activities.**

## 2. What makes it workable

A QC unit is identified by its content, not by where it sits. A series unit is
`(series_instance_uid, unit_hash)`, where `unit_hash` is the md5 of the series'
file digests (see `qc_unit` in 0047). A series moved whole into any recordset
keeps both values. So an approval given before the split still describes exactly
the same bytes afterwards.

What is missing is only the *lookup*: carry-forward today follows one draft's
clone chain (`cloned_from_review_id`), so it cannot see an approval made
anywhere else.

## 3. The staging area

A **staging area** is a dataset-level set of **pinned activity timepoints**,
gathered from any number of activities. QC runs over the union of their files,
before any recordset draft exists.

- **Dataset-level:** the recordsets it will feed belong to one dataset, and that
  is also the scope for reusing approvals (see §6).
- **Timepoints, not activities:** an activity gains new timepoints as it is
  edited. Pinning says exactly which bytes were reviewed. Moving to a newer
  timepoint is an explicit step that marks the affected series for re-review
  (see §6).
- Drafts are already created from activity timepoints
  (`activity_timepoint_id` on draft create, and the series compare/apply flow),
  so assembling from the same timepoints needs no new mechanism.

## 4. Data model

⚠ **DB schema change.** Per the migrations convention, this goes in one dated
file (`YYYYMMDD_qc_staging.sql`); 0047 and the drop script stay frozen, and
DbSchema is resynced afterwards.

```
qc_staging
  qc_staging_id        identity PK
  dataset_id           → dataset (CASCADE)
  staging_name         text NOT NULL
  staging_notes        text
  audit fields

qc_staging_timepoint
  qc_staging_id        → qc_staging (CASCADE)
  activity_timepoint_id → activity_timepoint (RESTRICT)
  PK (qc_staging_id, activity_timepoint_id)

qc_review  (changed)
  recordset_draft_id   now NULL-able
  qc_staging_id        → qc_staging (CASCADE), NULL-able      -- new
  CHECK exactly one of recordset_draft_id / qc_staging_id is set

qc_unit  (changed)
  inherited_from_qc_unit_id → qc_unit (SET NULL), NULL-able   -- new
```

`inherited_from_qc_unit_id` records where a draft unit's status came from, so a
draft review never looks approved without anyone having looked. The reviewer
and time are read through it from the source unit's `qc_unit_history`.

## 5. Flow

1. **Stage.** Create a staging area on the dataset and add activity timepoints
   to it.
2. **QC the staging area.** Create a review on it. Series units and hashes are
   computed from `activity_timepoint_file` across the pinned timepoints. Split
   the review into assignments and review in Mirabelle exactly as today.
3. **Assemble.** When the split is known, create each recordset's draft from the
   same timepoints, picking the series that belong to it (existing flow).
4. **Verify, pre-filled.** Creating a draft's review looks up every unit in the
   dataset's staging reviews with the same `(series_instance_uid, unit_hash)`,
   and copies its status and notes, setting `inherited_from_qc_unit_id`.
   Anything unmatched starts `pending` as usual.
5. **Complete.** If nothing is left `pending`, the review can be completed in
   one click, and the existing publish gate (`isPublishable`) passes. The gate
   itself does not change: a draft still needs its own complete review.

## 6. Rules

- **Match scope:** approvals made in the same dataset only. A series UID
  turning up in an unrelated dataset does not inherit anything.
- **What is inherited:** every non-`pending` status, `rejected` and `flagged`
  included, the same as clone carry-forward. A series rejected in staging stays
  rejected in the draft.
- **Several sources match:** take the most recent status change. If they
  disagree (approved in one review, rejected in another), inherit neither and
  leave the unit `pending`, with a note.
- **Same series in two pinned timepoints:** with an identical hash, it is one
  unit. With a different hash, it is a **conflict**: review creation is refused
  until one timepoint is removed or updated. Otherwise it is ambiguous which
  version was reviewed.
- **Late fixes:** re-de-identification after QC changes digests, so only those
  series lose their match and fall back to `pending`. Moving the staging area to
  a newer timepoint marks its open review `stale`, and the existing diff shows
  added, removed and changed series.

## 7. What changes in code

Backend (`distribution.py`):

- **New:** staging CRUD, and add/remove timepoint, under
  `datasets/{id}/qc-staging`.
- **New:** create a review on a staging area, hashing series from
  `activity_timepoint_file` rather than `recordset_draft_file`.
- **Changed:** draft review creation seeds units from matching staging units
  (§5 step 4).
- **Changed:** the Mirabelle-facing assignment endpoints resolve a unit's files
  through the review's draft, e.g.
  `GET /qc/assignments/{id}/series/{uid}/files` joins
  `recordset_draft_file rdf on rdf.recordset_draft_id = qr.recordset_draft_id`.
  Each needs a staging branch that resolves through the pinned timepoints
  instead. Mirabelle itself is unaffected, as it only talks to these endpoints.
- **Check:** the QC rollups that join `qc_review` to `recordset_draft`. Staging
  reviews must not leak into a draft's counts, and inner joins will silently drop
  them wherever they are needed.

Frontend:

- **New:** a staging page on the dataset (outside the cycle, since it precedes
  Assemble): its timepoints, its review(s) and their progress.
- **Changed:** Verify shows how many units were inherited, and from where.

## 8. Alternatives considered

- **Holding recordset.** QC one throwaway recordset that holds everything, then
  split. No schema change beyond a "never release" flag, but it is a fake entity
  that the cycle, the dataset's recordset list and Setup's destination checks
  would all have to ignore. Still needs the same lookup as §5 step 4.
- **Series-level source of truth.** A table of approvals keyed by
  `(series_instance_uid, unit_hash)`, with reviews as views over it. The
  cleanest model long term, but it reworks ~12 rollup queries and carry-forward
  for the same practical result.

## 9. Open questions

- **Non-DICOM.** File units are keyed by `recordset_draft_file_id`, which only
  exists inside a draft. Staging would need file units keyed by `file_id`, and
  the match by digest. Proposed: DICOM only in the first cut (non-DICOM is
  largely curated separately anyway; see TECH_DEBT #13).
- **Partial reviews.** A staging review sampled at N% approves only the sample.
  Does a draft inherit a sample-level sign-off, or only per-series statuses?
- **More than one staging area per dataset?** One per release cycle seems
  natural, but nothing requires it.
- **Deleting a staging area** after its approvals were inherited: `SET NULL`
  loses the provenance link. It may need to be blocked, or archived instead.
- **Who can QC staging**, given there is no role model yet (CYCLE_WIZARD open
  items).

## 10. Step plan

1. Migration: new tables and columns, the `qc_review` CHECK → verify: applies
   cleanly on a copy, and existing reviews are unaffected.
2. Staging CRUD and timepoint membership (API, then the dataset page).
3. Staging review creation, with the duplicate-series conflict check.
4. Mirabelle-facing endpoints resolve staging reviews → verify: a staging
   assignment opens and reviews in Mirabelle.
5. Seed draft reviews from staging units → verify: a draft assembled from staged
   series comes up with the inherited statuses and correct provenance.
6. Verify UI: inherited counts and one-click complete.
