#!/usr/bin/env node
/* =====================================================================
   ЯДРО ИЗ ПРОВЕРКИ СПРОСА
   Когда выгрузки Вордстата ещё нет, ядро можно собрать из подтверждённого
   спроса: запросы, которые поиск сам предлагает людям.
   Частоты здесь нет и не выдумывается — вместо неё сигнал 0–100.
   Когда придёт Вордстат, import.js перезапишет ядро настоящими цифрами.

   Запуск: node seo/semcore/from-demand.js
   ===================================================================== */

const fs = require("fs");
const path = require("path");

const topics = require("./topics");
const { cluster, refine, matchPages, detectIntent } = require("./lib");
const { buildPages, loadGuides } = require("../build");

const DIR = path.join(__dirname, "data");

function latestDemand() {
  if (!fs.existsSync(DIR)) return null;
  const files = fs.readdirSync(DIR).filter(f => /^demand-.*\.json$/.test(f)).sort();
  if (!files.length) return null;
  return JSON.parse(fs.readFileSync(path.join(DIR, files[files.length - 1]), "utf8"));
}

function main() {
  const demand = latestDemand();
  if (!demand) {
    console.log("Нет данных спроса. Сначала: node seo/semcore/demand.js");
    process.exit(1);
  }

  // Тема статьи и группа — из topics.js, сигнал — из проверки спроса.
  const meta = new Map();
  for (const g of topics.groups) for (const t of g.topics) for (const q of t.q) {
    meta.set(q.toLowerCase(), { topic: t.t, group: g.name, intent: t.intent });
  }

  /* Сигнал играет роль веса при кластеризации: подтверждённые запросы
     задают головы кластеров, слабые к ним прилипают. */
  const rows = demand
    .filter(r => r.score >= 35)
    .map(r => ({ q: r.query, freq: r.score }));

  // Хвост из подсказок — тоже спрос, просто непроверенный поштучно.
  const seen = new Set(rows.map(r => r.q));
  for (const r of demand) {
    for (const t of r.tail || []) {
      if (seen.has(t) || t.length < 8) continue;
      seen.add(t);
      rows.push({ q: t, freq: 20 });        // вес ниже проверенных
    }
  }

  const clusters = refine(cluster(rows, { threshold: 0.5 }));

  // Чистим поле frequency: цифр Вордстата у нас нет, врать не будем.
  for (const c of clusters) {
    const m = meta.get(c.name);
    c.signal = c.frequency;                 // суммарный сигнал подсказок
    c.frequency = null;
    c.source = "подсказки поиска";
    if (m) { c.suggestedTitle = m.topic; c.group = m.group; c.intent = m.intent || c.intent; }
    for (const q of c.queries) q.signal = q.freq, delete q.freq;
  }

  const { GUIDES } = loadGuides();
  const pages = buildPages(GUIDES, { clusters: [], byPage: {} });
  matchPages(clusters, pages);

  const covered = clusters.filter(c => c.page);
  const core = {
    updated: new Date().toLocaleDateString("sv"),
    source: "подсказки поиска (Яндекс + Google)",
    note: "Частот нет — только сигнал спроса 0–100. Настоящие цифры даст выгрузка Вордстата.",
    totals: { queries: rows.length, clusters: clusters.length, covered: covered.length, gaps: clusters.length - covered.length },
    clusters
  };

  fs.writeFileSync(path.join(DIR, "core.json"), JSON.stringify(core, null, 1));

  console.log(`✓ Ядро из проверки спроса
  запросов:      ${rows.length}
  кластеров:     ${clusters.length}
  привязано:     ${covered.length} статей
  свободных тем: ${clusters.length - covered.length}

Топ свободных (писать в первую очередь):`);
  clusters.filter(c => !c.page).sort((a, b) => b.signal - a.signal).slice(0, 12)
    .forEach(c => console.log(`  ${String(c.signal).padStart(4)}  ${c.suggestedTitle || c.name}  ←  ${c.name}`));
}

if (require.main === module) main();
module.exports = { main };
