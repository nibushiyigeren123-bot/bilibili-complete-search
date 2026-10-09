const {chromium}=require('playwright-core');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const id=n=>`BV${String(n).padStart(10,'0')}`;
const card=(n,title)=>`<div class="video-list-item"><div class="bili-video-card"><a href="https://www.bilibili.com/video/${id(n)}/"><h3 class="bili-video-card__info--tit" title="${title}">${title}</h3></a></div></div>`;
const fixture=(cards)=>`<!doctype html><html><head><style>body{font:16px system-ui;margin:30px}.video-list{display:flex;flex-wrap:wrap;gap:20px}.video-list-item{width:190px;min-height:160px;background:#eef5f8}.video-list-item:nth-child(n+7){display:none}h3{margin:10px;font-size:15px}</style></head><body><h1>跨页补充：安装扩展验证</h1><div class="video-list row">${cards}</div></body></html>`;
(async()=>{
 const extension=process.env.BCS_EXTENSION_DIR || path.join(root,'extension');
 const context=await chromium.launchPersistentContext(path.join(root,'verification',`pagination-profile-${Date.now()}`),{
  executablePath:process.env.BCS_BROWSER || 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe',
  headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`],viewport:{width:1400,height:1000}});
 const report={browser:context.browser()?.version(),fixture:{},live:{}};
 let scenario='gaps';const searchPages=[];
 try {
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  report.worker=worker.url();
  await context.route('https://search.bilibili.com/video?*bcs_fixture*',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:fixture(scenario==='gaps'?[1,2,3,4,5,6].map(n=>card(n,n===5?'payday保留':'无关')).join(''):card(1,'无关')+card(2,'无关'))}));
  await context.route('https://api.bilibili.com/x/tag/archive/tags?*',route=>{
   if(scenario==='live')return route.continue();
   return route.fulfill({contentType:'application/json',body:JSON.stringify({code:0,data:[]})});
  });
  await context.route('https://api.bilibili.com/x/web-interface/search/type?*',route=>{
   if(scenario==='live')return route.continue();
   const page=Number(new URL(route.request().url()).searchParams.get('page'));searchPages.push(page);
   const entries=scenario==='empty'?(page===2?[{type:'video',bvid:id(7),title:'无关'}]:[8,9].map(n=>({type:'video',bvid:id(n),title:'payday'}))):[page*10+1,page*10+2,page*10+3].map(n=>({type:'video',bvid:id(n),title:'<em>payday</em> 新结果',author:'示例UP',duration:'1:20'}));
   return route.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'https://search.bilibili.com','Access-Control-Allow-Credentials':'true'},body:JSON.stringify({code:0,data:{page,numPages:3,result:entries}})});
  });
  const page=await context.newPage();
  await page.goto('https://search.bilibili.com/video?keyword=payday&bcs_fixture=1');
  await page.waitForFunction(()=>document.querySelectorAll('.bili-video-card[data-bcs-state="keep"]').length===7);
  await page.waitForFunction(()=>document.querySelector('#bcs-panel').shadowRoot.getElementById('stop').hidden);
  assert.deepEqual(searchPages,[2,3]);
  const layout=await page.locator('.video-list-item').evaluateAll(items=>items.filter(item=>getComputedStyle(item).display!=='none').map(item=>{const r=item.getBoundingClientRect();return {state:item.dataset.bcsState,x:r.x,y:r.y,width:r.width,title:item.textContent};}));
  assert.equal(layout[0].x,30,'first kept video occupies the very first slot');
  assert(Math.abs(layout[1].x-(layout[0].x+layout[0].width+16))<1,'next kept video occupies the adjacent grid slot');
  assert.equal(layout.length,7,'retained videos override original nth-child hiding');
  assert(layout.every(item=>item.state==='keep'));
  report.fixture.layout=layout;report.fixture.searchPages=[...searchPages];
  await page.screenshot({path:path.join(root,'verification','pagination-gaps.png')});
  await page.locator('#bcs-panel').getByRole('button',{name:'关闭过滤'}).click();
  assert.equal(await page.locator('.bcs-imported').count(),0);
  assert.equal(await page.locator('.video-list-item:visible').count(),6);
  report.fixture.restorePassed=true;
  // Navigate while disabled so the previous fixture cannot start another batch.
  scenario='empty';searchPages.length=0;
  await page.goto('https://search.bilibili.com/video?keyword=payday&bcs_fixture=2');
  await worker.evaluate(()=>chrome.storage.local.set({enabled:true}));
  await page.waitForFunction(()=>document.querySelectorAll('.bili-video-card[data-bcs-state="keep"]').length===2);
  assert.deepEqual(searchPages,[2,3]);report.fixture.emptyPagePassed=true;
  await page.screenshot({path:path.join(root,'verification','pagination-empty-page.png')});
  scenario='live';
  await page.goto('https://search.bilibili.com/video?keyword=payday',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForSelector('.bili-video-card__info--tit',{state:'attached',timeout:25000});
  await page.waitForFunction(()=>{
   const host=document.querySelector('#bcs-panel');if(!host)return false;
   const shadow=host.shadowRoot;
   return shadow.getElementById('stop').hidden&&(document.querySelector('.bcs-imported')||shadow.getElementById('note').textContent.includes('失败')||shadow.getElementById('note').textContent.includes('限制')||shadow.getElementById('note').textContent.includes('待核验'));
  },{timeout:90000});
  report.live=await page.evaluate(()=>{
   const list=[...document.querySelectorAll('.bili-video-card')];const shadow=document.querySelector('#bcs-panel').shadowRoot;
   return {url:location.href,native:list.filter(el=>!el.closest('.bcs-imported')).length,
    added:list.filter(el=>el.closest('.bcs-imported')).length,kept:list.filter(el=>el.dataset.bcsState==='keep').length,
    states:list.map(el=>el.dataset.bcsState),visibleAdded:[...document.querySelectorAll('.bcs-imported[data-bcs-state="keep"]')].filter(el=>getComputedStyle(el).display!=='none').length,
    hiddenAdded:[...document.querySelectorAll('.bcs-imported[data-bcs-state="keep"]')].filter(el=>getComputedStyle(el).display==='none').length,
    status:shadow.getElementById('status').textContent,note:shadow.getElementById('note').textContent,
    firstVisible:[...document.querySelectorAll('.video-list-item')].filter(el=>getComputedStyle(el).display!=='none').slice(0,5).map(el=>({title:el.textContent.trim(),x:el.getBoundingClientRect().x,y:el.getBoundingClientRect().y}))};
  });
  assert(report.live.added>0,'real B站 pages must be successfully appended');
  assert(report.live.visibleAdded>0,'appended keep cards must actually be displayed');
  assert.equal(report.live.hiddenAdded,0,'B站 nth-child rules must not hide retained appended videos');
  assert(report.live.kept>=report.live.native,'real query must fill at least one original page');
  await page.mouse.move(10,500);
  await page.screenshot({path:path.join(root,'verification','pagination-live.png')});
  await page.locator('.bcs-imported[data-bcs-state="keep"]').first().scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(root,'verification','pagination-live-added.png')});
  await page.setViewportSize({width:900,height:900});
  const responsive=await page.locator('.video-list-item[data-bcs-state="keep"]').evaluateAll(items=>items.every(el=>getComputedStyle(el).display!=='none'));
  assert(responsive,'resizing must not re-hide any retained video');
  report.live.resizePassed=true;
  await page.locator('#bcs-panel').getByRole('button',{name:'关闭过滤'}).click();
  assert.equal(await page.locator('.bcs-imported').count(),0);
  await page.waitForFunction(()=>!document.documentElement.classList.contains('bcs-active'));
  report.live.restored=await page.locator('.video-list-item').evaluateAll(items=>({total:items.length,notDisplayNone:items.filter(el=>getComputedStyle(el).display!=='none').length}));
  assert.equal(report.live.restored.total,report.live.native);
  // B站 has its own responsive nth-child page limits. Compare to its original
  // CSS with our stylesheet completely disabled, rather than assuming 42 visible.
  const original=await page.locator('.video-list-item').evaluateAll(items=>{
    const sheets=[...document.styleSheets].filter(s=>s.href?.startsWith('chrome-extension://'));
    sheets.forEach(s=>s.disabled=true);
    const count=items.filter(el=>getComputedStyle(el).display!=='none').length;
    sheets.forEach(s=>s.disabled=false);return count;
  });
  assert.equal(report.live.restored.notDisplayNone,original);
  report.live.restorePassed=true;
  report.passed=true;
 }catch(error){report.error=error.stack;process.exitCode=1;}
 finally{fs.writeFileSync(path.join(root,'verification','pagination-browser-report.json'),JSON.stringify(report,null,2),'utf8');console.log(JSON.stringify(report,null,2));await context.close();}
})();
