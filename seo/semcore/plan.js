#!/usr/bin/env node
/* =====================================================================
   СЕМЯДРО · ПЛАН
   Карта покрытия + очередь статей + расчёт пути к цели по трафику.
   Запуск: node seo/semcore/plan.js
   Пишет:  seo/semcore/PLAN.md
   ===================================================================== */

const fs = require("fs");
const path = require("path");

const niche = require("./niche");
const { forecastVisits } = require("./lib");
const { buildPages, loadGuides, loadSemcore } = require("../build");
const C = require("../config");

const CORE = path.join(__dirname, "data/core.json");

/* Модель: страница в топ-3 снимает ~25 % точной частоты кластера.
   Доля кластеров, реально доезжающих до топ-3 на молодом домене, — около
   трети в первый год. Обе цифры сознательно осторожные. */
const TOP3_SHARE = 0.33;

function main() {
  if (!fs.existsSync(CORE)) {
    console.log("Нет ядра. Сначала: node seo/semcore/import.js");
    process.exit(1);
  }
  const core = JSON.parse(fs.readFileSync(CORE, "utf8"));
  const { GUIDES } = loadGuides();
  const pages = buildPages(GUIDES, loadSemcore());
  const bySlug = new Map(pages.map(p => [p.slug, p]));

  const covered = core.clusters.filter(c => c.page);
  const gaps = core.clusters.filter(c => !c.page).sort((a, b) => b.frequency - a.frequency);

  /* ── Что делать с уже существующими страницами ──────────────────── */
  const upgrade = covered.map(c => {
    const p = bySlug.get(c.page);
    if (!p) return null;
    const missing = c.queries.filter(q => !containsQuery(p.plainBody + " " + p.title, q.q));
    return {
      cluster: c, page: p,
      thin: p.words < C.seo.thinWords,
      missing: missing.slice(0, 12),
      potential: forecastVisits(c.frequency)
    };
  }).filter(Boolean).sort((a, b) => b.potential - a.potential);

  /* ── Путь к цели ────────────────────────────────────────────────── */
  const goalMonth = niche.goal.visitsPerDay * 30;
  const nowPotential = Math.round(sum(covered.map(c => forecastVisits(c.frequency))) * TOP3_SHARE);
  const avgCluster = gaps.length ? Math.round(sum(gaps.map(c => c.frequency)) / gaps.length) : 0;
  const perArticle = Math.round(forecastVisits(avgCluster) * TOP3_SHARE);
  const needArticles = perArticle > 0 ? Math.ceil((goalMonth - nowPotential) / perArticle) : null;

  /* ── Отчёт ──────────────────────────────────────────────────────── */
  const L = [];
  L.push(`# План продвижения · ${new Date().toLocaleDateString("sv")}`, "");
  L.push(`Ядро: **${core.totals.queries}** запросов, **${core.totals.clusters}** кластеров, суммарная частота **${core.totals.frequency}/мес**.`);
  L.push(`Покрыто страницами: **${covered.length}**, без страницы: **${gaps.length}**.`, "");

  L.push(`## Цель: ${niche.goal.visitsPerDay} визитов из поиска в день`, "");
  L.push(`- Это **${goalMonth.toLocaleString("ru")} визитов/мес**.`);
  L.push(`- Модель: страница в топ-3 снимает ~25 % точной частоты кластера; до топ-3 на молодом домене доезжает примерно каждый третий кластер.`);
  L.push(`- Текущее ядро при полном покрытии даёт около **${nowPotential.toLocaleString("ru")} визитов/мес**.`);
  L.push(`- Средний кластер без страницы: **${avgCluster}/мес** → примерно **${perArticle} визитов/мес** с одной статьи.`);
  if (needArticles !== null) {
    L.push(`- До цели не хватает примерно **${Math.max(0, needArticles)} статей** ${needArticles > gaps.length
      ? `— это больше, чем кластеров в ядре (${gaps.length}). Значит, ядро надо расширять: снять Вордстат по соседним темам.`
      : `из ${gaps.length} свободных кластеров.`}`);
  }
  L.push("", `> Честно про сроки: молодой домен выходит в топ по информационным запросам за 4–8 месяцев. Первые визиты — через 3–6 недель после индексации.`, "");

  /* ── Очередь новых статей ───────────────────────────────────────── */
  L.push(`## Очередь новых статей — ${gaps.length} ${plural(gaps.length, "кластер", "кластера", "кластеров")}`, "");
  L.push("| # | Кластер | Частота/мес | Интент | Прогноз визитов | Запросы в статью |");
  L.push("|---|---------|-------------|--------|-----------------|------------------|");
  gaps.slice(0, 80).forEach((c, i) => {
    L.push(`| ${i + 1} | **${c.name}** | ${c.frequency} | ${c.intent} | ~${forecastVisits(c.frequency)} | ${c.queries.slice(0, 5).map(q => q.q).join("; ")} |`);
  });
  L.push("");

  /* ── Что дописать в существующих ────────────────────────────────── */
  L.push(`## Дораскрыть существующие — ${upgrade.length} ${plural(upgrade.length, "страница", "страницы", "страниц")}`, "");
  for (const u of upgrade.slice(0, 30)) {
    L.push(`### ${u.page.title}`);
    L.push(`- Страница: /${C.paths.article}/${u.page.slug}/ · слов: **${u.page.words}**${u.thin ? " ⚠ тонкая" : ""}`);
    L.push(`- Кластер: **${u.cluster.name}** — ${u.cluster.frequency}/мес, потенциал ~${u.potential} визитов/мес`);
    if (u.missing.length) L.push(`- Запросы, которых в тексте нет: ${u.missing.map(q => `\`${q.q}\` (${q.freq})`).join(", ")}`);
    L.push("");
  }

  const file = path.join(__dirname, "PLAN.md");
  fs.writeFileSync(file, L.join("\n"));

  console.log(`✓ План: seo/semcore/PLAN.md
  кластеров без страницы: ${gaps.length}
  статей до цели ${niche.goal.visitsPerDay}/день: ~${needArticles === null ? "?" : Math.max(0, needArticles)}
  ближайшие темы: ${gaps.slice(0, 3).map(c => c.name).join(" · ") || "—"}`);
}

function containsQuery(text, q) {
  const { tokensHard } = require("../lib/text");
  const t = new Set(tokensHard(text));
  return tokensHard(q).every(s => t.has(s));
}

const sum = a => a.reduce((x, y) => x + y, 0);

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

if (require.main === module) main();
module.exports = { main };
