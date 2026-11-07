/** Enable only after the custom domain and its TLS certificate are connected. */
export function onRequest(context) {
  var url = new URL(context.request.url);
  if (context.env.CANONICAL_REDIRECT === "1" && url.hostname === "ehimenomasa.pages.dev") {
    url.protocol = "https:";
    url.hostname = "ehimenomasa.com";
    if (url.pathname === "/index.html") url.pathname = "/";
    else if (url.pathname.endsWith(".html")) url.pathname = url.pathname.slice(0, -5);
    return Response.redirect(url.toString(), 301);
  }
  return context.next();
}
