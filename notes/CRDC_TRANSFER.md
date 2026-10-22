# CRDC_TRANSFER.md — GC / CTDC transfers via CRDC

How Posda ships a dataset release to **General Commons (GC)** or the **Clinical
and Translational Data Commons (CTDC)** through the NCI CRDC submission process.
Started 2026-09-24; split out of [TRANSFER_DAEMON.md](TRANSFER_DAEMON.md)
2026-10-08. **Mostly discussion — the decisions below are recorded, nothing is
built.**

- Daemon architecture (why CRDC gets its own Go daemon):
  [TRANSFER_DAEMON.md → *GC / CTDC — the CRDC daemon*](TRANSFER_DAEMON.md)
- The IDC equivalent of most of this: [IDC_TRANSFER.md](IDC_TRANSFER.md)

Sources:

- <https://datacommons.cancer.gov/submit>, plus its two PDF guides (both dated
  **May 2026**, read 2026-10-14):
  [Submission Request instructions](https://datacommons.cancer.gov/submission-request-instructions)
  and [Data Submission instructions](https://datacommons.cancer.gov/data-submission-instructions).
- **The Submission Request form template** (Excel, v3.5, exported 2026-10-14):
  [reference/CRDC_Submission_Request_Template_v3.5_10142026.xlsx](reference/CRDC_Submission_Request_Template_v3.5_10142026.xlsx).
- **The data models: `CBIIT/crdc-datahub-models`, `prod` branch** (read at
  `e9ecfc2`, 2026-10-07). ⚠ The default `master` branch is stale (GC at 4.0.1);
  `prod` is what the portal serves. The portal's Model Navigator pages
  (`hub.datacommons.cancer.gov/model-navigator/GC/latest`, `…/CTDC/latest`) are a
  JavaScript app and return nothing to a plain fetch; the portal's
  *Submission Requests* and *Data Submissions* pages need a login.
- **[CRDC Data Submission API instructions](https://hub.datacommons.cancer.gov/CRDC_Data_Submission_API_Instructions.pdf)**
  (24 pp, read 2026-10-14) — the GraphQL API behind the portal; see *The Data
  Hub API*.
- The uploader source, **`CBIIT/crdc-datahub-cli-uploader`** (read at `96c9e25`,
  CLI v4.3).
- The downloader source, **`TCIA/data-retriever`** (read at `5c99d50`), whose
  `benchmarkManifests/examples/` holds real GC, CTDC, IDC, NBIA and PathDB
  download manifests.

## Decisions so far

| | Decision | When |
|---|---|---|
| Daemon | Its own daemon, **`UAMS-DBMI/crdc-transfer-daemon`**, in **Go** | 2026-09-25 |
| Transport | **Direct upload** — the daemon talks to the Data Hub API and S3 itself; **no Python uploader**. Reverses the 2026-09-25 "shell out to the uploader" | 2026-10-14 |
| Data Submissions | **Posda creates them** through the API (`createSubmission`). The workflow is still to be worked out | 2026-10-14 |
| Submit | **A user clicks Submit**, once every piece is in place. Posda does not call `submissionAction: Submit` on its own. *(Meeting 2026-10-14: confirmed — Submit in Data Hub starts the commons team's own checks. Whether the click happens in Data Hub or on a Posda button that calls the API is open.)* | 2026-10-14 |
| Data Hub study ID | **Dataset level, one per dataset per commons** — not recordset, not transfer. Table vs column is open (see *Where the Data Hub study ID lives*) | 2026-10-14 |
| Where the commons lives | **One destination per commons** — `gc` exists, add `ctdc` | 2026-10-07 |
| Settings table | **`transfer_crdc`** replaces `transfer_gc` | 2026-10-07 |
| Access level | **Everything sent to CRDC is controlled access.** Open data goes to IDC. ⚠ *Possible exception (2026-10-14 meeting):* open-access tumor annotations for CTDC trials — see *Meeting 2026-10-14* | 2026-10-07 |
| One commons per file set | **The same files never go to both GC and CTDC** — TCIA never duplicates content across systems; it points to wherever the files live. So **a recordset may be routed to `gc` or `ctdc`, never both** — the release module's destination step must block selecting both | 2026-10-14 |
| Submission Request scope | **One request per commons** (user's understanding; matches one destination per commons). *Confirmed in practice 2026-10-14:* the form has no commons field — the SRC approves the study **for** a commons, and the submitter picks that commons when creating each Data Submission | 2026-10-07 |
| GC | General Commons, under the CRDC umbrella. ⚠ **Inside Data Hub its model is still keyed `CDS`** (`cds-model`, `cache/CDS/`) — expect that code in model files and any API | 2026-10-07 |

## Meeting 2026-10-14 — CRDC workflow walkthrough

With Justin (who has taken datasets through the full CRDC flow for both CTDC and
General Commons) and Kirk; Duane briefly. Michael walked through this file. What
came out of it, by topic — the sections below are updated to match.

**Routing**
- **Never the same files to both GC and CTDC** (see *Decisions*). Splitting a
  dataset across systems does happen, but between IDC and GC — e.g. images with
  faces to GC, the rest to IDC — which recordset routing already handles.

**Which commons, and when it is known**
- **The Submission Request does not choose the commons**; CRDC decides in a
  manual process after the request, and the commons is then picked when each
  Data Submission is created. Matches the guides.
- **The request should go in very early** — Justin's view: when TCIA's advisory
  group approves a dataset and the site returns the data submission agreement,
  i.e. when Ramesh asks Kirk to assign a curator. The request then only has to
  settle *GC or CTDC*; CRDC leadership has already agreed in principle that TCIA
  can use the system. So the commons should be known well before a release
  reaches the Transfer stage.
- That suggests curators might set up the dataset in the release module at the
  start of curation (also linking activities to it, which Kirk had asked for)
  and set the destination then. **Not decided** — the overall workflow is not
  worked out.

**Submission Requests — not automated for now**
- Justin's suggestion: **Posda generates the Submission Request as a filled-in
  Excel file**, and Ramesh imports it in the portal (*Import Form*) and submits
  it. Ramesh sits on the Submission Review Committee and can see it through.
  The template is in [reference/](reference/CRDC_Submission_Request_Template_v3.5_10142026.xlsx).
- ⚠ Open: if Ramesh's account creates the request, can another account (a
  curator's, or the daemon's) create Data Submissions and upload to that study?
  Portal contacts are just name and email, not logins, so adding someone as a
  contact does not grant access.

**Study ID**
- Per Justin, the study is **created by CRDC (someone on Todd's team) after the
  committee review**, and by the convention Justin negotiated, its identifier
  is effectively the **TCIA short name** — for CTDC, the trial's full name as the
  title and the trial identifier (the TCIA short name) as the ID. **To verify
  against the API** — see *Where the Data Hub study ID lives*.

**dbGaP**
- **A new phs number is rarely needed.** Per TCIA's controlled-access data policy
  page: FACES datasets share one existing phs (new patient IDs are added to it);
  Biobank has one; for **NCTN / NCORE trials, CTEP creates the dbGaP study** for
  each dataset, adds the clinical data and tells TCIA the phs — TCIA does
  nothing in dbGaP.
- **New patients do not have to be in dbGaP to start a Data Submission. They
  must be there before Submit.** That moves the gate earlier than the guides
  implied (release); see *dbGaP subject list*.
- The **`participant_id`** in `participant.tsv` must **match exactly** what is
  sent to dbGaP.
- Open: who adds the patients to an existing phs — does the list go to Ramesh?
- Kirk has sorted out TCIA's dbGaP *download* access for the new study: it
  needed its own data use certificate, and data can only be downloaded into the
  protected SAN area, so it is for testing only. Kirk can assign downloaders,
  not uploaders.

**Accounts — the big hurdle**
- Asked about a resource account, **Todd answered that the identity must be an
  NIH or Login.gov identity tied to an individual, not a group**, and that
  supplying a user identity at runtime might work. That would mean every
  curator has an account and passes their credentials when they push — "more of
  a headache". **Nobody will put a personal Login.gov credential in a config.**
  Unresolved.
- The 60-day inactivity deactivation also bites curators who do not log in for
  a while.

**Data models**
- The two models differ and **change over time** as submitters ask for new
  elements or permissible values. **A Data Submission is pinned to the model
  version it started on** unless a bump is requested.
- GC's imaging detail lives in the `NonDICOM*` nodes. **Do not use them** —
  that would tell users the data is not DICOM. **Populate only the top-level
  `image` and `file` nodes.**
- The models carry little that is useful for TCIA's data; Justin worked around
  it, e.g. **`file_description` = series description + study date + modality**.
  Don't over-invest: TCIA's own metadata lives in its manifests and Croissant.
  Later, push CRDC to improve the models.

**Versions and deletes**
- **No dataset has had an update pushed to a commons yet** — new territory.
  From the Biobank / FACES work: an update is a **new Data Submission against
  the existing study**.
- Deletes during validation are routine; deleting already-released data has
  not been done. The plan stands: a *Delete* Data Submission plus a separate
  *New/Update* one.

**ZIP per series — TCIA's choice, not CRDC's**
- **CRDC did not ask for it.** Justin chose it because CRDC's data model is not
  built for millions of individual file records, and because NBIA's download
  unit was always a series. Justin is open to changing it. See *What ships*.

**Testing and next steps**
- **There is no test path; the first live submission is the test.** That is
  acceptable — many review layers follow.
- **Next:** pick a dataset and try to send it, engaging Todd's team where it
  sticks. Prefer something a submitter is actually waiting on (ask Ramesh, the
  curators and Kirk); otherwise use one from Michael's candidate list.

**CTDC tumor annotations — an open policy question**
- The CTDC trial images have been submitted (Submit pressed; CTDC is still
  processing most of them). The **tumor annotations for the same trials are
  open access and still in NBIA**. IDC will not host annotations for images it
  does not host.
- Options: move them from NBIA to AWS, or **submit them to CTDC beside the
  images** (Justin's preference), on two conditions: they stay a **separate
  dataset** (they are analysis results), and they are **fully open access** in
  CTDC. Justin is asking CRDC whether open access is possible there.
- If it is, one of these could be the **first test transfer** — open access
  skips the dbGaP steps.

**Croissant** — see *Croissant* below.

## One process, two targets

GC and CTDC are reached through the **same CRDC submission process**, but data
goes to one or the other, so **the target commons is always required**.

| Shared (the CRDC process) | Per commons |
|---|---|
| dbGaP registration + subject list | the Submission Request |
| Data Hub portal, API token, CLI uploader | the data model / metadata TSV templates |
| data-file batches (per-series ZIPs) | metadata content and validation rules |
| validation → submit → concierge review → release | the Data Submission ID |
| download-manifest format (`drs_uri` …) | |

## The CRDC flow

Detail from the May 2026 guides *(2026-10-14)*:

1. **Accounts and roles.** Everyone needs a **Login.gov** account (NIH staff use a
   PIV card). Every account starts as *User*; uploading needs the **Submitter**
   role, requested in the portal (*Request Access*) and granted by a CRDC admin,
   with the studies listed. ⚠ **Access is deactivated after 60 days without a
   portal login** (the Data Submission guide; the Submission Request guide says
   180) — "even while you are working on an active, ongoing submission".
2. **dbGaP registration** — required for controlled access, which is everything
   we send. Gives the study a **phs accession**, entered *with its version
   number* on the request form. **The portal will not let a Data Submission be
   created for controlled data without it.** Plus the patient list — see
   *dbGaP subject list*.
3. **Submission Request** — one per study, by the PI or primary contact, online
   or via the Excel template. **No commons field**: the SRC approves the study
   for a commons. Reviewed in **4–6 weeks**. Statuses: New, In Progress,
   Submitted, In Review, Inquired, Approved / Rejected, **Conditionally
   Approved**, Cancelled, Deleted. ⚠ **Auto-deleted after 120 days of
   inactivity** (restorable).
   **Conditional approval** blocks *Create a Data Submission* until each
   condition clears:
   - the dbGaP phs number, if not yet supplied;
   - a **data model update**, if the study needs new types, CDEs or permissible
     values — CRDC makes it, then notifies the PI;
   - **for imaging: a de-identification protocol and/or Risk Mitigation Form**,
     reviewed by CRDC subject-matter experts. Every TCIA collection we send
     will hit this.
4. **Data Submission** — created in the portal per upload effort. A study has
   **one or more, often many**. Created with:
   - **Submission Type:** *New/Update* or *Delete* (removes files from a
     previously **released** submission; metadata only; reviewed by CRDC and the
     commons before it is processed);
   - **Data Type:** *Metadata and Data Files* or *Metadata Only*;
   - **Data Commons** (the approved one), **Study**, dbGaP ID (pre-filled), and a
     free-text **Name**.

   Creating one assigns a **Data Concierge** and a **Submission ID** — the value
   `transfer_crdc.submission_id` holds. Other Submitter-role users are added as
   **Collaborators** per submission.
5. **Upload**: metadata TSVs (portal GUI or uploader) and data files (**uploader
   only** — the GUI must not be used for data files).
6. **Validate**, from the portal, as often as wanted: *Metadata*, *Data Files* or
   *Both*; new uploads only, or *All Uploaded Data*. Results are **Error** (blocks
   submit) or **Warning** (does not), per node and batch. A value outside a CDE's
   permissible values needs a **PV request** (one per CDE), decided by the
   concierge.
7. **Submit** — enabled only with zero errors; locks the submission and hands it
   to the concierge (who can reject it back to us).
8. **Release** — CRDC final checks, then the commons indexes and releases.
   ⚠ **"Data will be released on the respective CRDC Data Commons portal after
   the study is released on dbGaP."**

A Posda transfer automates step 5. Steps 1–4 and 6–8 are human — though see
*Is there an API?* below.

### Updating released data — matters for versioning

A Posda release that changes a dataset maps onto CRDC like this:

- **Adds and changes go in a New/Update Data Submission.** Re-uploaded metadata
  merges into what is already released, with fixed rules: **a blank or missing
  property keeps the existing value**; **`<delete>`** (any case) clears an
  *optional* value; required values cannot be cleared. A validation warning,
  *update existing data*, flags every collision. So a regenerated full TSV
  overwrites values, but **a value Posda removes has to be emitted as
  `<delete>`**, or it survives.
- **Removing files needs a separate *Delete* Data Submission** (metadata only).
  So a release that drops series needs **two** Data Submissions, while a Posda
  transfer carries **one** `submission_id`. ⚠ Open: one transfer per Data
  Submission, or a transfer that can carry both.
- **Metadata batches split by participant.** A batch may hold all participants
  or a subset, but **mixing new data for already-uploaded participants with new
  participants in one batch is an error**, and one bad file fails the whole
  batch. Posda's TSV generation (or the daemon's batching) has to respect that.
- Re-uploading data files **with the `-final` manifest keeps their file IDs**;
  without it they get new ones. See *`transfer_file` needs the assigned file ID*.

### Is there an API? — yes *(2026-10-14)*

Every step from creating a Data Submission to submitting it is an API call. See
*The Data Hub API* below. Steps 1–3 (accounts, dbGaP, the Submission Request) and
8 (release) stay human.

## dbGaP subject list *(new 2026-10-08, revised 2026-10-14)*

**Known:** the submission requires a list of patients submitted to dbGaP.

**From the Data Submission guide** *(2026-10-14)*: **the portal generates
partially populated dbGaP sheets from the metadata uploaded to it**, available
once the first metadata batch is in — "a preliminary aid", which the submitter
verifies and completes. CRDC recommends working on dbGaP and CRDC
**concurrently**, and downloading the sheets *after* validation. **Nothing in
the guides says CRDC validation checks participants against dbGaP**; the hard
dbGaP dependencies are the phs number (to create a Data Submission) and dbGaP's
own release (before CRDC releases).

That reverses the ordering assumed on 2026-10-08: **CRDC metadata can go up
first, and the dbGaP sheets come out of the portal.** The gate is at *release*,
not at upload.

✅ **Refined at the 2026-10-14 meeting: the gate is at *Submit*.** Per Justin, new
patients do not need to be in dbGaP to start a Data Submission, but **must be
added before Submit is pressed**. So the order is: upload metadata → pull the
dbGaP load sheet → get the patients into dbGaP → Submit. Also: a new phs is
rarely needed (FACES and Biobank each have one; CTEP creates them for
NCTN / NCORE trials), and `participant_id` must match dbGaP exactly.

The GC model carries the dbGaP link directly: **`participant.dbGaP_subject_id`**
(optional) and a required **`consent_group`** node
(`consent_group_id`, `consent_group_name`, `consent_group_number`), with every
participant linked to a consent group. Consent groups are defined by the dbGaP
registration, so they are an input to Posda, not something it derives.

What it means for Posda:

- **Posda may not need to generate the list at all** if the portal's sheets
  suffice — but it **can**: the distinct `patient_id` across the release's
  `gc`/`ctdc`-bound recordsets. Worth comparing against the portal's output
  before building anything.
- **Three places must agree on patient IDs:** the dbGaP list, the participant
  nodes in the metadata TSVs, and the `PatientID` inside the DICOM in the ZIPs.
  If the dbGaP sheets come from the portal, they are derived from Posda's TSVs,
  which narrows this to two — TSVs and DICOM — both generated by Posda from one
  query.
- **A release that adds patients** still needs dbGaP updated — before Submit
  *(2026-10-14 meeting)*, not just before CRDC releases it.

## The Data Hub API *(2026-10-14)*

From the API instructions PDF. **One GraphQL endpoint,
`https://hub.datacommons.cancer.gov/api/graphql`**, all `POST`, authenticated
with the same **API token** as the uploader (`Authorization: Bearer …`). The
schema is introspectable; the PDF only covers what the schema does not say.

⚠ **It always returns HTTP 200, even on failure.** Errors come back under the
response's error key with `data` null. The same trap as the uploader's exit code
0: the daemon has to inspect the body, never the status.

| Step | Call | Notes |
|---|---|---|
| Find the study | `getMyUser { studies { _id } }` | `studies._id` is the **`studyID`** that `createSubmission` needs — a Data Hub ID, not the phs number |
| Create a Data Submission | `createSubmission(studyID, dataCommons, name, intention, dataType)` | **`dataCommons`: `"CDS"` for General Commons**, `"CTDC"` for CTDC. `intention`: `New/Update` \| `Delete`. `dataType`: `Metadata Only` \| `Metadata and Data Files`. Returns `_id` = the submission ID |
| Find / inspect | `listSubmissions(…, status)`, `getSubmission(_id)`, `submissionStats(_id)`, `getSubmissionSummary(submissionID)` | `getSubmission` carries `status`, `metadataValidationStatus`, `fileValidationStatus`, `crossSubmissionStatus`, the concierge, `history`. The summary gives **new / updated / deleted counts per node type** — a preview of what a release changes |
| Read back metadata | `getSubmissionNodes(submissionID, nodeType, …)` | `props` is a JSON string |
| Uploader config | `retrieveCLIConfig(submissionID, apiURL, dataFolder, manifest, archive_manifest)` | returns the YAML for the uploader, ready to save |
| Data files without the uploader | `createTempCredentials(submissionID)` | STS credentials for S3; "possible", but the uploader is recommended |
| Metadata batches | `createBatch(submissionID, type, files)` → upload each to its **pre-signed URL** → `updateBatch(batchID, files)` → poll `listBatches` | essential validation is **asynchronous**; a batch ends `Uploaded` or `Failed` |
| Delete within a submission | `deleteDataRecords(submissionID, nodeType, nodeIDs, deleteAll, exclusiveIDs, deleteOrphanedDataFiles)` | `nodeType: "data file"` deletes uploaded files by name. Asynchronous |
| Validate | `validateSubmission(_id, types, scope)` | `types` ⊆ `metadata`, `data file`; `scope` `New` \| `All`. **`success` only means it started** — poll `getSubmission` |
| Validation results | `aggregatedSubmissionQCResults`, `submissionQCResults` | per issue / per node, filterable by severity, node type, batch |
| Submit | `submissionAction(submissionID, action)` | `action`: `Submit` \| `Withdraw` \| `Cancel` |
| **dbGaP load sheets** | `downloadDBGaPLoadSheet(submissionID)` | returns a **pre-signed URL to a zip** of the load sheets |
| Rename | `editSubmission(_id, newName)` | **names are at most 25 characters** |

**Submission statuses** (from `listSubmissions`): New, In Progress, Submitted,
Released, Completed, Canceled, Rejected, Withdrawn, Deleted.

### What the API changes for Posda

- ✅ **Posda creates the Data Submission itself** *(decided 2026-10-14; workflow
  to be worked out)*. No need for a curator to make it in the portal and paste
  the ID in. Queueing could call
  `createSubmission` and store the returned `_id` in
  `transfer_crdc.submission_id`. That needs the **Data Hub `studyID`**, a
  per-dataset value Posda does not hold, beside the phs accession. Name ≤ 25
  characters, so something like `<slug> v<release>`, truncated.
- **Validation can run without anyone opening the portal.** After the uploads, call
  `validateSubmission`, poll `getSubmission`, and pull errors with
  `submissionQCResults` — so validation errors can appear in Posda's Transfer
  stage.
- **"success" no longer has to stop at "uploaded".** Polling `getSubmission`
  status gives Submitted → Released → Completed, so Posda *can* represent how
  far a transfer has got (see *`success` is not "released"*).
- ✅ **`Submit` stays a human click** *(decided 2026-10-14)*, once every piece is
  in place. It locks the submission and hands it to the concierge.
  `submissionAction` could do it; Posda does not.
- **The dbGaP list comes from the API.** After the first metadata batch,
  `downloadDBGaPLoadSheet` returns the portal's sheets, so Posda can fetch them
  rather than generate them.
- **Removals:** inside an open submission, `deleteDataRecords`; for already
  *released* data, a second `createSubmission` with `intention: "Delete"` — so
  the *Releases that remove series* question is now automatable either way.

### ✅ Direct upload — decided 2026-10-14

**The daemon uploads directly: Data Hub GraphQL API plus S3, from Go. No
Python uploader.** This reverses the 2026-09-25 decision to shell out to it,
which assumed the uploader was the only way in.

- **Metadata:** `createBatch(type: "metadata")` → PUT each TSV to its pre-signed
  URL → `updateBatch` → poll `listBatches` until `Uploaded` or `Failed`.
- **Data files:** `createBatch(type: "data file")` → `createTempCredentials` →
  upload with the AWS SDK for Go to the batch's `bucketName` / `filePrefix` →
  `updateBatch` with per-file results.

What this buys: no Python runtime in the image, a real error path instead of
exit-code 0 and a report file, no `./tmp` working-directory quirks, no version
gate, and **live per-file progress** into `transfer_file`.

What it costs — **the daemon now owns what the uploader did** (see *The
transport* below for the uploader's steps, kept as the checklist):

- **File IDs:** read them from `createBatch`'s returned `files`, and on a
  re-upload **send the stored IDs** so they are kept, not re-minted.
- **Writing IDs into the metadata:** the uploader wrote IDs into the
  file-node TSV and its child TSVs (the `-final` manifest). Here either Posda
  generates those TSVs *after* the data files are up and IDs are known, or the
  daemon fills them in. Which one is part of the workflow to work out.
- **Size and MD5 of each ZIP** for the file node, computed when the ZIP is built.
- **The heartbeat** during long uploads — in the uploader it appears to be a
  periodic `updateBatch` while uploading; confirm against the schema.
- **Field names per commons** — `retrieveFileNodeConfig(submissionID)` says
  which columns hold ID, name, size and MD5 (GC `file_id` / `file_name` /
  `file_size` / `md5sum`; CTDC `data_file_uuid` / `data_file_name` /
  `data_file_size` / `data_file_checksum_value`).
- **ZIP archive manifest** — the uploader validates ZIP contents against it
  locally. Whether Data Hub also expects it server-side is unknown.
- ⚠ **API drift.** The uploader's version check was CBIIT's way of telling
  clients the API had changed. A direct client loses that signal; breaking
  changes will surface as errors in the response body. Worth calling
  `retrieveCLIUploaderVersion` anyway, as an early warning.

## Schema

### ✅ Destinations: `gc` and `ctdc` — decided 2026-10-07

`gc` is seeded (`20260831_seed_dataset_module_lookups.sql`, id 2); `ctdc` is
added. The commons is known from routing (`recordset_destination`) onward, so a
recordset can be marked CTDC-bound, and it matches CRDC's
one-Data-Submission-per-commons and Posda's one-destination-per-transfer.
Seeds to update: `transfer_destination`, the `recordset_destination` rows, and
anything keyed on `'gc'` (`MANIFEST_FORMATS`, the transfer-mode mapping in
`lib/recordsetForm.ts`).

### ✅ `transfer_crdc` replaces `transfer_gc` — decided 2026-10-07

`transfer_gc` holds only `published` / `public` — the same unpopulated, unread
pair dropped with `transfer_wp`. Replaced, not extended; one table serves `gc`
and `ctdc`, so it needs **no commons column** (the destination is the commons).

Minimum content: **`submission_id`** — the Data Hub Data Submission ID.
Queueing should 422 without it, mirroring IDC's `BASE_URL_REQUIRED`.
*(2026-10-14: no longer necessarily curator-entered — Posda can create the
submission via `createSubmission` and store the ID itself; see *The Data Hub
API*. Doing so needs the Data Hub **`studyID`** per dataset, which has no home
yet.)*

Not yet decided: per-batch IDs (the uploader's batch `_id`s, visible in the
portal) — useful for "why is this stuck?", but the report already names them.

A migration under the post-merge rule; the backend `get/upsert_transfer_gc`
routes, `TransferGcUpdate`, and the frontend `SETTINGS_ENDPOINT` /
`settingsPayload` entries follow it.

### Where the Data Hub study ID lives *(2026-10-14)*

`createSubmission` needs a Data Hub **`studyID`** — the study the Submission
Request created, tied to the dbGaP study and approved for one commons. It
outlives every release: *"a study consists of one or more submissions (often
many more)"*.

✅ **Dataset level, one per dataset per commons.**

- **Not the transfer.** Each release's transfer opens a new Data Submission —
  that ID stays on `transfer_crdc.submission_id` — but every transfer of a
  dataset goes to the same study. Per-transfer would mean re-entering it each
  release and letting two releases drift onto different studies.
- **Not the recordset.** Recordsets are parts of one dataset; the CT and
  segmentation recordsets of a collection go to the same study. It would be
  repeated on each with nothing keeping them in step.
- **Per commons**, because a Submission Request is approved for one commons, so
  a dataset sent to both GC and CTDC would have two studies.

⚠ **Open: table or column.** Depends on whether a dataset can ever go to both GC
and CTDC. *(2026-10-14 meeting: a single recordset never goes to both. A dataset
whose **different** recordsets go to different commons was called "fine" but
has no known real case — so still open.)*

1. **`dataset_crdc_study (dataset_id, destination_id, datahub_study_id)`**, keyed
   on the pair — handles both commons. Leaning this way, since recordset routing
   already allows either.
2. **A `crdc_study_id` column on `dataset`** — simpler, only if a dataset can
   never go to both.

⚠ **2026-10-14 meeting — two different "study IDs".** Justin's understanding is
that the study's identifier is, by convention, **the TCIA short name** (CRDC
creates the study after committee review). That is likely the study's
*metadata* ID — the GC `study.study_id` / study abbreviation. The value
`createSubmission` takes is **`studies._id`** from `getMyUser`, which in the API
samples is a **UUID**. To check against the API:

- If the study abbreviation reliably equals the TCIA short name, **Posda may not
  need to store anything** — it can look the UUID up at runtime by matching the
  dataset's short name in `getMyUser { studies }`. That fits the aim of storing
  as little as possible on the Posda side.
- If not, store the UUID as above.

Suggestions, not decided:

- **Do not store the phs number.** Data Hub holds it on the study (submissions
  come back with a `dbGaPID`), so read it when generating the study TSV, and it
  cannot drift. Which fields `getMyUser { studies }` returns is unconfirmed —
  check the schema once there is a token.
- **Choose the study from a picker**, populated from `getMyUser { studies }` (the
  studies the token's account can submit to), not a free-text ID.

Either option is a schema change — a migration under the post-merge rule.

### ⚠ `transfer_file` needs the assigned file ID — proposed

Data Hub assigns every uploaded file an ID (`dg.4DFC/<uuid>`), and **that ID is
the download manifest's `drs_uri`** (see *Download manifests*). If Posda does not
store it, the download manifest cannot be built. So a column on `transfer_file`
for *the ID the destination assigned* is required, not optional. **Schema change
— flagged, not decided.** Name and whether it lives on `transfer_file` depend on
the next question.

It is also what keeps IDs **stable**. Per the Data Submission guide, re-uploading
data files **with the uploader's `-final` manifest retains the existing IDs**;
without it, new ones are generated. So on a re-run or a later release, Posda
writes the stored IDs back into the file manifest's ID column — `file_id` for GC,
`data_file_uuid` for CTDC (from each model's `semantics.file-nodes`) — and the
uploader keeps them instead of minting new ones.

### ⚠ What is a `transfer_file` row for CRDC? — open

TCIA sends **one ZIP per series** (see *What ships* — TCIA's convention, not a
CRDC requirement), and a series ZIP does not
exist in Posda. Two options:

1. **Posda builds and registers the ZIPs** as files (as it does generated
   manifests, via `file_location`). `transfer_file` stays per-file, keyed on the
   ZIP's `file_id`. Costs a second copy of every series on disk.
2. **CRDC rows are per series.** The daemon builds ZIPs in staging. Needs
   `transfer_file` to carry a series UID instead of (or beside) a `file_id`,
   which breaks its `(transfer, file_id)` key.

## What ships: one ZIP per series, imaging only

From the real GC and CTDC download manifests in `TCIA/data-retriever`:

- **Every CRDC object is `<SeriesInstanceUID>.zip`.** The retriever derives the
  series UID by stripping `.zip` from the name, so **the name is a contract**,
  not a choice.
- ⚠ **Correction (2026-10-14 meeting): CRDC does not require ZIPs.** ZIP per
  series was **Justin's choice** when sending the existing datasets: CRDC's data
  model is not built for millions of per-file records, and NBIA's download unit
  was always a series. Justin is open to changing it. So "one ZIP per series"
  is **TCIA's convention**, and the earlier wording here (*"CRDC stores one ZIP
  per series"*) overstated it. It is still the sensible default; the
  `<SeriesInstanceUID>.zip` name stays a contract **with the retriever**.
- ZIPs are built **after the release is locked**, then their size and MD5 feed
  the file-node metadata (Michael, same meeting).
- **Imaging only.** The HNSCC example pairs controlled GC imaging manifests with
  clinical files downloaded directly from TCIA (WordPress). IDC's
  imaging/clinical split does not carry over; clinical stays on the
  TCIA site.

The uploader supports ZIPs through an **`archive_manifest`** — one row per file
inside each ZIP: `archive_name, file_path, file_size, md5`. Posda already has
each member's MD5 (`file.digest`).

## The transport: `crdc-datahub-cli-uploader`, read from source

⚠ **Reference only since 2026-10-14** — the daemon uploads directly (see
*Direct upload*). The steps below are the checklist of what a direct client has
to reproduce. The CLI-specific consequences — exit code 0, `./tmp`, folder
flattening, `overwrite`, the S3 data folder — no longer apply; **the token and
60-day-login points still do**, since the API uses the same token.

Python 3.13+, `python3 src/uploader.py --config <file>`. A `type: data file` run:

1. **Version check** against Data Hub. **A newer major version makes it refuse
   to run**; a newer minor only warns. So a CBIIT release can stop every CRDC
   transfer until the bundled uploader is upgraded.
2. Fetches the submission's **file-node config** (`retrieveFileNodeConfig`) —
   which manifest columns hold name, size, MD5 and ID are set per submission,
   server-side.
3. **Recomputes the MD5 of every local file**, cached in `./tmp/md5` (keyed on
   path, size, mtime).
4. Creates a batch (GraphQL `createBatch`); **Data Hub assigns the file IDs**
   unless the manifest already carries them. *(Revised 2026-10-14: this
   previously guessed, from their UUIDv5 shape, that re-uploads might get the
   same ID. The guide settles it — IDs are kept only when the manifest supplies
   them.)*
5. Uploads to S3 with STS temp credentials, heartbeating to Data Hub.
6. Writes the IDs into a **`-final` manifest**, injects them into the **other
   metadata TSVs in the manifest's folder** ("children"), and uploads those.
7. `updateBatch` with per-file results; writes
   **`./tmp/upload-report-<timestamp>.tsv`**: `file_name, fileID, succeeded,
   errors, skipped`, …

Consequences for the daemon:

- **⚠ Always exits 0.** `controller()` returns 1 on failure but `__main__`
  discards it. Success is read from the report; **no report = failed**.
- **Run each transfer in its own working directory** — `./tmp` is relative to
  the CWD.
- **The data-file manifest *is* the file-node metadata TSV**, which is why the
  IDs land in the metadata.
- **Token is per Data Hub user, not per submission.** `token` and `submission`
  are separate keys. The daemon needs one token from an account with the
  **Submitter** role that is the creator or a **Collaborator** on every Data
  Submission it uploads to — likely a shared TCIA account. Token lifetime is
  not stated in the source, README or guides.
  ⚠ **That account is deactivated after 60 days without a portal login**, and
  an API token is not a login. Unless a token use counts (unknown), someone has
  to sign in to the daemon's account at least every 60 days, or uploads stop.
- **`overwrite: false` skips a file already in CRDC storage with the same name
  and size**; `true` replaces it. `false` is the idempotent re-run setting.
- **`data` can be an S3 URL** (an S3-to-S3 transfer). Not useful to us — Posda's
  files are on local storage — but noted.
- **Nested folders are flattened:** `a/b/x.zip` uploads as `a_b_x.zip`. Keep the
  staging folder flat so `<SeriesInstanceUID>.zip` survives unchanged.

### Item 3 — progress: per file, live *(revised 2026-10-14)*

With direct upload the daemon sees each file finish, so `transfer_file` can be
updated as it goes, the way the IDC daemon does — status and the assigned
file ID together. *(Previously: per file, but only after each uploader run,
read from its report.)*

### Item 4 — staging: like IDC, but ZIPs

Like IDC: Posda fans out at queue time and generates the TSVs; the daemon reads
them and moves bytes. Unlike IDC: the daemon (or Posda — see *What is a
`transfer_file` row*) builds `<SeriesInstanceUID>.zip` per series, with its size
and MD5. *(2026-10-14: with direct upload there is no uploader folder to stage
into; whether ZIPs are built to disk first or streamed is open — the size and
MD5 must be known before the file-node metadata is final.)*

## Download manifests — from `TCIA/data-retriever`

The TCIA download page carries a manifest for the retriever plus a link to the
CRDC page. Formats, from the retriever's parser and example manifests:

| Destination | Format | Notes |
|---|---|---|
| `gc`, `ctdc` | CSV `drs_uri,name,collection,patient_id,modality,file_size_bytes` | `drs_uri` = `drs://nci-crdc.datacommons.io/` + the Data Hub `fileID`; a bare `dg.4DFC/…` is also accepted. `name` = `<SeriesInstanceUID>.zip` |
| `idc` | one-column CSV, header **`SeriesInstanceUID`** | the retriever routes each UID via IDC's index (latest `idc-index-data` release); unmatched UIDs go to NBIA |
| `nbia` | `.tcia` still accepted; the one-column CSV is current | |

Examples: `GC_manifest_LGG-1p19qDeletion_20260326.csv`,
`CMB-PCA_drs_metadata_manifest.csv` (CTDC).

- **✅ Header bug fixed 2026-10-14:** `build_manifest` wrote the general / IDC
  manifest with header `series_instance_uid`; the retriever matches
  **`SeriesInstanceUID` or `Series UID` exactly** and would have rejected it. Now
  `SeriesInstanceUID`, with a comment saying why. The bytes change, so each
  existing manifest gets a new digest on its next regeneration and is
  re-uploaded to WordPress once.
- **IDC timing:** an IDC manifest only resolves to IDC once IDC publishes a data
  release containing those series; until then the retriever sends the UIDs to
  NBIA.
- **Downloader auth** is Gen3 DRS with each user's own API key (`--auth`). Not
  ours to store.

### Croissant — a likely future output

TCIA is piloting **Croissant JSON-LD** dataset documents
(`kirbyju/tcia-croissant-odrl`), which the retriever already reads. Each download
row carries access level, access mechanism and **downstream system** (IDC, GC,
CTDC; Aspera "transfer package" rows are skipped). That is close to Posda's
dataset release → recordsets → destinations shape, and there is a
"recordset-manifests" pilot. Nothing to do now; a natural thing for Posda to
generate from a release later.

*2026-10-14 meeting (Justin; still awaiting feedback from the Bio-Croissant
experts):*
- **One Croissant file per dataset.** It defines the record sets; record sets
  hold file objects; a file object can be a **manifest** (a spreadsheet carrying
  the detailed metadata), and the Croissant file describes the manifest's
  columns. The top-level file can serve as the "download everything" entry.
- **`isBasedOn`** links an analysis result to its source images; a Data
  Retriever PR makes downloading the `isBasedOn` data configurable. Posda's
  dataset relationships table already holds that link, so generating it is
  straightforward.
- Justin has tested the retriever downloading via Croissant; it worked.

## `success` is not "released"

A CRDC transfer can only honestly mean *batches uploaded to the Data
Submission*. Validation, submit, review and release happen in the portal. Same
gap as WordPress's `data_is_live` vs `page_is_live` (CYCLE_WIZARD, *Open
question*), wider and slower. Polling Data Hub for submission status is a
separate decision.

*(2026-10-14)* The API makes that polling straightforward: `getSubmission`
returns the status (New, In Progress, Submitted, Released, Completed, …) and
the validation statuses. Whether Posda tracks them — a column on
`transfer_crdc`, or a fetch-on-view — is still open.

## Posda decides: metadata TSVs are the real work

Per *Keep the boundary*, **Posda generates** the metadata TSVs (including the
file-node TSV the uploader uses as its manifest) and the archive manifest; the
daemon only uploads. Mapping Posda/CM data onto the two models is likely most of
the effort. *First look at the models: 2026-10-14.*

### Template mechanics (both models)

- **One TSV per node type.** The first column is **`type`** (the node name, the
  same on every row); node types are never mixed in one file. Names follow
  `GC_Data_Loading_Template_<node>_v<model>.tsv`.
- **Relationships are columns** headed `<parent node>.<parent ID property>` —
  e.g. `study.study_id` on a participant row — holding the parent's ID, like a
  foreign key.
- **Every record must link to another node.** Where a template offers several
  relationship columns, at least one must be filled.
- **CDE-mapped properties accept only caDSR permissible values**; anything else
  is a validation error and needs a PV request.
- The portal's *Available Downloads* has the data dictionary (all or required
  properties; PDF/TSV/JSON), templates, vocabularies and **example templates
  with mock data**. The same live in the models repo
  (`cache/<model>/<version>/`, including `*-file-examples.zip`).

### GC — `CDS` 13.0.1 on `prod`

24 nodes. The spine is **program → study → participant → sample → file**, with
files hanging off a participant and/or sample and everything linked up to the
study. What an imaging submission touches:

| Node | Required properties | Where Posda would get them |
|---|---|---|
| `program` | program_name, program_acronym, short/full description, external_url, short_name, institution | fixed per program — constants or CM |
| `study` | study_id, study_name, study_acronym, study_description, study_external_url, **phs_accession**, study_data_types, file_types_and_format, study_access, **study_version** | dataset + CM; `study_version` ↔ `dataset_release.release_number`?; phs not held anywhere yet |
| `consent_group` | consent_group_id, consent_group_name, consent_group_number | the dbGaP registration |
| `participant` | study_participant_id, participant_id, **sex** | `patient_id`; sex from DICOM `PatientSex` or clinical data |
| `file` | file_id, file_name, file_type, md5sum, experimental_strategy_and_data_subtypes (+ file_size, optional) | one row per **series ZIP**; size/MD5 of the ZIP |
| `image` (one per file) | study_link_id, **de_identification_method_type**, **license**, **citation_or_DOI**, species, **image_modality**, imaging_equipment_manufacturer, organ_or_tissue | license/DOI/species from CM; modality/manufacturer from DICOM headers; de-id method from TCIA's process |

Also present: `diagnosis`, `treatment`, `sample`, `genomic_info`, `proteomic`,
`pdx`, `Protocol`, `Publication`, `version` (data_version, datetime,
model_version), and imaging subtypes for non-DICOM data (`NonDICOMCTimages`,
`NonDICOMMRimages`, `NonDICOMPETimages`, `NonDICOMpathologyImages`,
`NonDICOMradiologyAllModalities`, `MultiplexMicroscopy`) — which suggests
DICOM-specific detail is expected to stay in the headers.

✅ **2026-10-14 meeting: do not populate the `NonDICOM*` nodes** — it would tell
users the data is not DICOM. **Populate only the top-level `image` and `file`
nodes.** Justin's workaround for the thin model: `file_description` = series
description + study date + modality. A Data Submission is **pinned to its
model version** unless a bump is requested.

### CTDC — 3.10.0 on `prod`

23 nodes; **clinical-trial shaped**. Spine: program → study (→ study_arm /
cohort) → participant → specimen / assay → file. Notably:

- **`file`** — data_file_name, data_file_type, data_file_description,
  data_file_format, data_file_size, data_file_checksum_value,
  data_file_checksum_type, data_file_uuid (all required); links to participant,
  specimen, diagnosis, assay or study.
- **`participant`** needs only `participant_id`, but **`demographic`** (one per
  participant) requires age_at_enrollment, race, ethnicity, sex,
  ncbi_taxonomy_id, ncbi_taxonomy_name — clinical data Posda holds only inside
  opaque clinical CSVs, if at all.
- **`study`** requires study_accession, study_name, study_short_name,
  study_description, study_type, dates_of_conduct.
- **No per-file imaging node.** Instead **`image_collection`** (name,
  image_type_included, collection_url, repository_name, collection_access) — a
  pointer to an image collection held elsewhere, e.g. TCIA/IDC.
  ⚠ That raises whether CTDC expects the **images themselves** or a **link** to
  them — yet the retriever's CTDC example (CMB-PCA) is per-series DICOM ZIPs, so
  images do go there. Worth asking.

### The mapping gaps, so far

- **phs accession and consent groups** — no home in Posda.
- **Demographics** (sex at minimum for GC; much more for CTDC) — from DICOM
  headers or clinical data; Posda does not model clinical values.
- **Per-ZIP size and MD5** — exist only once the ZIP is built, which ties
  metadata generation to the *registered ZIPs vs per-series* decision.
- **De-identification method** — a TCIA process fact, probably a constant.

## Open questions

- **Data Submission workflow** *(next)*: when Posda creates the submission, in
  what order data files, IDs and metadata go up, when validation runs, what the
  user sees before clicking Submit.
- **Data Hub study ID: table or column** — can a dataset go to both GC and
  CTDC? And does the study abbreviation equal the TCIA short name, so the UUID
  can be looked up instead of stored? See *Where the Data Hub study ID lives*.
- **Accounts (the big hurdle):** CRDC identities must be individual NIH /
  Login.gov accounts. How does an automated transfer authenticate — a curator's
  API token supplied at runtime? Something else? *(2026-10-14 meeting.)*
- **Submission Requests:** Posda generating the Excel for Ramesh to import — and
  can other accounts then submit to the study Ramesh's request creates?
- **When the commons is known** relative to the release module: set the
  destination at dataset setup, at the start of curation?
- **dbGaP:** who adds new patients to an existing phs (Ramesh?).
- **CTDC annotations:** can CTDC host them as a separate, open-access dataset?
  If so, a candidate first test.
- **First test dataset:** something a submitter is waiting on, else one from
  the candidate list.
- **ZIP per series:** keep TCIA's convention, or revisit now that it is known
  not to be a CRDC requirement?
- **dbGaP subject list:** are the portal's generated dbGaP sheets
  (`downloadDBGaPLoadSheet`) enough, or does Posda generate it? Cumulative or
  per-release delta? Where **consent groups** live in Posda. (phs: suggested to
  read from Data Hub rather than store.)
- **Releases that remove series:** they need a separate *Delete* Data
  Submission — one transfer per Data Submission, or one transfer carrying both?
- **CTDC imaging:** files, or an `image_collection` link to TCIA/IDC?
  *(2026-10-14 meeting: the CTDC trial images were submitted as files.)*
- **Imaging de-identification protocol / Risk Mitigation Form:** does TCIA have
  standing versions to submit with every request?
- **`transfer_file` for CRDC:** registered ZIPs vs per-series rows; name of the
  assigned-ID column.
- **Token:** which Data Hub account the daemon uses, its lifetime, rotation —
  and the 60-day login rule for that account.
- **API drift:** with no uploader version gate, how does the daemon notice a
  breaking Data Hub API change? (`retrieveCLIUploaderVersion` as an early
  warning?)
- **Heartbeat and archive manifest:** what the API expects from a direct client
  during long uploads, and whether ZIP contents must be declared server-side.
- **Data models:** map the required properties to Posda/CM sources (first pass
  above).
