/**
 * 予約・テイクアウトフォームの仮実装
 * 実際の送信は行わず、確認メッセージを表示する
 */
(function () {
  "use strict";

  var DEMO_MESSAGE = "現在は提案用サイトのため、フォーム送信機能は実装されていません。";

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  function ensureModal() {
    var modal = document.getElementById("demo-modal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "demo-modal";
    modal.className = "modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "demo-modal-title");
    modal.hidden = true;
    modal.innerHTML =
      '<div class="modal__backdrop" data-modal-close></div>' +
      '<div class="modal__dialog">' +
      '<button type="button" class="modal__close" data-modal-close aria-label="閉じる">×</button>' +
      '<h2 class="modal__title" id="demo-modal-title">送信について</h2>' +
      '<p class="modal__body"></p>' +
      '<div class="form-actions"><button type="button" class="btn btn--primary" data-modal-close>閉じる</button></div>' +
      "</div>";
    document.body.appendChild(modal);
    return modal;
  }

  function openModal(message) {
    var modal = ensureModal();
    var body = modal.querySelector(".modal__body");
    body.textContent = message;
    modal.hidden = false;
    modal.classList.add("is-open");
    var closeBtn = modal.querySelector(".modal__close");
    if (closeBtn) closeBtn.focus();
  }

  function closeModal() {
    var modal = document.getElementById("demo-modal");
    if (!modal) return;
    modal.classList.remove("is-open");
    modal.hidden = true;
  }

  function initModalEvents() {
    document.addEventListener("click", function (e) {
      var target = e.target;
      if (target && target.closest && target.closest("[data-modal-close]")) {
        closeModal();
      }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeModal();
    });
  }

  function initForms() {
    var forms = document.querySelectorAll("[data-demo-form]");
    forms.forEach(function (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        openModal(DEMO_MESSAGE);
      });
    });
  }

  ready(function () {
    initModalEvents();
    initForms();
  });
})();
