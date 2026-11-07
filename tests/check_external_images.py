"""Read-only HEAD check of public image URLs. Does not use credentials."""
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import Request, urlopen

urls = set()


class Images(HTMLParser):
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "img" and attrs.get("src", "").startswith("https://"):
            urls.add(attrs["src"])


for file in Path(__file__).resolve().parents[1].glob("*.html"):
    Images().feed(file.read_text())


def check(url):
    try:
        with urlopen(Request(url, method="HEAD"), timeout=20) as response:
            if response.status == 200 and response.headers.get_content_type().startswith("image/"):
                return None
            return (url.rsplit("/", 1)[-1], response.status)
    except Exception as error:
        return (url.rsplit("/", 1)[-1], type(error).__name__)


with ThreadPoolExecutor(max_workers=6) as pool:
    failures = [result for result in pool.map(check, sorted(urls)) if result]
print(f"Public external images: {len(urls) - len(failures)}/{len(urls)} passed HEAD checks.")
for failure in failures:
    print(*failure)
raise SystemExit(bool(failures))
