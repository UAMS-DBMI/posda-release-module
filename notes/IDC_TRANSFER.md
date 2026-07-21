# IDC_TRANSFER.md — notes on the IDC transfer workflow

Working notes for the IDC (Imaging Data Commons) destination transfer flow.
This file is a running log for whatever comes up while this is the focus —
add to it as we go, most relevant/current at the top of each section is fine,
no need to keep it tidy.

## What we know so far (from CLAUDE.md / codebase)

- Data model: `dataset_release_transfer` → per-destination table `transfer_idc`
  (sibling tables: `transfer_nbia`, `transfer_aspera`, `transfer_gc`, `transfer_wp`,
  `transfer_recordset`). DDL source of truth:
  `../oneposda/database/migrations/posda_files/add_dataset_module_tables.sql`.
- Backend: `../oneposda/posda/fastapi/app/papi/routes/distribution.py` —
  `transfers/{id}` CRUD + per-destination subresources, including `idc`, plus
  manifest-generation endpoints.
- Frontend touch points so far: `src/pages/transfers/Detail.tsx` (per-transfer
  detail, includes IDC-specific fields) and
  `src/pages/datasets/releases/transfers/Create.tsx` (transfer creation flow).
- IDC manifest generation is long-running — TECH_DEBT/CLAUDE.md item #2 already
  flags this as the intended use case for TanStack's `refetchInterval` polling
  (not yet implemented).

### DDL as of 2026-07-21

- **Release DOIs:** both release tables now carry their own DOI —
  `dataset_release.release_doi` (UNIQUE `unq_dataset_release_release_doi`) and
  `recordset_release.release_doi` (UNIQUE `unq_recordset_release_release_doi`),
  both nullable. Joins the existing entity-level DOIs `dataset.dataset_doi`
  (NOT NULL, UNIQUE) and `recordset.recordset_doi` (nullable, UNIQUE). This is
  the DB backing for the manifest's `dataset_version_doi` — a per-release DOI
  distinct from the dataset-level `dataset_doi`.
- **`transfer_idc` columns:** `dataset_release_transfer_id` (PK/FK),
  `base_gcs_url`, `dataset_manifest_file_id`, `file_manifest_file_id`,
  `clinical_manifest_file_id`, `published`, `"public"`. Each manifest FK →
  `file(file_id)`, `ON DELETE RESTRICT`.
  - `base_gcs_url` = base location of the manifest/package; the anchor that
    per-file relative URLs resolve against.
  - `file_manifest_file_id`'s FK constraint is confusingly named
    `fk_transfer_idc_file_recordset_manifest` — name lag, not a second column.
- **`file` table** (`all.sql`, base Posda schema): `file_id`, `digest text NOT
  NULL`, `size`, `is_dicom_file`, `file_type`, `processing_priority`,
  `ready_to_process`. `digest` is the content hash (used elsewhere for QC
  series staleness detection).
- **`downloadable_file` table** (`all.sql`, base Posda schema): `downloadable_file_id`
  (PK), `file_id` (FK → `file`), `security_hash text NOT NULL`, `creation_date`,
  `valid_until`, `mime_type`. This is the source of each manifest's
  `*_downloadable_file_id` / `*_security_hash` pair on the frontend
  (`DestSettings` in `transfers/Detail.tsx`, and the same pattern on
  `RecordsetRelease.downloadable_file_id`/`.security_hash`): look up a
  manifest's `file_id` in `downloadable_file` to get its `downloadable_file_id`
  and `security_hash`. `downloadable_file.security_hash` is its own generated
  token, distinct from `file.digest`.
- **`transfer_file`** — the single per-file transfer tracking table, one row per
  file per transfer, for **every** destination:
  ```
  transfer_file_id        PK, identity
  dataset_release_transfer_id  NOT NULL, FK → dataset_release_transfer,
                               ON DELETE CASCADE
  file_id                 NOT NULL, FK → file
  file_dest_url           text
  status                  text  -- 'pending | completed | failed'
  error                   text
  attempts                integer, default 0 NOT NULL
  when_updated            timestamptz, default CURRENT_TIMESTAMP NOT NULL
  CONSTRAINT unq_transfer_file UNIQUE (dataset_release_transfer_id, file_id)
  INDEX idx_transfer_file (dataset_release_transfer_id, status)
  ```
  It hangs off `dataset_release_transfer` directly, **not** off the
  destination-specific tables. That works because each destination table
  (`transfer_idc`, `transfer_gc`, …) is a 1:1 extension keyed by
  `dataset_release_transfer_id`, and `dataset_release_transfer.destination_id`
  already pins exactly one destination per transfer — so the destination is
  derivable by joining the parent and needs no column here.

  Per-file progress/retry is therefore a **single generic surface** covering all
  destinations. For IDC, `file_dest_url` is the per-instance location relative
  to `transfer_idc.base_gcs_url`, which is what keeps the package relocatable.
  This is the granular unit of work the Go daemon updates as it uploads.
  **No API or frontend touches this table yet.**

  Tradeoff accepted: the FK no longer guarantees a destination settings row
  exists before per-file rows are written (that guarantee was already weak — the
  manifest generator creates `transfer_idc` implicitly via upsert). If a
  destination ever needs its own per-file attributes, this becomes nullable
  columns or a `details jsonb`; not built speculatively.
- Destination settings tables remain per-destination and unchanged:
  `transfer_idc`, `transfer_gc`, `transfer_aspera`, `transfer_nbia`,
  `transfer_wp` (plus the `transfer_recordset` junction).
- Destination parent tables carry their own settings: `transfer_aspera.faspex_url`,
  `transfer_nbia.collection`/`.site`, `transfer_wp.wp_media_file_id`,
  `transfer_recordset.retriever_manifest_file_id`; most also have
  `published`/`"public"` booleans.
- **New trigger: `notify_transfer_queued()`** — fires
  `pg_notify('idc_transfer_channel', dataset_release_transfer_id)` on
  `dataset_release_transfer` INSERT or UPDATE OF `transfer_status`, when the
  new status is `'queued'`. This is the **kickoff mechanism** for the
  **Go daemon** (Quasar's) that picks up queued transfers and processes them —
  populating per-file rows, uploading to GCS, updating status. Despite the
  channel name it is not IDC-exclusive: `dataset_release_transfer` covers all
  destinations and the trigger has **no destination filter**, so it fires on
  *any* transfer reaching `queued`.
- `dataset_release_transfer.transfer_status` confirmed via column comment:
  `draft, queued, in_progress, success, failed` (matches frontend
  `STATUS_LABELS`).

## Use cases to cover (2026-07-14)

Test/validation matrix for the IDC transfer flow — 4 scenarios × 2 states
(new vs. version update) = 8 cases. "Collection" / "Analysis Result" below are
`dataset_type` values; the thing being submitted is always a **dataset release**.

**New:**
1. Dataset (type Collection), single recordset — test dataset: **pseudo midi**
2. Dataset (type Collection), multiple recordsets — test dataset: **midi-b**
3. Dataset (type Analysis Result), sourced from a single collection — **TBD**
4. Dataset (type Analysis Result), sourced from multiple collections — **TBD**

**Version update (same 4 scenarios, a new `dataset_release` of an existing one):**
5. Type Collection, single recordset (pseudo midi)
6. Type Collection, multiple recordsets (midi-b)
7. Type Analysis Result, single source collection (TBD)
8. Type Analysis Result, multiple source collections (TBD)

## Manifest generation

Three manifests — **file** (hashes, UIDs, collection name), **dataset** (DOIs,
titles, status, licensing, citations), and **clinical** (links to tabular
clinical data). There is no "collection manifest."

**Terminology:** "dataset" names the manifest's own subject/record; "collection"
refers only to the external TCIA collection (`collection_name`, the collection
DOI, TCIA Collection Manager) or the `Collection` value of `dataset_type`.

**Shared across all manifests:**

- **Generated when:** at **transfer initialization** — when curators first
  initialize the transfer.
- **Ordering:** IDC ingests manifests in **submission order**. IDC releases on a
  fixed schedule, so multiple TCIA releases of a dataset can land before IDC
  goes live with them.

### File manifest

Carries the bulk of file-related metadata (DOIs, UIDs, hashes), deposited in
the GCS bucket alongside the release data for IDC ingestion (see **Bucket
layout**).

- **Format:** CSV — final, no JSON variant.
- **Content scope:** the DICOM instance data *deposited* is only files **new or
  revised** in the release, but the manifest itself lists **all** file info for
  the dataset being submitted — full picture even though only deltas ship.

**Dataset-level fields:**

| Field | Meaning | In impl? |
|---|---|---|
| `dataset_type` | Collection or analysis result | ❌ needs adding |
| `dataset_name` | The collection or analysis result name | ❌ needs adding |
| `dataset_hash` | MD5 of the concatenation of patient hashes, ordered by hash | ✅ |
| `dataset_doi` | TCIA collection DOI | ❌ needs adding |

**Per-instance fields:**

| Field | Meaning | In impl? |
|---|---|---|
| `collection_name` | TCIA collection (or analysis result) short name | ❌ needs adding |
| `patient_id` | DICOM Patient identifier | ✅ |
| `patient_hash` | MD5 of concatenation of study hashes, ordered by hash | ✅ |
| `study_instance_uid` | DICOM Study instance UID | ✅ |
| `study_hash` | MD5 of concatenation of series hashes, ordered by hash | ✅ |
| `series_instance_uid` | DICOM Series instance UID | ✅ |
| `series_hash` | MD5 of concatenation of instance hashes, ordered by hash | ✅ |
| `sop_instance_uid` | DICOM SOP instance UID | ✅ |
| `instance_hash` | MD5 of the DICOM instance | ✅ |
| `relative_file_url` | Instance file path relative to the manifest | ❌ needs adding |
| `posda_file_id` | Posda `file_id` of the instance | ✅ |

**`relative_file_url` form:** per-instance paths are **relative to the manifest's
own location**, dot notation (e.g. `./foo/bar.dcm` for `bar.dcm` in subfolder
`foo`) — never absolute GCS URLs.

Why: the package (blobs + manifest) is copied first to a bucket in the
`idc-submission` project — outside our security boundary — then again into a
bucket inside our boundary. Absolute URLs change across that ETL move; relative
ones don't. This implies the manifest and its blobs travel together as one
relocatable package.

**As implemented** — from `generate_idc_recordset_manifest`
(`../oneposda/.../routes/distribution.py`, `POST /transfers/{id}/idc/
recordset-manifest/generate`):

- **Format:** CSV (via `csv.DictWriter`).
- **One row per instance**, ordered patient → study → series → SOP. No separate
  top-level header block; `dataset_hash` is repeated on every row (`CROSS JOIN`).
- **Columns emitted (in order):** `dataset_hash`, `patient_id`, `patient_hash`,
  `study_instance_uid`, `study_hash`, `series_instance_uid`, `series_hash`,
  `sop_instance_uid`, `instance_hash`, `file_id`.
- **Hashes computed at generation time** (not read from storage), bottom-up via
  `md5(string_agg(... ORDER BY ...))`: `series_hash` ← instance `digest`s;
  `study_hash` ← `series_hash`es; `patient_hash` ← `study_hash`es;
  `dataset_hash` ← `patient_hash`es. `instance_hash` = `file.digest`.
- **Scope filter:** only `recordset_type_name = 'Radiology Images'` and
  `f.is_dicom_file = true`.
- **Persistence:** writes the CSV to file storage, upserts a `file` +
  `downloadable_file`, and sets `transfer_idc.file_manifest_file_id`.

Fields still missing from the impl are marked "needs adding" in the spec tables
above (`dataset_type`, `dataset_name`, `dataset_doi`, `collection_name`,
`relative_file_url`); `posda_file_id` is emitted in code as `file_id`.

**Open questions specific to this manifest:**
- Is `relative_file_url` derived from `transfer_file` (`base_gcs_url` +
  `file_dest_url`) at generation time, or computed independently?

### Dataset manifest

Carries **dataset-related metadata** (abstract, program, licensing, etc.) — a
separate manifest because the timing of dataset metadata gathering won't always
align with dataset submission to IDC.

- **Format:** CSV, one row.
- **Delivery:** a **Go daemon** (Quasar's) polls for queued items and pushes
  accordingly, kicked off by the `notify_transfer_queued()` trigger when
  `transfer_status` goes to `queued`.
- **Licensing:** license is modeled at the **recordset** level
  (`recordset.license_id` → `recordset_license`); there is no dataset-level
  license column. The manifest's `license_*` values are therefore **derived from
  the dataset's recordsets**, with a dataset-level value as the starting point.
  Collapse rule when recordsets disagree is still open (see Open questions).

**Fields:**

| Field | Meaning | In impl? |
|---|---|---|
| `post_id` | WordPress post id | ✅ |
| `dataset_slug` | WordPress slug | ✅ |
| `dataset_type` | WordPress post type | ✅ |
| `dataset_doi` | TCIA collection DOI | ✅ |
| `dataset_version_doi` | DOI for this specific dataset version | ❌ needs adding |
| `dataset_short_name` | Collection / Analysis Result short name | ✅ |
| `dataset_title` | The dataset title | ✅ |
| `dataset_status` | Dataset status (blank for analysis results) | ✅ |
| `dataset_version` | Dataset version number | ✅ |
| `dataset_version_date` | Current dataset version date | ✅ |
| `dataset_url` | TCIA collection URL | ✅ |
| `file_manifest_url` | Link to the file manifest for this dataset | ❌ needs adding |
| `dataset_tooltip` | Tooltip/short description (source TBD — trace down later) | ❌ needs adding |
| `cancer_type` | Cancer types represented in dataset | ✅ |
| `supporting_data` | Supporting data found in dataset | ✅ |
| `species` | Species represented in dataset | ✅ |
| `location` | Cancer location represented in dataset | ✅ |
| `tumor_locations` | Tumor locations represented in dataset | ❌ needs adding |
| `program` | Program (community, etc.) | ✅ |
| `abstract` | NBIA short description | ✅ |
| `citation` | TCIA collection version citation (Data Citation only) | ✅ |
| `license_url` | License URL | ❌ needs adding |
| `license_long_name` | License long name | ❌ needs adding |
| `license_short_name` | License short name | ❌ needs adding |

**As implemented (2026-07-16)** — from `generate_idc_dataset_manifest`
(`../oneposda/.../routes/distribution.py`, `POST /transfers/{id}/idc/
dataset-manifest/generate`):

- **Format:** CSV (via `csv.DictWriter`), **one row**.
- **Source:** the **WordPress object** mapped to the dataset via `wp_object_map`
  (`posda_object_type = 'dataset'` → `collection` or `analysis_result`), fetched
  live with `wp_get`. Not sourced from Posda tables. Fails 422 if no WP object is
  mapped. Multi-value fields (cancer types, species, etc.) are pipe-joined;
  `citation` keeps only `citation_type = 'Data Citation'` entries.
- **Persistence:** writes the CSV to file storage, upserts a `file` +
  `downloadable_file`, and sets `transfer_idc.dataset_manifest_file_id`.

Fields marked ❌ above are not yet emitted: `dataset_version_doi`,
`file_manifest_url`, `dataset_tooltip`, `tumor_locations`, and the 3 `license_*`.

**Open questions specific to this manifest:**
- Add the ❌ fields to the generated manifest.
- `dataset_tooltip` — trace down the source field in Collection Manager
  (Michael to trace; **Bill to locate/share the exact field** if Michael can't).
- `file_manifest_url` — presumably the file manifest's downloadable URL; confirm
  form (relative vs. absolute, given the relative-package model).
- Source is **WordPress/CM live** — reconcile with the Go-daemon delivery
  decision (does the daemon read CM directly, or from Posda?).

### Clinical manifest

Points at the **tabular clinical files available on WordPress** and provides a
link to them. Populates `transfer_idc.clinical_manifest_file_id`.

- **Status:** **not yet implemented.** The endpoint
  `POST /transfers/{id}/idc/clinical-manifest/generate`
  (`generate_idc_clinical_manifest`) is a stub — TODO in code to build the
  manifest and set `clinical_manifest_file_id`.
- **Timing risk:** since this manifest pulls from CM (WordPress), **CM may not be
  live yet** at generation time — the tabular clinical files it links to might
  not exist/be published when the transfer is initialized. Need a plan for the
  not-yet-live case (defer/regenerate, or block generation until CM is up).
- **Open:** we need to **define what counts as "clinical data"** — which
  tabular files on WordPress qualify (scope/criteria not yet decided).
  **Action item: Bill to provide the list.**

## Bucket layout & versioning

A **single** Google Cloud bucket, keyed by dataset then version:

```
<dataset>/
  <version>/
    <manifests: file, dataset, clinical>
    files/          <-- DICOM blobs
```

`relative_file_url`s in the file manifest resolve against the `<version>/`
folder — the manifest's own location — with blobs in the `files/` subfolder.
That is what makes the whole `<version>/` folder relocatable in one piece.

**Versioning:**
- **No sub-versioning within a release cycle.** All changes pushed *before* IDC
  ingestion **overwrite the prior submission** in place. A new version number is
  only needed **post-release**, once IDC has ingested/gone live with a version.
- **Metadata-only changes** (e.g. species, cancer type) ship via the **dataset
  manifest alone** — no file changes, no new file manifest.

**Deferred / out of scope for now:**
- **YAML / IDC Comet PR workflow** — the team will *not* commit to updating IDC
  Comet YAML files now; possible future-quarter task.
- **Per-collection buckets and a dedicated GCP project** — a single shared
  bucket is sufficient. Whether a dedicated GCP project is needed to allow
  per-collection bucket creation stays open, but isn't needed yet.

## TCIA → IDC submission — background & architecture

**Acronyms:** TCIA = The Cancer Imaging Archive · IDC = Imaging Data Commons ·
CM = (TCIA) Collection Manager · BQ = Big Query

**Task:** support submissions from TCIA to IDC. Manifest specifics live in
**Manifest generation** above; this section is the *why* plus the current model.

### Why this is changing

IDC has historically retrieved metadata from two sources: the **NBIA API**
(dataset-related info) and **TCIA Collection Manager (CM)** (collection-related
metadata, including analysis results).

NBIA is being eliminated as TCIA's final Radiology-DICOM storage/dissemination
component. **Posda will house the final copy of a dataset submission and all
related version release information.**

Posda is organized around **activity-based curation**: teams curate data in
"activities," which give timelines/timepoints for standardization and
de-identification of imaging. Each batch edit to activity data creates a new
timepoint (temporal comparison + rollback). **This work doesn't change
activity-based curation** — only the final collation and submission tooling.

### Current model: datasets, recordsets, releases

⚠ **Terminology note:** what earlier drafts called a *collection* is now a
**dataset**, and what they called a *dataset* is now a **recordset**.
"Collection" now refers only to the external TCIA collection, or to the
`Collection` value of `dataset_type`.

The module is built (see the DDL section at the top for exact columns):

- **`dataset`** houses both traditional collections and analysis results,
  distinguished by `dataset_type_id` → `dataset_type`. Datasets relate to other
  datasets via `dataset_relation` / `dataset_relation_type` (forward/reverse
  labels). Carries `dataset_doi` (NOT NULL, UNIQUE).
- **`recordset`** hangs off a dataset (`recordset.dataset_id`), typed by
  `recordset_type` (e.g. `Radiology Images`) and carrying its own
  `recordset_doi` and — importantly — its **`license_id`** → `recordset_license`.
  License lives here, not on the dataset.
- **Both levels are versioned into releases:** `dataset_release` and
  `recordset_release`, each with `release_number` (unique per parent),
  `release_date`, `release_notes`, and its own **`release_doi`**. So datasets
  *and* recordsets both get per-version DOIs — this is the "subcollection"
  concept realized.
- **Recordset releases are built from drafts:** `recordset_draft` (+
  `recordset_draft_file`) is the mutable working set; publishing snapshots it
  into `recordset_release` (+ `recordset_release_file`).
- **`dataset_release_recordset`** links a dataset release to the recordset
  releases it contains (many-to-many) — this is what a submission actually
  bundles.
- **Submission:** `dataset_release_transfer` targets a `transfer_destination`
  with a `transfer_mode`, and fans out to per-destination tables — `transfer_idc`,
  `transfer_gc`, `transfer_nbia`, `transfer_aspera`, `transfer_wp`,
  `transfer_recordset` — each with a per-file child table for granular progress.
- **QC** rides on drafts: `qc_review` → `qc_review_assignment` / `qc_series`
  (+ `qc_series_history`).
- **`wp_object_map`** links Posda objects (`dataset`, `dataset_release`,
  `recordset`, `recordset_release`) to WordPress objects (`collection`,
  `analysis_result`, `download`, `version`, `version_download`).

### Workflow

Curators keep curating in the activity-based way they already do, and use this
module to build datasets/recordsets and associate activity data with them.

Envisioned as **bidirectional** with TCIA CM — the module can help curators by
auto-naming/linking names, IDs, and slugs in the WordPress CM from Posda,
reducing the pressure on curators to get the landing page standardization right
by hand.

## Open questions / things to figure out

- Test datasets for use cases 3/4/7/8 (analysis-result cases) — still need
  real examples, not yet picked.
- **Where does the Go daemon live?** Not yet located in the repos — need the
  source location, and confirmation of whether it filters queued transfers by
  destination (the trigger doesn't) and whether one daemon covers all three
  manifests plus the per-file uploads.
- **Multi-license collapse rule:** licensing is derived from recordsets
  (Decisions), but two *public* recordsets under one dataset can carry different
  licenses (e.g. CC 3.0 vs 4.0). What does the manifest emit then — most
  permissive, blank, or a list?
- **Per-file progress/retry UI** — nothing built on `transfer_file`, and no API
  either. One generic surface now covers all destinations.
- **Single-version-per-release-cycle assumption** — needs curator sign-off
  (Michael to confirm with Kirk / wider curator group).
- **Manifest generation is meant to happen at transfer initialization** but the
  impl only exposes explicit `POST .../generate` endpoints — needs wiring in.

## Decisions log

What was settled and when. The detail lives in the sections above — this is the
record, not the reference.

**2026-07-16 (meeting)**
- Three manifests: **file**, **dataset**, **clinical** — no "collection
  manifest." → *Manifest generation*
- File manifest format is **CSV**, final. → *File manifest*
- `relative_file_url`: paths **relative to the manifest**, dot notation. →
  *File manifest*
- Manifests are generated at **transfer initialization**. → *Manifest generation*
- IDC ingests manifests in **submission order**. → *Manifest generation*
- **Single GCS bucket**, `dataset → version → manifests + files/`. →
  *Bucket layout & versioning*
- **No sub-versioning within a release cycle**; new version number only
  post-release. → *Bucket layout & versioning*
- **Metadata-only changes** ship via the dataset manifest alone. →
  *Bucket layout & versioning*
- Delivery is a **Go daemon** polling queued items. → *Dataset manifest*
- **Deferred:** YAML / IDC Comet PR workflow; per-collection buckets and a
  dedicated GCP project. → *Bucket layout & versioning*

**2026-07-16 (naming)**
- The recordset manifest is renamed the **file manifest** (DB
  `file_manifest_file_id`). "Collection" is reserved for the external TCIA
  collection or the `Collection` value of `dataset_type`. → *Manifest generation*

**2026-07-17**
- Clinical manifest **points at the tabular clinical files on WordPress** and
  links to them. → *Clinical manifest*
- License is **derived from the recordsets** (no dataset-level license column),
  dataset-level value as the starting point. → *Dataset manifest*

**2026-07-21**
- The five identical per-destination file tables are **collapsed into one
  `transfer_file`**, hanging off `dataset_release_transfer` instead of the
  destination-specific tables. Destination is derived via
  `dataset_release_transfer.destination_id`; destination *settings* tables stay
  as they are. → *DDL section*

## Action items (from 2026-07-16 meeting)

- **Michael:** finalize the manifest data model (possibly this afternoon) and
  share via GitHub.
- **Michael:** add `file_manifest_url`, `tumor_locations`, and
  `dataset_version_doi` fields to the dataset manifest.
- **Michael:** add licensing info to the manifest, pulled from the WordPress DB.
- **Michael:** push the first test case to the Google bucket for end-to-end
  validation.
- **Michael:** confirm the single-version-per-release-cycle assumption with Kirk
  and the wider curator group.
- **Bill:** provide IDC's broader clinical-data acceptance criteria.
- **Bill:** locate and share the tooltip description field from Collection
  Manager.
- **Quasar:** continue Go daemon development (queue statuses, push to Google
  bucket).

## Session notes

_(running log)_

**2026-07-21 — paused here, detoured to frontend work.**

Done this session:
- DDL re-read: release DOIs added; five per-destination file tables collapsed
  into a single `transfer_file` (see DDL section).
- `release_doi` plumbed through the API for both release resources in
  `distribution.py` — Pydantic models, list/detail SELECTs (incl. `GROUP BY` on
  the recordset-release aggregates), INSERT + `returning`, and the dataset-release
  PATCH. Frontend deliberately untouched; safe to ignore there.
- Notes overhauled: stale collections/datasets terminology corrected to
  datasets/recordsets, decisions moved into a dated log with the detail kept
  inline in the body sections.
- Verified `distribution.py` references **no** `transfer_*_file` table, so the
  consolidation needs no API changes. Test-data script also verified clean.

Pick back up here (nothing in flight, no half-done edits):
1. **File manifest generator fixes** — the two silent-data-loss risks in
   `generate_idc_recordset_manifest`: the hardcoded `'Radiology Images'` filter,
   and the INNER joins on `file_patient`/`file_study`/`file_series`/
   `file_sop_common` that silently drop files. Agreed these come *before*
   adding the missing manifest fields.
2. **Then** the ❌ fields: file manifest (`dataset_type`, `dataset_name`,
   `dataset_doi`, `collection_name`, `relative_file_url`) and dataset manifest
   (`dataset_version_doi` — now has a source in `dataset_release.release_doi`,
   `file_manifest_url`, `tumor_locations`, `license_*`).
   - Two open decisions block the dataset-manifest work: is it OK for that
     generator to join Posda tables (it's currently WordPress-only), and what's
     the license collapse rule when recordsets disagree?
3. **Optional test-data gaps** (not blocking): no `release_doi` values seeded,
   and `transfer_file` has no rows to build a per-file progress UI against.
