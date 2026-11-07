"""Static site checks. No form requests or CMS writes."""
import json
import re
import sys
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = "https://ehimenomasa.com"


class Page(HTMLParser):
    def __init__(self, path):
        super().__init__()
        self.path, self.tags, self.text, self.ids, self.scripts = path, [], [], set(), []
        self.raw = None
        self.script = ""
        self.feed(path.read_text())

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.tags.append((tag, attrs))
        if attrs.get("id"):
            self.ids.add(attrs["id"])
        if tag in ("script", "style"):
            self.raw = tag
            self.script = ""
            self.ld = attrs.get("type") == "application/ld+json"

    def handle_endtag(self, tag):
        if self.raw == tag:
            if tag == "script" and self.ld:
                self.scripts.append(json.loads(self.script))
            self.raw = None

    def handle_data(self, text):
        if self.raw:
            self.script += text
        else:
            self.text.append(text)


def run():
    pages = {p.name: Page(p) for p in ROOT.glob("*.html")}
    errors = []

    def check(condition, message):
        if not condition:
            errors.append(message)

    def link(source, value):
        url = urlsplit(value)
        if url.scheme or url.netloc or not url.path:
            if not url.path and url.fragment:
                check(unquote(url.fragment) in source.ids, f"{source.path.name}: missing #{url.fragment}")
            return
        target = ROOT / unquote(url.path.lstrip("/"))
        if url.path == "/":
            target = ROOT / "index.html"
        elif not target.suffix:
            target = target.with_suffix(".html")
        check(target.is_file(), f"{source.path.name}: missing {url.path}")
        if url.fragment and target.name in pages:
            check(unquote(url.fragment) in pages[target.name].ids, f"{source.path.name}: missing {url.path}#{url.fragment}")

    for name, page in pages.items():
        source = page.path.read_text()
        canonical = ORIGIN + ("/" if name == "index.html" else "/" + page.path.stem)
        titles = [a for t, a in page.tags if t == "title"]
        metas = {a.get("name") or a.get("property"): a.get("content") for t, a in page.tags if t == "meta"}
        canonicals = [a.get("href") for t, a in page.tags if t == "link" and a.get("rel") == "canonical"]
        check(len(titles) == 1, f"{name}: title count")
        check(bool(metas.get("description")), f"{name}: missing description")
        if name == "404.html":
            check(not canonicals and not metas.get("og:url"), f"{name}: error document must not declare a canonical URL")
            check(metas.get("robots") == "noindex", f"{name}: missing noindex")
        else:
            check(canonicals == [canonical], f"{name}: canonical mismatch")
            check(metas.get("og:url") == canonical, f"{name}: og:url mismatch")
            if not name.startswith("thanks"):
                check("noindex" not in metas.get("robots", ""), f"{name}: accidental noindex")
        check(sum(t == "h1" for t, a in page.tags) == 1, f"{name}: h1 count")
        check("pages.dev" not in source, f"{name}: pages.dev remains")
        text = "".join(page.text)
        check(not re.search(r"[０-９，～()]|\d\s+円|(?<![A-Za-z])or(?![A-Za-z])", text), f"{name}: text notation remains")
        for tag, attrs in page.tags:
            for key in ("href", "src", "poster"):
                if attrs.get(key):
                    link(page, attrs[key])
            if tag == "a" and attrs.get("href", "").endswith(".html"):
                check(False, f"{name}: .html internal link")
            if attrs.get("style"):
                for asset in re.findall(r"url\(['\"]?([^)'\"]+)", attrs["style"]):
                    link(page, asset)
        for key in ("og:image", "twitter:image"):
            image = metas.get(key, "")
            check(image.startswith(ORIGIN + "/"), f"{name}: {key} origin")
            check((ROOT / urlsplit(image).path.lstrip("/")).is_file(), f"{name}: missing {key}")
        for data in page.scripts:
            check(".html" not in json.dumps(data), f"{name}: JSON-LD .html URL")
    for css in (ROOT / "css").glob("*.css"):
        if "-v1" in css.name:
            continue
        for asset in re.findall(r"url\(['\"]?([^)'\"]+)", css.read_text()):
            if not urlsplit(asset).scheme and not asset.startswith("data:"):
                check((css.parent / asset).resolve().is_file(), f"{css.name}: missing {asset}")
    sitemap = ET.parse(ROOT / "sitemap.xml")
    for loc in sitemap.findall(".//{*}loc"):
        check(loc.text.startswith(ORIGIN + "/") and not loc.text.endswith(".html"), "sitemap URL")
        check("thanks" not in loc.text, "thank-you page indexed")
    container = "骨付鳥（おや・ひな）は1つにつき50円、その他のパックは1つにつき20円"
    for name in ("index.html", "menu.html", "reserve.html", "takeout.html", "thanks.html"):
        check(container in pages[name].path.read_text(), f"{name}: container fee mismatch")
    check(not re.search(r"おやひな(?:一|1)つ50円", "".join(p.path.read_text() for p in pages.values())), "old container fee")
    print(f"Checked {len(pages)} pages, metadata, JSON-LD, links, anchors, images, CSS assets and notation.")
    if errors:
        print("\n".join(errors))
        sys.exit(1)
    print("Static checks passed.")


if __name__ == "__main__":
    run()
