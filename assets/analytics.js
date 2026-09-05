/* =====================================================================
   Сборщик событий: считает не «посещения», а движение к цели —
   дочитал → нажал в Telegram. Работает с Метрикой, GA4 и своим счётчиком.
   ===================================================================== */
(function () {
  "use strict";

  var META = {
    path: location.pathname,
    title: document.title,
    ref: document.referrer || "",
    type: /^\/g\//.test(location.pathname) ? "article"
        : /^\/tema\//.test(location.pathname) ? "topic"
        : location.pathname === "/" ? "index" : "other"
  };

  /* ── UTM живут 30 дней: клик из Telegram и оплата через неделю
        должны сойтись в одном источнике ─────────────────────────── */
  var UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
  function saveUtm() {
    try {
      var q = new URLSearchParams(location.search), found = {};
      UTM_KEYS.forEach(function (k) { if (q.get(k)) found[k] = q.get(k); });
      if (Object.keys(found).length) {
        found.ts = Date.now();
        found.landing = location.pathname;
        localStorage.setItem("utm", JSON.stringify(found));
      }
      var raw = localStorage.getItem("utm");
      if (!raw) return {};
      var saved = JSON.parse(raw);
      if (Date.now() - (saved.ts || 0) > 30 * 864e5) { localStorage.removeItem("utm"); return {}; }
      return saved;
    } catch (e) { return {}; }
  }
  var UTM = saveUtm();

  /* ── Идентификатор посетителя (свой, анонимный, без кук третьих лиц) ─ */
  function visitorId() {
    try {
      var id = localStorage.getItem("vid");
      if (!id) {
        id = (Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
        localStorage.setItem("vid", id);
      }
      return id;
    } catch (e) { return "anon"; }
  }
  var VID = visitorId();
  var SID = (function () {
    try {
      var s = sessionStorage.getItem("sid");
      if (!s) { s = Math.random().toString(36).slice(2, 12); sessionStorage.setItem("sid", s); }
      return s;
    } catch (e) { return "s"; }
  })();

  /* ── Отправка ──────────────────────────────────────────────────── */
  function toMetrika(name, params) {
    if (typeof window.ym === "function" && window.__METRIKA_ID__) {
      try { window.ym(window.__METRIKA_ID__, "reachGoal", name, params); } catch (e) {}
    }
  }
  function toGa4(name, params) {
    if (typeof window.gtag === "function") { try { window.gtag("event", name, params); } catch (e) {} }
  }
  function toOwn(name, params) {
    var cfg = window.__OWN_ANALYTICS__;
    if (!cfg || !cfg.url || !cfg.key) return;
    var body = JSON.stringify([{
      event: name, path: META.path, page_type: META.type, title: META.title,
      referrer: META.ref, visitor_id: VID, session_id: SID,
      utm_source: UTM.utm_source || null, utm_medium: UTM.utm_medium || null,
      utm_campaign: UTM.utm_campaign || null, utm_content: UTM.utm_content || null,
      screen_w: window.innerWidth, params: params || {}
    }]);
    var url = cfg.url.replace(/\/$/, "") + "/rest/v1/" + (cfg.table || "site_events");
    try {
      fetch(url, {
        method: "POST", keepalive: true,
        headers: { "Content-Type": "application/json", apikey: cfg.key,
                   Authorization: "Bearer " + cfg.key, Prefer: "return=minimal" },
        body: body
      }).catch(function () {});
    } catch (e) {}
  }

  function track(name, params) {
    toMetrika(name, params);
    toGa4(name, params);
    toOwn(name, params);
  }
  window.track = track;

  /* ── Просмотр страницы ─────────────────────────────────────────── */
  track("pageview", { type: META.type });

  /* ── Клики в Telegram — главная конверсия сайта ─────────────────── */
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a");
    if (!a) return;
    var href = a.getAttribute("href") || "";
    if (/t\.me\//.test(href)) {
      track("tg_click", { place: a.getAttribute("data-goal") || "link", from: META.path });
    } else if (/^\/g\//.test(href) && META.type === "article") {
      track("internal_link", { to: href, from: META.path });
    }
  }, true);

  /* ── Глубина чтения и дочитывание ──────────────────────────────── */
  if (META.type === "article") {
    var marks = [25, 50, 75, 100], hit = {}, started = Date.now(), engaged = false;

    function depth() {
      var h = document.documentElement;
      var max = h.scrollHeight - window.innerHeight;
      return max <= 0 ? 100 : Math.min(100, Math.round((window.scrollY / max) * 100));
    }
    function onScroll() {
      var d = depth();
      marks.forEach(function (m) {
        if (d >= m && !hit[m]) { hit[m] = 1; track("scroll_" + m, { path: META.path }); }
      });
      if (d >= 75 && !engaged && Date.now() - started > 30000) {
        engaged = true;
        track("read_complete", { path: META.path, seconds: Math.round((Date.now() - started) / 1000) });
      }
    }
    window.addEventListener("scroll", function () {
      if (!window.__seoTick) {
        window.__seoTick = setTimeout(function () { window.__seoTick = null; onScroll(); }, 250);
      }
    }, { passive: true });

    setTimeout(function () { track("engaged_15s", { path: META.path }); }, 15000);
    setTimeout(function () { track("engaged_60s", { path: META.path }); }, 60000);

    /* Копирование текста — часто копируют кодовое слово или команду */
    document.addEventListener("copy", function () {
      var sel = String(window.getSelection() || "").trim();
      if (sel.length > 3) track("copy_text", { chars: sel.length, path: META.path });
    });

    /* Время на странице при уходе */
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") {
        track("time_on_page", { seconds: Math.round((Date.now() - started) / 1000), depth: depth() });
      }
    });
  }
})();
