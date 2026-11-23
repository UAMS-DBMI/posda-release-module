# Screenshot shot list

Every screenshot slot in the manual, grouped by the state the data has to be
in. Work through the passes in order: each pass leaves the training dataset in
the state the next one needs, so one run through a release cycle covers
everything.

**Settings for every shot:** light theme, browser window 1440 × 900, training
dataset only. Crop to the part named in the **Show** column. Save to
`images/<file>` and then uncomment the matching slot in the chapter.

Tick a row off when its file exists and its slot is uncommented.

## Pass 1 — Anywhere, nothing changes

| Done | File | Page | Show |
|---|---|---|---|
| [x] | `getting-started/03-navbar.png` | Any page | The navbar, full width, with **Logged in as:** visible |
| [x] | `datasets/01-list.png` | **Datasets** | Search, Type filter, **active_only**, a few rows with stars |
| [x] | `getting-started/05-favorite-star.png` | **Datasets** | One row's star, filled, close up |
| [x] | `datasets/02-create.png` | **Datasets** → **New Dataset** | The form, filled in but **not** submitted |
| [x] | `transfers/01-list.png` | `/release/transfers` | The list with a few rows |
| [x] | `getting-started/02-not-logged-in.png` | `/release/` in a private window, without logging into Posda | The *You're not logged into Posda* notice and **Reload** |

## Pass 2 — No cycle in progress

The training dataset's last release is live, so the banner offers **Start
Next Cycle**.

| Done | File | Page | Show |
|---|---|---|---|
| [x] | `cycle-overview/03-start-next-cycle.png` | Cycle view | The banner with **Start Next Cycle** |
| [x] | `datasets/03-detail.png` | **Dataset Details** | Header, Recordsets and Releases tables |
| [x] | `recordsets/02-detail.png` | Details → a recordset | Destinations, Drafts and Releases sections |
| [x] | `cycle-setup/01-overview.png` | **Setup** tab | The recordsets table and the dataset's WordPress pill |
| [x] | `recordsets/01-create.png` | Setup → **Create a Recordset** | The dialog, filled in; cancel |
| [x] | `cycle-setup/02-destination.png` | Setup → **+** on a recordset's destinations | The New Destination dialog; cancel |
| [x] | `cycle-setup/03-wp-link.png` | Setup → link icon | Link WordPress dialog on **Link Existing**, with results; cancel |

Then click **Start Next Cycle**.

## Pass 3 — Assemble

| Done | File | Page | Show |
|---|---|---|---|
| [x] | `cycle-assemble/02-create-draft.png` | **Assemble** → **Create Draft** | The dialog with the source choices |
| | | | *Create a draft for at least one recordset, with at least 4 DICOM series* |
| [x] | `cycle-assemble/03-manage.png` | Assemble → **Manage** on the draft | Manage Files on the **Add** tab |
| [x] | `recordsets/03-draft.png` | Recordset page → the draft | Draft page with **Mark Ready** |
| [x] | `cycle-assemble/01-table.png` | Assemble | The table with one draft open and one recordset carried forward |

Mark the draft ready.

## Pass 4 — Mid-cycle overview

Best taken now, while the tabs show a mix of done, active and pending.

| Done | File | Page | Show |
|---|---|---|---|
| [x] | `cycle-overview/01-cycle-view.png` | Cycle view | Header, banner and tabs together |
| [x] | `cycle-overview/02-banner.png` | Cycle view | The banner alone, with its **Next:** button |
| [x] | `cycle-overview/04-tabs.png` | Cycle view | The six tabs, close up |

## Pass 5 — Verify

| Done | File | Page | Show |
|---|---|---|---|
| [x] | `cycle-verify/02-new-review.png` | **Verify** → **Start QC** | The dialog set to **Partial**, 50%; then create it |
| [x] | `cycle-verify/04-split.png` | Verify → **Manage** → **Claim**, then **Split** | Split Slice dialog, **Split into 2**, new slice **Unclaimed**; then split |
| [x] | `qc/01-queue.png` | **QC** in the navbar | The pickup queue with the unclaimed slice |
| [x] | `getting-started/01-dashboard.png` | Dashboard | The whole page: My QC with your slice, favorites |
| [x] | `getting-started/04-dashboard-sections.png` | Dashboard | My QC and the two favorites tables |
| [x] | `qc/02-review.png` | Click the review number on the dashboard | Review page with the slices table |
| [x] | `cycle-verify/01-table.png` | Verify, row expanded | The review, its slices, and the **Publish Gate** column |

For the next shot, make the review stale: **Assemble** → **Reopen** → remove
one series → **Mark Ready**.

| Done | File | Page | Show |
|---|---|---|---|
| [x] | `cycle-verify/05-sync.png` | Verify → **Manage** → **Sync** | The Sync dialog with its counts; then sync |

Finish the review so the gate shows **Ready**.

| Done | File | Page | Show |
|---|---|---|---|
| [x] | `cycle-verify/03-non-dicom.png` | Verify → **Review** on a non-DICOM slice | Review Non-DICOM Files with its file list. *Needs a recordset whose draft has only non-DICOM files; skip if the training dataset has none* |

## Pass 6 — Bundle

| Done | File | Page | Show |
|---|---|---|---|
| [x] | `cycle-bundle/02-publish.png` | **Bundle** → **Publish** | The dialog with Release Notes; then publish |
| [x] | `cycle-bundle/01-overview.png` | Bundle | The recordset table and **Finalize Release** |
| [x] | `cycle-bundle/03-finalize.png` | Bundle → **Finalize Release** | The summary and notes; then finalize |

## Pass 7 — Transfer

| Done | File | Page | Show |
|---|---|---|---|
| [x] | `cycle-transfer/01-table.png` | **Transfer** | One row per destination |
| [x] | `cycle-transfer/02-manage.png` | Transfer → **Manage** on the IDC row | The Manage dialog with its manifests |
| [x] | `cycle-transfer/03-queue.png` | Transfer → **Queue Transfer** | The confirmation. **Cancel** unless the training environment's IDC target is safe to send to |
| [x] | `transfers/02-detail.png` | `/release/transfers` → the new transfer | The transfer page |

## Pass 8 — Disseminate

| Done | File | Page | Show |
|---|---|---|---|
| [x] | `cycle-disseminate/01-overview.png` | **Disseminate** | The Download column and **Publish All & Go Live** |
| [x] | `cycle-disseminate/02-manage.png` | Disseminate → **Manage** on a download | The download Manage dialog with **Generate** |

## Not a screenshot

| File | What it is |
|---|---|
| `concepts/01-entity-map.png` | A drawn diagram of dataset → recordset → draft → release → transfer. The text diagram in [Concepts](01-concepts.md) stands in until it's drawn |
