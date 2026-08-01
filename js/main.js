/**
 * メインスクリプト
 * - ヘッダー固定 / 透過切替
 * - ハンバーガーメニュー
 * - スクロール出現アニメーション
 * - 外部予約URL制御
 */

(function () {
  "use strict";

  /** 外部予約サイトURL（未設定の場合は空文字） */
  var EXTERNAL_RESERVATION_URL = "https://www.hotpepper.jp/strJ004612520/";

  window.MASA_CONFIG = {
    EXTERNAL_RESERVATION_URL: EXTERNAL_RESERVATION_URL
  };

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  function initHeader() {
    var header = document.querySelector(".site-header");
    if (!header) return;

    var onHero = header.classList.contains("site-header--on-hero");
    var mobileMq = window.matchMedia("(max-width: 768px)");

    function update() {
      var scrolled = window.scrollY > 40;
      if (!onHero) {
        header.classList.add("is-solid");
        header.classList.remove("is-transparent");
        return;
      }
      /* スマホは最初から通常の帯。PCのみヒーロー上で透過 */
      if (mobileMq.matches || scrolled) {
        header.classList.add("is-solid");
        header.classList.remove("is-transparent");
      } else {
        header.classList.add("is-transparent");
        header.classList.remove("is-solid");
      }
    }

    update();
    window.addEventListener("scroll", update, { passive: true });
    if (typeof mobileMq.addEventListener === "function") {
      mobileMq.addEventListener("change", update);
    } else if (typeof mobileMq.addListener === "function") {
      mobileMq.addListener(update);
    }
  }

  function initNav() {
    var toggle = document.querySelector(".nav-toggle");
    var nav = document.querySelector(".site-nav");
    if (!toggle || !nav) return;

    var scrollLockY = 0;

    function lockScroll() {
      scrollLockY = window.scrollY || window.pageYOffset || 0;
      document.documentElement.classList.add("is-menu-open");
      document.body.classList.add("is-menu-open");
      document.body.style.position = "fixed";
      document.body.style.top = "-" + scrollLockY + "px";
      document.body.style.left = "0";
      document.body.style.right = "0";
      document.body.style.width = "100%";
    }

    function unlockScroll() {
      document.documentElement.classList.remove("is-menu-open");
      document.body.classList.remove("is-menu-open");
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.left = "";
      document.body.style.right = "";
      document.body.style.width = "";
      window.scrollTo(0, scrollLockY);
    }

    function closeMenu() {
      if (!document.body.classList.contains("is-menu-open")) return;
      unlockScroll();
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "メニューを開く");
      nav.setAttribute("aria-hidden", "true");
    }

    function openMenu() {
      lockScroll();
      toggle.setAttribute("aria-expanded", "true");
      toggle.setAttribute("aria-label", "メニューを閉じる");
      nav.setAttribute("aria-hidden", "false");
    }

    toggle.addEventListener("click", function () {
      if (document.body.classList.contains("is-menu-open")) {
        closeMenu();
      } else {
        openMenu();
      }
    });

    nav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", closeMenu);
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeMenu();
    });

    /* iOSなどで背後が動くのを防ぐ */
    document.addEventListener(
      "touchmove",
      function (e) {
        if (!document.body.classList.contains("is-menu-open")) return;
        if (nav.contains(e.target)) return;
        e.preventDefault();
      },
      { passive: false }
    );

    window.addEventListener("resize", function () {
      if (window.innerWidth > 1024) closeMenu();
    });

    // 初期状態（PCでは常に表示、SPでは閉）
    if (window.innerWidth <= 1024) {
      nav.setAttribute("aria-hidden", "true");
    } else {
      nav.removeAttribute("aria-hidden");
    }
  }

  function initReveal() {
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var items = document.querySelectorAll(".reveal");
    if (!items.length) return;

    if (reduce || !("IntersectionObserver" in window)) {
      items.forEach(function (el) {
        el.classList.add("is-visible");
      });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );

    items.forEach(function (el) {
      observer.observe(el);
    });
  }

  function initExternalReservation() {
    var url = (window.MASA_CONFIG && window.MASA_CONFIG.EXTERNAL_RESERVATION_URL) || "";
    var links = document.querySelectorAll("[data-external-reserve]");

    links.forEach(function (el) {
      if (url) {
        el.setAttribute("href", url);
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener noreferrer");
        el.removeAttribute("aria-disabled");
        el.classList.remove("btn--disabled");
        el.hidden = false;
      } else {
        // 未設定時は非表示
        el.hidden = true;
        el.setAttribute("aria-disabled", "true");
        el.removeAttribute("href");
        el.removeAttribute("target");
        el.removeAttribute("rel");
      }
    });
  }

  function initLightbox() {
    var root = document.createElement("div");
    root.className = "lightbox";
    root.setAttribute("hidden", "");
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "画像プレビュー");
    root.innerHTML =
      '<div class="lightbox__backdrop" data-lightbox-close></div>' +
      '<figure class="lightbox__figure">' +
      '<img class="lightbox__img" alt="">' +
      '<figcaption class="lightbox__caption" hidden></figcaption>' +
      "</figure>" +
      '<div class="lightbox__controls">' +
      '<button type="button" class="lightbox__nav lightbox__nav--prev" aria-label="前の画像">' +
      '<svg class="lightbox__nav-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<path d="M14.8 5.2 8.5 12l6.3 6.8" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/>' +
      "</svg>" +
      "</button>" +
      '<span class="lightbox__controls-divider" aria-hidden="true"></span>' +
      '<button type="button" class="lightbox__nav lightbox__nav--next" aria-label="次の画像">' +
      '<svg class="lightbox__nav-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<path d="M9.2 5.2 15.5 12l-6.3 6.8" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/>' +
      "</svg>" +
      "</button>" +
      "</div>" +
      '<button type="button" class="lightbox__close" data-lightbox-close aria-label="閉じる">' +
      '<svg class="lightbox__close-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<path d="M6.2 6.2 17.8 17.8M17.8 6.2 6.2 17.8" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/>' +
      "</svg>" +
      "</button>";
    document.body.appendChild(root);

    var imgEl = root.querySelector(".lightbox__img");
    var capEl = root.querySelector(".lightbox__caption");
    var controls = root.querySelector(".lightbox__controls");
    var prevBtn = root.querySelector(".lightbox__nav--prev");
    var nextBtn = root.querySelector(".lightbox__nav--next");
    var items = [];
    var index = 0;
    var lastFocus = null;
    var closing = false;
    var closeTimer = null;

    function prefersReducedMotion() {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }

    function isPreviewable(img) {
      if (!img || img.tagName !== "IMG") return false;
      if (img.closest(".site-header, .site-footer, .mobile-bar, .lightbox, .modal, .ig-grid, [data-instagram-grid], .video-card")) return false;
      if (!img.getAttribute("src")) return false;
      return true;
    }

    function collectItems() {
      return Array.prototype.slice.call(document.querySelectorAll("main img")).filter(isPreviewable);
    }

    function captionFor(img) {
      var custom = (img.getAttribute("data-caption") || "").trim();
      if (custom) return custom;
      return (img.alt || "").trim();
    }

    function show(i) {
      if (!items.length) return;
      index = (i + items.length) % items.length;
      var img = items[index];
      var src = img.currentSrc || img.getAttribute("src");
      imgEl.src = src;
      imgEl.alt = img.alt || "";
      var caption = captionFor(img);
      if (caption) {
        capEl.textContent = caption;
        capEl.hidden = false;
      } else {
        capEl.textContent = "";
        capEl.hidden = true;
      }
      var multi = items.length > 1;
      controls.hidden = !multi;
      prevBtn.hidden = false;
      nextBtn.hidden = false;
    }

    function finishClose() {
      closing = false;
      if (closeTimer) {
        window.clearTimeout(closeTimer);
        closeTimer = null;
      }
      root.setAttribute("hidden", "");
      document.body.classList.remove("is-lightbox-open");
      imgEl.removeAttribute("src");
      items = [];
      if (lastFocus && typeof lastFocus.focus === "function") {
        lastFocus.focus();
      }
    }

    function open(img) {
      if (closing) {
        finishClose();
      }
      items = collectItems();
      var i = items.indexOf(img);
      if (i < 0) {
        items = [img];
        i = 0;
      }
      lastFocus = document.activeElement;
      root.removeAttribute("hidden");
      document.body.classList.add("is-lightbox-open");
      show(i);
      // 初期状態から開くアニメを発火させる
      root.classList.remove("is-open");
      void root.offsetWidth;
      root.classList.add("is-open");
      root.querySelector(".lightbox__close").focus();
    }

    function close() {
      if (!root.classList.contains("is-open") && !closing) return;
      closing = true;
      root.classList.remove("is-open");

      if (prefersReducedMotion()) {
        finishClose();
        return;
      }

      var done = false;
      function onEnd(e) {
        if (e.target !== root) return;
        if (done) return;
        done = true;
        root.removeEventListener("transitionend", onEnd);
        finishClose();
      }
      root.addEventListener("transitionend", onEnd);
      closeTimer = window.setTimeout(function () {
        root.removeEventListener("transitionend", onEnd);
        finishClose();
      }, 360);
    }

    function prev() {
      show(index - 1);
    }

    function next() {
      show(index + 1);
    }

    document.addEventListener("click", function (e) {
      var img = e.target.closest("img");
      if (!img || !isPreviewable(img)) return;
      e.preventDefault();
      open(img);
    });

    // ダブルタップ／ダブルクリックによるズームを抑止
    document.addEventListener(
      "dblclick",
      function (e) {
        if (e.target.closest(".lightbox") || (e.target.closest("main img") && isPreviewable(e.target.closest("img")))) {
          e.preventDefault();
        }
      },
      { passive: false }
    );
    root.addEventListener(
      "gesturestart",
      function (e) {
        e.preventDefault();
      },
      { passive: false }
    );

    root.addEventListener("click", function (e) {
      if (e.target.closest("[data-lightbox-close]")) {
        close();
      }
    });

    prevBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      prev();
    });
    nextBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      next();
    });

    document.addEventListener("keydown", function (e) {
      if (!root.classList.contains("is-open")) return;
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    });
  }

  function initVideoPopup() {
    var triggers = document.querySelectorAll("[data-youtube-id]");
    if (!triggers.length) return;

    var modal = document.createElement("div");
    modal.className = "video-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", "動画再生");
    modal.hidden = true;
    modal.innerHTML =
      '<div class="video-modal__backdrop" data-video-close></div>' +
      '<div class="video-modal__dialog">' +
      '<button type="button" class="video-modal__close" data-video-close aria-label="閉じる">×</button>' +
      '<div class="video-modal__frame"></div>' +
      "</div>";
    document.body.appendChild(modal);

    var frame = modal.querySelector(".video-modal__frame");
    var closeBtn = modal.querySelector(".video-modal__close");

    function close() {
      frame.innerHTML = "";
      modal.classList.remove("is-open");
      modal.hidden = true;
      document.body.classList.remove("is-video-open");
    }

    function open(id) {
      var origin = "";
      try {
        if (location.protocol === "http:" || location.protocol === "https:") {
          origin = "&origin=" + encodeURIComponent(location.origin);
        }
      } catch (err) {}

      frame.innerHTML =
        '<iframe src="https://www.youtube.com/embed/' +
        encodeURIComponent(id) +
        "?autoplay=1&rel=0" +
        origin +
        '" title="YouTube動画" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>';

      modal.hidden = false;
      modal.classList.add("is-open");
      document.body.classList.add("is-video-open");
      closeBtn.focus();
    }

    triggers.forEach(function (trigger) {
      trigger.addEventListener("click", function (e) {
        var id = trigger.getAttribute("data-youtube-id");
        if (!id) return;

        // file:// では YouTube 埋め込みが弾かれるため、公式ページへ
        if (location.protocol === "file:") {
          return;
        }

        e.preventDefault();
        open(id);
      });
    });

    modal.addEventListener("click", function (e) {
      if (e.target.closest("[data-video-close]")) close();
    });

    document.addEventListener("keydown", function (e) {
      if (!modal.classList.contains("is-open")) return;
      if (e.key === "Escape") close();
    });
  }

  ready(function () {
    initHeader();
    initNav();
    initReveal();
    initExternalReservation();
    initLightbox();
    initVideoPopup();
  });
})();