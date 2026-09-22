# 愛媛の雅ちゃん 公式サイト

愛媛県松山市の居酒屋「愛媛の雅ちゃん」の公式サイトです。

公開URL: https://ehimenomasa.com/

## サイトの目的

店舗の認知と印象を良くすることを最優先としています。

- 松山市駅から近く、利用しやすいこと
- 名物鶏料理が分かりやすいこと
- 仕事帰りや友人同士など、普段使いしやすい居酒屋であること
- その延長として宴会・歓送迎会にも対応できること
- 温かみがあり、活気のある地域店に見えること

## 使用技術

- HTML / CSS / JavaScript（静的サイト・GitHub Pages）
- microCMS（お品書き・コース・店舗情報などのコンテンツ）
- Python + Jinja2（ビルド時に HTML を生成）

## microCMS 連携

コンテンツの更新は microCMS 管理画面で行い、次のいずれかでサイトへ反映します。

### 自動反映（推奨）

microCMS の Webhook（GitHub Actions）を設定すると、**公開・更新のたびに自動ビルド**されます。

1. GitHub で Personal Access Token を作成  
   https://github.com/settings/tokens?type=beta  
   - Repository access: `dohiwebc/ehimenomasa` のみ  
   - Permissions: **Contents → Read and write**
2. microCMS の各 API（`menu` / `course` / `about` / `access` / `site`）→ API設定 → Webhook → **GitHub Actions** を追加  
   - GitHubトークン: 上で作ったトークン  
   - ユーザー名: `dohiwebc`  
   - リポジトリ名: `ehimenomasa`  
   - トリガーイベント名: `microcms`  
   - タイミング: **コンテンツの公開時・更新時**（と削除時も必要なら）
3. 一度公開して、Actions に **Build from microCMS** が走ればOK

### 手動ビルド

```bash
# 初回のみ
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

# 生成（要: .env に MICROCMS_SERVICE_ID / MICROCMS_API_KEY）
.venv/bin/python scripts/build_site.py
```

または GitHub → Actions → Build from microCMS → Run workflow

生成対象: `menu.html` / `course.html` / `about.html` / `shop.html` / `recruit.html` / `privacy.html` と、TOPの名物・おすすめ・コース枠。

リポジトリ Secrets に `MICROCMS_API_KEY`（読み取りキー）が必要です。

## ページ構成

| ファイル | 内容 |
| --- | --- |
| `index.html` | トップページ |
| `menu.html` | 名物料理・単品メニュー |
| `course.html` | 宴会・飲み放題・コース |
| `takeout.html` | テイクアウト案内 |
| `shop.html` | 店内紹介・店舗情報・アクセス |
| `about.html` | 店主あいさつ・会社概要 |
| `recruit.html` | スタッフ募集（ホール・キッチン） |
| `privacy.html` | プライバシーポリシー |
| `reserve.html` | 来店予約フォーム |
| `thanks.html` | フォーム送信後の完了ページ |

## ローカルでの確認方法

```bash
cd "愛媛の雅ちゃん"
python3 -m http.server 8080
```

ブラウザで `http://localhost:8080` を開いてください。

## 予約・テイクアウトフォームについて

`reserve.html` / `takeout.html` のフォームは、現時点ではデモ動作です。

確認画面と送信アニメーションのあと完了ページへ遷移しますが、店舗への実送信（メール送信や予約システム連携）は未実装です。

## 外部予約URL

`js/main.js` 内の `EXTERNAL_RESERVATION_URL` で設定しています（ホットペッパー店舗ページ）。

## 画像

- `assets/images/site/` … サイト表示用（WebP）
- `assets/images/original/` … 元画像の保管用
- `assets/icons/` … ファビコン

SVGの和柄パターンはそのまま使用しています。
