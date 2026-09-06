#!/usr/bin/env node
/* =====================================================================
   ПЛАН НА МЕСЯЦ
   Считает, сколько статей нужно до цели по трафику, и расписывает
   ближайшие 30 дней: сколько публиковать и что дорабатывать.
   Запуск: node seo/plan-month.js
   Пишет:  seo/ПЛАН-МЕСЯЦА.md
   ===================================================================== */

const fs = require("fs");
const path = require("path");

const C = require("./config");
const niche = require("./semcore/niche");
const { buildPages, loadGuides, loadSemcore } = require("./build");

const ROOT = path.resolve(__dirname, "..");
const M = niche.model;
const GOAL_MONTH = niche.goal.visitsPerDay * 30;

/* ── Сценарии: одна цифра врёт, три показывают коридор ─────────────── */
const SCENARIOS = [
  { name: "Пессимистичный", freq: M.avgClusterFrequency * 0.6, ctr: M.clusterCtr * 0.7, top: M.top3Share * 0.6 },
  { name: "Базовый",        freq: M.avgClusterFrequency,        ctr: M.clusterCtr,       top: M.top3Share },
  { name: "Оптимистичный",  freq: M.avgClusterFrequency * 1.5,  ctr: M.clusterCtr * 1.3, top: M.top3Share * 1.4 }
];

const perArticle = s => s.freq * s.ctr * s.top;

function main() {
  const { GUIDES } = loadGuides();
  const semcore = loadSemcore();
  const pages = buildPages(GUIDES, semcore);

  const strong = pages.filter(p => p.words >= M.minWords);
  const weak = pages.filter(p => p.words < M.minWords).sort((a, b) => a.words - b.words);

  const L = [];
  L.push(`# План до ${niche.goal.visitsPerDay} визитов из поиска в день`, "");
  L.push(`Собрано ${new Date().toLocaleDateString("sv")} · статей на сайте: **${pages.length}** ` +
         `(боевых, от ${M.minWords} слов: **${strong.length}**, требуют доработки: **${weak.length}**)`, "");

  /* ── Сколько статей нужно ────────────────────────────────────────── */
  L.push(`## Сколько статей нужно`, "");
  L.push(`Цель — **${GOAL_MONTH.toLocaleString("ru")} визитов/мес**. Одна статья приносит ` +
         `\`частота кластера × доля кликов × вероятность выйти в топ\`.`, "");
  L.push("| Сценарий | Кластер, /мес | Кликов | В топ | Визитов со статьи | Нужно статей |");
  L.push("|---|---|---|---|---|---|");
  for (const s of SCENARIOS) {
    const per = perArticle(s);
    L.push(`| ${s.name} | ${Math.round(s.freq)} | ${Math.round(s.ctr * 100)} % | ${Math.round(s.top * 100)} % | ` +
           `~${per.toFixed(0)} | **${Math.ceil(GOAL_MONTH / per).toLocaleString("ru")}** |`);
  }
  const base = SCENARIOS[1];
  const need = Math.ceil(GOAL_MONTH / perArticle(base));
  const haveValue = strong.length * perArticle(base);
  L.push("");
  L.push(`Базовый сценарий: нужно **${need.toLocaleString("ru")} боевых статей**. ` +
         `Сейчас есть ${strong.length} — это ~${Math.round(haveValue).toLocaleString("ru")} визитов/мес потенциала, ` +
         `**${(100 * haveValue / GOAL_MONTH).toFixed(1)} %** цели.`, "");

  /* ── Сроки ───────────────────────────────────────────────────────── */
  const perDay = M.articlesPerDay;
  const monthsToWrite = (need - strong.length) / (perDay * 30);
  L.push(`## Сроки`, "");
  L.push(`- Темп **${perDay} статьи/день** = ${perDay * 30} в месяц.`);
  L.push(`- Написать недостающие ${(need - strong.length).toLocaleString("ru")} — примерно **${monthsToWrite.toFixed(1)} мес** производства.`);
  L.push(`- Плюс лаг: первые визиты через **${M.indexLagWeeks} недель** после публикации, выход в топ — **${M.rankLagMonths} мес**.`);
  L.push(`- Значит цель ${niche.goal.visitsPerDay}/день достижима примерно через ` +
         `**${Math.ceil(monthsToWrite + M.rankLagMonths)} месяцев** от старта, а не за месяц. ` +
         `Месячный план ниже — это первый шаг, а не весь путь.`, "");
  L.push(`> Трафик копится нелинейно: первые 2 месяца почти ноль, дальше кривая идёт вверх, ` +
         `потому что старые статьи набирают возраст, пока выходят новые`, "");

  /* ── Помесячный прогноз ──────────────────────────────────────────── */
  const forecast = buildForecast(strong.length, need, perArticle(base));
  L.push(`## Прогноз по месяцам`, "");
  L.push(`Статья не начинает приносить трафик сразу: примерно ${M.indexLagWeeks} недель уходит на`);
  L.push(`индексацию, до полной отдачи — около ${M.rankLagMonths} месяцев. Поэтому кривая идёт`);
  L.push(`с задержкой: пишешь в первый месяц, получаешь в третий-четвёртый.`, "");
  L.push("| Месяц | Опубликовано всего | Созрело статей | Визитов/мес | Визитов/день | % цели |");
  L.push("|---|---|---|---|---|---|");
  for (const f of forecast) {
    L.push(`| ${f.month} | ${f.published.toLocaleString("ru")} | ${f.mature.toLocaleString("ru")} | ` +
           `${f.visitsMonth.toLocaleString("ru")} | **${f.visitsDay.toLocaleString("ru")}** | ${f.pct} % |`);
  }
  L.push("");
  const hit = forecast.find(f => f.visitsDay >= niche.goal.visitsPerDay);
  L.push(hit
    ? `Цель **${niche.goal.visitsPerDay}/день** достигается на **${hit.month}-м месяце** при темпе ${perDay} статей в день.`
    : `За ${M.forecastMonths} месяцев цель не достигается: нужно либо выше темп, либо кластеры пожирнее.`);
  L.push("");

  /* ── Хватит ли тем под такой темп ────────────────────────────────── */
  const freeClusters = semcore.clusters.filter(c => !c.page).length;
  const daysOfTopics = perDay > 0 ? Math.floor(freeClusters / perDay) : 0;
  L.push(`## Хватит ли тем`, "");
  L.push(`Тем в ядре без страницы: **${freeClusters}**. При темпе ${perDay} в день это **${daysOfTopics} дней** работы.`);
  if (freeClusters < need - strong.length) {
    L.push("");
    L.push(`⚠ До цели нужно **${need - strong.length}** статей, а тем в ядре только **${freeClusters}**. ` +
           `Разрыв — **${need - strong.length - freeClusters}**. Ядро надо расширять параллельно с письмом: ` +
           `новый прогон проверки спроса по хвостам, выгрузка Вордстата, соседние ниши. ` +
           `Иначе конвейер упрётся в темы раньше, чем в объём.`);
  }
  L.push("");

  /* ── Риски темпа ─────────────────────────────────────────────────── */
  if (perDay >= 10) {
    L.push(`## Риски такого темпа`, "");
    L.push(`- **Скачок объёма.** Сейчас на сайте ${pages.length} страниц. ${perDay} в день это ` +
           `рост в ${((pages.length + perDay * 30) / pages.length).toFixed(0)} раз за месяц. ` +
           `Резкий взрывной рост однотипных страниц на молодом домене — известный триггер ` +
           `фильтров за малополезный контент. Безопаснее наращивать: неделя по 5, неделя по 10, дальше по ${perDay}.`);
    L.push(`- **Объём текста.** ${perDay} статей по ${M.minWords} слов это ` +
           `**${(perDay * M.minWords).toLocaleString("ru")} слов в день**. Это не «побольше промптов», ` +
           `это отдельная производственная задача с ревью.`);
    L.push(`- **Каннибализация.** Чем быстрее пишешь, тем выше шанс сделать две страницы под один кластер. ` +
           `Перед каждой партией — сверка с \`core.json\`, одна страница на кластер.`);
    L.push(`- **Ревью не масштабируется линейно.** Пять минут на статью × ${perDay} = ` +
           `${Math.round(perDay * 5 / 60 * 10) / 10} часа в день только на приёмку.`, "");
  }

  /* ── Что делать в первый месяц ───────────────────────────────────── */
  L.push(`## Первый месяц: два потока одновременно`, "");
  L.push(`**Поток А — доработка.** ${weak.length} статей короче ${M.minWords} слов. ` +
         `У них уже есть возраст и внутренние ссылки, поэтому доработать существующую дешевле, ` +
         `чем написать новую с нуля.`);
  L.push(`**Поток Б — новые статьи** под свободные кластеры из \`seo/semcore/PLAN.md\`.`, "");

  const days = 30;
  const perDayFix = Math.ceil(weak.length / 14);   // доработку закрываем за две недели
  L.push(`| День | Доработать | Новых статей | Что ещё |`);
  L.push(`|---|---|---|---|`);

  const queue = [...weak];
  const start = new Date();
  for (let d = 1; d <= days; d++) {
    const date = new Date(start.getTime() + (d - 1) * 864e5);
    const human = date.toLocaleDateString("ru", { day: "numeric", month: "short" });
    const fix = queue.splice(0, d <= 14 ? perDayFix : 0);
    const fresh = d <= 3 ? 0 : perDay;             // первые три дня — только доработка
    let note = "";
    if (d === 1) note = "Метрика + Вебмастер, выгрузка Вордстата";
    else if (d === 2) note = "`node seo/semcore/import.js` → `plan.js`";
    else if (d === 7) note = "Проверить индексацию в Вебмастере";
    else if (d === 14) note = "Аудит: `node seo/audit.js`";
    else if (d === 21) note = "Первые данные Метрики → пересчитать модель";
    else if (d === 30) note = "Итог месяца, пересобрать план";
    L.push(`| ${d} (${human}) | ${fix.length ? fix.map(p => p.slug).join(", ") : "—"} | ${fresh} | ${note} |`);
  }
  L.push("");

  const totalNew = perDay * (days - 3);
  L.push(`Итого за месяц: **${weak.length} доработанных** + **${totalNew} новых** = ` +
         `**${strong.length + weak.length + totalNew}** боевых статей на сайте ` +
         `(${(100 * (strong.length + weak.length + totalNew) / need).toFixed(0)} % от нужного числа).`, "");

  /* ── Очередь доработки по приоритету ─────────────────────────────── */
  L.push(`## Очередь доработки — ${weak.length} статей`, "");
  L.push("| Статья | Слов сейчас | Добавить | Тема |");
  L.push("|---|---|---|---|");
  for (const p of weak) {
    L.push(`| [${p.title}](/${C.paths.article}/${p.slug}/) | ${p.words} | +${Math.max(0, M.minWords - p.words)} | ${p.tag} |`);
  }
  L.push("");

  L.push(`## Чем меряем, что план работает`, "");
  L.push(`- **Неделя 1–2:** страницы в индексе (Вебмастер → «Страницы в поиске»). Цель — все ${pages.length}.`);
  L.push(`- **Неделя 3–5:** первые показы по запросам ядра. Визитов ещё почти нет — это норма.`);
  L.push(`- **Месяц 2–3:** первые визиты из поиска, ~10–50/день. Точка, где модель пересчитывается по факту.`);
  L.push(`- **Месяц 6+:** статьи первой волны выходят в топ, кривая идёт вверх.`, "");

  const file = path.join(ROOT, "seo/ПЛАН-МЕСЯЦА.md");
  fs.writeFileSync(file, L.join("\n"));

  console.log(`✓ seo/ПЛАН-МЕСЯЦА.md
  нужно боевых статей (базовый сценарий): ${need}
  есть сейчас: ${strong.length}, доработать: ${weak.length}
  темп: ${perDay}/день → цель примерно через ${Math.ceil(monthsToWrite + M.rankLagMonths)} мес`);
}

/** Помесячная кривая: статьи копятся, каждая созревает со своей задержкой.
    Опубликованная сегодня статья не даёт трафик сегодня — она входит в силу
    между индексацией и выходом в топ, поэтому кривая всегда отстаёт от темпа. */
function buildForecast(startStrong, need, perArticleVisits) {
  const perMonth = M.articlesPerDay * 30;
  const indexLag = M.indexLagWeeks / 4.35;          // недели → месяцы
  const rankLag = M.rankLagMonths;
  const months = M.forecastMonths || 14;
  const rows = [];

  const publishedBy = k => Math.min(need, startStrong + perMonth * k);

  for (let m = 1; m <= months; m++) {
    let mature = 0;
    for (let k = 0; k <= m; k++) {
      const cohort = k === 0 ? startStrong : publishedBy(k) - publishedBy(k - 1);
      if (cohort <= 0) continue;
      const age = m - k;
      const share = age <= indexLag ? 0 : Math.min(1, (age - indexLag) / (rankLag - indexLag));
      mature += cohort * share;
    }
    const visitsMonth = Math.round(mature * perArticleVisits);
    rows.push({
      month: m,
      published: publishedBy(m),
      mature: Math.round(mature),
      visitsMonth,
      visitsDay: Math.round(visitsMonth / 30),
      pct: ((visitsMonth / (niche.goal.visitsPerDay * 30)) * 100).toFixed(0)
    });
  }
  return rows;
}

if (require.main === module) main();
module.exports = { main, buildForecast };
