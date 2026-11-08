import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

async function load(relative) {
  return import('data:text/javascript;base64,' + Buffer.from(await readFile(new URL(relative, import.meta.url))).toString('base64'));
}
const {onRequest} = await load('../functions/_middleware.js');
for (const [hostname, enabled, redirected] of [
  ['ehimenomasa.pages.dev','1',true],
  ['ehimenomasa.pages.dev',undefined,false],
  ['ehimenomasa.pages.dev','0',false],
  ['preview.ehimenomasa.pages.dev','1',false],
  ['ehimenomasa.com','1',false],
]) {
  let next = false;
  const result = await onRequest({request:new Request('https://'+hostname+'/menu?ref=test'),env:{CANONICAL_REDIRECT:enabled},next:()=>{next=true;return new Response('ok');}});
  assert.equal(next,!redirected);
  assert.equal(result.status,redirected?301:200);
  if(redirected)assert.equal(result.headers.get('location'),'https://ehimenomasa.com/menu?ref=test');
}
const index=await onRequest({request:new Request('https://ehimenomasa.pages.dev/index.html'),env:{CANONICAL_REDIRECT:'1'},next:()=>{throw Error('unexpected next');}});
assert.equal(index.headers.get('location'),'https://ehimenomasa.com/');
console.log('Redirect: disabled by default, exact production host only, path/query preserved.');

for(const host of ['ehimenomasa.com','www.ehimenomasa.com','ehimenomasa.pages.dev','preview.ehimenomasa.pages.dev','localhost']) {
  for(const pathname of ['/menu','/thanks','/thanks-recruit','/missing']) {
    const status=pathname==='/missing'?404:200;
    const result=await onRequest({request:new Request('https://'+host+pathname),env:{},next:()=>new Response('ok',{status,headers:{'X-Robots-Tag':'noindex'}})});
    if(host==='www.ehimenomasa.com') {
      assert.equal(result.status,301);
      assert.equal(result.headers.get('location'),'https://ehimenomasa.com'+pathname);
      continue;
    }
    const robots=result.headers.get('x-robots-tag');
    if(pathname.startsWith('/thanks'))assert.equal(robots,'noindex, nofollow');
    else if(status===404||host!=='ehimenomasa.com')assert.equal(robots,'noindex');
    else assert.equal(robots,null);
  }
}
for(const [from,to] of [['/index.html','/'],['/index','/'],['/menu.html','/menu'],['/course/','/course'],['/thanks/','/thanks'],['/404.html','/404']]) {
  const result=await onRequest({request:new Request('https://ehimenomasa.com'+from+'?keep=1'),env:{},next:()=>{throw Error('must redirect')}});
  assert.equal(result.status,301);assert.equal(result.headers.get('location'),'https://ehimenomasa.com'+to+'?keep=1');
}
console.log('SEO middleware: host-specific robots, error pages, completion pages, www and clean URL redirects passed.');

const legacyPairs=[['/menu-course','/menu'],['/corporate','/about'],['/gallery','/shop'],['/news','/'],['/category/blog','/'],['/author/famedemo','/'],['/sitemap_index.xml','/sitemap.xml'],['/wp-sitemap.xml','/sitemap.xml']];
const expectedLegacy=new Map(legacyPairs.flatMap(([from,to])=>from.endsWith('.xml')?[[from,to]]:[[from,to],[from+'/',to]]));
const redirectLines=(await readFile(new URL('../_redirects',import.meta.url),'utf8')).split('\n').map(s=>s.trim()).filter(s=>s&&!s.startsWith('#')).map(s=>s.split(/\s+/));
assert.equal(redirectLines.length,14);
assert.ok(redirectLines.every(([, ,status])=>status==='301'));
assert.deepEqual(new Map(redirectLines.map(([from,to])=>[from,to])),expectedLegacy);
const destinations=new Set(['/','/menu','/about','/shop','/sitemap.xml']);
for(const host of ['ehimenomasa.com','www.ehimenomasa.com','ehimenomasa.pages.dev','preview.ehimenomasa.pages.dev'])for(const method of ['GET','HEAD'])for(const [from,to]of expectedLegacy) {
  const start='https://'+host+from+'?keep=1';
  const env={CANONICAL_REDIRECT:'1'};
  const call=url=>onRequest({request:new Request(url,{method}),env,next:()=>new Response(null,{status:destinations.has(new URL(url).pathname)?200:404})});
  const response=await call(start);
  assert.equal(response.status,301);
  const target=new URL(response.headers.get('location'));
  assert.equal(target.pathname,to);assert.equal(target.search,'?keep=1');
  assert.equal(target.hostname,host==='www.ehimenomasa.com'||host==='ehimenomasa.pages.dev'?'ehimenomasa.com':host);
  assert.notEqual(target.href,start);
  assert.equal((await call(target.href)).status,200,'must terminate after one redirect');
}
for(const host of ['ehimenomasa.com','preview.ehimenomasa.pages.dev']) {
  const result=await onRequest({request:new Request('https://'+host+'/2021/12/30/markup-html-tags-and-formatting/'),env:{},next:()=>new Response('not found',{status:404})});
  assert.equal(result.status,404);assert.equal(result.headers.get('location'),null);
}
console.log('Legacy redirects: 14 rules match middleware; GET/HEAD x 4 hosts reach final targets in one hop; excluded WordPress article stays 404.');

const {onRequest:onRequestPost}=await load('../functions/api/forms/[type].js');
const originalFetch = globalThis.fetch;
let verification=true;
let forwards=0;
globalThis.fetch=async (url,options)=>{
  if(String(url).startsWith('https://challenges.cloudflare.com/'))return Response.json({success:verification,action:'takeout',hostname:'ehimenomasa.com'});
  assert.equal(url,'https://formspree.io/f/testMock');
  forwards++;
  assert.equal(options.body.get('ご予約 1'),'骨付鳥 1個');
  assert.equal(options.body.has('cf-turnstile-response'),false);
  return Response.json({ok:true});
};
try {
  for (const valid of [true,false]) {
    verification=valid;
    const body=new FormData();body.set('cf-turnstile-response','mock-token');body.set('ご予約 1','骨付鳥 1個');
    const response=await onRequestPost({params:{type:'takeout'},env:{TURNSTILE_SECRET:'test-only',FORMSPREE_TAKEOUT:'https://formspree.io/f/testMock'},request:new Request('https://ehimenomasa.com/api/forms/takeout',{method:'POST',headers:{Origin:'https://ehimenomasa.com'},body})});
    assert.equal(response.status,valid?200:403);
  }
  assert.equal(forwards,1);
} finally {globalThis.fetch=originalFetch;}
console.log('Forms: new reservation field forwarded, Turnstile token excluded, invalid token blocked; all fetch calls mocked.');
