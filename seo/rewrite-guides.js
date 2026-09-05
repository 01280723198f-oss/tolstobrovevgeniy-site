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

    g.markdown = body;
    g.readingTime = readingTime(body);
    g.updated = todayHuman();
    if (meta.seoTitle) g.seoTitle = meta.seoTitle;
    if (meta.seoDescription) g.seoDescription = meta.seoDescription;
    if (meta.keywords) g.keywords = meta.keywords;
    if (meta.title) g.title = meta.title;
    if (meta.subtitle) g.subtitle = meta.subtitle;

    applied.push({ id, before, after: words(body) });
  }

  fs.writeFileSync(GUIDES_FILE, serialize(CONFIG, GUIDES));

  console.log(`✓ Обновлено статей: ${applied.length}`);
  for (const a of applied) console.log(`  ${a.id}: ${a.before} → ${a.after} слов`);
}

if (require.main === module) main();
module.exports = { load, serialize, parseDraft };
