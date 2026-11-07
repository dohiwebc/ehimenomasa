"""Build-time metadata housekeeping; leaves visible page content untouched."""
import subprocess
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
JST = ZoneInfo("Asia/Tokyo")


def modification_date(file):
    name = str(file.relative_to(ROOT))
    try:
        committed = subprocess.run(["git", "show", f"HEAD:{name}"], cwd=ROOT, capture_output=True, check=True).stdout
        if committed != file.read_bytes():
            return datetime.now(JST).date().isoformat()
        stamp = subprocess.run(["git", "log", "-1", "--format=%cI", "--", name], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()
        if stamp:
            return datetime.fromisoformat(stamp).astimezone(JST).date().isoformat()
    except (OSError, subprocess.CalledProcessError):
        pass
    return datetime.fromtimestamp(file.stat().st_mtime, JST).date().isoformat()


def finish_site():
    marker = "<!-- TODO: google-site-verification -->"
    for file in ROOT.glob("*.html"):
        source = file.read_text(encoding="utf-8")
        if marker not in source:
            file.write_text(source.replace("</head>", "  " + marker + "\n</head>"), encoding="utf-8")

    namespace = "http://www.sitemaps.org/schemas/sitemap/0.9"
    ET.register_namespace("", namespace)
    sitemap = ROOT / "sitemap.xml"
    tree = ET.parse(sitemap)
    for item in tree.getroot():
        loc = item.find(f"{{{namespace}}}loc")
        pathname = urlsplit(loc.text).path
        file = ROOT / ("index.html" if pathname == "/" else pathname.lstrip("/") + ".html")
        lastmod = item.find(f"{{{namespace}}}lastmod")
        lastmod.text = modification_date(file)
    ET.indent(tree, space="  ")
    tree.write(sitemap, encoding="utf-8", xml_declaration=True)


if __name__ == "__main__":
    finish_site()
