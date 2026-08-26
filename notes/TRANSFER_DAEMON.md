# TRANSFER_DAEMON.md — delivery mechanisms per destination

Notes on how queued transfers actually move data, and whether each destination
needs its own daemon. **Discussion notes and suggestions only — nothing here is
built or decided.** Started 2026-08-25.

See [IDC_TRANSFER.md](IDC_TRANSFER.md) for the IDC submission format and
[CYCLE_WIZARD.md](CYCLE_WIZARD.md) step 6 for the Transfer stage that queues the
work.

## What exists today

**`UAMS-DBMI/idc-transfer-daemon`** — a Go daemon, IDC only. Cloned locally at
`../idc-transfer-daemon`. **Findings below are verified against the source**, not
just the README.

- `src/` — the daemon: `main.go`, `daemon.go`, `db.go`, `gcs.go`, `transfer.go`,
  `logging.go` (~1,050 lines total), plus `Dockerfile` / `Makefile`.
- `sql/` — `schema_additions.sql` (its own `transfer_idc_file` table + the
  NOTIFY trigger), `transfer_preparation.sql` (the fan-out), and test fixtures.
- `PLAN.md` (~45k) — architecture and rationale. **Read before changing the
  claim/recovery, batching, or status semantics.**
- A stray `.python-version` is a leftover; commit `20d684e` is
  *"Switch to Go version"*.

How it works:

- **Work discovery:** `LISTEN/NOTIFY` on `idc_transfer_channel`, with a periodic
  reconciler for missed notifications.
- **Claiming:** one transaction, `queued|in_progress → in_progress` guarded by
  `AND transfer_status IN ('queued','in_progress')` with `RETURNING`, so only one
  instance wins. This part is sound.
- **Pipeline:** keyset-paginated batches out of `transfer_idc_file`, joined to
  `file_location` for local path and MD5 → parallel upload to pre-computed
  content-addressed URLs → HEAD-then-verify-MD5 for idempotent re-runs →
  batched status flush via `UPDATE FROM unnest(...)` → upload manifest → mark
  `success`/`failed`.
- **Re-queue retry:** resets that transfer's `failed` file rows back to
  `pending`, so a re-queue retries only the failures. Good.
- **Concurrency:** goroutines + buffered channels, `TRANSFER_PARALLELISM = 1`,
  up to 200 upload workers within a transfer.
- **Config:** `TRANSFER_DAEMON_DSN`, `GCS_KEY_FILE`, optional `GELF_ADDR` /
  `GELF_TAG`.

The Posda side of the contract is one trigger:

```sql
CREATE FUNCTION notify_transfer_queued() ...
    IF NEW.transfer_status = 'queued' THEN
        PERFORM pg_notify('idc_transfer_channel', NEW.dataset_release_transfer_id::text);
```
fired `AFTER INSERT OR UPDATE OF transfer_status ON dataset_release_transfer`.

## ⚠ What the daemon needs changed — it is out of date

Verified against the cloned source 2026-08-25. The submission model moved several
times since it was written. **Ordered by severity.**

### Hard breaks — it will not run against the current schema

**1. `who_updated = 'idc_transfer_daemon'` — a string into an integer FK.**
`dataset_release_transfer.who_updated` is `integer REFERENCES auth.users(user_id)`.
All three writes use the literal string (`transfer.go` lines 89, 116, 139), and
**line 139 is the claim**, so it dies on the first transfer it picks up.
*Fix:* create a service account row in `auth.users` and use its id, or write
`null`. A real service user is better — it makes daemon-driven changes
attributable in the same way as user-driven ones.

**2. `UPDATE transfer_idc SET gcs_url=$1` — that column does not exist.**
Posda has **`base_gcs_url`**, and it is not the same thing: `base_gcs_url` is the
*package anchor* (`gs://posda_submit/<dataset>/<version>`) that Posda sets and
every manifest path is relative to. The daemon writes a *manifest URL* into it.
So this is a conceptual conflict, not just a rename — the daemon would overwrite
the anchor. *Fix:* the daemon should **read** `base_gcs_url` and not write it.
If a manifest URL needs recording, it needs its own column (or nothing, since
manifest filenames are fixed and derivable from the anchor).

**3. `transfer_idc_file` vs `transfer_file` — two competing tables.** The daemon
ships its own `transfer_idc_file` in `schema_additions.sql`; Posda collapsed the
five per-destination file tables into one `transfer_file` on 2026-07-21. **The
good news: they are structurally near-identical**, so this is close to a
mechanical rename:

| daemon `transfer_idc_file` | Posda `transfer_file` |
|---|---|
| `transfer_idc_file_id` | `transfer_file_id` |
| `gcs_url` | `file_dest_url` |
| `updated_at` | `when_updated` |
| `dataset_release_transfer_id`, `file_id`, `status`, `error`, `attempts` | same |

Both carry the same unique key `(dataset_release_transfer_id, file_id)` and the
same `pending|completed|failed` vocabulary. Moving to `transfer_file` also makes
the same code path serve every future destination.

### Duplicate ownership to resolve

**4. The trigger is defined in both repos.** `schema_additions.sql` creates
`notify_transfer_queued()` and `dataset_release_transfer_queued_notify`; so does
Posda's `add_dataset_module_tables.sql`. The text currently matches, which is
luck, not design. *Suggestion:* Posda owns it (its DDL is DbSchema-managed and is
the source of truth); the daemon repo drops its copy and documents the dependency.
The `transfer_idc_file` DDL goes away entirely with item 3.

### Model drift

**5. It uploads one manifest, named `manifest.csv`.** `uploadManifest()` joins
only `ti.dataset_manifest_file_id`. IDC now takes **three** — dataset, imaging,
clinical — with fixed names `dataset_manifest.csv` / `imaging_manifest.csv` /
`clinical_manifest.csv` at the `<version>` folder level. Which exist varies per
transfer (Posda derives what is required from what the transfer carries), so it
should upload whichever are present rather than assuming a fixed set.
Also note the rename: `file_manifest` → `imaging_manifest` (2026-08-02).

**6. ⚠ The base path is reverse-engineered from a file URL.** `uploadManifest()`
reads one sample `gcs_url` and takes everything before the last `/`:

```go
slash := strings.LastIndexByte(sample, '/')
manifestURL := sample[:slash] + "/manifest.csv"
```

That works only while every file sits flat at `<base>/<md5>`. **The moment files
move into `imaging/` and `clinical/` (item 7) it silently computes
`<base>/imaging` as the base and writes the manifest into the wrong folder.** It
should read `transfer_idc.base_gcs_url` directly.

**7. The bucket layout changed and the daemon still writes flat.** Per
2026-07-30, DICOM blobs live in **`imaging/`** and clinical files in a peer
**`clinical/`** folder under `<dataset>/<version>/`. Both the daemon and the
fan-out compute `<base_path>/<md5>` with no subfolder.

**8. ✅ The fan-out does not separate imaging from clinical — replaced
2026-08-25.** `transfer_preparation.sql` selects every file in the transfer's
recordsets with no `is_dicom_file` split, so clinical and imaging files would
land together in one flat namespace. It also predates non-DICOM files shipping
at all (2026-07-30 reversed the earlier "links only" decision for clinical).
Posda now runs its own equivalent, `_fan_out_transfer_files`, against
`transfer_file` — see *IDC content predicates* below. The daemon's copy is dead
and should be deleted along with its `transfer_idc_file` DDL (item 3).

**9. ✅ Object paths and `relative_file_url` — settled 2026-08-25.** These had to
be designed together or IDC gets manifests pointing at paths that do not exist.
See *Bucket path scheme* below for the agreed layout. The daemon's flat
`<base>/<md5>` becomes `<base>/imaging/<md5>`, and the imaging manifest's
`relative_file_url` (still unimplemented) becomes `./imaging/<md5>`.

**10. No `status.json`.** The per-version readiness signal and bucket-write mutex
proposed 2026-07-31 (still unverified by either side) is not implemented.

### If it becomes the shared daemon

**11. Channel name.** `idc_transfer_channel` is IDC-specific; a shared listener
wants something destination-agnostic (see *Open questions*).

**12. Per-destination parallelism.** `TRANSFER_PARALLELISM = 1` is global, and
200 upload workers is right for GCS and wrong for a WordPress REST API.

**13. Lease/heartbeat.** The claim is atomic and correct, but it also accepts
`in_progress` as a claimable state — which is how it recovers from a crash, and
equally how two instances could both grab a live transfer. Safe at one instance,
not at several. See *Model gaps*.

## Who expands the file list?

**Mostly answered already** — the daemon repo ships
`sql/transfer_preparation.sql`, an external fan-out designed to be *"run by the
queuing process BEFORE flipping `transfer_status` to `'queued'`"*. It inserts one
row per file from `transfer_recordset -> recordset_release_file`, with
`ON CONFLICT DO NOTHING` so it is re-runnable, and the daemon deliberately never
writes those rows.

So the design intent matches the suggestion below; **Posda simply never called
it.** ✅ **Done 2026-08-25:** `_fan_out_transfer_files` runs inside the queue
transition, in the same transaction as the status flip — the daemon reads a
queued transfer with zero completed files as *failed*, so a crash between the
two would look like a real failure rather than a retry. It is IDC-only, writes
`status = 'pending'` explicitly (Posda's column has no default, and the daemon's
producer filters on `pending`), and keeps `ON CONFLICT DO NOTHING` so a re-queue
leaves the daemon's own `failed -> pending` reset in charge of what is retried.

The options below are kept for the record; the first is what was built.

- **Posda expands at queue time** — the `queued` transition also inserts
  `transfer_file` rows. Keeps the daemon dumb; makes the queue transition
  heavier (~500k rows for a large transfer, per the daemon's README) and it
  should then be one transaction with the status change.
- **The daemon expands on claim** — it already streams in batches, so it could
  do the insert itself from `transfer_recordset`. Keeps the API fast, but puts
  "what files does this transfer contain?" into the daemon, which is business
  logic (see the boundary below).

**Suggestion: Posda expands, in the same transaction as the status change.** It
is the one place that already knows what a transfer carries, and it makes
`transfer_file` a complete manifest of intent the moment work is queued — which
is also what any progress UI needs.

## ✅ Bucket path scheme — settled 2026-08-25

Resolves change-list item 9 (object paths and `relative_file_url` had to be
designed together). **Decided, not yet built.**

```
gs://{IDC_TRANSFER_BUCKET}/{dataset_slug}/v{release_number}/     <- base_gcs_url
    dataset_manifest.csv
    imaging_manifest.csv
    clinical_manifest.csv
    imaging/{digest}                                             <- file_dest_url
    clinical/{file_name}                                         <- file_dest_url
```

| | Value | Absolute? |
|---|---|---|
| `transfer_idc.base_gcs_url` | `gs://{bucket}/{dataset_slug}/v{release_number}` | **yes — the only absolute value anywhere** |
| `transfer_file.file_dest_url` (DICOM) | `imaging/{file.digest}` | no |
| `transfer_file.file_dest_url` (clinical) | `clinical/{file_name}` | no |
| imaging manifest `relative_file_url` | `./imaging/{digest}` | no |
| clinical manifest `relative_file_url` | `./clinical/{file_name}` | no |

**`file_dest_url` is stored relative** *(revised 2026-08-25 — the first draft had
it absolute)*. The daemon joins it to `base_gcs_url` at upload time. Reasons:

- **Relocation stays a one-field edit.** That is the entire point of
  `base_gcs_url` (IDC_TRANSFER, 2026-07-24: *"moving the package across
  buckets/projects means updating `base_gcs_url` alone — no manifest is
  rewritten"*). If every one of ~500k `transfer_file` rows also embedded the
  bucket, a relocation would mean rewriting all of them.
- **The bucket appears exactly once per transfer**, so dev vs prod is one field,
  not 500k.
- **It becomes literally the same string as `relative_file_url`** (modulo the
  `./` prefix), so the two cannot drift — which is the whole failure mode this
  scheme exists to prevent.

### How the bucket actually flows

The bucket name is needed at **one moment** — when Posda generates
`base_gcs_url` for a new transfer — and is stored from then on.

| Layer | Holds | Example |
|---|---|---|
| Posda env `IDC_TRANSFER_BUCKET` | the bucket for **new** transfers | `posda_submit` |
| `transfer_idc.base_gcs_url` | where **this** transfer goes; written once at creation | `gs://posda_submit/rider-lung-ct/v3` |
| `transfer_file.file_dest_url` | where **within** the package; relative | `imaging/000984c1a99…` |
| daemon | joins the two at upload time | `gs://posda_submit/rider-lung-ct/v3/imaging/000984c1a99…` |

**Why store it rather than compose it from the env var every time?**

- **Relocation** — IDC's ETL may move the package between buckets/projects, and
  `base_gcs_url` exists so that is a one-field edit.
- **Historical truth** — a transfer shipped months ago went wherever the bucket
  pointed *then*. Recomputing from today's env var would misreport where the data
  actually is.

**The Go change this implies is small, and removes a latent bug.** Today
`transfer.go` calls `parseGSURL(row.GCSURL)` on an absolute per-file URL. It
becomes: read `base_gcs_url` once per transfer, then
`parseGSURL(base + "/" + row.DestPath)` per file. That also retires the
reverse-engineering in `uploadManifest()` (change-list item 6), which recovers
the base path from a sample file URL and would silently break as soon as files
move into `imaging/`.

### Why each part

- **`{digest}` for imaging.** `file.digest` is **MD5** — verified: all 6,237 rows
  in the local DB are 32 hex characters. That is what makes the daemon's
  HEAD-then-verify-MD5 idempotency work, and it dedups identical files for free.
  Keep it.
- **`{file_name}` for clinical** *(decided 2026-08-25; an earlier draft had
  `{digest}` here too)*. Clinical files are human-facing tabular data that IDC
  and curators refer to by name; a content-addressed blob would be unreadable.
  The clinical manifest **already emits `./clinical/<name>`**, so no code change
  is needed there.
- **`v{release_number}` from Posda**, i.e. `dataset_release.release_number` —
  the transfer belongs to a `dataset_release`, so that is the authoritative
  version of the thing being shipped.
- **`{dataset_slug}` from WordPress.** ⚠ **There is no slug anywhere in Posda's
  schema** (verified — only an unrelated `core_organization.slug`). It comes from
  the mapped `collection` / `analysis_result` object via `wp_object_map`, so
  generating `base_gcs_url` requires a live WP read. Setup already requires the
  dataset to be WP-linked, so it is always available.

### Consequences worth being deliberate about

- **The slug is captured at generation and frozen.** Notes from 2026-07-23 record
  that we deliberately stopped caching slugs anywhere, because they change. Here
  freezing is *correct*: a bucket path must not move after upload, and
  `base_gcs_url` exists precisely so a relocation is a single-field edit.
- **Overwriting the same path is intended**, not a hazard — it is what makes
  re-runs idempotent, and the daemon's HEAD-then-verify-MD5 relies on it.
- **⚠ Two filename characters actually matter** (narrower than an earlier draft
  of this note claimed — spaces and non-ASCII are fine as GCS object names):
  - **`/`** silently creates a nested pseudo-folder, so the file is no longer in
    `clinical/` at all, and it breaks `parseGSURL`, which splits on `/`.
  - **`#` / `?`** are legal object names but are fragment/query delimiters to
    anything resolving `relative_file_url` as a URL — IDC's side would truncate
    at the `#`.

  These only "disagree" if we encode one field and not the other, so the rule is
  simply: pick one and apply it to `file_dest_url` and `relative_file_url` alike.
  Now that those are the same string, that is nearly automatic.
- **✅ The dataset manifest must take its version from Posda** *(decided
  2026-08-25)*. It currently emits `_str(wp_item.get("version_number"))`. The
  decisive reason is not that the folder and manifest should agree — it is that
  **WordPress is not updated until dissemination (step 7), which happens *after*
  the transfer.** So at manifest-generation time the WP version is stale or
  absent by construction; it cannot be right.
  - **`dataset_version_date` had the identical bug**: it read
    `wp_item.get("date_updated")`, the WP post's date, not the release's.
  - **Implemented 2026-08-25.** Both now come from `dataset_release`:
    `dataset_version` = `release_number`, `dataset_version_date` =
    `release_date` as `YYYY-MM-DD`. The generator's resolving query already
    joined `dataset_release`, so it was a two-column add.
  - **The general rule:** *facts about the release come from Posda; curated
    content comes from Collection Manager.* Abstract, citations, cancer types,
    species, program and supporting data are genuinely CM-curated and correctly
    read from WP. Version and date are not. Worth auditing the rest of the
    dataset manifest against this — `dataset_doi` is the next candidate, since
    Posda holds `dataset.dataset_doi` (NOT NULL UNIQUE) and
    `dataset_release.release_doi`.
  - **Still open under that rule:** the *clinical* manifest's `date_updated` is
    left alone deliberately — it describes the CM download post, not the
    release. `dataset_doi` is also left on WP: it is the dataset-level TCIA
    collection DOI, and the per-release one is the separate `dataset_version_doi`
    field still marked *needs adding*.

### `IDC_TRANSFER_BUCKET` — implemented 2026-08-25

A **Posda-side** environment variable supplying the bucket when `base_gcs_url`
is generated:

```python
IDC_TRANSFER_BUCKET = os.getenv("IDC_TRANSFER_BUCKET", "posda_submit")
```

The default matches the daemon's existing convention.

**Where an operator would set it:** `oneposda/api.env`, the env_file the
`posda-api` compose service loads (alongside `database.env`, `common.env`,
`posda.env`). It is **untracked** — local deploy config, not in git — and today
holds only `API_WORKERS` and `API_PORT`. `FILE_STORAGE_PATH` and
`FILE_STORAGE_ROOT_ID` are not in it either; they run on their code defaults. So
there is no committed file to document the new variable in, and none was
invented; a deploy that needs a non-default bucket adds a line to `api.env`.

⚠ **It does not by itself keep dev out of the production bucket** — an earlier
draft of this note claimed it did, which is wrong. The bucket is *written into*
`base_gcs_url` at generation time, so the variable only picks the default for
**new** rows. Restore a prod dump into dev and every stored URL still points at
production.

What actually protects prod is **credentials**: the daemon's service account
(`GCS_KEY_FILE`) should not have write access to the prod bucket outside prod.
That is the enforcement boundary; the env var is a convenience. A cheap
belt-and-braces addition would be an allowlist check in the daemon — refuse to
upload to a bucket not named in its own config.

The **daemon does not need the bucket name**: it derives it by parsing the
`gs://` anchor (`parseGSURL` in `gcs.go`). With `file_dest_url` now relative, the
bucket is named exactly once per transfer and everything downstream inherits
it.

### Where `GCS_KEY_FILE` lives

Not in the repo. It is a **path** to a service-account JSON key:

- read in `src/main.go` (`os.Getenv("GCS_KEY_FILE")`), applied in `src/gcs.go`
  via `option.WithCredentialsFile`;
- **fallback:** if unset, the client looks for `sa-key.json` in the working
  directory;
- `src/Makefile` mounts `${PWD}/sa-key.json` to `/secrets/sa-key.json:ro` and
  sets the var to that path for `make run`;
- `sa-key.json` is gitignored and **is not in the clone** — it has to be obtained
  and dropped at `idc-transfer-daemon/src/sa-key.json` before the daemon can run.

`main.go` also warns on the near-miss `GCS_KEY`, which suggests that has bitten
someone.

### ✅ When `base_gcs_url` is generated — implemented 2026-08-25

**In `generate_idc_dataset_manifest`, not at transfer creation** — this reverses
this note's original suggestion. The reason: the slug exists only in WordPress,
so generating at creation would add a live WP fetch to a route that has none,
and a WP outage would start failing IDC transfer *creation*. The dataset-manifest
generator **already fetches that WP item and already writes `transfer_idc`**, and
it now also has `release_number` in hand — so this costs no new call and adds no
new failure mode. Ordering is guaranteed for free: `_idc_manifest_state` makes
the dataset manifest required for every IDC transfer, so it always runs before
queueing.

```python
slug = manifest_row["dataset_slug"]
base_gcs_url = f"gs://{IDC_TRANSFER_BUCKET}/{slug}/v{release_number}" if slug else None
```

The upsert uses `coalesce(transfer_idc.base_gcs_url, excluded.base_gcs_url)` —
**the existing value wins**, so it only ever fills a null and a relocation edited
in the Manage modal survives a manifest regeneration.

**Queue gate.** Queueing an IDC transfer now 422s `BASE_URL_REQUIRED` when
`base_gcs_url` is empty, beside the existing `MANIFESTS_REQUIRED` check. This is
not defensive padding: the field stays editable in `TransferSettingsForm`, so
someone can blank it, and every path the daemon uploads is relative to it.
`QueueTransferModal` blocks its button on the same condition so the failure is
visible before the click — but only once the manifests exist, since until then
the missing manifest is the real cause and `base_gcs_url` is empty as a
consequence, not a separate problem.

## ✅ IDC content predicates — settled 2026-08-25

What IDC can house, stated as file properties instead of as a proxy for them.
Both live as module-level constants in `distribution.py` and drive **six** call
sites, so the manifests, the queue gate and the fan-out cannot drift apart:

```python
IDC_IMAGING_PREDICATE  = "f.is_dicom_file is true"
IDC_CLINICAL_PREDICATE = "f.is_dicom_file is not true and rt.recordset_type_name = 'Clinical Data'"
```

**What changed and why.** Imaging was `recordset_type_name = 'Radiology Images'
AND is_dicom_file`; clinical was every non-DICOM file.

- **Imaging is now any DICOM.** DICOM can be a pathology slide (raised
  2026-08-25) or a SEG/RT annotation, not only radiology. The recordset type was
  only ever standing in for "is it DICOM", and pathology DICOM breaks that
  proxy. IDC ingests DICOM whatever it depicts.
- **Clinical is now Clinical Data recordsets only.** "Not DICOM" was the same
  kind of proxy in reverse, and it swept in anything non-DICOM that is not
  clinical at all — a histopathology bundle bound for Aspera, say.
- Both are null-safe (`is true` / `is not true`), so a file with a null
  `is_dicom_file` cannot fall out of every count.

**The third group.** The predicates are deliberately *not* complementary:
together they partition a transfer's files into imaging, clinical, and
**neither**. A file in the third group is a routing mistake, not a category — a
non-DICOM file in a Histopathology / Image Annotations / Other recordset that
someone pointed at IDC.

**Decided: warn, do not block; skip, do not ship** *(2026-08-25)*. Queueing is
still allowed — the rest of the transfer is valid, and the fix is to correct the
recordset's destinations, not something to do mid-queue. But the fan-out skips
those files rather than uploading them: IDC cannot interpret an object with no
manifest row, and the upload cannot be recalled, whereas a skip is recoverable
by fixing the routing and re-queueing. `_idc_manifest_state` returns
`unlistable_files` and `unlistable_recordsets`, which `QueueTransferModal`
surfaces so the skip is visible before the click.

**The six sites**, all now reading the constants:

| site | was |
|---|---|
| imaging manifest preflight | Radiology Images + DICOM |
| imaging manifest files CTE | Radiology Images + DICOM |
| `_idc_manifest_state` (which manifests are required) | both old predicates |
| clinical manifest files query | any non-DICOM |
| `_wp_precedence_block` | any non-DICOM — could block on a file the clinical manifest no longer carries |
| `_fan_out_transfer_files` | new |

The clinical manifest query and `_wp_precedence_block` had to gain a
`recordset_type` join to use the predicate.

**Verified** against the live DB in rolled-back transactions: the fan-out writes
well-formed relative paths with `status = 'pending'`, a re-run inserts 0 rows,
imaging + clinical + unlistable equals the file total on every IDC transfer, and
— with an unlistable file forced onto a transfer, since the fixtures contain
none — it is counted, named, and left without a `transfer_file` row.

⚠ **Nothing transfers yet.** The daemon still reads `transfer_idc_file` and
still treats the URL as absolute (change-list items 3, 6, 7), so these rows sit
unused until those land.

✅ **The cycle Transfer stage groups by file counts — fixed 2026-08-26.**
`manifestGroups()` used to label rows from `recordset_type_name` alone, which
contradicted the rule: a DICOM histopathology recordset feeds the imaging
manifest but was shown as "Not manifested for IDC".
`GET /transfers/{id}/recordsets` now returns `imaging_files`,
`clinical_files` and `unlistable_files` per recordset, computed from the same
shared predicates, and the stage groups on those — showing what each recordset
contributes to each manifest.

A recordset carrying both DICOM and clinical files now appears in **both**
groups, which the old one-group-per-recordset shape could not express.

Verified live: transfer 3's *Image Annotations* recordset reports 5 imaging
files (previously "not manifested"), and transfer 1's *Clinical Data* recordset
reports 1 imaging file — it holds a DICOM file, so it feeds the imaging
manifest, not the clinical one.

## The main question: one daemon or one per destination?

**Suggestion: one daemon, pluggable per-destination adapters — not N daemons.**

The reason is that the interesting 80% is identical everywhere and is the part
that is easy to get wrong:

| Shared | Destination-specific |
|---|---|
| LISTEN/NOTIFY + reconciliation sweep | the actual protocol/SDK |
| atomic claim, lease, crash recovery | credentials |
| `queued → in_progress → success/failed` | destination URL/path scheme |
| `transfer_file` progress + retry counters | what "done" means |
| backpressure, parallelism limits | pre/post steps (manifests, status.json) |
| logging/metrics, "why is this stuck?" | |

Writing that five times means five places to fix the same bug. It also matters
that **the schema already assumes a shared model**: `transfer_file` is one table
for every destination, keyed on `dataset_release_transfer_id`, with
`file_dest_url` / `status` / `error` / `attempts` columns that are not
IDC-specific. And the trigger is destination-agnostic — it notifies on *any*
queued transfer, so a single listener is the natural fit.

**But run per-destination worker pools inside it.** One binary, N queues. A
stalled Aspera transfer must not block IDC, and each destination wants its own
parallelism (200 GCS uploads is not the right number for a WordPress REST API).
`TRANSFER_PARALLELISM = 1` is currently global; it should become per-destination.

### When a separate daemon *is* justified

Worth splitting only when a destination cannot share the runtime:

- **Aspera** likely needs the proprietary Faspex client/SDK, possibly a specific
  network path. A sidecar or shell-out adapter may be unavoidable.
- **NBIA** may need to run inside a particular network zone.
- A destination whose only usable SDK is in another language.

Even then, prefer **shared core + a thin remote adapter** over a second full
daemon, so claiming and status handling stay in one implementation.

## Keep the boundary: the daemon transports, Posda decides

Already established for IDC (IDC_TRANSFER.md, 2026-07-22: *"Posda does all
sourcing and writes static CSVs; the daemon only transports"*). Worth stating as
a general rule, because it is what keeps the language choice low-stakes:

- **Posda:** what ships, which files, manifest generation, all gating
  (release finalized, manifests present, WordPress-before-IDC ordering).
- **Daemon:** move bytes, record progress, report terminal status.

If the daemon ever needs to decide *what* to send, that logic has escaped.

## Go or Python?

Genuinely close; both work. The workload is long-running, I/O-bound, high-fan-out
uploads.

**Go** — what the IDC daemon already is, and the better fit for the transport
job: cheap concurrency for thousands of parallel uploads, a static binary with no
runtime to manage on the host, mature GCS SDK, and it is already written and
presumably tested against real 256 GB transfers. Cost: a second language in the
stack, and no reuse of Posda's Python DB helpers or models.

**Python** — matches the rest of the backend (FastAPI + asyncpg), so DB access,
config, logging and deployment conventions are shared, and the team maintaining
Posda can maintain it. `asyncpg` supports LISTEN/NOTIFY directly. Cost: parallel
upload throughput needs more care, and it is another long-running process in a
codebase currently shaped around request/response.

**Suggestion: stay with Go for the transport daemon.** It exists, the workload
suits it, and the transport/decision boundary above means very little logic lives
there — exactly the situation where "second language" costs least. Add
per-destination adapters to it rather than starting a Python one, unless a
destination's SDK forces the issue.

Reading the source strengthens this rather than weakening it: the parts that are
**hard** — the atomic claim, keyset-paginated streaming, batched status flush via
`UPDATE FROM unnest(...)`, HEAD-then-verify idempotency, retry-only-the-failures
on re-queue — are all done and look right. Everything in the change list above is
**renames, column mappings and folder layout**, not a rewrite. Porting that to
Python would mean re-earning the hard parts to fix the easy ones.

*(The repo still carries a stray `.python-version`; commit `20d684e` is
"Switch to Go version", so it was Python once. Worth deleting to avoid
confusion.)*

## Model gaps to close whichever way this goes

Recorded here rather than rediscovered during the build:

- **No lease or heartbeat.** A daemon that dies mid-transfer leaves
  `in_progress` forever, and nothing reclaims it. The reconciliation sweep can
  only help if there is a way to tell "in progress" from "abandoned" — needs a
  claimed-at/heartbeat column or a lease table.
- **No un-queue and no retry state.** `transfer_status` is
  `draft | queued | in_progress | success | failed` with no path back and no
  attempt counter at the transfer level (`transfer_file.attempts` exists per
  file). A failed transfer currently has no defined recovery: re-queue? new
  transfer? Undecided.
- **Partial failure has no representation.** If 3 of 500k files fail, the
  transfer is `failed` — but the other 499,997 uploaded. Whether a retry
  re-uploads everything or only the failures depends on `transfer_file` being
  authoritative, which argues again for populating it up front.
- **`transfer_file` has no API and no UI.** Already an open item in
  IDC_TRANSFER.md. A progress/retry surface in the Transfer stage is the natural
  home once the table is actually populated.
- **`file_dest_url` is per-file and absolute-ish**, while IDC's manifests are
  deliberately relative to `base_gcs_url`. Worth confirming the two don't drift
  into disagreeing about where a file is.

## Per-destination sketch

Rough shape of what each adapter has to do. Not researched in depth.

| Destination | Transport | Pre/post | Notes |
|---|---|---|---|
| **IDC** (`idc`) | GCS upload to `base_gcs_url` | manifests generated by Posda first; `status.json` per version folder; bucket mutex w/ IDC's ETL | the built case |
| **WordPress** (`wp`) | WP REST media upload | sets `transfer_wp.wp_media_file_id`; refreshes the CM download | ⚠ **must complete before IDC's clinical manifest can generate** — the only cross-destination ordering in the model |
| **Aspera** (`asp`) | Faspex | `faspex_url` recorded on the transfer | may need the proprietary client; likeliest candidate for a separate process |
| **NBIA** (`nbia`) | NBIA submission | `collection` / `site` recorded | mechanism not investigated; NBIA is being retired as the storage component, so confirm this is still needed |
| **GC** (`gc`) | General Commons | — | mechanism not investigated |

## Open questions

- Does the DBMI copy of the daemon keep `idc_transfer_channel` as the channel
  name? A shared daemon wants a destination-agnostic channel
  (`transfer_channel`), with the payload carrying the transfer id and the worker
  looking up its destination.
- Should the NOTIFY payload include `destination_abbr`, so a listener can route
  without a round trip? Cheap, and useful if adapters ever do split across
  processes.
- Is NBIA still a live destination given it is being retired as TCIA's storage
  component?
- Who owns the daemon's deployment/monitoring now that it lives in
  `UAMS-DBMI`, and does it run one instance or several? The claim accepts
  `in_progress` as claimable — which is how it recovers from a crash, and
  equally how two instances could both grab a live transfer. **Safe at one
  instance; needs a lease before running several.**
- **Should the queue gate also require `base_gcs_url`?** The fan-out needs a
  `base_path` parameter, which comes from `transfer_idc.base_gcs_url` — today a
  free-text field a curator types into the Manage modal. Queueing an IDC transfer
  without it would produce file rows with a malformed destination. The gate
  already requires manifests (`_idc_manifest_state`); this is the same class of
  precondition and belongs beside it.
- **Is `who_updated` the right place for a daemon identity?** A service row in
  `auth.users` works but puts a non-human in a user table; the alternative is
  leaving it null and relying on `transfer_status` plus logs for provenance.
