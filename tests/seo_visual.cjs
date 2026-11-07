/* Compare all four requested pages without calling third-party services. */
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const {PNG} = require('pngjs');
const root = process.env.MASA_REVIEW_ROOT || path.resolve(__dirname, '..');
const out = '/private/tmp/masa-seo-visual';
const phase = process.argv[2] || 'after';

async function run() {
  fs.mkdirSync(out, {recursive:true});
  const server = http.createServer((req,res)=>{
    let p = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if (p === '/') p = '/index.html';
    if (!path.extname(p)) p += '.html';
    const file = path.join(root,p);
    if (!file.startsWith(root+'/') || !fs.existsSync(file)) {res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type', {'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'}[path.extname(file)] || 'application/octet-stream');
    res.end(fs.readFileSync(file));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--disable-gpu']});
  try {
    for(const width of [375,1440])for(const name of ['index','menu','course','reserve']) {
      const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',timezoneId:'Asia/Tokyo'});
      await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
      const page=await context.newPage();
      await page.goto('http://127.0.0.1:'+server.address().port+'/'+name+'.html');
      await page.evaluate(async()=>{
        await document.fonts.ready;
        for(const image of document.images)image.loading='eager';
        await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));
      });
      await page.waitForTimeout(1800);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      for(const full of [false,true]) {
        const suffix=`${name}-${width}-${full?'full':'viewport'}.png`;
        const file=path.join(out,phase+'-'+suffix);
        await page.screenshot({path:file,fullPage:full,animations:'disabled'});
        if(phase==='after') {
          const a=PNG.sync.read(fs.readFileSync(path.join(out,'before-'+suffix))),b=PNG.sync.read(fs.readFileSync(file));
          assert.equal(a.width,b.width);assert.equal(a.height,b.height);
          let count=0;for(let i=0;i<a.data.length;i+=4)if(!a.data.subarray(i,i+4).equals(b.data.subarray(i,i+4)))count++;
          console.log(suffix+': '+count+' different pixels');
          assert.equal(count,0);
        }
      }
      await context.close();
    }
  } finally {await browser.close();await new Promise(r=>server.close(r));}
}
run().catch(e=>{console.error(e);process.exitCode=1});
