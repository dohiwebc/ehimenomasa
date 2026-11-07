/* Stable, offline screenshot comparison against a separate original checkout. */
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { PNG } = require('pngjs');
const ROOT = process.env.MASA_REVIEW_ROOT || path.resolve(__dirname,'..');
const OUT = process.env.MASA_TEST_OUTPUT || '/private/tmp/masa-production-review';
const phase = process.argv[2] || 'after';
async function run() {
  fs.mkdirSync(OUT,{recursive:true});
  const server=http.createServer((req,res)=>{
    let p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(p==='/')p='/index.html';
    if(!path.extname(p))p+='.html';
    const file=path.join(ROOT,p);
    if(!file.startsWith(ROOT+'/')||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');
    res.end(fs.readFileSync(file));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  let browser;
  try {
    browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--disable-gpu']});
    for(const width of [375,768,1440]) {
      const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',timezoneId:'Asia/Tokyo'});
      await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
      const page=await context.newPage();await page.goto('http://127.0.0.1:'+server.address().port+'/');
      await page.evaluate(async()=>{
        await document.fonts.ready;
        await Promise.all([...document.querySelectorAll('.hero img,.site-header img')].map(i=>{i.loading='eager';return i.decode().catch(()=>{});}));
      });
      await page.waitForTimeout(1800);
      const hero=await page.locator('.hero').boundingBox();
      await page.screenshot({path:path.join(OUT,`${phase}-${width}.png`),animations:'disabled'});
      await page.screenshot({path:path.join(OUT,`${phase}-fv-${width}.png`),clip:{x:0,y:0,width,height:Math.ceil(hero.height)},animations:'disabled'});
      await context.close();
    }
  } finally {if(browser)await browser.close();await new Promise(r=>server.close(r));}
  if(phase==='after') {
    for(const width of [375,768,1440])for(const prefix of ['', 'fv-']) {
      const before=PNG.sync.read(fs.readFileSync(path.join(OUT,`before-${prefix}${width}.png`)));
      const after=PNG.sync.read(fs.readFileSync(path.join(OUT,`after-${prefix}${width}.png`)));
      assert.equal(before.width,after.width);assert.equal(before.height,after.height);
      let differences=0;
      for(let i=0;i<before.data.length;i+=4)if(!before.data.subarray(i,i+4).equals(after.data.subarray(i,i+4)))differences++;
      console.log(`${prefix||'viewport-'}${width}: ${differences} different pixels`);
      assert.equal(differences,0);
    }
  }
}
run().catch(error=>{console.error(error);process.exitCode=1});
