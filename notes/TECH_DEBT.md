# TECH_DEBT.md — posda-remote-module

Running log of shortcuts taken, deferred cleanup, and known rough edges.
Each entry: what, why it was deferred, and what "done" looks like.
See [CLAUDE.md](../CLAUDE.md) for architecture and active feature checklists.

## Conventions for this file

- Add an entry whenever we knowingly defer work or take a shortcut to ship.
- Keep entries actionable: a reader should be able to pick one up cold.
- When resolved, move it to **Resolved** with the date, don't delete it.

## Open

| # | Area | Item | Why deferred | Done when |
|---|------|------|--------------|-----------|
| 1 | Types | Response/entity types are co-located per page and partly duplicated (e.g. `Dataset` redefined across List/Detail). | Fast iteration. | Shared types live in `src/types/` and pages import them. |
| 2 | Data fetching | Hand-rolled `fetch` + `useEffect` + manual loading/error state in every page. | No data lib chosen yet. | A shared `useApi`/query hook (or library) standardizes fetch, caching, and error handling. |
| 3 | API envelopes | Backend list responses have inconsistent shapes, worked around with per-page `normalize*` + `extractArray`. | Backend not yet standardized. | Backend settles on one envelope; normalizers collapse to one helper. |
| 4 | API pagination | List endpoints ignore the `page`/`limit` the frontend sends and return **all** rows (`list_response` → `{data, meta:{count}}`); tables paginate client-side and big lists load fully. | Server-side pagination not yet built. | All list endpoints window via `page`+`limit` and return `total` per the List conventions (CLAUDE.md item #10); omit ⇒ return all. |
| 5 | Release gating | A `draft` dataset release can still be given transfers and queued via the API. The cycle page hides the transfer actions while a release is a draft, but the endpoints are permissive. | Matches the existing QC-blocks-publishing precedent, which is also UI-only. Deliberate: keeps the `release_status` change to schema + display, without altering existing endpoint behavior. | `POST /datasets/releases/{id}/transfers` (and the queue transition) reject a release whose `release_status = 'draft'`, with a 422 the UI surfaces. |
| 6 | "Latest release" rule | Defined in three places: `NOT_RETRACTED` in `distribution.py` (used by `latest_only` and the cycle endpoint) and a client-side filter in `datasets/Detail.tsx`. | The dataset detail page computes latest from an already-fetched list rather than asking the server. | Detail.tsx gets its latest from the server (e.g. `?latest_only=true` or the cycle endpoint), so the rule lives in exactly one place. |
| 8 | Cycle excursions | Read-only links out of the cycle page (Open Draft, Reviews, transfer rows) navigate away with no path back to the cycle; the browser back button is the only return. There is no `return_to` convention anywhere in the app. | Form submissions were the breaking case and are now handled by in-place modals; back-button recovery works for read-only trips because `?stage=` is in the URL. | Either a validated `return_to` query param honoured by the pages reached from the cycle, or those views are reachable without leaving the cycle. |

## Resolved

- **2026-07-22 — Recordset create form duplicated.** Briefly there were two
  definitions of the recordset create form (the full page and a hand-rolled
  modal). Collapsed into `src/lib/recordsetForm.ts`, which owns the field
  configs, lookups, validation, and POST payload; `pages/recordsets/Create.tsx`
  and `components/CreateRecordsetModal.tsx` supply only layout and what happens
  after a save. Fixed a real bug in passing: **neither** form validated
  `license_id`, which is `NOT NULL`, so an omitted license failed at the
  database instead of in the UI.
