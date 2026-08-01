/**
 * ヒーロースライダー（クロスフェード）
 * - 自動切替 約5.5秒
 * - 前後ボタン / ドット（tab） / キーボード操作
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
    var sliderId = root.getAttribute("data-slider-id") || "hero";

    slides.forEach(function (slide, n) {
      var panelId = sliderId + "-slide-" + (n + 1);
      var tabId = sliderId + "-tab-" + (n + 1);
      slide.id = panelId;
      slide.setAttribute("role", "tabpanel");
      slide.setAttribute("aria-labelledby", tabId);
    });

    function setActive(i) {
      index = (i + slides.length) % slides.length;
      slides.forEach(function (slide, n) {
        var active = n === index;
        slide.classList.toggle("is-active", active);
        slide.setAttribute("aria-hidden", active ? "false" : "true");
        if (active) {
          slide.removeAttribute("tabindex");
        } else {
          slide.setAttribute("tabindex", "-1");
        }
      });
      if (dotsWrap) {
        Array.prototype.forEach.call(dotsWrap.children, function (dot, n) {
          var active = n === index;
          dot.classList.toggle("is-active", active);
          dot.setAttribute("aria-selected", active ? "true" : "false");
          dot.setAttribute("tabindex", active ? "0" : "-1");
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

    // ドット生成（tablist / tab）
    if (dotsWrap) {
      dotsWrap.setAttribute("role", "tablist");
      if (!dotsWrap.getAttribute("aria-label")) {
        dotsWrap.setAttribute("aria-label", "スライド選択");
      }
      dotsWrap.innerHTML = "";
      slides.forEach(function (slide, n) {
        var btn = document.createElement("button");
        var tabId = sliderId + "-tab-" + (n + 1);
        var panelId = sliderId + "-slide-" + (n + 1);
        var label = slide.getAttribute("aria-label") || ("スライド" + (n + 1));
        btn.type = "button";
        btn.className = "hero__dot";
        btn.id = tabId;
        btn.setAttribute("role", "tab");
        btn.setAttribute("aria-controls", panelId);
        btn.setAttribute("aria-label", label + "を表示");
        btn.setAttribute("aria-selected", "false");
        btn.setAttribute("tabindex", "-1");
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

    if (dotsWrap) {
      dotsWrap.addEventListener("keydown", function (e) {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        var nextIndex = index;
        if (e.key === "ArrowLeft") nextIndex = index - 1;
        if (e.key === "ArrowRight") nextIndex = index + 1;
        if (e.key === "Home") nextIndex = 0;
        if (e.key === "End") nextIndex = slides.length - 1;
        setActive(nextIndex);
        start();
        if (dotsWrap.children[index]) {
          dotsWrap.children[index].focus();
        }
      });
    }

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
