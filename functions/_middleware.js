var PRODUCTION_HOSTS = ["ehimenomasa.com", "www.ehimenomasa.com"];
var PAGE_NAMES = ["menu", "course", "shop", "about", "recruit", "privacy", "reserve", "takeout", "thanks", "thanks-recruit", "404"];
// Pages Functions bypass _redirects; tests enforce the same confirmed mapping.
var LEGACY_REDIRECTS = {
  "/menu-course": "/menu",
  "/menu-course/": "/menu",
  "/corporate": "/about",
  "/corporate/": "/about",
  "/gallery": "/shop",
  "/gallery/": "/shop",
  "/news": "/",
  "/news/": "/",
  "/category/blog": "/",
  "/category/blog/": "/",
  "/author/famedemo": "/",
  "/author/famedemo/": "/",
  "/sitemap_index.xml": "/sitemap.xml",
  "/wp-sitemap.xml": "/sitemap.xml"
};

export function contentSecurityPolicy() {
  return [
    "default-src 'self'",
    "script-src 'self' https://challenges.cloudflare.com",
    "script-src-attr 'none'",
    // Existing background images and dynamic UI use inline styles, not scripts.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' https://images.microcms-assets.io data:",
    "connect-src 'self' https://challenges.cloudflare.com",
    "frame-src 'self' https://challenges.cloudflare.com https://www.google.com/maps/ https://www.instagram.com/ https://www.youtube.com/embed/",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'"
  ].join("; ");
}

export function publicPath(pathname) {
  try { pathname = decodeURIComponent(pathname); } catch (err) { return false; }
  if (pathname.split("/").some(function (part) { return part.charAt(0) === "."; })) return false;
  if (pathname === "/" || pathname === "/robots.txt" || pathname === "/sitemap.xml") return true;
  if (PAGE_NAMES.indexOf(pathname.slice(1)) !== -1) return true;
  if (/^\/api\/forms\//.test(pathname) || /^\/cdn-cgi\//.test(pathname)) return true;
  if (/^\/css\/(?:reset|style|responsive)\.css$/.test(pathname)) return true;
  if (/^\/js\/(?:main|slider|instagram-feed|form-demo)\.js$/.test(pathname)) return true;
  return /^\/assets\/(?:icons|images\/site)\/.+\.(?:svg|png|webp|ico|jpg|jpeg|gif|avif)$/i.test(pathname);
}

function indexingHeaders(response, url, env) {
  var result = new Response(response.body, response);
  if (result.headers.get("Access-Control-Allow-Origin") === "*") result.headers.delete("Access-Control-Allow-Origin");
  // Report-Only was browser-verified before enabling enforcement; retain rollback.
  var reportOnly = env.CSP_MODE === "report-only";
  result.headers.delete("Content-Security-Policy");
  result.headers.delete("Content-Security-Policy-Report-Only");
  result.headers.set(reportOnly ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy", contentSecurityPolicy());
  result.headers.set("X-Frame-Options", "SAMEORIGIN");
  if (url.protocol === "https:") result.headers.set("Strict-Transport-Security", "max-age=31536000");
  result.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  result.headers.set("X-Content-Type-Options", "nosniff");
  var completion = /^\/thanks(?:-recruit)?(?:\.html|\/)?$/.test(url.pathname);
  if (completion) result.headers.set("X-Robots-Tag", "noindex, nofollow");
  else if (response.status === 404 || PRODUCTION_HOSTS.indexOf(url.hostname) === -1) result.headers.set("X-Robots-Tag", "noindex");
  else result.headers.delete("X-Robots-Tag");
  return result;
}

export async function onRequest(context) {
  var url = new URL(context.request.url);
  var env = context.env || {};
  if (context.request.method === "GET" || context.request.method === "HEAD") {
    var target = new URL(url);
    if ((env.CANONICAL_REDIRECT === "1" && url.hostname === "ehimenomasa.pages.dev") || url.hostname === "www.ehimenomasa.com") {
      target.protocol = "https:";
      target.hostname = "ehimenomasa.com";
    }
    var legacy = LEGACY_REDIRECTS[url.pathname];
    if (legacy) target.pathname = legacy;
    else if (/^\/index(?:\.html|\/)?$/.test(url.pathname)) target.pathname = "/";
    else {
      var match = url.pathname.match(/^\/([^/]+?)(?:\.html|\/)$/);
      if (match && PAGE_NAMES.indexOf(match[1]) !== -1) target.pathname = "/" + match[1];
    }
    if (target.toString() !== url.toString()) return indexingHeaders(Response.redirect(target.toString(), 301), url, env);
  }
  // Removed files may survive in the alias asset cache. Never request those assets.
  if (!publicPath(url.pathname)) {
    var error = await context.next(new Request(new URL("/404", url), {method:"GET"}));
    var denied = new Response(error.body, {status:404, headers:error.headers});
    denied.headers.set("Cache-Control", "no-store");
    denied.headers.delete("ETag");
    denied.headers.delete("Content-Length");
    return indexingHeaders(denied, url, env);
  }
  var response = await context.next();
  // A directly requested error document must not become an indexable 200 page.
  if (/^\/404(?:\.html|\/)?$/.test(url.pathname)) response = new Response(response.body, {status:404, headers:response.headers});
  return indexingHeaders(response, url, env);
}
