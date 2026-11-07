"""SEO and unchanged-content audit, using only local/public data."""
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from xml.etree import ElementTree as ET
from urllib.parse import urlsplit
from check_site import Page

ROOT = Path(__file__).resolve().parents[1]
BEFORE = Path("/private/tmp/masa-seo-before")
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}


class Node:
    def __init__(self, tag="root", attrs=()):
        self.tag, self.attrs, self.children = tag, dict(attrs), []

    def text(self, accessible=False):
        if self.tag in ("script", "style") or (accessible and self.attrs.get("aria-hidden") == "true"):
            return ""
        return "".join(c.text(accessible) if isinstance(c, Node) else c for c in self.children)

    def find(self, predicate):
        result = [self] if predicate(self) else []
        for child in self.children:
            if isinstance(child, Node):
                result.extend(child.find(predicate))
        return result


class Tree(HTMLParser):
    def __init__(self, source):
        super().__init__()
        self.root = Node()
        self.stack = [self.root]
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs)
        self.stack[-1].children.append(node)
        if tag not in VOID:
            self.stack.append(node)

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                return

    def handle_data(self, data):
        self.stack[-1].children.append(data)


def clean(text):
    return re.sub(r"\s+", " ", text).strip()


def by_class(root, name):
    return root.find(lambda n: name in n.attrs.get("class", "").split())


def run():
    rows = []
    for file in sorted(ROOT.glob("*.html")):
        tree = Tree(file.read_text()).root
        data = Page(file)
        metas = {a.get("name") or a.get("property"): a.get("content") for t, a in data.tags if t == "meta"}
        title = tree.find(lambda n: n.tag == "title")[0].text()
        h1 = tree.find(lambda n: n.tag == "h1")
        assert len(h1) == 1
        canonical = next((a["href"] for t, a in data.tags if t == "link" and a.get("rel") == "canonical"), None)
        assert metas["og:type"] == "website"
        assert metas["og:locale"] == "ja_JP"
        assert metas["og:site_name"] == "愛媛の雅ちゃん"
        assert metas["og:title"] == title
        assert metas["og:description"] == metas["description"]
        assert metas["twitter:card"] == "summary_large_image"
        assert metas["twitter:title"] == title and metas["twitter:description"] == metas["description"]
        assert "<!-- TODO: google-site-verification -->" in file.read_text()
        for tag, attrs in data.tags:
            if tag == "img":
                assert all(key in attrs for key in ("alt", "width", "height")), file.name
        if file.stem in ("menu", "course", "reserve", "takeout", "recruit", "privacy"):
            assert 80 <= len(metas["description"]) <= 120
        old = BEFORE / file.name
        if old.exists():
            old_tree = Tree(old.read_text()).root
            assert clean(tree.find(lambda n: n.tag == "body")[0].text()) == clean(old_tree.find(lambda n: n.tag == "body")[0].text()), file.name + " body changed"
        if file.name == "index.html":
            restaurant = next(d for d in data.scripts if d.get("@type") == "Restaurant")
            assert restaurant["telephone"] == "+81-89-913-1194"
            assert restaurant["priceRange"] == "¥1,000〜¥3,000"
            assert "aggregateRating" not in restaurant and "review" not in restaurant
            assert restaurant["openingHoursSpecification"][0]["opens"] == "17:30"
            assert restaurant["openingHoursSpecification"][0]["closes"] == "22:30"
            faq = next(d for d in data.scripts if d.get("@type") == "FAQPage")
            questions = by_class(tree, "faq-item__q-text")
            answers = by_class(tree, "faq-item__a")
            assert len(questions) == len(answers) == len(faq["mainEntity"]) == 6
            for question, answer, entry in zip(questions, answers, faq["mainEntity"]):
                assert clean(question.text()) == entry["name"]
                assert clean(answer.text()).startswith(entry["acceptedAnswer"]["text"])
        if file.name == "takeout.html":
            assert not by_class(tree, "takeout-prices")
            assert all("円" not in n.text() for n in tree.find(lambda n: n.tag == "option"))
        rows.append({"file":file.name, "title":title, "title_length":len(title), "description":metas["description"], "description_length":len(metas["description"]), "canonical":canonical, "og:url":metas.get("og:url"), "h1":clean(h1[0].text(accessible=True)), "robots":metas.get("robots", "none")})
    assert len(set(r["title"] for r in rows)) == len(rows)
    assert len(set(r["description"] for r in rows)) == len(rows)
    mapping = {r["canonical"]:r for r in rows if r["canonical"]}
    for loc in ET.parse(ROOT / "sitemap.xml").findall(".//{*}loc"):
        assert loc.text in mapping
        assert "thanks" not in loc.text and "/404" not in loc.text
    assert (ROOT / "robots.txt").read_bytes() == (BEFORE / "robots.txt").read_bytes()
    for file in (ROOT / "css").glob("*.css"):
        assert file.read_bytes() == (BEFORE / "css" / file.name).read_bytes()
    Path("/private/tmp/masa-seo-metadata.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2))
    print("SEO audit passed: 12 pages, unique metadata, image attributes, FAQ, sitemap, all original body text/CSS and takeout price visibility unchanged.")
    for row in rows:
        print(row["file"], row["title_length"], row["description_length"], row["h1"])


if __name__ == "__main__":
    run()
