const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('cheerio');
const { chromium } = require('playwright');
const { SERVICES } = require('../lib/service-content');
const { serviceCases } = require('../lib/service-case-links');
const fixture = require('./fixtures/seo-phase2a-public.json');
const remote = process.env.PHASE2A_BASE;
const output = path.resolve('test-results/seo-phase2a', remote ? 'remote' : 'isolated');
const report = { mode: remote ? 'remote Preview, existing data only' : 'isolated Worker/R2, 14 read-only public case copies with representative QA image bytes', checks: [], errors: [], consoleErrors: [], expectedSecurityConsole: [], http5xx: [], failedRequests: [], imageFailures: [], links: [], productionWrites:0 };
async function main() {
  fs.mkdirSync(output, { recursive: true });
  let harness, browser, bucket;
  try {
    let base = remote;
    if (!remote) {
      const config = fs.readFileSync('wrangler.production.toml', 'utf8');
      const wrangler = require(process.env.WRANGLER_API_PATH || 'wrangler');
      harness = wrangler.createTestHarness({ root: process.cwd(), workers: [{ config: {
        name:'seo-phase2a-isolated',main:'_worker.js',compatibility_date:'2026-09-03',compatibility_flags:['nodejs_compat'],
        assets:{ directory:'./cloudflare-public',binding:'ASSETS',html_handling:'none',run_worker_first:JSON.parse(config.match(/run_worker_first\s*=\s*(\[[^\n]+\])/)[1]) },
        r2_buckets:[{binding:'MEDIA_BUCKET',bucket_name:'seo-phase2a-isolated'}],
        vars:{ STORAGE_BACKEND:'r2',R2_BUCKET_NAME:'seo-phase2a-isolated',SITE_URL:'http://localhost' }
      }}] });
      const { url } = await harness.listen(); base = url.origin;
      bucket = (await harness.getWorker().getEnv()).MEDIA_BUCKET;
      const image = fs.readFileSync('cloudflare-public/assets/real/anterior-crown-model-12.jpg');
      await bucket.put('qa/representative.jpg', image);
      for (const source of fixture.cases) await bucket.put('case-library/records/'+source.id+'.json', JSON.stringify({ ...source,
        images:source.images.map(i=>({...i,pathname:'qa/representative.jpg',mediaType:'image',contentType:'image/jpeg'}))
      }));
    }
    assert(base && (!remote || new URL(base).hostname === 'yzh-dental-lab-preview.yzh-dental-lab-site.workers.dev'), 'Remote test may only target Preview');
    report.base = base;
    browser = await chromium.launch({channel:'chrome',headless:true});
    const page = await browser.newPage();
    let privacyProbe = false;
    page.on('pageerror',e=>report.errors.push({url:page.url(),message:e.message}));
    page.on('console',message=>{if(message.type()==='error'){const value={url:message.location().url,message:message.text()};if(privacyProbe&&/401/.test(value.message))report.expectedSecurityConsole.push(value);else report.consoleErrors.push(value);}});
    page.on('response',r=>{if(r.status()>=500)report.http5xx.push({url:r.url(),status:r.status(),ray:r.headers()['cf-ray']});});
    page.on('requestfailed',r=>{if(r.failure()?.errorText!=='net::ERR_ABORTED')report.failedRequests.push({url:r.url(),error:r.failure()?.errorText});});
    await page.goto(base+'/services/full-arch',{waitUntil:'domcontentloaded',timeout:60000});
    const read = route => page.evaluate(async route=>{const r=await fetch(route,{credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(60000)});return {status:r.status,text:await r.text(),type:r.headers.get('content-type')};},route);
    const records = JSON.parse((await read('/api/cases')).text).cases;
    report.publicCases = records.map(c=>({id:c.id,slug:c.slug}));
    assert.equal(records.length,remote?3:14,'Unexpected public fixture count: review actual data, do not silently skip');
    for(const route of ['/robots.txt','/sitemap.xml']){const r=await read(route);assert.equal(r.status,200);if(route==='/robots.txt')assert(r.text.includes('Disallow: /api/'));else for(const record of records)assert(r.text.includes('/cases/'+record.slug));}
    for(const record of records){const r=await read('/cases/'+record.slug);assert.equal(r.status,200);const $=load(r.text);assert.equal($('h1').text(),record.title);assert.equal($('link[rel=canonical]').attr('href'),'https://yzhdentallab.com/cases/'+record.slug);for(const a of $('.case-journey-nav a').toArray())assert.equal($($(a).attr('href')).length,1);}
    const layoutCases = [];
    for(const [key,definition] of Object.entries(SERVICES)) {
      const html = await read(definition.path); assert.equal(html.status,200);
      const $ = load(html.text);
      const expected = serviceCases(key,records).slice(0,3);
      const cards=$('[data-service-cases] .case-portfolio-card > a').toArray().map(el=>$(el).attr('href'));
      assert.deepEqual(cards,expected.map(c=>'/cases/'+c.slug));
      for(const [route] of definition.links)assert($(`main a[href="${route}"]`).length);
      const schemas=$('script[type="application/ld+json"]').toArray().map(el=>JSON.parse($(el).text()));
      assert.equal(schemas.filter(s=>s['@type']==='Service').length,1);
      assert.equal(schemas.filter(s=>s['@type']==='BreadcrumbList').length,1);
      assert.equal($('link[rel=canonical]').attr('href'),'https://yzhdentallab.com'+definition.path);
      assert($('title').text()&&$('meta[name=description]').attr('content'));
      for(const width of [390,430,768,1440]) {
        await page.setViewportSize({width,height:900});
        const response=await page.goto(base+definition.path+'?phase2a='+Date.now(),{waitUntil:'domcontentloaded',timeout:60000});assert.equal(response.status(),200);
        const images=page.locator('main img');
        for(let i=0;i<await images.count();i++){
          await images.nth(i).scrollIntoViewIfNeeded();
          const state=await images.nth(i).evaluate(async img=>{if(!img.complete)await new Promise(resolve=>{const done=()=>{clearTimeout(t);img.removeEventListener('load',done);img.removeEventListener('error',done);resolve()};const t=setTimeout(done,30000);img.addEventListener('load',done);img.addEventListener('error',done)});return {src:img.currentSrc,complete:img.complete,width:img.naturalWidth,height:img.naturalHeight};});
          if(!state.complete||!state.width||!state.height)report.imageFailures.push(state);
        }
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,key+' overflow '+width);
        if(key==='implant')assert.equal(await page.locator('.implant-reference-card').count(),4);
        await page.locator('.page-hero .btn-primary').click();await page.waitForURL('**/submit-case');
        await page.goBack();await page.waitForURL('**'+definition.path+'?*');
        const related=page.locator('[data-service-cases] .case-portfolio-card > a');
        for(let i=0;i<await related.count();i++){
          const href=await related.nth(i).getAttribute('href');await related.nth(i).click();await page.waitForURL('**'+href);
          assert(await page.locator('h1').innerText());await page.goBack();await page.waitForURL('**'+definition.path+'?*');
          report.links.push({page:key,width,href,result:'PASS'});
        }
        await page.evaluate(()=>scrollTo(0,0));
        await page.screenshot({path:path.join(output,key+'-'+width+'.png'),fullPage:true});
        layoutCases.push({page:key,width,result:'PASS',relatedCases:cards.length});
        console.log('Browser '+key+' '+width+': PASS');
      }
      report.checks.push({page:key,status:html.status,relatedCaseUrls:cards,schemas:schemas.map(s=>s['@type'])});
    }
    report.layouts=layoutCases;
    assert.deepEqual(report.consoleErrors,[]);
    privacyProbe = true;
    for(const route of ['/api/admin-cases','/api/admin?module=submissions','/api/admin?module=submission-file&id=QA'])assert.equal((await read(route)).status,401);
    assert.deepEqual(report.errors,[]);assert.deepEqual(report.consoleErrors,[]);assert.deepEqual(report.http5xx,[]);assert.deepEqual(report.imageFailures,[]);assert.deepEqual(report.failedRequests,[]);
    report.result='PASS';
  } catch(e){report.result='FAIL';report.error=e.stack;throw e;}
  finally{
    if(bucket){for(const o of (await bucket.list()).objects)await bucket.delete(o.key);assert.equal((await bucket.list()).objects.length,0);report.cleanup='local isolated R2 empty';}
    fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
    await browser?.close();await harness?.close();
  }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
