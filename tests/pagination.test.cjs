const {test}=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const fs=require('node:fs');
const path=require('node:path');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const id=n=>`BV${String(n).padStart(10,'0')}`;
const card=(n,title)=>`<div class="video-list-item"><div class="bili-video-card"><a href="https://www.bilibili.com/video/${id(n)}/"><h3 title="${title}">${title}</h3></a></div></div>`;
const video=(n,title,extra={})=>({id:id(n),title,author:'payday',...extra});
function setup(html,handler,route='/video?keyword=payday') {
 const dom=new JSDOM(`<html><body><div class="video-list row">${html}</div></body></html>`,{url:`https://search.bilibili.com${route}`,runScripts:'outside-only'});
 const messages=[];let change;
 dom.window.chrome={storage:{local:{get:async()=>({enabled:true}),set:async data=>change?.({enabled:{newValue:data.enabled}},'local')},onChanged:{addListener:fn=>change=fn}},runtime:{sendMessage:async message=>{messages.push(message);return handler(message);}}};
 dom.window.BiliCompleteSearch={read:async message=>{const request={type:'bcs:search',...message};messages.push(request);return handler(request);}};
 for(const name of ['matcher.js','content.js'])dom.window.eval(fs.readFileSync(path.join(__dirname,'../extension',name),'utf8'));
 const panel=()=>dom.window.document.querySelector('#bcs-panel')?.shadowRoot;
 return {dom,messages,panel,imported:()=>[...dom.window.document.querySelectorAll('.bcs-imported')],kept:()=>[...dom.window.document.querySelectorAll('.bili-video-card[data-bcs-state="keep"]')],searches:()=>messages.filter(m=>m.type==='bcs:search')};
}
async function until(predicate) {for(let n=0;n<300;n++){if(predicate())return;await wait(20);}assert.fail('Timed out waiting for pagination');}

test('fills gaps from later pages, checks true tags, deduplicates videos and preserves result order',async t=>{
 const env=setup(card(1,'payday')+card(2,'无关')+card(3,'无关'),message=>{
  if(message.type==='bcs:tags')return {ok:true,tags:message.id===id(4)?['day']:[]};
  return {ok:true,page:message.page,totalPages:4,videos:[video(1,'payday'),video(4,'pay'),video(4,'pay'),video(5,'payday'),video(6,'无关')]};
 });t.after(()=>env.dom.window.close());
 await until(()=>env.kept().length===3);
 assert.equal(env.searches().length,1);assert.equal(env.searches()[0].page,2);assert.equal(env.searches()[0].pageSize,3);
 assert.deepEqual(env.kept().map(el=>el.querySelector('a').href.match(/BV\d+/)[0]),[id(1),id(4),id(5)]);
 assert.equal(env.imported().length,3);
 assert.equal(env.imported()[2].dataset.bcsState,'hide','uploader payday never counts');
 env.panel().getElementById('toggle').click();await wait(30);
 assert.equal(env.imported().length,0);assert.equal(env.dom.window.document.querySelectorAll('.video-list-item').length,3);
 assert.equal(env.dom.window.document.documentElement.classList.contains('bcs-active'),false);
});

test('a completely filtered first page advances across another empty page to useful videos',async t=>{
 const env=setup(card(1,'无关')+card(2,'无关'),message=>message.type==='bcs:tags'?{ok:true,tags:[]}:{ok:true,page:message.page,totalPages:3,videos:message.page===2?[video(3,'无关')]:[video(4,'payday'),video(5,'payday')]});
 t.after(()=>env.dom.window.close());await until(()=>env.kept().length===2);
 assert.deepEqual(env.searches().map(m=>m.page),[2,3]);
 assert.match(env.panel().getElementById('note').textContent,/最后一页/);
});

test('five-page automatic limit is resumable without reading the same page again',async t=>{
 const env=setup(card(1,'无关'),message=>message.type==='bcs:tags'?{ok:true,tags:[]}:{ok:true,page:message.page,totalPages:20,videos:[video(message.page,'无关')]});
 t.after(()=>env.dom.window.close());await until(()=>env.searches().length===5&&env.panel().getElementById('stop').hidden);
 await wait(150);assert.deepEqual(env.searches().map(m=>m.page),[2,3,4,5,6]);
 assert.match(env.panel().getElementById('note').textContent,/5 个后续页/);
 env.panel().getElementById('more').click();await until(()=>env.searches().length===10);await wait(100);
 assert.deepEqual(env.searches().map(m=>m.page),[2,3,4,5,6,7,8,9,10,11]);
});

test('search failure pauses and manual continuation retries that exact page',async t=>{
 let calls=0;
 const env=setup(card(1,'无关'),message=>message.type==='bcs:tags'?{ok:true,tags:[]}:(++calls===1?{ok:false,error:'HTTP 412'}:{ok:true,page:message.page,totalPages:2,videos:[video(2,'payday')]}));
 t.after(()=>env.dom.window.close());await until(()=>env.panel()?.getElementById('note').textContent.includes('HTTP 412'));
 await wait(150);assert.equal(calls,1);
 env.panel().getElementById('more').click();await until(()=>env.kept().length===1);
 assert.deepEqual(env.searches().map(m=>m.page),[2,2]);
});

test('stale search response cannot insert cards after route change',async t=>{
 let release;
 const env=setup(card(1,'无关'),message=>message.type==='bcs:tags'?{ok:true,tags:[]}:new Promise(resolve=>release=resolve));
 t.after(()=>env.dom.window.close());await until(()=>!!release);
 env.dom.window.history.pushState({},'','?keyword=BO7');
 env.dom.window.document.querySelector('.video-list').innerHTML=card(2,'BO7');
 release({ok:true,page:2,totalPages:9,videos:[video(3,'payday')]});
 await wait(180);assert.equal(env.imported().length,0);assert.equal(env.kept()[0].textContent,'BO7');
});

test('pause discards the in-flight page and continue resumes safely',async t=>{
 let release;let calls=0;
 const env=setup(card(1,'无关'),message=>message.type==='bcs:tags'?{ok:true,tags:[]}:(++calls===1?new Promise(resolve=>release=resolve):{ok:true,page:message.page,totalPages:2,videos:[video(2,'payday')]}));
 t.after(()=>env.dom.window.close());await until(()=>!!release);
 env.panel().getElementById('stop').click();release({ok:true,page:2,totalPages:2,videos:[video(2,'payday')]});
 await wait(150);assert.equal(env.imported().length,0);assert.equal(env.searches().length,1);
 env.panel().getElementById('more').click();await until(()=>env.kept().length===1);
 assert.deepEqual(env.searches().map(m=>m.page),[2,2]);
});

test('closing filter while fetching never leaks additional cards',async t=>{
 let release;
 const env=setup(card(1,'无关'),message=>message.type==='bcs:tags'?{ok:true,tags:[]}:new Promise(resolve=>release=resolve));
 t.after(()=>env.dom.window.close());await until(()=>!!release);
 env.panel().getElementById('toggle').click();release({ok:true,page:2,totalPages:2,videos:[video(2,'payday')]});
 await wait(150);assert.equal(env.imported().length,0);assert.equal(env.dom.window.document.documentElement.classList.contains('bcs-active'),false);
});

test('last page and duplicate-only pages stop without infinite requests',async t=>{
 const env=setup(card(1,'无关'),message=>message.type==='bcs:tags'?{ok:true,tags:[]}:{ok:true,page:message.page,totalPages:10,videos:[video(1,'无关')]});
 t.after(()=>env.dom.window.close());await until(()=>env.panel()?.getElementById('note').textContent.includes('没有新视频'));
 await wait(150);assert.equal(env.searches().length,1);
 const end=setup(card(1,'无关'),message=>message.type==='bcs:tags'?{ok:true,tags:[]}:{ok:true,page:message.page,totalPages:1,videos:[]});
 t.after(()=>end.dom.window.close());await until(()=>end.searches().length&&end.panel().getElementById('more').disabled);
 assert.match(end.panel().getElementById('note').textContent,/最后一页/);
});

test('native page number is respected and comprehensive search never auto-loads video pages',async t=>{
 const env=setup(card(1,'无关'),message=>message.type==='bcs:tags'?{ok:true,tags:[]}:{ok:true,page:message.page,totalPages:3,videos:[]},'/video?keyword=payday&page=3&order=click');
 t.after(()=>env.dom.window.close());await until(()=>env.searches().length);assert.equal(env.searches()[0].page,4);assert.match(env.searches()[0].url,/order=click/);
 const all=setup(card(1,'无关'),()=>({ok:true,tags:[]}),'/all?keyword=payday');t.after(()=>all.dom.window.close());await wait(180);assert.equal(all.searches().length,0);
});

test('server highlighting is decoded as text and active HTML is never inserted',async t=>{
 const env=setup(card(1,'无关'),message=>message.type==='bcs:tags'?{ok:true,tags:[]}:{ok:true,page:message.page,totalPages:2,videos:[video(2,'<em>payday</em> &amp; <img src=x onerror=alert(1)><script>alert(2)</script>',{pic:'javascript:alert(3)'})]});
 t.after(()=>env.dom.window.close());await until(()=>env.kept().length===1);
 assert.equal(env.kept()[0].querySelector('h3').textContent,'payday & ');
 assert.equal(env.imported()[0].querySelectorAll('script,img,[onerror]').length,0);
 assert.equal(env.kept()[0].querySelector('a').rel,'noopener noreferrer');
});
