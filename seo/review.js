#!/usr/bin/env node
/* =====================================================================
   ПРОВЕРКА СТАТЬИ · второй агент после автора
   Автор (статья-воронка) пишет — эта проверка ловит то, что автор пропустил:
   спрос, сниппет, ключ в нужных местах, структура, FAQ, альты, перелинковка,
   дубли. Смысловую часть (факты, интент, голос) проверяет агент seo-reviewer
   (.claude/agents/seo-reviewer.md) — он запускает этот скрипт первым.

   Запуск:
     node seo/review.js <id> [id ...]   — конкретные статьи
     node seo/review.js --сегодня        — все статьи с сегодняшней датой
     node seo/review.js --дата 2026-10-13
   Код выхода 1 — есть блокеры, публиковать нельзя.
   ===================================================================== */

const C = require("./config");
const niche = require("./semcore/niche");
const { buildPages, loadGuides, loadSemcore } = require("./build");

const MIN_WORDS = (niche.model && niche.model.minWords) || 1000;
const MIN_FREQ = (niche.model && niche.model.minFrequency) || 30;

const ARGS = process.argv.slice(2);
const dateArg = ARGS.includes("--сегодня") ? new Date().toISOString().slice(0, 10)
  : ARGS.includes("--дата") ? ARGS[ARGS.indexOf("--дата") + 1] : null;
const ids = ARGS.filter(a => !a.startsWith("--") && a !== dateArg);

const norm = s => String(s || "").toLowerCase().replace(/ё/g, "е");
const hasStems = (text, stems) => stems.length > 0 && stems.every(s => norm(text).includes(s));

function review(p, all, semcore) {
  const block = [], warn = [];
  const cl = semcore.clusters.find(c => c.id === p.cluster);

  /* Спрос: статья должна стоять на кластере с подтверждённой частотой */
  if (!cl) block.push("не привязана к кластеру ядра — под какой запрос написана, неизвестно (проверь спрос: node seo/semcore/wordstat.js --gate \"запрос\")");
  else if (cl.frequency != null && cl.frequency < MIN_FREQ) warn.push(`спрос кластера ${cl.frequency}/мес ниже порога ${MIN_FREQ}`);

  /* Ключ в нужных местах */
  if (cl && cl.stems && cl.stems.length) {
    const firstPara = (p.plainBody || "").split(/\n\s*\n/).find(x => x.trim().length > 40) || "";
    if (!hasStems(p.metaTitle, cl.stems)) block.push(`головного запроса «${cl.name}» нет в title`);
    if (!hasStems(p.title, cl.stems)) warn.push(`головного запроса «${cl.name}» нет в H1`);
    if (!hasStems(firstPara, cl.stems)) warn.push(`головного запроса нет в первом абзаце`);
    if (!p.toc.some(h => h.level === 2 && hasStems(h.text || h.title || "", cl.stems))) warn.push("ни один H2 не содержит головной запрос");
    const hits = (norm(p.plainBody).match(new RegExp(cl.stems[0], "g")) || []).length;
    if (hits > Math.max(12, p.words / 80)) warn.push(`переспам: основа «${cl.stems[0]}» встречается ${hits} раз`);
  }

  /* Сниппет */
  if (p.metaTitle.length > C.seo.titleMax) warn.push(`title ${p.metaTitle.length} симв. — обрежется (норма до ${C.seo.titleMax})`);
  if (p.metaTitle.length < 30) warn.push(`title ${p.metaTitle.length} симв. — слишком короткий`);
  if (p.description.length < 70) block.push(`description ${p.description.length} симв. — сниппет соберётся из случайного куска текста`);
  if (p.description.length > C.seo.descriptionMax) warn.push(`description ${p.description.length} симв. — обрежется`);
  const dupTitle = all.filter(x => x.slug !== p.slug && x.metaTitle === p.metaTitle).map(x => x.slug);
  if (dupTitle.length) block.push(`такой же title у: ${dupTitle.join(", ")}`);
  if (cl) {
    const rival = all.find(x => x.slug !== p.slug && x.cluster === cl.id);
    if (rival) block.push(`каннибализация: кластер «${cl.name}» уже занят /g/${rival.slug}/`);
  }

  /* Объём и структура */
  if (p.words < C.seo.thinWords) block.push(`${p.words} слов — тонкая статья (минимум ${C.seo.thinWords})`);
  else if (p.words < MIN_WORDS) warn.push(`${p.words} слов — ниже рабочего объёма ${MIN_WORDS}`);
  if (p.toc.filter(h => h.level === 2).length < 3) warn.push("меньше трёх H2");
  if (!p.faq || p.faq.length < 2) block.push("нет блока «Частые вопросы» из 2+ вопросов (разметка FAQPage)");

  /* Картинки */
  const imgs = [...p.html.matchAll(/<img\b[^>]*>/g)].map(m => m[0]);
  const noAlt = imgs.filter(t => !/\balt="[^"]{3,}"/.test(t));
  if (noAlt.length) block.push(`${noAlt.length} из ${imgs.length} картинок без alt`);
  if (!p.image) warn.push("нет обложки 1200×630 — node seo/og-images.js");

  /* Перелинковка */
  const out = new Set([...p.html.matchAll(/href="\/g\/([^/"]+)\//g)].map(m => m[1]).filter(s => s !== p.slug));
  if (out.size < 2) warn.push(`в тексте ${out.size} ссылок на соседние статьи (нужно 2–3, якорь = запрос)`);

  return { block, warn };
}

function main() {
  const { GUIDES } = loadGuides();
  const semcore = loadSemcore();
  const all = buildPages(GUIDES, semcore);
  const targets = ids.length ? all.filter(p => ids.includes(p.slug) || ids.includes(p.id))
    : dateArg ? all.filter(p => p.iso === dateArg) : [];

  if (!targets.length) {
    console.log(ids.length || dateArg ? "Статей не нашлось." : "Использование: node seo/review.js <id> | --сегодня | --дата ГГГГ-ММ-ДД");
    process.exit(2);
  }

  let failed = 0;
  for (const p of targets) {
    const { block, warn } = review(p, all, semcore);
    if (block.length) failed++;
    console.log(`\n${block.length ? "✗ СТОП" : "✓ ОК  "}  ${p.slug}  · ${p.words} слов · ${p.cluster || "без кластера"}`);
    block.forEach(x => console.log("   блокер: " + x));
    warn.forEach(x => console.log("   поправить: " + x));
  }
  console.log(`\nПроверено ${targets.length}, к публикации готово ${targets.length - failed}, на доработку ${failed}`);
  process.exit(failed ? 1 : 0);
}

if (require.main === module) main();
module.exports = { review };
