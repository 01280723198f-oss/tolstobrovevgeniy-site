/* Шаблон страницы. Весь контент отдаётся уже в HTML — без JS.
   Это и есть главная починка: раньше текст статьи рисовался в браузере
   из 188 КБ guides.js, и поисковик видел пустой каркас. */

const C = require("../config");
const S = require("./schema");
const A = require("./analytics");
const L = require("./legal");
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
  <meta name="theme-color" content="#17161a">
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="icon" href="/favicon-192.png" type="image/png" sizes="192x192">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="stylesheet" href="/styles.css">
  <link rel="stylesheet" href="/assets/seo.css">
  ${A.head()}
  ${extraHead}
</head>
<body>`;

/* Ссылка в бот-подарок с меткой места: seo-<статья> | seo-home | seo-tema.
   Telegram пускает в start только [A-Za-z0-9_-] и не длиннее 64. */
const giftLink = (place = "home") =>
  `${C.giftBot}?start=${("seo-" + place).toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 64)}`;

const mpLink = place =>
  `${C.microProduct}?utm_source=site&utm_medium=article&utm_campaign=${encodeURIComponent(place)}`;

const header = (place = "home") => `
  <header class="site-header">
    <div class="wrap">
      <a class="brand" href="/">
        <span class="logo" aria-hidden="true">Т</span>
        <span>${escapeHtml(C.brand)}</span>
      </a>
      <a class="btn-channel" href="${giftLink(place)}" target="_blank" rel="noopener" data-goal="gift-header">
        🎁 <span class="full">Промпт в подарок</span><span class="short">Подарок</span>
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
      <a href="${C.telegram}" target="_blank" rel="noopener" data-goal="tg-footer">Telegram-канал</a></p>${L.footerLinks() ? "\n      " + L.footerLinks() : ""}
    </div>
  </footer>${L.cookieNote()}
  <script src="/assets/analytics.js" defer></script>
</body>
</html>`;

const crumbs = items => `
      <nav class="breadcrumbs" aria-label="Хлебные крошки">
        ${items.map((it, i) => i === items.length - 1
          ? `<span>${escapeHtml(it.name)}</span>`
          : `<a href="${rel(it.url)}">${escapeHtml(it.name)}</a><span class="sep">/</span>`).join("")}
      </nav>`;

/* Главный блок: бесплатный промпт в боте → база → цепочка → микро-продукт.
   Обещание сверено с подарком в ~/.business/growth/tg-gift-bot/gifts.json (intro / gift_text). */
const cta = (place = "home") => `
      <section class="cta-block cta-gift">
        <p class="cta-kicker">Бесплатно · в Telegram</p>
        <h3>Что продать своей аудитории? Промпт найдёт ответ за 15 минут</h3>
        <p>Ты отвечаешь на пять вопросов о своей нише, а промпт предлагает три темы первого микро-продукта и выбирает из них лучшую. Работает в ChatGPT и в Claude. Чтобы забрать, подпишись на канал в боте, и промпт придёт сразу.</p>
        <a class="btn-channel btn-gift" href="${giftLink(place)}" target="_blank" rel="noopener" data-goal="gift-cta">🎁 Забрать промпт бесплатно</a>
        <p class="cta-next">Хочешь сразу собрать продукт с приёмом оплаты? <a href="${mpLink(place)}" data-goal="mp-cta">Микро-продукт за вечер — от&nbsp;1&nbsp;990&nbsp;₽&nbsp;→</a></p>
      </section>`;

/* Короткий блок посреди статьи: до конца дочитывают единицы. */
const ctaInline = place => `
<aside class="cta-inline" aria-label="Подарок">
  <span class="cta-inline-icon">🎁</span>
  <p><strong>Пока читаешь:</strong> промпт «Что продать своей аудитории» за 15 минут найдёт три темы первого продукта под твою нишу. <a href="${giftLink(place)}" target="_blank" rel="noopener" data-goal="gift-inline">Забрать бесплатно в Telegram →</a></p>
</aside>
`;

/* Вставляем перед третьим разделом h2, если разделов хотя бы четыре. */
function withInlineCta(html, place) {
  const at = [...html.matchAll(/<h2[\s>]/g)].map(m => m.index);
  if (at.length < 4) return html;
  return html.slice(0, at[2]) + ctaInline(place) + html.slice(at[2]);
}

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
  }) + header(p.id) + `
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
${withInlineCta(p.html, p.id)}
      </div>
      ${cta(p.id)}
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

    ${cta("home")}
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
      ${cta("tema")}
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

/** Служебная страница (политика, согласие): без счётчиков в тексте, не в индексе поиска. */
function legalPage({ slug, title, description, body }, topics = []) {
  const url = `${C.origin}/${slug}/`;
  return head({ title, description, canonical: url, robots: "noindex, follow", ogType: "website" }) + header() + `
  <main class="wrap">
    <article class="article legal">
      ${crumbs([{ name: "Главная", url: C.origin + "/" }, { name: title, url }])}
      <h1>${escapeHtml(title)}</h1>
      ${body}
    </article>
  </main>` + footer(topics);
}

module.exports = { articlePage, indexPage, topicPage, legalPage };
