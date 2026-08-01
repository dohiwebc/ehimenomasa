# 愛媛の雅ちゃん 公式サイト

愛媛県松山市の居酒屋「愛媛の雅ちゃん」の公式サイトです。

公開URL: https://dohiwebc.github.io/ehimenomasa/

## サイトの目的

店舗の認知と印象を良くすることを最優先としています。

- 松山市駅から近く、利用しやすいこと
- 名物鶏料理が分かりやすいこと
- 仕事帰りや友人同士など、普段使いしやすい居酒屋であること
- その延長として宴会・歓送迎会にも対応できること
- 温かみがあり、活気のある地域店に見えること

## 使用技術

- HTML
- CSS
- JavaScript

フレームワーク、CMS、Bootstrap、Tailwind CSS、ビルド工程は使用していません。

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
