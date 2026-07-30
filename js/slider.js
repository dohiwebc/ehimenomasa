/**
 * ヒーロースライダー（クロスフェード）
 * - 自動切替 約5.5秒
 * - 前後ボタン / ドット / キーボード操作
 */
(function () {
  "use strict";

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  function initSlider(root) {
    var slides = Array.prototype.slice.call(root.querySelectorAll(".hero__slide"));
    if (slides.length < 2) return;

    var dotsWrap = root.querySelector(".hero__dots");
    var prevBtn = root.querySelector('[data-slider="prev"]');
    var nextBtn = root.querySelector('[data-slider="next"]');
    var index = 0;
    var timer = null;
    var interval = 5500;
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function setActive(i) {
      index = (i + slides.length) % slides.length;
      slides.forEach(function (slide, n) {
        var active = n === index;
        slide.classList.toggle("is-active", active);
        slide.setAttribute("aria-hidden", active ? "false" : "true");
      });
      if (dotsWrap) {
        Array.prototype.forEach.call(dotsWrap.children, function (dot, n) {
          var active = n === index;
          dot.classList.toggle("is-active", active);
          if (active) {
            dot.setAttribute("aria-current", "true");
          } else {
            dot.removeAttribute("aria-current");
          }
        });
      }
    }

    function next() {
      setActive(index + 1);
    }

    function prev() {
      setActive(index - 1);
    }

    function stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }

    function start() {
      stop();
      if (!reduce) {
        timer = setInterval(next, interval);
      }
    }

    // ドット生成
    if (dotsWrap) {
      dotsWrap.innerHTML = "";
      slides.forEach(function (_, n) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "hero__dot";
        btn.setAttribute("aria-label", "スライド" + (n + 1) + "を表示");
        btn.addEventListener("click", function () {
          setActive(n);
          start();
        });
        dotsWrap.appendChild(btn);
      });
    }

    if (prevBtn) {
      prevBtn.addEventListener("click", function () {
        prev();
        start();
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener("click", function () {
        next();
        start();
      });
    }

    root.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
        start();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
        start();
      }
    });

    root.addEventListener("mouseenter", stop);
    root.addEventListener("mouseleave", start);
    root.addEventListener("focusin", stop);
    root.addEventListener("focusout", function (e) {
      if (!root.contains(e.relatedTarget)) start();
    });

    setActive(0);
    start();
  }

  ready(function () {
    document.querySelectorAll("[data-hero-slider]").forEach(initSlider);
  });
})();
