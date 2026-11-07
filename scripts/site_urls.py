"""Canonical URLs shared by generated and hand-maintained pages."""
import re
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

ORIGIN = "https://ehimenomasa.com"
PAGES = ("index", "menu", "course", "shop", "about", "recruit", "privacy", "reserve", "takeout", "thanks", "thanks-recruit")


def page_path(name):
    return "/" if name == "index" else "/" + name


def normalize_urls(source):
    for host in ("https://ehimenomasa.pages.dev", ORIGIN):
        for name in PAGES:
            source = source.replace(host + "/" + name + ".html", ORIGIN + page_path(name))
    for name in PAGES:
        source = re.sub(r'(href=["\'])' + re.escape(name) + r'\.html(?=[#?"\'])', lambda m: m[1] + page_path(name), source)
    return source


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[1]
    for file in [*root.glob("*.html"), *root.glob("templates/**/*.j2"), root / "sitemap.xml"]:
        old = file.read_text(encoding="utf-8")
        new = normalize_urls(old)
        if old != new:
            file.write_text(new, encoding="utf-8")
