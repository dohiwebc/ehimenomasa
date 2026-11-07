/* Read-only HTTP verification of a preview. Never submits a form. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
const base = process.argv[2] || 'https://codex-site-review.ehimenomasa.pages.dev';
const records=[];
async function get(path, expected=200) {
  const response=await fetch(base+path,{redirect:'manual'});
  assert.equal(response.status,expected,path);
  assert.match(response.headers.get('x-robots-tag')||'',/noindex/,path);
  const body=await response.text();
  records.push({path,status:response.status,robots:response.headers.get('x-robots-tag')});
  return {body,response};
}
const {body:sitemap}=await get('/sitemap.xml');
const locations=[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]);
assert.equal(locations.length,9);
for(const canonical of locations) {
  assert.ok(canonical.startsWith('https://ehimenomasa.com/'));
  const pathname=new URL(canonical).pathname;
  const {body}=await get(pathname);
  assert.ok(body.includes('<link rel="canonical" href="'+canonical+'">'),pathname);
  assert.ok(body.includes('<meta property="og:url" content="'+canonical+'">'),pathname);
  assert.ok(!/<meta name="robots" content="[^\"]*noindex/.test(body),pathname);
  for(const match of body.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g))JSON.parse(match[1]);
  if(pathname==='/') {
    const restaurant=[...body.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m=>JSON.parse(m[1])).find(d=>d['@type']==='Restaurant');
    assert.ok(!('priceRange' in restaurant));
    assert.deepEqual(restaurant.sameAs,['https://www.instagram.com/ehimenomasa/','https://www.hotpepper.jp/strJ004612520/','https://www.google.com/maps?cid=9419635694924827751']);
  }
}
for(const pathname of ['/this-page-does-not-exist','/access','/nested/deep/missing','/404','/2021/12/30/markup-html-tags-and-formatting/']) {
  const {body}=await get(pathname,404);
  assert.ok(body.includes('お探しのページが見つかりません'));
  assert.ok(body.includes('<meta name="robots" content="noindex">'));
  assert.ok(!body.includes('rel="canonical"'));
  assert.ok(body.includes('href="/css/style.css'));
}
const legacyLines=(await readFile(new URL('../_redirects',import.meta.url),'utf8')).split('\n').map(s=>s.trim()).filter(s=>s&&!s.startsWith('#')).map(s=>s.split(/\s+/));
assert.equal(legacyLines.length,14);
for(const [from,to]of legacyLines) {
  const response=await fetch(base+from+'?keep=1',{redirect:'manual'});
  assert.equal(response.status,301,from);
  const location=new URL(response.headers.get('location'),base);
  assert.equal(location.href,base+to+'?keep=1');
  const final=await fetch(location,{redirect:'manual'});
  assert.equal(final.status,200,from+' must terminate in one hop');
  records.push({path:from,status:301,location:location.href,finalStatus:final.status});
}
for(const [from,to] of [['/index.html','/'],['/index','/'],['/menu.html','/menu'],['/course/','/course'],['/menu/','/menu'],['/404.html','/404']]) {
  const response=await fetch(base+from+'?keep=1',{redirect:'manual'});
  assert.ok([301,308].includes(response.status),from);
  assert.equal(new URL(response.headers.get('location'),base).href,base+to+'?keep=1');
  records.push({path:from,status:response.status,location:response.headers.get('location')});
}
for(const pathname of ['/thanks','/thanks-recruit']) {
  const {body,response}=await get(pathname);
  assert.ok(body.includes('content="noindex, nofollow"'));
  assert.equal(response.headers.get('x-robots-tag'),'noindex, nofollow');
}
await writeFile('/private/tmp/masa-seo-live.json',JSON.stringify({base,records},null,2));
console.log('Preview HTTP checks passed: 9 sitemap URLs, Restaurant data, five real 404s, robots, 14 legacy redirects in one hop, six clean URL redirects and completion pages.');
console.log(JSON.stringify(records,null,2));
