"""Record live TCIA datasets in the Release Module, as if each had gone
through a full release cycle at its current WordPress version.

    python scripts/etl/release_etl.py --input ETL_INPUT.csv --env prod --dataset 42113
    python scripts/etl/release_etl.py --input ETL_INPUT.csv --env prod --dataset 42113 --apply --confirm-prod

Dry run by default: only GETs, then prints every call it would make. --apply
makes them. One or more --dataset (the WP page id) per run.

Reads PAPI_TARGET and PAPI_BEARER_TOKEN from .env.<development|production>.local
at the repo root. The token must resolve to the `system` user.

The input CSV (one row per recordset) is built outside this repo; columns:
page_post_id, page_type, dataset_name, version_number, version_date,
download_post_id, recordset_name, recordset_type, destination (idc, gc, wp,
asp, nbia, ctdc or blank), source (timepoint | wp_file | empty),
activity_id, timepoint_id, expected_files.

Per dataset, in order:
   1  create the dataset                       POST /distribution/datasets
   2  create each recordset                    POST /distribution/recordsets
   3  set each recordset's destination         PUT  /distribution/recordsets/{id}/destinations/{dest}
   4  link each recordset to its WP download   POST /manager/wp-object-map
   5  link the dataset to its WP page          POST /manager/wp-object-map
   6  create the dataset release (draft)       POST /distribution/datasets/{id}/releases
   7  create each recordset draft              POST /distribution/recordsets/{id}/drafts
   7b pull a WP file into its draft            POST /distribution/recordsets/drafts/{id}/files/from-wp
   9  publish each draft, QC exempt            POST /distribution/recordsets/drafts/{id}/publish
  10  mark the dataset release released        PUT  /distribution/datasets/releases/{id}
  11  record one done transfer per destination POST /distribution/datasets/releases/{id}/transfers
  12  mark the dataset release live            PUT  /distribution/datasets/releases/{id}

Step 4 runs before step 5 on purpose: linking a download while its dataset is
already linked to a WP page makes Posda add the download to that page, a
WordPress write. The script also checks the dataset has no link before every
step-4 call, and that each download is already on its page.

Nothing here writes to WordPress. Calls are limited to ALLOWED; anything else
raises before it is sent.

Resumable: each created id is saved to the state file (--state, default
<input>.state-<env>.json) as soon as it exists, and a re-run continues from
there. A dataset with no saved state is refused if Posda already has a
dataset with its name or a link to its page or downloads.
"""

import argparse
import csv
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

import requests

REPO = Path(__file__).resolve().parents[2]
ENV_FILES = {"dev": ".env.development.local", "prod": ".env.production.local"}

QC_EXEMPT_REASON = "released before the Release Module; recorded by the release ETL"
TRANSFER_NOTES = "Transfer done before the Release Module; recorded by the release ETL"
PAGE_TYPES = {"Collection": "collection", "Analysis Result": "analysis_result"}
PAGE_DOWNLOADS = {"collection": "collection_downloads", "analysis_result": "result_downloads"}
PAGE_DOI = {"collection": "collection_doi", "analysis_result": "result_doi"}

# (method, path regex) the script may call. Everything else is refused.
ALLOWED = [
    ("GET", r"/auth/users/me"),
    ("GET", r"/v1/distribution/lookups/(dataset-types|recordset-types|destinations)"),
    ("GET", r"/v1/distribution/datasets"),
    ("GET", r"/v1/distribution/recordsets/\d+/drafts"),
    ("GET", r"/v1/manager/(collections|analysis-results|downloads)/\d+"),
    ("GET", r"/v1/manager/wp-object-map"),
    ("GET", r"/v1/manager/posda/dataset/\d+/wp-map"),
    ("POST", r"/v1/distribution/datasets"),
    ("POST", r"/v1/distribution/recordsets"),
    ("PUT", r"/v1/distribution/recordsets/\d+/destinations/\d+"),
    ("POST", r"/v1/manager/wp-object-map"),
    ("POST", r"/v1/distribution/datasets/\d+/releases"),
    ("POST", r"/v1/distribution/recordsets/\d+/drafts"),
    ("POST", r"/v1/distribution/recordsets/drafts/\d+/files/from-wp"),
    ("POST", r"/v1/distribution/recordsets/drafts/\d+/publish"),
    ("PUT", r"/v1/distribution/datasets/releases/\d+"),
    ("POST", r"/v1/distribution/datasets/releases/\d+/transfers"),
]


class EtlError(RuntimeError):
    pass


class Api:
    def __init__(self, target: str, token: str, apply: bool):
        self.base = target.rstrip("/") + "/papi"
        self.session = requests.Session()
        self.session.headers["Authorization"] = f"Bearer {token}"
        self.apply = apply

    def call(self, method: str, path: str, body=None, params=None, timeout=120, ok404=False):
        bare = path.split("?")[0]
        if not any(m == method and re.fullmatch(p, bare) for m, p in ALLOWED):
            raise EtlError(f"refused: {method} {path} is not on the allow-list")
        if method != "GET" and not self.apply:
            print(f"      would {method} {path} {json.dumps(body) if body is not None else ''}")
            return None
        r = self.session.request(method, self.base + path, json=body, params=params, timeout=timeout)
        if ok404 and r.status_code == 404:
            return None
        if not r.ok:
            raise EtlError(f"{method} {path} -> {r.status_code}: {r.text[:500]}")
        try:
            return r.json()
        except ValueError:
            raise EtlError(
                f"{method} {r.url} -> {r.status_code}, not JSON "
                f"(content-type {r.headers.get('content-type', '?')!r}): {r.text[:200]!r}"
            ) from None

    def get(self, path, **kw):
        return self.call("GET", path, **kw)


def load_env(env: str) -> tuple[str, str]:
    path = REPO / ENV_FILES[env]
    if not path.exists():
        raise EtlError(f"{path.name} not found at the repo root")
    # Read it the way Vite (dotenv) does: optional "export ", quoted values,
    # and inline "# comments" on unquoted values.
    vals = {}
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k = k.strip().removeprefix("export ").strip()
        v = v.strip()
        if v[:1] in ("'", '"', "`") and v[0] in v[1:]:
            v = v[1:v.index(v[0], 1)]
        else:
            v = v.split(" #", 1)[0].split("\t#", 1)[0].strip()
        vals[k] = v
    if not vals.get("PAPI_TARGET") or not vals.get("PAPI_BEARER_TOKEN"):
        raise EtlError(f"{path.name} needs PAPI_TARGET and PAPI_BEARER_TOKEN")
    return vals["PAPI_TARGET"], vals["PAPI_BEARER_TOKEN"]


def read_input(path: Path) -> dict[int, list[dict]]:
    by_page = defaultdict(list)
    with open(path, encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            by_page[int(r["page_post_id"])].append(r)
    return by_page


class State:
    def __init__(self, path: Path):
        self.path = path
        self.data = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}

    def ds(self, page_id: int) -> dict:
        return self.data.setdefault(str(page_id), {"recordsets": {}})

    def save(self):
        self.path.write_text(json.dumps(self.data, indent=1, sort_keys=True), encoding="utf-8")


def lookups(api: Api) -> dict:
    def ids(path, key, val):
        return {r[val]: r[key] for r in api.get(path)["data"]}
    return {
        "dataset_type": ids("/v1/distribution/lookups/dataset-types", "dataset_type_id", "dataset_type_name"),
        "recordset_type": ids("/v1/distribution/lookups/recordset-types", "recordset_type_id", "recordset_type_name"),
        "destination": ids("/v1/distribution/lookups/destinations", "destination_id", "destination_abbr"),
    }


def check_wp(api: Api, rows: list[dict]) -> dict:
    """Read-only checks against WordPress; returns what the later steps need."""
    first = rows[0]
    wp_type = PAGE_TYPES[first["page_type"]]
    endpoint = "collections" if wp_type == "collection" else "analysis-results"
    page = api.get(f"/v1/manager/{endpoint}/{first['page_post_id']}")
    problems = []
    if page.get("status") != "publish":
        problems.append(f"page status is {page.get('status')!r}")
    if str(page.get("version_number")) != str(first["version_number"]):
        problems.append(f"page is version {page.get('version_number')}, input says {first['version_number']}")
    on_page = set(page.get(PAGE_DOWNLOADS[wp_type]) or [])
    downloads = {}
    for r in rows:
        did = int(r["download_post_id"])
        if did not in on_page:
            problems.append(f"download {did} ({r['recordset_name']}) is not on the page")
        d = api.get(f"/v1/manager/downloads/{did}")
        if d.get("status") != "publish":
            problems.append(f"download {did} status is {d.get('status')!r}")
        if r["source"] == "wp_file" and not d.get("download_file"):
            problems.append(f"download {did} has no attached file to pull")
        downloads[did] = d
    if problems:
        raise EtlError("WordPress check failed: " + "; ".join(problems))
    return {"wp_type": wp_type, "page": page, "downloads": downloads}


def check_not_in_posda(api: Api, rows: list[dict], wp: dict):
    """A dataset with no saved state must not already exist in Posda."""
    name = rows[0]["dataset_name"]
    found = [d for d in api.get("/v1/distribution/datasets", params={"search": name})["data"]
             if d["dataset_name"] == name]
    if found:
        raise EtlError(f"Posda already has dataset {name!r} (id {found[0]['dataset_id']}) and there is no saved state")
    page_id = int(rows[0]["page_post_id"])
    for m in api.get("/v1/manager/wp-object-map", params={"wp_object_type": wp["wp_type"]})["data"]:
        if m["wp_object_id"] == page_id:
            raise EtlError(f"WP page {page_id} is already linked ({m['posda_object_type']} {m['posda_object_id']})")
    linked = {m["wp_object_id"]: m for m in api.get("/v1/manager/wp-object-map", params={"wp_object_type": "download"})["data"]}
    for r in rows:
        m = linked.get(int(r["download_post_id"]))
        if m:
            raise EtlError(f"WP download {r['download_post_id']} is already linked (recordset {m['posda_object_id']})")


def run_dataset(api: Api, state: State, lk: dict, rows: list[dict]):
    first = rows[0]
    page_id = int(first["page_post_id"])
    print(f"\n== {first['dataset_name']} v{first['version_number']} (WP page {page_id}, {len(rows)} recordsets)")
    for r in rows:
        if r["recordset_type"] not in lk["recordset_type"]:
            raise EtlError(f"unknown recordset type {r['recordset_type']!r}")
        if r["destination"] and r["destination"] not in lk["destination"]:
            raise EtlError(f"unknown destination {r['destination']!r} (is the ctdc migration applied?)")
    if first["page_type"] not in lk["dataset_type"]:
        raise EtlError(f"unknown dataset type {first['page_type']!r}")

    wp = check_wp(api, rows)
    s = state.ds(page_id)
    if s.get("done"):
        print("   already done (state file)")
        return
    if "dataset_id" not in s:
        check_not_in_posda(api, rows, wp)
    page = wp["page"]
    doi = (page.get(PAGE_DOI[wp["wp_type"]]) or "").strip() or None
    version = int(first["version_number"])
    released = f"{first['version_date']}T00:00:00"
    print(f"   checks passed; DOI {doi}, version {version} of {first['version_date']}")

    def save(key, value, into=s):
        if value is not None:
            into[key] = value
            state.save()

    # 1
    if "dataset_id" not in s:
        res = api.call("POST", "/v1/distribution/datasets", {
            "dataset_type_id": lk["dataset_type"][first["page_type"]],
            "dataset_name": first["dataset_name"],
            "dataset_doi": doi,
        })
        save("dataset_id", res and res["data"]["dataset_id"])
    dataset_id = s.get("dataset_id", 0)

    for r in rows:
        did = r["download_post_id"]
        rs = s["recordsets"].setdefault(did, {})
        # 2
        if "recordset_id" not in rs:
            res = api.call("POST", "/v1/distribution/recordsets", {
                "dataset_id": dataset_id,
                "recordset_type_id": lk["recordset_type"][r["recordset_type"]],
                "recordset_name": r["recordset_name"],
            })
            save("recordset_id", res and res["data"]["recordset_id"], rs)
        rid = rs.get("recordset_id", 0)
        # 3
        if r["destination"] and not rs.get("destination_set"):
            api.call("PUT", f"/v1/distribution/recordsets/{rid}/destinations/{lk['destination'][r['destination']]}",
                     {"default_display": True})
            save("destination_set", True if api.apply else None, rs)
        # 4: the dataset must not be linked yet, or Posda writes the WP page.
        if not rs.get("download_linked"):
            if api.apply and api.get(f"/v1/manager/posda/dataset/{dataset_id}/wp-map", ok404=True) is not None:
                raise EtlError("dataset is already linked to its WP page; refusing to link a download (WP write)")
            d = wp["downloads"][int(did)]
            api.call("POST", "/v1/manager/wp-object-map", {
                "posda_object_type": "recordset", "posda_object_id": rid,
                "wp_object_type": "download", "wp_object_id": int(did),
                "wp_edit_url": d.get("edit_url"), "wp_view_url": d.get("view_url"),
            })
            save("download_linked", True if api.apply else None, rs)

    # 5
    if not s.get("page_linked"):
        api.call("POST", "/v1/manager/wp-object-map", {
            "posda_object_type": "dataset", "posda_object_id": dataset_id,
            "wp_object_type": wp["wp_type"], "wp_object_id": page_id,
            "wp_edit_url": page.get("edit_url"), "wp_view_url": page.get("view_url"),
        })
        save("page_linked", True if api.apply else None)

    # 6
    if "dataset_release_id" not in s:
        res = api.call("POST", f"/v1/distribution/datasets/{dataset_id}/releases", {
            "release_number": version,
            "release_doi": doi,
            "release_notes": page.get("version_change_log") or None,
            "release_status": "draft",
        })
        save("dataset_release_id", res and res["data"]["dataset_release_id"])
    release_id = s.get("dataset_release_id", 0)

    for r in rows:
        rs = s["recordsets"][r["download_post_id"]]
        rid = rs.get("recordset_id", 0)
        # 7
        if "draft_id" not in rs:
            if api.apply and api.get(f"/v1/distribution/recordsets/{rid}/drafts")["data"]:
                raise EtlError(f"recordset {rid} already has a draft that the state file doesn't know; check it")
            body = {"draft_notes": "Recorded by the release ETL"}
            if r["source"] == "timepoint":
                body["activity_timepoint_id"] = int(r["timepoint_id"])
            res = api.call("POST", f"/v1/distribution/recordsets/{rid}/drafts", body, timeout=1800)
            if res:
                got = res["data"]["file_count"]
                if r["source"] == "timepoint" and got != int(r["expected_files"]):
                    raise EtlError(f"draft {res['data']['recordset_draft_id']} has {got} files, expected {r['expected_files']}")
            save("draft_id", res and res["data"]["recordset_draft_id"], rs)
        draft = rs.get("draft_id", 0)
        # 7b
        if r["source"] == "wp_file" and not rs.get("wp_file_pulled"):
            res = api.call("POST", f"/v1/distribution/recordsets/drafts/{draft}/files/from-wp", timeout=600)
            save("wp_file_pulled", True if res else None, rs)
        # 9
        if "recordset_release_id" not in rs:
            res = api.call("POST", f"/v1/distribution/recordsets/drafts/{draft}/publish", {
                "release_number": version,
                "release_date": released,
                "qc_exempt_reason": QC_EXEMPT_REASON,
            }, timeout=600)
            save("recordset_release_id", res and res["data"]["recordset_release_id"], rs)

    # 10
    if not s.get("released"):
        api.call("PUT", f"/v1/distribution/datasets/releases/{release_id}",
                 {"release_status": "released", "release_date": released})
        save("released", True if api.apply else None)

    # 11: one done transfer per destination, never queued.
    by_dest = defaultdict(list)
    for r in rows:
        if r["destination"]:
            by_dest[r["destination"]].append(s["recordsets"][r["download_post_id"]].get("recordset_release_id", 0))
    transfers = s.setdefault("transfers", {})
    for dest, rr_ids in sorted(by_dest.items()):
        if dest in transfers:
            continue
        res = api.call("POST", f"/v1/distribution/datasets/releases/{release_id}/transfers", {
            "destination_id": lk["destination"][dest],
            "transfer_name": f"{first['dataset_name']} v{version} {dest}",
            "transfer_status": "success",
            "transfer_notes": TRANSFER_NOTES,
            "recordset_release_ids": rr_ids,
        })
        save(dest, res and res["data"]["dataset_release_transfer_id"], transfers)

    # 12
    if not s.get("live"):
        api.call("PUT", f"/v1/distribution/datasets/releases/{release_id}", {"release_status": "live"})
        save("live", True if api.apply else None)
        save("done", True if api.apply else None)
    print("   done" if api.apply else "   dry run: nothing written")


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--input", required=True, type=Path, help="ETL input CSV")
    p.add_argument("--env", required=True, choices=sorted(ENV_FILES))
    p.add_argument("--dataset", required=True, type=int, action="append", help="WP page id (repeatable)")
    p.add_argument("--state", type=Path, help="state file (default: next to the input)")
    p.add_argument("--apply", action="store_true", help="make the calls (default: dry run)")
    p.add_argument("--confirm-prod", action="store_true", help="required with --apply on prod")
    a = p.parse_args()

    if a.apply and a.env == "prod" and not a.confirm_prod:
        print("--apply on prod needs --confirm-prod")
        return 2
    by_page = read_input(a.input)
    missing = [d for d in a.dataset if d not in by_page]
    if missing:
        print(f"not in the input: {missing}")
        return 2

    try:
        target, token = load_env(a.env)
        api = Api(target, token, a.apply)
        me = api.get("/auth/users/me")
        print(f"{a.env}: {target} as {me.get('username')}{'' if a.apply else ' (dry run)'}")
        if me.get("username") != "system":
            print("the token must resolve to the system user")
            return 2
        lk = lookups(api)
    except (EtlError, requests.RequestException) as e:
        print(f"STOPPED at startup: {e}")
        return 1
    state = State(a.state or a.input.with_suffix(f".state-{a.env}.json"))

    for page_id in a.dataset:
        try:
            run_dataset(api, state, lk, by_page[page_id])
        except (EtlError, requests.RequestException) as e:
            print(f"   STOPPED: {e}")
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
