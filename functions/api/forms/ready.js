/**
 * 受付口の環境変数が入っているかだけ返す。アドレス自体は返さない。
 */

function present(value) {
  return /^https:\/\/formspree\.io\/f\/[A-Za-z0-9]+$/.test(String(value || ""));
}

export async function onRequestGet(context) {
  var env = context.env || {};
  return new Response(
    JSON.stringify({
      reserve: present(env.FORMSPREE_RESERVE),
      takeout: present(env.FORMSPREE_TAKEOUT),
      recruit: present(env.FORMSPREE_RECRUIT)
    }),
    {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store"
      }
    }
  );
}
