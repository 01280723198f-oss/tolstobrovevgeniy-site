/* Перелинковка: похожие статьи + контекстные ссылки внутри текста.
   Перелинковка — главный бесплатный рычаг: она передаёт вес,
   держит человека на сайте и объясняет поисковику тематику раздела. */

const { tokens, stem } = require("./text");

/** Вес слова: чем реже встречается по сайту, тем сильнее связывает (idf). */
function buildIndex(pages) {
  const df = new Map();
  const vecs = new Map();
  for (const p of pages) {
    const bag = new Map();
    const src = [p.title, p.subtitle, (p.keywords || []).join(" "), p.plainBody || ""].join(" ");
    for (const t of tokens(src)) bag.set(t, (bag.get(t) || 0) + 1);
    vecs.set(p.slug, bag);
    for (const t of bag.keys()) df.set(t, (df.get(t) || 0) + 1);
  }
  const N = pages.length || 1;
  const idf = t => Math.log(1 + N / (1 + (df.get(t) || 0)));
  return { vecs, idf };
}

/** N самых близких статей по теме. Один кластер запросов ⇒ выше вес. */
function related(pages, count) {
  const { vecs, idf } = buildIndex(pages);
  const byCluster = new Map();
  for (const p of pages) {
    if (!p.cluster) continue;
    if (!byCluster.has(p.cluster)) byCluster.set(p.cluster, []);
    byCluster.get(p.cluster).push(p.slug);
  }

  const out = new Map();
  const ranking = new Map();
  for (const p of pages) {
    const a = vecs.get(p.slug);
    const scores = [];
    for (const q of pages) {
      if (q.slug === p.slug) continue;
      const b = vecs.get(q.slug);
      let s = 0;
      for (const [t, n] of a) if (b.has(t)) s += Math.min(n, b.get(t)) * idf(t);
      if (p.cluster && p.cluster === q.cluster) s *= 1.6;      // тот же кластер запросов
      if (p.tag === q.tag) s *= 1.15;                           // та же рубрика
      scores.push([q, s]);
    }
    scores.sort((x, y) => y[1] - x[1]);
    out.set(p.slug, scores.slice(0, count).map(([q]) => q));
    ranking.set(p.slug, scores);
  }

  ensureNoOrphans(pages, out, ranking, count);
  return out;
}

/** Ни одна страница не должна остаться без входящих ссылок: вес до неё
    просто не дойдёт. Сироту подставляем на последнее место в списке
    самой близкой к ней статьи. */
function ensureNoOrphans(pages, out, ranking, count) {
  const inbound = new Map(pages.map(p => [p.slug, 0]));
  for (const list of out.values()) for (const r of list) inbound.set(r.slug, (inbound.get(r.slug) || 0) + 1);

  for (const p of pages) {
    if (inbound.get(p.slug) > 0) continue;

    // Кто считает эту страницу самой близкой к себе — тот её и приютит.
    let host = null, hostScore = -1;
    for (const q of pages) {
      if (q.slug === p.slug) continue;
      const entry = (ranking.get(q.slug) || []).find(([r]) => r.slug === p.slug);
      if (entry && entry[1] > hostScore) { hostScore = entry[1]; host = q; }
    }
    if (!host) continue;

    const list = out.get(host.slug);
    list[Math.max(0, count - 1)] = p;
    inbound.set(p.slug, 1);
  }
}

/** Контекстные ссылки прямо в тексте: первое подходящее словосочетание → ссылка.
    Сравнение идёт по основам слов, поэтому «скиллы Claude Code» находится
    и в форме «скиллов Claude Code» — русская морфология не ломает перелинковку. */
function injectContextual(html, targets, max = 3) {
  const prepared = targets.map(t => ({
    url: t.url,
    anchors: (t.anchors || [])
      .map(a => ({ text: a, stems: tokens(a) }))
      .filter(a => a.stems.length >= 2 && a.stems.length <= 5)
      .sort((x, y) => y.stems.length - x.stems.length)
  }));

  let placed = 0;
  const usedTargets = new Set();

  return html.replace(/<p>([\s\S]*?)<\/p>/g, (block, inner) => {
    if (placed >= max) return block;
    if (/<a\s|<code|<img/i.test(inner)) return block;

    // Работаем только с текстовыми кусками, теги внутри абзаца не трогаем.
    const parts = inner.split(/(<[^>]+>)/);

    for (const t of prepared) {
      if (placed >= max || usedTargets.has(t.url)) continue;
      let done = false;

      for (const anchor of t.anchors) {
        for (let i = 0; i < parts.length && !done; i++) {
          if (parts[i].startsWith("<")) continue;
          const hit = findStems(parts[i], anchor.stems);
          if (!hit) continue;
          parts[i] = parts[i].slice(0, hit.start)
            + `<a href="${t.url}" class="ctx-link">` + parts[i].slice(hit.start, hit.end) + `</a>`
            + parts[i].slice(hit.end);
          usedTargets.add(t.url);
          placed++;
          done = true;
        }
        if (done) break;
      }
      if (done) inner = parts.join("");
    }
    return `<p>${parts.join("")}</p>`;
  });
}

/** Ищет подряд идущие слова, чьи основы совпадают с основами якоря. */
function findStems(text, stems) {
  const re = /[A-Za-zА-Яа-яЁё0-9]+/g;
  const found = [];
  let m;
  while ((m = re.exec(text))) found.push({ w: m[0], start: m.index, end: m.index + m[0].length });

  for (let i = 0; i + stems.length <= found.length; i++) {
    let ok = true;
    for (let j = 0; j < stems.length; j++) {
      if (stem(found[i + j].w) !== stems[j]) { ok = false; break; }
    }
    if (ok) return { start: found[i].start, end: found[i + stems.length - 1].end };
  }
  return null;
}

function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

module.exports = { related, injectContextual };
