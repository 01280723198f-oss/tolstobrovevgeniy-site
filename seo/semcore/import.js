#!/usr/bin/env node
/* =====================================================================
   СЕМЯДРО · ИМПОРТ
   Выгрузки Вордстата → нормализация → кластеры → привязка к страницам.
   Читает всё из seo/semcore/data/wordstat-*.txt|csv
   Пишет   seo/semcore/data/queries.json и data/core.json
   Запуск: node seo/semcore/import.js [--threshold=0.5]
   ===================================================================== */

const fs = require("fs");
const path = require("path");

const { parseDump, cluster, refine, matchPages, forecastVisits } = require("./lib");
const niche = require("./niche");
const { buildPages, loadGuides } = require("../build");

const DIR = path.join(__dirname, "data");

function readDumps() {
  if (!fs.existsSync(DIR)) return [];
  const files = fs.readdirSync(DIR).filter(f => /^wordstat.*\.(txt|csv|tsv)$/i.test(f));
  const rows = [];
  for (const f of files) {
    const parsed = parseDump(fs.readFileSync(path.join(DIR, f), "utf8"));
    console.log(`  ${f}: ${parsed.length} запросов`);
    rows.push(...parsed);
  }
  return rows;
}

function clean(rows) {
  const neg = niche.negative.map(n => n.toLowerCase());
  const seen = new Map();
  for (const r of rows) {
    if (neg.some(n => r.q.includes(n))) continue;
    if (r.q.split(" ").length > 8) continue;
    const prev = seen.get(r.q);
    if (!prev || r.freq > prev.freq) seen.set(r.q, r);
  }
  return [...seen.values()].sort((a, b) => b.freq - a.freq);
}

function main() {
  const argThreshold = Number((process.argv.find(a => a.startsWith("--threshold=")) || "").split("=")[1]);
  const threshold = Number.isFinite(argThreshold) ? argThreshold : 0.5;

  console.log("Читаю выгрузки Вордстата:");
  const raw = readDumps();
  if (!raw.length) {
    console.log(`
Пусто. Положи выгрузку в seo/semcore/data/wordstat-<дата>.txt
Список фраз для Вордстата: node seo/semcore/seed.js
`);
    process.exit(1);
  }

  const queries = clean(raw);
  const clusters = refine(cluster(queries, { threshold }));

  const { GUIDES } = loadGuides();
  // Считаем страницы «как есть», без прошлой привязки: иначе кластер,
  // однажды прилипший к странице, подтверждал бы сам себя на каждом прогоне.
  const pages = buildPages(GUIDES, { clusters: [], byPage: {} });
  matchPages(clusters, pages);

  const covered = clusters.filter(c => c.page);
  const gaps = clusters.filter(c => !c.page);
  const core = {
    updated: new Date().toISOString().slice(0, 10),
    totals: {
      queries: queries.length,
      frequency: queries.reduce((a, b) => a + b.freq, 0),
      clusters: clusters.length,
      covered: covered.length,
      gaps: gaps.length
    },
    clusters
  };

  fs.writeFileSync(path.join(DIR, "queries.json"), JSON.stringify(queries, null, 1));
  fs.writeFileSync(path.join(DIR, "core.json"), JSON.stringify(core, null, 1));

  console.log(`
✓ Ядро собрано
  запросов:        ${core.totals.queries} (суммарная частота ${core.totals.frequency}/мес)
  кластеров:       ${core.totals.clusters}
  уже покрыто:     ${covered.length}
  без страницы:    ${gaps.length} (потенциал ${forecastVisits(gaps.reduce((a, c) => a + c.frequency, 0))} визитов/мес)

Дальше: node seo/semcore/plan.js — очередь статей под цель ${niche.goal.visitsPerDay} визитов/день`);
}

if (require.main === module) main();
module.exports = { main, readDumps, clean };
