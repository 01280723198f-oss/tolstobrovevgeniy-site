#!/usr/bin/env node
/* =====================================================================
   СЕО-ДВИЖОК · ДНЕВНОЙ ОТЧЁТ
   Сводит в один лист четыре источника: свой счётчик (Supabase),
   Яндекс.Метрику, Яндекс.Вебмастер и состояние самого сайта.
   Каждый источник падает молча и отдельно — отчёт выходит всегда.

   Запуск:  node seo/report.js [--tg] [--дней 14]
   ===================================================================== */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const R = (...p) => path.join(ROOT, ...p);

/* ── Секреты ───────────────────────────────────────────────────────── */

function readEnv(file) {
  const env = {};
  const full = path.join(os.homedir(), ".claude/secrets", file);
  if (!fs.existsSync(full)) return env;
  for (const line of fs.readFileSync(full, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

const SITE = readEnv("site-analytics.env");
const SB = readEnv("supabase.env");

const ARGS = process.argv.slice(2);
const DAYS = Number((ARGS[ARGS.indexOf("--дней") + 1] || ARGS[ARGS.indexOf("--days") + 1] || 14)) || 14;
const TO_TG = ARGS.includes("--tg");

const today = new Date();
const iso = d => d.toISOString().slice(0, 10);
const shift = n => { const d = new Date(today); d.setDate(d.getDate() + n); return iso(d); };
const DATE = iso(today);
const YESTERDAY = shift(-1);

/* ── Сеть ──────────────────────────────────────────────────────────── */

async function get(url, headers) {
  const r = await fetch(url, { headers: headers || {} });
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  if (!r.ok) throw new Error(`${r.status} ${typeof body === "string" ? body.slice(0, 120) : (body.error_message || body.message || "")}`);
  return body;
}

/* ── 1. Свой счётчик ───────────────────────────────────────────────── */

async function ownCounter() {
  const url = SITE.OWN_ANALYTICS_URL;
  const key = SB.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { error: "нет ключей (site-analytics.env / supabase.env)" };
  const h = { apikey: key, Authorization: `Bearer ${key}` };
  const [daily, pages, sources] = await Promise.all([
    get(`${url}/rest/v1/site_daily?select=*&order=day.desc&limit=${DAYS}`, h),
    get(`${url}/rest/v1/site_pages?select=*&limit=12`, h),
    get(`${url}/rest/v1/site_events?select=referrer,utm_source&event=eq.pageview&order=created_at.desc&limit=500`, h)
  ]);
  const src = new Map();
  for (const e of sources) {
    let s = (e.utm_source || "").trim();
    if (!s) {
      const ref = (e.referrer || "").trim();
      if (!ref) s = "прямые заходы";
      else { try { s = new URL(ref).hostname.replace(/^www\./, ""); } catch { s = ref.slice(0, 40); } }
    }
    src.set(s, (src.get(s) || 0) + 1);
  }
  return { daily, pages, sources: [...src.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8) };
}

/* ── 2. Яндекс.Метрика ─────────────────────────────────────────────── */

async function metrika() {
  const id = SITE.METRIKA_ID, token = SITE.YANDEX_TOKEN;
  if (!id) return { error: "METRIKA_ID не задан" };
  if (!token) return { error: "YANDEX_TOKEN не задан — цифры Метрики недоступны" };
  const h = { Authorization: `OAuth ${token}` };
  const stat = (params) =>
    get(`https://api-metrika.yandex.net/stat/v1/data?ids=${id}&${params}`, h);

  const out = { id };
  try {
    const c = await get(`https://api-metrika.yandex.net/management/v1/counter/${id}`, h);
    out.counter = { status: c.counter.status, code: c.counter.code_status, created: (c.counter.create_time || "").slice(0, 10) };
  } catch (e) { out.counterError = e.message; }

  const period = async (label, date1, date2) => {
    const d = await stat(`metrics=ym:s:visits,ym:s:users,ym:s:pageviews,ym:s:bounceRate,ym:s:avgVisitDurationSeconds&date1=${date1}&date2=${date2}`);
    return { label, visits: d.totals[0], users: d.totals[1], pageviews: d.totals[2], bounce: d.totals[3], dur: d.totals[4] };
  };
  try {
    out.periods = await Promise.all([
      period("вчера", YESTERDAY, YESTERDAY),
      period("7 дней", shift(-7), DATE),
      period("28 дней", shift(-28), DATE)
    ]);
  } catch (e) { out.periodsError = e.message; }

  try {
    const d = await stat(`metrics=ym:s:visits&dimensions=ym:s:lastTrafficSource&date1=${shift(-28)}&date2=${DATE}&limit=8`);
    out.sources = d.data.map(r => [r.dimensions[0].name, r.metrics[0]]).filter(r => r[1] > 0);
  } catch (e) { out.sourcesError = e.message; }

  try {
    const d = await stat(`metrics=ym:s:visits&dimensions=ym:s:searchPhrase&date1=${shift(-28)}&date2=${DATE}&limit=15`);
    out.phrases = d.data.map(r => [r.dimensions[0].name, r.metrics[0]]).filter(r => r[1] > 0);
  } catch (e) { out.phrasesError = e.message; }

  try {
    const goals = await get(`https://api-metrika.yandex.net/management/v1/counter/${id}/goals`, h);
    out.goals = [];
    for (const g of goals.goals) {
      try {
        const d = await stat(`metrics=ym:s:goal${g.id}reaches&date1=${shift(-28)}&date2=${DATE}`);
        out.goals.push([g.name, d.totals[0]]);
      } catch { out.goals.push([g.name, null]); }
    }
  } catch (e) { out.goalsError = e.message; }

  return out;
}

/* ── 3. Яндекс.Вебмастер ───────────────────────────────────────────── */

async function webmaster() {
  const token = SITE.YANDEX_TOKEN;
  if (!token) return { error: "YANDEX_TOKEN не задан" };
  const h = { Authorization: `OAuth ${token}` };
  const me = await get("https://api.webmaster.yandex.net/v4/user/", h);
  const uid = me.user_id;
  const hosts = await get(`https://api.webmaster.yandex.net/v4/user/${uid}/hosts/`, h);
  if (!hosts.hosts || !hosts.hosts.length) return { error: "сайт не добавлен в Вебмастер" };
  const host = hosts.hosts[0];
  const out = { host: host.unicode_host_url, verified: host.verified };
  const base = `https://api.webmaster.yandex.net/v4/user/${uid}/hosts/${host.host_id}`;
  try {
    const s = await get(`${base}/summary`, h);
    out.summary = { inSearch: s.searchable_pages_count, excluded: s.excluded_pages_count, sqi: s.sqi, problems: s.site_problems };
  } catch (e) { out.summaryError = e.message; }
  try {
    const q = await get(`${base}/search-queries/popular/?order_by=TOTAL_SHOWS&query_indicator=TOTAL_SHOWS&query_indicator=TOTAL_CLICKS&limit=15`, h);
    out.queries = (q.queries || []).map(x => [x.query_text, x.indicators.TOTAL_SHOWS || 0, x.indicators.TOTAL_CLICKS || 0]);
  } catch (e) { out.queriesError = e.message; }
  try {
    const sm = await get(`${base}/sitemaps/`, h);
    out.sitemaps = (sm.sitemaps || []).map(x => [x.sitemap_url, x.urls_count]);
  } catch (e) { out.sitemapsError = e.message; }
  return out;
}

/* ── 4. Состояние сайта ────────────────────────────────────────────── */

function siteState() {
  const out = {};
  try {
    const { loadGuides, loadSemcore, buildPages, loadAnalyticsSecrets } = require("./build");
    loadAnalyticsSecrets();
    const { GUIDES } = loadGuides();
    const semcore = loadSemcore();
    const pages = buildPages(GUIDES, semcore);
    const { words } = require("./lib/text");
    const w = pages.map(p => p.words || words(p.plainBody || ""));
    out.articles = pages.length;
    out.words = w.reduce((a, b) => a + b, 0);
    out.avgWords = Math.round(out.words / (pages.length || 1));
    out.thin = pages.filter(p => (p.words || 0) < 700).length;
    out.noCluster = pages.filter(p => !p.cluster).length;
    const covered = semcore.clusters.filter(c => c.page).length;
    out.core = { clusters: semcore.clusters.length, covered, gaps: semcore.clusters.length - covered };
    const fresh = pages.filter(p => (p.date || "") >= shift(-7)).length;
    out.newLast7 = fresh;
  } catch (e) { out.error = e.message; }
  try {
    const sm = fs.readFileSync(R("sitemap.xml"), "utf8");
    out.sitemapUrls = (sm.match(/<loc>/g) || []).length;
  } catch {}
  try {
    const dir = R("seo/reports");
    const last = fs.readdirSync(dir).filter(f => f.startsWith("audit-")).sort().pop();
    if (last) {
      const txt = fs.readFileSync(path.join(dir, last), "utf8");
      out.audit = { file: last, critical: (txt.match(/^### /gm) || []).length };
      const m = txt.match(/## КРИТИЧНО — (\d+)/); if (m) out.audit.critical = Number(m[1]);
      const m2 = txt.match(/## ВАЖНО — (\d+)/); if (m2) out.audit.important = Number(m2[1]);
    }
  } catch {}
  return out;
}

async function liveCheck() {
  const urls = ["https://tolstobrovevgeniy.ru/", "https://tolstobrovevgeniy.ru/sitemap.xml", "https://tolstobrovevgeniy.ru/rss.xml"];
  const res = [];
  for (const u of urls) {
    try { const r = await fetch(u, { method: "GET" }); res.push([u, r.status]); }
    catch (e) { res.push([u, "нет ответа"]); }
  }
  return res;
}

/* ── Отчёт ─────────────────────────────────────────────────────────── */

const num = n => (n === null || n === undefined) ? "—" : (Math.round(Number(n) * 100) / 100).toLocaleString("ru-RU");

function render(d) {
  const L = [];
  L.push(`# СЕО-отчёт · ${DATE}`, "");

  /* Коротко */
  const own = d.own || {};
  const t = (own.daily || [])[0];
  const m28 = (d.metrika.periods || []).find(p => p.label === "28 дней");
  L.push("## Коротко", "");
  L.push(`- Статей на сайте: **${d.site.articles || "—"}**, слов всего: **${num(d.site.words)}**, в среднем **${d.site.avgWords || "—"}**`);
  L.push(`- За 7 дней вышло новых: **${d.site.newLast7 ?? "—"}**, в карте сайта адресов: **${d.site.sitemapUrls || "—"}**`);
  if (d.site.core) L.push(`- Ядро: кластеров **${d.site.core.clusters}**, покрыто страницами **${d.site.core.covered}**, дыр **${d.site.core.gaps}**`);
  L.push(`- Свой счётчик за последний день с событиями: **${t ? `${t.pageviews} просмотров / ${t.visitors} читателей / ${t.tg_clicks} кликов в ТГ` : "событий нет"}**`);
  L.push(`- Метрика за 28 дней: **${m28 ? `${num(m28.visits)} визитов / ${num(m28.users)} посетителей` : (d.metrika.error || d.metrika.periodsError || "нет данных")}**`);
  if (d.wm && d.wm.summary) L.push(`- В поиске Яндекса страниц: **${num(d.wm.summary.inSearch)}**, ИКС **${num(d.wm.summary.sqi)}**`);
  else if (d.wm) L.push(`- Вебмастер: **${d.wm.summaryError || d.wm.error || "данных пока нет"}**`);
  L.push("");

  /* Свой счётчик */
  L.push("## Свой счётчик", "");
  if (own.error) L.push(`Недоступен: ${own.error}`, "");
  else {
    if (!own.daily.length) L.push("Событий не записано ни одного.", "");
    else {
      L.push("| День | Просмотры | Читатели | Дочитали | Клики в ТГ |", "|---|---|---|---|---|");
      for (const r of own.daily) L.push(`| ${String(r.day).slice(0, 10)} | ${r.pageviews} | ${r.visitors} | ${r.read_complete} | ${r.tg_clicks} |`);
      L.push("");
    }
    if (own.pages && own.pages.length) {
      L.push("**Страницы**", "", "| Адрес | Просмотры | Прокрутили 75% | Дочитали | В ТГ |", "|---|---|---|---|---|");
      for (const p of own.pages) L.push(`| ${p.path} | ${p.pageviews} | ${p.scroll_75} | ${p.read_complete} | ${p.tg_clicks} |`);
      L.push("");
    }
    if (own.sources && own.sources.length) {
      L.push("**Откуда приходят** — " + own.sources.map(([s, n]) => `${s}: ${n}`).join(", "), "");
    }
  }

  /* Метрика */
  L.push("## Яндекс.Метрика", "");
  const M = d.metrika;
  if (M.error) L.push(`Недоступна: ${M.error}`, "");
  else {
    if (M.counter) L.push(`Счётчик #${M.id} · статус ${M.counter.status} · код на сайте: ${M.counter.code}${M.counter.code === "CS_ERR_UNKNOWN" ? " (робот ещё не проверил или счётчик режется блокировщиком)" : ""}`, "");
    if (M.periods) {
      L.push("| Период | Визиты | Посетители | Просмотры | Отказы % | Время, с |", "|---|---|---|---|---|---|");
      for (const p of M.periods) L.push(`| ${p.label} | ${num(p.visits)} | ${num(p.users)} | ${num(p.pageviews)} | ${num(p.bounce)} | ${num(p.dur)} |`);
      L.push("");
    } else L.push(`Цифры не пришли: ${M.periodsError}`, "");
    if (M.sources && M.sources.length) L.push("**Источники (28 дней)** — " + M.sources.map(([s, n]) => `${s}: ${num(n)}`).join(", "), "");
    if (M.phrases && M.phrases.length) {
      L.push("", "**Поисковые фразы (28 дней)**", "");
      for (const [q, n] of M.phrases) L.push(`- ${q} — ${num(n)}`);
      L.push("");
    }
    if (M.goals && M.goals.length) L.push("**Цели (28 дней)** — " + M.goals.map(([g, n]) => `${g}: ${num(n)}`).join(", "), "");
  }
  L.push("");

  /* Вебмастер */
  L.push("## Яндекс.Вебмастер", "");
  const W = d.wm;
  if (!W || W.error) L.push(`Недоступен: ${(W && W.error) || "нет токена"}`, "");
  else {
    L.push(`Сайт ${W.host} · права ${W.verified ? "подтверждены" : "НЕ подтверждены"}`, "");
    if (W.summary) {
      L.push(`- В поиске: **${num(W.summary.inSearch)}** страниц, исключено: ${num(W.summary.excluded)}, ИКС: ${num(W.summary.sqi)}`);
      if (W.summary.problems) L.push(`- Проблемы: ${JSON.stringify(W.summary.problems)}`);
    } else L.push(`- Сводка: ${W.summaryError} — данные появляются через несколько дней после подтверждения прав.`);
    if (W.queries && W.queries.length) {
      L.push("", "**Запросы: показы → клики**", "");
      for (const [q, s, c] of W.queries) L.push(`- ${q} — ${num(s)} → ${num(c)}`);
    } else if (W.queriesError) L.push(`- Запросы: ${W.queriesError}`);
    if (W.sitemaps) L.push("", `- Карт сайта обработано: ${W.sitemaps.length ? W.sitemaps.map(([u, n]) => `${u} (${num(n)})`).join(", ") : "ни одной — Яндекс ещё не забрал sitemap.xml"}`);
    L.push("");
  }

  /* Сайт */
  L.push("## Сайт", "");
  L.push(`- Тонких статей (< 700 слов): **${d.site.thin ?? "—"}**`);
  L.push(`- Статей без привязки к кластеру: **${d.site.noCluster ?? "—"}**`);
  if (d.site.audit) L.push(`- Последний аудит ${d.site.audit.file}: критично **${d.site.audit.critical}**, важно **${d.site.audit.important ?? "—"}**`);
  L.push("- Живые адреса: " + d.live.map(([u, s]) => `${u.replace("https://tolstobrovevgeniy.ru", "")} → ${s}`).join(", "));
  L.push("");

  return L.join("\n");
}

function shortDigest(d) {
  const t = (d.own.daily || [])[0];
  const m7 = (d.metrika.periods || []).find(p => p.label === "7 дней");
  const lines = [`СЕО · ${DATE}`];
  lines.push(`Статей ${d.site.articles}, в карте ${d.site.sitemapUrls}, ядро покрыто ${d.site.core ? d.site.core.covered + "/" + d.site.core.clusters : "—"}`);
  lines.push(`Свой счётчик: ${t ? `${t.pageviews} просмотров, ${t.visitors} читателей, ${t.tg_clicks} в ТГ (${String(t.day).slice(0, 10)})` : "событий нет"}`);
  lines.push(`Метрика 7 дней: ${m7 ? `${num(m7.visits)} визитов, ${num(m7.users)} посетителей` : "нет данных"}`);
  if (d.wm && d.wm.summary) lines.push(`В поиске: ${num(d.wm.summary.inSearch)} страниц, ИКС ${num(d.wm.summary.sqi)}`);
  else lines.push("В поиске: Вебмастер ещё не отдаёт данные");
  return lines.join("\n");
}

async function toTelegram(text) {
  const tg = readEnv("tg.env");
  if (!tg.TG_BOT_TOKEN || !tg.TG_CHAT_ID) return "нет tg.env";
  const r = await fetch(`https://api.telegram.org/bot${tg.TG_BOT_TOKEN}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: tg.TG_CHAT_ID, text, disable_web_page_preview: true })
  });
  return r.ok ? "отправлено" : "ошибка " + r.status;
}

(async () => {
  const [own, met, wm, live] = await Promise.all([
    ownCounter().catch(e => ({ error: e.message })),
    metrika().catch(e => ({ error: e.message })),
    webmaster().catch(e => ({ error: e.message })),
    liveCheck().catch(() => [])
  ]);
  const d = { own, metrika: met, wm, live, site: siteState() };

  const md = render(d);
  const dir = R("seo/reports");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `отчёт-${DATE}.md`);
  fs.writeFileSync(file, md);

  console.log(shortDigest(d));
  console.log(`\nОтчёт: seo/reports/отчёт-${DATE}.md`);
  if (TO_TG) console.log("Telegram: " + await toTelegram(shortDigest(d) + `\n\nПолный отчёт: site/seo/reports/отчёт-${DATE}.md`));
})();
