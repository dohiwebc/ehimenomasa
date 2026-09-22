#!/usr/bin/env python3
"""microCMS から静的 HTML を生成する。"""
from __future__ import annotations

import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from cms_utils import (  # noqa: E402
    CATEGORY_IDS,
    CATEGORY_ORDER,
    fetch_all,
    fetch_one,
    format_price_course,
    format_price_jp,
    load_env,
    media_url,
    tel_href,
)

try:
    from jinja2 import Environment, FileSystemLoader, select_autoescape
except ImportError:
    sys.exit("jinja2 が必要です: .venv/bin/pip install -r requirements.txt")


def chunk_rows(items: list, pattern: list[int] | None = None) -> list[list]:
    if not items:
        return []
    if pattern is None:
        # 名物: 先頭2 + 残りを3つずつ
        rows = []
        if len(items) <= 2:
            return [items]
        rows.append(items[:2])
        rest = items[2:]
        for i in range(0, len(rest), 3):
            rows.append(rest[i : i + 3])
        return rows
    rows = []
    i = 0
    pi = 0
    while i < len(items):
        n = pattern[pi] if pi < len(pattern) else 3
        rows.append(items[i : i + n])
        i += n
        pi += 1
    return rows


def normalize_menu_item(raw: dict) -> dict:
    cats = raw.get("category") or []
    cat = cats[0] if cats else "その他"
    return {
        "name": raw.get("name") or "",
        "price": raw.get("price"),
        "price_label": format_price_jp(raw.get("price")),
        "price_note": raw.get("priceNote") or "",
        "place": raw.get("place") or "",
        "image": media_url(raw.get("image")),
        "category": cat,
        "sortOrder": raw.get("sortOrder") or 0,
        "showMeibutsu": bool(raw.get("showMeibutsu")),
        "showPick": bool(raw.get("showPick")),
        "topOrder": raw.get("topOrder") or 0,
    }


def normalize_course(raw: dict) -> dict:
    desc = raw.get("description") or ""
    lines = [ln.strip() for ln in desc.splitlines() if ln.strip()]
    return {
        "name": raw.get("name") or "",
        "price_label": format_price_course(raw.get("price")),
        "lead": raw.get("lead") or "",
        "lines": lines,
        "image": media_url(raw.get("image")),
        "sortOrder": raw.get("sortOrder") or 0,
        "notes": raw.get("notes") or "",
    }


def group_menu(items: list[dict]) -> list[dict]:
    by_cat: dict[str, list] = {c: [] for c in CATEGORY_ORDER}
    extra: dict[str, list] = {}
    for it in sorted(items, key=lambda x: x["sortOrder"]):
        cat = it["category"]
        if cat in by_cat:
            by_cat[cat].append(it)
        else:
            extra.setdefault(cat, []).append(it)
    categories = []
    for name in CATEGORY_ORDER:
        if not by_cat[name]:
            continue
        categories.append(
            {
                "name": name,
                "id": CATEGORY_IDS.get(name, ""),
                "dishes": by_cat[name],
            }
        )
    for name, lst in extra.items():
        categories.append({"name": name, "id": "", "dishes": lst})
    return categories


def replace_marked(html: str, name: str, fragment: str) -> str:
    start = f"<!-- cms:{name} -->"
    end = f"<!-- /cms:{name} -->"
    if start not in html or end not in html:
        raise RuntimeError(f"index.html に {start} ... {end} がありません")
    pattern = re.compile(re.escape(start) + r".*?" + re.escape(end), re.S)
    return pattern.sub(start + "\n" + fragment.rstrip() + "\n" + end, html)


def patch_contacts(html: str, phone: str, tel: str, site: dict, access: dict) -> str:
    # 電話表記のざっくり置換（既存の固定番号 → CMS）
    html = html.replace("089-913-1194", phone)
    html = html.replace("tel:0899131194", tel)
    if site.get("lineUrl"):
        html = re.sub(
            r'href="https://line\.me/[^"]+"',
            f'href="{site["lineUrl"]}"',
            html,
        )
    if site.get("instagramUrl"):
        html = re.sub(
            r'href="https://www\.instagram\.com/ehimenomasa/?"',
            f'href="{site["instagramUrl"]}"',
            html,
        )
    if site.get("storesUrl"):
        html = re.sub(
            r'href="https://ehime-masachan\.stores\.jp/?"',
            f'href="{site["storesUrl"]}"',
            html,
        )
    if site.get("hotpepperUrl"):
        html = html.replace(
            "https://www.hotpepper.jp/strJ004612520/",
            site["hotpepperUrl"],
        )
    if access.get("address"):
        html = html.replace(
            "〒790-0012 愛媛県松山市湊町5丁目4-2 健勝ビル2階",
            access["address"],
        )
    return html


def main():
    env = load_env()
    service_id = env.get("MICROCMS_SERVICE_ID")
    api_key = env.get("MICROCMS_API_KEY") or env.get("MICROCMS_WRITE_API_KEY")
    if not service_id or not api_key:
        sys.exit("MICROCMS_SERVICE_ID / MICROCMS_API_KEY が必要です")

    css_v = datetime.now(timezone.utc).strftime("%Y%m%d%H%M")
    print("fetching microCMS…")
    menu_raw = fetch_all("menu", api_key, service_id)
    course_raw = fetch_all("course", api_key, service_id)
    about_raw = fetch_one("about", api_key, service_id)
    access_raw = fetch_one("access", api_key, service_id)
    site_raw = fetch_one("site", api_key, service_id)

    menu_items = [normalize_menu_item(x) for x in menu_raw]
    courses = sorted([normalize_course(x) for x in course_raw], key=lambda x: x["sortOrder"])
    # コース写真はローカル画像を優先（CDN差し替えでデザイン崩れを防ぐ）
    local_course_images = {
        "満喫コース": "assets/images/site/course-mankitsu.webp",
        "親雛コース": "assets/images/site/course-oyahina.webp",
        "揚げ鳥コース": "assets/images/site/course-agedori.webp",
    }
    for c in courses:
        if c["name"] in local_course_images:
            c["image"] = local_course_images[c["name"]]

    categories = group_menu(menu_items)

    meibutsu = sorted(
        [x for x in menu_items if x["showMeibutsu"]],
        key=lambda x: x["topOrder"] or x["sortOrder"],
    )
    picks = sorted(
        [x for x in menu_items if x["showPick"]],
        key=lambda x: x["topOrder"] or x["sortOrder"],
    )

    about = {
        "kicker": about_raw.get("kicker") or "",
        "title": about_raw.get("title") or "雅ちゃんについて",
        "lead": about_raw.get("lead") or "",
        "body": about_raw.get("body") or "",
        "ownerName": about_raw.get("ownerName") or "",
        "ownerPhoto": media_url(about_raw.get("ownerPhoto")),
        "ownerMessage": about_raw.get("ownerMessage") or "",
    }
    access = {
        "shopName": access_raw.get("shopName") or "",
        "address": access_raw.get("address") or "",
        "accessText": access_raw.get("accessText") or "",
        "hours": access_raw.get("hours") or "",
        "holiday": access_raw.get("holiday") or "",
        "phone": access_raw.get("phone") or site_raw.get("phone") or "",
        "mapEmbed": access_raw.get("mapEmbed") or "",
        "seatInfo": access_raw.get("seatInfo") or "",
    }
    site = {
        "phone": site_raw.get("phone") or access.get("phone") or "",
        "hotpepperUrl": site_raw.get("hotpepperUrl") or "",
        "lineUrl": site_raw.get("lineUrl") or "",
        "instagramUrl": site_raw.get("instagramUrl") or "",
        "storesUrl": site_raw.get("storesUrl") or "",
        "recruitOpen": bool(site_raw.get("recruitOpen", True)),
        "recruitTitle": site_raw.get("recruitTitle") or "スタッフ募集",
        "recruitBody": site_raw.get("recruitBody") or "",
        "recruitCond": site_raw.get("recruitCond") or "",
        "privacyBody": site_raw.get("privacyBody") or "",
    }
    tel = tel_href(site["phone"])
    # ギャラリーはコラージュ比率がデザインのため静的（CMS の gallery は使わない）

    jinja = Environment(
        loader=FileSystemLoader(str(ROOT / "templates")),
        autoescape=select_autoescape(["html", "xml"]),
    )
    ctx = {
        "css_v": css_v,
        "site": site,
        "access": access,
        "tel": tel,
        "categories": categories,
        "courses": courses,
        "about": about,
        "meibutsu_rows": chunk_rows(meibutsu),
        "picks": picks,
    }

    pages = {
        "menu.html": "menu.html.j2",
        "course.html": "course.html.j2",
        "about.html": "about.html.j2",
        "shop.html": "shop.html.j2",
        "recruit.html": "recruit.html.j2",
        "privacy.html": "privacy.html.j2",
    }
    for out_name, tmpl in pages.items():
        html = jinja.get_template(tmpl).render(**ctx)
        (ROOT / out_name).write_text(html, encoding="utf-8")
        print("wrote", out_name)

    # index の CMS 区間を差し替え
    index_path = ROOT / "index.html"
    index_html = index_path.read_text(encoding="utf-8")
    # マーカーが無ければ挿入用に一度用意を試みる（既存構造を検出）
    if "<!-- cms:meibutsu -->" not in index_html:
        index_html = ensure_index_markers(index_html)

    index_html = replace_marked(
        index_html, "meibutsu", jinja.get_template("partials/meibutsu.j2").render(**ctx)
    )
    index_html = replace_marked(
        index_html, "picks", jinja.get_template("partials/picks.j2").render(**ctx)
    )
    index_html = replace_marked(
        index_html, "course_sheet", jinja.get_template("partials/course_sheet.j2").render(**ctx)
    )
    index_html = patch_contacts(index_html, site["phone"], tel, site, access)
    index_html = re.sub(r"(css/(?:style|responsive)\.css)\?v=[^\"\']+", rf"\1?v={css_v}", index_html)
    index_html = re.sub(r"(js/main\.js)\?v=[^\"\']+", rf"\1?v={css_v}", index_html)
    index_path.write_text(index_html, encoding="utf-8")
    print("wrote index.html (partials)")

    # 残ページの電話・SNSも同期
    for name in ("takeout.html", "reserve.html", "thanks.html"):
        p = ROOT / name
        if not p.exists():
            continue
        t = patch_contacts(p.read_text(encoding="utf-8"), site["phone"], tel, site, access)
        t = re.sub(r"(css/(?:style|responsive)\.css)\?v=[^\"\']+", rf"\1?v={css_v}", t)
        t = re.sub(r"(js/main\.js)\?v=[^\"\']+", rf"\1?v={css_v}", t)
        p.write_text(t, encoding="utf-8")
        print("patched", name)

    print("build ok")


def ensure_index_markers(html: str) -> str:
    """既存 index に CMS マーカーを埋め込む（初回のみ）。"""
    html = re.sub(
        r'(<div class="meibutsu-list">.*?</div>\s*)(?=<div class="meibutsu-foot)',
        "<!-- cms:meibutsu -->\n\\1<!-- /cms:meibutsu -->\n",
        html,
        count=1,
        flags=re.S,
    )
    html = re.sub(
        r'(<div class="pick-board reveal">.*?</div>\s*)(?=<p style="margin-top:2\.2rem)',
        "<!-- cms:picks -->\n\\1<!-- /cms:picks -->\n",
        html,
        count=1,
        flags=re.S,
    )
    html = re.sub(
        r'(<div class="course-sheet reveal">.*?</div>\s*)(?=<p style="margin-top:1\.8rem)',
        "<!-- cms:course_sheet -->\n\\1<!-- /cms:course_sheet -->\n",
        html,
        count=1,
        flags=re.S,
    )
    if "<!-- cms:meibutsu -->" not in html:
        raise RuntimeError("index.html へのマーカー挿入に失敗しました")
    return html


if __name__ == "__main__":
    main()
