"""Display-only editorial corrections; never write changes back to microCMS."""
import re
from html.parser import HTMLParser

REPLACEMENTS = {
    "とり皮せんべぇ": "とりかわせんべぇ",
    "おつまみチャ‐シュ‐バジルソースがけ": "おつまみチャーシューバジルソースがけ",
    "冷っトマトサラダ": "冷トマトサラダ",
    "鶏の冷製きも煮": "とりの冷製きも煮",
    "砂ズリの鉄板焼き": "砂ずりの鉄板焼き",
    "株式会社 雅道": "株式会社雅道",
}
WIDTH_TABLE = str.maketrans("０１２３４５６７８９，()～", "0123456789,（）〜")


def normalize_text(text):
    text = text.translate(WIDTH_TABLE)
    for old, new in REPLACEMENTS.items():
        text = text.replace(old, new)
    text = re.sub(r"(?<=\d)\s+(?=円)", "", text)
    text = re.sub(r"([0-9][0-9,]*)円", lambda m: f"{int(m[1].replace(',', '')):,}円", text)
    # English alternatives occur only in course descriptions.
    text = re.sub(r"\s*(?<![A-Za-z])or(?![A-Za-z])\s*", " または ", text)
    return text


def normalize_data(value):
    if isinstance(value, str):
        return normalize_text(value)
    if isinstance(value, list):
        return [normalize_data(item) for item in value]
    if isinstance(value, dict):
        return {key: normalize_data(item) for key, item in value.items()}
    return value


class DisplayNormalizer(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.parts = []
        self.raw = None

    def handle_starttag(self, tag, attrs):
        source = self.get_starttag_text()
        for key, value in attrs:
            if key in ("alt", "title", "aria-label", "placeholder") and value:
                source = source.replace(value, normalize_text(value))
        self.parts.append(source)
        if tag in ("script", "style"):
            self.raw = tag

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag):
        self.parts.append(f"</{tag}>")
        if tag == self.raw:
            self.raw = None

    def handle_data(self, text):
        self.parts.append(text if self.raw else normalize_text(text))

    def handle_entityref(self, name):
        self.parts.append(f"&{name};")

    def handle_charref(self, name):
        self.parts.append(f"&#{name};")

    def handle_comment(self, text):
        self.parts.append(f"<!--{text}-->")

    def handle_decl(self, decl):
        self.parts.append(f"<!{decl}>")


def normalize_html(source):
    parser = DisplayNormalizer()
    parser.feed(source)
    parser.close()
    return "".join(parser.parts)
