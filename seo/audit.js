#!/usr/bin/env node
/* =====================================================================
   СЕО-ДВИЖОК · АУДИТ
   Смотрит на сайт глазами поисковика и выдаёт список задач по приоритету.
   Запуск:  node seo/audit.js  [--md]
   ===================================================================== */

const fs = require("fs");
const path = require("path");
const C = require("./config");
const { buildPages, buildTopics, loadGuides, loadSemcore, loadAnalyticsSecrets } = require("./build");
const { words, plain } = require("./lib/text");

const ROOT = path.resolve(__dirname, "..");
const R = (...p) => path.join(ROOT, ...p);

const PRIORITY = { "критично": 0, "важно": 1, "стоит": 2 };

function audit() {
  loadAnalyticsSecrets();
  const { GUIDES } = loadGuides();
  const semcore = loadSemcore();
  const pages = buildPages(GUIDES, semcore);
  const topics = buildTopics(pages);
  const issues = [];
  const add = (level, code, msg, items) => issues.push({ level, code, msg, items: items || [] });

  /* ── Счётчики и подтверждение прав ─────────────────────────────── */
  const a = C.analytics;
  if (!a.metrikaId) add("критично", "metrika", "Яндекс.Метрика не подключена — трафик не считается", []);
  if (!a.verification.yandex) add("важно", "webmaster", "Нет мета-тега подтверждения прав Яндекс.Вебмастера", []);
  if (!a.own.url) add("стоит", "own", "Свой счётчик не настроен (site-analytics.env)", []);

  /* ── Уникальность title / description ──────────────────────────── */
  dupes(pages.map(p => [p.metaTitle, p.slug])).forEach(d =>
    add("критично", "dup-title", `Одинаковый <title> у ${d.items.length} страниц: «${d.key.slice(0, 60)}»`, d.items));
  dupes(pages.map(p => [p.description, p.slug])).forEach(d =>
    add("критично", "dup-desc", `Одинаковый description у ${d.items.length} страниц`, d.items));

  /* ── Длина сниппета ────────────────────────────────────────────── */
  const longTitles = pages.filter(p => p.metaTitle.length > C.seo.titleMax + 15).map(p => `${p.slug} (${p.metaTitle.length})`);
  if (longTitles.length) add("стоит", "title-len",
    `Title длиннее ${C.seo.titleMax + 15} символов — обрежется в выдаче`, longTitles);

  const shortDesc = pages.filter(p => p.description.length < 70).map(p => `${p.slug} (${p.description.length})`);
  if (shortDesc.length) add("важно", "desc-len", "Слишком короткий description (< 70 символов)", shortDesc);

  /* ── Тонкий контент: главный ограничитель позиций ──────────────── */
  const thin = pages.filter(p => p.words < C.seo.thinWords)
    .sort((x, y) => x.words - y.words)
    .map(p => `${p.slug} — ${p.words} слов`);
  if (thin.length) add("критично", "thin",
    `Тонкие статьи (< ${C.seo.thinWords} слов): в топе по конкурентным запросам такие не держатся`, thin);

  /* ── Структура ─────────────────────────────────────────────────── */
  const noH2 = pages.filter(p => p.toc.filter(h => h.level === 2).length < 2).map(p => p.slug);
  if (noH2.length) add("важно", "structure", "Меньше двух H2 — нет структуры под быстрые ответы", noH2);

  const noFaq = pages.filter(p => !p.faq || !p.faq.length).map(p => p.slug);
  if (noFaq.length) add("стоит", "faq",
    "Нет блока вопрос-ответ: без него не попасть в блок быстрых ответов Яндекса", noFaq.slice(0, 40));

  /* ── Перелинковка и страницы-сироты ────────────────────────────── */
  const inbound = new Map(pages.map(p => [p.slug, 0]));
  for (const p of pages) {
    const links = [...p.html.matchAll(/href="\/g\/([^/"]+)\//g)].map(m => m[1]);
    for (const r of p.related) links.push(r.slug);
    for (const l of new Set(links)) if (inbound.has(l)) inbound.set(l, inbound.get(l) + 1);
  }
  const orphans = [...inbound].filter(([, n]) => n === 0).map(([s]) => s);
  if (orphans.length) add("важно", "orphan", "Страницы без входящих ссылок — вес до них не доходит", orphans);

  /* ── Битые внутренние ссылки ───────────────────────────────────── */
  const known = new Set(pages.map(p => `/g/${p.slug}/`));
  const broken = [];
  for (const p of pages) {
    for (const m of p.html.matchAll(/href="(\/[^"#]*)"/g)) {
      const href = m[1];
      if (href.startsWith("/g/") && !known.has(href)) broken.push(`${p.slug} → ${href}`);
      else if (!href.startsWith("/g/") && !href.startsWith("/tema/") && !fs.existsSync(R(href.replace(/^\//, "")))) {
        if (!/^\/(index|$)/.test(href)) broken.push(`${p.slug} → ${href}`);
      }
    }
  }
  if (broken.length) add("важно", "broken", "Битые внутренние ссылки", [...new Set(broken)]);

  /* ── Картинки ──────────────────────────────────────────────────── */
  const noImg = pages.filter(p => !p.image).map(p => p.slug);
  if (noImg.length) add("стоит", "og-image",
    `Нет своей картинки — в соцсетях и выдаче показывается общая обложка (${noImg.length} шт.)`, noImg.slice(0, 40));

  /* ── Покрытие семантического ядра ──────────────────────────────── */
  if (!semcore.clusters.length) {
    add("критично", "semcore",
      "Семантическое ядро пустое — сайт пишется вслепую. Импортируй Вордстат: node seo/semcore/import.js", []);
  } else {
    const covered = new Set(semcore.clusters.filter(c => c.page).map(c => c.id));
    const uncovered = semcore.clusters.filter(c => !c.page)
      .sort((x, y) => (y.frequency || 0) - (x.frequency || 0));
    // Ядро может быть собрано из Вордстата (есть частоты) или из проверки
    // спроса (частот нет, есть сигнал подсказок). Не смешиваем одно с другим.
    const bySignal = semcore.clusters.some(c => c.frequency == null && c.signal != null);
    const weight = c => (bySignal ? (c.signal || 0) : (c.frequency || 0));
    const unit = bySignal ? "сигнал" : "/мес";
    uncovered.sort((x, y) => weight(y) - weight(x));
    if (uncovered.length) add("критично", "gap",
      bySignal
        ? `Тем без страницы: ${uncovered.length} (спрос подтверждён подсказками, частот пока нет — нужен Вордстат)`
        : `Кластеров без страницы: ${uncovered.length} (суммарная частота ${sum(uncovered.map(c => c.frequency || 0))}/мес)`,
      uncovered.slice(0, 30).map(c => `${c.suggestedTitle || c.name} — ${unit} ${weight(c)}`));

    const noCluster = pages.filter(p => !p.cluster).map(p => p.slug);
    if (noCluster.length) add("важно", "no-cluster",
      "Статьи без привязки к кластеру запросов — под какой запрос они написаны, неизвестно", noCluster);
  }

  /* ── Файлы индексации ──────────────────────────────────────────── */
  for (const f of ["sitemap.xml", "robots.txt", "rss.xml", "index.html"]) {
    if (!fs.existsSync(R(f))) add("критично", "missing", `Нет файла ${f} — запусти node seo/build.js`, []);
  }

  issues.sort((x, y) => PRIORITY[x.level] - PRIORITY[y.level]);
  return { issues, pages, topics, semcore };
}

function dupes(pairs) {
  const map = new Map();
  for (const [key, slug] of pairs) {
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(slug);
  }
  return [...map].filter(([, v]) => v.length > 1).map(([key, items]) => ({ key, items }));
}

const sum = arr => arr.reduce((a, b) => a + b, 0);

function report({ issues, pages, semcore }) {
  const date = new Date().toISOString().slice(0, 10);
  const totalWords = sum(pages.map(p => p.words));
  const lines = [];
  lines.push(`# СЕО-аудит сайта · ${date}`, "");
  lines.push(`- Страниц статей: **${pages.length}**, слов всего: **${totalWords}**, в среднем: **${Math.round(totalWords / pages.length)}**`);
  lines.push(`- Кластеров в ядре: **${semcore.clusters.length}**, покрыто страницами: **${semcore.clusters.filter(c => c.page).length}**`);
  lines.push(`- Счётчики: ${C.analytics.metrikaId ? "Метрика #" + C.analytics.metrikaId : "**не подключены**"}`);
  lines.push("");

  for (const level of ["критично", "важно", "стоит"]) {
    const group = issues.filter(i => i.level === level);
    if (!group.length) continue;
    lines.push(`## ${level.toUpperCase()} — ${group.length}`, "");
    for (const i of group) {
      lines.push(`### ${i.msg}`);
      if (i.items.length) {
        lines.push(...i.items.slice(0, 40).map(x => `- ${x}`));
        if (i.items.length > 40) lines.push(`- …ещё ${i.items.length - 40}`);
      }
      lines.push("");
    }
  }
  return lines.join("\n");
}

if (require.main === module) {
  const result = audit();
  const md = report(result);
  const dir = R("seo/reports");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `audit-${new Date().toISOString().slice(0, 10)}.md`);
  fs.writeFileSync(file, md);

  const counts = { "критично": 0, "важно": 0, "стоит": 0 };
  result.issues.forEach(i => counts[i.level]++);
  console.log(`Аудит: критично ${counts["критично"]}, важно ${counts["важно"]}, стоит ${counts["стоит"]}`);
  for (const i of result.issues) console.log(`  [${i.level}] ${i.msg}${i.items.length ? ` (${i.items.length})` : ""}`);
  console.log(`\nОтчёт: ${path.relative(ROOT, file)}`);
}

module.exports = { audit, report };
