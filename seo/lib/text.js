/* Текстовые утилиты: транслит, слаги, чистка, даты, леммы-заглушки */

const MAP = {
  а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"e",ж:"zh",з:"z",и:"i",й:"y",к:"k",л:"l",
  м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"h",ц:"c",ч:"ch",ш:"sh",
  щ:"sch",ъ:"",ы:"y",ь:"",э:"e",ю:"yu",я:"ya"
};

function translit(str) {
  return String(str).toLowerCase().split("").map(ch => (ch in MAP ? MAP[ch] : ch)).join("");
}

function slugify(str) {
  return translit(str)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Markdown → плоский текст (для описаний, подсчёта слов, поиска вхождений). */
function plain(md) {
  return String(md)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function words(md) {
  const t = plain(md);
  return t ? t.split(/\s+/).length : 0;
}

/** Обрезка по границе слова с многоточием. */
function clamp(str, max) {
  const s = String(str).replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  return cut.slice(0, cut.lastIndexOf(" ")).replace(/[,.;:—-]$/, "") + "…";
}

const MONTHS = ["января","февраля","марта","апреля","мая","июня",
                "июля","августа","сентября","октября","ноября","декабря"];

/** "5 сентября 2026" → "2026-09-05" (ISO для sitemap и разметки). */
function toISO(human) {
  const m = String(human).match(/(\d{1,2})\s+([а-яё]+)\s+(\d{4})/i);
  if (!m) return new Date().toISOString().slice(0, 10);
  const idx = MONTHS.findIndex(x => m[2].toLowerCase().startsWith(x.slice(0, 4)));
  const mm = String((idx < 0 ? 0 : idx) + 1).padStart(2, "0");
  return `${m[3]}-${mm}-${String(m[1]).padStart(2, "0")}`;
}

/** Грубая нормализация слова: режем русские окончания, чтобы «скиллы»≈«скилл». */
function stem(word) {
  return String(word).toLowerCase()
    .replace(/[^a-zа-яё0-9]/g, "")
    .replace(/(ами|ями|ого|ему|ыми|ими|ов|ев|ам|ям|ах|ях|ой|ей|ые|ий|ая|ое|ы|и|а|я|у|ю|е|о)$/,"");
}

/** Жёсткая основа для кластеризации запросов: после срезания окончаний
    длинные слова обрезаются до 6 букв, чтобы «настроить» и «настройка»
    попали в один кластер. Для перелинковки не используется — там нужна точность. */
function stemHard(word) {
  const s = stem(word);
  return s.length > 6 ? s.slice(0, 6) : s;
}

const STOP = new Set(("и в во не что он на я с со как а то все она так его но да ты к у же вы за бы по " +
  "только ее мне было вот от меня еще нет о из ему теперь когда даже ну вдруг ли если уже или ни быть " +
  "был него до вас нибудь опять уж вам ведь там потом себя ничего ей может они тут где есть надо ней " +
  "для мы тебя их чем была сам чтоб без будто чего раз тоже себе под будет ж тогда кто этот того потому " +
  "этого какой совсем ним здесь этом один почти мой тем чтобы нее сейчас были куда зачем всех никогда " +
  "можно при наконец два об другой хоть после над больше тот через эти нас про всего них какая много " +
  "разве три эту моя впрочем хорошо свою этой перед иногда лучше чуть том нельзя такой им более всегда " +
  "конечно всю между это the a of to and for in on with your you").split(/\s+/));

/** Значимые слова текста (для перелинковки и кластеризации). */
function tokens(str) {
  return plain(str).toLowerCase()
    .split(/[^a-zа-яё0-9]+/)
    .filter(w => w.length > 2 && !STOP.has(w))
    .map(stem)
    .filter(Boolean);
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Значимые слова с жёсткой основой (для семантического ядра). */
function tokensHard(str) {
  return tokens(str).map(t => (t.length > 6 ? t.slice(0, 6) : t));
}

module.exports = { translit, slugify, plain, words, clamp, toISO, stem, stemHard, tokens, tokensHard, escapeHtml, STOP };
