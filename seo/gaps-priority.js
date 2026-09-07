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

// Кластеры без страницы, отсортированы по сигналу спроса
const gaps = core.clusters
  .filter(c => !c.page)
  .sort((a, b) => (b.signal || 0) - (a.signal || 0))
  .slice(0, COUNT);

console.log(`# Незакрытые кластеры · ${gaps.length} из ${core.totals.gaps}\n`);
console.log(`| # | Сигнал | Название | Интент | Запросов | Готовый title |`);
console.log(`|---|---|---|---|---|---|`);

let week = [];
gaps.forEach((c, i) => {
  const q = (c.queries || []).length;
  const t = (c.suggestedTitle || c.name || "").slice(0, 50);
  console.log(`| ${i + 1} | **${c.signal}** | ${c.name} | ${c.intent} | ${q} | ${t} |`);
  if (i < 7) week.push(c);
});

console.log(`\n## Первая неделя — TOP 7\n`);
console.log("Напиши эти 7 статей, остальные подтянутся. Начни с **#1** — сигнал 358 это горячо.\n");

week.forEach((c, i) => {
  const slug = c.id || c.name.toLowerCase().replace(/[^а-яa-z0-9]/g, "-");
  const title = c.suggestedTitle || c.name;
  console.log(`${i + 1}. **${title}** (сигнал ${c.signal})`);
  console.log(`   Кодовое слово: \`${slug}\``);
  console.log(`   Интент: ${c.intent}`);
  console.log(`   Главный запрос: "${(c.queries[0] || {}).q}"`);
  console.log(`   → сделай черновик в \`seo/drafts/${slug}.md\`, потом \`node seo/rewrite-guides.js ${slug}\``);
  console.log();
});

// Статистика
const bySigal = [100, 80, 60, 40, 20, 0];
const buckets = {};
for (const s of bySigal) buckets[s] = gaps.filter(c => c.signal >= s && c.signal < (s + 20)).length;

console.log(`## По сигналу спроса\n`);
console.log(`| Сигнал 100–81 | 80–61 | 60–41 | 40–21 | 20–0 |`);
console.log(`|---|---|---|---|---|`);
console.log(`| ${gaps.filter(c => c.signal >= 80).length} | ${gaps.filter(c => c.signal >= 60 && c.signal < 80).length} | ${gaps.filter(c => c.signal >= 40 && c.signal < 60).length} | ${gaps.filter(c => c.signal >= 20 && c.signal < 40).length} | ${gaps.filter(c => c.signal < 20).length} |`);

console.log(`\n## Как писать — три режима\n`);
console.log(`**Режим 1: полный текст**`);
console.log(`\`\`\`bash\necho "# Заголовок..." > seo/drafts/slug.md\nnode seo/rewrite-guides.js slug\n\`\`\``);
console.log(`\n**Режим 2: заменить хвост (с какого-то заголовка)**`);
console.log(`\`\`\`markdown\n<!-- ОРИГИНАЛ:ДО "## Важное" -->\n# Новый заголовок\n...\n\`\`\``);
console.log(`\n**Режим 3: вставить разделы в середину**`);
console.log(`\`\`\`markdown\n<!-- ВСТАВКА-ПЕРЕД "## Последний раздел" -->\n## Новый раздел\n...\n\`\`\``);
console.log(`\nПосле правки: \`node seo/build.js && git push\`\n`);
