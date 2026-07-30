/* ===== Анимации сайта на Motion (ваниль-API, без React/сборщика) =====
   Библиотека Motion (быв. Framer Motion), ESM с CDN — тот же канал, что и marked.
   Принципы (из скилла framer-motion):
   - анимируем только transform (x/y/scale) и opacity — GPU, без layout-трясок;
   - spring для движения, где естественно;
   - уважаем prefers-reduced-motion — при reduce ничего не прячем и не двигаем;
   - прячем элементы только ПОСЛЕ успешной загрузки Motion (если CDN упал —
     import падает, модуль не выполняется, контент остаётся видимым). */

import { animate, inView, stagger, press } from "https://cdn.jsdelivr.net/npm/motion@11.18.2/+esm";

// Если пользователь просит меньше движения — уважаем и выходим.
if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const springSoft = { type: "spring", stiffness: 260, damping: 30 };

  // 1. Шапка мягко «падает» сверху.
  const header = document.querySelector(".site-header");
  if (header) {
    animate(header, { opacity: [0, 1], y: [-14, 0] }, { duration: 0.45, ease: "easeOut" });
  }

  // 2. Заголовок секции.
  const sectionTitle = document.querySelector(".section-title");
  if (sectionTitle) {
    animate(sectionTitle, { opacity: [0, 1], y: [12, 0] }, { duration: 0.4, ease: "easeOut" });
  }

  // 3. Карточки инструкций — каскадное появление снизу (CSS-hover не трогаем).
  const cards = document.querySelectorAll(".guide-card");
  if (cards.length) {
    animate(
      cards,
      { opacity: [0, 1], y: [26, 0] },
      { delay: stagger(0.07, { startDelay: 0.1 }), ...springSoft }
    );
  }

  // 4. Верх статьи (back-link, мета, заголовок, лид) — каскад.
  const article = document.querySelector(".article");
  if (article) {
    const head = article.querySelectorAll(".back-link, .meta, h1, .lead");
    if (head.length) {
      animate(head, { opacity: [0, 1], y: [14, 0] }, { delay: stagger(0.06), duration: 0.4, ease: "easeOut" });
    }
  }

  // 5. Reveal блоков контента и CTA — устойчиво к сбою IntersectionObserver:
  //    что выше сгиба на загрузке — анимируем сразу (гарантированно видимо),
  //    что ниже — прячем и открываем при въезде в вьюпорт по скроллу.
  const reveal = document.querySelectorAll(".content > *, .cta-block");
  reveal.forEach((el) => {
    const belowFold = el.getBoundingClientRect().top > window.innerHeight * 0.95;
    if (belowFold) {
      el.style.opacity = "0";
      inView(
        el,
        (element) => {
          animate(element, { opacity: [0, 1], y: [22, 0] }, { duration: 0.5, ease: "easeOut" });
        },
        { amount: 0 }
      );
    } else {
      animate(el, { opacity: [0, 1], y: [18, 0] }, { duration: 0.5, ease: "easeOut" });
    }
  });

  // 6. Тактильный отклик на нажатие CTA-кнопок канала (transform-only, spring).
  document.querySelectorAll(".btn-channel").forEach((btn) => {
    press(btn, (element) => {
      animate(element, { scale: 0.95 }, { type: "spring", stiffness: 400, damping: 17 });
      return () => animate(element, { scale: 1 }, { type: "spring", stiffness: 400, damping: 17 });
    });
  });
}
