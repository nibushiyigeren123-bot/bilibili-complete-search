(function () {
  "use strict";
  const matcher = globalThis.BiliCompleteMatcher;
  const cards = new Map();
  const tagCache = new Map();
  let enabled = true;
  let query = "";
  let signature = "";
  let epoch = 0;
  let timer;
  let host;
  let status;
  let toggle;
  let note;
  let more;
  let stop;
  let fillRun = 0;
  let filling = false;
  let nextPage = 2;
  let loadedPages = 0;
  let pageSize = 42;
  let fillTarget = 0;
  let fillBudget = 5;
  let fillEnded = false;
  let fillPaused = false;
  let fillError = "";

  function videoRoute() { return /^\/video\/?$/.test(location.pathname); }
  function values() { return [...cards.values()].filter(info => info.card.isConnected); }
  function resetFill() {
    fillRun++;
    filling = false;
    document.querySelectorAll("[data-bcs-imported]").forEach(element => element.remove());
    nextPage = Math.max(1, Number(new URL(location.href).searchParams.get("page")) || 1) + 1;
    loadedPages = 0;
    pageSize = 42;
    fillTarget = 0;
    fillBudget = 5;
    fillEnded = false;
    fillPaused = false;
    fillError = "";
  }

  function activate() {
    document.documentElement?.classList.toggle("bcs-active", enabled && matcher.tokenize(query).length > 0);
  }

  function readRoute() {
    const url = new URL(location.href);
    const next = `${url.pathname}?${url.searchParams.toString()}`;
    if (next === signature) return;
    signature = next;
    query = url.searchParams.get("keyword") || "";
    epoch++;
    resetFill();
    cards.clear();
    document.querySelectorAll("[data-bcs-state]").forEach(element => element.removeAttribute("data-bcs-state"));
    activate();
  }

  function setState(info, state, reason = "") {
    info.state = state;
    info.reason = reason;
    info.card.dataset.bcsState = state;
    info.container.dataset.bcsState = state;
  }

  function describe(card) {
    const titleNode = card.querySelector(".bili-video-card__info--tit, .bili-video-card__av--tit, .title, h3");
    if (!titleNode) return null; // Skeleton: keep pending, wait for actual content.
    const title = titleNode.getAttribute("title") || titleNode.textContent || "";
    const anchors = [...card.querySelectorAll("a[href]")];
    let id = null;
    for (const anchor of anchors) {
      const href = anchor.getAttribute("href") || "";
      const found = href.match(/\/video\/(BV[a-zA-Z0-9]{10}|av[1-9][0-9]*)(?:[/?#]|$)/);
      if (found) { id = found[1]; break; }
    }
    const container = card.closest(".video-list-item") || card;
    return {card, container, id, title, state: "pending", reason: ""};
  }

  async function evaluate(info) {
    const currentEpoch = epoch;
    const currentQuery = query;
    if (matcher.matches(currentQuery, info.title)) {
      setState(info, "keep");
      return;
    }
    if (!info.id) {
      setState(info, "error", "未识别到视频编号，无法确认标签");
      return;
    }
    setState(info, "pending");
    try {
      let result = tagCache.get(info.id);
      if (!result) {
        result = await chrome.runtime.sendMessage({type: "bcs:tags", id: info.id});
        if (result?.ok) tagCache.set(info.id, result);
      }
      if (epoch !== currentEpoch || cards.get(info.card) !== info || !info.card.isConnected) return;
      if (!result?.ok) setState(info, "error", result?.error || "未收到标签响应");
      else setState(info, matcher.matches(currentQuery, info.title, result.tags) ? "keep" : "hide");
    } catch (error) {
      if (epoch === currentEpoch && cards.get(info.card) === info) setState(info, "error", error.message);
    }
    render();
    schedule();
  }

  function createVideo(video, template, page) {
    const container = document.createElement("div");
    container.className = template.className;
    container.classList.add("bcs-imported");
    container.dataset.bcsImported = "true";
    container.dataset.bcsState = "pending";
    const card = document.createElement("div");
    card.className = "bili-video-card bcs-added-card";
    card.dataset.bcsState = "pending";
    const link = document.createElement("a");
    link.href = `https://www.bilibili.com/video/${video.id}/`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "bcs-video-link";
    const thumb = document.createElement("div");
    thumb.className = "bcs-thumbnail";
    let picture;
    try { picture = new URL(video.pic, "https://www.bilibili.com"); } catch {}
    if (picture && /(^|\.)hdslb\.com$/.test(picture.hostname) && ["http:", "https:"].includes(picture.protocol)) {
      picture.protocol = "https:";
      const image = document.createElement("img");
      image.src = picture.href;
      image.alt = "";
      image.loading = "lazy";
      thumb.append(image);
    }
    const duration = document.createElement("span");
    duration.textContent = video.duration || "";
    thumb.append(duration);
    const title = document.createElement("h3");
    title.className = "bili-video-card__info--tit bcs-video-title";
    // Parse highlighting as inert text; never insert server HTML into the live page.
    const parsed = new DOMParser().parseFromString(video.title, "text/html");
    parsed.querySelectorAll("script, style").forEach(element => element.remove());
    title.textContent = parsed.body.textContent || "";
    title.title = title.textContent;
    link.append(thumb, title);
    const owner = document.createElement("p");
    owner.className = "bcs-video-owner";
    owner.textContent = `${video.author || ""} · 补充自第 ${page} 页`;
    card.append(link, owner);
    container.append(card);
    return container;
  }

  async function fill() {
    if (filling || fillPaused || fillEnded || fillError || !enabled || !videoRoute()) return;
    const list = values();
    if (!list.length || list.some(info => info.state === "pending" || info.state === "error")) return;
    const template = list.find(info => !info.container.hasAttribute("data-bcs-imported"))?.container;
    const grid = template?.parentElement;
    if (!grid || list.filter(info => info.state === "keep").length >= fillTarget || !fillBudget) return;
    const currentEpoch = epoch;
    const run = ++fillRun;
    const currentUrl = location.href;
    const current = () => enabled && epoch === currentEpoch && fillRun === run && signature === `${location.pathname}?${new URL(location.href).searchParams.toString()}` && grid.isConnected;
    filling = true;
    render();
    try {
      while (current() && fillBudget > 0 && !fillEnded && values().filter(info => info.state === "keep").length < fillTarget) {
        const page = nextPage;
        // Search uses the current B站 page's origin and normal CORS permissions.
        // Tag requests remain in the extension worker because their endpoint
        // does not provide the same browser-page access.
        const result = await globalThis.BiliCompleteSearch.read({url: currentUrl, page, pageSize});
        if (!current()) return;
        if (!result?.ok) throw new Error(result?.error || "未收到补充搜索响应");
        if (!Array.isArray(result.videos) || result.page !== page || !Number.isInteger(result.totalPages)) throw new Error("补充搜索响应格式已变化");
        const existing = new Set(values().flatMap(info => [info.id, info.card.querySelector("a[href]")?.getAttribute("href")?.match(/av[1-9][0-9]*/)?.[0]]).filter(Boolean));
        const added = [];
        for (const video of result.videos) {
          if (!/^BV[a-zA-Z0-9]{10}$/.test(video.id) || typeof video.title !== "string") throw new Error("补充视频格式已变化");
          if (existing.has(video.id) || (video.aid && existing.has(`av${video.aid}`))) continue;
          existing.add(video.id);
          if (video.aid) existing.add(`av${video.aid}`);
          const container = createVideo(video, template, page);
          grid.append(container);
          const info = describe(container.querySelector(".bili-video-card"));
          cards.set(info.card, info);
          added.push(evaluate(info));
        }
        nextPage++;
        loadedPages++;
        fillBudget--;
        fillEnded = page >= result.totalPages || result.videos.length === 0;
        await Promise.all(added);
        if (!current()) return;
        if (values().some(info => info.state === "error")) throw new Error("有视频标签待核验，请先重新核验后再继续补充");
        if (!added.length && result.videos.length && !fillEnded) throw new Error("后续页没有新视频，已暂停补充，可手动继续");
        render();
        if (!fillEnded && fillBudget > 0 && values().filter(info => info.state === "keep").length < fillTarget) {
          await new Promise(resolve => setTimeout(resolve, 400));
        }
      }
    } catch (error) {
      if (current()) fillError = error.message;
    } finally {
      if (fillRun === run) { filling = false; render(); }
    }
  }

  function mountPanel() {
    if (host?.isConnected || !document.body) return;
    host = document.createElement("div");
    host.id = "bcs-panel";
    const shadow = host.attachShadow({mode: "open"});
    shadow.innerHTML = `<style>
      :host{position:fixed;bottom:20px;right:20px;z-index:2147483646;color:#253345;font:13px/1.6 system-ui,sans-serif}
      .box{width:290px;border:1px solid #c6e8f4;border-radius:14px;background:#fff;box-shadow:0 5px 28px #183c5326;padding:14px}
      .head{display:flex;align-items:center;justify-content:space-between;font-weight:700;font-size:14px}
      button{font:inherit;cursor:pointer;border:1px solid #c6d9e3;background:#f4fafd;border-radius:7px;padding:4px 9px;color:#166781}
      p{margin:9px 0 0;overflow-wrap:anywhere}.small{font-size:12px;color:#6e7c8b}.actions{display:flex;gap:8px;margin-top:10px}
    </style><div class="box"><div class="head"><span>B站搜索 · 完整包含</span><button id="toggle" type="button"></button></div><p id="status" aria-live="polite"></p><p id="note" class="small"></p><div class="actions"><button id="retry" type="button">重新核验</button><button id="more" type="button">继续补充</button><button id="stop" type="button" hidden>暂停补充</button></div><p class="small">标题 + 标签；中文、数字完整匹配，英文可拆成至少 2 字母的词块。</p></div>`;
    status = shadow.getElementById("status");
    toggle = shadow.getElementById("toggle");
    note = shadow.getElementById("note");
    more = shadow.getElementById("more");
    stop = shadow.getElementById("stop");
    more.addEventListener("click", () => {
      fillPaused = false;
      fillError = "";
      fillBudget = 5;
      fillTarget = values().filter(info => info.state === "keep").length + pageSize;
      void fill();
      render();
    });
    stop.addEventListener("click", () => {
      fillRun++;
      filling = false;
      fillPaused = true;
      render();
    });
    toggle.addEventListener("click", async () => {
      enabled = !enabled;
      if (!enabled) resetFill();
      activate();
      await chrome.storage.local.set({enabled});
      scan();
    });
    shadow.getElementById("retry").addEventListener("click", () => {
      epoch++;
      fillRun++;
      filling = false;
      fillError = "";
      fillPaused = false;
      cards.clear();
      scan();
    });
    document.body.append(host);
  }

  function render() {
    mountPanel();
    if (!status) return;
    const list = values();
    const count = state => list.filter(info => info.state === state).length;
    toggle.textContent = enabled ? "关闭过滤" : "开启过滤";
    if (!enabled) status.textContent = "过滤已关闭，显示 B站原始结果。";
    else if (!matcher.tokenize(query).length) status.textContent = "输入搜索内容后开始过滤。";
    else status.textContent = `保留 ${count("keep")} · 隐藏 ${count("hide")} · 核验中 ${count("pending")} · 待核验 ${count("error")}`;
    const failure = list.find(info => info.state === "error");
    let progress = "";
    if (videoRoute() && enabled && matcher.tokenize(query).length) {
      if (filling) progress = `正在读取第 ${nextPage} 页并补充结果…`;
      else if (fillError) progress = `补充已暂停：${fillError}`;
      else if (fillEnded) progress = "已读取到最后一页。";
      else if (fillPaused) progress = "补充已暂停，可点击继续补充。";
      else if (!fillBudget) progress = "本轮已读取 5 个后续页，可点击继续补充。";
      else if (loadedPages) progress = `已补充 ${loadedPages} 个后续页，可继续补充。`;
      else progress = "结果不足一页时自动读取后续页补充。";
    }
    note.textContent = [failure ? `待核验结果已隐藏：${failure.reason}` : `当前搜索：${query || "（空）"}。统计包含当前已加载视频。`, progress].filter(Boolean).join(" ");
    more.hidden = !videoRoute();
    more.disabled = !enabled || !matcher.tokenize(query).length || filling || fillEnded || !list.length || !!failure || list.some(info => info.state === "pending");
    stop.hidden = !filling;
  }

  function scan() {
    readRoute();
    if (enabled && matcher.tokenize(query).length) {
      document.querySelectorAll(".bili-video-card, .video-item").forEach(card => {
        const info = describe(card);
        if (!info) return;
        const old = cards.get(card);
        if (old && old.id === info.id && old.title === info.title) return;
        cards.set(card, info);
        void evaluate(info);
      });
    }
    for (const [card] of cards) if (!card.isConnected) cards.delete(card);
    const native = values().filter(info => !info.container.hasAttribute("data-bcs-imported"));
    if (native.length) {
      pageSize = Math.min(50, native.length);
      fillTarget = Math.max(fillTarget, native.length);
    }
    render();
    if (enabled && matcher.tokenize(query).length) void fill();
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(scan, 70);
  }

  readRoute();
  chrome.storage.local.get({enabled: true}).then(settings => {
    enabled = settings.enabled;
    activate();
    scan();
  }).catch(scan);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.enabled) {
      enabled = changes.enabled.newValue !== false;
      if (!enabled) resetFill();
      activate();
      scan();
    }
  });
  new MutationObserver(schedule).observe(document.documentElement, {childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["href", "title"]});
  window.addEventListener("popstate", schedule);
  // B站 uses pushState; isolated content scripts cannot patch its page-world history.
  setInterval(() => { if (`${location.pathname}?${new URL(location.href).searchParams.toString()}` !== signature) scan(); }, 400);
})();
