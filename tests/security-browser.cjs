/* Virtual production origin: every own-site request is served from disk, never sent to production. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const {PNG} = require('pngjs');
const ROOT = path.resolve(__dirname,'..');
const DEPLOYED = process.argv.includes('--deployed');
const BASE = DEPLOYED ? 'https://codex-site-review.ehimenomasa.pages.dev' : 'https://ehimenomasa.com';
const OUTPUT = process.env.MASA_SECURITY_OUTPUT || '/private/tmp/masa-security-check';
const BEFORE = process.env.MASA_SECURITY_BEFORE;
const LIVE = DEPLOYED || process.argv.includes('--live-external');
const MODE = process.env.MASA_CSP_MODE || 'enforce';
const PAGES = ['','menu','course','shop','about','reserve','takeout','recruit','privacy','thanks','thanks-recruit','404'];
const MIME = {'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.ico':'image/x-icon'};
const requests = new Map();
const successfulHosts = new Set();
let sentToProduction = 0;

function localResponse(url, root) {
  let pathname;
  try {pathname=decodeURIComponent(new URL(url).pathname);}catch{return new Response('',{status:400});}
  if(pathname==='/api/forms/ready')return Response.json({reserve:true,takeout:true,recruit:true});
  let file=path.join(root,pathname==='/'?'index.html':pathname);
  if(!path.extname(file))file+='.html';
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()) {
    return new Response(fs.readFileSync(path.join(root,'404.html')),{status:404,headers:{'Content-Type':MIME['.html']}});
  }
  return new Response(fs.readFileSync(file),{headers:{'Content-Type':MIME[path.extname(file)]||'application/octet-stream'}});
}

async function main() {
  fs.mkdirSync(OUTPUT,{recursive:true});
  const source=fs.readFileSync(path.join(ROOT,'functions/_middleware.js'),'utf8');
  const {onRequest:middleware}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--disable-gpu']});
  try {
    async function contextFor(root, secured) {
      const context=await browser.newContext({reducedMotion:'reduce',timezoneId:'Asia/Tokyo'});
      await context.route('**/*',async route=>{
        const request=route.request();const url=new URL(request.url());
        if(url.origin===BASE) {
          if(!['GET','HEAD'].includes(request.method())) {
            sentToProduction++;
            return route.fulfill({status:400,contentType:'application/json',body:'{}'});
          }
          if(DEPLOYED)return route.continue();
          const response=secured?await middleware({request:new Request(url,{method:request.method()}),env:{CSP_MODE:MODE},next:replacement=>localResponse(replacement?.url||url,root)}):localResponse(url,root);
          return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
        }
        if(LIVE) {
          // These requests are embedded resources only, not restaurant/API submissions.
          if(request.isNavigationRequest()&&request.frame()===request.frame().page().mainFrame())return route.abort();
          return route.continue();
        }
        if(url.hostname==='images.microcms-assets.io') {
          const file=path.join(root,'assets/images/site',path.basename(url.pathname));
          if(fs.existsSync(file))return route.fulfill({contentType:MIME[path.extname(file)],body:fs.readFileSync(file)});
        }
        if(request.resourceType()==='document')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'});
        return route.abort();
      });
      if(!LIVE)await context.addInitScript(()=>{
        window.turnstile={render:(_el,options)=>{options.callback('mock-token');return 'mock';},getResponse:()=> 'mock-token',reset:()=>{}};
      });
      return context;
    }
    const secured=await contextFor(path.join(ROOT,'dist'),true);
    const baseline=BEFORE&&!LIVE?await contextFor(BEFORE,false):null;
    const page=await secured.newPage();
    const oldPage=baseline?await baseline.newPage():null;
    const violations=[];
    await secured.exposeBinding('securityViolation',(source,event)=>{if(source.frame===source.page.mainFrame())violations.push(event);});
    await secured.addInitScript(()=>{
      document.addEventListener('securitypolicyviolation',event=>window.securityViolation({directive:event.effectiveDirective,blocked:event.blockedURI,disposition:event.disposition,document:event.documentURI}));
    });
    secured.on('response',response=>{
      const url=new URL(response.url());
      if(url.origin!==BASE)requests.set(url.hostname,{status:response.status(),type:response.request().resourceType()});
      if(response.ok()&&url.origin!==BASE)successfulHosts.add(url.hostname);
    });
    for(const name of PAGES) {
      for(const width of (LIVE?[1440]:[375,1440])) {
        await page.setViewportSize({width,height:900});
        const document=await page.goto(BASE+'/'+name,{waitUntil:'domcontentloaded'});
        const headers=document.headers();
        assert.equal(headers['x-frame-options'],'SAMEORIGIN');
        assert.equal(headers['strict-transport-security'],'max-age=31536000');
        assert.equal(headers['permissions-policy'],'camera=(), microphone=(), geolocation=(), payment=()');
        assert.ok(headers[MODE==='report-only'?'content-security-policy-report-only':'content-security-policy']);
        await page.evaluate(async()=>{
          await document.fonts.ready;
          document.querySelectorAll('img,iframe').forEach(el=>el.loading='eager');
          await Promise.all([...document.images].map(img=>img.decode().catch(()=>{})));
        });
        await page.waitForTimeout(LIVE?2500:300);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,name+' overflow');
        assert.deepEqual(violations,[],name+': CSP violations');
        if(oldPage) {
          await oldPage.setViewportSize({width,height:900});
          await oldPage.goto(BASE+'/'+name,{waitUntil:'domcontentloaded'});
          await oldPage.evaluate(async()=>{await document.fonts.ready;document.querySelectorAll('img,iframe').forEach(el=>el.loading='eager');await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));});
          await oldPage.waitForTimeout(300);
          const text=await page.locator('body').innerText();
          assert.equal(text,await oldPage.locator('body').innerText(),name+': visible wording');
          // Freeze slider at its initial frame for a deterministic visual comparison.
          for(const target of [page,oldPage])await target.evaluate(()=>document.querySelectorAll('.hero__slide').forEach((el,i)=>el.classList.toggle('is-active',i===0)));
          const before=PNG.sync.read(await oldPage.screenshot({fullPage:true,animations:'disabled'}));
          const buffer=await page.screenshot({path:path.join(OUTPUT,(name||'index')+'-'+width+'.png'),fullPage:true,animations:'disabled'});
          const after=PNG.sync.read(buffer);
          assert.equal(after.width,before.width);assert.equal(after.height,before.height,name+': height');
          let differences=0;for(let i=0;i<after.data.length;i++)if(after.data[i]!==before.data[i])differences++;
          assert.equal(differences,0,name+': visual byte differences');
        }
        if(['reserve','takeout','recruit'].includes(name)) {
          const trap=page.locator('[data-honeypot]');
          assert.equal(await trap.isVisible(),false);
          assert.equal(await trap.getAttribute('tabindex'),'-1');
          for(const [field,limit]of [['name',50],['tel',20],['email',254],['note',1000]])assert.equal(await page.locator('[name='+field+']').getAttribute('maxlength'),String(limit));
        }
        console.log(MODE,name||'index',width,'CSP=0'+(oldPage?', visual/text identical':''));
      }
    }
    for(const pathname of ['/wrangler.toml','/.env','/.env.example','/README.md','/TODO.md','/requirements.txt','/scripts/build_site.py','/tests/security.mjs','/docs/2026-11-08-seo-final.md','/templates/recruit.html.j2','/.git/config','/functions/_middleware.js']) {
      assert.equal((await page.goto(BASE+pathname)).status(),404,pathname);
    }
    // Exercise lazy/click-only integrations too, including the existing YouTube player.
    await page.goto(BASE+'/');
    await page.locator('[data-instagram-grid]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(LIVE?2500:100);
    assert.equal(await page.locator('iframe[src^="https://www.instagram.com/"]').count(),3);
    const video=page.locator('[data-youtube-id]');
    if(await video.count())await video.first().click();
    else {
      const link=page.locator('a[href="https://www.youtube.com/watch?v=NZCcz-p8HAk"]');
      await link.click();
    }
    await page.waitForTimeout(LIVE?4000:100);
    assert.ok(await page.locator('iframe[src^="https://www.youtube.com/embed/"]').count()>0);
    assert.deepEqual(violations,[],'Lazy embeds / video CSP');
    if(!LIVE) {
      let mockedSubmissions=0;
      await page.route(/\/api\/forms\/(reserve|takeout|recruit)$/,async route=>{
        mockedSubmissions++;
        const body=await new Response(route.request().postDataBuffer(),{headers:{'Content-Type':route.request().headers()['content-type']}}).formData();
        assert.equal(body.get('_website'),'trap-test');
        assert.equal(body.get('お名前'),"検証'のみ");
        assert.equal(body.get('cf-turnstile-response'),'mock-token');
        return route.fulfill({status:400,contentType:'application/json',body:'{"error":"mock rejection"}'});
      });
      for(const type of ['reserve','takeout','recruit']) {
        await page.goto(BASE+'/'+type);
        await page.locator('[name=name]').fill("検証'のみ");
        await page.locator('[name=tel]').fill('09000000000');
        await page.locator('[name=email]').fill('test@example.invalid');
        await page.locator('[data-honeypot]').evaluate(el=>el.value='trap-test');
        if(type==='recruit') {
          await page.locator('[name=employment_type]').selectOption({index:1});
          await page.locator('[name=available_days]').selectOption({index:1});
          await page.locator('[name=age]').fill('25');
        } else {
          await page.locator('input[type=date]').fill('2026-12-01');
          await page.locator('[data-time-hour]').selectOption('18');
          await page.locator('[data-time-minute]').selectOption('00');
          if(type==='reserve')await page.locator('[name=party]').fill('2');
          else {
            await page.locator('[data-order-select]').selectOption({index:1});
            await page.locator('[data-order-qty]').selectOption('1');
          }
        }
        await page.locator('[name=privacy]').check();
        await page.locator('[type=submit]').click();
        assert.ok(!(await page.locator('.form-summary__list').innerText()).includes('trap-test'));
        await page.locator('[data-confirm-send]').click();
        await page.locator('[data-confirm-error]:not([hidden])').waitFor();
      }
      assert.equal(mockedSubmissions,3);
      console.log('All 3 form UIs: invisible trap omitted from confirmation but included in locally intercepted payload; single quote remains plain text.');
    }
    if(LIVE)for(const host of ['fonts.googleapis.com','fonts.gstatic.com','images.microcms-assets.io','challenges.cloudflare.com','www.google.com','www.instagram.com','www.youtube.com'])assert.ok(successfulHosts.has(host),'No successful live resource from '+host);
    assert.equal(sentToProduction,0);
    const legitimateViolations=[...violations];
    await page.evaluate(()=>{
      const script=document.createElement('script');
      script.textContent='window.__cspCanary=true';
      document.head.appendChild(script);
    });
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(()=>window.__cspCanary===true),MODE==='report-only');
    assert.ok(violations.some(event=>event.directive==='script-src-elem'&&event.blocked==='inline'&&event.disposition===(MODE==='report-only'?'report':'enforce')),'CSP listener / blocking canary');
    fs.writeFileSync(path.join(OUTPUT,MODE+(LIVE?'-live':'')+'.json'),JSON.stringify({mode:MODE,live:LIVE,pages:PAGES.length,violations:legitimateViolations,canaryBlocked:MODE==='enforce',externalResponses:Object.fromEntries(requests),productionSubmissions:sentToProduction},null,2));
    console.log('CSP '+MODE+' complete; config/source URLs 404; production submissions=0. External responses:',Object.fromEntries(requests));
    await secured.close();if(baseline)await baseline.close();
  } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
