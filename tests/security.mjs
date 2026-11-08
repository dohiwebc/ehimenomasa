// All verification and mail requests are mocked. No network is permitted.
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

async function load(file) {
  return import('data:text/javascript;base64,' + Buffer.from(await readFile(new URL(file, import.meta.url))).toString('base64'));
}
const {onRequest: middleware, contentSecurityPolicy, publicPath} = await load('../functions/_middleware.js');
const {onRequest: forms} = await load('../functions/api/forms/[type].js');
const env = {
  TURNSTILE_SECRET:'test-secret-only',
  FORMSPREE_RESERVE:'https://formspree.io/f/mockReserve',
  FORMSPREE_TAKEOUT:'https://formspree.io/f/mockTakeout',
  FORMSPREE_RECRUIT:'https://formspree.io/f/mockRecruit',
};
let cases = 0;
for (const host of ['ehimenomasa.com','www.ehimenomasa.com','ehimenomasa.pages.dev','codex-site-review.ehimenomasa.pages.dev']) {
  for (const mode of [undefined,'report-only','enforce']) {
    for (const [pathname,status] of [['/',200],['/reserve',200],['/missing',404],['/api/forms/reserve',403],['/menu-course/',301]]) {
      const response = await middleware({request:new Request('https://'+host+pathname),env:{CSP_MODE:mode},next:()=>new Response('test',{status:status===301?200:status})});
      const key = mode==='report-only'?'Content-Security-Policy-Report-Only':'Content-Security-Policy';
      assert.equal(response.headers.get(key), contentSecurityPolicy());
      assert.equal(response.headers.get(mode==='report-only'?'Content-Security-Policy':'Content-Security-Policy-Report-Only'),null);
      assert.equal(response.headers.get('X-Frame-Options'),'SAMEORIGIN');
      assert.equal(response.headers.get('Strict-Transport-Security'),'max-age=31536000');
      assert.equal(response.headers.get('Permissions-Policy'),'camera=(), microphone=(), geolocation=(), payment=()');
      assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');
      cases++;
    }
  }
}
const directives = new Map(contentSecurityPolicy().split('; ').map(item=>{const [key,...values]=item.split(' ');return [key,values];}));
assert.deepEqual(directives.get('script-src'),["'self'",'https://challenges.cloudflare.com']);
assert.deepEqual(directives.get('frame-ancestors'),["'self'"]);
assert.deepEqual(directives.get('object-src'),["'none'"]);
assert.deepEqual(directives.get('form-action'),["'self'"]);
assert.ok(!contentSecurityPolicy().includes('unsafe-eval'));
assert.ok(!contentSecurityPolicy().includes('*'));
console.log('Security headers: '+cases+' host/mode/status combinations; restricted CSP and no HSTS subdomains.');

const originalFetch = globalThis.fetch;
let verifies=0, forwards=0;
let verification={success:true,hostname:'ehimenomasa.com',action:'reserve'};
let verificationMode='normal';
let expectedType='reserve';
globalThis.fetch=async (url,options)=>{
  if(url==='https://challenges.cloudflare.com/turnstile/v0/siteverify') {
    verifies++;
    assert.equal(options.method,'POST');
    assert.equal(options.body.get('secret'),'test-secret-only');
    assert.equal(options.body.get('response'),'mock-token');
    if(verificationMode==='throw')throw Error('mock offline');
    if(verificationMode==='http')return new Response('',{status:500});
    if(verificationMode==='json')return new Response('invalid-json');
    return Response.json(verification);
  }
  assert.equal(url,env['FORMSPREE_'+expectedType.toUpperCase()]);
  assert.equal(options.method,'POST');
  assert.equal(options.body.has('cf-turnstile-response'),false);
  assert.equal(options.body.has('_website'),false);
  forwards++;
  return Response.json({ok:true});
};
function form(entries={}) {
  const body=new FormData();
  body.set('cf-turnstile-response','mock-token');
  body.set('_website','');
  body.set('お名前','検証のみ');
  for(const [key,value]of Object.entries(entries))body.set(key,value);
  return body;
}
async function call({type='reserve',method='POST',host='ehimenomasa.com',origin='https://'+host,body=form(),headers={},customEnv=env,request}={}) {
  const h=new Headers(headers);
  if(origin!==null)h.set('Origin',origin);
  const req=request||new Request('https://'+host+'/api/forms/'+type,{method,headers:h,...(['GET','HEAD'].includes(method)?{}:{body})});
  return forms({params:{type},env:customEnv,request:req});
}
async function rejected(options,status,{verified=false}={}) {
  const counts=[verifies,forwards];
  const response=await call(options);
  assert.equal(response.status,status);
  assert.equal(forwards,counts[1],'invalid request must not reach Formspree');
  assert.equal(verifies,counts[0]+Number(verified));
  assert.equal(response.headers.get('Cache-Control'),'no-store');
  cases++;
  return response;
}
try {
  for(const type of ['reserve','takeout','recruit']) {
    expectedType=type;
    for(const host of ['ehimenomasa.com','www.ehimenomasa.com','ehimenomasa.pages.dev','codex-site-review.ehimenomasa.pages.dev']) {
      verification={success:true,hostname:host,action:type};
      const body=form({'お名前':'名'.repeat(50),'お電話番号':'1'.repeat(20),'メールアドレス':'a'.repeat(254),[type==='reserve'?'その他、ご要望・ご相談':type==='takeout'?'その他ご要望・ご相談':'自己PR・質問']:'備'.repeat(1000)});
      const response=await call({type,host,body});
      assert.equal(response.status,200);
      assert.equal(response.headers.get('Access-Control-Allow-Origin'),'https://'+host);
      assert.equal(response.headers.get('Vary'),'Origin');
      cases++;
    }
    for(const method of ['GET','HEAD','PUT','PATCH','DELETE','OPTIONS']) {
      const response=await rejected({type,method},405);
      assert.equal(response.headers.get('Allow'),'POST');
    }
    for(const origin of [null,'null','https://evil.example','https://ehimenomasa.com.evil.example','http://ehimenomasa.com','https://www.ehimenomasa.com','https://ehimenomasa.com:444']) {
      const response=await rejected({type,origin},403);
      assert.equal(response.headers.get('Access-Control-Allow-Origin'),null);
    }
    for(const host of ['evil.example','evil.ehimenomasa.pages.dev','constructor','__proto__'])await rejected({type,host},403);
    for(const [key,limit] of [['お名前',50],['お電話番号',20],['メールアドレス',254],['email',254],['_replyto',254],['_subject',200],[type==='reserve'?'その他、ご要望・ご相談':type==='takeout'?'その他ご要望・ご相談':'自己PR・質問',1000]]) {
      await rejected({type,body:form({[key]:'a'.repeat(limit+1)})},400);
    }
    await rejected({type,body:form({_website:'https://spam.invalid'})},400);
    await rejected({type,body:form({'cf-turnstile-response':''})},403);
    const missing=form();missing.delete('cf-turnstile-response');await rejected({type,body:missing},403);
    await rejected({type,body:form({'cf-turnstile-response':'a'.repeat(2049)})},403);
    await rejected({type,body:form({'unknown':'test'})},400);
    const duplicate=form();duplicate.append('お名前','duplicate');await rejected({type,body:duplicate},400);
    await rejected({type,body:form({'お名前':new Blob(['file'])})},400);
    await rejected({type,body:'{}',headers:{'Content-Type':'application/json'}},400);
    await rejected({type,body:form(),headers:{'Content-Length':'65537'}},413);
    const oversized=new Request('https://ehimenomasa.com/api/forms/'+type,{
      method:'POST',headers:{Origin:'https://ehimenomasa.com','Content-Type':'application/x-www-form-urlencoded','Content-Length':'1'},
      body:new ReadableStream({start(controller){controller.enqueue(new Uint8Array(40000));controller.enqueue(new Uint8Array(40000));controller.close();}}),duplex:'half',
    });
    await rejected({type,request:oversized},413);
    for(const result of [
      {success:false,action:type,hostname:'ehimenomasa.com'},
      {success:true,action:'wrong',hostname:'ehimenomasa.com'},
      {success:true,action:type,hostname:'evil.example'},
      {success:true,action:type,hostname:'www.ehimenomasa.com'},
      {success:true,hostname:'ehimenomasa.com'},
      {success:true,action:type},
    ]) {
      verification=result;
      await rejected({type},403,{verified:true});
    }
    for(const failure of ['throw','http','json']) {
      verificationMode=failure;
      await rejected({type},403,{verified:true});
    }
    verificationMode='normal';
    await rejected({type,customEnv:{...env,TURNSTILE_SECRET:''}},403);
  }
  for(const type of ['unknown','constructor','__proto__','reserve/extra'])await rejected({type},404);
  const many=form();for(let n=1;n<=33;n++)many.set('ご予約 '+n,'test');await rejected({type:'takeout',body:many},400);
  assert.equal(forwards,12);
} finally {globalThis.fetch=originalFetch;}
console.log('Forms: '+cases+' cumulative assertions/cases; 12 valid submissions mocked, all invalid inputs blocked before forwarding.');

const script=await readFile(new URL('../js/form-demo.js',import.meta.url),'utf8');
const escapeSource=script.slice(script.indexOf('  function escapeHtml('),script.indexOf('  /** ローカル日付'));
const sandbox={};vm.runInNewContext(escapeSource+';result=escapeHtml("<>&\\\"\'+")',sandbox);
assert.equal(sandbox.result,'&lt;&gt;&amp;&quot;&#39;+');
console.log('escapeHtml: ampersand, angle brackets, double and single quotes escaped.');

async function walk(directory) {
  const files=[];
  for(const item of await readdir(directory,{withFileTypes:true})) {
    const name=directory+'/'+item.name;
    if(item.isDirectory())files.push(...await walk(name));else files.push(name);
  }
  return files;
}
const root=fileURLToPath(new URL('../dist/',import.meta.url)).replace(/\/$/,'');
const files=(await walk(root)).map(file=>file.slice(root.length+1));
assert.ok(files.includes('404.html')&&files.includes('robots.txt'));
for(const file of files) {
  assert.ok(!/(^|\/)(?:\.|wrangler|README|TODO|tests|docs|scripts|templates|functions|requirements|original)/i.test(file),file);
  assert.ok(/^(?:[a-z0-9-]+\.html|robots\.txt|sitemap\.xml|_redirects|(?:css|js)\/[a-z-]+\.(?:css|js)|assets\/(?:icons|images\/site)\/.+\.(?:svg|png|webp|ico|jpg|jpeg|gif|avif))$/.test(file),file);
  if(!file.endsWith('.html')&&file!=='_redirects')assert.equal(publicPath('/'+file),true,file+': middleware/build allowlist mismatch');
}
for(const pathname of ['/wrangler.toml','/%77rangler.toml','/.env','/.git/config','/docs/notes.md','/tests/functions.mjs','/functions/_middleware.js','/_redirects','/_worker.js','/_routes.json','/css/style-v1.css','/assets/images/original/source.jpg','/assets/images/site/../.env','/%','/unknown']) {
  let requested;
  const result=await middleware({request:new Request('https://ehimenomasa.com'+pathname),env:{},next:request=>{requested=request.url;return new Response('error page',{headers:{'Access-Control-Allow-Origin':'*','ETag':'old-config-cache'}});}});
  assert.equal(result.status,404,pathname);
  assert.equal(requested,'https://ehimenomasa.com/404',pathname+': must not fetch stale private cache');
  assert.equal(await result.text(),'error page');
  assert.equal(result.headers.get('Cache-Control'),'no-store');
  assert.equal(result.headers.get('Access-Control-Allow-Origin'),null);
  assert.equal(result.headers.get('ETag'),null);
}
assert.match(await readFile(new URL('../wrangler.toml',import.meta.url),'utf8'),/pages_build_output_dir = "dist"/);
for(const type of ['reserve','takeout','recruit']) {
  const html=await readFile(new URL('../dist/'+type+'.html',import.meta.url),'utf8');
  for(const [name,length]of [['name',50],['tel',20],['email',254],['note',1000]]) {
    const tag=html.match(new RegExp('<(?:input|textarea)\\b[^>]*name="'+name+'"[^>]*>'))?.[0];
    assert.ok(tag&&tag.includes('maxlength="'+length+'"'),type+': '+name);
  }
  assert.match(html,/<div hidden aria-hidden="true"><input[^>]+name="_website"[^>]+tabindex="-1"[^>]+autocomplete="off"/);
}
console.log('Public build: '+files.length+' allowed files only; no config, env, notes, source, tests or original images; all three forms have limits and hidden traps.');
