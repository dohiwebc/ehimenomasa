/**
 * 予約・テイクアウト・応募を受け、Turnstile を Cloudflare に確認してから Formspree へ渡す。
 * Secret Key は環境変数 TURNSTILE_SECRET（Pages のシークレット）。ソースには置かない。
 */

var ALLOWED_HOSTS = new Set([
  "ehimenomasa.com",
  "www.ehimenomasa.com",
  "ehimenomasa.pages.dev",
  "codex-site-review.ehimenomasa.pages.dev"
]);

var BODY_LIMIT = 65536;
var FIELD_COUNT_LIMIT = 32;
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
      /^ご(?:予約|注文) \d{1,2}$/.test(name)
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

function fieldLimit(name) {
  if (name === "お名前") return 50;
  if (name === "お電話番号") return 20;
  if (name === "メールアドレス" || name === "email" || name === "_replyto") return 254;
  if (name === "その他、ご要望・ご相談" || name === "その他ご要望・ご相談" || name === "自己PR・質問") return 1000;
  if (name === "ご来店日" || name === "受取日") return 10;
  if (name === "ご来店時間" || name === "受取時間") return 5;
  if (name === "ご予約人数" || name === "年齢") return 20;
  if (name === "_subject") return 200;
  return 200;
}

async function boundedFormData(request) {
  var declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > BODY_LIMIT)) {
    throw new Error("body-too-large");
  }
  var contentType = request.headers.get("content-type") || "";
  if (!/^(multipart\/form-data|application\/x-www-form-urlencoded)(?:;|$)/i.test(contentType)) {
    throw new Error("content-type");
  }
  var reader = request.body && request.body.getReader();
  if (!reader) throw new Error("empty-body");
  var chunks = [];
  var size = 0;
  try {
    while (true) {
      var chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > BODY_LIMIT) {
        await reader.cancel();
        throw new Error("body-too-large");
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  return new Response(new Blob(chunks), {headers:{"content-type":contentType}}).formData();
}

function clientIp(request) {
  return request.headers.get("CF-Connecting-IP") || "";
}

async function verifyTurnstile(env, token, ip, action, hostname) {
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
  if (result.action !== action) return false;
  if (result.hostname !== hostname || !ALLOWED_HOSTS.has(result.hostname)) return false;
  return true;
}

async function handlePost(context, hostname) {
  var type = context.params && context.params.type;
  if (type !== "reserve" && type !== "takeout" && type !== "recruit") {
    return json({ error: "送信できませんでした。" }, 404);
  }

  var incoming;
  try {
    incoming = await boundedFormData(context.request);
  } catch (err) {
    return json({ error: "送信内容を読み取れませんでした。" }, err.message === "body-too-large" ? 413 : 400);
  }

  var seen = new Set();
  for (var pair of incoming) {
    var key = pair[0];
    var value = pair[1];
    if (seen.has(key) || seen.size >= FIELD_COUNT_LIMIT || typeof value !== "string") {
      return json({ error: "送信内容を読み取れませんでした。" }, 400);
    }
    seen.add(key);
    if (key === "_website") {
      if (value !== "") return json({ error: "送信できませんでした。" }, 400);
    } else if (key === "cf-turnstile-response") {
      if (value.length > TOKEN_LIMIT) return json({ error: "セキュリティ確認に失敗しました。" }, 403);
    } else if (!allowedField(type, key) || value.length > fieldLimit(key)) {
      return json({ error: "送信内容を読み取れませんでした。" }, 400);
    }
  }

  var token = incoming.get("cf-turnstile-response");
  token = typeof token === "string" ? token.trim() : "";
  if (!token || token.length > TOKEN_LIMIT) {
    return json({ error: "セキュリティ確認に失敗しました。ページを再読み込みして、もう一度お試しください。" }, 403);
  }

  var ok = await verifyTurnstile(context.env, token, clientIp(context.request), type, hostname);
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
    if (name === "cf-turnstile-response" || name === "_website") {
      entry = entries.next();
      continue;
    }
    if (typeof value === "string" && allowedField(type, name)) {
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

export async function onRequest(context) {
  var type = context.params && context.params.type;
  var url = new URL(context.request.url);
  var origin = context.request.headers.get("Origin");
  var allowedOrigin = url.protocol === "https:" && ALLOWED_HOSTS.has(url.hostname) && origin === url.origin;
  var response;
  if (type !== "reserve" && type !== "takeout" && type !== "recruit") {
    response = json({error:"送信できませんでした。"}, 404);
  } else if (context.request.method !== "POST") {
    response = json({error:"送信できませんでした。"}, 405);
    response.headers.set("Allow", "POST");
  } else if (!allowedOrigin) {
    response = json({error:"送信できませんでした。"}, 403);
  } else {
    response = await handlePost(context, url.hostname);
  }
  response.headers.set("Vary", "Origin");
  if (allowedOrigin) response.headers.set("Access-Control-Allow-Origin", origin);
  return response;
}
