#!/usr/bin/env node
/* =====================================================================
   ВОРДСТАТ · проверка спроса перед статьёй
   Перед каждой статьёй смотрим, сколько людей реально ищут тему.
   Нет спроса — статью не пишем.

   Где берутся цифры (по порядку):
     1. Ядро core.json — частоты из ручной выгрузки Вордстата.
     2. Кэш прошлых запросов к API — seo/semcore/data/wordstat-api/.
     3. API Вордстата (api.wordstat.yandex.net, доступ по заявке) —
        WORDSTAT_TOKEN в site-analytics.env.
     4. Yandex Cloud Search API, метод wordstat (платный, копейки за запрос) —
        YC_SEARCH_API_KEY + YC_FOLDER_ID в site-analytics.env.
   Ни один источник не ответил — честно пишем «нет данных», частоту не выдумываем.

   Запуск:
     node seo/semcore/wordstat.js "фраза" [ещё фраза]   — частота + хвост запросов
     node seo/semcore/wordstat.js --gate "фраза"        — гейт: код выхода 1, если спрос ниже порога
     node seo/semcore/wordstat.js --fresh "фраза"       — мимо ядра и кэша, сразу в API
   ===================================================================== */

const fs = require("fs");
const os = require("os");
const path = require("path");
const niche = require("./niche");

const DATA = path.join(__dirname, "data");
const CACHE = path.join(DATA, "wordstat-api");
const CACHE_DAYS = 30;
// Порог спроса: ниже — тема не окупает статью. Меняется в niche.js → model.minFrequency.
const MIN_FREQ = (niche.model && niche.model.minFrequency) || 30;

const ARGS = process.argv.slice(2);
const GATE = ARGS.includes("--gate");
const FRESH = ARGS.includes("--fresh");
const phrases = ARGS.filter(a => !a.startsWith("--"));

function loadEnv() {
  const file = path.join(os.homedir(), ".claude/secrets/site-analytics.env");
  const env = {};
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}
const env = loadEnv();

const norm = s => s.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
const slug = s => norm(s).replace(/[^a-zа-я0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

/* ── 1. Ядро ─────────────────────────────────────────────────────── */
function fromCore(phrase) {
  const f = path.join(DATA, "core.json");
  if (!fs.existsSync(f)) return null;
  const p = norm(phrase);
  for (const c of JSON.parse(fs.readFileSync(f, "utf8")).clusters || []) {
    const q = (c.queries || []).find(x => norm(x.q || x) === p);
    if (q && q.freq != null) {
      return {
        source: "ядро (выгрузка Вордстата)", phrase, count: q.freq,
        cluster: c.id, clusterFrequency: c.frequency, page: c.page || null,
        tail: c.queries.slice(0, 15).map(x => ({ phrase: x.q, count: x.freq }))
      };
    }
  }
  return null;
}

/* ── 2. Кэш ──────────────────────────────────────────────────────── */
function fromCache(phrase) {
  const f = path.join(CACHE, slug(phrase) + ".json");
  if (!fs.existsSync(f)) return null;
  const d = JSON.parse(fs.readFileSync(f, "utf8"));
  if ((Date.now() - new Date(d.fetched).getTime()) / 864e5 > CACHE_DAYS) return null;
  return { ...d, source: d.source + ", кэш от " + d.fetched.slice(0, 10) };
}
function toCache(d) {
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(path.join(CACHE, slug(d.phrase) + ".json"), JSON.stringify(d, null, 2));
}

/* ── 3–4. API ────────────────────────────────────────────────────── */
// Ответы двух API отличаются названиями полей — разбираем оба вида.
function parse(json) {
  const list = json.topRequests || json.results || [];
  const tail = list.map(x => ({ phrase: x.phrase, count: Number(x.count) }));
  const total = json.totalCount != null ? Number(json.totalCount) : (tail[0] ? tail[0].count : null);
  return { count: total, tail: tail.slice(0, 30) };
}

async function fromWordstatApi(phrase) {
  if (!env.WORDSTAT_TOKEN) return null;
  const res = await fetch("https://api.wordstat.yandex.net/v1/topRequests", {
    method: "POST",
    headers: { Authorization: "Bearer " + env.WORDSTAT_TOKEN, "Content-Type": "application/json;charset=utf-8" },
    body: JSON.stringify({ phrase, numPhrases: 50, devices: ["all"] })
  });
  if (!res.ok) throw new Error(`API Вордстата ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return { source: "API Вордстата", phrase, ...parse(await res.json()) };
}

async function fromCloudApi(phrase) {
  if (!env.YC_SEARCH_API_KEY || !env.YC_FOLDER_ID) return null;
  const res = await fetch("https://searchapi.api.cloud.yandex.net/v2/wordstat/topRequests", {
    method: "POST",
    headers: { Authorization: "Api-Key " + env.YC_SEARCH_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ phrase, numPhrases: "50", devices: ["DEVICE_ALL"], folderId: env.YC_FOLDER_ID })
  });
  if (!res.ok) throw new Error(`Cloud Search API ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return { source: "Yandex Cloud Search API", phrase, ...parse(await res.json()) };
}

async function lookup(phrase) {
  if (!FRESH) {
    const hit = fromCore(phrase) || fromCache(phrase);
    if (hit) return hit;
  }
  const errors = [];
  for (const fn of [fromWordstatApi, fromCloudApi]) {
    try {
      const d = await fn(phrase);
      if (d) { d.fetched = new Date().toISOString(); toCache(d); return d; }
    } catch (e) { errors.push(e.message); }
  }
  return { source: null, phrase, count: null, errors };
}

/* ── Вывод ───────────────────────────────────────────────────────── */
function show(d) {
  if (d.count == null) {
    console.log(`✗ «${d.phrase}» — нет данных о спросе.`);
    if (d.errors && d.errors.length) d.errors.forEach(e => console.log("   " + e));
    else console.log("   Нет ни частоты в ядре, ни ключей API. Варианты:\n" +
      "   • выгрузить фразу из wordstat.yandex.ru в seo/semcore/data/wordstat-<дата>.txt → node seo/semcore/import.js\n" +
      "   • WORDSTAT_TOKEN (заявка на доступ к API Вордстата) или YC_SEARCH_API_KEY + YC_FOLDER_ID в ~/.claude/secrets/site-analytics.env");
    return;
  }
  console.log(`${d.count >= MIN_FREQ ? "✓" : "✗"} «${d.phrase}» — ${d.count}/мес (${d.source}), порог ${MIN_FREQ}`);
  if (d.cluster) console.log(`   кластер ${d.cluster}: ${d.clusterFrequency}/мес · ${d.page ? "страница уже есть: /g/" + d.page + "/ — дописывать её, новую не плодить" : "страницы нет"}`);
  for (const t of (d.tail || []).slice(0, 10)) console.log(`   ${String(t.count).padStart(7)}  ${t.phrase}`);
}

async function main() {
  if (!phrases.length) {
    console.log('Использование: node seo/semcore/wordstat.js [--gate] [--fresh] "фраза" ["фраза"]');
    process.exit(2);
  }
  let pass = true;
  for (const p of phrases) {
    const d = await lookup(p);
    show(d);
    // Гейт: нет данных или спрос ниже порога — не пропускаем.
    // Страница под кластер уже есть — тоже не пропускаем: вторая статья каннибализирует первую.
    if (d.count == null || d.count < MIN_FREQ || d.page) pass = false;
  }
  if (GATE) {
    console.log(pass ? "\nГЕЙТ: пропускаем, пиши статью." : "\nГЕЙТ: стоп. Спрос не подтверждён или страница под тему уже есть.");
    process.exit(pass ? 0 : 1);
  }
}

if (require.main === module) main().catch(e => { console.error("Вордстат:", e.message); process.exit(1); });
module.exports = { lookup };
