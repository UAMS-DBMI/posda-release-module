# TECH_DEBT.md — posda-remote-module

Running log of shortcuts taken, deferred cleanup, and known rough edges.
Each entry: what, why it was deferred, and what "done" looks like.
See [AGENT.md](AGENT.md) for architecture and active feature checklists.

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
| 4 | API pagination | List endpoints ignore the `page`/`limit` the frontend sends and return **all** rows (`list_response` → `{data, meta:{count}}`); tables paginate client-side and big lists load fully. | Server-side pagination not yet built. | All list endpoints window via `page`+`limit` and return `total` per the List conventions (AGENT.md item #10); omit ⇒ return all. |

## Resolved

_(none yet)_
