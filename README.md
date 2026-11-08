# 愛媛の雅ちゃん 公式サイト

愛媛県松山市の居酒屋「愛媛の雅ちゃん」の公式サイトです。

現行公開URL: https://ehimenomasa.pages.dev/

切替先の正規URL: https://ehimenomasa.com/

## サイトの目的

店舗の認知と印象を良くすることを最優先としています。

- 松山市駅から近く、利用しやすいこと
- 名物鶏料理が分かりやすいこと
- 仕事帰りや友人同士など、普段使いしやすい居酒屋であること
- その延長として宴会・歓送迎会にも対応できること
- 温かみがあり、活気のある地域店に見えること

## 使用技術

- HTML / CSS / JavaScript（静的サイト・Cloudflare Pages）
- microCMS（お品書き・コース・店舗情報などのコンテンツ）
- Python + Jinja2（ビルド時に HTML を生成）
- Cloudflare Pages Functions（Turnstile 検証・Formspree への中継）

## Cloudflare Pages（*.pages.dev）

GitHub に置いた静的ファイルを、Cloudflare Pages で配信できます（例: `https://ehimenomasa.pages.dev`）。

### ダッシュボードでの作成手順

1. https://dash.cloudflare.com/ → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. リポジトリ **`dohiwebc/ehimenomasa`** を選択
3. ビルド設定:
   - Framework preset: **None**
   - Build command: **`python3 scripts/export_public.py`**（GitHub Actions生成済みHTMLを使用）
   - Build output directory: **`dist`**（リポジトリ直下は公開しない）
   - Root directory: 空欄
4. **Save and Deploy**
5. 発行された `https://xxxx.pages.dev` が仮公開URL

カスタムドメイン（`ehimenomasa.com`）は、あとから Pages の **Custom domains** で追加すればOKです（今は不要）。

### 補足

- `wrangler.toml`の出力先も`dist`です。CLIではリポジトリ直下から`wrangler pages deploy dist`を実行します。`functions/`はFunctionsとしてコンパイルされ、公開静的ファイルには含めません。
- `dist`には許可したHTML・CSS・JS・画像・robots・sitemap・リダイレクト設定だけを出力します。設定、メモ、テスト、環境変数、元画像はコピーしません。
- コンテンツ更新はこれまでどおり microCMS → GitHub Actions で `main` に反映
- Cloudflare Pages は `main` を見て自動デプロイ（Git 連携時）
- ロリポップの旧サイト・お名前.com のドメイン契約はそのまま触れなくてよい

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
python3 scripts/serve.py --port 8080
```

ブラウザで `http://localhost:8080` を開いてください。拡張子なしURLに対応しています。このプレビューではフォームを実送信しません。

## 予約・テイクアウトフォームについて

予約・テイクアウト・応募フォームは `/api/forms/{reserve|takeout|recruit}` へ送信します。Pages Functions が Turnstile を検証し、Formspree へ中継します。

Pages の環境変数 `TURNSTILE_SECRET`、`FORMSPREE_RESERVE`、`FORMSPREE_TAKEOUT`、`FORMSPREE_RECRUIT` を設定してください。値をソースやログに記載しないでください。

ドメイン切替は [2026-11-08の修正・検証報告](docs/2026-11-08-site-review.md) を参照してください。`CANONICAL_REDIRECT=1` を設定した場合だけ、本番の `ehimenomasa.pages.dev` を独自ドメインへ301転送します。カスタムドメインとTLSの接続確認後に有効にしてください。

## 本番切替と検索制御

1. PagesのProductionに`ehimenomasa.com`と`www.ehimenomasa.com`を接続し、DNS・TLSを確認します。
2. 本番2ホストは通常ページのnoindexを外し、その他のホストはnoindex、完了ページ・404は本番でもnoindexにします（Functionsで自動判定）。
3. 接続後だけProductionの`CANONICAL_REDIRECT=1`を有効化します。Search ConsoleをDNS認証する場合はHTML確認metaは不要です。

詳細・管理画面での作業は[公開前SEO整備報告](docs/2026-11-08-seo-prelaunch.md)を参照してください。

## 外部予約URL

`js/main.js` 内の `EXTERNAL_RESERVATION_URL` で設定しています（ホットペッパー店舗ページ）。

## 画像

- `assets/images/site/` … サイト表示用（WebP）
- `assets/images/original/` … 元画像の保管用
- `assets/icons/` … ファビコン

SVGの和柄パターンはそのまま使用しています。
