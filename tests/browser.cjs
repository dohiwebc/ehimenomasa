/* Run with Playwright installed; never sends a request to production. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.MASA_TEST_OUTPUT || '/private/tmp/masa-production-review';

async function run() {
  fs.mkdirSync(OUT, {recursive:true});
  const server = http.createServer((req,res)=>{
    let pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if (pathname === '/') pathname='/index.html';
    if (!path.extname(pathname)) pathname += '.html';
    const file = path.join(ROOT, pathname);
    if (!file.startsWith(ROOT+'/') || !fs.existsSync(file)) {res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type', {'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png'}[path.extname(file)] || 'application/octet-stream');
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base = 'http://127.0.0.1:'+server.address().port;
  let browser;
  let sends = 0;
  try {
    browser = await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
    const context = await browser.newContext({viewport:{width:375,height:900},timezoneId:'Asia/Tokyo',reducedMotion:'reduce'});
    await context.route('**/*',route=>new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    await context.addInitScript(()=>{
      window.turnstile={render:(_mount,opts)=>{opts.callback('test-token');return 'test-widget';},getResponse:()=> 'test-token',reset:()=>{}};
    });
    for (const type of ['reserve','takeout']) {
      const page = await context.newPage();
      let fail = true;
      await page.route('**/api/forms/**',route=>{
        sends++;
        assert.equal(route.request().method(),'POST');
        if (type === 'reserve') {
          assert.match(route.request().postDataBuffer().toString(), /name="希望コース"\r\n\r\n満喫コース\r\n/);
        }
        return route.fulfill({status:fail?502:200,contentType:'application/json',body:JSON.stringify(fail?{error:'テスト用の送信失敗'}:{ok:true})});
      });
      await page.clock.setFixedTime(new Date('2026-11-08T03:00:00+09:00'));
      await page.goto(base+'/'+type);
      if (type === 'reserve') {
        assert.equal(await page.getByRole('link', {name:'WEB予約',exact:true}).getAttribute('href'), '#reserve-form');
        await page.getByRole('link', {name:'ホームページ予約はこちら'}).click();
        assert.equal(new URL(page.url()).hash, '#reserve-form');
        assert.ok(await page.locator('#reserve-form').evaluate(el => {
          const top = el.getBoundingClientRect().top;
          return top >= parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) && top < innerHeight;
        }));
      }
      const date = page.locator('input[type=date]');
      assert.ok(await date.evaluate(el => {
        const field = el.getBoundingClientRect();
        const group = el.closest('.form-group').getBoundingClientRect();
        return field.width > 0 && field.left >= group.left && field.right <= group.right + 0.5;
      }), `${type}: date input stays inside its column`);
      assert.equal(await date.inputValue(),'');
      assert.equal(await date.getAttribute('min'),'2026-11-08');
      await page.locator('[type=submit]').click();
      assert.equal(await page.evaluate(()=>document.activeElement.id),type==='reserve'?'rs-name':'to-name');
      assert.ok(await page.locator('.field-error').count() >= 3);
      assert.equal(await date.inputValue(),'');
      for (const value of ['2026-11-15','2026-11-23','2027-03-22','2028-01-10']) {
        await date.fill(value);
        assert.match(await page.locator('.date-field__warning').innerText(),/日曜日・祝日は定休日/);
        assert.equal(await page.locator('.date-field__warning').getAttribute('aria-live'),'polite');
        assert.equal(await date.inputValue(),value);
      }
      await date.fill('2026-11-07');
      assert.equal(await date.evaluate(el=>el.validity.rangeUnderflow),true);
      await date.fill('2026-11-13');
      assert.equal(await page.locator('.date-field__warning').innerText(),'');
      await page.locator('[name=name]').fill('検証用氏名');
      await page.locator('[name=tel]').fill('09000000000');
      await page.locator('[name=email]').fill('invalid-email');
      if (type === 'reserve') {
        await page.locator('[name=party]').fill('0');
        await page.locator('[type=submit]').click();
        assert.match(await page.locator('#rs-party-error').innerText(),/1以上/);
        await page.locator('[name=party]').fill('2');
        assert.equal(await page.locator('[name=party]').getAttribute('max'),null);
        const choices=await page.locator('[name=course] option').evaluateAll(options=>options.map(option=>[option.value,option.textContent.trim()]));
        const coursePage=await context.newPage();
        await coursePage.goto(base+'/course');
        const courses=await coursePage.locator('.course-detail__head').evaluateAll(heads=>heads.map(head=>{
          const name=head.querySelector('.course-detail__name').textContent.trim();
          return [name,`${name} ${head.querySelector('.price').textContent.trim()}（税込）`];
        }));
        const drinkPrice=(await coursePage.locator('.nomihoudai-panel__price-main').textContent()).trim();
        assert.deepEqual(choices,[['席のみ予約','席のみ予約'],...courses,['単品飲み放題',`単品飲み放題 ${drinkPrice}（税込）`]]);
        await page.locator('[name=course]').selectOption('満喫コース');
        await coursePage.close();
      } else {
        assert.equal(await page.locator('.takeout-prices').count(),0);
        for(const label of await page.locator('[data-order-select] option').allTextContents())assert.ok(!label.includes('円'));
        await page.locator('[data-order-select]').selectOption({index:1});
        await page.locator('[data-order-qty]').selectOption('1');
        assert.equal(await page.locator('[data-time-pair]').getAttribute('data-time-start'),'17:30');
        assert.equal(await page.locator('[data-time-pair]').getAttribute('data-time-end'),'21:30');
      }
      await page.locator('[data-time-hour]').selectOption('17');
      await page.locator('[data-time-minute]').selectOption(type==='reserve'?'45':'30');
      if(type==='takeout') {
        assert.ok(!(await page.locator('[data-time-minute] option').allTextContents()).includes('15'));
        await page.locator('[data-time-hour]').selectOption('21');
        assert.ok(!(await page.locator('[data-time-minute] option').allTextContents()).includes('45'));
        await page.locator('[data-time-minute]').selectOption('30');
      }
      await page.locator('[name=privacy]').check();
      await page.locator('[type=submit]').click();
      assert.match(await page.locator('[id$=email-error]').innerText(),/メールアドレスの形式/);
      assert.equal(await page.evaluate(()=>document.activeElement.name),'email');
      await page.locator('[name=email]').fill('site-test@example.invalid');
      const number = await page.locator('.phone-number').evaluate(el=>{
        const range=document.createRange();range.selectNodeContents(el);
        return {lines:range.getClientRects().length,whiteSpace:getComputedStyle(el).whiteSpace};
      });
      assert.equal(number.lines,1);
      assert.equal(number.whiteSpace,'nowrap');
      assert.equal(await page.locator('.form-check a').evaluate(el=>getComputedStyle(el).whiteSpace),'nowrap');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth),false);
      await page.locator('[type=submit]').click();
      await page.locator('[data-confirm-send]').click();
      await page.locator('[data-confirm-error]:not([hidden])').waitFor();
      assert.match(await page.locator('[data-confirm-error]').innerText(),/送信に失敗/);
      await page.screenshot({path:path.join(OUT,type+'-375.png'),fullPage:true});
      fail=false;
      await page.locator('[data-confirm-send]').click();
      await page.waitForURL('**/thanks');
      assert.match(await page.locator('.thanks-summary').innerText(),/検証用氏名/);
      console.log(type+': dates, holiday warning, inline errors, focus, phone wrapping, mocked failure/success passed');
      await page.close();
    }
    for (const mode of ['no-js','no-observer','stalled-observer','reduced-motion']) {
      const ctx = await browser.newContext({viewport:{width:375,height:900},javaScriptEnabled:mode!=='no-js',reducedMotion:mode==='reduced-motion'?'reduce':'no-preference'});
      await ctx.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
      if(mode==='no-observer')await ctx.addInitScript(()=>{delete window.IntersectionObserver;});
      if(mode==='stalled-observer')await ctx.addInitScript(()=>{window.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}};});
      const p=await ctx.newPage();await p.goto(base+'/reserve');
      assert.equal(await p.locator('.takeout-layout__form').evaluate(el=>getComputedStyle(el).opacity),'1');
      assert.ok(await p.locator('a[href="https://www.hotpepper.jp/strJ004612520/"]').count()>0);
      await ctx.close();
    }
    console.log('No-JS / absent or stalled IntersectionObserver / reduced motion: content visible');
    const page=await context.newPage();
    for(const name of ['index','menu','course','shop','reserve','takeout','about','recruit','privacy']) {
      for(const width of [375,768,1440]) {
        await page.setViewportSize({width,height:900});
        await page.goto(base+(name==='index'?'/':'/'+name));
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,name+' overflow at '+width);
      }
    }
    await page.goto(base+'/recruit');
    await page.locator('[data-recruit-tab=parttime]').click();
    const parttime=page.locator('#recruit-panel-parttime');
    assert.equal(await parttime.isVisible(),true);
    assert.match(await parttime.innerText(),/時給1,100円〜1,250円/);
    assert.match(await parttime.innerText(),/18:00〜23:00/);
    await page.setViewportSize({width:375,height:900});
    await page.screenshot({path:path.join(OUT,'recruit-375.png'),fullPage:true});
    console.log('9 pages x 3 widths: no horizontal overflow; recruitment tab content intact.');
    assert.equal(sends,4);
    await context.close();
    console.log('Browser checks passed. All four submissions intercepted locally; external requests blocked.');
  } finally {if(browser)await browser.close();await new Promise(r=>server.close(r));}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
