#!/usr/bin/env python3
"""画像をアップロードし、menu / course に紐付け。about/access/site も可能な範囲で入稿。"""
from __future__ import annotations

import html as html_lib
import json
import mimetypes
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


def curl_json(method: str, url: str, body: dict | None = None):
    cmd = [
        "curl", "-sS", "-w", "\n__HTTP__:%{http_code}", "-X", method,
        "-H", f"X-MICROCMS-API-KEY: {KEY}", "-H", "Accept: application/json",
    ]
    if body is not None:
        cmd += ["-H", "Content-Type: application/json", "--data-binary", json.dumps(body, ensure_ascii=False)]
    cmd.append(url)
    out = subprocess.check_output(cmd, text=True)
    raw, _, code = out.rpartition("\n__HTTP__:")
    payload = {}
    if raw.strip():
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            payload = {"raw": raw[:300]}
    return int(code.strip()), payload


def upload_media(path: Path) -> str | None:
    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
    key = str(path.relative_to(ROOT))
    if key in cache:
        return cache[key]
    mime = mimetypes.guess_type(path.name)[0] or "image/webp"
    if path.suffix.lower() == ".webp":
        mime = "image/webp"
    cmd = [
        "curl", "-sS", "-w", "\n__HTTP__:%{http_code}", "-X", "POST",
        "-H", f"X-MICROCMS-API-KEY: {KEY}",
        "-F", f"file=@{path};type={mime}",
        f"{MGMT}/media",
    ]
    out = subprocess.check_output(cmd, text=True)
    raw, _, code = out.rpartition("\n__HTTP__:")
    code_i = int(code.strip())
    if code_i not in (200, 201):
        print(f"  ! media fail {path.name}: {code_i} {raw[:160]}")
        return None
    url = json.loads(raw)["url"]
    cache[key] = url
    CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
    time.sleep(0.25)
    return url


def parse_price(text: str) -> int:
    t = unicodedata.normalize("NFKC", text).replace(",", "").replace("円", "").replace(" ", "")
    return int(re.search(r"(\d+)", t).group(1))


def parse_menu_images():
    html = (ROOT / "menu.html").read_text(encoding="utf-8")
    mapping = {}
    parts = re.split(r'<section class="menu-category[^"]*"[^>]*>', html)
    for part in parts[1:]:
        cm = re.search(r'<h2 class="menu-category__title">([^<]+)</h2>', part)
        if not cm:
            continue
        category = html_lib.unescape(cm.group(1).strip())
        if category == "ドリンク":
            im = re.search(r'src="(assets/images/site/drink-menu\.webp)"', part)
            if im:
                mapping["ドリンクメニュー"] = im.group(1)
            continue
        for art in re.finditer(r"<article class=\"menu-row\">(.*?)</article>", part, re.S):
            block = art.group(1)
            nm = re.search(r'<h3 class="menu-row__name">([^<]+)</h3>', block)
            im = re.search(r'src="(assets/images/site/[^\"?]+)', block)
            if nm and im:
                mapping[html_lib.unescape(nm.group(1).strip())] = im.group(1)
    return mapping


def p_tags(*paras: str) -> str:
    return "".join(f"<p>{html_lib.escape(p)}</p>" for p in paras if p)


def main():
    print("=== menu images ===")
    name_to_img = parse_menu_images()
    # fetch all menus (paginated)
    contents = []
    offset = 0
    while True:
        st, data = curl_json("GET", f"{CONTENT}/menu?limit=100&offset={offset}")
        contents.extend(data.get("contents", []))
        if offset + 100 >= data.get("totalCount", 0):
            break
        offset += 100
    print(f"menu contents: {len(contents)}")

    ok = 0
    for c in contents:
        name = c["name"]
        rel = name_to_img.get(name)
        if not rel:
            print(f"  no local image: {name}")
            continue
        url = upload_media(ROOT / rel)
        if not url:
            continue
        st, res = curl_json("PATCH", f"{CONTENT}/menu/{c['id']}", {"image": url})
        print(f"  {name}: {st}")
        if st < 400:
            ok += 1
        else:
            print("   ", res)
        time.sleep(0.2)
    print(f"menu images patched: {ok}")

    print("=== course images ===")
    html = (ROOT / "course.html").read_text(encoding="utf-8")
    course_map = {}
    for art in re.finditer(r"<article class=\"course-detail[^\"]*\"[^>]*>(.*?)</article>", html, re.S):
        block = art.group(1)
        nm = re.search(r'<h2 class="course-detail__name">([^<]+)</h2>', block)
        im = re.search(r'src="(assets/images/site/[^\"?]+)', block)
        if nm and im:
            course_map[html_lib.unescape(nm.group(1).strip())] = im.group(1)
    st, data = curl_json("GET", f"{CONTENT}/course?limit=20")
    for c in data.get("contents", []):
        rel = course_map.get(c["name"])
        if not rel:
            continue
        url = upload_media(ROOT / rel)
        if not url:
            continue
        st, res = curl_json("PATCH", f"{CONTENT}/course/{c['id']}", {"image": url})
        print(f"  {c['name']}: {st}", res if st >= 400 else "")
        time.sleep(0.2)

    print("=== about / access / site ===")
    owner_url = upload_media(ROOT / "assets/images/site/owner-greeting.webp")
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
            "お店のコンセプトは、「松山市で各地方の名物鶏料理が食べられる」であり、笑顔で来ていただき、笑顔でお帰りいただく事をモットーに接客しております。",
            "会社概要：Ehimeno雅Chan ～愛媛の雅（マサ）ちゃん～／株式会社 雅道／"
            "〒790-0012愛媛県松山市湊町5丁目4-2 健勝ビル2階／TEL 089-913-1194／代表 土肥 雅樹",
        ),
    }
    if owner_url:
        about_body["ownerPhoto"] = owner_url
    st, res = curl_json("PATCH", f"{CONTENT}/about", about_body)
    print("about", st, res if st >= 400 else "ok")

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
        u = upload_media(ROOT / p)
        if u:
            gallery_urls.append(u)

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
            "給与：時給1,100円〜1,250円（試用期間2か月は時給1,040円以上）。金曜日は時給50円UP。",
            "勤務：18:00〜23:00／週2日〜OK／シフト制。日曜日・祝日休み。未経験歓迎。",
            "応募後、1営業日以内にご連絡します。WEB応募は24時間受付中です。",
        ),
        "recruitCond": (
            "雇用形態：アルバイト／職種：ホール・キッチンスタッフ\n"
            "勤務地：愛媛の雅ちゃん（松山市湊町5丁目4-2 健勝ビル2F）\n"
            "席数：37席（テーブル7卓、座敷2つ、カウンター7席）\n"
            "待遇：まかない付き／制服貸与／髪色・ピアス・ネイルOK（長いネイルはNG）／社会保険（法令に則り適用）"
        ),
        "privacyBody": p_tags(
            "株式会社雅道（以下「当社」）は、ご予約・お問い合わせ・採用応募等で取得する個人情報を適正に取り扱います。",
            "利用目的：ご予約・お問い合わせへの対応、採用選考、サービス向上のための連絡。",
            "第三者提供：法令に基づく場合を除き、ご本人の同意なく第三者へ提供しません。",
            "開示等：個人情報の開示・訂正・削除等のご請求は、店舗（TEL 089-913-1194）までご連絡ください。",
            "※本文言は初回入稿用のたたき台です。必要に応じて管理画面で修正してください。",
        ),
    }
    st, res = curl_json("PATCH", f"{CONTENT}/site", site_body)
    print("site", st, res if st >= 400 else "ok")


if __name__ == "__main__":
    main()
