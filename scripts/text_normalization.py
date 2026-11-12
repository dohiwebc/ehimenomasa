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
    "アイス無し": "アイスなし",
}
WIDTH_TABLE = str.maketrans("０１２３４５６７８９，()～", "0123456789,（）〜")
CONTAINER_FEE = "骨付鳥（おや・ひな）は1つにつき50円、その他のパックは1つにつき20円"
WALKING_DIRECTIONS = "松山市駅の北側出口から徒歩30秒。駅前広場を通って、市駅前商店街の健勝ビル2階へお越しください。"
DEFAULT_ACCESS_TEXT = f"【電車・バスでお越しの方へ】\n{WALKING_DIRECTIONS}\n\n【お車でお越しの方へ】\n駐車場はございません。"


def normalize_access_text(text):
    # Replace the pre-renovation wording still present in older CMS records.
    text = normalize_text(text)
    text = text.replace(
        "松山市駅から徒歩30秒。松山市駅・北側出口を出て、すぐの横断歩道を渡りきると正面にございます。",
        WALKING_DIRECTIONS,
    )
    text = text.replace("左側にパチンコ・パワーステーションさん、右側にはひぎりやきさんがございます。", "")
    text = text.replace("伊予鉄高島屋さんの向かい側道路（ひぎりやきさん側）沿いにございます。ひぎりやきさんとパチンコ・パワーステーションさんの間のビル2階でございます。", "")
    text = text.replace("伊予鉄高島屋さんの向かい側道路（ひぎりやきさん側）沿い。", "")
    text = text.replace("※申し訳ありませんが、駐車場はございません。", "駐車場はございません。")
    text = text.replace("※お車でのお持ち帰り（テイクアウト）時は、1階までお持ちいたします。", "")
    return text.replace("お持ち帰り時は1階までお持ちいたします。", "").strip()


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
        if value.startswith(("https://", "http://", "//")):
            return value
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
    for old in ("おやひな一つ50円・その他パック一つ20円", "おやひな1つ50円・その他パック1つ20円", "おやひな1つ50円・その他1つ20円"):
        source = source.replace(old, CONTAINER_FEE)
    source = source.replace("テイクアウト用パック・", "容器代：")
    parser = DisplayNormalizer()
    parser.feed(source)
    parser.close()
    return "".join(parser.parts)
