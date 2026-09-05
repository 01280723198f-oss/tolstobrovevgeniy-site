#!/usr/bin/env node
/* =====================================================================
   ПРИМЕНЕНИЕ ДОРАБОТОК
   seo/drafts/<id>.md  →  обновляет статью в guides.js
   Черновик = frontmatter (seoTitle / seoDescription / keywords) + текст.
   Запуск: node seo/rewrite-guides.js [id ...]     (без аргументов — все)
   ===================================================================== */

const fs = require("fs");
const path = require("path");
const { words } = require("./lib/text");

const ROOT = path.resolve(__dirname, "..");
const GUIDES_FILE = path.join(ROOT, "guides.js");
const DRAFTS = path.join(__dirname, "drafts");

function load() {
  const sandbox = {};
  new Function("g", fs.readFileSync(GUIDES_FILE, "utf8").replace(/^const /gm, "g."))(sandbox);
  return sandbox;
}

/** Разбор черновика: --- frontmatter --- + тело. */
function parseDraft(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw.trim() };
  const meta = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([a-zA-Z]+):\s*(.*)$/);
    if (!kv) continue;
    meta[kv[1]] = kv[2].trim();
  }
  if (meta.keywords) meta.keywords = meta.keywords.split(";").map(s => s.trim()).filter(Boolean);
  return { meta, body: m[2].trim() };
}

/** Подстановка исходного текста статьи вместо маркера.
    Возвращает null, если черновик уже применён — иначе повторный прогон
    вклеил бы дописанные разделы второй раз. */
function spliceOriginal(body, original) {
  // Вставка новых разделов ПЕРЕД указанным заголовком: хвост статьи
  // (вопросы, призыв) остаётся на месте.
  const before = body.match(/<!--\s*ВСТАВКА-ПЕРЕД\s+"([^"]+)"\s*-->/);
  if (before) {
    const insertion = body.slice(body.indexOf(before[0]) + before[0].length).trim();
    const firstHeading = (insertion.match(/^## .+$/m) || [])[0];
    if (firstHeading && original.includes(firstHeading.trim())) return null;
    const idx = original.indexOf(before[1]);
    if (idx < 0) return original + "\n\n" + insertion;
    return original.slice(0, idx).trimEnd() + "\n\n" + insertion + "\n\n" + original.slice(idx);
  }

  const hasMarker = /<!--\s*ОРИГИНАЛ/.test(body);
  // Полный черновик просто заменяет текст — повторный прогон безопасен.
  if (!hasMarker) return body;

  // Дописывающий черновик клеится к оригиналу, поэтому второй прогон
  // задвоил бы разделы. Узнаём это по заголовку первого дописанного раздела.
  const appended = body.split(/<!--[\s\S]*?-->/).pop();
  const firstHeading = (appended.match(/^## .+$/m) || [])[0];
  if (firstHeading && original.includes(firstHeading.trim())) return null;

  const cut = body.match(/<!--\s*ОРИГИНАЛ:ДО\s+"([^"]+)"\s*-->/);
  if (cut) {
    const idx = original.indexOf(cut[1]);
    const head = idx > 0 ? original.slice(0, idx).trimEnd() : original;
    return body.replace(cut[0], head);
  }
  if (body.includes("<!-- ОРИГИНАЛ -->")) return body.replace("<!-- ОРИГИНАЛ -->", original);
  return body;
}

/** Время чтения: 180 слов в минуту — обычный темп чтения с экрана. */
const readingTime = md => `${Math.max(2, Math.round(words(md) / 180))} мин`;

const MONTHS = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
const todayHuman = () => {
  const d = new Date();
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

/** Сериализация обратно в guides.js. Тело статьи живёт в шаблонной строке,
    поэтому экранируем обратные кавычки и ${ — иначе файл не распарсится. */
const esc = s => String(s).replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
const str = s => JSON.stringify(String(s));

function serialize(CONFIG, GUIDES) {
  const head = `/* =====================================================================
   ЕВГЕНИЙ ТОЛСТОБРОВ — данные сборника инструкций
   ---------------------------------------------------------------------
   Чтобы добавить новую инструкцию: скопируй блок { ... } внутри GUIDES,
   поменяй id, title, subtitle, tag, date, readingTime и markdown.
   Новая инструкция сама появится на главной и получит свою страницу.
   После правки обязательно:  node seo/build.js
   (иначе статья не попадёт ни на главную, ни в sitemap, ни в перелинковку)

   Поля для поиска (необязательные): seoTitle, seoDescription, keywords, updated.
   ВАЖНО: символ обратной кавычки внутри текста экранируется как \\\`
   ===================================================================== */

const CONFIG = ${JSON.stringify(CONFIG, null, 2)};

const GUIDES = [
`;

  const body = GUIDES.map(g => {
    const lines = [
      `    id: ${str(g.id)},`,
      `    title: ${str(g.title)},`,
      `    subtitle: ${str(g.subtitle)},`,
      `    tag: ${str(g.tag)},`,
      `    date: ${str(g.date)},`,
      `    readingTime: ${str(g.readingTime)},`
    ];
    if (g.updated) lines.push(`    updated: ${str(g.updated)},`);
    if (g.seoTitle) lines.push(`    seoTitle: ${str(g.seoTitle)},`);
    if (g.seoDescription) lines.push(`    seoDescription: ${str(g.seoDescription)},`);
    if (g.keywords && g.keywords.length) lines.push(`    keywords: ${JSON.stringify(g.keywords)},`);
    lines.push("    markdown: `\n" + esc(g.markdown.trim()) + "\n`");
    return "  {\n" + lines.join("\n") + "\n  }";
  }).join(",\n");

  return head + body + "\n];\n";
}

function main() {
  const only = process.argv.slice(2);
  const { CONFIG, GUIDES } = load();

  if (!fs.existsSync(DRAFTS)) { console.log("Папки черновиков нет"); return; }
  const files = fs.readdirSync(DRAFTS).filter(f => f.endsWith(".md"))
    .filter(f => !only.length || only.includes(f.replace(/\.md$/, "")));

  if (!files.length) { console.log("Черновиков нет"); return; }

  fs.copyFileSync(GUIDES_FILE, path.join(__dirname, "backup/guides.js.bak"));

  const applied = [];
  for (const f of files) {
    const id = f.replace(/\.md$/, "");
    const g = GUIDES.find(x => x.id === id);
    if (!g) { console.log(`  ⚠ ${id}: такой статьи нет в guides.js`); continue; }

    const { meta, body } = parseDraft(fs.readFileSync(path.join(DRAFTS, f), "utf8"));
    const before = words(g.markdown);

    // Маркеры подстановки исходного текста — чтобы дописывать разделы,
    // не копируя статью целиком:
    //   <!-- ОРИГИНАЛ -->              весь текущий текст
    //   <!-- ОРИГИНАЛ:ДО "## Заголовок" -->  текст до этого заголовка
    const merged = spliceOriginal(body, g.markdown.trim());
    if (merged === null) { console.log(`  · ${id}: уже применён, пропускаю`); continue; }

    g.markdown = merged;
    g.readingTime = readingTime(merged);
    g.updated = todayHuman();
    if (meta.seoTitle) g.seoTitle = meta.seoTitle;
    if (meta.seoDescription) g.seoDescription = meta.seoDescription;
    if (meta.keywords) g.keywords = meta.keywords;
    if (meta.title) g.title = meta.title;
    if (meta.subtitle) g.subtitle = meta.subtitle;

    applied.push({ id, before, after: words(merged) });
  }

  fs.writeFileSync(GUIDES_FILE, serialize(CONFIG, GUIDES));

  console.log(`✓ Обновлено статей: ${applied.length}`);
  for (const a of applied) console.log(`  ${a.id}: ${a.before} → ${a.after} слов`);
}

if (require.main === module) main();
module.exports = { load, serialize, parseDraft };
