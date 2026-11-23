"""Publish docs/manual to BookStack.

One-way: the repo is the source of truth. Edits made in BookStack are
overwritten on the next sync.

    python scripts/sync_bookstack.py           # dry run: list what would change
    python scripts/sync_bookstack.py --apply   # write to BookStack

Reads BOOKSTACK_URL, BOOKSTACK_TOKEN_ID and BOOKSTACK_TOKEN_SECRET from
.env.bookstack.local at the repo root.

Chapters come from the Contents table in docs/manual/README.md. Each becomes a
page named after its H1, grouped into the BookStack chapters in GROUPS. Pages
and chapters are matched by name, so renaming an H1 creates a new page and
leaves the old one behind. Images are uploaded to the page's gallery under
"<path> <hash>", so unchanged images aren't re-uploaded.
"""

import argparse
import hashlib
import html
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import quote

import requests

REPO = Path(__file__).resolve().parent.parent
MANUAL = REPO / "docs" / "manual"
ENV_FILE = REPO / ".env.bookstack.local"
BOOK_SLUG = "posda-release-module"

# BookStack chapter name -> manual chapter numbers, in order.
GROUPS: list[tuple[str, list[str]]] = [
    ("Essentials", ["00", "01", "02", "03"]),
    ("The release cycle", ["04", "05", "06", "07", "08", "09", "10"]),
    ("Reference", ["11", "12", "13"]),
]

# BookStack page names that differ from the chapter's H1, so a page isn't
# named the same as the BookStack chapter it sits in.
PAGE_NAMES = {"04": "Overview"}

CALLOUTS = {"Note": "info", "Tip": "success", "Warning": "warning"}

CHAPTER_LINK = re.compile(r"(?<!!)\[([^\]]+)\]\(([^)\s]+)\)")
IMAGE_LINK = re.compile(r"!\[([^\]]*)\]\((images/[^)\s]+)\)")
COMMENT = re.compile(r"[ \t]*<!--.*?-->", re.DOTALL)
CONTENTS_ROW = re.compile(r"^\|\s*(\d\d)\s*\|\s*\[[^\]]+\]\((\d\d-[\w-]+\.md)\)")


class SyncError(RuntimeError):
    """A BookStack request failed or the manual isn't in the expected shape."""


@dataclass
class ManualPage:
    number: str
    file: str
    name: str
    body: str
    images: list[str]


@dataclass
class PageTarget:
    manual: ManualPage
    chapter_name: str
    page_id: int | None = None
    slug: str | None = None
    chapter_id: int | None = None
    image_urls: dict[str, str] = field(default_factory=dict)


# --- Reading the manual --------------------------------------------------------


def load_env(path: Path) -> dict[str, str]:
    if not path.exists():
        raise SyncError(f"{path.name} not found at the repo root")
    env: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            env[key.strip()] = value.strip()
    missing = [
        k
        for k in ("BOOKSTACK_URL", "BOOKSTACK_TOKEN_ID", "BOOKSTACK_TOKEN_SECRET")
        if not env.get(k)
    ]
    if missing:
        raise SyncError(f"{path.name} is missing: {', '.join(missing)}")
    return env


def read_manual() -> list[ManualPage]:
    pages = []
    for line in (MANUAL / "README.md").read_text(encoding="utf-8").splitlines():
        match = CONTENTS_ROW.match(line)
        if match:
            pages.append(read_page(match.group(1), match.group(2)))
    if not pages:
        raise SyncError("no chapters found in the README Contents table")
    return pages


def read_page(number: str, file: str) -> ManualPage:
    text = COMMENT.sub("", (MANUAL / file).read_text(encoding="utf-8"))
    first, _, body = text.partition("\n")
    if not first.startswith("# "):
        raise SyncError(f"{file} doesn't start with an H1")
    images = list(dict.fromkeys(m.group(2) for m in IMAGE_LINK.finditer(body)))
    name = PAGE_NAMES.get(number, first[2:].strip())
    return ManualPage(number, file, name, body.lstrip("\n"), images)


# --- Converting to BookStack markdown ------------------------------------------


def github_slug(heading: str) -> str:
    slug = re.sub(r"[^\w\- ]", "", heading.strip().lower())
    return slug.replace(" ", "-")


def bookstack_anchor(heading: str) -> str:
    """The id BookStack gives a heading: lowercased, spaces to dashes, 20 chars,
    URL-encoded. Checked against the published pages after --apply."""
    text = re.sub(r"[*`]", "", heading.strip().lower())
    return quote("bkmrk-" + re.sub(r"\s+", "-", text)[:20], safe="-_.")


def heading_anchors(page: ManualPage) -> dict[str, str]:
    anchors = {}
    for match in re.finditer(r"^#{2,6}\s+(.+)$", page.body, re.MULTILINE):
        anchors[github_slug(match.group(1))] = bookstack_anchor(match.group(1))
    return anchors


def rewrite_links(
    body: str,
    current: str,
    targets: dict[str, PageTarget],
    page_url: dict[str, str],
    book_url: str,
) -> str:
    def replace(match: re.Match[str]) -> str:
        text, url = match.group(1), match.group(2)
        if re.match(r"^[a-z]+:", url):
            return match.group(0)
        file, _, anchor = url.partition("#")
        if file == "README.md":
            return f"[{text}]({book_url})"
        if file and file not in targets:
            print(f"  ! link to {url} isn't a manual chapter; left as is")
            return match.group(0)
        file = file or current
        new_url = page_url[file] if file != current else ""
        if anchor:
            anchors = heading_anchors(targets[file].manual)
            if anchor not in anchors:
                print(f"  ! no heading for #{anchor} in {file}")
            new_url += "#" + anchors.get(anchor, anchor)
        return f"[{text}]({new_url})"

    return CHAPTER_LINK.sub(replace, body)


def inline_html(text: str) -> str:
    out = html.escape(text, quote=False)
    out = re.sub(r"`([^`]+)`", r"<code>\1</code>", out)
    out = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", r'<a href="\2">\1</a>', out)
    out = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", out)
    return re.sub(r"(?<!\w)\*(.+?)\*(?!\w)", r"<em>\1</em>", out)


def convert_callouts(body: str) -> str:
    lines = body.split("\n")
    out: list[str] = []
    i = 0
    while i < len(lines):
        match = re.match(r"^> \*\*(\w+):\*\*\s*(.*)$", lines[i])
        if not match or match.group(1) not in CALLOUTS:
            out.append(lines[i])
            i += 1
            continue
        text = [match.group(2)]
        i += 1
        while i < len(lines) and lines[i].startswith(">"):
            text.append(lines[i].lstrip(">").strip())
            i += 1
        css = CALLOUTS[match.group(1)]
        out.append(f'<p class="callout {css}">{inline_html(" ".join(text))}</p>')
    return "\n".join(out)


def build_markdown(target: PageTarget, links: dict[str, Any]) -> str:
    body = IMAGE_LINK.sub(
        lambda m: f"![{m.group(1)}]({target.image_urls[m.group(2)]})",
        target.manual.body,
    )
    body = rewrite_links(body, target.manual.file, **links)
    return convert_callouts(body)


# --- BookStack API -------------------------------------------------------------


class BookStack:
    def __init__(self, base_url: str, token_id: str, secret: str) -> None:
        self.base = base_url.rstrip("/")
        self.session = requests.Session()
        self.session.headers["Authorization"] = f"Token {token_id}:{secret}"

    def call(self, method: str, path: str, **kwargs: Any) -> Any:
        response = self.session.request(method, f"{self.base}/api/{path}", **kwargs)
        if not response.ok:
            raise SyncError(
                f"{method} {path} -> {response.status_code}: {response.text[:300]}"
            )
        return response.json() if response.content else None

    def book(self, slug: str) -> dict[str, Any]:
        found = self.call("GET", "books", params={"filter[slug]": slug})["data"]
        if not found:
            raise SyncError(f"book '{slug}' not found (or the token can't see it)")
        return self.call("GET", f"books/{found[0]['id']}")

    def gallery(self, page_id: int) -> list[dict[str, Any]]:
        params = {"filter[uploaded_to]": page_id, "count": 500}
        return self.call("GET", "image-gallery", params=params)["data"]

    def upload_image(self, page_id: int, name: str, path: Path) -> str:
        with path.open("rb") as handle:
            image = self.call(
                "POST",
                "image-gallery",
                data={"type": "gallery", "uploaded_to": page_id, "name": name},
                files={"image": (path.name, handle, "image/png")},
            )
        return image["url"]

    def page_url(self, book_slug: str, page_slug: str) -> str:
        return f"{self.base}/books/{book_slug}/page/{page_slug}"


# --- Sync ----------------------------------------------------------------------


def image_name(relpath: str) -> str:
    digest = hashlib.sha256((MANUAL / relpath).read_bytes()).hexdigest()[:10]
    return f"{relpath} {digest}"


def match_existing(book: dict[str, Any], targets: list[PageTarget]) -> dict[str, int]:
    """Fill in ids of pages that already exist; return chapter name -> id."""
    chapters: dict[str, int] = {}
    pages: dict[str, dict[str, Any]] = {}
    for item in book.get("contents", []):
        if item["type"] == "chapter":
            chapters[item["name"]] = item["id"]
            for page in item.get("pages", []):
                pages[page["name"]] = {**page, "chapter_id": item["id"]}
        elif item["type"] == "page":
            pages[item["name"]] = {**item, "chapter_id": None}
    for target in targets:
        existing = pages.get(target.manual.name)
        if existing:
            target.page_id = existing["id"]
            target.slug = existing["slug"]
            target.chapter_id = existing["chapter_id"]
    return chapters


def plan_targets(pages: list[ManualPage]) -> list[PageTarget]:
    by_number = {p.number: p for p in pages}
    targets = []
    for chapter_name, numbers in GROUPS:
        for number in numbers:
            if number not in by_number:
                raise SyncError(f"chapter {number} is in GROUPS but not the README")
            targets.append(PageTarget(by_number.pop(number), chapter_name))
    if by_number:
        raise SyncError(f"chapters not in GROUPS: {', '.join(sorted(by_number))}")
    return targets


def sync_images(api: BookStack, target: PageTarget, apply: bool) -> None:
    existing = api.gallery(target.page_id) if target.page_id else []
    by_name = {img["name"]: img for img in existing}
    for relpath in target.manual.images:
        name = image_name(relpath)
        if name in by_name:
            target.image_urls[relpath] = by_name[name]["url"]
            continue
        stale = [img for img in existing if img["name"].split(" ")[0] == relpath]
        print(f"  {'replace' if stale else 'upload'} image {relpath}")
        if not apply:
            target.image_urls[relpath] = relpath
            continue
        target.image_urls[relpath] = api.upload_image(
            target.page_id, name, MANUAL / relpath
        )
        for img in stale:
            api.call("DELETE", f"image-gallery/{img['id']}")


def verify_anchors(api: BookStack, targets: list[PageTarget]) -> None:
    """Check every #bkmrk- anchor we linked to exists on the published page."""
    page_html = {
        t.slug: api.call("GET", f"pages/{t.page_id}")["html"] for t in targets
    }
    links = set()
    for content in page_html.values():
        links.update(re.findall(r'/page/([\w-]+)#(bkmrk-[^"\s]+)', content))
    for slug, anchor in sorted(links):
        if f'id="{anchor}"' not in page_html.get(slug, ""):
            print(f"  ! page {slug}: no heading with id {anchor}")


def sync(apply: bool) -> None:
    env = load_env(ENV_FILE)
    api = BookStack(
        env["BOOKSTACK_URL"], env["BOOKSTACK_TOKEN_ID"], env["BOOKSTACK_TOKEN_SECRET"]
    )
    book = api.book(BOOK_SLUG)
    book_url = f"{api.base}/books/{book['slug']}"
    targets = plan_targets(read_manual())
    chapters = match_existing(book, targets)
    print(f"Book: {book['name']} ({book_url})")
    print("Dry run, nothing will be written.\n" if not apply else "")

    for chapter_name, _ in GROUPS:
        if chapter_name not in chapters:
            print(f"create chapter '{chapter_name}'")
            if apply:
                body = {"book_id": book["id"], "name": chapter_name}
                created = api.call("POST", "chapters", json=body)
                chapters[chapter_name] = created["id"]

    for target in targets:
        if target.page_id is None:
            print(f"create page '{target.manual.name}' in '{target.chapter_name}'")
            if apply:
                created = api.call(
                    "POST",
                    "pages",
                    json={
                        "chapter_id": chapters[target.chapter_name],
                        "name": target.manual.name,
                        "markdown": "Syncing…",
                    },
                )
                target.page_id, target.slug = created["id"], created["slug"]
                target.chapter_id = chapters[target.chapter_name]

    page_url = {
        t.manual.file: api.page_url(book["slug"], t.slug or github_slug(t.manual.name))
        for t in targets
    }
    links = {
        "targets": {t.manual.file: t for t in targets},
        "page_url": page_url,
        "book_url": book_url,
    }
    for target in targets:
        print(f"update page '{target.manual.name}' ({target.manual.file})")
        sync_images(api, target, apply)
        markdown = build_markdown(target, links)
        if apply:
            api.call(
                "PUT",
                f"pages/{target.page_id}",
                json={
                    "name": target.manual.name,
                    "markdown": markdown,
                    "chapter_id": chapters[target.chapter_name],
                },
            )

    if apply:
        print("\nChecking section links…")
        verify_anchors(api, targets)
        print(f"Done: {book_url}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--apply", action="store_true", help="write to BookStack")
    args = parser.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    try:
        sync(args.apply)
    except SyncError as error:
        sys.exit(f"error: {error}")


if __name__ == "__main__":
    main()
