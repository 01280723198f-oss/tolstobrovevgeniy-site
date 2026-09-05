#!/usr/bin/env node
/* =====================================================================
   СЕО-ДВИЖОК · СБОРКА
   guides.js  →  статические страницы, карта сайта, robots, RSS, хабы тем.
   Запуск:  node seo/build.js        (из папки site/)
   ===================================================================== */

const fs = require("fs");
const path = require("path");
const os = require("os");

const C = require("./config");
const { render } = require("./lib/markdown");
const { related, injectContextual } = require("./lib/links");
const { slugify, words, clamp, toISO, plain, escapeHtml, tokens } = require("./lib/text");
const P = require("./lib/page");

const ROOT = path.resolve(__dirname, "..");
const R = (...p) => path.join(ROOT, ...p);

/* ── 1. Данные: guides.js + семантическая карта ─────────────────── */

function loadGuides() {
  const src = fs.readFileSync(R("guides.js"), "utf8");
  const sandbox = {};
  // guides.js — обычный скрипт браузера: объявления const превращаем в поля объекта.
  new Function("g", src.replace(/^const /gm, "g."))(sandbox);
  return { CONFIG: sandbox.CONFIG, GUIDES: sandbox.GUIDES };
}

function loadSemcore() {
  const f = R("seo/semcore/data/core.json");
  if (!fs.existsSync(f)) return { clusters: [], byPage: {} };
  const core = JSON.parse(fs.readFileSync(f, "utf8"));
  const byPage = {};
  for (const cl of core.clusters || []) {
    if (cl.page) byPage[cl.page] = cl;
  }
  return { clusters: core.clusters || [], byPage };
}

/* ── 2. Счётчики: подхватываем ключи из секретницы ──────────────── */

function loadAnalyticsSecrets() {
  const file = path.join(os.homedir(), ".claude/secrets/site-analytics.env");
  if (!fs.existsSync(file)) return;
  const env = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  const a = C.analytics;
  if (env.METRIKA_ID) a.metrikaId = env.METRIKA_ID;
  if (env.GA4_ID) a.ga4Id = env.GA4_ID;
  if (env.YANDEX_VERIFICATION) a.verification.yandex = env.YANDEX_VERIFICATION;
  if (env.GOOGLE_VERIFICATION) a.verification.google = env.GOOGLE_VERIFICATION;
  if (env.OWN_ANALYTICS_URL) a.own.url = env.OWN_ANALYTICS_URL;
  if (env.OWN_ANALYTICS_KEY) a.own.key = env.OWN_ANALYTICS_KEY;
  if (env.OWN_ANALYTICS_TABLE) a.own.table = env.OWN_ANALYTICS_TABLE;
}

/* ── 3. Подготовка страниц ─────────────────────────────────────── */

const TOPIC_DESCRIPTIONS = {
  "Claude Code": "Инструкции по Claude Code: установка, настройка под проект, скиллы, память, MCP и автоматизация рутины.",
  "Инструкция": "Пошаговые инструкции контент-завода: от голого терминала до машины, которая выпускает контент без рук.",
  "Разбор": "Разборы механик и инструментов: что реально работает в ИИ-контенте, а что продаётся как магия.",
  "Контент-завод": "Контент-завод на коде: роли, конвейеры, расписание, публикация и аналитика без ручного труда.",
  "Воронка": "Воронки на коде: кодовое слово, статья-лидмагнит, микро-продукт и путь от просмотра до оплаты.",
  "Обучение": "Как учиться ИИ-инструментам по делу: источники, порядок, практика вместо курсов.",
  "Build in public": "Дневник стройки в открытую: цифры, ошибки и решения по ходу запуска.",
  "Дневник стройки": "Хроника сборки контент-завода: что делалось в конкретный день и что из этого вышло."
};

function buildPages(GUIDES, semcore) {
  const pages = GUIDES.map(g => {
    const slug = g.slug || g.id;
    const url = `${C.origin}/${C.paths.article}/${slug}/`;
    const cl = semcore.byPage[slug] || null;
    const md = render(g.markdown, { origin: C.origin });
    const body = plain(g.markdown);
    const firstRaster = (g.markdown.match(/!\[[^\]]*\]\(([^)]+\.(?:png|jpe?g|webp))\)/i) || [])[1];

    const seoTitle = g.seoTitle || (cl && cl.title) || g.title;
    const description = g.seoDescription || (cl && cl.description) || clamp(g.subtitle, C.seo.descriptionMax);
    const keywords = g.keywords || (cl ? cl.queries.map(q => q.q || q) : []);

    return {
      id: g.id, slug, url, tag: g.tag, date: g.date, iso: toISO(g.date),
      isoModified: g.updated ? toISO(g.updated) : toISO(g.date),
      readingTime: g.readingTime, title: g.title, subtitle: g.subtitle,
      shortSub: clamp(g.subtitle, 190),
      seoTitle,
      metaTitle: buildMetaTitle(seoTitle),
      description,
      keywords,
      cluster: cl ? cl.id : null,
      words: words(g.markdown),
      html: md.html, toc: md.toc, faq: g.faq || md.faq,
      plainBody: body,
      image: firstRaster ? (firstRaster.startsWith("/") ? firstRaster : "/" + firstRaster.replace(/^\.?\//, "")) : null,
      related: []
    };
  });

  // Похожие статьи
  const rel = related(pages, C.seo.relatedCount);
  pages.forEach(p => { p.related = rel.get(p.slug) || []; });

  // Контекстные ссылки внутри текста.
  // Якорь = поисковый запрос кластера (если есть) либо словосочетание из заголовка.
  const targets = pages.map(p => ({
    url: `/${C.paths.article}/${p.slug}/`,
    anchors: anchorsFor(p)
  }));
  pages.forEach(p => {
    p.html = injectContextual(p.html, targets.filter(t => t.url !== `/${C.paths.article}/${p.slug}/`), 3);
  });

  return pages;
}

/** Кандидаты в якоря: запросы кластера + значимые словосочетания заголовка.
    Длинные и редкие фразы идут первыми — они точнее описывают, куда ведёт ссылка. */
function anchorsFor(p) {
  const out = [];
  for (const k of p.keywords || []) if (typeof k === "string") out.push(k);
  out.push(p.title);
  for (const src of [p.title, p.subtitle]) {
    const clean = String(src).replace(/[«»"„“(),.:;!?—–]/g, " ").replace(/\s+/g, " ").trim();
    const w = clean.split(" ");
    for (let n = 4; n >= 2; n--) {
      for (let i = 0; i + n <= w.length; i++) {
        const phrase = w.slice(i, i + n).join(" ");
        if (phrase.length < 10 || phrase.length > 45) continue;
        if (/^(и|в|на|с|по|для|из|как|что|это|не|а|но|или|то|же|за|от|до|у|о|про)\b/i.test(phrase)) continue;
        if (tokens(phrase).length < 2) continue;
        out.push(phrase);
      }
    }
  }
  return [...new Set(out)].sort((a, b) => b.length - a.length).slice(0, 24);
}

function buildMetaTitle(title) {
  const t = String(title).trim();
  const suffix = " — " + C.brand;
  return (t.length + suffix.length <= C.seo.titleMax + 20) ? t + suffix : t;
}

function buildTopics(pages) {
  const map = new Map();
  for (const p of pages) {
    if (!map.has(p.tag)) {
      const slug = slugify(p.tag);
      map.set(p.tag, {
        name: p.tag, slug, url: `${C.origin}/${C.paths.topic}/${slug}/`,
        description: TOPIC_DESCRIPTIONS[p.tag] || `Материалы по теме «${p.tag}» от ${C.brand}.`,
        pages: []
      });
    }
    map.get(p.tag).pages.push(p);
  }
  const topics = [...map.values()].sort((a, b) => b.pages.length - a.pages.length);
  topics.forEach(t => { t.count = t.pages.length; });
  pages.forEach(p => { p.topic = topics.find(t => t.name === p.tag); });
  return topics;
}

/* ── 4. Запись файлов ──────────────────────────────────────────── */

function write(rel, content) {
  const file = R(rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return rel;
}

function sitemap(pages, topics) {
  const urls = [
    { loc: C.origin + "/", lastmod: pages[0] ? pages[0].isoModified : today(), priority: "1.0", freq: "daily" },
    ...topics.map(t => ({
      loc: t.url, priority: "0.7", freq: "weekly",
      lastmod: t.pages.map(p => p.isoModified).sort().pop()
    })),
    ...pages.map(p => ({ loc: p.url, lastmod: p.isoModified, priority: "0.8", freq: "monthly" }))
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod || today()}</lastmod>
    <changefreq>${u.freq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join("\n")}
</urlset>
`;
}

const today = () => new Date().toISOString().slice(0, 10);

function robots() {
  return `User-agent: *
Allow: /
${C.disallow.map(d => "Disallow: " + d).join("\n")}

Sitemap: ${C.origin}/sitemap.xml
`;
}

function rss(pages) {
  const items = pages.slice(0, 20).map(p => `    <item>
      <title>${escapeHtml(p.title)}</title>
      <link>${p.url}</link>
      <guid isPermaLink="true">${p.url}</guid>
      <pubDate>${new Date(p.iso + "T09:00:00Z").toUTCString()}</pubDate>
      <category>${escapeHtml(p.tag)}</category>
      <description>${escapeHtml(p.subtitle)}</description>
    </item>`).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeHtml(C.siteName)}</title>
    <link>${C.origin}/</link>
    <description>${escapeHtml(C.author.jobTitle)}</description>
    <language>ru</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${C.origin}/rss.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`;
}

/** Старые ссылки guide.html?id=X остаются живыми: мгновенный редирект. */
function redirectShim(pages) {
  const map = JSON.stringify(Object.fromEntries(pages.map(p => [p.id, `/${C.paths.article}/${p.slug}/`])));
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Переход к инструкции — ${escapeHtml(C.brand)}</title>
  <meta name="robots" content="noindex, follow">
  <link rel="canonical" href="${C.origin}/">
  <link rel="stylesheet" href="/styles.css">
  <script>
    // Совместимость со старыми ссылками из постов, бота и воронок.
    var MAP = ${map};
    var id = new URLSearchParams(location.search).get("id");
    var to = (id && MAP[id]) || "/";
    location.replace(to + location.hash);
  </script>
</head>
<body>
  <main class="wrap" style="padding:60px 22px">
    <p>Инструкция переехала на постоянный адрес. <a href="/">Открыть библиотеку инструкций</a>.</p>
  </main>
</body>
</html>
`;
}

function notFound(pages, topics) {
  const top = pages.slice(0, 6).map(p => `<li><a href="${p.url}">${escapeHtml(p.title)}</a></li>`).join("");
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Страница не найдена — ${escapeHtml(C.brand)}</title>
  <meta name="robots" content="noindex, follow">
  <link rel="stylesheet" href="/styles.css">
  <link rel="stylesheet" href="/assets/seo.css">
</head>
<body>
  <main class="wrap" style="padding:60px 22px">
    <h1>Такой страницы нет</h1>
    <p class="lead">Зато есть эти — свежие инструкции по контент-заводу:</p>
    <ul>${top}</ul>
    <p><a href="/">Все инструкции →</a></p>
  </main>
</body>
</html>
`;
}

/* ── 5. Прогон ─────────────────────────────────────────────────── */

function main() {
  loadAnalyticsSecrets();
  const { GUIDES } = loadGuides();
  const semcore = loadSemcore();

  const pages = buildPages(GUIDES, semcore);
  const topics = buildTopics(pages);

  const written = [];

  // Чистим прошлые статьи-страницы, чтобы удалённые не висели в индексе.
  const artDir = R(C.paths.article);
  if (fs.existsSync(artDir)) fs.rmSync(artDir, { recursive: true, force: true });
  const topDir = R(C.paths.topic);
  if (fs.existsSync(topDir)) fs.rmSync(topDir, { recursive: true, force: true });

  for (const p of pages) written.push(write(`${C.paths.article}/${p.slug}/index.html`, P.articlePage(p, { topics })));
  for (const t of topics) written.push(write(`${C.paths.topic}/${t.slug}/index.html`, P.topicPage(t, t.pages, topics)));

  written.push(write("index.html", P.indexPage(pages, topics)));
  written.push(write("guide.html", redirectShim(pages)));
  written.push(write("404.html", notFound(pages, topics)));
  written.push(write("sitemap.xml", sitemap(pages, topics)));
  written.push(write("robots.txt", robots()));
  written.push(write("rss.xml", rss(pages)));

  const a = C.analytics;
  const counters = [
    a.metrikaId ? "Метрика #" + a.metrikaId : null,
    a.ga4Id ? "GA4 " + a.ga4Id : null,
    a.own.url ? "свой счётчик" : null
  ].filter(Boolean);

  console.log(`✓ Собрано: ${pages.length} статей, ${topics.length} тем, ${written.length} файлов`);
  console.log(`  Темы: ${topics.map(t => t.name + "(" + t.count + ")").join(", ")}`);
  console.log(`  Счётчики: ${counters.length ? counters.join(", ") : "не подключены (заполни ~/.claude/secrets/site-analytics.env)"}`);
  const thin = pages.filter(p => p.words < C.seo.thinWords);
  if (thin.length) console.log(`  ⚠ Тонких статей (< ${C.seo.thinWords} слов): ${thin.length} — см. node seo/audit.js`);
  return { pages, topics };
}

if (require.main === module) main();
module.exports = { main, buildPages, buildTopics, loadGuides, loadSemcore, loadAnalyticsSecrets };
