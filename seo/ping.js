#!/usr/bin/env node
/* =====================================================================
   ПИНГ ПОИСКОВИКОВ · после каждой выкладки
   Не ждём, пока робот сам заметит новые страницы:
     1. берём адреса карты сайта, которые ещё не отправляли (или изменились);
     2. проверяем, что каждый уже отдаёт живой 200 (Pages собирается 1–2 мин —
        отправить в переобход 404 = сжечь квоту);
     3. отдаём живые в IndexNow (Яндекс + Bing) и в очередь переобхода
        Вебмастера (квота 150 адресов в сутки — хватает на 5–10 статей с запасом).
   Не дошедшие до 200 остаются в очереди и уйдут следующим запуском.

   Запуск:
     node seo/ping.js             — всё, что ещё не отправлено
     node seo/ping.js --dry       — только показать очередь
   ===================================================================== */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const R = (...p) => path.join(ROOT, ...p);
const DRY = process.argv.includes("--dry");
const BATCH = 150;

const read = f => { try { return JSON.parse(fs.readFileSync(R(f), "utf8")); } catch { return {}; } };

function pending() {
  const xml = fs.readFileSync(R("sitemap.xml"), "utf8");
  const sent = read("seo/.recrawl-state.json");
  return [...xml.matchAll(/<url>\s*<loc>(.*?)<\/loc>(?:\s*<lastmod>(.*?)<\/lastmod>)?/g)]
    .map(m => ({ url: m[1], lastmod: m[2] || "" }))
    .filter(e => sent[e.url] !== e.lastmod)
    // свежие вперёд: новые статьи важнее старых правок
    .sort((a, b) => b.lastmod.localeCompare(a.lastmod));
}

async function live(url) {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(10000) });
    return res.status === 200;
  } catch { return false; }
}

async function main() {
  const queue = pending();
  console.log(`В очереди на отправку: ${queue.length}`);
  if (!queue.length) return;

  const alive = [], dead = [];
  for (const e of queue.slice(0, BATCH)) (await live(e.url) ? alive : dead).push(e.url);
  console.log(`Живые 200: ${alive.length}, ещё не отвечают: ${dead.length}`);
  dead.slice(0, 5).forEach(u => console.log("   ждёт: " + u));
  if (DRY || !alive.length) return;

  const run = script => {
    try { execFileSync("node", [R("seo", script), ...alive], { stdio: "inherit", cwd: ROOT }); }
    catch { console.log(`   ${script} завершился с ошибкой — адреса останутся в очереди`); }
  };
  run("indexnow.js");
  run("recrawl.js");
}

main().catch(e => { console.error("Пинг:", e.message); process.exit(1); });
