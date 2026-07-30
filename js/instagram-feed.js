/**
 * Instagram グリッド（固定表示）
 *
 * Instagramアカウント連携なしで、手元の投稿／写真をグリッド表示します。
 * 投稿URLを POSTS に入れると、その埋め込みに切り替わります。
 * 空のときは FALLBACK（店舗にある写真）を表示し、タップでプロフィールへ飛びます。
 */
(function () {
  "use strict";

  var PROFILE_URL = "https://www.instagram.com/ehimenomasa/";

  /**
   * Instagram投稿／リールのパーマリンク
   * 例:
   *   "https://www.instagram.com/p/XXXXXXXXXX/"
   *   "https://www.instagram.com/reel/YYYYYYYYYY/"
   */
  var POSTS = [
    "https://www.instagram.com/p/DaRmsPaj3fP/",
    "https://www.instagram.com/p/Dat7fFfj4Nv/",
    "https://www.instagram.com/p/DXgKKYADnut/"
  ];

  /** 投稿URL未設定時：すでにある店舗写真でグリッドを構成 */
  var FALLBACK = [
    { src: "assets/images/site/specialty-honetsukidori-oya.jpg", alt: "丸亀名物 骨付鳥（おや）" },
    { src: "assets/images/site/specialty-honetsukidori-hina.jpg", alt: "丸亀名物 骨付鳥（ひな）" },
    { src: "assets/images/site/specialty-tebasaki.jpg", alt: "名古屋名物 手羽先" },
    { src: "assets/images/site/dish-tori-tataki.jpg", alt: "本家直伝とりのたたき" },
    { src: "assets/images/site/dish-kawaage-hidaredare.jpg", alt: "かわ揚げ秘伝ダレかけ" },
    { src: "assets/images/site/dish-jakoten.jpg", alt: "愛媛名物 じゃこてん" },
    { src: "assets/images/site/course-mankitsu.jpg", alt: "コース料理" },
    { src: "assets/images/site/interior-dining.jpg", alt: "店内のテーブル席" },
    { src: "assets/images/site/gallery-shop-01.jpg", alt: "店内の様子" }
  ];

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  function parseInstagramUrl(url) {
    var m = String(url).match(/instagram\.com\/(p|reel|tv)\/([^\/\?\#]+)/i);
    if (!m) return null;
    return { type: m[1].toLowerCase(), code: m[2] };
  }

  function renderEmbeds(root, urls) {
    root.className = "ig-grid ig-grid--embed reveal";
    root.innerHTML = "";
    urls.forEach(function (url) {
      var parsed = parseInstagramUrl(url);
      if (!parsed) return;
      var item = document.createElement("div");
      item.className = "ig-grid__item ig-grid__item--embed";
      var frame = document.createElement("iframe");
      // 投稿・リール・IGTV いずれも対応
      frame.src = "https://www.instagram.com/" + parsed.type + "/" + parsed.code + "/embed/";
      frame.loading = "lazy";
      frame.title = parsed.type === "reel" ? "Instagramリール" : "Instagram投稿";
      frame.setAttribute("allowtransparency", "true");
      frame.setAttribute("frameborder", "0");
      frame.setAttribute("scrolling", "no");
      frame.setAttribute("allow", "autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share");
      item.appendChild(frame);
      root.appendChild(item);
    });
  }

  function renderFallback(root) {
    root.className = "ig-grid ig-grid--fallback reveal";
    root.innerHTML = "";
    FALLBACK.forEach(function (post) {
      var a = document.createElement("a");
      a.className = "ig-grid__item";
      a.href = PROFILE_URL;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.setAttribute("aria-label", "Instagramで見る：" + post.alt);
      var img = document.createElement("img");
      img.src = post.src;
      img.alt = post.alt;
      img.loading = "lazy";
      a.appendChild(img);
      root.appendChild(a);
    });
  }

  ready(function () {
    var root = document.querySelector("[data-instagram-grid]");
    if (!root) return;

    var urls = POSTS.map(function (u) { return String(u).trim(); }).filter(Boolean);
    var status = document.querySelector("[data-instagram-status]");

    if (urls.length) {
      renderEmbeds(root, urls);
      if (status) {
        status.textContent = "Instagramより";
        status.hidden = false;
      }
      return;
    }

    renderFallback(root);
    if (status) {
      status.hidden = true;
    }
  });
})();
