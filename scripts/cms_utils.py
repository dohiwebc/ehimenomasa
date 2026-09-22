"""microCMS 取得ヘルパー"""
from __future__ import annotations

import json
import os
import ssl
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SSL_CTX = ssl._create_unverified_context()


def load_env() -> dict[str, str]:
    env = dict(os.environ)
    path = ROOT / ".env"
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env.setdefault(k.strip(), v.strip())
    return env


def fetch_all(endpoint: str, api_key: str, service_id: str, limit: int = 100) -> list[dict]:
    base = f"https://{service_id}.microcms.io/api/v1/{endpoint}"
    contents: list[dict] = []
    offset = 0
    while True:
        qs = urllib.parse.urlencode({"limit": limit, "offset": offset})
        req = urllib.request.Request(
            f"{base}?{qs}",
            headers={"X-MICROCMS-API-KEY": api_key, "Accept": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=60, context=SSL_CTX) as res:
            data = json.loads(res.read().decode("utf-8"))
        batch = data.get("contents", [])
        contents.extend(batch)
        total = data.get("totalCount", len(contents))
        offset += limit
        if offset >= total or not batch:
            break
    return contents


def fetch_one(endpoint: str, api_key: str, service_id: str) -> dict:
    items = fetch_all(endpoint, api_key, service_id, limit=10)
    if not items:
        raise RuntimeError(f"microCMS `{endpoint}` が空です")
    return items[0]


def media_url(field) -> str | None:
    if not field:
        return None
    if isinstance(field, str):
        return field
    return field.get("url")


def media_list(field) -> list[str]:
    if not field:
        return []
    out = []
    for item in field:
        u = media_url(item)
        if u:
            out.append(u)
    return out


def format_price_jp(n) -> str:
    if n is None or n == "":
        return ""
    try:
        n = int(n)
    except (TypeError, ValueError):
        return str(n)
    if n <= 0:
        return ""
    s = f"{n:,}"
    table = str.maketrans("0123456789,", "０１２３４５６７８９，")
    return s.translate(table) + "円"


def format_price_course(n) -> str:
    """コース表示は半角寄せ（既存デザインに合わせる）"""
    try:
        n = int(n)
    except (TypeError, ValueError):
        return str(n)
    return f"{n:,} 円"


def tel_href(phone: str) -> str:
    digits = "".join(c for c in (phone or "") if c.isdigit())
    return f"tel:{digits}" if digits else "#"


CATEGORY_ORDER = [
    "名物鶏料理",
    "焼き物・鉄板料理",
    "揚げ物",
    "おつまみ・一品料理",
    "サラダ",
    "ご飯・締め",
    "ドリンク",
]

CATEGORY_IDS = {
    "名物鶏料理": "menu-meibutsu",
    "焼き物・鉄板料理": "menu-ippin",
    "ご飯・締め": "menu-gohan",
    "ドリンク": "menu-drink",
}
