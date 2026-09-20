#!/usr/bin/env node
/* =====================================================================
   INDEXNOW · мгновенное уведомление Яндекса и Bing о новых страницах
   Вместо ожидания, пока робот сам зайдёт по карте сайта, пушим адреса
   сразу после публикации.

   Запуск:
     node seo/indexnow.js              — только новые/изменённые с прошлого раза
     node seo/indexnow.js --all        — все адреса из sitemap.xml
     node seo/indexnow.js <url> [url]  — конкретные адреса
   ===================================================================== */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const R = (...p) => path.join(ROOT, ...p);

const KEY = "86c59ca1792c1ae88a967d582edfbda8";
const HOST = "tolstobrovevgeniy.ru";
const KEY_URL = `https://${HOST}/${KEY}.txt`;
const STATE = R("seo/.indexnow-state.json");
const ENDPOINT = "https://yandex.com/indexnow";     // общий пул IndexNow: Яндекс + Bing

const ARGS = process.argv.slice(2);
const ALL = ARGS.includes("--all");
const explicit = ARGS.filter(a => a.startsWith("http"));

function sitemapEntries() {
  const xml = fs.readFileSync(R("sitemap.xml"), "utf8");
  const out = [];
  for (const m of xml.matchAll(/<url>\s*<loc>(.*?)<\/loc>(?:\s*<lastmod>(.*?)<\/lastmod>)?/g)) {
    out.push({ url: m[1], lastmod: m[2] || "" });
  }
  return out;
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE, "utf8")); } catch { return {}; }
}

async function main() {
  const entries = sitemapEntries();
  const state = loadState();
  let urls;

  if (explicit.length) urls = explicit;
  else if (ALL) urls = entries.map(e => e.url);
  else urls = entries.filter(e => state[e.url] !== e.lastmod).map(e => e.url);

  if (!urls.length) { console.log("IndexNow: новых или изменённых адресов нет"); return; }

  // Лимит одного запроса — 10 000 адресов, режем с запасом
  const chunks = [];
  for (let i = 0; i < urls.length; i += 1000) chunks.push(urls.slice(i, i + 1000));

  for (const chunk of chunks) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_URL, urlList: chunk })
    });
    console.log(`IndexNow: отправлено ${chunk.length} адресов → HTTP ${res.status}`);
    if (res.status >= 400) console.log(await res.text().catch(() => ""));
  }

  const next = { ...state };
  for (const e of entries) if (urls.includes(e.url)) next[e.url] = e.lastmod;
  fs.writeFileSync(STATE, JSON.stringify(next, null, 2));
}

main().catch(e => { console.error("IndexNow:", e.message); process.exit(1); });
