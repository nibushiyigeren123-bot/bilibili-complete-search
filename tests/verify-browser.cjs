const {chromium} = require('playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const root = path.resolve(__dirname, '..');
  const extension = path.join(root, 'extension');
  const profile = path.join(root, 'verification', `edge-profile-${Date.now()}`);
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    viewport: {width: 1280, height: 900}
  });
  const report = {browser: context.browser()?.version(), fixture: {}, live: {}};
  const errors = [];
  context.on('weberror', error => errors.push(error.error().message));
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', {timeout:15000});
    report.workerUrl = worker.url();
    // A deterministic B站-origin fixture loads the installed extension's actual isolated content script.
    await context.route('https://search.bilibili.com/video?keyword=fixture*', route => route.fulfill({
      contentType:'text/html; charset=utf-8',
      body:`<!doctype html><html><head><style>body{font:18px system-ui;background:#f1f6fa;padding:35px}.video-list-item{width:500px;background:white;margin:15px;padding:20px}.video-list-item h3{margin:0}a{color:#167f9d;text-decoration:none}</style></head><body><h1>B站搜索 · 扩展安装验证</h1><div class="video-list-item"><div class="bili-video-card"><a href="https://www.bilibili.com/video/BV1111111111/"><h3 class="bili-video-card__info--tit" title="fixture 完整命中">fixture 完整命中</h3></a></div></div><div class="video-list-item"><div class="bili-video-card"><a href="https://www.bilibili.com/video/BV2222222222/"><h3 class="bili-video-card__info--tit" title="无关结果">无关结果</h3></a></div></div></body></html>`
    }));
    await context.route('https://api.bilibili.com/x/tag/archive/tags?bvid=BV2222222222', route => route.fulfill({contentType:'application/json',body:JSON.stringify({code:0,data:[{tag_name:'无关标签'}]})}));
    const page = await context.newPage();
    await page.goto('https://search.bilibili.com/video?keyword=fixture', {waitUntil:'domcontentloaded'});
    await page.waitForFunction(() => document.querySelector('[data-bcs-state="hide"]'),{timeout:15000});
    report.fixture.states = await page.locator('.video-list-item').evaluateAll(items => items.map(item => ({state:item.dataset.bcsState,display:getComputedStyle(item).display})));
    assert.deepEqual(report.fixture.states.map(item => item.state), ['keep','hide']);
    assert.equal(report.fixture.states[1].display,'none');
    await page.locator('#bcs-panel').getByRole('button',{name:'关闭过滤'}).click();
    assert.notEqual(await page.locator('.video-list-item').nth(1).evaluate(item => getComputedStyle(item).display),'none');
    await page.locator('#bcs-panel').getByRole('button',{name:'开启过滤'}).click();
    await page.screenshot({path:path.join(root,'verification','installed-extension-fixture.png')});
    report.fixture.passed = true;
    await context.unroute('https://api.bilibili.com/x/tag/archive/tags?bvid=BV2222222222');
    try {
      await page.goto('https://search.bilibili.com/video?keyword=payday',{waitUntil:'domcontentloaded',timeout:30000});
      await page.waitForSelector('.bili-video-card__info--tit',{state:'attached',timeout:20000});
      await page.waitForFunction(() => {
        const cards=[...document.querySelectorAll('.bili-video-card')];
        return cards.length > 0 && cards.every(card => ['keep','hide','error'].includes(card.dataset.bcsState));
      },{timeout:40000});
      report.live.url=page.url();
      report.live.cards=await page.locator('.bili-video-card').count();
      report.live.states=await page.locator('.bili-video-card').evaluateAll(items => items.map(item => item.dataset.bcsState));
      report.live.panel=await page.locator('#bcs-panel #status').innerText();
      const href=await page.locator('.bili-video-card a[href*="/video/BV"]').first().getAttribute('href');
      const id=href.match(/BV[a-zA-Z0-9]{10}/)[0];
      report.live.tags=await worker.evaluate(id => getTags(id),id);
      report.live.sampleId=id;
      await page.screenshot({path:path.join(root,'verification','live-search.png')});
      await fs.promises.writeFile(path.join(root,'verification','live-dom.html'),await page.content(),'utf8');
    } catch(error) { report.live.error=error.message; }
    report.errors=errors;
    await fs.promises.writeFile(path.join(root,'verification','browser-report.json'),JSON.stringify(report,null,2),'utf8');
    console.log(JSON.stringify(report,null,2));
  } finally { await context.close(); }
})().catch(error => {console.error(error); process.exitCode=1;});
