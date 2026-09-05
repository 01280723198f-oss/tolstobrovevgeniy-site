/* Markdown → HTML на сборке (не в браузере): заголовки с якорями, TOC,
   абсолютные пути картинок, внешние ссылки с rel, извлечение FAQ. */

const { marked } = require("marked");
const { slugify, plain, clamp } = require("./text");

marked.setOptions({ gfm: true, breaks: false, mangle: false, headerIds: false });

/** Рендер статьи. Возвращает html, оглавление, первый абзац, FAQ-пары. */
function render(md, { origin } = {}) {
  const toc = [];
  const used = new Set();

  const renderer = new marked.Renderer();

  renderer.heading = function ({ tokens, depth: level }) {
    const text = this.parser.parseInline(tokens);
    const clean = String(text).replace(/<[^>]+>/g, "");
    let id = slugify(clean) || "h" + toc.length;
    while (used.has(id)) id += "-" + toc.length;
    used.add(id);
    if (level === 2 || level === 3) toc.push({ id, text: clean, level });
    return `<h${level} id="${id}">${text}</h${level}>\n`;
  };

  renderer.image = function ({ href, title, text }) {
    const src = /^https?:|^\//.test(href) ? href : "/" + href.replace(/^\.?\//, "");
    return `<img src="${src}" alt="${text || ""}"${title ? ` title="${title}"` : ""} loading="lazy" decoding="async">`;
  };

  renderer.link = function ({ href, title, tokens }) {
    const text = this.parser.parseInline(tokens);
    const external = /^https?:\/\//.test(href) && !(origin && href.startsWith(origin));
    const attrs = external ? ' target="_blank" rel="noopener"' : "";
    return `<a href="${href}"${title ? ` title="${title}"` : ""}${attrs}>${text}</a>`;
  };

  const html = marked.parse(String(md).trim(), { renderer });

  // Первый содержательный абзац — донор description, если своего нет.
  const firstPara = (String(md).trim().split(/\n{2,}/).find(p => p.trim() && !/^[#>!\-*|`]/.test(p.trim())) || "");

  return { html, toc, lead: clamp(plain(firstPara), 300), faq: extractFaq(md) };
}

/** Заголовки-вопросы уровня ## / ### + текст под ними → пары для FAQPage. */
function extractFaq(md) {
  const out = [];
  const re = /^#{2,3}\s+(.+\?)\s*$/gm;
  let m;
  const src = String(md);
  while ((m = re.exec(src))) {
    const rest = src.slice(m.index + m[0].length);
    const answer = plain(rest.split(/^#{1,3}\s/m)[0]);
    if (answer.length > 40) out.push({ q: m[1].trim(), a: clamp(answer, 500) });
  }
  return out.slice(0, 6);
}

module.exports = { render, extractFaq };
