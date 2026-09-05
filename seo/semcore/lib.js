/* =====================================================================
   СЕМАНТИЧЕСКОЕ ЯДРО · общая механика
   Запрос → нормализация → кластер → страница.
   Правило движка: одна страница = один кластер. Две страницы под один
   кластер конкурируют между собой и обе проседают (каннибализация).
   ===================================================================== */

const { stem, stemHard, tokens, tokensHard, plain } = require("../lib/text");

/* ── Разбор выгрузки ───────────────────────────────────────────────
   Понимает всё, что реально приходит из Вордстата:
   "запрос<TAB>1234", "запрос;1 234", "запрос — 1234", CSV с шапкой,
   а также копипаст прямо со страницы wordstat.yandex.ru.            */
function parseDump(raw) {
  const out = [];
  for (let line of String(raw).split(/\r?\n/)) {
    line = line.trim();
    if (!line) continue;
    if (/^(фраза|запрос|keyword|phrase)\b/i.test(line)) continue;   // шапка таблицы

    const m = line.match(/^(.*?)[\t;,—–]?\s*([\d][\d\s ]*)$/);
    if (!m) continue;
    const q = m[1].replace(/^["']|["']$/g, "").replace(/\s+/g, " ").trim().toLowerCase();
    const freq = parseInt(m[2].replace(/[\s ]/g, ""), 10);
    if (!q || q.length < 3 || !Number.isFinite(freq)) continue;
    if (/^\d+$/.test(q)) continue;
    out.push({ q, freq });
  }

  // Дубли складываем, оставляя максимальную частоту.
  const map = new Map();
  for (const r of out) {
    const prev = map.get(r.q);
    if (!prev || r.freq > prev.freq) map.set(r.q, r);
  }
  return [...map.values()].sort((a, b) => b.freq - a.freq);
}

/* ── Интент: зачем человек это ищет ───────────────────────────────── */
const INTENT_RULES = [
  { intent: "коммерческий", re: /(купить|цена|стоимость|заказать|курс|обучение|наставник|тариф|подписка|консультац)/i },
  { intent: "навигационный", re: /(официальн|скачать|сайт|вход|войти|личный кабинет|телеграм канал)/i },
  { intent: "проблемный",   re: /(ошибка|не работает|не запускается|проблема|почему|лимит|бан|блокир|исправить)/i },
  { intent: "инструкция",   re: /(как |настро|установ|подключ|создать|сделать|запустить|инструкц|гайд|пошагов|туториал|руководство)/i },
  { intent: "сравнение",    re: /(vs|или|сравнени|лучше|отличи|альтернатив|против)/i },
  { intent: "определение",  re: /(что такое|что это|зачем|для чего|обзор|отзывы)/i }
];

function detectIntent(q) {
  for (const r of INTENT_RULES) if (r.re.test(q)) return r.intent;
  return "информационный";
}

/* ── Кластеризация ────────────────────────────────────────────────
   Без внешних сервисов: по совпадению основ слов, с поправкой на вес.
   «claude» и «code» есть почти в каждом запросе ниши и тем не различают —
   их вес почти нулевой. Различают «скиллы», «настроить», «память»:
   по ним и проходит граница между кластерами.                        */
function cluster(queries, { threshold = 0.5 } = {}) {
  const prepared = queries.map(r => ({ ...r, stems: new Set(tokensHard(r.q)) }))
    .filter(r => r.stems.size > 0)
    .sort((a, b) => b.freq - a.freq);

  const df = new Map();
  for (const r of prepared) for (const s of r.stems) df.set(s, (df.get(s) || 0) + 1);
  const N = prepared.length || 1;
  const weight = s => Math.log((N + 1) / ((df.get(s) || 0) + 1)) + 0.05;

  const clusters = [];

  for (const r of prepared) {
    let best = null, bestScore = 0;
    for (const c of clusters) {
      const score = similarity(r.stems, c.headStems, weight);
      if (score > bestScore) { bestScore = score; best = c; }
    }
    if (best && bestScore >= threshold) {
      best.queries.push({ q: r.q, freq: r.freq, intent: detectIntent(r.q) });
      best.frequency += r.freq;
      for (const s of r.stems) best.stems.add(s);
    } else {
      clusters.push({
        id: null, name: r.q, head: r.q,
        headStems: new Set(r.stems), stems: new Set(r.stems),
        frequency: r.freq,
        queries: [{ q: r.q, freq: r.freq, intent: detectIntent(r.q) }]
      });
    }
  }

  return clusters
    .map(c => ({
      id: idFor(c.head),
      name: c.head,
      intent: headIntent(c.head, c.queries),
      frequency: c.frequency,
      stems: [...c.stems],
      queries: c.queries.sort((a, b) => b.freq - a.freq),
      page: null
    }))
    .sort((a, b) => b.frequency - a.frequency);
}

/* ── Дробление слишком широких кластеров ──────────────────────────
   Кластер вроде «claude code» на 40 запросов — это не одна статья,
   а раздел. Режем его по уточняющему слову: «скиллы», «память», «mcp».
   Одна страница должна отвечать на один вопрос, иначе не ранжируется
   ни по одному из них.                                              */
function refine(clusters, { maxQueries = 8 } = {}) {
  const out = [];

  for (const c of clusters) {
    if (c.queries.length <= maxQueries) { out.push(c); continue; }

    const headStems = new Set(tokensHard(c.name));
    const groups = new Map();

    for (const q of c.queries) {
      const modifiers = tokensHard(q.q).filter(s => !headStems.has(s));
      const key = modifiers.length ? modifiers.sort().join("+") : "__head__";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(q);
    }

    // В головном кластере остаётся только сам предмет без уточнений —
    // каждое уточнение это отдельный запрос и отдельная статья.
    const head = [];
    const parts = [];
    for (const [key, qs] of groups) {
      if (key === "__head__") head.push(...qs);
      else parts.push(qs);
    }

    if (!parts.length) { out.push(c); continue; }

    if (head.length) {
      out.push(makeCluster(head.sort((a, b) => b.freq - a.freq)));
    }
    for (const qs of parts) out.push(makeCluster(qs.sort((a, b) => b.freq - a.freq)));
  }

  return out.sort((a, b) => b.frequency - a.frequency);
}

function makeCluster(queries) {
  const head = queries[0].q;
  const stems = new Set();
  for (const q of queries) for (const s of tokensHard(q.q)) stems.add(s);
  return {
    id: idFor(head),
    name: head,
    intent: headIntent(head, queries),
    frequency: queries.reduce((a, b) => a + b.freq, 0),
    stems: [...stems],
    queries,
    page: null
  };
}

/** Близость двух запросов: вес совпавших основ к весу более короткого. */
function similarity(a, b, weight = () => 1) {
  let common = 0, normA = 0, normB = 0;
  for (const s of a) { normA += weight(s); if (b.has(s)) common += weight(s); }
  for (const s of b) normB += weight(s);
  const denom = Math.min(normA, normB);
  return denom > 0 ? common / denom : 0;
}

function headIntent(head, queries) {
  const h = detectIntent(head);
  return h === "информационный" ? dominantIntent(queries) : h;
}

function dominantIntent(queries) {
  const score = {};
  for (const q of queries) score[q.intent] = (score[q.intent] || 0) + q.freq;
  return Object.entries(score).sort((a, b) => b[1] - a[1])[0][0];
}

function idFor(phrase) {
  const { slugify } = require("../lib/text");
  return slugify(phrase) || "cluster";
}

/* ── Привязка кластеров к страницам ───────────────────────────────
   Страница считается ответом на кластер, только если её ЗАГОЛОВОК несёт
   уточняющее слово запроса. Иначе «claude code ошибка» прилипнет к статье
   про установку, и обе не будут ранжироваться ни по одному запросу.
   Раздача идёт глобально: сначала самые уверенные пары, потом остальные. */
function matchPages(clusters, pages, { minScore = 0.7 } = {}) {
  const df = new Map();
  for (const c of clusters) for (const s of new Set(c.stems)) df.set(s, (df.get(s) || 0) + 1);
  const generic = new Set([...df].filter(([, n]) => n > clusters.length * 0.4).map(([s]) => s));

  const pageBags = pages.map(p => ({
    slug: p.slug,
    bag: new Set(tokensHard([p.title, p.subtitle, (p.keywords || []).join(" ")].join(" "))),
    titleBag: new Set(tokensHard(p.title)),
    body: new Set(tokensHard((p.plainBody || "").slice(0, 6000)))
  }));

  const pairs = [];
  for (const c of clusters) {
    const all = [...new Set(c.stems)];
    const distinctive = all.filter(s => !generic.has(s));
    const target = distinctive.length ? distinctive : all;
    const headOnly = distinctive.length === 0;

    for (const p of pageBags) {
      let inTitle = 0, inBody = 0;
      for (const s of target) {
        if (p.bag.has(s)) inTitle++;
        else if (p.body.has(s)) inBody++;
      }
      if (inTitle === 0) continue;
      if (headOnly && inTitle < target.length) continue;   // «голова» темы требует полного совпадения

      // Чем шире заголовок страницы, тем хуже она отвечает на узкий запрос.
      const focus = 1 / (1 + 0.06 * Math.max(0, p.titleBag.size - target.length));
      const score = ((inTitle + inBody * 0.3) / target.length) * focus;
      if (score >= minScore) pairs.push({ c, slug: p.slug, score });
    }
  }

  pairs.sort((x, y) => y.score - x.score);
  const usedPages = new Set(), usedClusters = new Set();
  for (const pair of pairs) {
    if (usedPages.has(pair.slug) || usedClusters.has(pair.c.id)) continue;
    pair.c.page = pair.slug;
    pair.c.matchScore = Number(pair.score.toFixed(2));
    usedPages.add(pair.slug);
    usedClusters.add(pair.c.id);
  }
  return clusters;
}

/* ── Оценка: сколько визитов реально снимет страница в топ-3 ─────── */
function forecastVisits(frequency) {
  // Средний CTR топ-3 в Яндексе по информационным запросам ≈ 25–35 %
  // от «!точной» частоты. Берём осторожные 25 %.
  return Math.round(frequency * 0.25);
}

module.exports = { parseDump, cluster, refine, matchPages, detectIntent, forecastVisits, similarity };
