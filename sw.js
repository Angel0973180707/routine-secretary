/* sw.js — 作息秘書 v19.1.1
   ✅ GitHub Pages / 純前端適用
   ✅ 預快取（離線可開）
   ✅ 自動清舊快取（版本升級不打架）
   ✅ 導航 fallback 到 index.html（避免離線點連結白頁）
*/

"use strict";

const APP_NAME = "sleep-secretary";
const APP_VERSION = "19.1.1";
const CACHE_NAME = `${APP_NAME}-v${APP_VERSION}`;

// 你目前根目錄檔名（照你貼的結構）
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
];

// --- install：預先快取核心檔案 ---
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // 用 request 以避免某些環境下對 "./" 的處理差異
      await cache.addAll(CORE_ASSETS.map((u) => new Request(u, { cache: "reload" })));
      // 讓新版 SW 立即進入等待狀態（下一步 activate 會接手）
      await self.skipWaiting();
    })()
  );
});

// --- activate：清掉舊版本快取 ---
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith(`${APP_NAME}-v`) && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      );
      // 立即接管所有 client
      await self.clients.claim();
    })()
  );
});

// --- fetch：
// 1) 導航請求：優先網路，失敗回 index.html（離線也能進）
// 2) 靜態檔：cache-first（快）+ 背景更新（可選）
// 3) 其他：network-first（比較安全）
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // 只處理同源（你自己的 GitHub Pages 網域 / 路徑）
  if (url.origin !== self.location.origin) return;

  // (A) 導航：進站/換頁
  const isNav =
    req.mode === "navigate" ||
    (req.headers.get("accept") || "").includes("text/html");

  if (isNav) {
    event.respondWith(
      (async () => {
        try {
          // 網路優先：確保你更新後能拿到最新 index.html
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE_NAME);
          cache.put("./index.html", fresh.clone());
          return fresh;
        } catch (e) {
          // 離線 fallback
          const cache = await caches.open(CACHE_NAME);
          const cached = await cache.match("./index.html");
          return cached || new Response("離線中，且尚未快取 index.html", { status: 503 });
        }
      })()
    );
    return;
  }

  // (B) 靜態檔：cache-first
  const isStatic =
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".webmanifest") ||
    url.pathname.endsWith(".json") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".jpg") ||
    url.pathname.endsWith(".jpeg") ||
    url.pathname.endsWith(".webp");

  if (isStatic) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const hit = await cache.match(req, { ignoreSearch: true });
        if (hit) return hit;

        try {
          const fresh = await fetch(req);
          // 只快取成功回應
          if (fresh && fresh.ok) cache.put(req, fresh.clone());
          return fresh;
        } catch (e) {
          return new Response("離線中，且尚未快取此資源", { status: 503 });
        }
      })()
    );
    return;
  }

  // (C) 其他：network-first
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) cache.put(req, fresh.clone());
        return fresh;
      } catch (e) {
        const hit = await cache.match(req, { ignoreSearch: true });
        return hit || new Response("離線中，且尚未快取此資源", { status: 503 });
      }
    })()
  );
});
