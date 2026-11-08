// GET-only, pinned to the preview alias; never contacts production or submits forms.
import assert from 'node:assert/strict';
const BASE='https://codex-site-review.ehimenomasa.pages.dev';
const pages=['/','/menu','/course','/shop','/about','/reserve','/takeout','/recruit','/privacy','/thanks','/thanks-recruit','/404','/menu-course/'];
for(const pathname of pages) {
  const response=await fetch(BASE+pathname,{redirect:'manual'});
  assert.equal(response.status,pathname==='/404'?404:pathname==='/menu-course/'?301:200,pathname);
  assert.equal(response.headers.get('X-Frame-Options'),'SAMEORIGIN');
  assert.equal(response.headers.get('Strict-Transport-Security'),'max-age=31536000');
  assert.equal(response.headers.get('Permissions-Policy'),'camera=(), microphone=(), geolocation=(), payment=()');
  assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');
  assert.ok(response.headers.get('Content-Security-Policy')?.includes("frame-ancestors 'self'"));
  assert.equal(response.headers.get('Content-Security-Policy-Report-Only'),null);
  assert.notEqual(response.headers.get('Access-Control-Allow-Origin'),'*');
  await response.arrayBuffer();
}
const privatePaths=[
  '/wrangler.toml','/.assetsignore','/.env','/.env.example','/.git/config','/.github/workflows/build.yml',
  '/README.md','/TODO.md','/requirements.txt','/scripts/build_site.py','/scripts/export_public.py',
  '/tests/functions.mjs','/tests/security.mjs','/tests/security-browser.cjs',
  '/docs/2026-11-08-seo-final.md','/docs/2026-11-08-security.md',
  '/templates/recruit.html.j2','/functions/_middleware.js','/functions/api/forms/[type].js',
  '/_redirects','/_worker.js','/_routes.json','/css/style-v1.css','/css/responsive-v1.css',
];
for(const pathname of privatePaths) {
  const response=await fetch(BASE+pathname,{redirect:'manual'});
  assert.equal(response.status,404,pathname);
  assert.ok(!(await response.text()).includes('TURNSTILE_SECRET'),pathname+': source disclosure');
}
console.log('Preview: '+pages.length+' page/redirect/error responses have security headers; '+privatePaths.length+' private/config/source paths return 404. GET only; no submissions.');
