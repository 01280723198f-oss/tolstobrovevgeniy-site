#!/usr/bin/env node
/* =====================================================================
   СЕМЯДРО · МАРКЕРНЫЕ ЗАПРОСЫ
   Готовит список фраз, которые надо прогнать через Яндекс.Вордстат.
   Запуск:  node seo/semcore/seed.js
   ===================================================================== */

const fs = require("fs");
const path = require("path");
const niche = require("./niche");

const DIR = path.join(__dirname, "data");

/* Вордстат сам разворачивает левую колонку, поэтому вбивать надо не всё
   подряд, а маркеры по уровням: ядро → ядро×действие → задачи аудитории. */
function build() {
  const t1 = [...new Set(niche.core)];

  const keyActions = niche.actions.slice(0, 10);
  const t2 = [];
  for (const c of niche.core) for (const a of keyActions) t2.push(`${a} ${c}`.replace(/\s+/g, " "));

  const t3 = [...new Set(niche.jobs.flatMap(j => [j, `${j} нейросетью`]))];

  const dedup = arr => [...new Set(arr)].filter(q => q.split(" ").length <= 5);
  return { t1: dedup(t1), t2: dedup(t2).slice(0, 80), t3: dedup(t3) };
}

function toFile(tiers) {
  return [
    "# УРОВЕНЬ 1 — обязательно (ядро темы, Вордстат сам развернёт хвост)",
    ...tiers.t1, "",
    "# УРОВЕНЬ 2 — если нужен более плотный охват",
    ...tiers.t2, "",
    "# УРОВЕНЬ 3 — задачи аудитории, самый конверсионный хвост",
    ...tiers.t3, ""
  ].join("\n");
}

if (require.main === module) {
  const tiers = build();
  fs.mkdirSync(DIR, { recursive: true });
  const file = path.join(DIR, "seed-queries.txt");
  fs.writeFileSync(file, toFile(tiers));
  const total = tiers.t1.length + tiers.t2.length + tiers.t3.length;

  console.log(`✓ ${tiers.t1.length} маркеров первого уровня, ${total} всего → seo/semcore/data/seed-queries.txt

Что дальше:
  1. Открой https://wordstat.yandex.ru (регион: Россия).
  2. Вбивай фразы из файла по очереди. Копируй ОБЕ колонки:
     левую («Что искали со словом») и правую («Похожие запросы»).
  3. Складывай скопированное в один файл seo/semcore/data/wordstat-<дата>.txt
     (формат «запрос<таб>частота» — как копируется, так и подходит).
  4. Запусти:  node seo/semcore/import.js
`);
}

module.exports = { build, toFile };
