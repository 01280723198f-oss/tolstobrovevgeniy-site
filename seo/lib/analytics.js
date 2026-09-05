/* Сборка блока счётчиков в <head>. Ничего не вставляется, пока не задан ID —
   мёртвых скриптов на странице не остаётся. */

const C = require("../config");

function metrika() {
  const id = String(C.analytics.metrikaId || "").trim();
  if (!id) return "";
  const o = C.analytics.metrikaOptions || {};
  const opts = JSON.stringify({
    ssr: true, webvisor: !!o.webvisor, clickmap: !!o.clickmap,
    ecommerce: "dataLayer", accurateTrackBounce: !!o.accurateTrackBounce, trackLinks: true
  });
  return `<script>
(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
m[i].l=1*new Date();for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r){return;}}
k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
(window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");
ym(${id}, "init", ${opts});
window.__METRIKA_ID__=${id};
</script>
<noscript><div><img src="https://mc.yandex.ru/watch/${id}" style="position:absolute;left:-9999px" alt=""></div></noscript>`;
}

function ga4() {
  const id = String(C.analytics.ga4Id || "").trim();
  if (!id) return "";
  return `<script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}
gtag("js",new Date());gtag("config","${id}");</script>`;
}

function own() {
  const o = C.analytics.own || {};
  if (!o.url || !o.key) return "";
  return `<script>window.__OWN_ANALYTICS__=${JSON.stringify({ url: o.url, key: o.key, table: o.table || "site_events" })};</script>`;
}

function verification() {
  const v = C.analytics.verification || {};
  let out = "";
  if (v.yandex) out += `<meta name="yandex-verification" content="${v.yandex}">\n  `;
  if (v.google) out += `<meta name="google-site-verification" content="${v.google}">\n  `;
  return out;
}

/** Всё вместе, в порядке: подтверждение прав → счётчики → свой сборщик событий. */
function head() {
  return [verification(), metrika(), ga4(), own()].filter(Boolean).join("\n  ");
}

module.exports = { head, metrika, ga4, own, verification };
