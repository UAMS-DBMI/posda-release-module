# CROISSANT.md — Croissant metadata for a dataset release

Generating one [Croissant](https://docs.mlcommons.org/croissant/docs/croissant-spec-1.1.html)
JSON-LD file per dataset release, so the TCIA Data Retriever (TDR) can download
the whole dataset from one file. Started 2026-11-12. **Not built yet.**

Related: [CYCLE_WIZARD.md](CYCLE_WIZARD.md) step 7 (Disseminate),
[CRDC_TRANSFER.md](CRDC_TRANSFER.md) *Croissant* (2026-10-14 meeting notes),
[WP_UPDATES.md](WP_UPDATES.md) (the WordPress pods).

## ✅ Decisions *(2026-11-23)*

- **Posda generates the file** at **Disseminate**, and uploads it to the
  dataset page's new WordPress field **`croissant_manifest`**.
- **Built from WordPress data.** It reads the collection or analysis result
  page and its download pages.
- **Port `generate_tcia_croissant.py`** from `kirbyju/tcia-croissant-odrl`. It
  already builds this document from WordPress records. Swap its SQLite snapshot
  input for WordPress REST reads through `util/wp.py`. Keep the
  document-building functions as they are.
- **One JSON file, no CSVs.** Each download page's existing `download_url` /
  `download_file` is the payload link, whatever its format. The repo's other
  script, `generate_recordset_examples.py`, uses a model with one CSV per
  recordset. Not used here.
- **No DataCite call.** The dates and version come from the `dataset_release`.
- **`@id` is the dataset DOI.** `release_doi` is unused and hidden for now.
- **Stored on `dataset_release.croissant_file_id`** (new column, dated
  migration). The JSON is a Posda file like the retriever manifests, so
  `ensure_wp_media` dedups the upload.
- **Go-live requires it.** Publish refuses unless `croissant_manifest` holds
  this release's current file.

## Plan

Disseminate order:
1. Update download pages (existing: attaches each retriever manifest).
2. **Generate Croissant**: enabled once every download page is current (the
   `page_current` check go-live uses). Separate from go-live, so the file can be
   checked before anything is public.
3. Go live: new gate on the Croissant file.

Backend (oneposda):
- `util/croissant.py`: the ported builder, pure functions, tests in `tests/`.
- `POST /datasets/releases/{id}/croissant` in `distribution.py`: read the
  dataset page and download pages from WordPress, resolve each `download_file`
  URL, build, store as a file, `ensure_wp_media`, PATCH `croissant_manifest`,
  set `croissant_file_id`.
- Disseminate status reports whether `croissant_manifest` is current.

Frontend: a Croissant row on Disseminate: Generate, link, current/stale badge.

### Progress

- [x] Migration `20261123_dataset_release_croissant_file.sql` (not applied).
- [x] Builder `papi/util/croissant.py` + `tests/test_croissant.py` (8 pass).
  Differences from the script:
  - **Access level** comes from WordPress `download_access` (`Limited` →
    controlled), with the license text only separating open from
    noncommercial. The script guessed it all from text.
  - **License URL** comes from the license name (the script's CC mapping), so
    no Licenses lookup.
  - **Dropped:** DataCite, the data-citation and related-publication lists
    (WordPress `citations` are post IDs), the provenance block (it guessed the
    document's URL), and parsing source collections out of the summary text.
    `citeAs` is "title. The Cancer Imaging Archive. year. DOI URL", with the
    year of release 1.
  - **Analysis results:** `isBasedOn` lists the page's `collections` by name
    plus the source download pages the caller passes.
- [x] Endpoint `POST /datasets/releases/{id}/croissant` (written, not run).
  - Refuses unless the release is `released` or `live` and every download page
    is current (`wp_page_states`, the go-live check).
  - **A live release needs no correction note** *(2026-11-27)*. Unlike the
    transfer actions, which require one on a live release, regenerating the
    file adds nothing to record: it only describes the public page, and the
    page correction that prompted it is already in that transfer's notes. There
    is also nowhere suitable to record it, since `release_notes` may be public.
  - Reads every download listed on the WordPress page (`collection_downloads` /
    `result_downloads`), not just Posda's recordsets: the file describes the
    public page. An analysis result's `collection_downloads` become
    `isBasedOn`.
  - Stores the JSON through `store_manifest` (filename
    `<dataset>-croissant.jsonld`, no version), sets `croissant_file_id`, uploads
    with `ensure_wp_media`, and PATCHes `croissant_manifest` only when it
    differs.
  - **Tested 2026-11-23 on page 55832 (production WP, draft page).** Generation
    works: 2 retriever-manifest rows, 2 direct CSV rows. `croissant_manifest`
    exists and reads `false` while empty. **The upload is blocked:** WordPress
    rejects both `.jsonld` (`application/ld+json`) and `.json`
    (`application/json`) with `rest_upload_sideload_error` "not allowed to
    upload this file type".
  - **Retested 2026-11-24 after WordPress allowed `.jsonld`: works.** Uploaded
    as media 56602 (`…/uploads/pseudo-clone-test-croissant.jsonld`, which
    WordPress records as `application/json`). The PATCH set 55832's
    `croissant_manifest`, and it reads back as the attachment post with
    `"ID": "56602"` as a string, which is the shape the endpoint compares.
- [x] Disseminate status + go-live gate (written, compiles, not run).
  - `croissant_state()` / `GET /datasets/releases/{id}/croissant`: `file_id`,
    `media_id`, `media_url`, `current_media_id`, and `page_current` (the
    dataset page's `croissant_manifest` holds this release's uploaded file).
    Read live from WordPress, like `wp_page_states`.
  - Go-live refuses after the download-page check while `page_current` is
    false.
  - "Current" means the page holds this release's file, not that the file still
    matches WordPress. If a download page changes after generation, the file is
    out of date but still reads as current; regenerate after any page change.
- [x] Frontend: a **Croissant** column on Disseminate's Dataset table
  (`CroissantCell`), with hooks `useCroissantState` / `useGenerateCroissant` in
  `lib/dissemination.ts`.
  - "On page" / "Not on page" badge, Generate / Regenerate, and a link to the
    uploaded file.
  - Generate is disabled until every download page is current; the tooltip names
    the ones that aren't.
  - "—" on a draft release; "Live" on a live release with no correction open.
    During a correction it works, with no note.
  - Go-live (`publishBlockedReason`) ends with "Generate the Croissant file.",
    mirroring the server.

### What WordPress returns *(checked 2026-11-23, collection 55832, download 55836)*

- `collection_downloads`: list of download post IDs.
- `download_requirements`, `data_license`: **names** (e.g. "Requires TCIA Data
  Retriever", "CC BY 4.0"), so the role logic's text match works as is. A
  license URL needs a lookup in the Licenses endpoint by name.
- `download_file`: a media ID as a string. The URL needs a Media lookup
  (`source_url`). `download_url` is empty when a file is attached, so the payload
  link is the media URL, falling back to `download_url`.
- `croissant_manifest`: not visible through the Manager API (`format_collection`
  doesn't pass it through); check the raw REST field when wiring the PATCH.

## What the file contains

| Croissant | Source |
|---|---|
| `@id`, `identifier`, `sameAs` | dataset DOI (WordPress `collection_doi` / `result_doi`) |
| `name`, `alternateName`, `description`, `url`, `keywords` | the collection / analysis result page |
| `version` | `dataset_release.release_number` |
| `datePublished` | `release_date` of the dataset's **release 1** |
| `dateModified` | this release's `release_date` |
| `license`, `conditionsOfAccess` | combined from the download pages |
| `distribution[]` (`cr:FileObject`) | one per download page that has a URL |
| `recordSet[]` (`cr:RecordSet`, one inline `data` row) | one per download page: title, types, license, access level, counts, metadata URL, requirements |
| `isBasedOn` | analysis results only: the source collection's downloads |

How the script decides what TDR does with each download:

| Download page says | Role | TDR |
|---|---|---|
| requirements mention "Data Retriever" | `manifest` | expands the linked manifest (`.tcia`, `.csv`, `.tsv`, `.xlsx`, `.s5cmd`) |
| requirements mention Aspera / Faspex | `transfer package` | skips it with a warning |
| anything else with a URL | `data file` | downloads it directly |

`isBasedOn` downloads are opt-in in TDR. It lists them, but leaves them
unselected by default.
