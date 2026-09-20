#!/usr/bin/env node
/* =====================================================================
   ПЕРЕОБХОД · очередь Яндекс.Вебмастера (квота 150 адресов в сутки)
   Гоняем робота по адресам, которые он ещё не видел или которые
   обновились. Без этого на молодом домене без ссылок робот заходит
   раз в месяц.

   Запуск:
     node seo/recrawl.js               — новые/изменённые с прошлого раза
     node seo/recrawl.js --all         — все адреса карты (в пределах квоты)
     node seo/recrawl.js <url> [url]   — конкретные адреса
   ===================================================================== */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const R = (...p) => path.join(ROOT, ...p);

const ENV = R("../..", ".claude/secrets/site-analytics.env");
const envPath = path.join(process.env.HOME, ".claude/secrets/site-analytics.env");
const env = {};
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const TOKEN = env.YANDEX_TOKEN;
const HOST_ID = "https:tolstobrovevgeniy.ru:443";
const STATE = R("seo/.recrawl-state.json");

const ARGS = process.argv.slice(2);
const ALL = ARGS.includes("--all");
const explicit = ARGS.filter(a => a.startsWith("http"));

const api = (url, opts = {}) => fetch(url, {
  ...opts,
  headers: { Authorization: "OAuth " + TOKEN, "Content-Type": "application/json", ...(opts.headers || {}) }
});

function sitemapEntries() {
  const xml = fs.readFileSync(R("sitemap.xml"), "utf8");
  return [...xml.matchAll(/<url>\s*<loc>(.*?)<\/loc>(?:\s*<lastmod>(.*?)<\/lastmod>)?/g)]
    .map(m => ({ url: m[1], lastmod: m[2] || "" }));
}

async function main() {
  const uid = (await (await api("https://api.webmaster.yandex.net/v4/user")).json()).user_id;
  const base = `https://api.webmaster.yandex.net/v4/user/${uid}/hosts/${encodeURIComponent(HOST_ID)}`;
  const quota = await (await api(`${base}/recrawl/quota`)).json();
  const left = Number(quota.quota_remainder || 0);
  if (!left) { console.log("Переобход: квота на сегодня исчерпана"); return; }

  const entries = sitemapEntries();
  let state = {};
  try { state = JSON.parse(fs.readFileSync(STATE, "utf8")); } catch {}

  let urls = explicit.length ? explicit
    : ALL ? entries.map(e => e.url)
    : entries.filter(e => state[e.url] !== e.lastmod).map(e => e.url);

  urls = urls.slice(0, left);
  if (!urls.length) { console.log("Переобход: новых или изменённых адресов нет"); return; }

  let ok = 0, err = 0;
  for (const url of urls) {
    const res = await api(`${base}/recrawl/queue`, { method: "POST", body: JSON.stringify({ url }) });
    if (res.ok) { ok++; state[url] = (entries.find(e => e.url === url) || {}).lastmod || ""; }
    else { err++; if (err <= 2) console.log("  ✗", url, res.status, (await res.text()).slice(0, 120)); }
    await new Promise(r => setTimeout(r, 400));
  }
  fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
  console.log(`Переобход: отправлено ${ok}, ошибок ${err}, квота была ${left}`);
}

main().catch(e => { console.error("Переобход:", e.message); process.exit(1); });
