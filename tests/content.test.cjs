const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const source = name => fs.readFileSync(path.join(__dirname, '../extension', name), 'utf8');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const card = (id, title) => `<div class="video-list-item"><div class="bili-video-card"><a href="https://www.bilibili.com/video/${id}/"><h3 class="bili-video-card__info--tit" title="${title}">${title}</h3></a><span class="bili-video-card__info--owner">payday</span></div></div>`;
function setup(html, query, getResult, enabled = true) {
  const dom = new JSDOM(`<html><body><div id="results">${html}</div></body></html>`, {url: `https://search.bilibili.com/video?keyword=${encodeURIComponent(query)}`, runScripts: 'outside-only'});
  let listener;
  const messages = [];
  dom.window.chrome = {
    storage: {local: {get: async () => ({enabled}), set: async data => {if ('enabled' in data) listener?.({enabled: {newValue: data.enabled}}, 'local');}}, onChanged: {addListener: fn => {listener = fn;}}},
    runtime: {sendMessage: async message => {messages.push(message); return getResult(message);}}
  };
  dom.window.eval(source('matcher.js'));
  dom.window.eval(source('content.js'));
  return {dom, messages, states: () => [...dom.window.document.querySelectorAll('.bili-video-card')].map(item => item.dataset.bcsState)};
}
test('titles and tags combine, uploader never counts, failures remain hidden', async t => {
  const env = setup(card('BV1111111111', 'PAYDAY玩法') + card('BV2222222222', 'pay玩法') + card('BV3333333333', '无关') + card('BV4444444444', 'day'), 'payday', message => message.id === 'BV4444444444' ? {ok:false,error:'HTTP 412'} : {ok:true,tags:message.id === 'BV2222222222' ? ['day'] : []});
  t.after(() => env.dom.window.close());
  await wait(140);
  assert.deepEqual(env.states(), ['keep','keep','hide','error']);
  assert.equal(env.messages.length, 3, 'title-only match needs no request');
  const panel = env.dom.window.document.getElementById('bcs-panel').shadowRoot;
  assert.match(panel.getElementById('status').textContent, /保留 2 · 隐藏 1/);
  assert.match(panel.getElementById('note').textContent, /HTTP 412/);
  assert.deepEqual([...env.dom.window.document.querySelectorAll('.video-list-item')].map(item => item.dataset.bcsState), ['keep','keep','hide','error']);
  panel.getElementById('toggle').click();
  await wait(40);
  assert.equal(env.dom.window.document.documentElement.classList.contains('bcs-active'), false);
});
test('new results, SPA route changes, and stale responses', async t => {
  let release;
  const env = setup(card('BV1111111111', 'pay'), 'payday', () => new Promise(resolve => {release = resolve;}));
  t.after(() => env.dom.window.close());
  await wait(40);
  assert.deepEqual(env.states(), ['pending']);
  env.dom.window.history.pushState({}, '', '?keyword=一二三12');
  env.dom.window.document.getElementById('results').innerHTML = card('BV2222222222', '一二三12');
  await wait(140);
  release({ok:true,tags:['day']});
  await wait(20);
  assert.deepEqual(env.states(), ['keep']);
  env.dom.window.document.getElementById('results').insertAdjacentHTML('beforeend', card('BV3333333333', '一二三12第2集'));
  await wait(140);
  assert.deepEqual(env.states(), ['keep','keep']);
});
test('initially disabled and no searchable keyword leave original results visible', async t => {
  const env = setup(card('BV1111111111', '无关'), 'payday', () => {throw new Error('should not fetch');}, false);
  t.after(() => env.dom.window.close());
  await wait(80);
  assert.equal(env.dom.window.document.documentElement.classList.contains('bcs-active'), false);
  assert.equal(env.messages.length, 0);
});
