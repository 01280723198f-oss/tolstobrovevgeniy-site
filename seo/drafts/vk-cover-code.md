---
title: Обложка ВКонтакте кодом
subtitle: Четыре готовых кейса от простого текста на градиенте до анимированной плитки, никакого Фотошопа, просто HTML + CSS
tag: Инструкция
seoTitle: Обложка ВК кодом: HTML+CSS шаблоны
seoDescription: Четыре шаблона обложки ВКонтакте: простой квадрат, с фото, сетка плиток, анимированная. Копируй, подставляй свои данные, готово.
keywords: обложка вк кодом; html css обложка; дизайн вк; обложка группы вк; вк 1200x1200
---

# Обложка ВКонтакте кодом: четыре кейса за 10 минут

Вычислять размер обложки в Фотошопе — трата времени, если обложка одна-две раз в месяц. Четыре кейса с готовым кодом: от простого квадрата до динамической заглавки со слоями.

## Кейс 1: Простой квадрат с текстом (самый быстрый)

Обложка ВК — это квадрат 1200×1200 пиксель, который видна в списке групп и на главной страницы профиля.

**HTML + CSS:**

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body { margin: 0; padding: 0; }
    .cover {
      width: 1200px;
      height: 1200px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      font-family: Arial, sans-serif;
      color: white;
      text-align: center;
    }
    .title { font-size: 64px; font-weight: bold; margin: 0; }
    .subtitle { font-size: 32px; margin: 20px 0 0 0; opacity: 0.9; }
  </style>
</head>
<body>
  <div class="cover">
    <h1 class="title">Claude Code</h1>
    <p class="subtitle">Вайбкодинг для контента</p>
  </div>
</body>
</html>
```

Как использовать:
1. Сохранишь как `.html`
2. Откроешь в браузере
3. Нажмёшь Cmd+P (Mac) или Ctrl+P (Windows) → печать → сохранить как PDF
4. Откроешь PDF, скриншотишь или экспортируешь в PNG через Preview (Mac) или Paint (Windows)

Градиент меняется цветами в `background: linear-gradient` — вместо `#667eea` и `#764ba2` подставляешь свои.

## Кейс 2: Обложка с двумя фото-слоями

Обычно хочется фон (фото) + текст сверху. Вот как сделать две фотки, полупрозрачную посередине, текст в центре.

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body { margin: 0; }
    .cover {
      width: 1200px;
      height: 1200px;
      position: relative;
      background: url('фон.jpg') center/cover;
    }
    .overlay {
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
    }
    .title { 
      font-size: 72px;
      font-weight: bold;
      color: white;
      margin: 0;
      text-shadow: 2px 2px 8px rgba(0, 0, 0, 0.8);
    }
    .avatar {
      width: 200px;
      height: 200px;
      border-radius: 50%;
      background: url('аватар.jpg') center/cover;
      border: 4px solid white;
      margin-bottom: 20px;
    }
  </style>
</head>
<body>
  <div class="cover">
    <div class="overlay">
      <div class="avatar"></div>
      <h1 class="title">Евгений Толстобров</h1>
    </div>
  </div>
</body>
</html>
```

Вместо `'фон.jpg'` и `'аватар.jpg'` подставляешь пути к своим файлам. Можно использовать абсолютные пути (`http://...` или `file:///...`).

## Кейс 3: Сетка с четырьмя плитками (продающая обложка)

Это для групп, которые продают что-то. Каждая плитка — одна услуга или фишка.

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; }
    .cover {
      width: 1200px;
      height: 1200px;
      background: #f5f5f5;
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      grid-template-rows: repeat(2, 1fr);
      gap: 0;
    }
    .tile {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      font-size: 24px;
      font-weight: bold;
      color: white;
      text-align: center;
      padding: 40px;
    }
    .tile1 { background: linear-gradient(135deg, #667eea, #764ba2); }
    .tile2 { background: linear-gradient(135deg, #f093fb, #f5576c); }
    .tile3 { background: linear-gradient(135deg, #4facfe, #00f2fe); }
    .tile4 { background: linear-gradient(135deg, #fa709a, #fee140); }
  </style>
</head>
<body>
  <div class="cover">
    <div class="tile tile1">
      <div>Claude Code</div>
      <div style="font-size: 16px; margin-top: 10px;">Скрипты</div>
    </div>
    <div class="tile tile2">
      <div>Контент</div>
      <div style="font-size: 16px; margin-top: 10px;">Заводом</div>
    </div>
    <div class="tile tile3">
      <div>Воронка</div>
      <div style="font-size: 16px; margin-top: 10px;">На коде</div>
    </div>
    <div class="tile tile4">
      <div>Обучение</div>
      <div style="font-size: 16px; margin-top: 10px;">Live</div>
    </div>
  </div>
</body>
</html>
```

Меняешь текст в каждом `.tile`, цвета в `.tile1`, `.tile2`, `.tile3`, `.tile4`.

## Кейс 4: Анимированная обложка (впечатляющая)

Небольшая анимация — текст появляется, цвета переливаются. В ВК эта анимация не будет видна (в ВК загружается снимок статичной обложки), но для скриншота в Telegram или демо смотрится лучше.

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body { margin: 0; }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes colorShift {
      0%, 100% { background: linear-gradient(135deg, #667eea, #764ba2); }
      50% { background: linear-gradient(135deg, #764ba2, #f093fb); }
    }
    .cover {
      width: 1200px;
      height: 1200px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      animation: colorShift 6s ease-in-out infinite;
      color: white;
      font-family: Arial, sans-serif;
    }
    .title {
      font-size: 80px;
      font-weight: bold;
      animation: fadeIn 1.5s ease-out forwards;
      margin: 0;
    }
    .subtitle {
      font-size: 36px;
      animation: fadeIn 1.5s ease-out 0.3s forwards;
      opacity: 0;
      margin: 20px 0 0 0;
    }
  </style>
</head>
<body>
  <div class="cover">
    <h1 class="title">Claude Code</h1>
    <p class="subtitle">Контент на коде</p>
  </div>
</body>
</html>
```

## Как загрузить обложку в ВК

1. Откроешь сообщество (группу/страницу)
2. Нажмёшь на старую обложку или кнопка «Изменить обложку»
3. Загружаешь PNG или JPG размером 1200×1200 (ВК сам подгонит под свой размер, но лучше заранее подогнать)
4. ВК покажет превью — если всё нормально, сохраняешь

**Про формат:** ВК режет изображения, потому что у них свой размер обложки. Но 1200×1200 — это универсальный квадрат, который подойдёт везде. Если хочешь, чтобы всё было видно без обрезки — делай 1200×630 (это ширина, высота подгонится).

## Часто спрашивают

**Почему именно HTML + CSS, а не Photoshop?**
Потому что изменить текст в коде — 10 секунд, в Photoshop — 5 минут. Если ты обновляешь обложку раз в месяц — это экономия 4 часа в год.

**Может ли ВК отвергнуть обложку за содержание?**
Да, если там реклама запрещённых товаров, крайне обнажённое фото или прямая рекламная схема. Если это просто красивая плитка с названием услуги — приложат без проблем.

**Какой размер лучше: 1200×1200 или 1200×630?**
Оба подойдут. 1200×1200 — квадратная, видна везде. 1200×630 — прямоугольная, лучше смотрится в ленте (если она есть). Начни с 1200×1200.

**Как добавить свой шрифт вместо Arial?**
```html
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@700&display=swap" rel="stylesheet">
```
И потом в CSS: `font-family: 'Roboto', sans-serif;`

**Могу ли я сделать обложку с нарисованным фоном (SVG)?**
Да, встави `<svg>` вместо градиента. Но большой SVG медленнее рендерится, чем просто фото.

## Дальше по теме

- [Карусель в коде: пять шаблонов](/g/carousel-code-templates/) — вертикальные плитки.
- [Вайбкодинг: выстрели иначе](/g/vibecoding-manifesto/) — философия простых инструментов.
- [Контент-завод в цифрах](/g/content-factory-in-numbers/) — как это масштабируется.
