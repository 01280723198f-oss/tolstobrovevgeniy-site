#!/usr/bin/env node
/* =====================================================================
   ДЫРЫ ЯДРА · ПЛАН ЗАКРЫТИЯ
   Показывает незакрытые кластеры в порядке приоритета (по сигналу спроса).
   Первые 30 — целевая очередь на эту неделю.

   Запуск: node seo/gaps-priority.js [--count 50]
   ===================================================================== */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const R = (...p) => path.join(ROOT, ...p);

const ARGS = process.argv.slice(2);
const COUNT = Number(ARGS[ARGS.indexOf("--count") + 1] || 30) || 30;

const core = JSON.parse(fs.readFileSync(R("seo/semcore/data/core.json"), "utf8"));

// Спрос кластера: частотность Вордстата, старый «сигнал» или сумма по запросам
const demand = c => {
  if (Number.isFinite(c.frequency)) return c.frequency;
  if (Number.isFinite(c.signal)) return c.signal;
  return (c.queries || []).reduce((s, q) => s + (Number(q.freq) || Number(q.signal) || 0), 0);
};

// Кластеры без страницы, отсортированы по спросу
const allGaps = core.clusters
  .filter(c => !c.page)
  .sort((a, b) => demand(b) - demand(a));
const gaps = allGaps.slice(0, COUNT);

console.log(`# Незакрытые кластеры · показаны ${gaps.length} из ${allGaps.length}\n`);
console.log(`| # | Спрос/мес | Название | Интент | Запросов | Готовый title |`);
console.log(`|---|---|---|---|---|---|`);

let week = [];
gaps.forEach((c, i) => {
  const q = (c.queries || []).length;
  const t = (c.suggestedTitle || c.name || "").slice(0, 50);
  console.log(`| ${i + 1} | **${demand(c)}** | ${c.name} | ${c.intent} | ${q} | ${t} |`);
  if (i < 7) week.push(c);
});

console.log(`\n## Первая неделя — TOP 7\n`);
console.log(`Напиши эти 7 статей, остальные подтянутся. Начни с **#1** — спрос ${demand(week[0] || {})} показов в месяц.\n`);

week.forEach((c, i) => {
  const slug = c.id || c.name.toLowerCase().replace(/[^а-яa-z0-9]/g, "-");
  const title = c.suggestedTitle || c.name;
  console.log(`${i + 1}. **${title}** (спрос ${demand(c)}/мес)`);
  console.log(`   Кодовое слово: \`${slug}\``);
  console.log(`   Интент: ${c.intent}`);
  console.log(`   Главный запрос: "${(c.queries[0] || {}).q}"`);
  console.log(`   → сделай черновик в \`seo/drafts/${slug}.md\`, потом \`node seo/rewrite-guides.js ${slug}\``);
  console.log();
});

// Статистика по спросу
const inRange = (lo, hi) => gaps.filter(c => demand(c) >= lo && (hi === null || demand(c) < hi)).length;

console.log(`## По спросу (показов в месяц)\n`);
console.log(`| 10000+ | 3000–9999 | 1000–2999 | 300–999 | < 300 |`);
console.log(`|---|---|---|---|---|`);
console.log(`| ${inRange(10000, null)} | ${inRange(3000, 10000)} | ${inRange(1000, 3000)} | ${inRange(300, 1000)} | ${inRange(0, 300)} |`);

console.log(`\n## Как писать — три режима\n`);
console.log(`**Режим 1: полный текст**`);
console.log(`\`\`\`bash\necho "# Заголовок..." > seo/drafts/slug.md\nnode seo/rewrite-guides.js slug\n\`\`\``);
console.log(`\n**Режим 2: заменить хвост (с какого-то заголовка)**`);
console.log(`\`\`\`markdown\n<!-- ОРИГИНАЛ:ДО "## Важное" -->\n# Новый заголовок\n...\n\`\`\``);
console.log(`\n**Режим 3: вставить разделы в середину**`);
console.log(`\`\`\`markdown\n<!-- ВСТАВКА-ПЕРЕД "## Последний раздел" -->\n## Новый раздел\n...\n\`\`\``);
console.log(`\nПосле правки: \`node seo/build.js && git push\`\n`);
