#!/usr/bin/env node
/* =====================================================================
   ОЦЕНКА СТАТЕЙ ПО ШЕСТИ ОСЯМ
   Спрос · Полнота · Доказательность · Структура · Голос · Конверсия
   Каждая ось 0–5. Смысл не в баллах, а в том, чтобы видеть,
   какую именно сторону статьи чинить — а не «сделать получше».

   Запуск: node seo/axes.js [id]
   Пишет:  seo/reports/оси-<дата>.md
   ===================================================================== */

const fs = require("fs");
const path = require("path");

const C = require("./config");
const { buildPages, loadGuides, loadSemcore } = require("./build");
const { plain, words } = require("./lib/text");

const ROOT = path.resolve(__dirname, "..");

const CLICHE = [
  "в современном мире", "важно отметить", "стоит отметить", "таким образом",
  "в заключение", "играет важную роль", "давайте рассмотрим", "не секрет",
  "на сегодняшний день", "в первую очередь", "как известно", "нельзя не отметить",
  "в этой статье мы", "подводя итог", "в наше время"
];

const AXES = [
  { key: "спрос",          hint: "под какой запрос написана страница" },
  { key: "полнота",        hint: "хватает ли объёма, чтобы закрыть тему" },
  { key: "доказательность", hint: "конкретика вместо общих слов" },
  { key: "структура",      hint: "можно ли выхватить ответ глазами" },
  { key: "голос",          hint: "звучит как человек, а не как нейросеть" },
  { key: "конверсия",      hint: "есть ли куда идти дальше" }
];

function score(p, semcore) {
  const md = p.rawMarkdown;
  const text = plain(md);
  const w = p.words;

  const h2 = (md.match(/^## /gm) || []).length;
  const h3 = (md.match(/^### /gm) || []).length;
  const faq = (p.faq || []).length;
  const lists = (md.match(/^\s*[-*] /gm) || []).length;
  const numbered = (md.match(/^\s*\d+\. /gm) || []).length;
  const tables = (md.match(/^\|.+\|$/gm) || []).length;
  const code = (md.match(/```/g) || []).length / 2;
  const images = (md.match(/!\[[^\]]*\]\(/g) || []).length;
  const digits = (text.match(/\b\d+([.,]\d+)?\b/g) || []).length;
  const internal = (md.match(/\]\(\/g\//g) || []).length + (p.related || []).length;
  const tg = /t\.me\//.test(md) || /кодовое слово/i.test(md);

  const sentences = text.split(/[.!?]+\s/).filter(s => s.trim().length > 3);
  const avgSentence = sentences.length ? w / sentences.length : 0;
  const paragraphs = md.split(/\n{2,}/).filter(x => x.trim() && !/^[#|`]/.test(x.trim()));
  const avgParagraph = paragraphs.length ? w / paragraphs.length : 0;
  const clicheHits = CLICHE.filter(c => text.toLowerCase().includes(c));
  const addressesReader = /\bты\b|\bтебе\b|\bтвой\b|\bтвоя\b|\bтвои\b/i.test(text);

  const cluster = semcore.clusters.find(c => c.page === p.slug);

  /* ── Ось 1. Спрос ────────────────────────────────────────────── */
  let s1 = 0;
  const fixes1 = [];
  if (p.keywords && p.keywords.length) s1 += 2; else fixes1.push("нет keywords — непонятно, под какой запрос статья");
  if (cluster) s1 += 2; else fixes1.push("не привязана к кластеру запросов (нужен импорт Вордстата или проверка спроса)");
  if (p.seoTitle && p.seoTitle !== p.title) s1 += 1; else fixes1.push("нет отдельного seoTitle под запрос");

  /* ── Ось 2. Полнота ──────────────────────────────────────────── */
  let s2 = w >= 2000 ? 5 : w >= 1400 ? 4 : w >= 1000 ? 3 : w >= 700 ? 2 : w >= 400 ? 1 : 0;
  const fixes2 = [];
  if (w < 1000) fixes2.push(`объём ${w} слов — добавить минимум ${1000 - w}`);
  if (h2 < 4) fixes2.push(`разделов H2 всего ${h2} — тема раскрыта узко`);

  /* ── Ось 3. Доказательность ──────────────────────────────────── */
  let s3 = 0;
  const fixes3 = [];
  if (digits >= 6) s3++; else fixes3.push("мало конкретных чисел");
  if (code >= 1) s3++; else fixes3.push("нет ни одной команды или примера кода");
  if (tables >= 3) s3++; else fixes3.push("нет таблицы — сравнение читается тяжелее");
  if (numbered >= 3) s3++; else fixes3.push("нет пошагового списка");
  if (images >= 1) s3++; else fixes3.push("нет изображения");

  /* ── Ось 4. Структура ────────────────────────────────────────── */
  let s4 = 0;
  const fixes4 = [];
  if (h2 >= 6) s4 += 2; else if (h2 >= 3) s4 += 1;
  if (h2 < 6) fixes4.push(`H2: ${h2} — под быстрые ответы нужно от шести`);
  if (faq >= 2) s4 += 1; else fixes4.push("нет блока вопрос-ответ (заголовки со знаком вопроса)");
  if (lists >= 4) s4 += 1; else fixes4.push("мало списков");
  if (h3 >= 2) s4 += 1; else fixes4.push("нет подзаголовков H3");

  /* ── Ось 5. Голос ────────────────────────────────────────────── */
  let s5 = 0;
  const fixes5 = [];
  if (avgSentence >= 7 && avgSentence <= 20) s5 += 2;
  else fixes5.push(`средняя длина предложения ${avgSentence.toFixed(1)} слов — вне живого диапазона 7–20`);
  if (addressesReader) s5 += 1; else fixes5.push("нет обращения к читателю на «ты»");
  if (!clicheHits.length) s5 += 1; else fixes5.push(`клише: ${clicheHits.join(", ")}`);
  if (avgParagraph <= 60) s5 += 1; else fixes5.push(`абзацы длинные (${avgParagraph.toFixed(0)} слов) — тяжело читать с телефона`);

  /* ── Ось 6. Конверсия ────────────────────────────────────────── */
  let s6 = 0;
  const fixes6 = [];
  if (internal >= 3) s6 += 2; else if (internal >= 1) s6 += 1;
  if (internal < 3) fixes6.push(`внутренних ссылок ${internal} — вес не растекается по сайту`);
  if (tg) s6 += 2; else fixes6.push("нет перехода в канал или кодового слова");
  if (faq >= 2) s6 += 1; else fixes6.push("блок вопросов держит человека на странице — его нет");

  const scores = { спрос: s1, полнота: s2, доказательность: s3, структура: s4, голос: s5, конверсия: s6 };
  const fixes = { спрос: fixes1, полнота: fixes2, доказательность: fixes3, структура: fixes4, голос: fixes5, конверсия: fixes6 };
  const total = Object.values(scores).reduce((a, b) => a + b, 0);

  return { slug: p.slug, title: p.title, words: w, scores, fixes, total, cluster: cluster ? cluster.name : null };
}

function bar(n) { return "█".repeat(n) + "·".repeat(5 - n); }

function main() {
  const only = process.argv.slice(2);
  const semcore = loadSemcore();
  const { GUIDES } = loadGuides();
  const pages = buildPages(GUIDES, semcore);

  // Сырой markdown нужен для подсчёта разметки — в собранной странице она уже HTML.
  for (const p of pages) p.rawMarkdown = GUIDES.find(g => (g.slug || g.id) === p.slug).markdown;

  const rows = pages
    .filter(p => !only.length || only.includes(p.slug))
    .map(p => score(p, semcore))
    .sort((a, b) => a.total - b.total);

  const L = [];
  L.push(`# Статьи по шести осям · ${new Date().toLocaleDateString("sv")}`, "");
  L.push("Каждая ось 0–5, всего 30. Слабые оси показывают, что именно чинить.", "");
  L.push("| Ось | Что меряет |");
  L.push("|---|---|");
  for (const a of AXES) L.push(`| ${a.key} | ${a.hint} |`);
  L.push("");

  const avg = k => (rows.reduce((s, r) => s + r.scores[k], 0) / rows.length).toFixed(1);
  L.push(`## Среднее по сайту`, "");
  L.push("| Ось | Средний балл |");
  L.push("|---|---|");
  for (const a of AXES) L.push(`| ${a.key} | ${avg(a.key)} / 5 |`);
  L.push("");

  L.push(`## Сводка — ${rows.length} статей, от слабых к сильным`, "");
  L.push("| Статья | Слов | Всего | Спр | Пол | Док | Стр | Гол | Кон |");
  L.push("|---|---|---|---|---|---|---|---|---|");
  for (const r of rows) {
    const s = r.scores;
    L.push(`| ${r.title.slice(0, 46)} | ${r.words} | **${r.total}/30** | ${s.спрос} | ${s.полнота} | ${s.доказательность} | ${s.структура} | ${s.голос} | ${s.конверсия} |`);
  }
  L.push("");

  L.push(`## Что чинить по каждой статье`, "");
  for (const r of rows) {
    L.push(`### ${r.title} — ${r.total}/30`);
    L.push(`\`/${C.paths.article}/${r.slug}/\` · ${r.words} слов${r.cluster ? ` · кластер: ${r.cluster}` : ""}`, "");
    for (const a of AXES) {
      const list = r.fixes[a.key];
      if (!list.length) continue;
      L.push(`- **${a.key}** ${bar(r.scores[a.key])} — ${list.join("; ")}`);
    }
    L.push("");
  }

  const dir = path.join(ROOT, "seo/reports");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `оси-${new Date().toLocaleDateString("sv")}.md`);
  fs.writeFileSync(file, L.join("\n"));

  console.log(`Оценка по шести осям · ${rows.length} статей`);
  for (const a of AXES) console.log(`  ${a.key.padEnd(16)} ${bar(Math.round(avg(a.key)))} ${avg(a.key)}/5`);
  console.log(`\nСлабейшие: ${rows.slice(0, 5).map(r => `${r.slug} (${r.total})`).join(", ")}`);
  console.log(`Отчёт: ${path.relative(ROOT, file)}`);
  return rows;
}

if (require.main === module) main();
module.exports = { main, score, AXES };
