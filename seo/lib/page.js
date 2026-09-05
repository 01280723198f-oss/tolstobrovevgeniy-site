/* Шаблон страницы. Весь контент отдаётся уже в HTML — без JS.
   Это и есть главная починка: раньше текст статьи рисовался в браузере
   из 188 КБ guides.js, и поисковик видел пустой каркас. */

const C = require("../config");
const S = require("./schema");
const A = require("./analytics");
const { escapeHtml } = require("./text");

/** Внутренние ссылки ставим от корня: короче в HTML и не ломаются
    при проверке сайта локально или на другом домене. */
const rel = url => String(url).replace(C.origin, "") || "/";

const head = ({ title, description, canonical, robots, ogType, ogImage, published, modified, prev, next, extraHead = "" }) => `<!DOCTYPE html>
<html lang="${C.lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${canonical}">
  <meta name="robots" content="${robots || "index, follow, max-image-preview:large, max-snippet:-1"}">
  <meta property="og:type" content="${ogType || "article"}">
  <meta property="og:site_name" content="${escapeHtml(C.siteName)}">
  <meta property="og:locale" content="${C.locale}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${C.origin}${ogImage || C.seo.ogImage}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${C.origin}${ogImage || C.seo.ogImage}">
  ${published ? `<meta property="article:published_time" content="${published}">` : ""}
  ${modified ? `<meta property="article:modified_time" content="${modified}">` : ""}
  ${prev ? `<link rel="prev" href="${prev}">` : ""}
  ${next ? `<link rel="next" href="${next}">` : ""}
  <link rel="alternate" type="application/rss+xml" title="${escapeHtml(C.siteName)}" href="${C.origin}/rss.xml">
  <link rel="stylesheet" href="/styles.css">
  <link rel="stylesheet" href="/assets/seo.css">
  ${A.head()}
  ${extraHead}
</head>
<body>`;

const header = () => `
  <header class="site-header">
    <div class="wrap">
      <a class="brand" href="/">
        <span class="logo">🔥</span>
        <span>${escapeHtml(C.brand)}</span>
      </a>
      <a class="btn-channel" href="${C.telegram}" target="_blank" rel="noopener" data-goal="tg-header">
        📲 <span class="full">Telegram-канал</span>
      </a>
    </div>
  </header>`;

const footer = (topics = []) => `
  <footer class="site-footer">
    <div class="wrap">
      <p class="footer-tagline">🚀 Строим Telegram-канал. Строим контент-завод.</p>
      ${topics.length ? `<nav class="footer-topics">${topics.map(t =>
        `<a href="${rel(t.url)}">${escapeHtml(t.name)}</a>`).join(" · ")}</nav>` : ""}
      <p>© <span>${new Date().getFullYear()}</span> ${escapeHtml(C.brand)} · Строим вместе 🔥<br>
      <a href="${C.telegram}" target="_blank" rel="noopener" data-goal="tg-footer">Telegram-канал</a></p>
    </div>
  </footer>
  <script src="/assets/analytics.js" defer></script>
</body>
</html>`;

const crumbs = items => `
      <nav class="breadcrumbs" aria-label="Хлебные крошки">
        ${items.map((it, i) => i === items.length - 1
          ? `<span>${escapeHtml(it.name)}</span>`
          : `<a href="${rel(it.url)}">${escapeHtml(it.name)}</a><span class="sep">/</span>`).join("")}
      </nav>`;

const cta = (heading, text) => `
      <section class="cta-block">
        <h3>${heading}</h3>
        <p>${text}</p>
        <a class="btn-channel" href="${C.telegram}" target="_blank" rel="noopener" data-goal="tg-cta">📲 Зайти в канал и идти рядом 🔥</a>
      </section>`;

/* ── Страница статьи ───────────────────────────────────────────── */
function articlePage(p, { topics }) {
  const bc = [
    { name: "Главная", url: C.origin + "/" },
    ...(p.topic ? [{ name: p.tag, url: p.topic.url }] : []),
    { name: p.title, url: p.url }
  ];

  const ld = [S.article(p), S.breadcrumbs(bc)];
  if (p.faq && p.faq.length) ld.push(S.faqPage(p.faq));

  const toc = p.toc.length >= 3 ? `
      <nav class="toc" aria-label="Содержание">
        <p class="toc-title">В этой инструкции</p>
        <ol>${p.toc.filter(h => h.level === 2).map(h =>
          `<li><a href="#${h.id}">${escapeHtml(h.text)}</a></li>`).join("")}</ol>
      </nav>` : "";

  const related = p.related.length ? `
      <section class="related">
        <h2>Читайте дальше</h2>
        <div class="related-list">${p.related.map(r => `
          <a class="related-card" href="${rel(r.url)}">
            <span class="tag">${escapeHtml(r.tag)}</span>
            <span class="related-title">${escapeHtml(r.title)}</span>
            <span class="related-sub">${escapeHtml(r.shortSub)}</span>
          </a>`).join("")}</div>
      </section>` : "";

  return head({
    title: p.metaTitle, description: p.description, canonical: p.url,
    published: p.iso, modified: p.isoModified, ogImage: p.image,
    extraHead: ld.map(S.tag).join("\n  ")
  }) + header() + `
  <main class="wrap">
    <article class="article">
      ${crumbs(bc)}
      <div class="meta">
        <a class="tag" href="${p.topic ? rel(p.topic.url) : "/"}">${escapeHtml(p.tag)}</a>
        <time datetime="${p.iso}">${escapeHtml(p.date)}</time>
        <span>· ${escapeHtml(p.readingTime)}</span>
      </div>
      <h1>${escapeHtml(p.title)}</h1>
      <p class="lead">${escapeHtml(p.subtitle)}</p>
      ${toc}
      <div class="content">
${p.html}
      </div>
      ${cta("Это только фундамент. А дальше?",
        "Как собрать первый скилл под себя, построить контент-завод, привести трафик и превратить подписчика в оплату — разбираю по шагам в Telegram. Честный дневник стройки с нуля.")}
      ${related}
    </article>
  </main>` + footer(topics);
}

/* ── Главная: библиотека статей ────────────────────────────────── */
function indexPage(pages, topics) {
  const ld = [S.website(), S.itemList(pages, "Инструкции")];
  const title = `Claude Code и контент-завод — инструкции ${C.brand}`;
  const description = "Пошаговые инструкции: как собрать контент-завод на Claude Code — скиллы, промпты, автоматизация контента, воронки и монетизация трафика.";

  return head({
    title, description, canonical: C.origin + "/", ogType: "website",
    extraHead: ld.map(S.tag).join("\n  ")
  }) + header() + `
  <main class="wrap">
    <h1 class="page-h1">Инструкции по Claude Code и контент-заводу</h1>
    <p class="page-lead">${escapeHtml(C.author.jobTitle)}. Здесь — разборы и пошаговые инструкции: как отдать контент коду и довести человека от просмотра до оплаты.</p>

    <nav class="topics-row" aria-label="Темы">
      ${topics.map(t => `<a class="topic-chip" href="${rel(t.url)}">${escapeHtml(t.name)} <span>${t.count}</span></a>`).join("")}
    </nav>

    <h2 class="section-title">Все инструкции</h2>
    <div class="guides">
      ${pages.map(card).join("")}
    </div>

    ${cta("Хочешь видеть весь путь?",
      "Инструкции — это выжимка. Живой дневник стройки, разборы и анонсы новых инструментов — в Telegram-канале.")}
  </main>` + footer(topics);
}

/* ── Страница темы (хаб под кластер запросов) ──────────────────── */
function topicPage(topic, pages, topics) {
  const bc = [{ name: "Главная", url: C.origin + "/" }, { name: topic.name, url: topic.url }];
  const ld = [S.itemList(pages, topic.name), S.breadcrumbs(bc)];

  return head({
    title: `${topic.name} — инструкции и разборы | ${C.brand}`,
    description: topic.description,
    canonical: topic.url, ogType: "website",
    extraHead: ld.map(S.tag).join("\n  ")
  }) + header() + `
  <main class="wrap">
    <article class="article">
      ${crumbs(bc)}
      <h1>${escapeHtml(topic.name)}</h1>
      <p class="lead">${escapeHtml(topic.description)}</p>
      <div class="guides">
        ${pages.map(card).join("")}
      </div>
      ${cta("Свежее — в канале", "Новые разборы и инструменты выходят в Telegram раньше, чем попадают сюда.")}
    </article>
  </main>` + footer(topics);
}

function card(p) {
  return `
      <a class="guide-card" href="${rel(p.url)}">
        <div class="meta">
          <span class="tag">${escapeHtml(p.tag)}</span>
          <time datetime="${p.iso}">${escapeHtml(p.date)}</time>
          <span>· ${escapeHtml(p.readingTime)}</span>
        </div>
        <h2>${escapeHtml(p.title)}</h2>
        <p>${escapeHtml(p.shortSub)}</p>
        <p style="margin-top:14px"><span class="arrow">Читать →</span></p>
      </a>`;
}

module.exports = { articlePage, indexPage, topicPage };
