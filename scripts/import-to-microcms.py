#!/usr/bin/env python3
"""既存 HTML から microCMS へ初期データを入稿する。"""
from __future__ import annotations

import html as html_lib
import json
import os
import re
import subprocess
import time
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "scripts" / ".media-cache.json"

env = {}
for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    k, v = line.split("=", 1)
    env[k.strip()] = v.strip()

SID = env["MICROCMS_SERVICE_ID"]
KEY = env.get("MICROCMS_WRITE_API_KEY") or env["MICROCMS_API_KEY"]
CONTENT = f"https://{SID}.microcms.io/api/v1"
MGMT = f"https://{SID}.microcms-management.io/api/v1"


def curl_json(method: str, url: str, body: dict | None = None, headers: list[str] | None = None):
    cmd = [
        "curl",
        "-sS",
        "-w",
        "\n__HTTP__:%{http_code}",
        "-X",
        method,
        "-H",
        f"X-MICROCMS-API-KEY: {KEY}",
        "-H",
        "Accept: application/json",
    ]
    if headers:
        for h in headers:
            cmd += ["-H", h]
    if body is not None:
        cmd += ["-H", "Content-Type: application/json", "--data-binary", json.dumps(body, ensure_ascii=False)]
    cmd.append(url)
    out = subprocess.check_output(cmd, text=True)
    raw, _, code = out.rpartition("\n__HTTP__:")
    return int(code.strip()), (json.loads(raw) if raw.strip() else {})


def upload_media(path: Path) -> str | None:
    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
    key = str(path.relative_to(ROOT))
    if key in cache:
        return cache[key]
    cmd = [
        "curl",
        "-sS",
        "-w",
        "\n__HTTP__:%{http_code}",
        "-X",
        "POST",
        "-H",
        f"X-MICROCMS-API-KEY: {KEY}",
        "-F",
        f"file=@{path}",
        f"{MGMT}/media",
    ]
    out = subprocess.check_output(cmd, text=True)
    raw, _, code = out.rpartition("\n__HTTP__:")
    code_i = int(code.strip())
    if code_i not in (200, 201):
        print(f"  ! media skip {path.name}: HTTP {code_i} {raw[:120]}")
        return None
    data = json.loads(raw)
    url = data["url"]
    cache[key] = url
    CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
    time.sleep(0.15)
    return url


def parse_price(text: str) -> int:
    t = unicodedata.normalize("NFKC", text)
    t = t.replace(",", "").replace("円", "").replace(" ", "")
    m = re.search(r"(\d+)", t)
    if not m:
        raise ValueError(f"price: {text}")
    return int(m.group(1))


def slug(s: str) -> str:
    s = unicodedata.normalize("NFKC", s)
    s = re.sub(r"[^\w\-]+", "-", s, flags=re.UNICODE)
    s = re.sub(r"-+", "-", s).strip("-").lower()
    return (s or "item")[:40]


MEIBUTSU_PLACE = {
    "丸亀名物 骨付鳥（おや）": "香川・丸亀",
    "丸亀名物 骨付鳥（ひな）": "香川・丸亀",
    "川之江名物 揚げ足鳥": "愛媛・川之江",
    "名古屋名物 手羽先（5本）": "愛知・名古屋",
    "ざんぎ（骨付鳥の唐揚げ）": "香川・丸亀",
}

TOP_MEIBUTSU_ORDER = [
    "丸亀名物 骨付鳥（おや）",
    "丸亀名物 骨付鳥（ひな）",
    "川之江名物 揚げ足鳥",
    "名古屋名物 手羽先（5本）",
    "ざんぎ（骨付鳥の唐揚げ）",
]
TOP_PICK_ORDER = [
    "かわ揚げ秘伝ダレかけ",
    "ずり揚げ",
    "焼鳥・5種盛り合わせ",
    "ジャンボ串（2本）",
    "厚切り牛タン",
    "雅ちゃんからあげ（5個）",
    "刺身3種盛り",
    "本家直伝とりのたたき",
]
TOP_MEIBUTSU = set(TOP_MEIBUTSU_ORDER)
TOP_PICK = set(TOP_PICK_ORDER)


def parse_menu():
    html = (ROOT / "menu.html").read_text(encoding="utf-8")
    items = []
    # split by category sections
    parts = re.split(r'<section class="menu-category[^"]*"[^>]*>', html)
    sort = 0
    for part in parts[1:]:
        cm = re.search(r'<h2 class="menu-category__title">([^<]+)</h2>', part)
        if not cm:
            continue
        category = html_lib.unescape(cm.group(1).strip())
        if category == "ドリンク":
            # ドリンクはメニュー表画像として1件
            im = re.search(r'src="(assets/images/site/drink-menu\.webp)"', part)
            sort += 10
            items.append(
                {
                    "name": "ドリンクメニュー",
                    "price": 0,
                    "priceNote": "メニュー表参照",
                    "category": category,
                    "image": im.group(1) if im else None,
                    "sortOrder": sort,
                }
            )
            continue
        for art in re.finditer(r"<article class=\"menu-row\">(.*?)</article>", part, re.S):
            block = art.group(1)
            nm = re.search(r'<h3 class="menu-row__name">([^<]+)</h3>', block)
            pr = re.search(r'<p class="menu-row__price">([^<]+)</p>', block)
            im = re.search(r'src="(assets/images/site/[^\"?]+)', block)
            if not nm or not pr:
                continue
            name = html_lib.unescape(nm.group(1).strip())
            sort += 10
            items.append(
                {
                    "name": name,
                    "price": parse_price(pr.group(1)),
                    "category": category,
                    "image": im.group(1) if im else None,
                    "place": MEIBUTSU_PLACE.get(name),
                    "sortOrder": sort,
                    "showMeibutsu": name in TOP_MEIBUTSU,
                    "showPick": name in TOP_PICK,
                    "topOrder": (TOP_MEIBUTSU_ORDER.index(name) + 1) * 10
                    if name in TOP_MEIBUTSU
                    else (TOP_PICK_ORDER.index(name) + 1) * 10
                    if name in TOP_PICK
                    else None,
                }
            )
    return items


def parse_courses():
    html = (ROOT / "course.html").read_text(encoding="utf-8")
    courses = []
    for i, art in enumerate(re.finditer(r"<article class=\"course-detail[^\"]*\"[^>]*>(.*?)</article>", html, re.S), 1):
        block = art.group(1)
        nm = re.search(r'<h2 class="course-detail__name">([^<]+)</h2>', block)
        pr = re.search(r'<p class="price">([^<]+)</p>', block)
        lead = re.search(r'<p class="course-detail__lead">([^<]+)</p>', block)
        im = re.search(r'src="(assets/images/site/[^\"?]+)', block)
        lis = re.findall(r"<li>(.*?)</li>", block, re.S)
        desc = "\n".join(html_lib.unescape(re.sub(r"<[^>]+>", "", li)).strip() for li in lis)
        courses.append(
            {
                "name": html_lib.unescape(nm.group(1).strip()),
                "price": parse_price(pr.group(1)),
                "lead": html_lib.unescape(lead.group(1).strip()) if lead else "",
                "description": desc,
                "image": im.group(1) if im else None,
                "sortOrder": i * 10,
                "notes": "コースメニューは2名様以上の前日予約が必要です。内容は一部変更になる場合があります。",
            }
        )
    return courses


def p_tags(*paras: str) -> str:
    return "".join(f"<p>{html_lib.escape(p)}</p>" for p in paras if p)


def import_all():
    print("=== media + menu ===")
    menu_items = parse_menu()
    print(f"menu items: {len(menu_items)}")

    # clear existing menu? list and delete
    st, data = curl_json("GET", f"{CONTENT}/menu?limit=100")
    if st == 200:
        for c in data.get("contents", []):
            curl_json("DELETE", f"{CONTENT}/menu/{c['id']}")
            time.sleep(0.05)

    for it in menu_items:
        body = {
            "name": it["name"],
            "price": it["price"],
            "category": [it["category"]],
            "sortOrder": it["sortOrder"],
            "showMeibutsu": bool(it.get("showMeibutsu")),
            "showPick": bool(it.get("showPick")),
        }
        if it.get("priceNote"):
            body["priceNote"] = it["priceNote"]
        if it.get("place"):
            body["place"] = it["place"]
        if it.get("topOrder") is not None:
            body["topOrder"] = it["topOrder"]
        if it.get("image"):
            url = upload_media(ROOT / it["image"])
            if url:
                body["image"] = url
        cid = "menu-" + slug(it["name"])
        st, res = curl_json(
            "POST",
            f"{CONTENT}/menu",
            body,
            headers=[f"X-MICROCMS-CONTENT-ID: {cid}"],
        )
        print(f"  menu {it['name']}: {st}")
        if st >= 400:
            print("   ", res)
            # retry without fixed id
            st, res = curl_json("POST", f"{CONTENT}/menu", body)
            print(f"  retry: {st}", res if st >= 400 else "")

    print("=== course ===")
    st, data = curl_json("GET", f"{CONTENT}/course?limit=100")
    if st == 200:
        for c in data.get("contents", []):
            curl_json("DELETE", f"{CONTENT}/course/{c['id']}")

    for it in parse_courses():
        body = {
            "name": it["name"],
            "price": it["price"],
            "lead": it["lead"],
            "description": it["description"],
            "sortOrder": it["sortOrder"],
            "notes": it["notes"],
        }
        if it.get("image"):
            url = upload_media(ROOT / it["image"])
            if url:
                body["image"] = url
        st, res = curl_json("POST", f"{CONTENT}/course", body, headers=[f"X-MICROCMS-CONTENT-ID: course-{slug(it['name'])}"])
        print(f"  course {it['name']}: {st}", res if st >= 400 else "")

    print("=== about ===")
    owner = ROOT / "assets/images/site/owner-greeting.webp"
    owner_url = upload_media(owner)
    about_body = {
        "kicker": "愛媛の雅ちゃん",
        "title": "雅ちゃんについて",
        "lead": "最高の隠し味は おもてなし",
        "ownerName": "土肥 雅樹",
        "ownerMessage": (
            "神戸市にある専門学校を卒業し、そのまま全国転勤のある会社に就職。それから16年勤務していく中で、"
            "各地方への転勤地として、香川県丸亀市（おやひな）・愛知県名古屋市（手羽先）の骨付鳥と出会いました。"
            "父の体調不良を機に愛媛県に戻り、骨付鳥のお店の開業準備をし、四国中央市の揚げ足鳥を含む、"
            "3つの名物鳥料理のお店を松山市駅前商店街にて開業いたしました。"
        ),
        "body": p_tags(
            "オープン当時に南海放送様の『もぎたてテレビ』で放送された事もあり、たくさんのお客様と出会う事が出来ました。"
            "また、松山三越で不定期開催されている、『もぎたて名店街』のイベント業にも参加し、本業のお店と共に継続し、"
            "それから4年後の平成27年3月3日にお店を【株式会社 雅道】に法人化し、現在に至ります。",
            "お店のコンセプトは、「松山市で各地方の名物鶏料理が食べられる」であり、その中でお客様に於いては、"
            "笑顔で来ていただき、笑顔でお帰りいただく事をモットーに元気良く接客させていただいております。"
            "お食事だけを提供するお店では無く、ひとつひとつの出会いを大事にし、これからも日々精進していく所存であります。",
            "会社概要：Ehimeno雅Chan ～愛媛の雅（マサ）ちゃん～／株式会社 雅道（マサミチ）／"
            "〒790-0012愛媛県松山市湊町5丁目4-2 健勝ビル2階／TEL 089-913-1194／代表 土肥 雅樹",
        ),
    }
    if owner_url:
        about_body["ownerPhoto"] = owner_url
    st, res = curl_json("PATCH", f"{CONTENT}/about", about_body)
    print("about", st, res if st >= 400 else "ok")

    print("=== access ===")
    gallery_paths = [
        "assets/images/site/interior-counter.webp",
        "assets/images/site/interior-night.webp",
        "assets/images/site/hp-zashiki-12.webp",
        "assets/images/site/hp-zashiki-wide.webp",
        "assets/images/site/hp-table-party.webp",
        "assets/images/site/store-exterior.webp",
        "assets/images/site/interior-dining.webp",
        "assets/images/site/store-sign.webp",
        "assets/images/site/hp-counter-seat.webp",
        "assets/images/site/hp-counter-live.webp",
        "assets/images/site/hp-table-seat.webp",
        "assets/images/site/hp-zashiki-6.webp",
        "assets/images/site/shop-gallery-05.webp",
        "assets/images/site/shop-gallery-04.webp",
        "assets/images/site/shop-gallery-20.webp",
        "assets/images/site/shop-gallery-16.webp",
    ]
    gallery_urls = []
    for p in gallery_paths:
        url = upload_media(ROOT / p)
        if url:
            gallery_urls.append(url)
    access_body = {
        "shopName": "愛媛の雅ちゃん",
        "address": "〒790-0012 愛媛県松山市湊町5丁目4-2 健勝ビル2階",
        "phone": "089-913-1194",
        "holiday": "日曜日・祝日",
        "hours": "17:30〜22:30／料理L.O.21:40／ドリンクL.O.22:10",
        "accessText": (
            "【電車・バス】松山市駅から徒歩1分。松山市駅・北側出口を出て、すぐの横断歩道を渡りきると正面にございます。\n"
            "【車】伊予鉄高島屋さんの向かい側道路（ひぎりやきさん側）沿い。駐車場はございません。"
            "お持ち帰り時は1階までお持ちいたします。"
        ),
        "seatInfo": "カウンターとテーブル、座敷あり。仕事帰りから宴会まで。",
        "mapEmbed": (
            '<iframe title="愛媛の雅ちゃんの地図" '
            'src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3314.0631652958873!2d132.76061451553642!3d33.836481636516176!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x354fe58c75ccb9b5%3A0x82b944c1d5958c67!2z5oSb5aqb44Gu6ZuF44Gh44KD44KT!5e0!3m2!1sja!2sjp!4v1640270590748!5m2!1sja!2sjp" '
            'loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>'
        ),
    }
    if gallery_urls:
        access_body["gallery"] = gallery_urls
    st, res = curl_json("PATCH", f"{CONTENT}/access", access_body)
    print("access", st, res if st >= 400 else "ok")

    print("=== site ===")
    site_body = {
        "phone": "089-913-1194",
        "hotpepperUrl": "https://www.hotpepper.jp/strJ004612520/",
        "lineUrl": "https://line.me/R/ti/p/@ipp6981e",
        "instagramUrl": "https://www.instagram.com/ehimenomasa/",
        "storesUrl": "https://ehime-masachan.stores.jp/",
        "recruitOpen": True,
        "recruitTitle": "スタッフ募集",
        "recruitBody": p_tags(
            "雅ちゃんで楽しく、元気に働いてくれる方を募集しています。アルバイト（居酒屋のホール・キッチンスタッフ）。",
            "給与：時給1,100円〜1,250円（試用期間2か月は時給1,040円以上）。金曜日は時給50円UP。習熟度に応じて昇給あり。",
            "勤務：18:00〜23:00／週2日〜OK／シフト制。日曜日・祝日休み。未経験歓迎。",
            "応募後、1営業日以内にご連絡します。友達と応募もOK／WEB応募は24時間受付中です。",
        ),
        "recruitCond": (
            "雇用形態：アルバイト／職種：ホール・キッチンスタッフ\n"
            "勤務地：愛媛の雅ちゃん（松山市湊町5丁目4-2 健勝ビル2F）\n"
            "席数：37席（テーブル7卓、座敷2つ、カウンター7席）\n"
            "待遇：まかない付き／制服貸与／髪色・ピアス・ネイルOK（長いネイルはNG）／社会保険（法令に則り適用）"
        ),
        "privacyBody": p_tags(
            "株式会社雅道（以下「当社」）は、ご予約・お問い合わせ・採用応募等で取得する個人情報を、"
            "適正に取り扱います。",
            "利用目的：ご予約・お問い合わせへの対応、採用選考、サービス向上のための連絡。",
            "第三者提供：法令に基づく場合を除き、ご本人の同意なく第三者へ提供しません。",
            "開示等：個人情報の開示・訂正・削除等のご請求は、店舗（TEL 089-913-1194）までご連絡ください。",
            "※本文言は初回入稿用のたたき台です。必要に応じて管理画面で修正してください。",
        ),
    }
    st, res = curl_json("PATCH", f"{CONTENT}/site", site_body)
    print("site", st, res if st >= 400 else "ok")

    st, data = curl_json("GET", f"{CONTENT}/menu?limit=100&fields=name,category,showMeibutsu,showPick")
    print("menu count", data.get("totalCount"), st)
    st, data = curl_json("GET", f"{CONTENT}/course?limit=10")
    print("course count", data.get("totalCount"), st)


if __name__ == "__main__":
    import_all()
