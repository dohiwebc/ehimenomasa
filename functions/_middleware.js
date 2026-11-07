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

function indexingHeaders(response, url) {
  var result = new Response(response.body, response);
  var completion = /^\/thanks(?:-recruit)?(?:\.html|\/)?$/.test(url.pathname);
  if (completion) result.headers.set("X-Robots-Tag", "noindex, nofollow");
  else if (response.status === 404 || PRODUCTION_HOSTS.indexOf(url.hostname) === -1) result.headers.set("X-Robots-Tag", "noindex");
  else result.headers.delete("X-Robots-Tag");
  return result;
}

export async function onRequest(context) {
  var url = new URL(context.request.url);
  if (context.request.method === "GET" || context.request.method === "HEAD") {
    var target = new URL(url);
    if ((context.env.CANONICAL_REDIRECT === "1" && url.hostname === "ehimenomasa.pages.dev") || url.hostname === "www.ehimenomasa.com") {
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
    if (target.toString() !== url.toString()) return indexingHeaders(Response.redirect(target.toString(), 301), url);
  }
  var response = await context.next();
  // A directly requested error document must not become an indexable 200 page.
  if (/^\/404(?:\.html|\/)?$/.test(url.pathname)) response = new Response(response.body, {status:404, headers:response.headers});
  return indexingHeaders(response, url);
}
