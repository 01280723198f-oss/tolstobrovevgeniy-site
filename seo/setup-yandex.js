#!/usr/bin/env node
/* =====================================================================
   ПОДКЛЮЧЕНИЕ ЯНДЕКСА ОДНОЙ КОМАНДОЙ
   Создаёт счётчик Метрики, заводит цели, добавляет сайт в Вебмастер,
   подтверждает права и отправляет карту сайта.
   Нужен один OAuth-токен Яндекса (как получить — в конце файла).

   Запуск:  YANDEX_TOKEN=<токен> node seo/setup-yandex.js
   ===================================================================== */

const fs = require("fs");
const os = require("os");
const path = require("path");
const C = require("./config");

const DOMAIN = C.origin.replace(/^https?:\/\//, "");
const ENV_FILE = path.join(os.homedir(), ".claude/secrets/site-analytics.env");
const TOKEN = process.env.YANDEX_TOKEN || readToken();

/* Цели: считаем не визиты, а движение к результату. */
const GOALS = [
  { name: "Клик в Telegram", type: "action", conditions: [{ type: "exact", url: "tg_click" }] },
  { name: "Дочитал статью", type: "action", conditions: [{ type: "exact", url: "read_complete" }] },
  { name: "Прокрутил 75 %", type: "action", conditions: [{ type: "exact", url: "scroll_75" }] },
  { name: "Провёл минуту", type: "action", conditions: [{ type: "exact", url: "engaged_60s" }] },
  { name: "Скопировал текст", type: "action", conditions: [{ type: "exact", url: "copy_text" }] }
];

function readToken() {
  if (!fs.existsSync(ENV_FILE)) return "";
  const m = fs.readFileSync(ENV_FILE, "utf8").match(/^YANDEX_TOKEN=(.*)$/m);
  return m ? m[1].trim() : "";
}

function writeEnv(updates) {
  const lines = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, "utf8").split("\n") : [];
  for (const [k, v] of Object.entries(updates)) {
    const i = lines.findIndex(l => l.startsWith(k + "="));
    if (i >= 0) lines[i] = `${k}=${v}`; else lines.push(`${k}=${v}`);
  }
  fs.writeFileSync(ENV_FILE, lines.join("\n"), { mode: 0o600 });
}

async function api(url, { method = "GET", body } = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: "OAuth " + TOKEN,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch (e) { data = { raw: text }; }
  return { ok: res.ok, status: res.status, data };
}

/* ── Метрика ───────────────────────────────────────────────────────── */

async function setupMetrika() {
  const list = await api("https://api-metrika.yandex.net/management/v1/counters");
  if (!list.ok) {
    console.error(`✗ Метрика недоступна (${list.status}). Токен без права metrika:write?`);
    return null;
  }

  const existing = (list.data.counters || []).find(c => (c.site || c.site2?.site || "").includes(DOMAIN));
  if (existing) {
    console.log(`· Счётчик уже есть: #${existing.id}`);
    return existing.id;
  }

  const created = await api("https://api-metrika.yandex.net/management/v1/counters", {
    method: "POST",
    // Создаём минимальный счётчик: лишние поля API отвергает целиком.
    // Вебвизор включаем отдельным запросом ниже.
    body: { counter: { name: C.brand, site2: { site: DOMAIN } } }
  });
  if (!created.ok) {
    console.error("✗ Не удалось создать счётчик:", JSON.stringify(created.data).slice(0, 300));
    return null;
  }
  const id = created.data.counter.id;
  console.log(`✓ Счётчик Метрики создан: #${id}`);

  // Вебвизор: без него не видно, как люди читают статьи.
  const wv = await api(`https://api-metrika.yandex.net/management/v1/counter/${id}`, {
    method: "PUT",
    body: { counter: { webvisor: { arch_enabled: true, arch_type: "proxy", load_player_type: "proxy" } } }
  });
  console.log(wv.ok ? "  ✓ вебвизор включён" : "  · вебвизор включи вручную в настройках счётчика");
  return id;
}

async function setupGoals(counterId) {
  const have = await api(`https://api-metrika.yandex.net/management/v1/counter/${counterId}/goals`);
  const names = new Set((have.data.goals || []).map(g => g.name));

  for (const goal of GOALS) {
    if (names.has(goal.name)) { console.log(`  · цель «${goal.name}» уже есть`); continue; }
    const r = await api(`https://api-metrika.yandex.net/management/v1/counter/${counterId}/goals`, {
      method: "POST", body: { goal }
    });
    console.log(r.ok ? `  ✓ цель «${goal.name}»` : `  ✗ цель «${goal.name}»: ${JSON.stringify(r.data).slice(0, 160)}`);
  }
}

/* ── Вебмастер ─────────────────────────────────────────────────────── */

async function setupWebmaster() {
  const me = await api("https://api.webmaster.yandex.net/v4/user");
  if (!me.ok) {
    console.error(`✗ Вебмастер недоступен (${me.status}). Токен без права на Вебмастер?`);
    return;
  }
  const userId = me.data.user_id;

  const hosts = await api(`https://api.webmaster.yandex.net/v4/user/${userId}/hosts`);
  let host = (hosts.data.hosts || []).find(h => h.ascii_host_url.includes(DOMAIN));

  if (!host) {
    const added = await api(`https://api.webmaster.yandex.net/v4/user/${userId}/hosts`, {
      method: "POST", body: { host_url: C.origin }
    });
    if (!added.ok) {
      console.error("✗ Не удалось добавить сайт:", JSON.stringify(added.data).slice(0, 250));
      return;
    }
    host = { host_id: added.data.host_id };
    console.log("✓ Сайт добавлен в Вебмастер");
  } else {
    console.log("· Сайт в Вебмастере уже есть");
  }

  // Подтверждение прав мета-тегом: движок вставит его в <head> при сборке.
  const verif = await api(
    `https://api.webmaster.yandex.net/v4/user/${userId}/hosts/${host.host_id}/verification/?verification_type=META_TAG`,
    { method: "POST" }
  );
  const uin = verif.data?.uin || verif.data?.verification_uin;
  if (uin) {
    writeEnv({ YANDEX_VERIFICATION: uin });
    console.log(`✓ Код подтверждения получен и записан в secrets (${uin.slice(0, 8)}…)`);
    console.log("  Дальше: node seo/build.js && git add -A && git commit -m 'сео: метрика' && git push");
    console.log("  После деплоя запусти скрипт ещё раз — он попросит Яндекс проверить права.");
  } else {
    console.log("· Код подтверждения не выдан (возможно, права уже подтверждены)");
  }

  const sitemap = await api(
    `https://api.webmaster.yandex.net/v4/user/${userId}/hosts/${host.host_id}/user-added-sitemaps`,
    { method: "POST", body: { url: C.origin + "/sitemap.xml" } }
  );
  console.log(sitemap.ok ? "✓ Карта сайта отправлена в Вебмастер" : "· Карта сайта: " + JSON.stringify(sitemap.data).slice(0, 160));
}

/* ── Прогон ────────────────────────────────────────────────────────── */

async function main() {
  if (!TOKEN) {
    console.log(`
Нет токена. Как получить (5 минут, делается один раз):

  1. Открой https://oauth.yandex.ru/client/new
  2. Название — любое, например «СЕО сайта».
     Платформа — «Веб-сервисы», Redirect URI — https://oauth.yandex.ru/verification_code
  3. Права отметь:
       Яндекс.Метрика  → «Получение статистики, чтение параметров своих и доверенных счётчиков»
                         и «Управление своими счётчиками»
       Яндекс.Вебмастер → «Добавление сайтов, получение информации о сайтах»
  4. Создай приложение, скопируй ClientID.
  5. Открой в браузере, подставив ClientID:
       https://oauth.yandex.ru/authorize?response_type=token&client_id=<ClientID>
     Разреши доступ — токен будет в адресной строке после #access_token=

  6. Запусти:  YANDEX_TOKEN=<токен> node seo/setup-yandex.js
     (или впиши строку YANDEX_TOKEN=... в ~/.claude/secrets/site-analytics.env)
`);
    process.exit(1);
  }

  console.log(`Настраиваю Яндекс для ${DOMAIN}\n`);

  const counterId = await setupMetrika();
  if (counterId) {
    writeEnv({ METRIKA_ID: String(counterId) });
    await setupGoals(counterId);
  }

  console.log("");
  await setupWebmaster();

  console.log(`
Готово. Ключи в ~/.claude/secrets/site-analytics.env — в репозиторий они не попадают.
Осталось пересобрать и выложить:
  cd site && node seo/build.js && git add -A && git commit -m "сео: счётчики" && git push`);
}

main();
