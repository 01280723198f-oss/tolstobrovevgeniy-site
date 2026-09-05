/* JSON-LD: как поисковик понимает, что это статья, кто автор и где он в структуре.
   Даёт расширенные сниппеты в Яндексе и Google (дата, автор, крошки, FAQ). */

const C = require("../config");

const person = () => ({
  "@type": "Person",
  name: C.author.name,
  jobTitle: C.author.jobTitle,
  url: C.origin + "/",
  sameAs: C.author.sameAs
});

function article(page) {
  const node = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: page.seoTitle || page.title,
    name: page.title,
    description: page.description,
    inLanguage: C.lang,
    datePublished: page.iso,
    dateModified: page.isoModified || page.iso,
    author: person(),
    publisher: { "@type": "Organization", name: C.brand, url: C.origin + "/" },
    mainEntityOfPage: { "@type": "WebPage", "@id": page.url },
    url: page.url,
    articleSection: page.tag,
    wordCount: page.words,
    timeRequired: "PT" + (parseInt(page.readingTime, 10) || 5) + "M"
  };
  if (page.keywords && page.keywords.length) node.keywords = page.keywords.join(", ");
  if (page.image) node.image = [page.image];
  return node;
}

function breadcrumbs(items) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem", position: i + 1, name: it.name, item: it.url
    }))
  };
}

function faqPage(pairs) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: pairs.map(p => ({
      "@type": "Question",
      name: p.q,
      acceptedAnswer: { "@type": "Answer", text: p.a }
    }))
  };
}

function website() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: C.siteName,
    url: C.origin + "/",
    inLanguage: C.lang,
    author: person(),
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: C.origin + "/?q={search_term_string}" },
      "query-input": "required name=search_term_string"
    }
  };
}

function itemList(pages, name) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    itemListElement: pages.map((p, i) => ({
      "@type": "ListItem", position: i + 1, url: p.url, name: p.title
    }))
  };
}

const tag = obj => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;

module.exports = { article, breadcrumbs, faqPage, website, itemList, tag };
