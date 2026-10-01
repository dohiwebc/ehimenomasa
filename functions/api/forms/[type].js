/**
 * 予約・テイクアウト・応募を受け、Turnstile を Cloudflare に確認してから Formspree へ渡す。
 * Secret Key は環境変数 TURNSTILE_SECRET（Pages のシークレット）。ソースには置かない。
 */

var ALLOWED_HOSTS = {
  "ehimenomasa.com": true,
  "www.ehimenomasa.com": true,
  "ehimenomasa.pages.dev": true
};

var FIELD_LIMIT = 4000;
var TOKEN_LIMIT = 2048;

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function endpointFor(env, type) {
  var fromEnv = "";
  if (type === "reserve") fromEnv = env.FORMSPREE_RESERVE || "";
  if (type === "takeout") fromEnv = env.FORMSPREE_TAKEOUT || "";
  if (type === "recruit") fromEnv = env.FORMSPREE_RECRUIT || "";
  if (/^https:\/\/formspree\.io\/f\/[A-Za-z0-9]+$/.test(fromEnv)) return fromEnv;
  return "";
}

function allowedField(type, name) {
  if (
    name === "お名前" ||
    name === "お電話番号" ||
    name === "メールアドレス" ||
    name === "email" ||
    name === "_subject" ||
    name === "_replyto"
  ) {
    return true;
  }
  if (type === "reserve") {
    return (
      name === "ご予約人数" ||
      name === "ご来店日" ||
      name === "ご来店時間" ||
      name === "希望コース" ||
      name === "その他、ご要望・ご相談"
    );
  }
  if (type === "takeout") {
    return (
      name === "受取日" ||
      name === "受取時間" ||
      name === "その他ご要望・ご相談" ||
      /^ご注文 \d{1,2}$/.test(name)
    );
  }
  if (type === "recruit") {
    return (
      name === "希望雇用形態" ||
      name === "年齢" ||
      name === "週の出勤可能日数" ||
      name === "飲食経験" ||
      name === "自己PR・質問"
    );
  }
  return false;
}

function clientIp(request) {
  return request.headers.get("CF-Connecting-IP") || "";
}

async function verifyTurnstile(env, token, ip, action) {
  var secret = env.TURNSTILE_SECRET ? String(env.TURNSTILE_SECRET).trim() : "";
  if (!secret) return false;

  var body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", token);
  if (ip) body.set("remoteip", ip);

  var response;
  try {
    response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body,
      signal: AbortSignal.timeout(10000)
    });
  } catch (err) {
    return false;
  }
  if (!response.ok) return false;

  var result;
  try {
    result = await response.json();
  } catch (err) {
    return false;
  }

  if (!result || result.success !== true) return false;
  if (result.action && result.action !== action) return false;
  if (result.hostname && !ALLOWED_HOSTS[result.hostname]) return false;
  return true;
}

export async function onRequestPost(context) {
  var type = context.params && context.params.type;
  if (type !== "reserve" && type !== "takeout" && type !== "recruit") {
    return json({ error: "送信できませんでした。" }, 404);
  }

  var incoming;
  try {
    incoming = await context.request.formData();
  } catch (err) {
    return json({ error: "送信内容を読み取れませんでした。" }, 400);
  }

  var token = incoming.get("cf-turnstile-response");
  token = typeof token === "string" ? token.trim() : "";
  if (!token || token.length > TOKEN_LIMIT) {
    return json({ error: "セキュリティ確認に失敗しました。ページを再読み込みして、もう一度お試しください。" }, 403);
  }

  var ok = await verifyTurnstile(context.env, token, clientIp(context.request), type);
  if (!ok) {
    return json({ error: "セキュリティ確認に失敗しました。ページを再読み込みして、もう一度お試しください。" }, 403);
  }

  var forwarded = new FormData();
  var entries = incoming.entries();
  var entry = entries.next();
  while (!entry.done) {
    var name = entry.value[0];
    var value = entry.value[1];
    /* Formspree へは Turnstile を渡さない（ここで siteverify 済み。渡すと二重検証で拒否される） */
    if (name === "cf-turnstile-response") {
      entry = entries.next();
      continue;
    }
    if (typeof value === "string" && allowedField(type, name) && value.length <= FIELD_LIMIT) {
      forwarded.append(name, value);
    }
    entry = entries.next();
  }

  var endpoint = endpointFor(context.env, type);
  if (!endpoint) return json({ error: "送信できませんでした。" }, 500);

  var upstream;
  try {
    upstream = await fetch(endpoint, {
      method: "POST",
      body: forwarded,
      headers: { accept: "application/json" }
    });
  } catch (err) {
    return json({ error: "送信できませんでした。時間をおいてもう一度お試しください。" }, 502);
  }

  var payload = {};
  try {
    payload = await upstream.json();
  } catch (err) {
    payload = {};
  }
  if (!upstream.ok) {
    var message = payload && (payload.error || payload.message);
    return json({ error: message || "送信できませんでした。" }, upstream.status);
  }
  return json({ ok: true, next: payload.next || "/thanks" }, 200);
}
