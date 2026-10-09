const {chromium}=require('playwright-core');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const id=n=>`BV${String(n).padStart(10,'0')}`;
const card=(n,title)=>`<div class="col_3 mb_x40"><div class="bili-video-card"><a href="https://www.bilibili.com/video/${id(n)}/"><h3 class="bili-video-card__info--tit" title="${title}">${title}</h3></a></div></div>`;
const html=`<!doctype html><html><head><style>body{margin:30px;font:16px system-ui}.video-list{display:grid;grid-template-columns:repeat(4,190px);gap:20px}.col_3{width:190px;min-height:180px;background:#eef5f8}.col_3:nth-child(2){grid-column:3;grid-row:2}#bcs-panel{pointer-events:none;position:static}h3{margin:10px;font-size:15px}</style></head><body><h1>综合页视频外层与重新核验回归测试（模拟数据）</h1><section id="other">用户和直播模块</section><div class="video-list row">${card(1,'无关')}${card(2,'事变日mod 完整命中')}${card(3,'事变日 攻略')}<div id="blank-slot"></div></div></body></html>`;
async function run(extension,legacy=false){
 const context=await chromium.launchPersistentContext(path.join(root,'verification',`retry-profile-${legacy?'old':'new'}-${Date.now()}`),{
 executablePath:'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe',headless:true,
 args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`],viewport:{width:1400,height:900}});
 let fresh=false;let tagCalls=0;const report={legacy};
 try{
  await context.route('https://search.bilibili.com/all?*',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:html}));
  await context.route('https://api.bilibili.com/x/tag/archive/tags?*',r=>{tagCalls++;const wanted=new URL(r.request().url()).searchParams.get('bvid')===id(3);return r.fulfill({contentType:'application/json',body:JSON.stringify({code:0,data:fresh&&wanted?[{tag_name:'mod'}]:[]})});});
  await context.route('https://api.bilibili.com/x/web-interface/search/type?*',r=>r.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'https://search.bilibili.com','Access-Control-Allow-Credentials':'true'},body:JSON.stringify({code:0,data:{page:2,numPages:1,result:[]}})}));
  const page=await context.newPage();await page.goto('https://search.bilibili.com/all?keyword=%E4%BA%8B%E5%8F%98%E6%97%A5mod');
  await page.waitForFunction(()=>[...document.querySelectorAll('.bili-video-card')].every(el=>['keep','hide'].includes(el.dataset.bcsState)));
  report.before=await page.locator('.col_3').evaluateAll(items=>items.map(el=>{const r=el.getBoundingClientRect();return {state:el.dataset.bcsState,display:getComputedStyle(el).display,x:r.x,y:r.y};}));
  if(legacy){
   assert.equal(report.before[0].display,'block','old comprehensive wrapper still occupies space');
   assert.notEqual(report.before[1].x,30,'old retained card does not move to first slot');
   report.reproducedGaps=true;
   // Remove only fixture pointer interference so the old retry behavior itself can be measured.
   await page.addStyleTag({content:'#bcs-panel{pointer-events:auto}'});
  }else{
   assert.equal(report.before[0].display,'none');assert.equal(report.before[1].x,30);
   assert.equal(await page.locator('#blank-slot').evaluate(el=>getComputedStyle(el).display),'none');
  }
  fresh=true;const beforeCalls=tagCalls;
  await page.locator('#bcs-panel').getByRole('button',{name:'重新核验'}).click();
  if(legacy){await page.waitForTimeout(500);assert.equal(tagCalls,beforeCalls);report.reproducedCachedRetry=true;}
  else{
   await page.waitForFunction(()=>document.querySelectorAll('.bili-video-card[data-bcs-state="keep"]').length===2);
   assert.equal(tagCalls,beforeCalls+2);
   await page.evaluate(()=>history.replaceState({},'',location.pathname+'?vt=52977042&keyword=%E4%BA%8B%E5%8F%98%E6%97%A5mod'));
   await page.waitForTimeout(550);
   report.feedback=await page.locator('#bcs-panel').evaluate(el=>({retries:el.dataset.bcsRetryCount,note:el.shadowRoot.getElementById('note').textContent,version:el.shadowRoot.querySelector('.version').textContent}));
   assert.equal(report.feedback.retries,'1');assert.match(report.feedback.note,/本轮核验已结束/);assert.match(report.feedback.version,/1\.1\.1/);
   const rects=await page.locator('.col_3[data-bcs-state="keep"]').evaluateAll(items=>items.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width};}));
   assert.equal(rects[0].x,30);assert.equal(rects[0].y,rects[1].y);assert(Math.abs(rects[1].x-rects[0].x-rects[0].width-16)<1);
   report.after=rects;assert.equal(await page.locator('#other').innerText(),'用户和直播模块');
   await page.screenshot({path:path.join(root,'verification','reported-bugs-fixed.png')});
   await page.locator('#bcs-panel').getByRole('button',{name:'关闭过滤'}).click();
   assert.equal(await page.locator('.bcs-compact-grid,.bcs-grid-card').count(),0);
   assert.equal(await page.locator('.col_3').first().evaluate(el=>getComputedStyle(el).display),'block');
   report.restorePassed=true;
  }
  report.passed=true;return report;
 }finally{await context.close();}
}
(async()=>{
 const legacy=process.env.BCS_LEGACY_EXTENSION_DIR||path.join(root,'verification','legacy-v1.1.0','extension');
 const old=fs.existsSync(path.join(legacy,'manifest.json'))?await run(legacy,true):{skipped:true,reason:'Set BCS_LEGACY_EXTENSION_DIR to the v1.1.0 extension for comparison'};
 const current=await run(process.env.BCS_EXTENSION_DIR||path.join(root,'extension'));
 const report={old,current};fs.writeFileSync(path.join(root,'verification','reported-bugs-regression.json'),JSON.stringify(report,null,2),'utf8');console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
