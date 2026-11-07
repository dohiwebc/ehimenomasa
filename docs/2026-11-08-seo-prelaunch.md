# 本番公開前SEO整備（2026-11-08）

更新：追加指示によりRestaurantのpriceRangeとYouTubeのsameAsを削除し、確認済み旧URLの301を14件追加しました。以下の初回記録より[SEO最終調整の報告](2026-11-08-seo-final.md)を優先してください。

作業ブランチ：`codex/seo-prelaunch`。比較元：`c307f8a`。
確認用：[プレビュー](https://codex-site-review.ehimenomasa.pages.dev/)、[404の確認](https://codex-site-review.ehimenomasa.pages.dev/this-page-does-not-exist)。

本番サイト・DNS・各サービスの管理画面・CMSは変更していません。本番フォームも送信していません。

## やった

### A・B・I・K：404、ホスト別の検索制御、正規URL

- 共通ヘッダー・フッターと既存のクラスを使った404を追加。トップ・お品書き・予約へ移動できます。CSSの追加・変更はありません。
- 404は`noindex`、canonicalなし。深いパスのエラーでもCSS・画像・JSが読めるよう、このページのアセット参照はルート相対です。
- トップレベルの`404.html`によりCloudflare PagesのSPAフォールバックを停止。`/this-page-does-not-exist`、`/access`、`/nested/deep/missing`、`/404`で、実HTTP 404と正しいエラー本文を確認しました。
- Functions/middlewareで本番ホストとその他を明示的に分け、引き継いだ`X-Robots-Tag`も通常の本番ページでは削除します。
- `.html`、既存ページの末尾`/`、`/index`はクリーンURLへ301。クエリは維持します。`www`は非wwwへ301。wwwのDNS・TLS接続は別途必要です。
- 本番のpages.devから`.com`への転送は従来どおり`CANONICAL_REDIRECT=1`のときだけ。プレビューから本番への転送はしません。
- `_redirects`は確認済みの旧URLを書き足せるコメントのみ。200の包括フォールバック、未確認の`/access`転送は追加していません。

#### noindexの出力元とレスポンス設計

| ホスト・ページ | HTTP上の設計 | HTML meta |
| --- | --- | --- |
| `ehimenomasa.com`の通常ページ | `X-Robots-Tag`を削除 | noindexなし |
| `www.ehimenomasa.com` | 非wwwへ301。noindexは付けない | 転送先に従う |
| `ehimenomasa.pages.dev` | noindex。転送フラグ有効時は`.com`へ301 | 通常ページにnoindex metaなし |
| プレビュー・その他のホスト | `X-Robots-Tag: noindex` | 同上 |
| `/thanks`・`/thanks-recruit`（全ホスト） | `noindex, nofollow` | `noindex, nofollow`を維持 |
| 不明なパス・`/404` | HTTP 404、`noindex` | `noindex`、canonicalなし |

出力元は、（1）Cloudflare Pagesのプレビュー既定ヘッダー、（2）`functions/_middleware.js`、（3）`thanks.html`・`thanks-recruit.html`・`404.html`のmetaです。404のmetaはテンプレートの`robots`引数から生成します。`_headers`は存在せず、index制御用の環境フラグもありません。`CANONICAL_REDIRECT`は転送だけのフラグです。

作業前の実測：プレビューでは通常ページ・不明パスにnoindex。本番pages.devではnoindexなし。不明パスはどちらも200でトップを返していました。作業後はプレビューで404とnoindexを確認済み。本番`.com`はまだ旧サイトのため、切替後の実レスポンスは未確認です。本番ホスト・www・その他のホストの分岐はモックしたレスポンスを使ってテストしています。

### C：サイトマップ

- 9URLの`lastmod`を実際の更新日へ更新。今回は全件2026-11-08です。
- ビルド時に、未コミットのHTML変更があれば日本時間の当日、変更なしならそのページの最終Gitコミット日を使います。Gitが使えない環境ではファイルの更新日にフォールバックします。単なる再ビルドでは日付を進めません。
- URL、changefreq、priorityは維持。404・完了ページは含めません。
- `robots.txt`はバイト単位で現状維持。`Sitemap: https://ehimenomasa.com/sitemap.xml`も維持しています。

### D・E：キーワード、title・description

- 実際の商品名はお品書きの「川之江名物 揚げ足鳥」です。トップのtitle・OGタイトル・Twitterタイトルだけを「揚げ足鳥」へ統一しました。
- 「揚げ鳥コース」はコースの固有名、「焼き・揚げ鳥」は店舗の業態の表現なので変更していません。本文・見出し・既存altも維持しています。
- 指定6ページのdescriptionを、サイト内にある駅からの距離、コース名、予約方法、募集内容、個人情報の取扱項目だけで95〜107字へ補足。同じ内容をOGP・Twitterにも反映しました。
- title・descriptionは12ページすべてで重複なし。店舗紹介・アクセス・完了ページの短いdescriptionは、対象外なので現状維持です。

修正前の表記の所在・件数（OGP・Twitterの同文再掲は数えず、各HTMLのprimary title・description・H1〜H3・img altを集計）：

| 箇所 | 「揚げ鳥」 | 「揚げ足鳥」 |
| --- | --- | --- |
| title | トップ1件 | お品書き1件 |
| description | コース1件（揚げ鳥コース） | トップ・お品書き・紹介の各1件 |
| H1〜H3 | トップ2件（H1とコース名）、コース1件 | トップ・お品書きの料理名各1件 |
| alt | トップ・コースのコース写真各1件 | トップ・お品書きの料理写真各1件 |

本文の単純集計では共通フッター等の「揚げ鳥」が多くなりますが、異なる料理名へ一括置換はしていません。骨付鳥・手羽先の表記はメタ情報・料理見出し・構造化データで確認。動画紹介画像のaltに1件ある「骨付き鳥」は既存の放送題名の表記のため、そのままです。

### F：構造化データ・ローカルSEO

- Restaurantの電話を`+81-89-913-1194`へ変更。画面上の電話番号は変更していません。
- `priceRange`は円記号だけ`¥1,000〜¥3,000`へ修正。金額は未確認のため変更していません。
- `servesCuisine`に実在メニューの骨付鳥・揚げ足鳥・手羽先を補足。
- 営業時間は月〜土17:30〜22:30で本文と一致。通常営業日だけを記載し、日曜の特別営業日を創作していません。祝日定休は本文にあり、未確認の日付別営業時間は追加していません。
- `menu`は`/menu`、ReserveActionは`/reserve`。いずれも存在し、200を確認。`acceptsReservations: true`は維持。
- Instagram・HotPepper・GoogleマップのsameAsを維持。YouTubeは未変更（下記提案）。評価・口コミ・受賞歴などは追加していません。
- 下層のBreadcrumbListは未変更。FAQPageも未変更。質問6件は完全一致し、回答6件は画面上の文面にそのまま含まれることを確認。2件の回答では画面末尾の案内リンクの語句だけがJSON-LDに含まれない既存仕様です。内容の矛盾はありません。
- `/shop`には住所、松山市駅、徒歩30秒が既に本文としてあるため、追記していません。

### G・H・J：OGP、画像、Search Console

- 12ページすべてにog:type、og:locale、og:site_name、og:image、Twitterのsummary_large_imageを確認。通常・完了ページのog:urlはcanonicalと一致。404には正規URLを宣言しないため両方を付けていません。
- 画像はすべてalt属性とwidth/heightあり。装飾アイコンの空altは維持。
- トップFVのキャッチ画像のlazyを解除し、キャッチ画像と先頭背景のpreloadにfetchpriorityを設定。
- トップ下部のHotPepper・LINE画像、予約ページ下部のLINE画像をlazy化。ヘッダーと予約ページ冒頭のロゴはFVに入るため即時読み込みを維持しました。他の本文画像は既にlazyです。
- Google Fontsはpreconnect（2ホスト）とdisplay=swapを確認。フォント自体は変更していません。
- 全ページのheadへ`<!-- TODO: google-site-verification -->`を用意。実コードやGA4などは追加していません。

## 全ページのメタ情報・H1

canonicalとog:urlの列は`https://ehimenomasa.com`に続くパスです。全行でOGP・Twitterの必須項目は確認済み。T/Dは通常の文字数で、全角換算ではありません。

| パス | title（T字数） | description（D字数） | canonical / og:url | H1 |
| --- | --- | --- | --- | --- |
| `/` | 愛媛の雅ちゃん｜松山市駅前の骨付鳥・揚げ足鳥の居酒屋（26） | 松山市駅から徒歩30秒。丸亀名物の骨付鳥、川之江名物の揚げ足鳥、名古屋名物の手羽先が楽しめる居酒屋。宴会・テイクアウトも対応。（63） | `/` | 愛媛の雅ちゃん｜松山市駅前の骨付鳥・揚げ鳥の居酒屋 |
| `/menu` | お品書き｜松山 骨付鳥・揚げ足鳥の居酒屋 愛媛の雅ちゃん（28） | 松山市駅から徒歩30秒の居酒屋「愛媛の雅ちゃん」のお品書き。丸亀名物の骨付鳥、川之江名物の揚げ足鳥、名古屋名物の手羽先をはじめ、一品料理やご飯ものをご案内。価格は税込表示です。テイクアウトも承ります。（100） | `/menu` | お品書き |
| `/course` | 宴会・コース｜松山市駅の飲み放題 愛媛の雅ちゃん（24） | 松山市駅から徒歩30秒「愛媛の雅ちゃん」の宴会・コース案内。満喫・親雛・揚げ鳥コースと飲み放題をご用意しています。コースは2名様以上の前日予約が必要です。当日予約希望の場合もご相談ください。（95） | `/course` | 宴会・コース |
| `/shop` | 店内・アクセス｜松山市駅から徒歩30秒の居酒屋 愛媛の雅ちゃん（31） | 松山市駅から徒歩30秒、健勝ビル2階。店内の雰囲気・アクセス・席のご案内。駐車場はありません。（47） | `/shop` | 店内・アクセス |
| `/about` | 雅ちゃんについて｜松山市駅前の居酒屋 愛媛の雅ちゃん（26） | 松山市駅前で骨付鳥・揚げ足鳥・手羽先を提供する居酒屋「愛媛の雅ちゃん」の店主あいさつ、コンセプト、会社概要。（54） | `/about` | 雅ちゃんについて |
| `/reserve` | ご予約｜松山市駅前の居酒屋 愛媛の雅ちゃん（21） | 松山市駅から徒歩30秒の居酒屋「愛媛の雅ちゃん」のご来店予約。WEBフォーム・電話・LINE・ホットペッパーグルメから受け付けています。席のみのご予約や、満喫・親雛・揚げ鳥コースのご相談はこちら。（98） | `/reserve` | ご予約 |
| `/takeout` | テイクアウト｜松山市駅 骨付鳥の持ち帰り 愛媛の雅ちゃん（28） | 松山市駅から徒歩30秒「愛媛の雅ちゃん」のテイクアウト予約。骨付鳥などの持ち帰りをWEBフォーム・電話で受け付けています。受取希望日時・商品・個数をご指定ください。容器代や受付方法もご確認いただけます。（101） | `/takeout` | テイクアウト |
| `/recruit` | スタッフ募集｜松山市駅の居酒屋 愛媛の雅ちゃん（23） | 松山市駅から徒歩30秒の居酒屋「愛媛の雅ちゃん」のスタッフ募集。正社員とアルバイトの募集条件、給与・勤務時間、仕事内容をご案内。WEBフォーム・電話から応募を受け付けています。勤務地は松山市湊町、健勝ビル2階です。（107） | `/recruit` | スタッフ募集 |
| `/privacy` | プライバシーポリシー｜愛媛の雅ちゃん（18） | 愛媛の雅ちゃん（株式会社雅道）のプライバシーポリシー。来店・テイクアウト予約、採用応募、電話で取得する個人情報の利用目的・保存期間・請求手続き、外部サービスとCookieの取り扱い、お問い合わせ窓口をご案内します。（107） | `/privacy` | プライバシーポリシー |
| `/thanks` | 送信完了｜愛媛の雅ちゃん（12） | フォーム送信完了のご案内。（13） | `/thanks` | 送信完了しました |
| `/thanks-recruit` | 応募完了｜スタッフ募集｜愛媛の雅ちゃん（19） | スタッフ応募の送信完了のご案内。（16） | `/thanks-recruit` | 応募を受け付けました |
| エラーページ | ページが見つかりません｜愛媛の雅ちゃん（19） | お探しのページが見つかりません。愛媛の雅ちゃんのトップページ、お品書き、ご予約はこちらからご確認ください。（53） | 両方なし（404・noindex） | お探しのページが見つかりません |

全ページのOG共通値：type=`website`、locale=`ja_JP`、site_name=`愛媛の雅ちゃん`、image=`https://ehimenomasa.com/assets/images/site/hero-chicken-dishes.webp`、twitter:card=`summary_large_image`。OG/Twitterのtitle・descriptionは各行の値と一致しています。

## 提案のみで実施していない

- **YouTubeのsameAs**：現在は単一動画の`watch?v=NZCcz-p8HAk`です。店舗公式チャンネルのURLではないため、sameAsから外すことを推奨します。指示どおり、判断前に削除していません。
- **`/access`→`/shop`**：旧URLの意図を確認できていないため、301は未設定。現在は正しく404です。採用する場合は確認後に転送を追加します。
- **トップH1**：既存のsr-onlyは「揚げ鳥」、titleは実際の名物品名「揚げ足鳥」です。総称と品名として意味は整合しますが、完全一致を望む場合はH1のsr-onlyも「揚げ足鳥」に揃える案です。H1は変更許可がないため維持しました。
- **OGP画像**：現画像は800×600（4:3）。1200×630（約1.90:1）とは異なります。専用SNS画像を別途作る案に留め、既存画像・参照先・見た目は変更していません。
- **Google Maps以外の店舗情報追加・GA4等**：行っていません。住所・駅・徒歩時間は既に掲載済みで、解析追加の指定もありません。

## 確認が必要

- **客単価**：`¥1,000〜¥3,000`の妥当性。コースは4,800〜6,000円、単品飲み放題と最低フード注文額の合計は4,290円（お通し別）ですが、これだけで全来店客の平均客単価は決められないため金額は維持しました。
- **本番`.com`のHTTP応答**：現時点は旧サイト。本番切替後、通常9ページにnoindexがないこと、404・完了ページには残ること、wwwの301を実レスポンスで再確認してください。
- **旧URL一覧**：旧サイトのURLが提供されていないので、個別の移行301は追加できません。Cloudflareの200フォールバックでURLの存在を判断しないでください。
- **本番ホストのフォーム設定**：FormspreeとTurnstile側の許可設定は管理画面で確認が必要。今回の確認では送信していません。

## 管理画面でやること

- [ ] PagesプロジェクトのCustom domainsで`ehimenomasa.com`をProductionへ接続し、DNS・TLSが有効になったことを確認。
- [ ] `www`もPagesへ接続してコード側301を利用するか、CloudflareのBulk Redirectsを設定。後者はsource=`www.ehimenomasa.com`、target=`https://ehimenomasa.com`、301、クエリ保持・サブパス一致・パス接尾辞保持を有効にし、リストを参照するルールを作成。DNSの`www`はプロキシを有効にしてリダイレクトが通る構成にする。既存DNSの上書きは現在の構成を確認してから行う。
- [ ] `.com`で新サイトを確認後、Productionの`CANONICAL_REDIRECT=1`を有効化して再デプロイ。Preview側は無効のまま。
- [ ] 旧サイトのURL一覧を用意し、確認済みのURLだけ`_redirects`またはCloudflare側へ301追加。`/access`→`/shop`の採否も確認。
- [ ] Search Consoleでドメインプロパティを登録。DNS認証ならHTML metaは不要。URLプレフィックス認証でmetaを使う場合はTODOコメント位置に実際の確認コードを設定。
- [ ] Search Consoleへ`https://ehimenomasa.com/sitemap.xml`を送信し、URL検査でcanonical・noindex・404を確認。
- [ ] Googleビジネスプロフィールのウェブサイト欄を`https://ehimenomasa.com/`へ変更。
- [ ] Formspreeの3フォーム、Turnstileの許可ホストを新ドメインへ対応。既存pages.devの利用を終了するまでは移行中の設定を維持。
- [ ] Cloudflare側の既存ヘッダールール・キャッシュルール等がコードの検索制御を上書きしていないことを切替後に確認。

## 変更ファイルと理由

| ファイル | 理由 |
| --- | --- |
| `404.html`、`templates/404.html.j2` | 共通デザインの実404、noindex、canonicalなし、ルート相対アセット |
| `functions/_middleware.js` | ホスト別index制御、完了・404の除外、www・拡張子・末尾スラッシュの301 |
| `_redirects` | 旧URL一覧受領後の記入形式をコメントで用意。実転送は未追加 |
| `templates/macros.j2` | 404用canonical・robots指定、Search Console用コメント |
| `templates/menu.html.j2`、`templates/course.html.j2`、`templates/recruit.html.j2`、`templates/privacy.html.j2` | 確認できる情報だけでdescription補足 |
| `index.html` | タイトルの品名、Restaurantの電話・円記号・料理キーワード、FV読込優先度、下部画像のlazy |
| `reserve.html`、`takeout.html` | description補足、予約下部LINE画像のlazy。入力項目・税込注記・価格表示には変更なし |
| `menu.html`、`course.html`、`recruit.html`、`privacy.html` | 上記テンプレートの生成結果 |
| `about.html`、`shop.html`、`thanks.html`、`thanks-recruit.html` | Search Console用コメント。完了ページnoindexは維持 |
| `scripts/seo.py`、`scripts/build_site.py`、`sitemap.xml` | 再生成時のTODOコメント維持と実更新日に基づくlastmod自動更新 |
| `tests/check_site.py`、`tests/functions.mjs` | 404例外・通常ページのnoindex事故・ホスト別制御・転送のテスト |
| `tests/seo_audit.py`、`tests/seo_visual.cjs`、`tests/seo_live.mjs` | メタ・本文不変・画像属性・視覚差分・Cloudflare実HTTPの検証 |
| `README.md`、この報告書 | 切替3行手順、全ページ表、未実施事項と管理画面チェックリスト |

## 最終チェック結果

1. **全12ページ**のtitle・description・OGP・H1・canonicalを確認。404のみcanonical/og:urlなし、他の11ページは新ドメインのクリーンURLで一致。タイトル・descriptionの重複なし。
2. 不明なURL3件と`/404`はプレビュー上で**HTTP 404、noindex、エラー本文、canonicalなし**。深いパスでもCSS・ロゴが読み込まれ、375/1440pxで重なり・横はみ出しなし。
3. プレビューでnoindex、完了2ページでnoindex,nofollowを実測。本番・www・その他のホスト・404・転送のヘッダー分岐はFunctionsテストで確認。本番ドメインの実応答は未切替のため未確認。
4. sitemapの9URLをプレビューの対応パスで取得し、**全件200・canonical/og:urlと一致**。lastmodは全件2026-11-08。robotsは変更なし。
5. 全ページのJSON-LDがJSONとしてパース成功。Restaurant・FAQ・Breadcrumbに架空の情報は追加していません。
6. 内部リンク・アンカー・ローカル画像・CSS画像にリンク切れなし。サイトマップ9ページと完了2ページの実URLで200を確認。
7. トップ・お品書き・コース・予約の375/1440pxで、初期画面と全ページ画像を比較し、**16比較すべて差分0ピクセル**。同一Chrome、外部通信遮断、reduced-motion、画像読込完了後の条件。比較画像は`/private/tmp/masa-seo-visual/`。
8. 既存11ページの本文テキストとCSSは比較元と一致。税込注記、コース注意書き、テイクアウトの商品価格非表示・容器代・選択肢を維持。

ビルド、静的チェック、正規化テスト4件、Functionsテストに成功。本番送信・CMS書き込み・本番デプロイなし。検証用の読み取り結果は`/private/tmp/masa-seo-metadata.json`と`/private/tmp/masa-seo-live.json`に保存しています。

## 参照した公式仕様

- [Cloudflare Pagesの404・SPA・拡張子なしURL](https://developers.cloudflare.com/pages/configuration/serving-pages/)
- [Cloudflareプレビューのnoindex](https://developers.cloudflare.com/pages/configuration/preview-deployments/)
- [Googleのrobots meta・X-Robots-Tag](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag)
- [Cloudflareのwwwからapexへの転送](https://developers.cloudflare.com/pages/how-to/www-redirect/)
