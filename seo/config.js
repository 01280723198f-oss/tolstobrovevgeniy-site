/* =====================================================================
   СЕО-ДВИЖОК — единая конфигурация
   Меняешь здесь → пересобираешь `node seo/build.js` → всё обновилось.
   ===================================================================== */

module.exports = {
  // ── Домен и бренд ───────────────────────────────────────────────
  origin: "https://tolstobrovevgeniy.ru",
  lang: "ru",
  locale: "ru_RU",
  brand: "Евгений Толстобров",
  siteName: "Инструкции по Claude Code и контент-заводу",
  author: {
    name: "Евгений Толстобров",
    jobTitle: "Маркетолог, автор контент-завода на Claude Code",
    sameAs: ["https://t.me/Evgeniy_Tolstobrov"]
  },
  telegram: "https://t.me/Evgeniy_Tolstobrov",

  // ── Структура URL ───────────────────────────────────────────────
  // Статья:  /g/<slug>/          Тема: /tema/<slug>/
  paths: { article: "g", topic: "tema" },

  // ── Счётчики ────────────────────────────────────────────────────
  analytics: {
    // Яндекс.Метрика: номер счётчика (только цифры). Пусто → не вставляется.
    metrikaId: "",
    metrikaOptions: { webvisor: true, clickmap: true, accurateTrackBounce: true },

    // Свой лёгкий счётчик (Supabase REST, вставка событий anon-ключом).
    // Заполняется на сборке из ~/.claude/secrets/site-analytics.env,
    // либо вручную здесь. Пусто → счётчик не вставляется.
    own: { url: "", key: "", table: "site_events" },

    // Google (по умолчанию выключен — включается одной строкой).
    ga4Id: "",

    // Подтверждение прав. Вставляется мета-тегом в <head> всех страниц.
    verification: { yandex: "", google: "" }
  },

  // ── Правила SEO ─────────────────────────────────────────────────
  seo: {
    titleMax: 65,          // мягкий предел длины <title>
    descriptionMax: 165,   // мягкий предел description
    thinWords: 700,        // меньше слов — страница помечается «тонкой»
    relatedCount: 4,       // сколько ссылок «читайте также» врезается в статью
    ogImage: "/img/cover-sistema.png"
  },

  // ── Что не индексировать ────────────────────────────────────────
  disallow: ["/seo/", "/node_modules/", "/m/"]
};
