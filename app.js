/* =========================

作息秘書 v17｜完整 JS

- 承接 v16：Tabs / Cards / 三種計時器 / Dialog / 知識區 / 關係滋養 / 生日提醒

- v17 新增（方案2）：

1) 通知權限（Notification）

2) 系統通知發送（頁面/背景盡量）

3) 亮屏 Wake Lock（可選）

4) 到點：震動 + 通知 + 語音 + Dialog

========================= */

(function () {

"use strict";

/* ---------- Helpers ---------- */

function $(sel, root) { return (root || document).querySelector(sel); }

function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

function safeText(s) { return (s == null) ? "" : String(s); }

function pad2(n) { n = Math.max(0, n | 0); return (n < 10 ? "0" : "") + n; }

function fmtMMSS(totalSec) {

totalSec = Math.max(0, totalSec | 0);

var m = Math.floor(totalSec / 60);

var s = totalSec % 60;

return pad2(m) + ":" + pad2(s);

}

function nowISO() { try { return new Date().toISOString(); } catch (e) { return ""; } }

function uid(prefix) { return (prefix || "id") + "_" + Date.now() + "_" + Math.random().toString(16).slice(2); }

function vibrate(ms) { try { if (navigator.vibrate) navigator.vibrate(ms || 60); } catch (e) {} }

function escapeHtml(s) {

s = safeText(s);

return s.replace(/&/g, "&amp;")

.replace(/</g, "&lt;")

.replace(/>/g, "&gt;")

.replace(/"/g, "&quot;")

.replace(/'/g, "&#39;");

}

function closest(el, selector) {

if (!el) return null;

if (el.closest) return el.closest(selector);

while (el && el !== document) {

if (el.matches && el.matches(selector)) return el;

el = el.parentNode;

}

return null;

}

function ensureBtnType(el) {

try {

if (!el) return;

if (el.tagName && el.tagName.toLowerCase() === "button") {

if (!el.getAttribute("type")) el.setAttribute("type", "button");

}

} catch (e) {}

}

function ensureBtnTypesIn(root) {

var btns = $all("button", root || document);

for (var i = 0; i < btns.length; i++) ensureBtnType(btns[i]);

}

/* ---------- TTS ---------- */

function ttsWarmup() {

try {

if (!("speechSynthesis" in window) || !window.SpeechSynthesisUtterance) return;

window.speechSynthesis.getVoices();

} catch (e) {}

}

function speak(text) {

text = safeText(text).trim();

if (!text) return;

try {

if (!("speechSynthesis" in window) || !window.SpeechSynthesisUtterance) return;

try { window.speechSynthesis.cancel(); } catch (e) {}

var u = new SpeechSynthesisUtterance(text);

u.lang = "zh-TW";

u.rate = 1.0;

u.pitch = 1.0;

u.volume = 1.0;

window.speechSynthesis.speak(u);

} catch (e) {}

}

/* ---------- Dialog ---------- */

var dlg = $("#dlg");

var dlgTitle = $("#dlgTitle");

var dlgBody = $("#dlgBody");

var dlgOk = $("#dlgOk");

function openDlg(title, bodyHtml) {

if (!dlg) return;

if (dlgTitle) dlgTitle.textContent = safeText(title || "提示");

if (dlgBody) dlgBody.innerHTML = safeText(bodyHtml || "");

try {

if (typeof dlg.showModal === "function") dlg.showModal();

else dlg.setAttribute("open", "open");

} catch (e) {

dlg.setAttribute("open", "open");

}

}

function closeDlg() {

if (!dlg) return;

try {

if (typeof dlg.close === "function") dlg.close();

else dlg.removeAttribute("open");

} catch (e) {

dlg.removeAttribute("open");

}

}

function bindDialog() {

if (!dlgOk) return;

ensureBtnType(dlgOk);

dlgOk.onclick = null;

dlgOk.addEventListener("click", function () { closeDlg(); });

}

/* ---------- View switching ---------- */

var activeView = "home";

function setActiveView(viewName) {

viewName = safeText(viewName).trim() || "home";

activeView = viewName;

var tabs = $all(".tab");

for (var i = 0; i < tabs.length; i++) {

var t = tabs[i];

var v = t.getAttribute("data-view");

if (v === viewName) t.classList.add("active");

else t.classList.remove("active");

}

var views = $all(".view");

for (var j = 0; j < views.length; j++) {

var sec = views[j];

var isOn = (sec.id === "view-" + viewName);

if (isOn) sec.classList.add("active");

else sec.classList.remove("active");

}

try { window.scrollTo(0, 0); } catch (e) {}

}

/* ==========================================================

v17：通知與亮屏（方案2）

========================================================== */

var btnNotify = $("#btnNotify");

var btnWake = $("#btnWake");

var btnTestNotice = $("#btnTestNotice");

var notifyStatus = $("#notifyStatus");

var wakeStatus = $("#wakeStatus");

var wakeLock = null;

var wakeEnabled = false;

function canNotify() {

return ("Notification" in window);

}

function notifyStateText() {

if (!canNotify()) return "此瀏覽器不支援通知";

return "通知權限：" + Notification.permission;

}

function setNotifyStatus() {

if (!notifyStatus) return;

notifyStatus.textContent = notifyStateText();

}

async function requestNotifyPermission() {

if (!canNotify()) {

openDlg("不支援通知", "<p>此瀏覽器不支援 Notification。</p>");

return false;

}

try {

var p = await Notification.requestPermission();

setNotifyStatus();

if (p !== "granted") {

openDlg("未允許通知", "<p>你目前沒有允許通知。若要系統通知提醒，請到瀏覽器設定允許。</p>");

return false;

}

return true;

} catch (e) {

setNotifyStatus();

return false;

}

}

// 盡量用 service worker 的 showNotification（PWA/背景更有機會）

async function showSystemNotification(title, body) {

title = safeText(title || "作息秘書");

body = safeText(body || "");

if (!canNotify()) return false;

if (Notification.permission !== "granted") return false;

try {

if ("serviceWorker" in navigator) {

var reg = await navigator.serviceWorker.getRegistration();

if (reg && reg.showNotification) {

await reg.showNotification(title, {

body: body,

tag: "sleep-secretary-v17",

renotify: true

});

return true;

}

}

} catch (e) {}

// fallback：直接 new Notification（前景較穩）

try {

new Notification(title, { body: body, tag: "sleep-secretary-v17" });

return true;

} catch (e2) {}

return false;

}

async function enableWakeLock() {

try {

if (!("wakeLock" in navigator) || !navigator.wakeLock.request) {

openDlg("不支援亮屏", "<p>此瀏覽器不支援 Wake Lock。</p>");

return false;

}

wakeLock = await navigator.wakeLock.request("screen");

wakeEnabled = true;

if (wakeStatus) wakeStatus.textContent = "保持亮屏：已啟用（計時中更有感）";

wakeLock.addEventListener("release", function () {

wakeEnabled = false;

if (wakeStatus) wakeStatus.textContent = "保持亮屏：已釋放";

});

return true;

} catch (e) {

wakeEnabled = false;

if (wakeStatus) wakeStatus.textContent = "保持亮屏：啟用失敗（可能需要 HTTPS 或加入主畫面）";

return false;

}

}

async function disableWakeLock() {

try {

if (wakeLock) await wakeLock.release();

} catch (e) {}

wakeLock = null;

wakeEnabled = false;

if (wakeStatus) wakeStatus.textContent = "保持亮屏：尚未保持亮屏";

}

// 計時開始時若有啟用亮屏，就重新拿一次（避免被系統釋放）

async function ensureWakeWhileRunning(isRunning) {

if (!isRunning) return;

if (!wakeEnabled) return;

// 如果 wakeLock 被釋放了，嘗試再拿

if (!wakeLock) {

await enableWakeLock();

}

}

function bindNotifyWakeUI() {

setNotifyStatus();

if (btnNotify) {

ensureBtnType(btnNotify);

btnNotify.onclick = null;

btnNotify.addEventListener("click", async function () {

ttsWarmup();

var ok = await requestNotifyPermission();

if (ok) {

speak("已啟用通知。");

openDlg("完成 ✅", "<p>已啟用通知。到點會盡量用系統通知提醒。</p>");

await showSystemNotification("作息秘書 v17", "通知已啟用（測試成功）");

}

});

}

if (btnWake) {

ensureBtnType(btnWake);

btnWake.onclick = null;

btnWake.addEventListener("click", async function () {

ttsWarmup();

if (!wakeEnabled) {

await enableWakeLock();

if (wakeEnabled) speak("已保持亮屏。");

} else {

await disableWakeLock();

speak("已關閉保持亮屏。");

}

});

}

if (btnTestNotice) {

ensureBtnType(btnTestNotice);

btnTestNotice.onclick = null;

btnTestNotice.addEventListener("click", async function () {

ttsWarmup();

vibrate(80);

speak("測試提醒");

var ok = await showSystemNotification("作息秘書測試", "如果你看到這則通知，系統通知可用。");

openDlg("測試提醒", "<p>震動 ✅ 語音 ✅</p><p>系統通知：" + (ok ? "✅ 已送出" : "⚠️ 尚未允許或不支援") + "</p>");

});

}

// 畫面回來時，若之前開了 wake lock，嘗試保住

document.addEventListener("visibilitychange", function () {

if (!document.hidden && wakeEnabled && !wakeLock) {

enableWakeLock();

}

setNotifyStatus();

});

}

// 統一提醒（到點用）

async function fireReminder(title, body, ttsText) {

vibrate(120);

ttsWarmup();

speak(ttsText || title);

await showSystemNotification(title, body);

}

/* ---------- Install help ---------- */

var btnInstallHelp = $("#btnInstallHelp");

function bindInstallHelp() {

if (!btnInstallHelp) return;

ensureBtnType(btnInstallHelp);

btnInstallHelp.onclick = null;

btnInstallHelp.addEventListener("click", function (e) {

e.preventDefault();

var html =

"<p><b>Android（Chrome）</b><br>右上角「⋮」→ <b>加入主畫面</b></p>" +

"<p><b>iPhone（Safari）</b><br>分享按鈕 → <b>加入主畫面</b></p>" +

"<p style='opacity:.85'>小提醒：通知/亮屏在 HTTPS 與加入主畫面後通常更穩。</p>";

openDlg("安裝教學", html);

});

}

/* ==========================================================

Timers

========================================================== */

var microTimeEl = $("#microTime");

var microHintEl = $("#microHint");

var microStartBtn = $("#microStart");

var microPauseBtn = $("#microPause");

var microResetBtn = $("#microReset");

var eyeTimeEl = $("#eyeTime");

var eyePhaseEl = $("#eyePhase");

var eyeStartBtn = $("#eyeStart");

var eyePauseBtn = $("#eyePause");

var eyeResetBtn = $("#eyeReset");

var pomoTimeEl = $("#pomoTime");

var pomoPhaseEl = $("#pomoPhase");

var pomoStartBtn = $("#pomoStart");

var pomoPauseBtn = $("#pomoPause");

var pomoResetBtn = $("#pomoReset");

var micro = { total: 60, left: 60, running: false, t: null };

var eye = { focusSec: 20 * 60, relaxSec: 20, phase: "focus", left: 20 * 60, running: false, t: null };

var pomo = { focusMin: 25, breakMin: 5, phase: "focus", left: 25 * 60, running: false, t: null };

function microRender() {

if (microTimeEl) microTimeEl.textContent = fmtMMSS(micro.left);

if (microHintEl) microHintEl.textContent = micro.running ? "進行中…" : "準備好了就開始";

}

async function microDone() {

micro.left = 0;

micro.running = false;

if (micro.t) { clearInterval(micro.t); micro.t = null; }

microRender();

await fireReminder("微休息完成 ✅", "喝口水、放鬆肩頸。", "微休息結束，做得好。");

openDlg("完成 ✅", "<p>微休息結束～喝口水、放鬆肩頸。</p>");

}

function microTick() {

if (!micro.running) return;

micro.left -= 1;

if (micro.left <= 0) { microDone(); return; }

microRender();

}

async function microStart() {

ttsWarmup();

if (micro.running) return;

micro.running = true;

await ensureWakeWhileRunning(true);

if (!micro.t) micro.t = setInterval(microTick, 1000);

microRender();

}

function microPause() {

micro.running = false;

if (micro.t) { clearInterval(micro.t); micro.t = null; }

microRender();

}

function microReset() {

micro.running = false;

if (micro.t) { clearInterval(micro.t); micro.t = null; }

micro.left = micro.total;

microRender();

}

function bindMicro() {

if (microStartBtn) microStartBtn.addEventListener("click", function (e) { e.preventDefault(); microStart(); });

if (microPauseBtn) microPauseBtn.addEventListener("click", function (e) { e.preventDefault(); microPause(); });

if (microResetBtn) microResetBtn.addEventListener("click", function (e) { e.preventDefault(); microReset(); });

microRender();

}

function eyeRender() {

if (eyeTimeEl) eyeTimeEl.textContent = fmtMMSS(eye.left);

if (eyePhaseEl) eyePhaseEl.textContent = (eye.phase === "focus") ? "20 分鐘專注中" : "看遠 20 呎｜20 秒";

}

async function eyeSwitchPhase() {

if (eye.phase === "focus") {

eye.phase = "relax";

eye.left = eye.relaxSec;

await fireReminder("護眼提醒 👁️", "請看遠 20 秒（約 6 公尺）。", "護眼提醒，請看遠二十秒。");

openDlg("護眼提醒 👁️", "<p>看遠 20 呎（約 6 公尺）<br>持續 20 秒。</p>");

} else {

eye.phase = "focus";

eye.left = eye.focusSec;

await fireReminder("回到專注 ✅", "開始 20 分鐘。", "回到專注，開始二十分鐘。");

}

eyeRender();

}

function eyeTick() {

if (!eye.running) return;

eye.left -= 1;

if (eye.left <= 0) { eyeSwitchPhase(); return; }

eyeRender();

}

async function eyeStart() {

ttsWarmup();

if (eye.running) return;

eye.running = true;

await ensureWakeWhileRunning(true);

if (!eye.t) eye.t = setInterval(eyeTick, 1000);

eyeRender();

}

function eyePause() {

eye.running = false;

if (eye.t) { clearInterval(eye.t); eye.t = null; }

eyeRender();

}

function eyeReset() {

eye.running = false;

if (eye.t) { clearInterval(eye.t); eye.t = null; }

eye.phase = "focus";

eye.left = eye.focusSec;

eyeRender();

}

function bindEye() {

if (eyeStartBtn) eyeStartBtn.addEventListener("click", function (e) { e.preventDefault(); eyeStart(); });

if (eyePauseBtn) eyePauseBtn.addEventListener("click", function (e) { e.preventDefault(); eyePause(); });

if (eyeResetBtn) eyeResetBtn.addEventListener("click", function (e) { e.preventDefault(); eyeReset(); });

eyeRender();

}

function pomoRender() {

if (pomoTimeEl) pomoTimeEl.textContent = fmtMMSS(pomo.left);

if (pomoPhaseEl) pomoPhaseEl.textContent = (pomo.phase === "focus") ? "專注中" : "休息中";

}

async function pomoSwitchPhase() {

if (pomo.phase === "focus") {

pomo.phase = "break";

pomo.left = pomo.breakMin * 60;

await fireReminder("番茄休息 🍅", "休息一下：喝水、伸展、走兩步。", "番茄鐘，進入休息時間。");

openDlg("番茄休息 🍅", "<p>休息一下：喝水、伸展、走兩步。</p>");

} else {

pomo.phase = "focus";

pomo.left = pomo.focusMin * 60;

await fireReminder("番茄開始 🍅", "新一輪專注開始～", "番茄鐘，開始專注。");

openDlg("番茄開始 🍅", "<p>新一輪專注開始～</p>");

}

pomoRender();

}

function pomoTick() {

if (!pomo.running) return;

pomo.left -= 1;

if (pomo.left <= 0) { pomoSwitchPhase(); return; }

pomoRender();

}

async function pomoStart() {

ttsWarmup();

if (pomo.running) return;

pomo.running = true;

await ensureWakeWhileRunning(true);

if (!pomo.t) pomo.t = setInterval(pomoTick, 1000);

pomoRender();

}

function pomoPause() {

pomo.running = false;

if (pomo.t) { clearInterval(pomo.t); pomo.t = null; }

pomoRender();

}

function pomoReset() {

pomo.running = false;

if (pomo.t) { clearInterval(pomo.t); pomo.t = null; }

pomo.phase = "focus";

pomo.left = pomo.focusMin * 60;

pomoRender();

}

function bindPomo() {

if (pomoStartBtn) pomoStartBtn.addEventListener("click", function (e) { e.preventDefault(); pomoStart(); });

if (pomoPauseBtn) pomoPauseBtn.addEventListener("click", function (e) { e.preventDefault(); pomoPause(); });

if (pomoResetBtn) pomoResetBtn.addEventListener("click", function (e) { e.preventDefault(); pomoReset(); });

pomoRender();

}

/* ==========================================================

Storage keys

========================================================== */

var KB_KEY = "sleepSecretary_v17_kb";

var REL_KEY = "sleepSecretary_v17_rel";

var BDAY_KEY = "sleepSecretary_v17_bday";

/* ==========================================================

知識區 KB

========================================================== */

var kbForm = $("#kbForm");

var kbCat = $("#kbCat");

var kbTitle = $("#kbTitle");

var kbText = $("#kbText");

var kbList = $("#kbList");

var kbEmpty = $("#kbEmpty");

var kbExportBtn = $("#kbExport");

var kbClearBtn = $("#kbClear");

var kbData = [];

var kbFilter = "全部";

function kbLoad() {

kbData = [];

try {

var raw = localStorage.getItem(KB_KEY);

if (!raw) return;

var arr = JSON.parse(raw);

if (Array.isArray(arr)) kbData = arr;

} catch (e) { kbData = []; }

}

function kbSave() { try { localStorage.setItem(KB_KEY, JSON.stringify(kbData)); } catch (e) {} }

function kbMatchesFilter(item) {

if (kbFilter === "全部") return true;

return item && item.cat === kbFilter;

}

function kbRender() {

if (!kbList || !kbEmpty) return;

kbList.innerHTML = "";

var shown = 0;

for (var i = 0; i < kbData.length; i++) {

var it = kbData[i];

if (!kbMatchesFilter(it)) continue;

shown++;

var row = document.createElement("div");

row.className = "kbItem";

row.setAttribute("data-id", it.id);

var metaWrap = document.createElement("div");

metaWrap.className = "kbMeta";

var cat = document.createElement("div");

cat.className = "kbCat";

cat.textContent = safeText(it.cat);

var title = document.createElement("div");

title.className = "kbTitle";

title.textContent = safeText(it.title);

var text = document.createElement("div");

text.className = "kbText";

text.textContent = safeText(it.text);

metaWrap.appendChild(cat);

metaWrap.appendChild(title);

metaWrap.appendChild(text);

var right = document.createElement("div");

right.className = "kbRight";

var time = document.createElement("div");

time.className = "kbTime";

time.textContent = it.createdAt ? safeText(it.createdAt).slice(0, 19).replace("T", " ") : "";

var del = document.createElement("button");

del.className = "kbDel";

del.type = "button";

del.textContent = "刪除";

right.appendChild(time);

right.appendChild(del);

row.appendChild(metaWrap);

row.appendChild(right);

kbList.appendChild(row);

}

kbEmpty.style.display = (shown === 0) ? "block" : "none";

}

function kbSetFilter(name) {

kbFilter = safeText(name) || "全部";

var chips = $all(".chip");

for (var i = 0; i < chips.length; i++) {

var c = chips[i];

var f = c.getAttribute("data-filter") || "全部";

if (f === kbFilter) c.classList.add("active");

else c.classList.remove("active");

}

kbRender();

}

function kbAdd(cat, title, text) {

var item = {

id: uid("kb"),

cat: safeText(cat).trim() || "筆記",

title: safeText(title).trim() || "（無標題）",

text: safeText(text).trim() || "",

createdAt: nowISO()

};

kbData.unshift(item);

kbSave();

kbRender();

}

function kbDelete(id) {

id = safeText(id);

var next = [];

for (var i = 0; i < kbData.length; i++) if (kbData[i].id !== id) next.push(kbData[i]);

kbData = next;

kbSave();

kbRender();

}

function kbClearAll() { kbData = []; kbSave(); kbRender(); }

function kbExport() {

var lines = [];

lines.push("作息秘書 v17｜知識區匯出");

lines.push("篩選：" + kbFilter);

lines.push("------");

for (var i = 0; i < kbData.length; i++) {

var it = kbData[i];

if (!kbMatchesFilter(it)) continue;

lines.push("【" + it.cat + "】" + it.title);

lines.push(it.text);

lines.push("");

}

var out = lines.join("\n");

openDlg("匯出內容（可全選複製）",

"<textarea style='width:100%;min-height:240px;border-radius:14px;padding:12px;box-sizing:border-box;'>" +

escapeHtml(out) +

"</textarea>"

);

}

function bindKB() {

kbLoad();

kbSetFilter("全部");

if (kbForm) {

kbForm.onsubmit = null;

kbForm.addEventListener("submit", function (e) {

e.preventDefault();

ttsWarmup();

var cat = kbCat ? kbCat.value : "筆記";

var title = kbTitle ? kbTitle.value : "";

var text = kbText ? kbText.value : "";

if (!safeText(title).trim() && !safeText(text).trim()) {

speak("請輸入標題或內容。");

openDlg("提醒", "<p>請至少輸入「標題」或「內容」。</p>");

return;

}

kbAdd(cat, title, text);

speak("已新增一筆。");

if (kbTitle) kbTitle.value = "";

if (kbText) kbText.value = "";

try { kbTitle && kbTitle.focus(); } catch (err) {}

});

}

if (kbExportBtn) kbExportBtn.addEventListener("click", function (e) {

e.preventDefault();

ttsWarmup();

kbExport();

});

if (kbClearBtn) kbClearBtn.addEventListener("click", function (e) {

e.preventDefault();

ttsWarmup();

if (kbData.length === 0) {

openDlg("提示", "<p>目前沒有資料可清空。</p>");

return;

}

openDlg("確認清空？",

"<p>這會清空所有知識區資料（永久）。</p>" +

"<p style='opacity:.8'>若要先備份，請先按「匯出」。</p>"

);

dlgOk.onclick = null;

dlgOk.addEventListener("click", function handler() {

dlgOk.removeEventListener("click", handler);

closeDlg();

kbClearAll();

speak("已清空。");

bindDialog();

});

});

kbRender();

}

/* ==========================================================

關係滋養 REL

========================================================== */

var relForm = $("#relForm");

var relCat = $("#relCat");

var relTitle = $("#relTitle");

var relText = $("#relText");

var relFreq = $("#relFreq");

var relList = $("#relList");

var relEmpty = $("#relEmpty");

var relExportBtn = $("#relExport");

var relClearBtn = $("#relClear");

var relData = [];

var relFilter = "全部";

function relLoad() {

relData = [];

try {

var raw = localStorage.getItem(REL_KEY);

if (!raw) return;

var arr = JSON.parse(raw);

if (Array.isArray(arr)) relData = arr;

} catch (e) { relData = []; }

}

function relSave() { try { localStorage.setItem(REL_KEY, JSON.stringify(relData)); } catch (e) {} }

function relMatchesFilter(item) {

if (relFilter === "全部") return true;

return item && item.cat === relFilter;

}

function relRender() {

if (!relList || !relEmpty) return;

relList.innerHTML = "";

var shown = 0;

for (var i = 0; i < relData.length; i++) {

var it = relData[i];

if (!relMatchesFilter(it)) continue;

shown++;

var row = document.createElement("div");

row.className = "kbItem";

row.setAttribute("data-id", it.id);

var metaWrap = document.createElement("div");

metaWrap.className = "kbMeta";

var cat = document.createElement("div");

cat.className = "kbCat";

cat.textContent = safeText(it.cat) + (it.freq ? ("｜" + it.freq) : "");

var title = document.createElement("div");

title.className = "kbTitle";

title.textContent = safeText(it.title);

var text = document.createElement("div");

text.className = "kbText";

text.textContent = safeText(it.text);

metaWrap.appendChild(cat);

metaWrap.appendChild(title);

metaWrap.appendChild(text);

var right = document.createElement("div");

right.className = "kbRight";

var time = document.createElement("div");

time.className = "kbTime";

time.textContent = it.createdAt ? safeText(it.createdAt).slice(0, 19).replace("T", " ") : "";

var del = document.createElement("button");

del.className = "kbDel relDel";

del.type = "button";

del.textContent = "刪除";

right.appendChild(time);

right.appendChild(del);

row.appendChild(metaWrap);

row.appendChild(right);

relList.appendChild(row);

}

relEmpty.style.display = (shown === 0) ? "block" : "none";

}

function relSetFilter(name) {

relFilter = safeText(name) || "全部";

var chips = $all(".chip2[data-relfilter]");

for (var i = 0; i < chips.length; i++) {

var c = chips[i];

var f = c.getAttribute("data-relfilter") || "全部";

if (f === relFilter) c.classList.add("active");

else c.classList.remove("active");

}

relRender();

}

function relAdd(cat, title, text, freq) {

var item = {

id: uid("rel"),

cat: safeText(cat).trim() || "自己",

title: safeText(title).trim() || "（無標題）",

text: safeText(text).trim() || "",

freq: safeText(freq).trim() || "今天",

createdAt: nowISO()

};

relData.unshift(item);

relSave();

relRender();

}

function relDelete(id) {

id = safeText(id);

var next = [];

for (var i = 0; i < relData.length; i++) if (relData[i].id !== id) next.push(relData[i]);

relData = next;

relSave();

relRender();

}

function relClearAll() { relData = []; relSave(); relRender(); }

function relExport() {

var lines = [];

lines.push("作息秘書 v17｜關係滋養區匯出");

lines.push("篩選：" + relFilter);

lines.push("------");

for (var i = 0; i < relData.length; i++) {

var it = relData[i];

if (!relMatchesFilter(it)) continue;

lines.push("【" + it.cat + "｜" + (it.freq || "") + "】" + it.title);

lines.push(it.text);

lines.push("");

}

var out = lines.join("\n");

openDlg("匯出內容（可全選複製）",

"<textarea style='width:100%;min-height:240px;border-radius:14px;padding:12px;box-sizing:border-box;'>" +

escapeHtml(out) +

"</textarea>"

);

}

function bindREL() {

relLoad();

relSetFilter("全部");

if (relForm) {

relForm.onsubmit = null;

relForm.addEventListener("submit", function (e) {

e.preventDefault();

ttsWarmup();

var cat = relCat ? relCat.value : "自己";

var title = relTitle ? relTitle.value : "";

var text = relText ? relText.value : "";

var freq = relFreq ? relFreq.value : "今天";

if (!safeText(title).trim() && !safeText(text).trim()) {

speak("請輸入標題或內容。");

openDlg("提醒", "<p>請至少輸入「一句話/目標」或「練習/行動」。</p>");

return;

}

relAdd(cat, title, text, freq);

speak("已新增一則關係滋養。");

if (relTitle) relTitle.value = "";

if (relText) relText.value = "";

try { relTitle && relTitle.focus(); } catch (err) {}

});

}

if (relExportBtn) relExportBtn.addEventListener("click", function (e) {

e.preventDefault();

ttsWarmup();

relExport();

});

if (relClearBtn) relClearBtn.addEventListener("click", function (e) {

e.preventDefault();

ttsWarmup();

if (relData.length === 0) {

openDlg("提示", "<p>目前沒有資料可清空。</p>");

return;

}

openDlg("確認清空？",

"<p>這會清空所有關係滋養資料（永久）。</p>" +

"<p style='opacity:.8'>若要先備份，請先按「匯出」。</p>"

);

dlgOk.onclick = null;

dlgOk.addEventListener("click", function handler() {

dlgOk.removeEventListener("click", handler);

closeDlg();

relClearAll();

speak("已清空。");

bindDialog();

});

});

relRender();

}

/* ==========================================================

生日提醒 BDAY（v17：記住時間+訊息，到點提醒）

========================================================== */

var bdayForm = $("#bdayForm");

var bdayName = $("#bdayName");

var bdayDate = $("#bdayDate");

var bdayTime = $("#bdayTime");

var bdayMsg = $("#bdayMsg");

var bdayList = $("#bdayList");

var bdayEmpty = $("#bdayEmpty");

var bdayTodayBox = $("#bdayToday");

var bdayClearBtn = $("#bdayClear");

var bdayExportBtn = $("#bdayExport");

var bdayData = []; // [{id,name,md,time,msg,createdAt}]

function normalizeMD(input) {

input = safeText(input).trim();

if (!input) return "";

var m = null;

var a = input.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);

if (a) return pad2(parseInt(a[2], 10)) + "-" + pad2(parseInt(a[3], 10));

var b = input.match(/^(\d{1,2})[-\/](\d{1,2})$/);

if (b) return pad2(parseInt(b[1], 10)) + "-" + pad2(parseInt(b[2], 10));

return "";

}

function todayMD() {

try {

var d = new Date();

return pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());

} catch (e) { return ""; }

}

function nowHM() {

try {

var d = new Date();

return pad2(d.getHours()) + ":" + pad2(d.getMinutes());

} catch (e) { return ""; }

}

function bdayLoad() {

bdayData = [];

try {

var raw = localStorage.getItem(BDAY_KEY);

if (!raw) return;

var arr = JSON.parse(raw);

if (Array.isArray(arr)) bdayData = arr;

} catch (e) { bdayData = []; }

}

function bdaySave() { try { localStorage.setItem(BDAY_KEY, JSON.stringify(bdayData)); } catch (e) {} }

function bdayRender() {

if (!bdayList || !bdayEmpty) return;

bdayList.innerHTML = "";

var shown = 0;

for (var i = 0; i < bdayData.length; i++) {

var it = bdayData[i];

shown++;

var row = document.createElement("div");

row.className = "kbItem";

row.setAttribute("data-id", it.id);

var metaWrap = document.createElement("div");

metaWrap.className = "kbMeta";

var cat = document.createElement("div");

cat.className = "kbCat";

cat.textContent = "🎂 " + safeText(it.md) + (it.time ? ("｜" + it.time) : "");

var title = document.createElement("div");

title.className = "kbTitle";

title.textContent = safeText(it.name);

var text = document.createElement("div");

text.className = "kbText";

text.textContent = safeText(it.msg || "");

metaWrap.appendChild(cat);

metaWrap.appendChild(title);

metaWrap.appendChild(text);

var right = document.createElement("div");

right.className = "kbRight";

var time = document.createElement("div");

time.className = "kbTime";

time.textContent = it.createdAt ? safeText(it.createdAt).slice(0, 19).replace("T", " ") : "";

var del = document.createElement("button");

del.className = "kbDel bdayDel";

del.type = "button";

del.textContent = "刪除";

right.appendChild(time);

right.appendChild(del);

row.appendChild(metaWrap);

row.appendChild(right);

bdayList.appendChild(row);

}

bdayEmpty.style.display = (shown === 0) ? "block" : "none";

bdayShowToday();

}

function bdayAdd(name, md, time, msg) {

var item = {

id: uid("bd"),

name: safeText(name).trim() || "（未命名）",

md: safeText(md).trim(),

time: safeText(time).trim() || "09:00",

msg: safeText(msg).trim() || "記得祝福",

createdAt: nowISO()

};

bdayData.unshift(item);

bdaySave();

bdayRender();

}

function bdayDelete(id) {

id = safeText(id);

var next = [];

for (var i = 0; i < bdayData.length; i++) if (bdayData[i].id !== id) next.push(bdayData[i]);

bdayData = next;

bdaySave();

bdayRender();

}

function bdayClearAll() {

bdayData = [];

bdaySave();

bdayRender();

}

function bdayExport() {

var lines = [];

lines.push("作息秘書 v17｜生日提醒匯出");

lines.push("------");

for (var i = 0; i < bdayData.length; i++) {

var it = bdayData[i];

lines.push("【" + it.md + " " + (it.time || "") + "】" + it.name);

lines.push(it.msg || "");

lines.push("");

}

var out = lines.join("\n");

openDlg("匯出內容（可全選複製）",

"<textarea style='width:100%;min-height:240px;border-radius:14px;padding:12px;box-sizing:border-box;'>" +

escapeHtml(out) +

"</textarea>"

);

}

function bdayShowToday() {

if (!bdayTodayBox) return;

var md = todayMD();

if (!md) return;

var names = [];

for (var i = 0; i < bdayData.length; i++) {

if (bdayData[i].md === md) names.push(bdayData[i].name);

}

if (names.length) {

bdayTodayBox.style.display = "block";

bdayTodayBox.innerHTML = "🎂 今天 " + escapeHtml(md) + "：<b>" + escapeHtml(names.join("、")) + "</b>";

} else {

bdayTodayBox.style.display = "none";

bdayTodayBox.innerHTML = "";

}

}

// v17：到點提醒（每日一次鎖）

var bdayTicker = null;

async function bdayCheckDue() {

var md = todayMD();

var hm = nowHM();

if (!md || !hm) return;

for (var i = 0; i < bdayData.length; i++) {

var it = bdayData[i];

if (it.md !== md) continue;

if ((it.time || "09:00") !== hm) continue;

var lockKey = "sleepSecretary_v17_bday_fired_" + md + "_" + hm + "_" + it.id;

try {

if (localStorage.getItem(lockKey)) continue;

localStorage.setItem(lockKey, "1");

} catch (e) {}

var title = "🎂 生日提醒：" + it.name;

var body = it.msg || "記得祝福";

await fireReminder(title, body, "今天是 " + it.name + " 的生日。記得祝福。");

openDlg("生日提醒 🎂", "<p><b>" + escapeHtml(it.name) + "</b></p><p>" + escapeHtml(body) + "</p>");

}

}

function bindBDAY() {

bdayLoad();

bdayRender();

if (bdayForm) {

bdayForm.onsubmit = null;

bdayForm.addEventListener("submit", function (e) {

e.preventDefault();

ttsWarmup();

var name = bdayName ? bdayName.value : "";

var dateVal = bdayDate ? bdayDate.value : "";

var timeVal = bdayTime ? bdayTime.value : "09:00";

var msgVal = bdayMsg ? bdayMsg.value : "";

var md = normalizeMD(dateVal);

if (!safeText(name).trim()) {

speak("請輸入姓名。");

openDlg("提醒", "<p>請輸入「對象」。</p>");

return;

}

if (!md) {

speak("請輸入日期。");

openDlg("提醒", "<p>請輸入生日日期。</p>");

return;

}

bdayAdd(name, md, timeVal, msgVal);

speak("已新增生日提醒。");

if (bdayName) bdayName.value = "";

if (bdayDate) bdayDate.value = "";

if (bdayMsg) bdayMsg.value = "";

try { bdayName && bdayName.focus(); } catch (err) {}

});

}

if (bdayExportBtn) bdayExportBtn.addEventListener("click", function (e) {

e.preventDefault();

ttsWarmup();

bdayExport();

});

if (bdayClearBtn) bdayClearBtn.addEventListener("click", function (e) {

e.preventDefault();

ttsWarmup();

if (bdayData.length === 0) {

openDlg("提示", "<p>目前沒有資料可清空。</p>");

return;

}

openDlg("確認清空？", "<p>這會清空所有生日提醒（永久）。</p>");

dlgOk.onclick = null;

dlgOk.addEventListener("click", function handler() {

dlgOk.removeEventListener("click", handler);

closeDlg();

bdayClearAll();

speak("已清空。");

bindDialog();

});

});

// ticker：每 15 秒檢查一次（在 app 開著、螢幕亮著時較穩）

if (bdayTicker) clearInterval(bdayTicker);

bdayTicker = setInterval(function () { bdayCheckDue(); }, 15000);

bdayShowToday();

bdayCheckDue();

}

/* ==========================================================

Global click delegation

========================================================== */

function bindGlobalDelegation() {

document.addEventListener("click", function (e) {

var t = e.target;

ttsWarmup();

// Tabs

var tab = closest(t, ".tab[data-view]");

if (tab) {

e.preventDefault();

setActiveView(tab.getAttribute("data-view") || "home");

return;

}

// Cards

var card = closest(t, ".card[data-jump]");

if (card) {

e.preventDefault();

setActiveView(card.getAttribute("data-jump") || "home");

return;

}

// KB chips

var chip = closest(t, ".chip[data-filter]");

if (chip) {

e.preventDefault();

kbSetFilter(chip.getAttribute("data-filter") || "全部");

return;

}

// REL chips (chip2)

var chip2 = closest(t, ".chip2[data-relfilter]");

if (chip2) {

e.preventDefault();

relSetFilter(chip2.getAttribute("data-relfilter") || "全部");

return;

}

// KB delete

var kdel = closest(t, ".kbDel");

if (kdel && kbList && kbList.contains(kdel)) {

var itemEl = closest(kdel, ".kbItem");

var id = itemEl ? itemEl.getAttribute("data-id") : "";

if (id) { kbDelete(id); speak("已刪除。"); }

return;

}

// REL delete（我們用 kbItem 統一，relDel 標記）

var rdel = closest(t, ".relDel");

if (rdel && relList && relList.contains(rdel)) {

var rEl = closest(rdel, ".kbItem");

var rid = rEl ? rEl.getAttribute("data-id") : "";

if (rid) { relDelete(rid); speak("已刪除。"); }

return;

}

// BDAY delete

var bdel = closest(t, ".bdayDel");

if (bdel && bdayList && bdayList.contains(bdel)) {

var bEl = closest(bdel, ".kbItem");

var bid = bEl ? bEl.getAttribute("data-id") : "";

if (bid) { bdayDelete(bid); speak("已刪除。"); }

return;

}

}, false);

}

/* ==========================================================

Service Worker（讓通知更穩）

========================================================== */

function registerSW() {

if (!("serviceWorker" in navigator)) return;

// 你把 sw.js 放在同層即可

navigator.serviceWorker.register("./sw.js").catch(function () {});

}

/* ---------- Init ---------- */

function init() {

ensureBtnTypesIn(document);

bindDialog();

bindInstallHelp();

bindNotifyWakeUI();

bindGlobalDelegation();

bindMicro();

bindEye();

bindPomo();

bindKB();

bindREL();

bindBDAY();

setActiveView("home");

registerSW();

// 進入頁面先更新狀態字

setNotifyStatus();

if (wakeStatus) wakeStatus.textContent = "保持亮屏：尚未保持亮屏";

}

if (document.readyState === "loading") {

document.addEventListener("DOMContentLoaded", init);

} else {

init();

}
})();
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
