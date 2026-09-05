#!/usr/bin/env node
/* =====================================================================
   ПРОВЕРКА СПРОСА без Вордстата и без авторизации
   Источник — поисковые подсказки Яндекса. Подсказки строятся на том,
   что люди реально вводят, поэтому дают честный сигнал «спрос есть».
   Частот они не дают: точные цифры добавит выгрузка Вордстата.

   Запуск:  node seo/semcore/demand.js            — по всем темам topics.js
            node seo/semcore/demand.js "запрос"   — по одному запросу
   Пишет:   seo/semcore/data/demand-<дата>.json + seo/semcore/СПРОС.md
   ===================================================================== */

const fs = require("fs");
const path = require("path");
const topics = require("./topics");
const { tokensHard } = require("../lib/text");

const DIR = path.join(__dirname, "data");
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36";

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ── Подсказки Яндекса ─────────────────────────────────────────── */
async function suggestYa(query) {
  const url = `https://suggest.yandex.ru/suggest-ff.cgi?part=${encodeURIComponent(query)}&n=15`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return [];
    const data = JSON.parse(await res.text());
    return Array.isArray(data[1]) ? data[1].map(s => String(s).toLowerCase().trim()) : [];
  } catch { return []; }
}

/* ── Подсказки Google: берём как второй источник, хвост там шире ── */
async function suggestGo(query) {
  const url = `https://suggestqueries.google.com/complete/search?client=chrome&hl=ru&ie=utf8&oe=utf8&q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return [];
    const data = JSON.parse(await res.text());
    return Array.isArray(data[1]) ? data[1].map(s => String(s).toLowerCase().trim()) : [];
  } catch { return []; }
}

/* ── Сигнал спроса по одному запросу ───────────────────────────── */
async function checkQuery(query) {
  const q = query.toLowerCase().trim();
  const words = q.split(/\s+/);
  const prefix = words.slice(0, -1).join(" ");   // запрос без последнего слова

  const [own, wide, google] = [
    await suggestYa(q),
    prefix ? await (sleep(220).then(() => suggestYa(prefix))) : [],
    await (sleep(220).then(() => suggestGo(q)))
  ];

  const exact = own.includes(q) || wide.includes(q);
  const posInWide = wide.indexOf(q);                     // место среди соседей
  const tail = new Set([...own, ...google].filter(s => s !== q));

  // Сигнал 0–100. Дословное совпадение весит больше всего: значит,
  // такой запрос вводят целиком, а не только его части.
  let score = 0;
  if (exact) score += 45;
  if (posInWide >= 0) score += Math.max(0, 20 - posInWide * 2);
  score += Math.min(25, tail.size * 2);
  if (own.length) score += 10;
  score = Math.min(100, score);

  return {
    query: q,
    exact,
    positionAmongNeighbours: posInWide >= 0 ? posInWide + 1 : null,
    suggestions: own,
    tail: [...tail].slice(0, 25),
    score,
    verdict: score >= 60 ? "спрос есть" : score >= 35 ? "спрос слабый" : "спроса не видно"
  };
}

/* ── Прогон по темам ───────────────────────────────────────────── */
async function run(queries) {
  const out = [];
  for (const q of queries) {
    const r = await checkQuery(q);
    out.push(r);
    process.stdout.write(`  ${String(r.score).padStart(3)} ${r.verdict.padEnd(16)} ${q}\n`);
    await sleep(320);      // не долбим сервис
  }
  return out;
}

function collectQueries() {
  const list = [];
  for (const g of topics.groups) for (const t of g.topics) {
    for (const q of t.q) list.push({ q, group: g.name, topic: t.t, intent: t.intent });
  }
  return list;
}

function report(rows, byQuery) {
  const L = [];
  L.push(`# Проверка спроса · ${new Date().toLocaleDateString("sv")}`, "");
  L.push(`Источник — поисковые подсказки Яндекса и Google. Подсказка появляется только у того,`);
  L.push(`что люди реально вводят, поэтому это честный сигнал «спрос есть».`);
  L.push(`Чего здесь нет — частотности: точные цифры даст выгрузка Вордстата.`, "");

  const ok = rows.filter(r => r.score >= 60);
  const weak = rows.filter(r => r.score >= 35 && r.score < 60);
  const no = rows.filter(r => r.score < 35);
  L.push(`Проверено запросов: **${rows.length}** · спрос есть: **${ok.length}** · слабый: **${weak.length}** · не видно: **${no.length}**`, "");

  const groups = new Map();
  for (const r of rows) {
    const meta = byQuery.get(r.query) || {};
    const key = meta.group || "Без группы";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ...r, ...meta });
  }

  for (const [group, items] of groups) {
    items.sort((a, b) => b.score - a.score);
    L.push(`## ${group}`, "");
    L.push("| Сигнал | Запрос | Тема статьи | Интент |");
    L.push("|---|---|---|---|");
    for (const i of items) {
      L.push(`| ${i.score} · ${i.verdict} | \`${i.query}\` | ${i.topic || "—"} | ${i.intent || "—"} |`);
    }
    L.push("");
  }

  // Хвост из подсказок — бесплатное расширение ядра.
  const tail = new Map();
  for (const r of rows) for (const t of r.tail) {
    if (!tail.has(t)) tail.set(t, 0);
    tail.set(t, tail.get(t) + 1);
  }
  const fresh = [...tail].filter(([t]) => !byQuery.has(t)).sort((a, b) => b[1] - a[1]).slice(0, 80);
  if (fresh.length) {
    L.push(`## Новые запросы из подсказок — ${fresh.length}`, "");
    L.push("Их не было в гипотезах, но поиск их предлагает. Кандидаты в ядро и в темы статей.", "");
    for (const [t, n] of fresh) L.push(`- \`${t}\`${n > 1 ? ` — встретился ${n} раз` : ""}`);
    L.push("");
  }
  return L.join("\n");
}

async function main() {
  const arg = process.argv.slice(2).join(" ").trim();
  fs.mkdirSync(DIR, { recursive: true });

  let queries, byQuery = new Map();
  if (arg) {
    queries = [arg];
    byQuery.set(arg.toLowerCase(), { group: "Ручная проверка", topic: "—", intent: "—" });
  } else {
    const all = collectQueries();
    queries = all.map(x => x.q);
    for (const x of all) byQuery.set(x.q.toLowerCase(), x);
    console.log(`Проверяю спрос по ${queries.length} запросам из seo/semcore/topics.js\n`);
  }

  const rows = await run(queries);

  const date = new Date().toLocaleDateString("sv");
  fs.writeFileSync(path.join(DIR, `demand-${date}.json`), JSON.stringify(rows, null, 1));
  fs.writeFileSync(path.join(__dirname, "СПРОС.md"), report(rows, byQuery));

  const ok = rows.filter(r => r.score >= 60).length;
  console.log(`\n✓ Спрос подтверждён у ${ok} из ${rows.length} запросов`);
  console.log(`  Отчёт: seo/semcore/СПРОС.md`);
}

if (require.main === module) main();
module.exports = { checkQuery, suggestYa, suggestGo };
