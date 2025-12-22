/* =========================
作息秘書 v19（完整 JS｜可直接覆蓋）
- 承接 v17：Tabs / Cards / 三種計時器 / Dialog / KB / REL / 生日提醒
- v19 強化：系統計時器「補救方案」
  1) iOS 偵測：每個模式按鈕列插入「一鍵捷徑」第一顆
  2) Android：嘗試 intent SET_TIMER；不行就跳教學
  3) 叫不到系統：統一跳「一鍵捷徑教學（iOS/Android）」Dialog
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
     v19：系統計時器補救（iOS 捷徑 / Android intent）
  ========================================================== */
  function isIOS() {
    var ua = navigator.userAgent || "";
    var iOSLike = /iPad|iPhone|iPod/.test(ua);
    var iPadOS13 = (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    return iOSLike || iPadOS13;
  }
  function isAndroid() {
    return /Android/i.test(navigator.userAgent || "");
  }

  function runIOSShortcutByName(shortcutName) {
    shortcutName = safeText(shortcutName).trim();
    if (!shortcutName) return false;
    var url = "shortcuts://run-shortcut?name=" + encodeURIComponent(shortcutName);
    window.location.href = url;
    return true;
  }

  function startAndroidTimerIntent(seconds, label) {
    seconds = Math.max(1, (seconds | 0));
    label = safeText(label || "作息秘書");
    var intentUrl =
      "intent:#Intent;" +
      "action=android.intent.action.SET_TIMER;" +
      "S.android.intent.extra.alarm.MESSAGE=" + encodeURIComponent(label) + ";" +
      "i.android.intent.extra.alarm.LENGTH=" + seconds + ";" +
      "B.android.intent.extra.alarm.SKIP_UI=true;" +
      "end";
    try { window.location.href = intentUrl; return true; } catch (e) { return false; }
  }

  function showOneKeyHelp(modeTitle, shortcutNameSuggested) {
    var ios = isIOS();
    var html = "";

    html += "<p><b>" + escapeHtml(modeTitle) + "</b></p>";
    html += "<p style='opacity:.9'>部分手機/瀏覽器/PWA 無法由網頁直接控制「系統計時器」。我們用最穩的替代方案。</p>";

    if (ios) {
      html += "<hr style='opacity:.15;margin:10px 0;'>";
      html += "<p><b>iPhone / iPad（用「捷徑」一鍵開計時器）</b></p>";
      html += "<ol style='margin:6px 0 0 18px;'>";
      html += "<li>打開「捷徑」App</li>";
      html += "<li>點「＋」建立捷徑</li>";
      html += "<li>加入動作：<b>開始計時器</b>（Start Timer）</li>";
      html += "<li>把時間設成此模式時間</li>";
      html += "<li>捷徑命名：<b>" + escapeHtml(shortcutNameSuggested) + "</b></li>";
      html += "</ol>";
      html += "<p style='opacity:.85;margin-top:8px;'>建立好後回到作息秘書按「一鍵捷徑」即可。</p>";
      html += "<div style='display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;justify-content:center;'>";
      html += "<button id='btnRunShortcutNow' class='btnPrimary' type='button'>一鍵開捷徑</button>";
      html += "</div>";
    } else if (isAndroid()) {
      html += "<hr style='opacity:.15;margin:10px 0;'>";
      html += "<p><b>Android（替代方案）</b></p>";
      html += "<ol style='margin:6px 0 0 18px;'>";
      html += "<li>若本機不支援自動開計時器，請手動打開：<b>時鐘 → 計時器</b></li>";
      html += "<li>把時間設成此模式時間</li>";
      html += "<li>回到作息秘書繼續工作/學習</li>";
      html += "</ol>";
      html += "<p style='opacity:.85;margin-top:8px;'>（不同品牌「時鐘」App 支援度不同）</p>";
    } else {
      html += "<p style='opacity:.85'>此裝置非 iOS/Android，請改用手動開「時鐘 → 計時器」。</p>";
    }

    openDlg("一鍵補救教學", html);

    var btn = $("#btnRunShortcutNow");
    if (btn && isIOS()) {
      ensureBtnType(btn);
      btn.onclick = null;
      btn.addEventListener("click", function () {
        ttsWarmup();
        speak("開啟捷徑");
        runIOSShortcutByName(shortcutNameSuggested);
      });
    }
  }

  function tryStartSystemTimer(seconds, label, iosShortcutName, modeTitle) {
    ttsWarmup();

    if (isIOS()) {
      vibrate(50);
      speak("使用一鍵捷徑");
      runIOSShortcutByName(iosShortcutName);
      setTimeout(function () { showOneKeyHelp(modeTitle, iosShortcutName); }, 650);
      return;
    }

    if (isAndroid()) {
      vibrate(50);
      speak("已嘗試開啟系統計時器");
      startAndroidTimerIntent(seconds, label);
      setTimeout(function () { showOneKeyHelp(modeTitle, iosShortcutName); }, 750);
      return;
    }

    speak("此裝置不支援系統計時器");
    showOneKeyHelp(modeTitle, iosShortcutName);
  }

  function insertIOSShortcutButtonFirst(btnRowEl, shortcutName, modeTitle) {
    if (!btnRowEl || !isIOS()) return;
    if (btnRowEl.querySelector("[data-ios-shortcut='1']")) return;

    var b = document.createElement("button");
    b.className = "btnPrimary";
    b.type = "button";
    b.textContent = "一鍵捷徑";
    b.setAttribute("data-ios-shortcut", "1");

    b.addEventListener("click", function (e) {
      e.preventDefault();
      ttsWarmup();
      speak("開啟捷徑");
      runIOSShortcutByName(shortcutName);
      setTimeout(function () { showOneKeyHelp(modeTitle, shortcutName); }, 650);
    });

    btnRowEl.insertBefore(b, btnRowEl.firstChild);
  }

  /* ==========================================================
     Timers（三個倒數：微休息 / 護眼 / 蕃茄）
     ✅ 可調預設值：你要的三點
       1) 微休息預設 60 秒（可調）
       2) 護眼 20 分 20 秒
       3) 蕃茄預設 25/5（可調）
  ========================================================== */

  // 可調預設（之後你要做 UI 可再加）
  var DEFAULTS = {
    microSec: 60,
    eyeFocusMin: 20,
    eyeRelaxSec: 20,
    pomoFocusMin: 25,
    pomoBreakMin: 5
  };

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

  var micro = { total: DEFAULTS.microSec, left: DEFAULTS.microSec, running: false, t: null };
  var eye = { focusSec: DEFAULTS.eyeFocusMin * 60, relaxSec: DEFAULTS.eyeRelaxSec, phase: "focus", left: DEFAULTS.eyeFocusMin * 60, running: false, t: null };
  var pomo = { focusMin: DEFAULTS.pomoFocusMin, breakMin: DEFAULTS.pomoBreakMin, phase: "focus", left: DEFAULTS.pomoFocusMin * 60, running: false, t: null };

  async function fireReminder(title, body, ttsText) {
    vibrate(120);
    ttsWarmup();
    speak(ttsText || title);

    // 系統通知（若你未開權限，至少有 Dialog + 語音）
    try {
      if ("Notification" in window && Notification.permission === "granted") {
        // 前景通知
        try { new Notification(title, { body: body, tag: "sleep-secretary" }); } catch (e) {}
      }
    } catch (e2) {}
  }

  function microRender() {
    if (microTimeEl) microTimeEl.textContent = fmtMMSS(micro.left);
    if (microHintEl) microHintEl.textContent = micro.running ? "進行中…" : "準備好了就開始（預設 60 秒，可調）";
  }
  async function microDone() {
    micro.left = 0; micro.running = false;
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
  function microStart() {
    ttsWarmup();
    if (micro.running) return;
    micro.running = true;
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
    micro.total = DEFAULTS.microSec;
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
    if (eyePhaseEl) eyePhaseEl.textContent = (eye.phase === "focus")
      ? ("20 分鐘專注中（預設，可調）")
      : ("看遠 20 呎｜20 秒（預設，可調）");
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
  function eyeStart() {
    ttsWarmup();
    if (eye.running) return;
    eye.running = true;
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
    eye.focusSec = DEFAULTS.eyeFocusMin * 60;
    eye.relaxSec = DEFAULTS.eyeRelaxSec;
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
    if (pomoPhaseEl) pomoPhaseEl.textContent = (pomo.phase === "focus")
      ? ("專注中（預設 25 分，可調）")
      : ("休息中（預設 5 分，可調）");
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
  function pomoStart() {
    ttsWarmup();
    if (pomo.running) return;
    pomo.running = true;
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
    pomo.focusMin = DEFAULTS.pomoFocusMin;
    pomo.breakMin = DEFAULTS.pomoBreakMin;
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
     系統計時器按鈕（你 HTML 已有 id）
     microSys / eyeSysFocus / eyeSysRelax / pomoSys
  ========================================================== */
  var microSysBtn = $("#microSys");
  var eyeSysFocusBtn = $("#eyeSysFocus");
  var eyeSysRelaxBtn = $("#eyeSysRelax");
  var pomoSysBtn = $("#pomoSys");

  function bindSystemTimerButtons() {
    var microRow = microSysBtn ? closest(microSysBtn, ".btnRow") : null;
    var eyeRow = eyeSysFocusBtn ? closest(eyeSysFocusBtn, ".btnRow") : null;
    var pomoRow = pomoSysBtn ? closest(pomoSysBtn, ".btnRow") : null;

    // ✅ iOS：插入第一顆「一鍵捷徑」
    insertIOSShortcutButtonFirst(microRow, "作息-微休息60秒", "微休息｜60 秒");
    insertIOSShortcutButtonFirst(eyeRow, "作息-護眼20分鐘", "護眼｜20 分鐘");
    insertIOSShortcutButtonFirst(pomoRow, "作息-番茄25分鐘", "蕃茄｜25 分鐘");

    if (microSysBtn) {
      ensureBtnType(microSysBtn);
      microSysBtn.addEventListener("click", function (e) {
        e.preventDefault();
        tryStartSystemTimer(
          micro.total,
          "作息秘書｜微休息 " + micro.total + " 秒",
          "作息-微休息60秒",
          "微休息｜60 秒"
        );
      });
    }

    if (eyeSysFocusBtn) {
      ensureBtnType(eyeSysFocusBtn);
      eyeSysFocusBtn.addEventListener("click", function (e) {
        e.preventDefault();
        tryStartSystemTimer(
          eye.focusSec,
          "作息秘書｜護眼 20 分鐘",
          "作息-護眼20分鐘",
          "護眼｜20 分鐘"
        );
      });
    }

    if (eyeSysRelaxBtn) {
      ensureBtnType(eyeSysRelaxBtn);
      eyeSysRelaxBtn.addEventListener("click", function (e) {
        e.preventDefault();
        tryStartSystemTimer(
          eye.relaxSec,
          "作息秘書｜護眼 看遠 20 秒",
          "作息-護眼20秒",
          "護眼｜20 秒"
        );
      });
    }

    if (pomoSysBtn) {
      ensureBtnType(pomoSysBtn);
      pomoSysBtn.addEventListener("click", function (e) {
        e.preventDefault();
        tryStartSystemTimer(
          pomo.focusMin * 60,
          "作息秘書｜番茄 " + pomo.focusMin + " 分鐘",
          "作息-番茄25分鐘",
          "蕃茄｜25 分鐘"
        );
      });
    }
  }

  /* ==========================================================
     Storage keys + KB / REL / BDAY（維持 v17 功能）
  ========================================================== */
  var KB_KEY = "sleepSecretary_v19_kb";
  var REL_KEY = "sleepSecretary_v19_rel";
  var BDAY_KEY = "sleepSecretary_v19_bday";

  /* ---------- KB ---------- */
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
  function kbMatchesFilter(item) { return (kbFilter === "全部") ? true : (item && item.cat === kbFilter); }

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

      // 一次性確認
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

  /* ---------- REL ---------- */
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
  function relMatchesFilter(item) { return (relFilter === "全部") ? true : (item && item.cat === relFilter); }

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

  /* ---------- BDAY ---------- */
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

  function bdayClearAll() {
    bdayData = [];
    bdaySave();
    bdayRender();
  }

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
     Global click delegation（Tabs / Cards / chips / delete）
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

      // Cards（首頁卡片）
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
        "<p style='opacity:.85'>iOS 系統計時器建議用「捷徑」一鍵啟動（本 App 已自動置頂）。</p>";
      openDlg("安裝教學", html);
    });
  }

  /* ---------- Init ---------- */
  function init() {
    ensureBtnTypesIn(document);
    bindDialog();
    bindInstallHelp();
    bindGlobalDelegation();

    // ✅ 三個倒數一定要綁，否則「開始」不會動
    bindMicro();
    bindEye();
    bindPomo();

    // ✅ KB/REL/BDAY
    bindKB();
    bindREL();
    bindBDAY();

    // ✅ 系統計時器補救
    bindSystemTimerButtons();

    // 預設首頁
    setActiveView("home");

    //（可選）第一次提示通知權限：不強制
    // if ("Notification" in window && Notification.permission === "default") {
    //   Notification.requestPermission().catch(function(){});
    // }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
