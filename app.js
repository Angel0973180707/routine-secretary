/* =========================
作息秘書 v19.1｜ES5 相容加強版 JS（免改 HTML）
- 不用 async/await
- 不用模板字串 `...`
- 先救「按鈕可動」與「倒數可用」
========================= */

(function () {
  "use strict";

  /* ---------- tiny helpers ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function txt(v) { return (v == null) ? "" : String(v); }
  function pad2(n) { n = Math.max(0, n | 0); return (n < 10 ? "0" : "") + n; }
  function fmtMMSS(sec) {
    sec = Math.max(0, sec | 0);
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return pad2(m) + ":" + pad2(s);
  }
  function escapeHtml(s) {
    s = txt(s);
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
  function ensureBtnType(btn) {
    try {
      if (!btn) return;
      if (btn.tagName && btn.tagName.toLowerCase() === "button") {
        if (!btn.getAttribute("type")) btn.setAttribute("type", "button");
      }
    } catch (e) {}
  }
  function ensureAllButtonsType() {
    var bs = $all("button");
    for (var i = 0; i < bs.length; i++) ensureBtnType(bs[i]);
  }

  /* ---------- platform ---------- */
  var UA = navigator.userAgent || "";
  var IS_IOS = /iPad|iPhone|iPod/i.test(UA) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var IS_ANDROID = /Android/i.test(UA);

  /* ---------- TTS / vibrate ---------- */
  function vibrate(ms) { try { if (navigator.vibrate) navigator.vibrate(ms || 80); } catch (e) {} }
  function speak(s) {
    s = txt(s).trim();
    if (!s) return;
    try {
      if (!("speechSynthesis" in window) || !window.SpeechSynthesisUtterance) return;
      try { window.speechSynthesis.cancel(); } catch (e) {}
      var u = new SpeechSynthesisUtterance(s);
      u.lang = "zh-TW";
      u.rate = 1.0;
      window.speechSynthesis.speak(u);
    } catch (e2) {}
  }

  /* ---------- dialog ---------- */
  var dlg = $("#dlg");
  var dlgTitle = $("#dlgTitle");
  var dlgBody = $("#dlgBody");
  var dlgOk = $("#dlgOk");

  function openDlg(title, bodyHtml) {
    if (!dlg) return;
    if (dlgTitle) dlgTitle.textContent = txt(title || "提示");
    if (dlgBody) dlgBody.innerHTML = txt(bodyHtml || "");
    try {
      if (dlg.showModal) dlg.showModal();
      else dlg.setAttribute("open", "open");
    } catch (e) {
      try { dlg.setAttribute("open", "open"); } catch (e2) {}
    }
  }
  function closeDlg() {
    if (!dlg) return;
    try {
      if (dlg.close) dlg.close();
      else dlg.removeAttribute("open");
    } catch (e) {
      try { dlg.removeAttribute("open"); } catch (e2) {}
    }
  }
  function bindDlgOkDefault() {
    if (!dlgOk) return;
    ensureBtnType(dlgOk);
    dlgOk.onclick = function () { closeDlg(); };
  }

  /* ---------- view switch ---------- */
  function setActiveView(viewName) {
    viewName = txt(viewName).trim() || "home";

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
      var on = (sec.id === "view-" + viewName);
      if (on) sec.classList.add("active");
      else sec.classList.remove("active");
    }

    try { window.scrollTo(0, 0); } catch (e) {}
  }

  /* ---------- notification (front-only, ES5) ---------- */
  function canNotify() { return ("Notification" in window); }
  function tryNotify(title, body) {
    title = txt(title || "作息秘書");
    body = txt(body || "");
    if (!canNotify()) return false;
    if (Notification.permission !== "granted") return false;
    try { new Notification(title, { body: body, tag: "sleep-secretary-v19" }); return true; }
    catch (e) { return false; }
  }
  function remind(title, body, ttsText) {
    vibrate(140);
    speak(ttsText || title);
    tryNotify(title, body);
  }

  /* ==========================================================
     Timers (內建倒數) — 一定可用
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

  // 預設值（你要的）
  var micro = { total: 60, left: 60, running: false, t: null };
  var eye = { focusSec: 20 * 60, relaxSec: 20, phase: "focus", left: 20 * 60, running: false, t: null };
  var pomo = { focusMin: 25, breakMin: 5, phase: "focus", left: 25 * 60, running: false, t: null };

  function microRender() {
    if (microTimeEl) microTimeEl.textContent = fmtMMSS(micro.left);
    if (microHintEl) microHintEl.textContent = micro.running ? "進行中…" : "準備好了就開始";
  }
  function microStopInterval() { if (micro.t) { clearInterval(micro.t); micro.t = null; } }
  function microDone() {
    micro.left = 0;
    micro.running = false;
    microStopInterval();
    microRender();
    remind("微休息完成 ✅", "喝口水、放鬆肩頸。", "微休息結束，做得好。");
    openDlg("完成 ✅", "<p>微休息結束～喝口水、放鬆肩頸。</p>");
  }
  function microTick() {
    if (!micro.running) return;
    micro.left -= 1;
    if (micro.left <= 0) { microDone(); return; }
    microRender();
  }
  function microStart() {
    if (micro.running) return;
    micro.running = true;
    if (!micro.t) micro.t = setInterval(microTick, 1000);
    microRender();
  }
  function microPause() {
    micro.running = false;
    microStopInterval();
    microRender();
  }
  function microReset() {
    micro.running = false;
    microStopInterval();
    micro.left = micro.total;
    microRender();
  }

  function eyeRender() {
    if (eyeTimeEl) eyeTimeEl.textContent = fmtMMSS(eye.left);
    if (eyePhaseEl) eyePhaseEl.textContent = (eye.phase === "focus") ? "20 分鐘專注中" : "看遠 20 呎｜20 秒";
  }
  function eyeStopInterval() { if (eye.t) { clearInterval(eye.t); eye.t = null; } }
  function eyeSwitchPhase() {
    if (eye.phase === "focus") {
      eye.phase = "relax";
      eye.left = eye.relaxSec;
      remind("護眼提醒 👁️", "請看遠 20 秒（約 6 公尺）。", "護眼提醒，請看遠二十秒。");
      openDlg("護眼提醒 👁️", "<p>看遠 20 呎（約 6 公尺）<br>持續 20 秒。</p>");
    } else {
      eye.phase = "focus";
      eye.left = eye.focusSec;
      remind("回到專注 ✅", "開始 20 分鐘。", "回到專注，開始二十分鐘。");
    }
    eyeRender();
  }
  function eyeTick() {
    if (!eye.running) return;
    eye.left -= 1;
    if (eye.left <= 0) { eyeSwitchPhase(); return; }
    eyeRender();
  }
  function eyeStart() {
    if (eye.running) return;
    eye.running = true;
    if (!eye.t) eye.t = setInterval(eyeTick, 1000);
    eyeRender();
  }
  function eyePause() {
    eye.running = false;
    eyeStopInterval();
    eyeRender();
  }
  function eyeReset() {
    eye.running = false;
    eyeStopInterval();
    eye.phase = "focus";
    eye.left = eye.focusSec;
    eyeRender();
  }

  function pomoRender() {
    if (pomoTimeEl) pomoTimeEl.textContent = fmtMMSS(pomo.left);
    if (pomoPhaseEl) pomoPhaseEl.textContent = (pomo.phase === "focus") ? "專注中" : "休息中";
  }
  function pomoStopInterval() { if (pomo.t) { clearInterval(pomo.t); pomo.t = null; } }
  function pomoSwitchPhase() {
    if (pomo.phase === "focus") {
      pomo.phase = "break";
      pomo.left = pomo.breakMin * 60;
      remind("番茄休息 🍅", "休息一下：喝水、伸展、走兩步。", "番茄鐘，進入休息時間。");
      openDlg("番茄休息 🍅", "<p>休息一下：喝水、伸展、走兩步。</p>");
    } else {
      pomo.phase = "focus";
      pomo.left = pomo.focusMin * 60;
      remind("番茄開始 🍅", "新一輪專注開始～", "番茄鐘，開始專注。");
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
  function pomoStart() {
    if (pomo.running) return;
    pomo.running = true;
    if (!pomo.t) pomo.t = setInterval(pomoTick, 1000);
    pomoRender();
  }
  function pomoPause() {
    pomo.running = false;
    pomoStopInterval();
    pomoRender();
  }
  function pomoReset() {
    pomo.running = false;
    pomoStopInterval();
    pomo.phase = "focus";
    pomo.left = pomo.focusMin * 60;
    pomoRender();
  }

  /* ==========================================================
     Android 系統計時器（盡量） + 可驗證
     iOS：直接 fallback 內建倒數（可靠）
  ========================================================== */
  function tryOpen(url) {
    try { window.location.href = url; return true; } catch (e) {}
    return false;
  }

  function proveLaunch(label) {
    openDlg("已送出「系統計時器」請求",
      "<p><b>" + escapeHtml(label) + "</b></p>" +
      "<p>若成功，通常會：</p><ol>" +
      "<li>跳到「時鐘/計時器」App</li>" +
      "<li>通知列出現倒數</li></ol>" +
      "<p style='opacity:.85'>我會用「是否切出本頁」當作證據。</p>"
    );

    var left = false;
    function onVis() { if (document.hidden) left = true; }
    document.addEventListener("visibilitychange", onVis);

    setTimeout(function () {
      try { document.removeEventListener("visibilitychange", onVis); } catch (e) {}
      if (left) {
        openDlg("✅ 有切出本頁", "<p>看起來有跳到系統/時鐘畫面，請拉下通知列確認倒數。</p>");
      } else {
        openDlg("⚠️ 沒切出本頁", "<p>此機型/瀏覽器可能阻擋 intent。已改用內建倒數確保可用。</p>");
      }
    }, 2200);
  }

  function openSystemTimerOrFallback(seconds, label, fallbackFn) {
    seconds = Math.max(1, seconds | 0);
    label = txt(label || "作息秘書");

    if (IS_IOS) {
      speak("iPhone 建議用內建倒數。");
      openDlg("iPhone / iPad", "<p>iOS 網頁/PWA 通常無法可靠喚起系統計時器，我已改用內建倒數。</p>");
      if (fallbackFn) fallbackFn();
      return;
    }

    if (!IS_ANDROID) {
      openDlg("提示", "<p>此裝置非 Android，已改用內建倒數。</p>");
      if (fallbackFn) fallbackFn();
      return;
    }

    proveLaunch(label);

    // 多種 intent（不同手機吃的不一樣）
    var msg = encodeURIComponent(label);
    var u1 = "intent:#Intent;action=android.intent.action.SET_TIMER;S.android.intent.extra.alarm.LENGTH=" + seconds + ";S.android.intent.extra.alarm.MESSAGE=" + msg + ";B.android.intent.extra.alarm.SKIP_UI=false;end";
    var u2 = "intent:#Intent;action=android.intent.action.SET_TIMER;i.android.intent.extra.alarm.LENGTH=" + seconds + ";S.android.intent.extra.alarm.MESSAGE=" + msg + ";B.android.intent.extra.alarm.SKIP_UI=false;end";

    tryOpen(u1);
    tryOpen(u2);

    // 800ms 內沒切出就 fallback（確保可用）
    var left = false;
    function onVis() { if (document.hidden) left = true; }
    document.addEventListener("visibilitychange", onVis);

    setTimeout(function () {
      try { document.removeEventListener("visibilitychange", onVis); } catch (e) {}
      if (!left) {
        speak("系統計時器沒有反應，改用內建倒數。");
        if (fallbackFn) fallbackFn();
      }
    }, 800);
  }

  /* ==========================================================
     Bind buttons
  ========================================================== */
  function bindTimerButtons() {
    // micro
    if (microStartBtn) microStartBtn.onclick = function (e) { if (e) e.preventDefault(); microStart(); };
    if (microPauseBtn) microPauseBtn.onclick = function (e) { if (e) e.preventDefault(); microPause(); };
    if (microResetBtn) microResetBtn.onclick = function (e) { if (e) e.preventDefault(); microReset(); };
    if (microSysBtn) microSysBtn.onclick = function (e) {
      if (e) e.preventDefault();
      speak("已嘗試開啟系統計時器。");
      openSystemTimerOrFallback(micro.left || micro.total, "作息秘書｜微休息 " + fmtMMSS(micro.left || micro.total), function () {
        microReset(); microStart();
      });
    };
    microRender();

    // eye
    if (eyeStartBtn) eyeStartBtn.onclick = function (e) { if (e) e.preventDefault(); eyeStart(); };
    if (eyePauseBtn) eyePauseBtn.onclick = function (e) { if (e) e.preventDefault(); eyePause(); };
    if (eyeResetBtn) eyeResetBtn.onclick = function (e) { if (e) e.preventDefault(); eyeReset(); };
    if (eyeSysFocusBtn) eyeSysFocusBtn.onclick = function (e) {
      if (e) e.preventDefault();
      speak("已嘗試開啟系統計時器。");
      openSystemTimerOrFallback(eye.focusSec, "作息秘書｜護眼 專注 20 分鐘", function () {
        eyeReset(); eyeStart();
      });
    };
    if (eyeSysRelaxBtn) eyeSysRelaxBtn.onclick = function (e) {
      if (e) e.preventDefault();
      speak("已嘗試開啟系統計時器。");
      openSystemTimerOrFallback(eye.relaxSec, "作息秘書｜護眼 看遠 20 秒", function () {
        eyePause();
        eye.phase = "relax";
        eye.left = eye.relaxSec;
        eyeRender();
        eyeStart();
      });
    };
    eyeRender();

    // pomo
    if (pomoStartBtn) pomoStartBtn.onclick = function (e) { if (e) e.preventDefault(); pomoStart(); };
    if (pomoPauseBtn) pomoPauseBtn.onclick = function (e) { if (e) e.preventDefault(); pomoPause(); };
    if (pomoResetBtn) pomoResetBtn.onclick = function (e) { if (e) e.preventDefault(); pomoReset(); };
    if (pomoSysBtn) pomoSysBtn.onclick = function (e) {
      if (e) e.preventDefault();
      speak("已嘗試開啟系統計時器。");
      var sec = pomo.left || (pomo.focusMin * 60);
      var label = (pomo.phase === "focus") ? ("作息秘書｜番茄 專注 " + fmtMMSS(sec)) : ("作息秘書｜番茄 休息 " + fmtMMSS(sec));
      openSystemTimerOrFallback(sec, label, function () {
        pomoReset(); pomoStart();
      });
    };
    pomoRender();
  }

  function bindNavigation() {
    document.addEventListener("click", function (e) {
      var t = e.target;

      var tab = closest(t, ".tab[data-view]");
      if (tab) { e.preventDefault(); setActiveView(tab.getAttribute("data-view")); return; }

      var card = closest(t, ".card[data-jump]");
      if (card) { e.preventDefault(); setActiveView(card.getAttribute("data-jump")); return; }
    }, false);
  }

  function bindInstallHelp() {
    var btn = $("#btnInstallHelp");
    if (!btn) return;
    ensureBtnType(btn);
    btn.onclick = function (e) {
      if (e) e.preventDefault();
      openDlg("安裝教學",
        "<p><b>Android（Chrome）</b><br>右上角「⋮」→ <b>加入主畫面</b></p>" +
        "<p><b>iPhone（Safari）</b><br>分享按鈕 → <b>加入主畫面</b></p>" +
        "<p style='opacity:.85'>提醒：系統通知需 HTTPS + 允許通知。iOS 背景倒數不保證。</p>"
      );
    };
  }

  /* ==========================================================
     HARD GUARD：如果初始化失敗，直接提示你
  ========================================================== */
  function init() {
    ensureAllButtonsType();
    bindDlgOkDefault();
    bindInstallHelp();
    bindNavigation();
    bindTimerButtons();
    setActiveView("home");

    // 讓你一眼看到「JS確實跑起來」
    //（只出現一次）
    // speak("作息秘書已啟動。");
  }

  try {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  } catch (err) {
    // 如果你還是遇到「按鈕不動」，這裡會把錯誤顯示出來
    alert("JS 初始化失敗：\n" + (err && err.message ? err.message : err));
    console.error(err);
  }

})();
