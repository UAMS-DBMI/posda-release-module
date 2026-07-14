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

## Open questions / things to figure out

_(add as they come up)_

## Decisions

_(add as they're made)_

## Session notes

_(running log)_
