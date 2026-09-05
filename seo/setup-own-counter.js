#!/usr/bin/env node
/* Создаёт таблицу событий своего счётчика в Supabase и прописывает ключи
   в ~/.claude/secrets/site-analytics.env. Запуск: node seo/setup-own-counter.js */

const fs = require("fs");
const os = require("os");
const path = require("path");

function readEnv(file) {
  const env = {};
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
  return env;
}

function writeEnv(file, updates) {
  const lines = fs.existsSync(file) ? fs.readFileSync(file, "utf8").split("\n") : [];
  for (const [k, v] of Object.entries(updates)) {
    const i = lines.findIndex(l => l.startsWith(k + "="));
    if (i >= 0) lines[i] = `${k}=${v}`;
    else lines.push(`${k}=${v}`);
  }
  fs.writeFileSync(file, lines.join("\n"), { mode: 0o600 });
}

async function main() {
  const secrets = path.join(os.homedir(), ".claude/secrets");
  const sb = readEnv(path.join(secrets, "supabase.env"));
  const ref = sb.SUPABASE_PROJECT_REF;
  const token = sb.SUPABASE_ACCESS_TOKEN;
  if (!ref || !token) { console.error("Нет SUPABASE_PROJECT_REF или SUPABASE_ACCESS_TOKEN"); process.exit(1); }

  const sql = fs.readFileSync(path.join(__dirname, "own-counter.sql"), "utf8");

  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql })
  });
  const text = await res.text();
  if (!res.ok) { console.error("Ошибка Supabase:", res.status, text.slice(0, 400)); process.exit(1); }

  writeEnv(path.join(secrets, "site-analytics.env"), {
    OWN_ANALYTICS_URL: sb.NEXT_PUBLIC_SUPABASE_URL,
    OWN_ANALYTICS_KEY: sb.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    OWN_ANALYTICS_TABLE: "site_events"
  });

  console.log("✓ Таблица site_events и вьюхи site_daily / site_pages созданы");
  console.log("✓ Ключи прописаны в ~/.claude/secrets/site-analytics.env");
  console.log("  Дальше: node seo/build.js — счётчик встанет на все страницы");
}

main();
