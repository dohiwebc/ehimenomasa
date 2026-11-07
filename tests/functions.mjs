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
  const result = await onRequest({request:new Request('https://'+hostname+'/menu.html?ref=test'),env:{CANONICAL_REDIRECT:enabled},next:()=>{next=true;return new Response('ok');}});
  assert.equal(next,!redirected);
  assert.equal(result.status,redirected?301:200);
  if(redirected)assert.equal(result.headers.get('location'),'https://ehimenomasa.com/menu?ref=test');
}
const index=await onRequest({request:new Request('https://ehimenomasa.pages.dev/index.html'),env:{CANONICAL_REDIRECT:'1'},next:()=>{throw Error('unexpected next');}});
assert.equal(index.headers.get('location'),'https://ehimenomasa.com/');
console.log('Redirect: disabled by default, exact production host only, path/query preserved.');

const {onRequestPost}=await load('../functions/api/forms/[type].js');
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
    const response=await onRequestPost({params:{type:'takeout'},env:{TURNSTILE_SECRET:'test-only',FORMSPREE_TAKEOUT:'https://formspree.io/f/testMock'},request:new Request('https://ehimenomasa.com/api/forms/takeout',{method:'POST',body})});
    assert.equal(response.status,valid?200:403);
  }
  assert.equal(forwards,1);
} finally {globalThis.fetch=originalFetch;}
console.log('Forms: new reservation field forwarded, Turnstile token excluded, invalid token blocked; all fetch calls mocked.');
