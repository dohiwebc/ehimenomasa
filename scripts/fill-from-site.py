#!/usr/bin/env python3
"""
サイト HTML から microCMS へ逆輸入する。

前提:
  - menu / course は既存のまま画像込みで更新
  - about / access / site は「リスト形式」であること
    （オブジェクト形式は Management API 作成だと中身箱がなく PATCH できない）

管理画面で about / access / site を削除したあと、このスクリプトが
リスト形式で作り直して全文を流し込む。
"""
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


def curl(method: str, url: str, body: dict | list | None = None, form_file: Path | None = None, mime: str | None = None):
    cmd = ["curl", "-sS", "-w", "\n__HTTP__:%{http_code}", "-X", method, "-H", f"X-MICROCMS-API-KEY: {KEY}", "-H", "Accept: application/json"]
    if form_file is not None:
        cmd += ["-F", f"file=@{form_file};type={mime or 'image/webp'}"]
    elif body is not None:
        cmd += ["-H", "Content-Type: application/json", "--data-binary", json.dumps(body, ensure_ascii=False)]
    cmd.append(url)
    out = subprocess.check_output(cmd, text=True)
    raw, _, code = out.rpartition("\n__HTTP__:")
    payload = {}
    if raw.strip():
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            payload = {"raw": raw[:400]}
    return int(code.strip()), payload


def upload(path: Path) -> str | None:
    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
    key = str(path.relative_to(ROOT))
    if key in cache:
        return cache[key]
    mime = "image/webp" if path.suffix.lower() == ".webp" else (mimetypes.guess_type(path.name)[0] or "image/jpeg")
    for attempt in range(6):
        st, res = curl("POST", f"{MGMT}/media", form_file=path, mime=mime)
        if st in (200, 201):
            url = res["url"]
            cache[key] = url
            CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
            time.sleep(0.35)
            return url
        if st == 429:
            time.sleep(8 + attempt * 3)
            continue
        print(f"  ! media {path.name}: {st} {res}")
        return None
    return None


def p_tags(*paras: str) -> str:
    return "".join(f"<p>{html_lib.escape(p)}</p>" for p in paras if p)


def select(field_id, name, items, required=True):
    return {
        "fieldId": field_id,
        "name": name,
        "kind": "select",
        "required": required,
        "multipleSelect": False,
        "selectItems": [{"id": f"{field_id}_{i}", "value": v} for i, v in enumerate(items)],
    }


LIST_APIS = [
    {
        "name": "雅ちゃんについて",
        "endpoint": "about",
        "type": "list",
        "apiFields": [
            {"fieldId": "kicker", "name": "キッカー", "kind": "text", "required": False},
            {"fieldId": "title", "name": "見出し", "kind": "text", "required": True},
            {"fieldId": "lead", "name": "リード", "kind": "textArea", "required": False},
            {"fieldId": "body", "name": "本文", "kind": "richEditorV2", "required": False},
            {"fieldId": "ownerName", "name": "店主名", "kind": "text", "required": False},
            {"fieldId": "ownerPhoto", "name": "店主写真", "kind": "media", "required": False},
            {"fieldId": "ownerMessage", "name": "店主あいさつ", "kind": "textArea", "required": False},
        ],
    },
    {
        "name": "アクセス・店舗情報",
        "endpoint": "access",
        "type": "list",
        "apiFields": [
            {"fieldId": "shopName", "name": "店名", "kind": "text", "required": True},
            {"fieldId": "address", "name": "住所", "kind": "textArea", "required": True},
            {"fieldId": "accessText", "name": "アクセス案内", "kind": "textArea", "required": False},
            {"fieldId": "hours", "name": "営業時間", "kind": "textArea", "required": False},
            {"fieldId": "holiday", "name": "定休日", "kind": "text", "required": False},
            {"fieldId": "phone", "name": "電話番号", "kind": "text", "required": False},
            {"fieldId": "mapEmbed", "name": "地図埋め込みHTML", "kind": "textArea", "required": False},
            {"fieldId": "seatInfo", "name": "席・店内案内", "kind": "textArea", "required": False},
            {"fieldId": "gallery", "name": "店内写真", "kind": "mediaList", "required": False},
        ],
    },
    {
        "name": "サイト設定（採用・規約・連絡先）",
        "endpoint": "site",
        "type": "list",
        "apiFields": [
            {"fieldId": "phone", "name": "電話番号", "kind": "text", "required": False},
            {"fieldId": "hotpepperUrl", "name": "HotPepper URL", "kind": "text", "required": False},
            {"fieldId": "lineUrl", "name": "LINE URL", "kind": "text", "required": False},
            {"fieldId": "instagramUrl", "name": "Instagram URL", "kind": "text", "required": False},
            {"fieldId": "storesUrl", "name": "ネットショップ URL", "kind": "text", "required": False},
            {"fieldId": "recruitOpen", "name": "採用募集中", "kind": "boolean", "required": False, "initialValue": True},
            {"fieldId": "recruitTitle", "name": "採用タイトル", "kind": "text", "required": False},
            {"fieldId": "recruitBody", "name": "採用本文", "kind": "richEditorV2", "required": False},
            {"fieldId": "recruitCond", "name": "採用条件など", "kind": "textArea", "required": False},
            {"fieldId": "privacyBody", "name": "プライバシーポリシー", "kind": "richEditorV2", "required": False},
        ],
    },
]


def ensure_list_apis():
    st, data = curl("GET", f"{MGMT}/apis")
    apis = {a["endpoint"]: a for a in data.get("apis", [])}
    print("current:", [(e, a["type"]) for e, a in apis.items()])

    blocked = [ep for ep in ("about", "access", "site") if ep in apis and apis[ep]["type"] == "object"]
    if blocked:
        print("\n【作業が必要】管理画面で次の API を削除してください（オブジェクト形式のため自動入稿できません）:")
        for ep in blocked:
            print(f"  - {ep}")
        print("削除後、もう一度このスクリプトを実行します。")
        return False

    for api in LIST_APIS:
        ep = api["endpoint"]
        if ep in apis:
            print(f"exists {ep} ({apis[ep]['type']})")
            continue
        st, res = curl("POST", f"{MGMT}/apis", api)
        print(f"create {ep}: {st}", res if st >= 400 else "ok")
        if st >= 400:
            return False
        time.sleep(0.3)
    return True


def upsert_list(endpoint: str, body: dict, content_id: str):
    st, data = curl("GET", f"{CONTENT}/{endpoint}?limit=10")
    if st == 200 and data.get("contents"):
        cid = data["contents"][0]["id"]
        st, res = curl("PATCH", f"{CONTENT}/{endpoint}/{cid}", body)
        print(f"  patch {endpoint}/{cid}: {st}", res if st >= 400 else "ok")
        return st < 400
    st, res = curl("POST", f"{CONTENT}/{endpoint}", body)
    # retry with content id header via raw curl if needed
    if st >= 400:
        print(f"  post {endpoint}: {st} {res}")
        return False
    print(f"  post {endpoint}: {st} {res}")
    return True


def fill_about():
    owner = upload(ROOT / "assets/images/site/owner-greeting.webp")
    body = {
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
            "【お店のコンセプト】松山市で各地方の名物鶏料理が食べられる。最高の鶏料理を追い求めて１４年。",
            "【会社概要】会社名: Ehimeno雅Chan ～愛媛の雅（マサ）ちゃん～／法人名: 株式会社 雅道（マサミチ）／"
            "所在地: 〒790-0012愛媛県松山市湊町5丁目4-2 健勝ビル2階／TEL: 089-913-1194／"
            "代表者: 土肥 雅樹 ／ Masaki Dohi／取引銀行: 伊予銀行 ／ 愛媛銀行／"
            "沿革: 平成23年2月19日設立、平成27年3月3日法人化",
        ),
    }
    if owner:
        body["ownerPhoto"] = owner
    return upsert_list("about", body, "main")


def fill_access():
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
    gallery = []
    for p in gallery_paths:
        u = upload(ROOT / p)
        if u:
            gallery.append(u)
    body = {
        "shopName": "愛媛の雅ちゃん",
        "address": "〒790-0012 愛媛県松山市湊町5丁目4-2 健勝ビル2階",
        "phone": "089-913-1194",
        "holiday": "日曜日・祝日",
        "hours": "17:30〜22:30／料理L.O.21:40／ドリンクL.O.22:10",
        "accessText": (
            "【電車・バスでお越しの方へ】\n"
            "松山市駅から徒歩1分。松山市駅・北側出口を出て、すぐの横断歩道を渡りきると正面にございます。"
            "左側にパチンコ・パワーステーションさん、右側にはひぎりやきさんがございます。\n\n"
            "【車でお越しの方へ】\n"
            "伊予鉄高島屋さんの向かい側道路（ひぎりやきさん側）沿いにございます。"
            "ひぎりやきさんとパチンコ・パワーステーションさんの間のビル2階でございます。"
            "※申し訳ありませんが、駐車場はございません。"
            "※お車でのお持ち帰り（テイクアウト）時は、1階までお持ちいたします。"
        ),
        "seatInfo": "松山市駅前の小さな居酒屋。健勝ビル2階。\nカウンターとテーブルで、仕事帰りから宴会まで。",
        "mapEmbed": (
            '<iframe class="map-embed" title="愛媛の雅ちゃんの地図" '
            'src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3314.0631652958873!2d132.76061451553642!3d33.836481636516176!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x354fe58c75ccb9b5%3A0x82b944c1d5958c67!2z5oSb5aqb44Gu6ZuF44Gh44KD44KT!5e0!3m2!1sja!2sjp!4v1640270590748!5m2!1sja!2sjp" '
            'loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>'
        ),
        "gallery": gallery,
    }
    return upsert_list("access", body, "main")


def fill_site():
    # recruit から給与などもう少し厚く
    body = {
        "phone": "089-913-1194",
        "hotpepperUrl": "https://www.hotpepper.jp/strJ004612520/",
        "lineUrl": "https://line.me/R/ti/p/@ipp6981e",
        "instagramUrl": "https://www.instagram.com/ehimenomasa/",
        "storesUrl": "https://ehime-masachan.stores.jp/",
        "recruitOpen": True,
        "recruitTitle": "スタッフ募集",
        "recruitBody": p_tags(
            "雅ちゃんで楽しく、元気に働いてくれる方を募集しています。アルバイト募集（居酒屋のホール・キッチンスタッフ）。スタッフ卒業シーズンに伴い、NEWスタッフを大募集しています。",
            "給与：時給1,100円〜1,250円。試用期間（2か月）は時給1,040円以上。金曜日は時給50円UP。習熟度に応じて随時昇給あり。",
            "勤務時間：18:00〜23:00／週2日〜OK／シフト制（2週間ごとに作成）。時間・曜日応相談。日曜日・祝日休み。夏季休暇（1週間）、年末年始休暇（12/31〜1/5）。",
            "勤務地：愛媛の雅ちゃん（〒790-0012 愛媛県松山市湊町5丁目4-2 健勝ビル2F）。松山市駅から徒歩1分。転勤なし。",
            "仕事内容：キッチンは仕込み・盛り付け・洗い場などの調理補助（料理は基本店主）。ホールはドリンク作り・配膳・片付け・接客。レジ操作＆電話対応なし。未経験歓迎。",
            "応募後、1営業日以内にご連絡します。友達と応募もOK。選考：応募→面接1回→採用。WEB応募は24時間受付中です。",
        ),
        "recruitCond": (
            "雇用形態：アルバイト／職種：ホール・キッチンスタッフ\n"
            "待遇：絶品まかない付き／制服貸与（Tシャツ、帽子、前掛け）／髪色自由／ピアスOK／"
            "ネイルOK（手袋着用のため長いネイルはNG）／ネックレスOK／自転車・バイク通勤OK／"
            "社会保険（法令に則り適用）\n"
            "席数：37席（テーブル7卓、座敷2つ、カウンター7席）\n"
            "顧客層：40〜60代の仕事帰りのビジネスマン、ファミリー層がメイン"
        ),
        "privacyBody": p_tags(
            "株式会社雅道（以下「当社」）は、ご予約・お問い合わせ・採用応募・テイクアウト申込等により取得する個人情報を、個人情報保護に関する法令を遵守し、適正に取り扱います。",
            "取得する情報の例：お名前、電話番号、メールアドレス、来店希望日時、人数、応募情報（年齢・出勤可能日数等）。",
            "利用目的：ご予約・お問い合わせへの対応、採用選考および連絡、テイクアウト対応、サービス向上のためのご連絡。",
            "第三者提供：法令に基づく場合を除き、ご本人の同意なく第三者へ提供しません。",
            "保管・安全管理：当社は個人情報の漏えい、滅失、き損の防止のため、適切な安全管理措置を講じます。",
            "開示・訂正・削除等：ご本人からの開示・訂正・削除等のご請求については、店舗までご連絡ください。TEL 089-913-1194",
            "お問い合わせ窓口：愛媛の雅ちゃん／株式会社雅道　〒790-0012 愛媛県松山市湊町5丁目4-2 健勝ビル2階",
        ),
    }
    return upsert_list("site", body, "main")


def main():
    print("=== ensure list APIs ===")
    if not ensure_list_apis():
        raise SystemExit(2)
    print("=== fill about ===")
    fill_about()
    print("=== fill access ===")
    fill_access()
    print("=== fill site ===")
    fill_site()
    print("=== done ===")


if __name__ == "__main__":
    main()
