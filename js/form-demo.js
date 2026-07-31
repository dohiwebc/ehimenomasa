/**
 * 予約・テイクアウトフォーム
 * - 送信前に確認画面
 * - 送信アニメ（手紙→紙飛行機）
 * - 送信完了ページへ遷移
 */
(function () {
  "use strict";

  var STORAGE_KEY = "masa-form-thanks";
  var SENDING_TEXT = "リクエスト送信中...";

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /** ローカル日付を YYYY-MM-DD で返す */
  function todayISO() {
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1);
    var day = String(d.getDate());
    if (m.length < 2) m = "0" + m;
    if (day.length < 2) day = "0" + day;
    return y + "-" + m + "-" + day;
  }

  function isPastDate(value, today) {
    return !!(value && today && value < today);
  }

  function setDateFieldError(el, message) {
    if (!el) return;
    var group = el.closest(".form-group");
    if (!group) return;
    var err = group.querySelector(".date-field__error");
    if (!message) {
      if (err && err.parentNode) err.parentNode.removeChild(err);
      el.classList.remove("is-invalid");
      el.removeAttribute("aria-invalid");
      return;
    }
    if (!err) {
      err = document.createElement("p");
      err.className = "date-field__error";
      err.setAttribute("role", "alert");
      group.appendChild(err);
    }
    err.textContent = message;
    el.classList.add("is-invalid");
    el.setAttribute("aria-invalid", "true");
  }

  /** 過去日なら今日に戻す。不正なら true を返す */
  function clampDateToToday(el, opts) {
    opts = opts || {};
    if (!el || el.type !== "date") return false;
    var today = todayISO();
    el.min = today;
    el.setAttribute("min", today);

    if (!el.value) {
      if (opts.fillEmpty) el.value = today;
      setDateFieldError(el, "");
      return false;
    }

    if (isPastDate(el.value, today)) {
      el.value = today;
      if (opts.showError !== false) {
        setDateFieldError(el, "過去の日付は選択できません。本日以降の日付を選んでください。");
      } else {
        setDateFieldError(el, "");
      }
      return true;
    }

    setDateFieldError(el, "");
    return false;
  }

  /** HH:MM を分に変換 */
  function timeToMinutes(str) {
    var parts = String(str || "").split(":");
    var h = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m)) return null;
    return h * 60 + m;
  }

  function minutesToTime(total) {
    var h = Math.floor(total / 60);
    var m = total % 60;
    var hs = h < 10 ? "0" + h : String(h);
    var ms = m < 10 ? "0" + m : String(m);
    return hs + ":" + ms;
  }

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function setTimePairError(pair, message) {
    if (!pair) return;
    var err = pair.querySelector(".time-pair__error");
    var hour = pair.querySelector("[data-time-hour]");
    var minute = pair.querySelector("[data-time-minute]");
    if (!message) {
      if (err && err.parentNode) err.parentNode.removeChild(err);
      if (hour) {
        hour.classList.remove("is-invalid");
        hour.removeAttribute("aria-invalid");
      }
      if (minute) {
        minute.classList.remove("is-invalid");
        minute.removeAttribute("aria-invalid");
      }
      return;
    }
    if (!err) {
      err = document.createElement("p");
      err.className = "time-pair__error";
      err.setAttribute("role", "alert");
      pair.appendChild(err);
    }
    err.textContent = message;
    if (hour) {
      hour.classList.add("is-invalid");
      hour.setAttribute("aria-invalid", "true");
    }
    if (minute) {
      minute.classList.add("is-invalid");
      minute.setAttribute("aria-invalid", "true");
    }
  }

  function syncTimeCombined(pair) {
    var hour = pair.querySelector("[data-time-hour]");
    var minute = pair.querySelector("[data-time-minute]");
    var combined = pair.querySelector("[data-time-combined]");
    if (!hour || !minute || !combined) return "";
    if (hour.value !== "" && minute.value !== "") {
      combined.value = pad2(parseInt(hour.value, 10)) + ":" + pad2(parseInt(minute.value, 10));
    } else {
      combined.value = "";
    }
    return combined.value;
  }

  function buildMinuteOptions(pair, selectedHour) {
    var minuteSel = pair.querySelector("[data-time-minute]");
    if (!minuteSel) return;
    var start = timeToMinutes(pair.getAttribute("data-time-start") || "17:30");
    var end = timeToMinutes(pair.getAttribute("data-time-end") || "23:00");
    var step = parseInt(pair.getAttribute("data-time-step") || "15", 10);
    var prev = minuteSel.value;
    minuteSel.innerHTML = "";
    var placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "--";
    minuteSel.appendChild(placeholder);

    if (selectedHour === "" || start === null || end === null || !(step > 0)) return;

    var hourNum = parseInt(selectedHour, 10);
    var kept = false;
    for (var t = start; t <= end; t += step) {
      var h = Math.floor(t / 60);
      var m = t % 60;
      if (h !== hourNum) continue;
      var opt = document.createElement("option");
      opt.value = String(m);
      opt.textContent = pad2(m);
      if (String(m) === prev) {
        opt.selected = true;
        kept = true;
      }
      minuteSel.appendChild(opt);
    }
    if (!kept) minuteSel.value = "";
  }

  /** 時・分セレクトを初期化（営業時間内・指定分刻み） */
  function initTimePairs() {
    var pairs = document.querySelectorAll("[data-time-pair]");
    Array.prototype.forEach.call(pairs, function (pair) {
      var hourSel = pair.querySelector("[data-time-hour]");
      var minuteSel = pair.querySelector("[data-time-minute]");
      if (!hourSel || !minuteSel) return;

      var start = timeToMinutes(pair.getAttribute("data-time-start") || "17:30");
      var end = timeToMinutes(pair.getAttribute("data-time-end") || "23:00");
      var step = parseInt(pair.getAttribute("data-time-step") || "15", 10);
      if (start === null || end === null || !(step > 0) || end < start) return;

      var hours = [];
      var seenHour = {};
      for (var t = start; t <= end; t += step) {
        var h = Math.floor(t / 60);
        if (seenHour[h]) continue;
        seenHour[h] = true;
        hours.push(h);
      }

      hourSel.innerHTML = "";
      var hourPh = document.createElement("option");
      hourPh.value = "";
      hourPh.textContent = "--";
      hourSel.appendChild(hourPh);
      hours.forEach(function (h) {
        var opt = document.createElement("option");
        opt.value = String(h);
        opt.textContent = String(h);
        hourSel.appendChild(opt);
      });

      buildMinuteOptions(pair, hourSel.value);
      syncTimeCombined(pair);

      hourSel.addEventListener("change", function () {
        buildMinuteOptions(pair, hourSel.value);
        syncTimeCombined(pair);
        setTimePairError(pair, "");
      });
      minuteSel.addEventListener("change", function () {
        syncTimeCombined(pair);
        setTimePairError(pair, "");
      });
    });
  }

  function validateTimePairs(form) {
    var ok = true;
    var firstInvalid = null;
    var pairs = form.querySelectorAll("[data-time-pair]");
    Array.prototype.forEach.call(pairs, function (pair) {
      var hour = pair.querySelector("[data-time-hour]");
      var minute = pair.querySelector("[data-time-minute]");
      if (!hour || !minute) return;
      var required = pair.hasAttribute("data-time-required");
      var hasHour = hour.value !== "";
      var hasMinute = minute.value !== "";

      if (required && (!hasHour || !hasMinute)) {
        ok = false;
        setTimePairError(pair, "時間と分を選択してください。");
        if (!firstInvalid) firstInvalid = hasHour ? minute : hour;
        return;
      }

      if (!required && hasHour !== hasMinute) {
        ok = false;
        setTimePairError(pair, "時間と分の両方を選択してください。");
        if (!firstInvalid) firstInvalid = hasHour ? minute : hour;
        return;
      }

      syncTimeCombined(pair);
      setTimePairError(pair, "");
    });
    return { ok: ok, firstInvalid: firstInvalid };
  }

  /** data-min-today の日付欄：初期値を今日・過去日を選択不可に */
  function initDateMinToday() {
    var today = todayISO();
    var fields = document.querySelectorAll('input[type="date"][data-min-today]');
    Array.prototype.forEach.call(fields, function (el) {
      el.min = today;
      el.setAttribute("min", today);
      if (!el.value || isPastDate(el.value, today)) {
        el.value = today;
      }

      function onDateEdit() {
        clampDateToToday(el, { showError: true });
      }

      el.addEventListener("change", onDateEdit);
      el.addEventListener("input", onDateEdit);
      el.addEventListener("blur", onDateEdit);
      /* ピッカー操作後の保険 */
      el.addEventListener("focusout", onDateEdit);
      /* 開くたびに min を当日へ更新（ブラウザ差の保険） */
      el.addEventListener("focus", function () {
        var t = todayISO();
        el.min = t;
        el.setAttribute("min", t);
      });
      el.addEventListener("click", function () {
        var t = todayISO();
        el.min = t;
        el.setAttribute("min", t);
      });
    });
  }

  function getFieldLabel(el) {
    if (!el) return "";
    if (el.id) {
      var byFor = document.querySelector('label[for="' + el.id + '"]');
      if (byFor) return byFor.textContent.replace(/\s*(必須|任意)\s*/g, "").trim();
    }
    var wrap = el.closest(".form-group, .form-check, .order-item");
    if (wrap) {
      var lab = wrap.querySelector("label");
      if (lab) return lab.textContent.replace(/\s*(必須|任意)\s*/g, "").trim();
    }
    return el.getAttribute("aria-label") || el.name || "";
  }

  function getFieldValue(el) {
    if (!el) return "";
    if (el.type === "checkbox") return el.checked ? "同意する" : "";
    if (el.tagName === "SELECT") {
      if (!el.value) return "";
      var opt = el.options[el.selectedIndex];
      return opt ? opt.textContent.trim() : "";
    }
    return (el.value || "").trim();
  }

  function collectSummary(form) {
    var rows = [];
    var seen = {};
    var orderLines = [];
    var controls = form.querySelectorAll("input, select, textarea");

    Array.prototype.forEach.call(controls, function (el) {
      if (!el.name) return;
      if (el.type === "submit" || el.type === "button") return;
      if (el.type === "checkbox" && !el.checked) return;

      /* 時・分は合算して表示（hidden の結合値を使う） */
      if (el.name === "time_hour" || el.name === "time_minute") return;
      if (el.type === "hidden") {
        if (!el.hasAttribute("data-time-combined") || !el.value) return;
        var pair = el.closest("[data-time-pair]");
        var timeLabel = (pair && pair.getAttribute("data-time-label")) || "時間";
        if (seen[el.name]) return;
        seen[el.name] = true;
        rows.push({ label: timeLabel, value: el.value });
        return;
      }

      var label = getFieldLabel(el);
      var value = getFieldValue(el);
      if (!value) return;

      var key = el.name;
      if (seen[key]) return;
      seen[key] = true;

      /* 注文の商品と個数（両方そろっているものだけ収集） */
      if (/^item_/.test(el.name)) {
        var n = el.name.replace("item_", "");
        var qty = form.querySelector('[name="qty_' + n + '"]');
        var qtyVal = qty ? getFieldValue(qty) : "";
        if (qty) seen[qty.name] = true;
        if (!qtyVal) return;

        var qtyNum = parseInt(qtyVal, 10);
        if (!qtyNum || qtyNum < 1) return;

        orderLines.push({
          name: value,
          qty: qtyNum
        });
        return;
      }
      if (/^qty_/.test(el.name)) return;

      rows.push({ label: label || el.name, value: value });
    });

    /* 同じ商品は数量を合算して表示 */
    if (orderLines.length) {
      var merged = [];
      var indexByName = {};
      orderLines.forEach(function (line) {
        if (Object.prototype.hasOwnProperty.call(indexByName, line.name)) {
          merged[indexByName[line.name]].qty += line.qty;
        } else {
          indexByName[line.name] = merged.length;
          merged.push({ name: line.name, qty: line.qty });
        }
      });

      merged.forEach(function (line, i) {
        rows.push({
          label: "ご注文 " + (i + 1),
          value: line.name + " × " + line.qty
        });
      });
    }

    return rows;
  }

  function renderSummaryHtml(rows) {
    if (!rows.length) return "<p class=\"form-summary__empty\">入力内容がありません</p>";
    return (
      '<dl class="form-summary__list">' +
      rows
        .map(function (row) {
          return (
            "<div class=\"form-summary__row\">" +
            "<dt class=\"form-summary__label\">" +
            escapeHtml(row.label) +
            "</dt>" +
            "<dd class=\"form-summary__value\">" +
            escapeHtml(row.value).replace(/\n/g, "<br>") +
            "</dd>" +
            "</div>"
          );
        })
        .join("") +
      "</dl>"
    );
  }

  function detectFormType(form) {
    if (form.querySelector("[data-order-items]")) return "takeout";
    return "reserve";
  }

  function playSendAnimation(done) {
    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      setTimeout(done, 350);
      return;
    }

    var overlay = document.createElement("div");
    overlay.className = "send-overlay";
    overlay.setAttribute("role", "status");
    overlay.setAttribute("aria-live", "polite");
    overlay.innerHTML =
      '<div class="send-overlay__inner">' +
        '<div class="send-overlay__scene">' +
          '<svg class="send-trail" viewBox="0 0 260 150" aria-hidden="true">' +
            '<path class="send-trail__path" d="M 48 108 Q 128 24 228 44" />' +
            '<circle class="send-trail__dot" cx="76" cy="90" r="2.5" />' +
            '<circle class="send-trail__dot" cx="124" cy="54" r="2.5" />' +
            '<circle class="send-trail__dot" cx="178" cy="42" r="2.5" />' +
          "</svg>" +
          '<div class="send-flyer">' +
            '<div class="send-state send-state--letter">' +
              '<svg class="send-svg send-svg--letter" viewBox="0 0 96 72" aria-hidden="true">' +
                '<rect class="send-letter__body" x="8" y="22" width="80" height="44" rx="2" fill="#fbfaf7" stroke="currentColor" stroke-width="1.5" />' +
                '<path class="send-letter__fold-l" d="M8 66 L48 40" stroke="currentColor" stroke-width="1" opacity="0.2" />' +
                '<path class="send-letter__fold-r" d="M88 66 L48 40" stroke="currentColor" stroke-width="1" opacity="0.2" />' +
                '<path class="send-letter__flap" d="M8 22 L48 44 L88 22 Z" fill="#e7e4de" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />' +
                '<g class="send-letter__lines">' +
                  '<line x1="24" y1="48" x2="72" y2="48" stroke="currentColor" stroke-width="1" opacity="0.35" />' +
                  '<line x1="24" y1="54" x2="60" y2="54" stroke="currentColor" stroke-width="1" opacity="0.35" />' +
                  '<line x1="24" y1="60" x2="52" y2="60" stroke="currentColor" stroke-width="1" opacity="0.35" />' +
                "</g>" +
              "</svg>" +
            "</div>" +
            '<div class="send-state send-state--plane">' +
              '<svg class="send-svg send-svg--plane" viewBox="0 0 120 52" aria-hidden="true">' +
                '<path class="send-plane__wind" d="M0 18 H13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.35" />' +
                '<path class="send-plane__wind" d="M0 26 H16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.5" />' +
                '<path class="send-plane__wind" d="M0 34 H13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.35" />' +
                '<path class="send-plane__bottom" d="M16 28 L104 24 L16 42 Z" fill="#e7e4de" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />' +
                '<path class="send-plane__top" d="M16 28 L104 24 L16 14 Z" fill="#fbfaf7" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />' +
                '<line class="send-plane__crease" x1="16" y1="28" x2="104" y2="24" stroke="currentColor" stroke-width="1" opacity="0.32" />' +
                '<line class="send-plane__fold" x1="16" y1="14" x2="16" y2="42" stroke="currentColor" stroke-width="1" opacity="0.2" />' +
                '<path class="send-plane__nose" d="M88 24 L104 24" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.45" />' +
              "</svg>" +
            "</div>" +
          "</div>" +
        "</div>" +
        '<p class="send-overlay__text">' + SENDING_TEXT + "</p>" +
      "</div>";

    document.body.appendChild(overlay);
    document.body.style.overflow = "hidden";

    requestAnimationFrame(function () {
      overlay.classList.add("is-visible");
    });

    setTimeout(function () {
      overlay.classList.add("is-seal");
    }, 550);

    setTimeout(function () {
      overlay.classList.add("is-fold");
    }, 1200);

    setTimeout(function () {
      overlay.classList.add("is-fly");
    }, 1750);

    setTimeout(function () {
      overlay.classList.add("is-exit");
      setTimeout(function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        document.body.style.overflow = "";
        done();
      }, 450);
    }, 3500);
  }

  function openConfirm(form, rows) {
    var existing = document.getElementById("confirm-overlay");
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    var type = detectFormType(form);
    var title = type === "takeout" ? "テイクアウト内容の確認" : "ご予約内容の確認";

    var overlay = document.createElement("div");
    overlay.id = "confirm-overlay";
    overlay.className = "confirm-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "confirm-title");
    overlay.innerHTML =
      '<div class="confirm-overlay__backdrop" data-confirm-cancel></div>' +
      '<div class="confirm-overlay__dialog">' +
        '<button type="button" class="confirm-overlay__close" data-confirm-cancel aria-label="閉じる">×</button>' +
        '<p class="confirm-overlay__kicker">Confirm</p>' +
        '<h2 class="confirm-overlay__title" id="confirm-title">' + title + "</h2>" +
        '<p class="confirm-overlay__lead">内容をご確認のうえ、送信してください。</p>' +
        '<div class="confirm-overlay__summary">' +
          renderSummaryHtml(rows) +
        "</div>" +
        '<div class="confirm-overlay__actions">' +
          '<button type="button" class="btn btn--line" data-confirm-cancel>戻って修正</button>' +
          '<button type="button" class="btn btn--primary" data-confirm-send>この内容で送信する</button>' +
        "</div>" +
      "</div>";

    document.body.appendChild(overlay);
    document.body.style.overflow = "hidden";

    requestAnimationFrame(function () {
      overlay.classList.add("is-visible");
    });

    function closeConfirm() {
      overlay.classList.remove("is-visible");
      setTimeout(function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        if (!document.querySelector(".send-overlay")) {
          document.body.style.overflow = "";
        }
      }, 280);
    }

    function onKey(e) {
      if (e.key === "Escape") {
        document.removeEventListener("keydown", onKey);
        closeConfirm();
      }
    }
    document.addEventListener("keydown", onKey);

    overlay.addEventListener("click", function (e) {
      if (e.target.closest("[data-confirm-cancel]")) {
        document.removeEventListener("keydown", onKey);
        closeConfirm();
        return;
      }
      if (e.target.closest("[data-confirm-send]")) {
        document.removeEventListener("keydown", onKey);
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);

        var submitBtn = form.querySelector('[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;

        try {
          sessionStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
              type: type,
              title: type === "takeout" ? "テイクアウトのご依頼" : "ご来店予約",
              rows: rows,
              html: renderSummaryHtml(rows)
            })
          );
        } catch (err) {
          /* ignore */
        }

        playSendAnimation(function () {
          window.location.href = "thanks.html";
        });
      }
    });

    var sendBtn = overlay.querySelector("[data-confirm-send]");
    if (sendBtn) sendBtn.focus();
  }

  function clearOrderErrors(form) {
    var items = form.querySelectorAll("[data-order-item]");
    Array.prototype.forEach.call(items, function (item) {
      item.classList.remove("is-invalid");
      var select = item.querySelector("[data-order-select]");
      var qty = item.querySelector("[data-order-qty]");
      if (select) select.classList.remove("is-invalid");
      if (qty) qty.classList.remove("is-invalid");
      var err = item.querySelector(".order-item__error");
      if (err && err.parentNode) err.parentNode.removeChild(err);
    });
    var sectionErr = form.querySelector(".order-items__error");
    if (sectionErr && sectionErr.parentNode) sectionErr.parentNode.removeChild(sectionErr);
  }

  function showOrderItemError(item, message, markItem, markQty) {
    item.classList.add("is-invalid");
    var select = item.querySelector("[data-order-select]");
    var qty = item.querySelector("[data-order-qty]");
    if (markItem && select) select.classList.add("is-invalid");
    if (markQty && qty) qty.classList.add("is-invalid");

    var err = item.querySelector(".order-item__error");
    if (!err) {
      err = document.createElement("p");
      err.className = "order-item__error";
      item.appendChild(err);
    }
    err.textContent = message;
  }

  function validateOrderItems(form) {
    var list = form.querySelector("[data-order-items]");
    if (!list) return true;

    clearOrderErrors(form);

    var items = list.querySelectorAll("[data-order-item]");
    var ok = true;
    var completeCount = 0;
    var firstInvalid = null;

    Array.prototype.forEach.call(items, function (item) {
      var select = item.querySelector("[data-order-select]");
      var qty = item.querySelector("[data-order-qty]");
      var hasItem = !!(select && select.value);
      var hasQty = !!(qty && qty.value);

      if (hasItem && hasQty) {
        completeCount += 1;
        return;
      }

      ok = false;
      if (!hasItem && !hasQty) {
        showOrderItemError(
          item,
          items.length === 1
            ? "商品と個数を選択してください"
            : "未入力です。商品と個数を選ぶか、削除してください",
          true,
          true
        );
      } else if (hasItem && !hasQty) {
        showOrderItemError(item, "個数を選択してください", false, true);
      } else if (!hasItem && hasQty) {
        showOrderItemError(item, "商品を選択してください", true, false);
      }

      if (!firstInvalid) {
        firstInvalid = hasItem ? qty : select;
      }
    });

    if (ok && completeCount < 1) {
      ok = false;
      var note = document.createElement("p");
      note.className = "order-items__error";
      note.textContent = "ご注文内容を1件以上入力してください";
      list.parentNode.insertBefore(note, list.nextSibling);
      if (!firstInvalid && items[0]) {
        firstInvalid = items[0].querySelector("[data-order-select]");
      }
    }

    if (firstInvalid && firstInvalid.focus) firstInvalid.focus();
    return ok;
  }

  function validateRequired(form) {
    var ok = true;
    var firstInvalid = null;
    var today = todayISO();
    var required = form.querySelectorAll("[required]");
    Array.prototype.forEach.call(required, function (el) {
      var valid = true;
      if (el.type === "checkbox") valid = el.checked;
      else valid = !!(el.value && String(el.value).trim());

      if (el.type === "date" && el.hasAttribute("data-min-today")) {
        var entered = el.value;
        el.min = today;
        el.setAttribute("min", today);
        if (isPastDate(entered, today)) {
          valid = false;
          el.value = today;
          setDateFieldError(el, "過去の日付は選択できません。本日以降の日付を選んでください。");
        } else if (!entered) {
          valid = false;
          el.value = today;
          setDateFieldError(el, "日付を選択してください。");
        } else {
          setDateFieldError(el, "");
        }
      }

      if (!valid) {
        ok = false;
        el.classList.add("is-invalid");
        if (!firstInvalid) firstInvalid = el;
      } else {
        el.classList.remove("is-invalid");
        if (el.type === "date" && el.hasAttribute("data-min-today")) {
          setDateFieldError(el, "");
        }
      }
    });

    var ordersOk = validateOrderItems(form);
    if (!ordersOk) ok = false;

    var timeCheck = validateTimePairs(form);
    if (!timeCheck.ok) {
      ok = false;
      if (!firstInvalid && timeCheck.firstInvalid) firstInvalid = timeCheck.firstInvalid;
    }

    if (firstInvalid && firstInvalid.focus && ordersOk) firstInvalid.focus();
    return ok;
  }

  function initForms() {
    var forms = document.querySelectorAll("[data-demo-form]");
    forms.forEach(function (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        if (!validateRequired(form)) return;
        var rows = collectSummary(form);
        openConfirm(form, rows);
      });

      form.addEventListener("input", function (e) {
        if (!e.target || !e.target.classList) return;
        if (e.target.matches && e.target.matches('input[type="date"][data-min-today]')) {
          clampDateToToday(e.target, { showError: true });
          return;
        }
        e.target.classList.remove("is-invalid");
        var item = e.target.closest("[data-order-item]");
        if (item) {
          item.classList.remove("is-invalid");
          var err = item.querySelector(".order-item__error");
          if (err && err.parentNode) err.parentNode.removeChild(err);
        }
      });
      form.addEventListener("change", function (e) {
        if (!e.target || !e.target.classList) return;
        if (e.target.matches && e.target.matches('input[type="date"][data-min-today]')) {
          clampDateToToday(e.target, { showError: true });
          return;
        }
        e.target.classList.remove("is-invalid");
        var item = e.target.closest("[data-order-item]");
        if (item) {
          item.classList.remove("is-invalid");
          var err = item.querySelector(".order-item__error");
          if (err && err.parentNode) err.parentNode.removeChild(err);
          var sectionErr = form.querySelector(".order-items__error");
          if (sectionErr && sectionErr.parentNode) sectionErr.parentNode.removeChild(sectionErr);
        }
      });
    });
  }

  function initThanksPage() {
    var summary = document.getElementById("thanks-summary");
    var lead = document.getElementById("thanks-lead");
    var inner = document.getElementById("thanks-inner");
    if (!summary && !inner) return;

    var data = null;
    try {
      data = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null");
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      data = null;
    }

    if (lead && data && data.title) {
      lead.textContent =
        data.title + "の内容を受け付けました。スタッフより折り返しご連絡いたします。";
    }

    if (summary && data && data.html) {
      summary.innerHTML =
        '<h2 class="thanks-summary__title">送信内容</h2>' + data.html;
      summary.hidden = false;
    }

    if (inner) {
      requestAnimationFrame(function () {
        inner.classList.add("is-visible");
      });
    }
  }

  function initTakeoutOrderItems() {
    var list = document.querySelector("[data-order-items]");
    var addBtn = document.getElementById("add-order-item") || document.querySelector("[data-add-order-item]");
    var tmpl = document.getElementById("order-item-template");
    if (!list || !addBtn || !tmpl) return;

    var maxItems = 10;

    function getItems() {
      return list.querySelectorAll("[data-order-item]");
    }

    function renumber() {
      var items = getItems();
      Array.prototype.forEach.call(items, function (item, index) {
        var n = index + 1;
        var label = item.querySelector(".order-item__head label");
        var select = item.querySelector("[data-order-select]");
        var qty = item.querySelector("[data-order-qty]");
        var removeBtn = item.querySelector("[data-remove-order-item]");

        if (select) {
          select.id = "to-item-" + n;
          select.name = "item_" + n;
        }
        if (label) {
          label.textContent = "ご注文 " + n;
          if (select) label.setAttribute("for", select.id);
        }
        if (qty) {
          qty.name = "qty_" + n;
          qty.setAttribute("aria-label", "個数" + n);
        }
        if (removeBtn) {
          if (items.length <= 1) removeBtn.setAttribute("hidden", "");
          else removeBtn.removeAttribute("hidden");
        }
      });

      if (items.length >= maxItems) {
        addBtn.setAttribute("disabled", "");
        addBtn.setAttribute("aria-disabled", "true");
      } else {
        addBtn.removeAttribute("disabled");
        addBtn.removeAttribute("aria-disabled");
      }
    }

    function addItem() {
      if (getItems().length >= maxItems) return;

      var node = null;
      if (tmpl.content && tmpl.content.firstElementChild) {
        node = tmpl.content.firstElementChild.cloneNode(true);
      } else {
        var wrap = document.createElement("div");
        wrap.innerHTML = tmpl.innerHTML;
        node = wrap.firstElementChild;
      }
      if (!node) return;

      list.appendChild(node);
      renumber();

      var select = node.querySelector("[data-order-select]");
      if (select) select.focus();
    }

    addBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      addItem();
    });

    list.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest ? e.target.closest("[data-remove-order-item]") : null;
      if (!btn) return;
      e.preventDefault();
      var item = btn.closest("[data-order-item]");
      if (!item || getItems().length <= 1) return;
      item.parentNode.removeChild(item);
      renumber();
    });

    renumber();
  }

  ready(function () {
    initDateMinToday();
    initTimePairs();
    initForms();
    initTakeoutOrderItems();
    initThanksPage();
  });
})();
