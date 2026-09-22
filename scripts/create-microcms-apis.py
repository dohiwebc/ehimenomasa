#!/usr/bin/env python3
"""microCMS に API 定義を作成する（Hobby 5 API 以内）"""
from __future__ import annotations

import json
import os
import ssl
import sys
import urllib.error
import urllib.request
from pathlib import Path

# Cursor サンドボックス経由の HTTPS で証明書検証に失敗することがあるため
SSL_CTX = ssl._create_unverified_context()

ROOT = Path(__file__).resolve().parents[1]
env_path = ROOT / ".env"
if env_path.exists():
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())

SERVICE_ID = os.environ.get("MICROCMS_SERVICE_ID", "ehimenomasa")
API_KEY = os.environ.get("MICROCMS_WRITE_API_KEY") or os.environ.get("MICROCMS_API_KEY")
if not API_KEY:
    sys.exit("APIキーが .env にありません")

BASE = f"https://{SERVICE_ID}.microcms-management.io/api/v1"


def req(method: str, path: str, body: dict | None = None):
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    r = urllib.request.Request(
        BASE + path,
        data=data,
        method=method,
        headers={
            "X-MICROCMS-API-KEY": API_KEY,
            "Content-Type": "application/json",
            "User-Agent": "ehimenomasa-setup/1.0",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(r, timeout=60, context=SSL_CTX) as res:
            raw = res.read().decode("utf-8")
            return res.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            payload = {"raw": raw}
        return e.code, payload
    except Exception as e:
        return 0, {"raw": str(e)}


def select(field_id: str, name: str, items: list[str], required: bool = True, multiple: bool = False):
    return {
        "fieldId": field_id,
        "name": name,
        "kind": "select",
        "required": required,
        "multipleSelect": multiple,
        "selectItems": [{"id": f"{field_id}_{i}", "value": v} for i, v in enumerate(items)],
    }


APIS = [
    {
        "name": "お品書き",
        "endpoint": "menu",
        "type": "list",
        "apiFields": [
            {"fieldId": "name", "name": "品名", "kind": "text", "required": True},
            {"fieldId": "price", "name": "価格（税込・円）", "kind": "number", "required": True},
            {"fieldId": "priceNote", "name": "価格の補足", "kind": "text", "required": False},
            {
                "fieldId": "place",
                "name": "産地・由来（名物用）",
                "kind": "text",
                "required": False,
                "description": "例: 香川・丸亀",
            },
            {"fieldId": "description", "name": "説明", "kind": "textArea", "required": False},
            {"fieldId": "image", "name": "写真", "kind": "media", "required": False},
            select(
                "category",
                "カテゴリ",
                [
                    "名物鶏料理",
                    "焼き物・鉄板料理",
                    "揚げ物",
                    "おつまみ・一品料理",
                    "サラダ",
                    "ご飯・締め",
                    "ドリンク",
                ],
            ),
            {"fieldId": "sortOrder", "name": "並び順", "kind": "number", "required": True},
            {
                "fieldId": "showMeibutsu",
                "name": "TOP：名物料理に出す",
                "kind": "boolean",
                "required": False,
                "initialValue": False,
            },
            {
                "fieldId": "showPick",
                "name": "TOP：お品書きから に出す",
                "kind": "boolean",
                "required": False,
                "initialValue": False,
            },
            {
                "fieldId": "topOrder",
                "name": "TOP内の並び順",
                "kind": "number",
                "required": False,
            },
        ],
    },
    {
        "name": "コース",
        "endpoint": "course",
        "type": "list",
        "apiFields": [
            {"fieldId": "name", "name": "コース名", "kind": "text", "required": True},
            {"fieldId": "price", "name": "価格（税込・円）", "kind": "number", "required": True},
            {"fieldId": "lead", "name": "リード文", "kind": "text", "required": False},
            {"fieldId": "description", "name": "内容・説明", "kind": "textArea", "required": False},
            {"fieldId": "image", "name": "写真", "kind": "media", "required": False},
            {"fieldId": "sortOrder", "name": "並び順", "kind": "number", "required": True},
            {"fieldId": "notes", "name": "注意書き", "kind": "textArea", "required": False},
        ],
    },
    {
        "name": "雅ちゃんについて",
        "endpoint": "about",
        "type": "object",
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
        "type": "object",
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
        "type": "object",
        "apiFields": [
            {"fieldId": "phone", "name": "電話番号", "kind": "text", "required": False},
            {"fieldId": "hotpepperUrl", "name": "HotPepper URL", "kind": "text", "required": False},
            {"fieldId": "lineUrl", "name": "LINE URL", "kind": "text", "required": False},
            {"fieldId": "instagramUrl", "name": "Instagram URL", "kind": "text", "required": False},
            {"fieldId": "storesUrl", "name": "ネットショップ URL", "kind": "text", "required": False},
            {
                "fieldId": "recruitOpen",
                "name": "採用募集中",
                "kind": "boolean",
                "required": False,
                "initialValue": True,
            },
            {"fieldId": "recruitTitle", "name": "採用タイトル", "kind": "text", "required": False},
            {"fieldId": "recruitBody", "name": "採用本文", "kind": "richEditorV2", "required": False},
            {"fieldId": "recruitCond", "name": "採用条件など", "kind": "textArea", "required": False},
            {"fieldId": "privacyBody", "name": "プライバシーポリシー", "kind": "richEditorV2", "required": False},
        ],
    },
]


def main():
    status, listed = req("GET", "/apis")
    print("GET /apis =>", status, listed if status >= 400 else f"{len(listed) if isinstance(listed, list) else listed} ok")
    if status == 403:
        print(
            "\nマネジメントAPIの権限が不足しています。\n"
            "microCMS → サービス設定 → APIキー → このキーの編集で、\n"
            "「マネジメントAPI」の『APIの取得』『APIの作成』をONにしてください。\n"
            "（コンテンツの POST/PUT/PATCH/DELETE とは別です）"
        )
        sys.exit(1)
    if status >= 400:
        print(json.dumps(listed, ensure_ascii=False, indent=2))
        sys.exit(1)

    existing = set()
    if isinstance(listed, dict) and "apis" in listed:
        existing = {a.get("endpoint") for a in listed["apis"]}
    elif isinstance(listed, list):
        existing = {a.get("endpoint") for a in listed}

    for api in APIS:
        ep = api["endpoint"]
        if ep in existing:
            print(f"skip (exists): {ep}")
            continue
        st, body = req("POST", "/apis", api)
        print(f"POST {ep} => {st}")
        if st >= 400:
            print(json.dumps(body, ensure_ascii=False, indent=2))
        else:
            print("  created:", body.get("endpoint") or ep)


if __name__ == "__main__":
    main()
