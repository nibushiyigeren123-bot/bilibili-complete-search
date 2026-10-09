(function () {
  "use strict";
  let blockedUntil = 0;

  function urlFor(message) {
    const source = new URL(message.url);
    if (source.origin !== "https://search.bilibili.com" || !/^\/(video|all)\/?$/.test(source.pathname) ||
        !source.searchParams.get("keyword")?.trim() || !Number.isInteger(message.page) || message.page < 1 || message.page > 1000 ||
        !Number.isInteger(message.pageSize) || message.pageSize < 1 || message.pageSize > 50) throw new Error("补充搜索参数无效");
    const url = new URL("https://api.bilibili.com/x/web-interface/search/type");
    url.searchParams.set("search_type", "video");
    url.searchParams.set("keyword", source.searchParams.get("keyword"));
    for (const name of ["order", "order_sort", "duration", "tids", "tids_1", "tids_2", "pubtime", "begin", "end"]) {
      if (source.searchParams.has(name)) url.searchParams.set(name, source.searchParams.get(name));
    }
    url.searchParams.set("page", String(message.page));
    url.searchParams.set("page_size", String(message.pageSize));
    return url.href;
  }

  function parse(body, page) {
    if (body.code !== 0) {
      if ([-412, -352, -509].includes(body.code)) blockedUntil = Date.now() + 60000;
      throw new Error(`补充搜索未成功（${body.code ?? "未知"}）`);
    }
    const data = body.data;
    if (!data || !Array.isArray(data.result) || Number(data.page) !== page ||
        !Number.isInteger(Number(data.numPages)) || Number(data.numPages) < 0) throw new Error("补充搜索响应格式已变化，已停止补充");
    const videos = data.result.filter(item => item.type === "video").map(item => {
      if (!/^BV[a-zA-Z0-9]{10}$/.test(item.bvid) || typeof item.title !== "string") throw new Error("补充视频格式已变化");
      return {id: item.bvid, aid: Number.isSafeInteger(Number(item.aid)) ? Number(item.aid) : null,
        title: item.title, pic: typeof item.pic === "string" ? item.pic : "",
        author: typeof item.author === "string" ? item.author : "", duration: typeof item.duration === "string" ? item.duration : ""};
    });
    // Descriptions, uploader names and the search endpoint's tag field do not
    // become matching evidence. Title failures still use the real tags endpoint.
    return {ok: true, videos, page, totalPages: Number(data.numPages)};
  }

  async function read(message) {
    const url = urlFor(message);
    if (Date.now() < blockedUntil) return {ok: false, error: "B站暂时限制搜索请求，请一分钟后继续补充"};
    try {
      const response = await fetch(url, {credentials: "include", signal: AbortSignal.timeout(12000)});
      if (!response.ok) {
        if ([412, 429].includes(response.status)) blockedUntil = Date.now() + 60000;
        throw new Error(`补充搜索失败（HTTP ${response.status}）`);
      }
      return parse(await response.json(), message.page);
    } catch (error) {
      return {ok: false, error: error.message};
    }
  }

  globalThis.BiliCompleteSearch = Object.freeze({urlFor, parse, read});
})();
