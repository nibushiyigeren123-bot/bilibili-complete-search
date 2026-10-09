const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function setup(fetcher) {
  const cache = {};
  let listener;
  const context = {URL, AbortSignal, Date, Map, Promise, setTimeout: fn => setTimeout(fn, 0), fetch: fetcher, chrome: {
    storage:{local:{get: async key => ({[key]:cache[key]}), set: async obj => Object.assign(cache,obj)}},
    runtime:{onMessage:{addListener: fn => {listener=fn;}}}
  }};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../extension/background.js'),'utf8'), context);
  const send = (id,refresh=false) => new Promise(resolve => listener({type:'bcs:tags',id,refresh},{url:'https://search.bilibili.com/video'},resolve));
  return {send, getListener: () => listener};
}
test('deduplicates requests, extracts actual tag names, and reuses cache', async () => {
  let calls=0;
  const env=setup(async url => {calls++; assert.match(url,/bvid=BV1111111111/); return {ok:true,json:async()=>({code:0,data:[{tag_name:'day'}]})};});
  const [a,b]=await Promise.all([env.send('BV1111111111'), env.send('BV1111111111')]);
  assert.equal(a.ok,true); assert.deepEqual(Array.from(a.tags),['day']); assert.equal(b.ok,true);
  await env.send('BV1111111111'); assert.equal(calls,1);
});
test('rate limits remain an explicit error and pause subsequent requests', async () => {
  let calls=0;
  const env=setup(async () => {calls++;return {ok:false,status:412};});
  assert.equal((await env.send('BV1111111111')).ok,false);
  assert.equal((await env.send('BV2222222222')).ok,false);
  assert.equal(calls,1);
});
test('rejects arbitrary ids and foreign sender origins', () => {
  const env=setup(async()=>{throw new Error('should not fetch');});
  const listener=env.getListener();
  assert.equal(listener({type:'bcs:tags',id:'../../attack'},{url:'https://search.bilibili.com/video'},()=>{}),undefined);
  assert.equal(listener({type:'bcs:tags',id:'BV1111111111'},{url:'https://example.com'},()=>{}),undefined);
});

test('manual refresh skips a successful cache entry and updates it with current tags', async()=>{
  let calls=0;const env=setup(async()=>({ok:true,json:async()=>({code:0,data:[{tag_name:++calls===1?'old':'day'}]})}));
  assert.deepEqual(Array.from((await env.send('BV1111111111')).tags),['old']);
  assert.deepEqual(Array.from((await env.send('BV1111111111',true)).tags),['day']);
  assert.deepEqual(Array.from((await env.send('BV1111111111')).tags),['day']);
  assert.equal(calls,2);
});

test('manual refresh still respects cooldown after a rate limit',async()=>{
  let calls=0;const env=setup(async()=>++calls===1?{ok:true,json:async()=>({code:0,data:[{tag_name:'old'}]})}:{ok:false,status:429});
  await env.send('BV1111111111');await env.send('BV2222222222');
  assert.equal((await env.send('BV1111111111',true)).ok,false);
  assert.equal(calls,2);
});
