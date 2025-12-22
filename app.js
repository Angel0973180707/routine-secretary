/* =========================
作息秘書 v19｜完整 JS（修正「系統提醒」＋可調秒數/分鐘）
- HTML 不用改
- 目標：
  A) 內建倒數（在同一瀏覽器內切換到其他網頁/分頁，回來仍能續算、到點補提醒）
  B) 「用系統計時器」：提供清楚說明＋(Android 盡量用 intent 開內建計時器)＋同時在 PWA 記 endAt 做補提醒

你設定：
1) 微休息：預設 60 秒，可調
2) 護眼：20 分 / 20 秒（兩顆系統按鈕都保留）
3) 蕃茄：25/5 可調
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
  function nowMs() { return Date.now ? Date.now() : (+new Date()); }
  function uid(prefix) { return (prefix || "id") + "_" + nowMs() + "_" + Math.random().toString(16).slice(2); }
  function vibrate(ms) { try { if (navigator.vibrate) navigator.vibrate(ms || 60); } catch (e) {} }
  function escapeHtml(s) {
    s = safeText(s);
    return s.replace(/&/g, "&amp;")
      .replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
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

  /* ---------- Storage keys ---------- */
  var KB_KEY = "sleepSecretary_v19_kb";
  var REL_KEY = "sleepSecretary_v19_rel";
  var BDAY_KEY = "sleepSecretary_v19_bday";

  // v19：設定（可調）
  var CFG_KEY = "sleepSecretary_v19_cfg";
  var SYS_KEY = "sleepSecretary_v19_sysTimers"; // 用系統計時器時，我們自己也記一份 endAt 做補提醒

  function loadCfg() {
    var def = {
      microSec: 60,
      pomoFocusMin: 25,
      pomoBreakMin: 5
    };
    try {
      var raw = localStorage.getItem(CFG_KEY);
      if (!raw) return def;
      var obj = JSON.parse(raw);
      if (!obj || typeof obj !== "object") return def;
      return {
        microSec: clampInt(obj.microSec, 5, 60 * 10, def.microSec),
        pomoFocusMin: clampInt(obj.pomoFocusMin, 1, 180, def.pomoFocusMin),
        pomoBreakMin: clampInt(obj.pomoBreakMin, 1, 60, def.pomoBreakMin)
      };
    } catch (e) {
      return def;
    }
  }
  function saveCfg() {
    try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) {}
  }
  function clampInt(v, min, max, fallback) {
    var n = parseInt(v, 10);
    if (isNaN(n)) return fallback;
    n = Math.max(min, Math.min(max, n));
    return n;
  }
  var cfg = loadCfg();

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
     v19：通知與亮屏（沿用 v17）
  ========================================================== */
  var btnNotify = $("#btnNotify");
  var btnWake = $("#btnWake");
  var btnTestNotice = $("#btnTestNotice");
  var notifyStatus = $("#notifyStatus");
  var wakeStatus = $("#wakeStatus");

  var wakeLock = null;
  var wakeEnabled = false;

  function canNotify() { return ("Notification" in window); }
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

  async function showSystemNotification(title, body) {
    title = safeText(title || "作息秘書");
    body = safeText(body || "");
    if (!canNotify()) return false;
    if (Notification.permission !== "granted") return false;

    // PWA/背景：優先用 SW
    try {
      if ("serviceWorker" in navigator) {
        var reg = await navigator.serviceWorker.getRegistration();
        if (reg && reg.showNotification) {
          await reg.showNotification(title, {
            body: body,
            tag: "sleep-secretary-v19",
            renotify: true
          });
          return true;
        }
      }
    } catch (e) {}

    // 前景 fallback
    try {
      new Notification(title, { body: body, tag: "sleep-secretary-v19" });
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
      if (wakeStatus) wakeStatus.textContent = "保持亮屏：已啟用";
      wakeLock.addEventListener("release", function () {
        wakeEnabled = false;
        if (wakeStatus) wakeStatus.textContent = "保持亮屏：已釋放";
      });
      return true;
    } catch (e) {
      wakeEnabled = false;
      if (wakeStatus) wakeStatus.textContent = "保持亮屏：啟用失敗（需 HTTPS 或加入主畫面）";
      return false;
    }
  }
  async function disableWakeLock() {
    try { if (wakeLock) await wakeLock.release(); } catch (e) {}
    wakeLock = null;
    wakeEnabled = false;
    if (wakeStatus) wakeStatus.textContent = "保持亮屏：尚未保持亮屏";
  }
  async function ensureWakeWhileRunning(isRunning) {
    if (!isRunning) return;
    if (!wakeEnabled) return;
    if (!wakeLock) await enableWakeLock();
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
          await showSystemNotification("作息秘書 v19", "通知已啟用（測試成功）");
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

    document.addEventListener("visibilitychange", function () {
      if (!document.hidden && wakeEnabled && !wakeLock) enableWakeLock();
      setNotifyStatus();
      // 回到頁面：補檢查各種到點（含 system-mode）
      checkAllDue(true);
    });
    window.addEventListener("focus", function () {
      setNotifyStatus();
      checkAllDue(true);
    });
  }

  async function fireReminder(title, body, ttsText) {
    vibrate(120);
    ttsWarmup();
    speak(ttsText || title);
    await showSystemNotification(title, body);
  }

  /* ==========================================================
     v19：系統計時器（B）＋補提醒（跨機型最穩策略）
     - Android：盡量用 intent 開「設定計時器」
     - iPhone：提供明確操作說明
     - 同步在 PWA 內記 endAt -> 回到頁面一定補提醒
  ========================================================== */
  function isAndroid() { return /Android/i.test(navigator.userAgent || ""); }
  function isIOS() { return /iPhone|iPad|iPod/i.test(navigator.userAgent || ""); }

  function tryOpenAndroidTimer(seconds, label) {
    // Android Chrome 常見可用：SET_TIMER intent
    // 不保證所有機型/瀏覽器都會成功，因此「失敗也沒關係」：我們還有補提醒機制
    try {
      if (!isAndroid()) return false;
      seconds = Math.max(1, seconds | 0);
      label = safeText(label || "作息秘書");
      var msg = encodeURIComponent(label);
      var intentUrl =
        "intent:#Intent;action=android.intent.action.SET_TIMER;" +
        "S.android.intent.extra.alarm.MESSAGE=" + msg + ";" +
        "i.android.intent.extra.alarm.LENGTH=" + seconds + ";" +
        "B.android.intent.extra.alarm.SKIP_UI=false;end";
      window.location.href = intentUrl;
      return true;
    } catch (e) {
      return false;
    }
  }

  function sysLoad() {
    try {
      var raw = localStorage.getItem(SYS_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }
  function sysSave(arr) {
    try { localStorage.setItem(SYS_KEY, JSON.stringify(arr || [])); } catch (e) {}
  }
  function sysAddTimer(kind, endAtMs, title, body, ttsText) {
    var arr = sysLoad();
    arr.unshift({
      id: uid("sys"),
      kind: safeText(kind),
      endAt: endAtMs,
      title: safeText(title),
      body: safeText(body),
      tts: safeText(ttsText),
      fired: false,
      createdAt: nowISO()
    });
    // 保留最新 20 筆
    if (arr.length > 20) arr = arr.slice(0, 20);
    sysSave(arr);
  }
  async function sysCheckDue() {
    var arr = sysLoad();
    if (!arr.length) return;
    var t = nowMs();
    var changed = false;

    for (var i = 0; i < arr.length; i++) {
      var it = arr[i];
      if (it.fired) continue;
      if (!it.endAt) continue;
      if (t >= it.endAt) {
        it.fired = true;
        changed = true;
        await fireReminder(it.title || "時間到 ✅", it.body || "", it.tts || it.title || "時間到");
        openDlg("提醒 ⏰", "<p><b>" + escapeHtml(it.title || "時間到") + "</b></p><p>" + escapeHtml(it.body || "") + "</p>");
      }
    }
    if (changed) sysSave(arr);
  }

  function openSystemGuide(kind, seconds, label, desc, allowAdjust, adjustType) {
    // allowAdjust：是否可調；adjustType：'micro' | 'pomoFocus' | 'pomoBreak' | null
    seconds = Math.max(1, seconds | 0);

    // 記一份 endAt 做「補提醒」
    var endAt = nowMs() + seconds * 1000;
    var title = "⏰ " + safeText(label || "時間到");
    var body = safeText(desc || "提醒時間到了");
    var ttsText = safeText(label || "時間到");
    sysAddTimer(kind, endAt, title, body, ttsText);

    // 盡量開 Android 內建計時器
    if (isAndroid()) {
      // 先說明再跳（使用者心理比較穩）
      // 這裡不直接自動跳走，避免使用者覺得「怎麼跑掉」
      // 由使用者按「我現在去按內建計時器」再跳
    }

    var mm = Math.floor(seconds / 60);
    var ss = seconds % 60;
    var timeStr = (mm > 0) ? (mm + " 分 " + ss + " 秒") : (ss + " 秒");
    var copyText = (mm > 0) ? (pad2(mm) + ":" + pad2(ss)) : ("00:" + pad2(ss));

    var adjustBtnHtml = "";
    if (allowAdjust) {
      adjustBtnHtml =
        "<div style='margin-top:10px;display:flex;gap:10px;flex-wrap:wrap;'>" +
          "<button class='btnGhost' type='button' data-action='sys-adjust' data-adjust='" + escapeHtml(adjustType || "") + "'>調整預設</button>" +
        "</div>";
    }

    var androidBtnHtml =
      "<div style='margin-top:10px;display:flex;gap:10px;flex-wrap:wrap;'>" +
        "<button class='btnPrimary' type='button' data-action='open-android-timer' data-seconds='" + seconds + "' data-label='" + escapeHtml(label || "作息秘書") + "'>我現在去按「內建計時器」</button>" +
        "<button class='btnGhost' type='button' data-action='copy-text' data-copy='" + escapeHtml(copyText) + "'>複製 " + escapeHtml(copyText) + "</button>" +
      "</div>";

    var iosHint =
      "<p style='margin-top:10px;opacity:.92;line-height:1.6'>" +
      "📌 <b>iPhone</b>：請打開「時鐘 App → 計時器」，輸入 <b>" + escapeHtml(timeStr) + "</b>，按開始。<br>" +
      "（iOS 對背景通知限制較多，所以我們採用：<b>內建計時器最穩</b>＋你回到本頁一定補提醒。）" +
      "</p>";

    var andHint =
      "<p style='margin-top:10px;opacity:.92;line-height:1.6'>" +
      "📌 <b>Android</b>：按下方按鈕可嘗試直接開啟「設定計時器」。若手機/瀏覽器不支援，請手動打開「時鐘 App → 計時器」。" +
      "</p>";

    var commonHint =
      "<p style='margin-top:10px;opacity:.85;line-height:1.6'>" +
      "✅ 我已在作息秘書內也幫你記住這個到點時間。<br>" +
      "即使你去看別的網頁/分頁，<b>回到作息秘書時</b>也一定會補跳提醒（文字＋震動＋語音；通知權限若允許也會盡量送系統通知）。" +
      "</p>";

    var html =
      "<p><b>模式：</b>" + escapeHtml(label) + "</p>" +
      "<p><b>時間：</b>" + escapeHtml(timeStr) + "</p>" +
      "<p style='opacity:.9'>" + escapeHtml(desc || "") + "</p>" +
      (isAndroid() ? andHint : "") +
      (isIOS() ? iosHint : "") +
      androidBtnHtml +
      adjustBtnHtml +
      commonHint;

    openDlg("用系統計時器（最穩）", html);
  }

  function handleSysAdjust(type) {
    // 依你需求：微休息可調、蕃茄 25/5 可調（護眼固定 20 分/20 秒）
    if (type === "micro") {
      var v = prompt("微休息預設秒數（5～600 秒）", String(cfg.microSec));
      if (v == null) return;
      cfg.microSec = clampInt(v, 5, 600, cfg.microSec);
      saveCfg();
      // 同步更新內建倒數的 total（不強制重置倒數，避免打斷）
      micro.total = cfg.microSec;
      if (!micro.running) { micro.left = micro.total; microRender(); }
      openDlg("已更新 ✅", "<p>微休息預設已改為 <b>" + escapeHtml(String(cfg.microSec)) + " 秒</b>。</p>");
      return;
    }

    if (type === "pomo") {
      var f = prompt("蕃茄｜專注分鐘（1～180）", String(cfg.pomoFocusMin));
      if (f == null) return;
      var b = prompt("蕃茄｜休息分鐘（1～60）", String(cfg.pomoBreakMin));
      if (b == null) return;

      cfg.pomoFocusMin = clampInt(f, 1, 180, cfg.pomoFocusMin);
      cfg.pomoBreakMin = clampInt(b, 1, 60, cfg.pomoBreakMin);
      saveCfg();

      pomo.focusMin = cfg.pomoFocusMin;
      pomo.breakMin = cfg.pomoBreakMin;

      if (!pomo.running) {
        pomo.phase = "focus";
        pomo.left = pomo.focusMin * 60;
        pomoRender();
      }
      openDlg("已更新 ✅",
        "<p>蕃茄預設已更新：</p>" +
        "<p>專注：<b>" + escapeHtml(String(cfg.pomoFocusMin)) + " 分</b>　休息：<b>" + escapeHtml(String(cfg.pomoBreakMin)) + " 分</b></p>"
      );
      return;
    }
  }

  /* ---------- Install help（沿用） ---------- */
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
     Timers（v19：改成 endAt 模式，避免切換到其他網頁時失準）
     - 內建倒數：當頁面被背景節流，回來會用 endAt 自動校正
  ========================================================== */
  var microTimeEl = $("#microTime");
  var microHintEl = $("#microHint");
  var microStartBtn = $("#microStart");
  var microPauseBtn = $("#microPause");
  var microResetBtn = $("#microReset");
  var microSysBtn = $("#microSys");

  var eyeTimeEl = $("#eyeTime");
  var eyePhaseEl = $("#eyePhase");
  var eyeStartBtn = $("#eyeStart");
  var eyePauseBtn = $("#eyePause");
  var eyeResetBtn = $("#eyeReset");
  var eyeSysFocusBtn = $("#eyeSysFocus");
  var eyeSysRelaxBtn = $("#eyeSysRelax");

  var pomoTimeEl = $("#pomoTime");
  var pomoPhaseEl = $("#pomoPhase");
  var pomoStartBtn = $("#pomoStart");
  var pomoPauseBtn = $("#pomoPause");
  var pomoResetBtn = $("#pomoReset");
  var pomoSysBtn = $("#pomoSys");

  var micro = { total: cfg.microSec, left: cfg.microSec, running: false, t: null, endAt: 0 };
  var eye = { focusSec: 20 * 60, relaxSec: 20, phase: "focus", left: 20 * 60, running: false, t: null, endAt: 0 };
  var pomo = { focusMin: cfg.pomoFocusMin, breakMin: cfg.pomoBreakMin, phase: "focus", left: cfg.pomoFocusMin * 60, running: false, t: null, endAt: 0 };

  function calcLeftFromEndAt(endAtMs) {
    var diff = Math.ceil((endAtMs - nowMs()) / 1000);
    return Math.max(0, diff | 0);
  }

  function microRender() {
    if (microTimeEl) microTimeEl.textContent = fmtMMSS(micro.left);
    if (microHintEl) microHintEl.textContent = micro.running ? "進行中…" : "準備好了就開始（可調）";
  }

  async function microDone() {
    micro.left = 0;
    micro.running = false;
    micro.endAt = 0;
    if (micro.t) { clearInterval(micro.t); micro.t = null; }
    microRender();

    await fireReminder("微休息完成 ✅", "喝口水、放鬆肩頸。", "微休息結束，做得好。");
    openDlg("完成 ✅", "<p>微休息結束～喝口水、放鬆肩頸。</p>");
  }

  function microTick() {
    if (!micro.running) return;
    if (micro.endAt) micro.left = calcLeftFromEndAt(micro.endAt);
    else micro.left = Math.max(0, micro.left - 1);

    if (micro.left <= 0) { microDone(); return; }
    microRender();
  }

  async function microStart() {
    ttsWarmup();
    if (micro.running) return;

    micro.total = cfg.microSec;
    if (micro.left <= 0 || micro.left > micro.total) micro.left = micro.total;

    micro.running = true;
    micro.endAt = nowMs() + micro.left * 1000;

    await ensureWakeWhileRunning(true);
    if (!micro.t) micro.t = setInterval(microTick, 1000);
    microRender();
  }

  function microPause() {
    micro.running = false;
    if (micro.endAt) micro.left = calcLeftFromEndAt(micro.endAt);
    micro.endAt = 0;
    if (micro.t) { clearInterval(micro.t); micro.t = null; }
    microRender();
  }

  function microReset() {
    micro.running = false;
    micro.endAt = 0;
    if (micro.t) { clearInterval(micro.t); micro.t = null; }
    micro.total = cfg.microSec;
    micro.left = micro.total;
    microRender();
  }

  function bindMicro() {
    if (microStartBtn) microStartBtn.addEventListener("click", function (e) { e.preventDefault(); microStart(); });
    if (microPauseBtn) microPauseBtn.addEventListener("click", function (e) { e.preventDefault(); microPause(); });
    if (microResetBtn) microResetBtn.addEventListener("click", function (e) { e.preventDefault(); microReset(); });

    if (microSysBtn) {
      microSysBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        openSystemGuide(
          "micro",
          cfg.microSec,
          "微休息（系統）",
          "建議：喝口水、起身走兩步、放鬆肩頸。",
          true,
          "micro"
        );
      });
    }

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
      eye.endAt = nowMs() + eye.left * 1000;

      await fireReminder("護眼提醒 👁️", "請看遠 20 秒（約 6 公尺）。", "護眼提醒，請看遠二十秒。");
      openDlg("護眼提醒 👁️", "<p>看遠 20 呎（約 6 公尺）<br>持續 20 秒。</p>");
    } else {
      eye.phase = "focus";
      eye.left = eye.focusSec;
      eye.endAt = nowMs() + eye.left * 1000;
      await fireReminder("回到專注 ✅", "開始 20 分鐘。", "回到專注，開始二十分鐘。");
    }
    eyeRender();
  }

  function eyeTick() {
    if (!eye.running) return;
    if (eye.endAt) eye.left = calcLeftFromEndAt(eye.endAt);
    else eye.left = Math.max(0, eye.left - 1);

    if (eye.left <= 0) { eyeSwitchPhase(); return; }
    eyeRender();
  }

  async function eyeStart() {
    ttsWarmup();
    if (eye.running) return;

    eye.running = true;
    if (eye.left <= 0) {
      eye.phase = "focus";
      eye.left = eye.focusSec;
    }
    eye.endAt = nowMs() + eye.left * 1000;

    await ensureWakeWhileRunning(true);
    if (!eye.t) eye.t = setInterval(eyeTick, 1000);
    eyeRender();
  }

  function eyePause() {
    eye.running = false;
    if (eye.endAt) eye.left = calcLeftFromEndAt(eye.endAt);
    eye.endAt = 0;
    if (eye.t) { clearInterval(eye.t); eye.t = null; }
    eyeRender();
  }

  function eyeReset() {
    eye.running = false;
    eye.endAt = 0;
    if (eye.t) { clearInterval(eye.t); eye.t = null; }
    eye.phase = "focus";
    eye.left = eye.focusSec;
    eyeRender();
  }

  function bindEye() {
    if (eyeStartBtn) eyeStartBtn.addEventListener("click", function (e) { e.preventDefault(); eyeStart(); });
    if (eyePauseBtn) eyePauseBtn.addEventListener("click", function (e) { e.preventDefault(); eyePause(); });
    if (eyeResetBtn) eyeResetBtn.addEventListener("click", function (e) { e.preventDefault(); eyeReset(); });

    // v19：護眼「系統 20 分鐘」「系統 20 秒」兩顆按鈕都做成 B（系統）＋補提醒
    if (eyeSysFocusBtn) {
      eyeSysFocusBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        openSystemGuide(
          "eye_focus",
          20 * 60,
          "護眼 20 分鐘（系統）",
          "20 分鐘專注後，提醒你看遠 20 秒。",
          false,
          ""
        );
      });
    }
    if (eyeSysRelaxBtn) {
      eyeSysRelaxBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        openSystemGuide(
          "eye_relax",
          20,
          "護眼 看遠 20 秒（系統）",
          "看遠 20 呎（約 6 公尺），持續 20 秒。",
          false,
          ""
        );
      });
    }

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
      pomo.endAt = nowMs() + pomo.left * 1000;

      await fireReminder("番茄休息 🍅", "休息一下：喝水、伸展、走兩步。", "番茄鐘，進入休息時間。");
      openDlg("番茄休息 🍅", "<p>休息一下：喝水、伸展、走兩步。</p>");
    } else {
      pomo.phase = "focus";
      pomo.left = pomo.focusMin * 60;
      pomo.endAt = nowMs() + pomo.left * 1000;

      await fireReminder("番茄開始 🍅", "新一輪專注開始～", "番茄鐘，開始專注。");
      openDlg("番茄開始 🍅", "<p>新一輪專注開始～</p>");
    }
    pomoRender();
  }

  function pomoTick() {
    if (!pomo.running) return;
    if (pomo.endAt) pomo.left = calcLeftFromEndAt(pomo.endAt);
    else pomo.left = Math.max(0, pomo.left - 1);

    if (pomo.left <= 0) { pomoSwitchPhase(); return; }
    pomoRender();
  }

  async function pomoStart() {
    ttsWarmup();
    if (pomo.running) return;

    // 同步 cfg
    pomo.focusMin = cfg.pomoFocusMin;
    pomo.breakMin = cfg.pomoBreakMin;

    pomo.running = true;
    if (pomo.left <= 0) {
      pomo.phase = "focus";
      pomo.left = pomo.focusMin * 60;
    }
    pomo.endAt = nowMs() + pomo.left * 1000;

    await ensureWakeWhileRunning(true);
    if (!pomo.t) pomo.t = setInterval(pomoTick, 1000);
    pomoRender();
  }

  function pomoPause() {
    pomo.running = false;
    if (pomo.endAt) pomo.left = calcLeftFromEndAt(pomo.endAt);
    pomo.endAt = 0;
    if (pomo.t) { clearInterval(pomo.t); pomo.t = null; }
    pomoRender();
  }

  function pomoReset() {
    pomo.running = false;
    pomo.endAt = 0;
    if (pomo.t) { clearInterval(pomo.t); pomo.t = null; }
    pomo.phase = "focus";
    pomo.focusMin = cfg.pomoFocusMin;
    pomo.breakMin = cfg.pomoBreakMin;
    pomo.left = pomo.focusMin * 60;
    pomoRender();
  }

  function bindPomo() {
    if (pomoStartBtn) pomoStartBtn.addEventListener("click", function (e) { e.preventDefault(); pomoStart(); });
    if (pomoPauseBtn) pomoPauseBtn.addEventListener("click", function (e) { e.preventDefault(); pomoPause(); });
    if (pomoResetBtn) pomoResetBtn.addEventListener("click", function (e) { e.preventDefault(); pomoReset(); });

    if (pomoSysBtn) {
      pomoSysBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        var sec = cfg.pomoFocusMin * 60;
        openSystemGuide(
          "pomo_focus",
          sec,
          "蕃茄專注（系統）",
          "建議：專注 " + cfg.pomoFocusMin + " 分鐘，到點休息 " + cfg.pomoBreakMin + " 分鐘（可調）。",
          true,
          "pomo"
        );
      });
    }

    pomoRender();
  }

  /* ==========================================================
     v19：切到其他網頁/分頁 -> 回來自動校正 + 補提醒
  ========================================================== */
  async function checkTimerDue() {
    // 只做「補校正＋到點處理」，不做每秒 UI 更新（UI 仍靠各自 setInterval）
    if (micro.running && micro.endAt) {
      micro.left = calcLeftFromEndAt(micro.endAt);
      if (micro.left <= 0) { await microDone(); }
      else microRender();
    }
    if (eye.running && eye.endAt) {
      eye.left = calcLeftFromEndAt(eye.endAt);
      if (eye.left <= 0) { await eyeSwitchPhase(); }
      else eyeRender();
    }
    if (pomo.running && pomo.endAt) {
      pomo.left = calcLeftFromEndAt(pomo.endAt);
      if (pomo.left <= 0) { await pomoSwitchPhase(); }
      else pomoRender();
    }
  }

  async function checkAllDue(force) {
    // force 主要用在 visibilitychange/focus 時「立刻補檢查」
    await checkTimerDue();
    await sysCheckDue();
    if (force) {
      // 如果在背景被節流很久，可能漏掉一個 phase 切換，這裡再補一次（保守）
      await checkTimerDue();
    }
  }

  // 每 10 秒補檢查一次：避免 UI timer 被節流/停滯
  var dueTicker = null;
  function startDueTicker() {
    if (dueTicker) clearInterval(dueTicker);
    dueTicker = setInterval(function () { checkAllDue(false); }, 10000);
  }

  /* ==========================================================
     知識區 KB（沿用 v17，鍵名改 v19）
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
    lines.push("作息秘書 v19｜知識區匯出");
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
     關係滋養 REL（沿用 v17，鍵名改 v19）
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
    lines.push("作息秘書 v19｜關係滋養區匯出");
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
     生日提醒 BDAY（沿用 v17，鍵名改 v19）
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
  var bdayData = [];
  var bdayTicker = null;

  function normalizeMD(input) {
    input = safeText(input).trim();
    if (!input) return "";
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
  function bdayClearAll() { bdayData = []; bdaySave(); bdayRender(); }
  function bdayExport() {
    var lines = [];
    lines.push("作息秘書 v19｜生日提醒匯出");
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
  async function bdayCheckDue() {
    var md = todayMD();
    var hm = nowHM();
    if (!md || !hm) return;

    for (var i = 0; i < bdayData.length; i++) {
      var it = bdayData[i];
      if (it.md !== md) continue;
      if ((it.time || "09:00") !== hm) continue;

      var lockKey = "sleepSecretary_v19_bday_fired_" + md + "_" + hm + "_" + it.id;
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

    if (bdayTicker) clearInterval(bdayTicker);
    bdayTicker = setInterval(function () { bdayCheckDue(); }, 15000);

    bdayShowToday();
    bdayCheckDue();
  }

  /* ==========================================================
     Global click delegation
     - Tabs / Cards / Chips / 刪除
     - v19 新增：Dialog 裡的 action 按鈕（open-android-timer / copy-text / sys-adjust）
  ========================================================== */
  function bindGlobalDelegation() {
    document.addEventListener("click", function (e) {
      var t = e.target;
      ttsWarmup();

      // v19：Dialog actions
      var act = closest(t, "[data-action]");
      if (act) {
        var action = act.getAttribute("data-action");
        if (action === "open-android-timer") {
          e.preventDefault();
          var sec = parseInt(act.getAttribute("data-seconds") || "0", 10) || 0;
          var label = act.getAttribute("data-label") || "作息秘書";
          if (!tryOpenAndroidTimer(sec, label)) {
            speak("請手動打開手機時鐘的計時器。");
            openDlg("提示", "<p>這台裝置無法直接開啟內建計時器，請手動打開「時鐘 App → 計時器」。</p>");
          }
          return;
        }
        if (action === "copy-text") {
          e.preventDefault();
          var copy = act.getAttribute("data-copy") || "";
          try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(copy);
              speak("已複製。");
            } else {
              // fallback
              var ta = document.createElement("textarea");
              ta.value = copy;
              document.body.appendChild(ta);
              ta.select();
              document.execCommand("copy");
              document.body.removeChild(ta);
              speak("已複製。");
            }
          } catch (err) {
            openDlg("複製失敗", "<p>你的瀏覽器不允許自動複製。請手動複製：<b>" + escapeHtml(copy) + "</b></p>");
          }
          return;
        }
        if (action === "sys-adjust") {
          e.preventDefault();
          var type = act.getAttribute("data-adjust") || "";
          if (type === "micro") handleSysAdjust("micro");
          if (type === "pomo") handleSysAdjust("pomo");
          return;
        }
      }

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

      // REL chips
      var chip2 = closest(t, ".chip2[data-relfilter]");
      if (chip2) {
        e.preventDefault();
        relSetFilter(chip2.getAttribute("data-relfilter") || "全部");
        return;
      }

      // KB delete
      var kdel = closest(t, ".kbDel");
      if (kdel && kbList && kbList.contains(kdel) && !closest(kdel, ".relDel") && !closest(kdel, ".bdayDel")) {
        var itemEl = closest(kdel, ".kbItem");
        var id = itemEl ? itemEl.getAttribute("data-id") : "";
        if (id) { kbDelete(id); speak("已刪除。"); }
        return;
      }

      // REL delete
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

    setNotifyStatus();
    if (wakeStatus) wakeStatus.textContent = "保持亮屏：尚未保持亮屏";

    startDueTicker();
    checkAllDue(true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
