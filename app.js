/* =========================
作息秘書 v19JS（系統計時器強化版）
- iOS：把「一鍵捷徑」放第一顆，叫不到就跳捷徑教學
- Android：先 intent SET_TIMER，失敗就跳教學
- HTML 不用改：JS 動態插入捷徑按鈕
========================= */

(function () {
  "use strict";

  /* ---------- Helpers ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function safeText(s) { return (s == null) ? "" : String(s); }
  function ensureBtnType(el) {
    try {
      if (!el) return;
      if (el.tagName && el.tagName.toLowerCase() === "button") {
        if (!el.getAttribute("type")) el.setAttribute("type", "button");
      }
    } catch (e) {}
  }
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
  function vibrate(ms) { try { if (navigator.vibrate) navigator.vibrate(ms || 60); } catch (e) {} }

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
     ✅ 核心：偵測系統 + 系統計時器（Android intent / iOS 捷徑）
  ========================================================== */

  function isIOS() {
    var ua = navigator.userAgent || "";
    var iOSLike = /iPad|iPhone|iPod/.test(ua);
    // iPadOS 13+ 會偽裝成 Mac
    var iPadOS13 = (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    return iOSLike || iPadOS13;
  }

  function isAndroid() {
    return /Android/i.test(navigator.userAgent || "");
  }

  // iOS：用捷徑 URL scheme 執行捷徑（捷徑名稱需與你教學一致）
  function runIOSShortcutByName(shortcutName) {
    shortcutName = safeText(shortcutName).trim();
    if (!shortcutName) return false;
    // 注意：名稱若含空白/特殊字元要 encode
    var url = "shortcuts://run-shortcut?name=" + encodeURIComponent(shortcutName);
    // 用 location 觸發最穩
    window.location.href = url;
    return true;
  }

  // Android：呼叫系統「設定計時器」intent（Chrome 通常可）
  function startAndroidTimerIntent(seconds, label) {
    seconds = Math.max(1, (seconds | 0));
    label = safeText(label || "作息秘書");
    // SET_TIMER：seconds + message + skip UI（不一定每支手機支援）
    var intentUrl =
      "intent:#Intent;" +
      "action=android.intent.action.SET_TIMER;" +
      "S.android.intent.extra.alarm.MESSAGE=" + encodeURIComponent(label) + ";" +
      "i.android.intent.extra.alarm.LENGTH=" + seconds + ";" +
      "B.android.intent.extra.alarm.SKIP_UI=true;" +
      "end";
    try {
      window.location.href = intentUrl;
      return true;
    } catch (e) {
      return false;
    }
  }

  // 叫不到系統計時器時：統一顯示「一鍵捷徑教學」
  function showOneKeyHelp(modeTitle, shortcutNameSuggested) {
    var ios = isIOS();
    var html = "";

    html += "<p><b>" + escapeHtml(modeTitle) + "</b></p>";
    html += "<p style='opacity:.9'>你的手機或瀏覽器可能無法直接由 PWA 叫出「系統計時器」。</p>";

    if (ios) {
      html += "<hr style='opacity:.15;margin:10px 0;'>";
      html += "<p><b>iPhone / iPad（建議用「捷徑」一鍵開計時器）</b></p>";
      html += "<ol style='margin:6px 0 0 18px;'>";
      html += "<li>打開「捷徑」App</li>";
      html += "<li>點「＋」建立捷徑</li>";
      html += "<li>加入動作：<b>開始計時器</b>（Start Timer）</li>";
      html += "<li>把時間設成此模式的秒數/分鐘數</li>";
      html += "<li>捷徑命名：<b>" + escapeHtml(shortcutNameSuggested) + "</b></li>";
      html += "</ol>";
      html += "<p style='opacity:.85;margin-top:8px;'>建立好後，回到作息秘書按「一鍵捷徑」就會直接開。</p>";
      html += "<div style='display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;justify-content:center;'>";
      html += "<button id='btnRunShortcutNow' class='btnPrimary' type='button'>一鍵開捷徑</button>";
      html += "</div>";
    } else if (isAndroid()) {
      html += "<hr style='opacity:.15;margin:10px 0;'>";
      html += "<p><b>Android（替代方案）</b></p>";
      html += "<ol style='margin:6px 0 0 18px;'>";
      html += "<li>若本機不支援 intent，請直接打開：<b>時鐘 → 計時器</b></li>";
      html += "<li>把時間設成此模式的秒數/分鐘數</li>";
      html += "<li>回到作息秘書繼續工作/學習</li>";
      html += "</ol>";
      html += "<p style='opacity:.85;margin-top:8px;'>（不同品牌手機的「時鐘」App 能力不同）</p>";
    } else {
      html += "<p style='opacity:.85'>此裝置非 iOS/Android，請改用內建倒數或手動開時鐘計時器。</p>";
    }

    openDlg("一鍵補救教學", html);

    // 綁定「一鍵開捷徑」
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

  // ✅ 對外統一入口：嘗試「系統」→ 失敗就「教學」
  function tryStartSystemTimer(seconds, label, iosShortcutName, modeTitle) {
    ttsWarmup();

    if (isIOS()) {
      // iOS：直接走捷徑（系統不允許 web 直接控制 Clock 計時器）
      speak("使用一鍵捷徑");
      var ok = runIOSShortcutByName(iosShortcutName);
      // 無法得知是否真的成功，只能提供補救教學
      setTimeout(function () {
        showOneKeyHelp(modeTitle, iosShortcutName);
      }, 600);
      return;
    }

    if (isAndroid()) {
      speak("已嘗試開啟系統計時器");
      var okA = startAndroidTimerIntent(seconds, label);
      // Android 也無法 100% 確認；給「如何證明」：提示你去最近任務看時鐘、或等通知
      setTimeout(function () {
        // 若手機沒反應 → 直接教學
        showOneKeyHelp(modeTitle, iosShortcutName);
      }, 700);
      return;
    }

    // 其他平台
    speak("此裝置不支援系統計時器");
    showOneKeyHelp(modeTitle, iosShortcutName);
  }

  /* ==========================================================
     ✅ iOS 偵測後：把「一鍵捷徑」插到按鈕列第一顆
     - 不改 HTML：動態插入
  ========================================================== */

  function insertIOSShortcutButtonFirst(btnRowEl, shortcutName, modeTitle) {
    if (!btnRowEl || !isIOS()) return;

    // 避免重複插入
    if (btnRowEl.querySelector("[data-ios-shortcut='1']")) return;

    var b = document.createElement("button");
    b.className = "btnPrimary";        // 讓它看起來是主行動
    b.type = "button";
    b.textContent = "一鍵捷徑";
    b.setAttribute("data-ios-shortcut", "1");

    b.addEventListener("click", function (e) {
      e.preventDefault();
      ttsWarmup();
      speak("開啟捷徑");
      runIOSShortcutByName(shortcutName);
      // 同步給教學（避免用戶沒建立）
      setTimeout(function () {
        showOneKeyHelp(modeTitle, shortcutName);
      }, 600);
    });

    // 插到第一顆
    btnRowEl.insertBefore(b, btnRowEl.firstChild);
  }

  /* ==========================================================
     Timers（你原本的倒數功能保留：這裡只示範掛系統按鈕）
     ⚠️ 你原本 micro/eye/pomo 的倒數邏輯可留著
  ========================================================== */

  // 取系統按鈕（你 HTML 已有）
  var microSysBtn = $("#microSys");
  var eyeSysFocusBtn = $("#eyeSysFocus");
  var eyeSysRelaxBtn = $("#eyeSysRelax");
  var pomoSysBtn = $("#pomoSys");

  function bindSystemTimerButtons() {
    // 1) iOS：在每個模式按鈕列插入「一鍵捷徑」第一顆
    // 找到各自的 btnRow
    var microRow = microSysBtn ? closest(microSysBtn, ".btnRow") : null;
    var eyeRow = eyeSysFocusBtn ? closest(eyeSysFocusBtn, ".btnRow") : null;
    var pomoRow = pomoSysBtn ? closest(pomoSysBtn, ".btnRow") : null;

    // 建議的捷徑名稱（你教學就用這些名字）
    insertIOSShortcutButtonFirst(microRow, "作息-微休息60秒", "微休息｜60 秒");
    insertIOSShortcutButtonFirst(eyeRow, "作息-護眼20分鐘", "護眼｜20 分鐘");
    // 護眼 20 秒也會用到另一個捷徑（第二顆系統20秒）
    // 這顆第一顆先放 20分鐘的捷徑（因為最常用）
    insertIOSShortcutButtonFirst(pomoRow, "作息-番茄25分鐘", "蕃茄｜25 分鐘");

    // 2) 綁定原本的「用系統計時器」按鈕：Android intent / iOS 捷徑
    if (microSysBtn) {
      ensureBtnType(microSysBtn);
      microSysBtn.onclick = null;
      microSysBtn.addEventListener("click", function (e) {
        e.preventDefault();
        vibrate(50);
        tryStartSystemTimer(
          60,
          "作息秘書｜微休息 60 秒",
          "作息-微休息60秒",
          "微休息｜60 秒"
        );
      });
    }

    if (eyeSysFocusBtn) {
      ensureBtnType(eyeSysFocusBtn);
      eyeSysFocusBtn.onclick = null;
      eyeSysFocusBtn.addEventListener("click", function (e) {
        e.preventDefault();
        vibrate(50);
        tryStartSystemTimer(
          20 * 60,
          "作息秘書｜護眼 20 分鐘",
          "作息-護眼20分鐘",
          "護眼｜20 分鐘"
        );
      });
    }

    if (eyeSysRelaxBtn) {
      ensureBtnType(eyeSysRelaxBtn);
      eyeSysRelaxBtn.onclick = null;
      eyeSysRelaxBtn.addEventListener("click", function (e) {
        e.preventDefault();
        vibrate(50);
        // iOS 建議捷徑名：作息-護眼20秒
        tryStartSystemTimer(
          20,
          "作息秘書｜護眼 看遠 20 秒",
          "作息-護眼20秒",
          "護眼｜20 秒"
        );
      });
    }

    if (pomoSysBtn) {
      ensureBtnType(pomoSysBtn);
      pomoSysBtn.onclick = null;
      pomoSysBtn.addEventListener("click", function (e) {
        e.preventDefault();
        vibrate(50);
        tryStartSystemTimer(
          25 * 60,
          "作息秘書｜番茄 25 分鐘",
          "作息-番茄25分鐘",
          "蕃茄｜25 分鐘"
        );
      });
    }
  }

  /* ---------- Global click delegation（保留你的 tabs / cards） ---------- */
  function bindGlobalDelegation() {
    document.addEventListener("click", function (e) {
      var t = e.target;
      ttsWarmup();

      var tab = closest(t, ".tab[data-view]");
      if (tab) {
        e.preventDefault();
        setActiveView(tab.getAttribute("data-view") || "home");
        return;
      }

      var card = closest(t, ".card[data-jump]");
      if (card) {
        e.preventDefault();
        setActiveView(card.getAttribute("data-jump") || "home");
        return;
      }
    }, false);
  }

  /* ---------- Install help（你原本就有） ---------- */
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
        "<p style='opacity:.85'>iOS 系統計時器建議用「捷徑」一鍵啟動。</p>";
      openDlg("安裝教學", html);
    });
  }

  /* ---------- Init ---------- */
  function init() {
    bindDialog();
    bindInstallHelp();
    bindGlobalDelegation();

    // ✅ 核心：系統計時器按鈕 + iOS 一鍵捷徑第一顆
    bindSystemTimerButtons();

    // 預設回首頁
    setActiveView("home");

    // 用戶知道目前偵測到什麼
    if (isIOS()) {
      // 不用太吵，只在第一次可視時提示
      // speak("已偵測到蘋果系統，一鍵捷徑已置頂。");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
