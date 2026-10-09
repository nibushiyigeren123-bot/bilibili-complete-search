"use strict";
const CACHE_TTL = 24 * 60 * 60 * 1000;
const inFlight = new Map();
let queue = Promise.resolve();
let blockedUntil = 0;

async function readTags(id, refresh = false) {
  const key = `tags:${id}`;
  const cached = (await chrome.storage.local.get(key))[key];
  if (!refresh && cached && Date.now() - cached.time < CACHE_TTL) return {ok: true, tags: cached.tags};
  if (Date.now() < blockedUntil) throw new Error("B站暂时限制标签请求，请稍后重新核验");
  const url = new URL("https://api.bilibili.com/x/tag/archive/tags");
  url.searchParams.set(id.startsWith("BV") ? "bvid" : "aid", id.replace(/^av/, ""));
  const response = await fetch(url.href, {credentials: "include", signal: AbortSignal.timeout(12000)});
  if (!response.ok) {
    if (response.status === 412 || response.status === 429) blockedUntil = Date.now() + 60000;
    throw new Error(`标签请求失败（HTTP ${response.status}）`);
  }
  const body = await response.json();
  if (body.code !== 0 || !Array.isArray(body.data)) {
    if ([-412, -352, -509].includes(body.code)) blockedUntil = Date.now() + 60000;
    throw new Error(`标签接口未成功（${body.code ?? "未知"}）`);
  }
  if (!body.data.every(item => typeof item.tag_name === "string")) throw new Error("标签响应格式已变化");
  const tags = body.data.map(item => item.tag_name);
  await chrome.storage.local.set({[key]: {time: Date.now(), tags}});
  return {ok: true, tags};
}

function getTags(id, refresh = false) {
  if (inFlight.has(id)) return inFlight.get(id);
  const job = queue.then(() => readTags(id, refresh)).catch(error => ({ok: false, error: error.message}));
  // Sequential calls and a small gap avoid flooding the public endpoint.
  queue = job.then(() => new Promise(resolve => setTimeout(resolve, 200)));
  inFlight.set(id, job);
  job.finally(() => inFlight.delete(id));
  return job;
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== "bcs:tags") return;
  let source;
  try { source = new URL(sender.url); } catch { return; }
  if (source.origin !== "https://search.bilibili.com" || !/^(BV[a-zA-Z0-9]{10}|av[1-9][0-9]*)$/.test(message.id)) return;
  getTags(message.id, message.refresh === true).then(respond);
  return true;
});
