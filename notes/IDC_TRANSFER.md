# IDC_TRANSFER.md — notes on the IDC transfer workflow

Working notes for the IDC (Imaging Data Commons) destination transfer flow.
This file is a running log for whatever comes up while this is the focus —
add to it as we go, most relevant/current at the top of each section is fine,
no need to keep it tidy.

## TCIA → IDC submission — background & architecture

**Acronyms:** TCIA = The Cancer Imaging Archive · IDC = Imaging Data Commons ·
CM = (TCIA) Collection Manager · BQ = Big Query

**Task:** support submissions from TCIA to IDC. This section is the *why* plus
the current model; manifest specifics are in **Manifest generation** below.

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

The module is built (see the DDL section below for exact columns):

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
  with a `transfer_mode`, and fans out to per-destination **settings** tables —
  `transfer_idc`, `transfer_gc`, `transfer_nbia`, `transfer_aspera`,
  `transfer_wp`, `transfer_recordset`. Per-file progress is tracked in the
  single shared `transfer_file` table, not per destination.
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

## What we know so far (from CLAUDE.md / codebase)

- Data model: `dataset_release_transfer` → per-destination settings table
  `transfer_idc` (siblings: `transfer_nbia`, `transfer_aspera`, `transfer_gc`,
  `transfer_wp`, `transfer_recordset`), plus the shared `transfer_file` for
  per-file progress. DDL source of truth:
  `../oneposda/database/migrations/posda_files/add_dataset_module_tables.sql`.
- Backend: `../oneposda/posda/fastapi/app/papi/routes/distribution.py` —
  `transfers/{id}` CRUD + per-destination subresources, including `idc`, plus
  manifest-generation endpoints.
- Frontend touch points so far: `src/pages/transfers/Detail.tsx` (per-transfer
  detail, includes IDC-specific fields) and
  `src/pages/datasets/releases/transfers/Create.tsx` (transfer creation flow).
- IDC manifest generation is long-running — TanStack Query is now adopted
  (`src/lib/queryClient.ts`, `apiFetch.ts`), and
  [DEV.md](DEV.md) has "live transfer progress via `refetchInterval` polling"
  as the intended use case. Still unchecked / not yet implemented.

### DDL as of 2026-07-21

- **Release DOIs:** both release tables now carry their own DOI —
  `dataset_release.release_doi` (UNIQUE `unq_dataset_release_release_doi`) and
  `recordset_release.release_doi` (UNIQUE `unq_recordset_release_release_doi`),
  both nullable. Joins the existing entity-level DOIs `dataset.dataset_doi`
  (NOT NULL, UNIQUE) and `recordset.recordset_doi` (nullable, UNIQUE). This is
  the DB backing for the manifest's `dataset_version_doi` — a per-release DOI
  distinct from the dataset-level `dataset_doi`.
- **`transfer_idc` columns:** `dataset_release_transfer_id` (PK/FK),
  `base_gcs_url`, `dataset_manifest_file_id`, `imaging_manifest_file_id`
  (renamed 2026-08-02, was `file_manifest_file_id`), `clinical_manifest_file_id`,
  `published`, `"public"`. Each manifest FK → `file(file_id)`, `ON DELETE
  RESTRICT`.
  - `base_gcs_url` = the **absolute** GCS location of the package/manifest,
    `gs://posda_submit/<dataset>/<version>`. This is the single absolute anchor;
    everything *inside* the manifests is relative to the manifest, so only this
    value changes when the package is relocated during ETL.
  - `imaging_manifest_file_id`'s FK constraint was renamed alongside it
    (`fk_transfer_idc_file_imaging_manifest`, was the confusingly-named
    `fk_transfer_idc_file_recordset_manifest` — name lag from the old
    "recordset manifest" name, now fixed).
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
- **Destination settings tables** remain per-destination and unchanged — each a
  1:1 extension of `dataset_release_transfer` carrying its own settings:
  `transfer_idc` (see above), `transfer_aspera.faspex_url`,
  `transfer_nbia.collection`/`.site`, `transfer_wp.wp_media_file_id`,
  `transfer_gc`, plus the `transfer_recordset` junction
  (`retriever_manifest_file_id`). Most also have `published`/`"public"` booleans.
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

## Use cases to cover

Test/validation matrix for the IDC transfer flow. "Collection" / "Analysis
Result" below are `dataset_type` values; the thing being submitted is always a
**dataset release**.

1. Dataset (type Collection), single recordset, new — test dataset: **pseudo midi**
2. Dataset (type Collection), multiple recordsets, new — test dataset: **midi-b**
3. Dataset (type Analysis Result), single source collection, new — **TBD**
4. Dataset (type Analysis Result), multiple source collections, new — **TBD**
5. Dataset (type Collection), single recordset, version update — pseudo midi
6. Dataset (type Collection), multiple recordsets, version update — midi-b
7. Dataset (type Analysis Result), single source collection, version update — **TBD**
8. Dataset (type Analysis Result), multiple source collections, version update — **TBD**
9. Metadata-only update — a dataset-level field changes (e.g. species
   correction), no file or clinical changes; only the dataset manifest ships,
   file and clinical manifests unchanged from the prior version — **TBD**
10. Clinical-only update — only clinical files change (added/revised/dropped),
    no imaging or dataset-metadata changes; only the clinical manifest (+ its
    new/changed files in `clinical/`) is regenerated, file and dataset
    manifests unchanged — **TBD**

## Manifest generation

Three manifests — **dataset** (DOIs, titles, status, licensing, citations),
**imaging** (hashes, UIDs, collection name), and **clinical** (links to
tabular clinical data).

**Terminology:** "dataset" names the manifest's own subject/record; "collection"
refers only to the external TCIA collection (`collection_name`, the collection
DOI, TCIA Collection Manager) or the `Collection` value of `dataset_type`.

**Shared across all manifests:**

- **Generated when:** at **transfer initialization** — when curators first
  initialize the transfer.
- **Ordering:** IDC ingests manifests in **submission order**. IDC releases on a
  fixed schedule, so multiple TCIA releases of a dataset can land before IDC
  goes live with them.

---

## 📄 **DATASET MANIFEST**

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

**Sources.** This manifest draws from **three** places — the implementation
currently only reads the first:
1. **WordPress / CM** — most fields, via `wp_object_map` → `wp_get`.
2. **Posda** — `dataset_version_doi` ← `dataset_release.release_doi`; the
   `license_*` values (derived from recordsets).
3. **NBIA API** — `dataset_tooltip`, from
   `https://nbia.cancerimagingarchive.net/nbia-api/services/v4/getCollectionDescriptions?collectionName=<name>`
   (per Bill, 2026-07-22).

**Reading these sources live is fine**, because manifests are generated at
**transfer initialization** — before the Go daemon is ever involved. Posda does
all the sourcing at generation time and writes a static CSV; the daemon only
*transports* the finished files and never reads WP/CM, Posda, or NBIA itself.

**Fields:**

| Field | Meaning | In impl? |
|---|---|---|
| `post_id` | WordPress post id | ✅ |
| `dataset_slug` | WordPress slug | ✅ |
| `dataset_type` | WordPress post type | ✅ |
| `dataset_doi` | TCIA collection DOI | ✅ |
| `dataset_version_doi` | DOI for this specific dataset version [^1] | ❌ needs adding |
| `dataset_short_name` | Collection / Analysis Result short name [^2] | ✅ |
| `dataset_title` | The dataset title | ✅ |
| `dataset_status` | Dataset status (blank for analysis results) | ✅ |
| `dataset_version` | Dataset version number | ✅ |
| `dataset_version_date` | Current dataset version date | ✅ |
| `dataset_url` | TCIA collection URL | ✅ |
| `dataset_tooltip` | Tooltip/short description — from the **NBIA API** (see Sources above) | ❌ needs adding |
| `cancer_type` | Cancer types represented in dataset | ✅ |
| `supporting_data` | Supporting data found in dataset | ✅ |
| `species` | Species represented in dataset | ✅ |
| `location` | Cancer location represented in dataset | ✅ |
| `program` | Program (community, etc.) | ✅ |
| `abstract` | NBIA short description | ✅ |
| `citation` | TCIA collection version citation (Data Citation only) | ✅ |
| `license_url` | License URL | ❌ needs adding |
| `license_long_name` | License long name | ❌ needs adding |
| `license_short_name` | License short name | ❌ needs adding |

[^1]: **TCIA's DOI for TCIA-sourced datasets, IDC's own DOI for IDC-sourced
    datasets** — TCIA to provide versioned DOIs going forward (2026-07-30
    meeting).
[^2]: **⚠ Pending confirmation (2026-07-30 meeting):** whether this correctly
    maps to the public-facing TCIA collection short name — Michael to verify
    against real examples.

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

**Open questions specific to this manifest:**
- Add the ❌ fields to the generated manifest — this means extending the
  generator beyond WordPress to also read Posda and the NBIA API.

---

## 📄 **IMAGING MANIFEST**

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
| `dataset_hash` | MD5 of the concatenation of patient hashes, ordered by hash | ✅ |

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
own location**, dot notation (e.g. `./imaging/bar.dcm`) — never absolute GCS URLs.
It is **computed independently** at manifest-generation time, *not* derived from
`transfer_file.file_dest_url` or `base_gcs_url`.

Why: the package (blobs + manifest) is copied first to a bucket in the
`idc-submission` project — **outside IDC's security boundary** — and then again
into a bucket in a project **inside IDC's boundary**. Absolute URLs change across
that ETL move; relative ones don't. This implies the manifest and its blobs
travel together as one relocatable package.

**As implemented** — from `generate_idc_imaging_manifest`
(`../oneposda/.../routes/distribution.py`, `POST /transfers/{id}/idc/
imaging-manifest/generate`):

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
  `downloadable_file`, and sets `transfer_idc.imaging_manifest_file_id`.

Fields still missing from the impl are marked "needs adding" in the spec tables
above (`collection_name`, `relative_file_url`); `posda_file_id` is emitted in
code as `file_id`.

_(No open questions specific to this manifest — the remaining work is the
generator fixes and the ❌ fields above.)_

---

## 📄 **CLINICAL MANIFEST**

Lists the clinical (tabular supporting-data) files included in this release.
Populates `transfer_idc.clinical_manifest_file_id`. **Scoped per-dataset** (one
clinical manifest per dataset release), not a single global manifest across all
collections/analysis results.

**⚠ Superseded (2026-07-30 meeting)** — clinical files are no longer just
linked on WordPress; they're now handled **the same way as imaging files**:

- **Manifest mirrors the imaging manifest's completeness rule:** if a clinical
  manifest is present for a version, it's **complete** (full picture of every
  clinical file for the dataset, same as the imaging manifest's "lists all file
  info even though only deltas ship" rule); if **absent**, no clinical files
  changed in this release.
- **Content is now files, not just links:** new/changed clinical files are
  **dropped into the bucket** (a dedicated `clinical` subfolder, alongside the
  `imaging` subfolder — see *Bucket layout*), which is what enables
  **hash generation** and lets clinical files be handled consistently with
  imaging files instead of as a special link-only case.
- **Status:** endpoint (`POST /transfers/{id}/idc/clinical-manifest/generate`
  / `generate_idc_clinical_manifest`) is still a stub — TODO to implement
  against this (now-changed) model.
- **Timing risk still applies:** since clinical files are sourced from CM
  (WordPress) downloads, **CM may not be live yet** at generation time — the
  files it would pull might not exist/be published when the transfer is
  initialized. Need a plan for the not-yet-live case (defer/regenerate, or
  block generation until CM is up).
- **Clinical-only changes:** per-dataset scoping means a release where only
  clinical data changed can ship with the file and dataset manifests unchanged
  from the prior version — only the clinical manifest (and its new/changed
  files) is regenerated/dropped.
- **Dataset-level identification is derived from the dataset manifest** in the
  same version folder — consistent with how the imaging manifest already works —
  so no redundant dataset-identifying fields are needed on the clinical
  manifest itself.

**What counts as "clinical data"** (per Bill, 2026-07-22) — note this stretches
the usual definition of *clinical*; it is really "tabular supporting data."
Selection is a two-stage filter over **Collection Manager downloads**:

1. **By `download_type`** — keep downloads whose `download_type` includes any
   combination of:
   - `clinical data`
   - `image annotations`
   - `other`
2. **By `file_type`** — a CM download's `file_type` is a **list**; keep those
   including one or more of **CSV**, **TSV**, **XLS**, or **XLSX**.

Then **a human decides which of the surviving downloads are actually relevant** —
this is a curator judgement call, not a pure rule. Any implementation needs to
surface candidates for selection rather than auto-including everything.

**Fields (updated 2026-07-31)** — one row per selected CM download. Not the
full CM download object after all — an explicit field list, everything
available from Collection Manager plus what dropping the file into the bucket
enables:

| Field | Meaning | In impl? |
|---|---|---|
| `download_slug` | CM download's slug | ❌ needs adding |
| `download_id` | CM download's WordPress post ID | ❌ needs adding |
| `date_updated` | CM download's last-updated date | ❌ needs adding |
| `download_title` | CM download's display title/label | ❌ needs adding |
| `file_type` | CM `file_type` (CSV / TSV / XLS / XLSX) | ❌ needs adding |
| `file_name` | Original file name | ❌ needs adding |
| `download_size` | File size | ❌ needs adding |
| `download_size_unit` | Unit for `download_size` (e.g. KB/MB) | ❌ needs adding |
| `download_url` | Link to the file's original location on WordPress/CM | ❌ needs adding |
| `download_type` | CM `download_type` (`clinical data` / `image annotations` / `other`) | ❌ needs adding |
| `file_hash` | Hash of the deposited file — same idea as the imaging manifest's `instance_hash`, only possible now that clinical files are dropped into the bucket | ❌ needs adding |
| `relative_file_url` | Path relative to the manifest, dot notation — same scheme as the imaging manifest's field of the same name | ❌ needs adding |
| `posda_file_id` | Posda `file_id` once the clinical file is imported | ❌ needs adding |

Open follow-ups on this:
- **Field list still open-ended** — flagged as "[others?]" when drafted; add
  more if Collection Manager exposes other useful download attributes.
- Is the relevance decision (which downloads are "actually relevant") recorded
  anywhere (per transfer? per dataset?), or re-made each time a manifest is
  generated?
- `download_type` matching — substring/"includes" or exact set membership, and
  is it case-sensitive?
- Software changes needed: emit this field list (not the full CM object) in
  the clinical manifest output.

## Bucket layout & versioning

A **single** Google Cloud bucket, keyed by dataset then version:

```
gs://posda_submit/
  <dataset>/
    <version>/
      <manifests: dataset, file, clinical>
      imaging/        <-- DICOM blobs
      clinical/       <-- clinical/tabular files (2026-07-30 meeting — see Clinical manifest)
```

**⚠ Folder rename (2026-07-30 meeting):** the imaging blobs folder is now
named **`imaging/`** (previously `files/`), alongside a new **`clinical/`**
subfolder for clinical files — both are peers under the `<version>` folder,
same level as the manifests.

Manifest filenames are **fixed** — `dataset_manifest.csv`, `imaging_manifest.csv`,
`clinical_manifest.csv` — always directly under the `<version>` folder, per
Bill (2026-07-24).

**URL scheme — one absolute anchor, everything else relative:**

| Value | Form | Example |
|---|---|---|
| `transfer_idc.base_gcs_url` | **Absolute** GCS URL to the package | `gs://posda_submit/<dataset>/<version>` |
| `relative_file_url` (imaging manifest) | Relative to the manifest, `./` notation | `./imaging/foo.dcm` |

No manifest-to-manifest URL fields (e.g. `file_manifest_url`,
`clinical_manifest_url`) are needed — see *Decisions log*, 2026-07-24.

Because the manifests are relocated as a unit and contain **only** relative
references, moving the package across buckets/projects during ETL means updating
`base_gcs_url` alone — no manifest is rewritten. That is the whole point of the
relative scheme.

**Versioning:**
- **No sub-versioning within a release cycle.** All changes pushed *before* IDC
  ingestion **overwrite the prior submission** in place. A new version number is
  only needed **post-release**, once IDC has ingested/gone live with a version.
- **Metadata-only changes** (e.g. species, cancer type) ship via the **dataset
  manifest alone** — no file *or* clinical manifest needed if those are
  unchanged (2026-07-30 meeting — extends the original file-manifest-only
  framing to clinical too).

**Pending confirmation (2026-07-30 meeting):**
- **Up-versioning mandate:** whether *every* change — including metadata-only
  or clinical-only updates — should require an up-version, to simplify
  software logic. The current build assumes up-versioning for any change;
  Michael is leaning toward requiring it, not yet finalized.
- **Resubmission to an already-published version folder:** still open whether
  the software should delete-and-recreate that folder, or just reset its
  `status.json` (see *Bucket sync & status file*) back to
  `"ready for processing"`.

**Deferred / out of scope for now:**
- **YAML / IDC Comet PR workflow** — the team will *not* commit to updating IDC
  Comet YAML files now; possible future-quarter task.
- **Per-collection buckets and a dedicated GCP project** — a single shared
  bucket is sufficient. Whether a dedicated GCP project is needed to allow
  per-collection bucket creation stays open, but isn't needed yet.

### Bucket sync & status file (Slack thread w/ Bill Clifford, folded in 2026-07-31)

**Problem:** a dataset might miss the deadline / not be ready to ingest by the
time IDC's ETL comes looking, and separately, Posda writing to the bucket can
race with IDC copying it across the security perimeter. Need a per-version
readiness signal, not just a race-avoidance lock.

**Proposal — `status.json` per dataset *version*** (i.e. in the
`<dataset>/<version>/` folder alongside the manifests — see *Bucket layout*),
**not** a single index file at the bucket root. IDC ignores any version whose
status isn't `"Ready for processing"`.

**States** (Bill's original four, plus `Errored` added later in the thread):
- `Draft`
- `Ready for processing`
- `Processing`
- `Processed`
- `Errored` — when IDC finds a problem mid-processing, it sets status to
  `Errored` (not back to `"Ready for processing"`) so Posda can tell "this
  needs fixing" apart from "this was never submitted yet," then query
  specifically which items errored, fix them, and set status back to
  `"Ready for processing"` itself.

**Ownership sequence** (one mutex **per dataset version**, not per-bucket —
avoids a lock on a version already "Ready for processing" blocking work on a
separate version being drafted next, if that scenario turns out to be real):
```
Posda:  acquire lock → status = Draft → ... finish curating ...
        → status = "Ready for processing" → release lock
IDC:    acquire lock → status = "Processing" → process
        → status = "Processed" (or "Errored" on a problem) → release lock
Posda:  (on Errored) fix the flagged items → status = "Ready for processing"
```
**No full state-transition diagram drawn yet** — Bill flagged this as still
needed, not done.

**Mutex mechanism (untested):** GCS conditional-write lock — create a lock
object with `if_generation_match=0` (atomic create-if-absent, retried with
backoff if held), release by deleting conditioned on the held generation
(`if_generation_match=<generation>`) to avoid deleting a newer lock out from
under a timed-out holder. Bill shared Python/gcloud-CLI/bash reference
implementations (AI-generated via Gemini) — **neither side has tried this
yet**, it's a starting point, not a decision.

**Open items from this thread:**
- Finalize the state list + actually draw the transition diagram (including
  the `Errored` path).
- Verify the mutex approach works as intended (untried code).
- Confirm whether "draft next version while current version is ready/being
  processed" is a real scenario worth the per-version (vs. per-dataset)
  granularity — motivated the per-version choice but isn't confirmed as
  realistic yet.

## Open questions / things to figure out

- **Bucket sync/concurrency:** now has a proposed mechanism — see *Bucket sync
  & status file* above (`status.json` per dataset version + a GCS conditional-
  write mutex) — but it's unverified/untested by either side, not yet decided.
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
- **Up-versioning mandate (2026-07-30 meeting):** whether to require an
  up-version for *every* change, including metadata-only or clinical-only
  ones, to keep software logic simple. Current build assumes this; not
  finalized. → *Bucket layout & versioning*
- **Resubmission to an already-published version folder (2026-07-30
  meeting):** delete-and-recreate the folder, or reset its `status.json` to
  `"ready to process"`? Not decided. → *Bucket layout & versioning*
- **`dataset_short_name` mapping (2026-07-30 meeting):** needs verification
  against real collection examples that it correctly maps to the public-facing
  TCIA collection short name. → *Dataset manifest*

## Decisions log

What was settled and when. The detail lives in the sections above — this is the
record, not the reference.

**2026-07-16 (meeting)**
- Three manifests: **file**, **dataset**, **clinical** — no "collection
  manifest." → *Manifest generation*
- Imaging manifest format is **CSV**, final. → *Imaging manifest*
- `relative_file_url`: paths **relative to the manifest**, dot notation. →
  *Imaging manifest*
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
  — **⚠ renamed again 2026-07-31,** see below.

**2026-07-17**
- Clinical manifest **points at the tabular clinical files on WordPress** and
  links to them. → *Clinical manifest* — **⚠ superseded 2026-07-30:** clinical
  files are now dropped into the bucket like imaging files, not just linked.
- License is **derived from the recordsets** (no dataset-level license column),
  dataset-level value as the starting point. → *Dataset manifest*

**2026-07-21**
- The five identical per-destination file tables are **collapsed into one
  `transfer_file`**, hanging off `dataset_release_transfer` instead of the
  destination-specific tables. Destination is derived via
  `dataset_release_transfer.destination_id`; destination *settings* tables stay
  as they are. → *DDL section*

**2026-07-24 (from Bill, Slack)**
- **Imaging manifest:** only `dataset_hash` needs to be a per-instance
  (repeated) field, kept purely for consistency with IDC's existing code.
  `dataset_type` / `dataset_name` / `dataset_doi` are **dropped** from the file
  manifest — IDC will read those from the dataset manifest instead. → *File
  manifest*
- **Clinical manifest stays scoped per-dataset** (one per dataset release), not
  a single manifest covering all collections/analysis results — Bill offered
  the global-manifest alternative (YAML of CM download objects, or a minimal
  `(collection_name, file_url)` list) to handle files added/revised/dropped
  without other dataset changes, but per-dataset scoping already covers that
  case: file and dataset manifests are left unchanged, and only the clinical
  manifest is regenerated. Content is links/URLs only — no need to copy the
  clinical files into the bucket. → *Clinical manifest* — **⚠ "links only"
  superseded 2026-07-30:** clinical files now get dropped into the bucket too;
  the per-dataset scoping/regeneration behavior still holds.
- **No manifest-to-manifest URL fields needed** (`file_manifest_url`,
  `clinical_manifest_url`) — manifest filenames are fixed
  (`dataset_manifest.csv`, `imaging_manifest.csv`, `clinical_manifest.csv`),
  always directly under the `<version>` folder. → *Dataset manifest*, *Bucket
  layout & versioning*
- **New concern raised:** bucket read/write synchronization between Posda and
  IDC during the perimeter-crossing copy — Bill is investigating a
  semaphore/locking approach. → *Open questions*

**2026-07-22 (from Bill)**
- `dataset_tooltip` is sourced from the **NBIA API**
  (`getCollectionDescriptions`), not Collection Manager. → *Dataset manifest →
  Sources*
- **"Clinical data" defined:** CM downloads whose `download_type` includes any of
  `clinical data` / `image annotations` / `other`, **and** whose `file_type` list
  includes CSV / XLS / XLSX — then a human picks the relevant ones. →
  *Clinical manifest*
- **URL scheme:** `base_gcs_url` is the one **absolute** anchor
  (`gs://posda_submit/<dataset>/<version>`); `relative_file_url` and
  `file_manifest_url` are **relative to their manifest**. Relocation updates
  `base_gcs_url` only. → *Bucket layout & versioning*
- `relative_file_url` is **computed independently** at generation time, not
  derived from `transfer_file` / `base_gcs_url`. → *Imaging manifest*
- **Live source reads are fine:** manifests are generated at transfer
  initialization, before the Go daemon runs. Posda does all sourcing and writes
  static CSVs; the daemon only transports them. → *Dataset manifest → Sources*

**2026-07-30 (meeting)**
- **Clinical manifest now mirrors the imaging manifest's rules:** present =
  complete, absent = nothing clinical changed. → *Clinical manifest*
- **New/changed clinical files are dropped into the bucket** (enables hash
  generation, consistent handling with imaging files) — reverses the
  2026-07-17/2026-07-24 "links only" decisions. → *Clinical manifest*
- **Folder structure:** imaging blobs move to an `imaging/` subfolder
  (renamed from `files/`); clinical files get their own `clinical/` subfolder.
  Manifests stay at the `<version>` folder level. → *Bucket layout & versioning*
- **Dataset manifest alone is sufficient for metadata-only changes** — no file
  or clinical manifest needed if those are unchanged (extends the original
  file-manifest-only framing to clinical too). → *Bucket layout & versioning*
- **Clinical manifest fields:** `download_slug` and `download_id` (WordPress
  post ID) per clinical file, plus the **full CM download object** so IDC can
  pick whatever fields it needs. → *Clinical manifest*
- **Dataset identification in the clinical manifest comes from the dataset
  manifest** in the same folder — no redundant dataset fields, consistent with
  how the imaging manifest already works. → *Clinical manifest*
- **Version DOI:** TCIA will provide versioned DOIs going forward; IDC uses
  TCIA's DOI for TCIA-sourced datasets, its own DOI for IDC-sourced datasets. →
  *Dataset manifest*
- **Pending confirmation:** `dataset_short_name` → public TCIA collection
  short-name mapping (Michael to verify); whether resubmission to an
  already-published version folder requires an up-version (leaning yes, not
  finalized). → *Open questions*

**2026-07-31**
- **File manifest renamed the imaging manifest** — doc-only at first (2026-07-31).
  → *Imaging manifest*
- **Bucket folder renamed:** `files/` → `imaging/`, alongside the new
  `clinical/` folder from the 2026-07-30 meeting. → *Bucket layout & versioning*

**2026-08-02**
- **Imaging manifest rename landed in DB + code**: `transfer_idc.
  file_manifest_file_id` → `imaging_manifest_file_id` (+ its FK constraint,
  `fk_transfer_idc_file_recordset_manifest` →
  `fk_transfer_idc_file_imaging_manifest`, fixing the name-lag flagged in
  *DDL as of 2026-07-21*); endpoint `/idc/file-manifest/generate` →
  `/idc/imaging-manifest/generate`; function `generate_idc_file_manifest` →
  `generate_idc_imaging_manifest`; frontend `DestSettings` fields and the
  `generateIdcManifest` type union (`"dataset" | "imaging" | "clinical"`) in
  `transfers/Detail.tsx` follow; manifest filename convention
  `file_manifest.csv` → `imaging_manifest.csv`. → *Imaging manifest*, *DDL as
  of 2026-07-21*, *Bucket layout & versioning*

## Action items

**2026-07-16 (meeting)**
- ~~**Michael:** finalize the manifest data model and share via GitHub.~~
  ✅ model finalized 2026-07-21 (release DOIs + `transfer_file` consolidation).
- **Michael:** add `file_manifest_url` and `dataset_version_doi` fields to the
  dataset manifest. (`tumor_locations` from the meeting turned out to be a
  duplicate of the existing `location` field — dropped.)
- **Michael:** add licensing info to the manifest. ⚠ The meeting said "pulled
  from the WordPress DB," but we since established license lives on
  `recordset.license_id` in **Posda** — derive it from the recordsets instead.
- **Michael:** push the first test case to the Google bucket for end-to-end
  validation.
- **Michael:** confirm the single-version-per-release-cycle assumption with Kirk
  and the wider curator group.
- ~~**Bill:** provide IDC's broader clinical-data acceptance criteria.~~ ✅ done
  2026-07-22 — see *Clinical manifest*.
- ~~**Bill:** locate and share the tooltip description field from Collection
  Manager.~~ ✅ done 2026-07-22 — it's the **NBIA API**, not CM; see
  *Dataset manifest → Sources*.
- **Quasar:** continue Go daemon development (queue statuses, push to Google
  bucket).

**2026-07-30 (meeting)**
- **Michael:** confirm `dataset_short_name` maps correctly to the public TCIA
  collection short name, against real collection examples.
- **Michael:** update submission software to support dataset-manifest-only
  submissions (no imaging/clinical manifest) for metadata-only changes, and
  resolve the up-versioning question for non-imaging-only updates.
- **Michael:** emit the clinical manifest's agreed field list (`download_slug`,
  `download_id`, etc. — see *Clinical manifest*) in the generator output.
- **Team:** define and document test cases covering metadata-only updates and
  non-versioned clinical file changes.

## Session notes

_(running log)_

**2026-07-21**
- DDL re-read: release DOIs added; five per-destination file tables collapsed
  into a single `transfer_file` (see DDL section).
- `release_doi` plumbed through the API for both release resources in
  `distribution.py` — Pydantic models, list/detail SELECTs (incl. `GROUP BY` on
  the recordset-release aggregates), INSERT + `returning`, and the dataset-release
  PATCH.
- Notes overhauled: stale collections/datasets terminology corrected to
  datasets/recordsets; decisions moved into a dated log with the detail kept
  inline in the body sections.
- Verified `distribution.py` references no per-destination file table, so the
  `transfer_file` consolidation needs no API changes. Test-data script clean too.

**2026-07-22**
- Bill's answers folded in: `dataset_tooltip` comes from the **NBIA API**, and
  the "clinical data" selection criteria (see *Clinical manifest*).
- URL scheme settled: `base_gcs_url` absolute, everything in-manifest relative.
- Endpoint renamed `recordset-manifest` → **`file-manifest`**
  (`generate_idc_file_manifest`).
- **Frontend fixed** in `src/pages/transfers/Detail.tsx` — it was calling the
  dead `recordset-manifest` path (URL built by string interpolation, so grep and
  `tsc` both missed it), reading `recordset_manifest_*` response fields, and
  using `gcs_url` instead of `base_gcs_url`. All corrected; `tsc --noEmit` clean.
  ⚠ **Not yet exercised against a live backend** — generation + download still
  need a click-through to confirm.

Pick back up here (nothing in flight, no half-done edits):
1. **Imaging manifest generator fixes** — the two silent-data-loss risks in
   `generate_idc_imaging_manifest`: the hardcoded `'Radiology Images'` filter,
   and the INNER joins on `file_patient`/`file_study`/`file_series`/
   `file_sop_common` that silently drop files. Agreed these come *before*
   adding the missing manifest fields.
2. **Then** the ❌ fields: imaging manifest (`dataset_type`, `dataset_name`,
   `dataset_doi`, `collection_name`, `relative_file_url`) and dataset manifest
   (`dataset_version_doi` — now has a source in `dataset_release.release_doi`,
   `file_manifest_url`, `license_*`).
   - Only one decision still blocks the dataset-manifest work: the **license
     collapse rule** when recordsets disagree. (Joining Posda tables from that
     generator is settled — it's fine, see *Dataset manifest → Sources*.)
3. **Optional test-data gaps** (not blocking): no `release_doi` values seeded,
   and `transfer_file` has no rows to build a per-file progress UI against.
