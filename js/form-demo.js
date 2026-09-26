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
  var FORMSPARK = {
    reserve: "https://submit-form.com/1SJ4gAGyo",
    takeout: "https://submit-form.com/EtUPrkFfX",
    recruit: "https://submit-form.com/cZwRgNdl0"
  };
  /**
   * Cloudflare Turnstile の Site Key
   * Secret Key は Formspark 管理画面のみに登録（ここには書かない）
   */
  var TURNSTILE_SITE_KEY = window.MASA_TURNSTILE_SITE_KEY || "0x4AAAAAAFAq0m3Vf9w41Ilx";
  var SEND_ERROR_TEXT =
    "送信に失敗しました。通信環境をご確認のうえ、もう一度お試しいただくか、お電話にてお問い合わせください。";
  var TURNSTILE_WAIT_TEXT =
    "セキュリティ確認が完了していません。チェックが「成功」になったことを確認してから、もう一度お試しください。";

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
    var end = timeToMinutes(pair.getAttribute("data-time-end") || "22:30");
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
      var end = timeToMinutes(pair.getAttribute("data-time-end") || "22:30");
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

      /* 年齢は「○歳」で確認表示 */
      if (el.name === "age") {
        rows.push({ label: label || "年齢", value: value + "歳" });
        return;
      }

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
    var explicit = form.getAttribute("data-form-type");
    if (explicit === "recruit" || explicit === "takeout" || explicit === "reserve") {
      return explicit;
    }
    if (form.querySelector("[data-order-items]")) return "takeout";
    return "reserve";
  }

  function formResultTitle(type) {
    if (type === "takeout") return "テイクアウトのご依頼";
    if (type === "recruit") return "スタッフ応募";
    return "ご来店予約";
  }

  function formConfirmTitle(type) {
    if (type === "takeout") return "テイクアウト内容の確認";
    if (type === "recruit") return "応募内容の確認";
    return "ご予約内容の確認";
  }

  function fieldValue(form, name) {
    var el = form.querySelector('[name="' + name + '"]');
    if (!el) return "";
    return getFieldValue(el);
  }

  function combinedTimeValue(form) {
    var el = form.querySelector("[data-time-combined]");
    return el && el.value ? String(el.value).trim() : "";
  }

  /** 確認画面と同じく同一商品は数量合算 */
  function collectMergedOrders(form) {
    var orderLines = [];
    var items = form.querySelectorAll("[data-order-item]");
    Array.prototype.forEach.call(items, function (item) {
      var select = item.querySelector("[data-order-select]");
      var qty = item.querySelector("[data-order-qty]");
      var name = select ? getFieldValue(select) : "";
      var qtyVal = qty ? getFieldValue(qty) : "";
      var qtyNum = parseInt(qtyVal, 10);
      if (!name || !qtyNum || qtyNum < 1) return;
      orderLines.push({ name: name, qty: qtyNum });
    });

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
    return merged;
  }

  /** Formspark送信用 JSON（日本語キーに整形） */
  function buildFormsparkPayload(form, type) {
    var data = {};
    var emailObj = {};

    if (type === "recruit") {
      var rcEmail = fieldValue(form, "email");
      var rcNote = fieldValue(form, "note");
      var rcAge = fieldValue(form, "age");
      var rcExp = fieldValue(form, "experience");

      data["お名前"] = fieldValue(form, "name");
      data["お電話番号"] = fieldValue(form, "tel");
      data["年齢"] = rcAge ? rcAge + "歳" : "";
      data["週の出勤可能日数"] = fieldValue(form, "available_days");
      data["メールアドレス"] = rcEmail || "未入力";
      data["飲食経験"] = rcExp || "未選択";
      data["自己PR・質問"] = rcNote || "なし";
      emailObj.subject = "【ホームページ】スタッフ応募　" + fieldValue(form, "name") + "様";
      if (rcEmail) {
        data.email = rcEmail;
        emailObj.replyto = rcEmail;
      }
      data._email = emailObj;
      return data;
    }

    if (type === "takeout") {
      var toEmail = fieldValue(form, "email");
      var toNote = fieldValue(form, "note");
      var toTime = combinedTimeValue(form);

      data["お名前"] = fieldValue(form, "name");
      data["お電話番号"] = fieldValue(form, "tel");
      data["受取日"] = fieldValue(form, "pickup_date");
      data["受取時間"] = toTime || "指定なし";
      data["メールアドレス"] = toEmail || "未入力";
      data["その他ご要望・ご相談"] = toNote || "なし";

      collectMergedOrders(form).forEach(function (line, i) {
        data["ご注文 " + (i + 1)] =
          "商品：" + line.name + "\n個数：" + line.qty + "個";
      });

      emailObj.subject = "【ホームページ】テイクアウト予約　" + fieldValue(form, "name") + "様";
      if (toEmail) {
        data.email = toEmail;
        emailObj.replyto = toEmail;
      }
      data._email = emailObj;
      return data;
    }

    var email = fieldValue(form, "email");
    var note = fieldValue(form, "note");
    var party = fieldValue(form, "party");
    var course = fieldValue(form, "course");

    data["お名前"] = fieldValue(form, "name");
    data["お電話番号"] = fieldValue(form, "tel");
    data["メールアドレス"] = email;
    if (email) data.email = email;
    data["ご予約人数"] = party ? party + "名" : "";
    data["ご来店日"] = fieldValue(form, "date");
    data["ご来店時間"] = combinedTimeValue(form);
    data["希望コース"] = course || "席のみ予約";
    data["その他、ご要望・ご相談"] = note || "なし";
    emailObj.subject = "【ホームページ】ご来店予約　" + fieldValue(form, "name") + "様";
    if (email) emailObj.replyto = email;
    data._email = emailObj;
    return data;
  }

  function parseFormsparkError(payload, status) {
    if (!payload || typeof payload !== "object") {
      return status ? "送信エラー（" + status + "）" : "";
    }
    var msg = payload.error || payload.message || "";
    if (!msg && payload.errors) {
      if (Array.isArray(payload.errors)) {
        msg = payload.errors
          .map(function (e) {
            if (typeof e === "string") return e;
            if (e && e.message) return e.message;
            return "";
          })
          .filter(Boolean)
          .join(" / ");
      } else if (typeof payload.errors === "object") {
        msg = Object.keys(payload.errors)
          .map(function (k) {
            var v = payload.errors[k];
            return k + ": " + (Array.isArray(v) ? v.join(", ") : v);
          })
          .join(" / ");
      }
    }
    return msg || (status ? "送信エラー（" + status + "）" : "");
  }

  function friendlySendError(raw) {
    var text = String(raw || "").toLowerCase();
    if (
      text.indexOf("captcha") !== -1 ||
      text.indexOf("turnstile") !== -1 ||
      text.indexOf("recaptcha") !== -1
    ) {
      return (
        "セキュリティ確認が Formspark 側で拒否されました。" +
        "もう一度チェックを完了してから送信するか、" +
        "FormsparkのCAPTCHA設定（TurnstileのSecret Key）を確認してください。"
      );
    }
    if (text.indexOf("forbidden") !== -1 || text.indexOf("domain") !== -1) {
      return (
        "このドメインからの送信が許可されていない可能性があります。" +
        "Formsparkのフォーム設定を確認してください。"
      );
    }
    return SEND_ERROR_TEXT + (raw ? "（" + raw + "）" : "");
  }

  function submitToFormspark(form, type) {
    var endpoint = FORMSPARK[type] || FORMSPARK.reserve;
    var body = buildFormsparkPayload(form, type);
    var token = getTurnstileToken(form);

    /* Turnstile が挿入する空の cf-turnstile-response は送らない */
    clearTurnstileInputs(form);

    if (TURNSTILE_SITE_KEY) {
      if (!token) {
        return Promise.reject(new Error("turnstile-missing"));
      }
      body["cf-turnstile-response"] = token;
    }

    return fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(body)
    }).then(function (res) {
      return res
        .json()
        .catch(function () {
          return {};
        })
        .then(function (payload) {
          if (!res.ok) {
            var detail = parseFormsparkError(payload, res.status);
            var err = new Error("formspark-failed");
            err.detail = detail;
            err.status = res.status;
            err.payload = payload;
            throw err;
          }
          /* 成功後はトークンを使い捨て済みとしてクリア */
          setTurnstileToken(form, "");
          return payload;
        });
    });
  }

  function loadTurnstileScript() {
    return new Promise(function (resolve, reject) {
      if (!TURNSTILE_SITE_KEY) {
        resolve(null);
        return;
      }
      if (window.turnstile) {
        resolve(window.turnstile);
        return;
      }
      var existing = document.querySelector('script[data-turnstile-api]');
      if (existing) {
        existing.addEventListener("load", function () {
          resolve(window.turnstile || null);
        });
        existing.addEventListener("error", function () {
          reject(new Error("turnstile-load-failed"));
        });
        return;
      }
      var s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.defer = true;
      s.setAttribute("data-turnstile-api", "1");
      s.onload = function () {
        resolve(window.turnstile || null);
      };
      s.onerror = function () {
        reject(new Error("turnstile-load-failed"));
      };
      document.head.appendChild(s);
    });
  }

  /** Turnstile トークンを data 属性で保持（空の hidden を送らないため） */
  function clearTurnstileInputs(form) {
    if (!form) return;
    var fields = form.querySelectorAll('[name="cf-turnstile-response"]');
    Array.prototype.forEach.call(fields, function (el) {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });
  }

  function setTurnstileToken(form, token) {
    if (!form) return;
    var value = token ? String(token).trim() : "";
    if (value) {
      form.setAttribute("data-turnstile-token", value);
      form.setAttribute("data-turnstile-ready", "1");
    } else {
      form.removeAttribute("data-turnstile-token");
      form.removeAttribute("data-turnstile-ready");
      clearTurnstileInputs(form);
    }
  }

  function getTurnstileToken(form) {
    if (!form) return "";

    var stored = form.getAttribute("data-turnstile-token");
    if (stored && String(stored).trim()) return String(stored).trim();

    var fields = form.querySelectorAll('[name="cf-turnstile-response"]');
    for (var f = 0; f < fields.length; f++) {
      var v = fields[f] && fields[f].value ? String(fields[f].value).trim() : "";
      if (v) {
        setTurnstileToken(form, v);
        return v;
      }
    }

    if (window.turnstile && window.turnstile.getResponse) {
      var widgetId = form.getAttribute("data-turnstile-widget-id");
      var candidates = [];
      if (widgetId !== null && widgetId !== "") {
        candidates.push(widgetId);
        if (/^\d+$/.test(widgetId)) candidates.push(Number(widgetId));
      }
      candidates.push(undefined);

      for (var i = 0; i < candidates.length; i++) {
        try {
          var token =
            candidates[i] === undefined
              ? window.turnstile.getResponse()
              : window.turnstile.getResponse(candidates[i]);
          if (token && String(token).trim()) {
            var cleaned = String(token).trim();
            setTurnstileToken(form, cleaned);
            return cleaned;
          }
        } catch (err) {
          /* 次の候補へ */
        }
      }
    }

    return "";
  }

  function resetTurnstile(form) {
    setTurnstileToken(form, "");
    if (!form || !window.turnstile || !window.turnstile.reset) return;
    var widgetId = form.getAttribute("data-turnstile-widget-id");
    if (widgetId === null || widgetId === "") return;
    try {
      if (/^\d+$/.test(widgetId)) {
        window.turnstile.reset(Number(widgetId));
      } else {
        window.turnstile.reset(widgetId);
      }
    } catch (err) {
      try {
        window.turnstile.reset(widgetId);
      } catch (err2) {
        /* ignore */
      }
    }
  }

  function initTurnstileWidgets() {
    if (!TURNSTILE_SITE_KEY) return;

    loadTurnstileScript()
      .then(function (turnstile) {
        if (!turnstile || !turnstile.render) return;
        document.querySelectorAll("[data-demo-form]").forEach(function (form) {
          var mount = form.querySelector("[data-turnstile]");
          if (!mount || form.getAttribute("data-turnstile-widget-id") !== null) return;
          try {
            var id = turnstile.render(mount, {
              sitekey: TURNSTILE_SITE_KEY,
              theme: "light",
              language: "ja",
              callback: function (token) {
                setTurnstileToken(form, token);
              },
              "expired-callback": function () {
                setTurnstileToken(form, "");
              },
              "error-callback": function () {
                setTurnstileToken(form, "");
              },
              "timeout-callback": function () {
                setTurnstileToken(form, "");
              }
            });
            form.setAttribute("data-turnstile-widget-id", String(id));
          } catch (err) {
            /* ignore render errors */
          }
        });
      })
      .catch(function () {
        /* スクリプト読込失敗時は送信時にエラー表示 */
      });
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
    var title = formConfirmTitle(type);

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
        '<p class="confirm-overlay__error" data-confirm-error hidden></p>' +
        '<div class="confirm-overlay__actions">' +
          '<button type="button" class="btn btn--line" data-confirm-cancel>戻って修正</button>' +
          '<button type="button" class="btn btn--primary" data-confirm-send>この内容で送信する</button>' +
        "</div>" +
      "</div>";

    document.body.appendChild(overlay);
    document.body.style.overflow = "hidden";

    var sending = false;
    var sendBtn = overlay.querySelector("[data-confirm-send]");
    var cancelBtns = overlay.querySelectorAll("[data-confirm-cancel]");
    var errorEl = overlay.querySelector("[data-confirm-error]");

    requestAnimationFrame(function () {
      overlay.classList.add("is-visible");
    });

    function setConfirmError(message) {
      if (!errorEl) return;
      if (!message) {
        errorEl.hidden = true;
        errorEl.textContent = "";
        return;
      }
      errorEl.hidden = false;
      errorEl.textContent = message;
    }

    function setSendingState(isSending) {
      sending = isSending;
      if (sendBtn) {
        sendBtn.disabled = isSending;
        sendBtn.setAttribute("aria-busy", isSending ? "true" : "false");
        sendBtn.textContent = isSending ? "送信中..." : "この内容で送信する";
      }
      Array.prototype.forEach.call(cancelBtns, function (btn) {
        btn.disabled = isSending;
      });
    }

    function closeConfirm() {
      if (sending) return;
      overlay.classList.remove("is-visible");
      setTimeout(function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        if (!document.querySelector(".send-overlay")) {
          document.body.style.overflow = "";
        }
      }, 280);
    }

    function finishSuccess() {
      try {
        sessionStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            type: type,
            title: formResultTitle(type),
            rows: rows,
            html: renderSummaryHtml(rows)
          })
        );
      } catch (err) {
        /* ignore */
      }

      document.removeEventListener("keydown", onKey);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);

      var submitBtn = form.querySelector('[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      playSendAnimation(function () {
        window.location.href = type === "recruit" ? "thanks-recruit.html" : "thanks.html";
      });
    }

    function onKey(e) {
      if (e.key === "Escape") {
        if (sending) return;
        document.removeEventListener("keydown", onKey);
        closeConfirm();
      }
    }
    document.addEventListener("keydown", onKey);

    overlay.addEventListener("click", function (e) {
      if (e.target.closest("[data-confirm-cancel]")) {
        if (sending) return;
        document.removeEventListener("keydown", onKey);
        closeConfirm();
        return;
      }
      if (!e.target.closest("[data-confirm-send]")) return;
      if (sending) return;

      setConfirmError("");
      setSendingState(true);

      if (TURNSTILE_SITE_KEY && !getTurnstileToken(form)) {
        setSendingState(false);
        setConfirmError(TURNSTILE_WAIT_TEXT);
        if (sendBtn) sendBtn.focus();
        return;
      }

      submitToFormspark(form, type)
        .then(function () {
          finishSuccess();
        })
        .catch(function (err) {
          setSendingState(false);
          resetTurnstile(form);
          if (err && err.message === "turnstile-missing") {
            setConfirmError(TURNSTILE_WAIT_TEXT);
          } else {
            var detail = err && err.detail ? err.detail : "";
            if (typeof console !== "undefined" && console.warn) {
              console.warn("[formspark]", err && err.status, err && err.payload);
            }
            setConfirmError(friendlySendError(detail));
          }
          if (sendBtn) sendBtn.focus();
        });
    });

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
        if (TURNSTILE_SITE_KEY && !getTurnstileToken(form)) {
          window.alert(TURNSTILE_WAIT_TEXT);
          var mount = form.querySelector("[data-turnstile]");
          if (mount && mount.scrollIntoView) {
            mount.scrollIntoView({ behavior: "smooth", block: "center" });
          }
          return;
        }
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
      if (data.type === "recruit") {
        lead.textContent =
          "スタッフ応募の内容を受け付けました。内容確認後、折り返しご連絡いたします。";
      } else {
        lead.textContent =
          data.title + "の内容を受け付けました。スタッフより折り返しご連絡いたします。";
      }
    }

    if (summary && data && data.html) {
      var summaryTitle = data.type === "recruit" ? "応募内容" : "送信内容";
      summary.innerHTML =
        '<h2 class="thanks-summary__title">' + summaryTitle + "</h2>" + data.html;
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
    initTurnstileWidgets();
  });
})();
