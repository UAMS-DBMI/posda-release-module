# Concepts

The ideas you need before using the module. Read this before the task chapters.

## How the pieces fit

<!-- ![Entity map](images/concepts/01-entity-map.png) -->

```
Dataset
 ├─ Recordset ── Draft ──(QC review)──► Recordset release (v1, v2, …)
 │
 └─ Dataset release (v1, v2, …)
      │   carries one version of each recordset
      └─ Transfer ──► one per destination: IDC · WordPress · NBIA · Aspera · CRDC
```

## Dataset

The top-level thing you publish: a collection or an analysis result. A
dataset has a name, a type, an optional DOI, and an **Active** flag. It is
linked to one WordPress page — its *collection* page or *analysis result* page,
depending on its type.

## Recordset

One kind of data inside a dataset: radiology images, clinical data,
annotations, pathology. A dataset usually has several. Each recordset is
versioned on its own, so one can change in a release while the others stay as
they were.

Each recordset also has:

- **Destinations** — where its data is sent (IDC, NBIA, Aspera, WordPress, …).
  One destination is its **Default Display**: the one its public download page
  points at.
- **A WordPress download page** — the public page where people get it.

## Draft

A working copy of a recordset's files for the next version. You fill a draft
from an activity timepoint, a previous release, an upload, or the recordset's
WordPress file, then change it until it's right.

A draft is **open** while you're working on it and **ready** once its files
are settled. A recordset has at most one open draft at a time.

## Recordset release

A draft that has been **published**: its file list is frozen and gets the next
version number (v1, v2, …). It can't be changed afterward. To change it, make a
new draft.

## Dataset release

One numbered version of the whole dataset. It *carries* one version of each
recordset: the one published this cycle, or the previous one carried forward
unchanged. A dataset release moves through these statuses:

| Status | Meaning |
|---|---|
| **draft** | The cycle is open; what it contains can still change |
| **released** | Finalized; contents are fixed. Being transferred and published |
| **live** | Its WordPress pages are published; the release is public |
| **retracted** | Withdrawn |

## QC review

A quality check of a draft's files before it can be published. A **full**
review covers every DICOM series; a **partial** one samples a percentage of
series per modality. A draft with only non-DICOM files gets a **non-DICOM**
review, where the reviewer downloads each file and approves it.

Each series (or file) in a review is a **unit**, and is approved, rejected or
flagged. A review can be split into **slices** so several people can work on it
at once. DICOM slices are reviewed in Mirabelle.

A review becomes **complete** automatically when every unit is approved. If the
draft's files change after the review was drawn, the review goes **stale** and
must be cloned to pick up the changes.

## Transfer and destination

A **destination** is a place data is delivered to. A **transfer** sends one
dataset release to one destination. Transfers move through these statuses:

| Status | Meaning |
|---|---|
| **draft** | Created, not yet sent |
| **queued** | Handed to the delivery service. There is no un-queue |
| **in progress** | Uploading |
| **success** | Delivered |
| **failed** | Some files didn't make it; can be re-queued |

For IDC, delivery is followed by IDC's own processing. See
[Transfer](09-cycle-transfer.md).

## The release cycle

Everything above happens inside a **cycle**: the six stages that take a
dataset from "something changed" to a live release. Each dataset has at most
one cycle open at a time. See [The release cycle](04-cycle-overview.md).

## Glossary

| Term | Meaning |
|---|---|
| Activity / timepoint | A Posda activity and one saved snapshot of its files. The usual source for a draft |
| Carry forward | Including a recordset's existing version in the new dataset release, unchanged |
| Cycle | The six-stage process for one dataset release |
| Dataset | The top-level collection or analysis result being released |
| Dataset release | One numbered version of a dataset |
| Default Display | The destination a recordset's public download page points at |
| Destination | A place data is delivered: IDC, NBIA, Aspera, CRDC, WordPress |
| Draft | An editable working copy of a recordset's next version |
| Finalize | Fix a dataset release's contents (draft → released) |
| Freeze / publish (a draft) | Turn a draft into an unchangeable recordset release |
| Go live | Publish the release's WordPress pages (released → live) |
| Manifest | A file listing what a destination should fetch: IDC's dataset / imaging / clinical manifests, or the retriever manifest on a download page |
| Mirabelle | The image viewer used for DICOM QC |
| QC review | A quality check of a draft |
| Recordset | One kind of data within a dataset, versioned on its own |
| Recordset release | One published, unchangeable version of a recordset |
| Slice | One reviewer's share of a QC review |
| Stale (review) | A review drawn from a draft that has since changed |
| Transfer | Sending one dataset release to one destination |
| Unit | One thing a QC reviewer decides on: a DICOM series, or a non-DICOM file |

## Related

- [The release cycle](04-cycle-overview.md)
- [Back to contents](README.md)
