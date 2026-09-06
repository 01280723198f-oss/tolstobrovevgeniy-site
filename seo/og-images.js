#!/usr/bin/env node
/* =====================================================================
   ОБЛОЖКИ ДЛЯ СОЦСЕТЕЙ И ВЫДАЧИ
   Из каждой статьи рисует картинку 1200×630 в фирменной палитре.
   Без неё ссылка в Telegram и в поиске разворачивается общей заглушкой.
   Запуск: node seo/og-images.js [--force]
   ===================================================================== */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");
const { createRequire } = require("module");

const C = require("./config");
const { loadGuides } = require("./build");
const { escapeHtml } = require("./lib/text");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "img/og");
const TMP = path.join(os.tmpdir(), "og-cards");

const PALETTE = [
  ["#ff6a2b", "#ffb648"], ["#3b82f6", "#22d3ee"], ["#a855f7", "#ec4899"],
  ["#22c55e", "#a3e635"], ["#f43f5e", "#fb923c"], ["#06b6d4", "#818cf8"]
];

function card(g, idx) {
  const [c1, c2] = PALETTE[idx % PALETTE.length];
  const title = escapeHtml(g.title);
  const size = title.length > 70 ? 46 : title.length > 45 ? 56 : 66;

  return `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><style>
  * { box-sizing: border-box; margin: 0; }
  body {
    width: 1200px; height: 630px; overflow: hidden;
    background: radial-gradient(900px 500px at 78% -12%, ${c1}33, transparent 62%), #0c0d10;
    color: #ECEDEE; font-family: -apple-system, "Helvetica Neue", Arial, sans-serif;
    display: flex; flex-direction: column; justify-content: space-between;
    padding: 62px 68px; position: relative;
  }
  .glow { position: absolute; right: -140px; top: -140px; width: 520px; height: 520px;
    border-radius: 50%; background: linear-gradient(135deg, ${c1}, ${c2}); filter: blur(120px); opacity: .38; }
  .tag { display: inline-block; align-self: flex-start; font-size: 22px; letter-spacing: .14em;
    text-transform: uppercase; color: ${c2}; border: 1px solid ${c1}66;
    border-radius: 999px; padding: 10px 22px; background: ${c1}14; }
  h1 { font-size: ${size}px; line-height: 1.14; letter-spacing: -0.025em; font-weight: 700;
    max-width: 1010px; position: relative; }
  .rule { width: 92px; height: 5px; border-radius: 3px;
    background: linear-gradient(90deg, ${c1}, ${c2}); margin-bottom: 22px; }
  footer { display: flex; align-items: center; justify-content: space-between;
    font-size: 25px; color: #9498a3; position: relative; }
  .brand { color: #ECEDEE; font-weight: 600; }
  .dot { color: ${c1}; }
</style></head><body>
  <div class="glow"></div>
  <span class="tag">${escapeHtml(g.tag)}</span>
  <div>
    <div class="rule"></div>
    <h1>${title}</h1>
  </div>
  <footer>
    <span><span class="brand">${escapeHtml(C.brand)}</span> <span class="dot">·</span> ${escapeHtml(new URL(C.origin).host)}</span>
    <span>${escapeHtml(g.readingTime)}</span>
  </footer>
</body></html>`;
}

/* ── Рендер: сначала пробуем Chrome, потом браузер из расширения ──── */
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function renderWithChrome(files) {
  for (const f of files) {
    execFileSync(CHROME, [
      "--headless", "--disable-gpu", "--hide-scrollbars",
      "--force-device-scale-factor=1", "--window-size=1200,630",
      `--screenshot=${f.png.replace(/\.jpg$/, ".png")}`, "file://" + f.html
    ], { stdio: "ignore" });
  }
}

async function renderWithPatchright(files) {
  const roots = [
    path.join(os.homedir(), ".vscode/extensions"),
    path.join(os.homedir(), ".cursor/extensions")
  ];
  let chromium = null;
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const dir of fs.readdirSync(root)) {
      const modules = path.join(root, dir, "standalone/node_modules");
      if (!fs.existsSync(path.join(modules, "patchright"))) continue;
      chromium = createRequire(path.join(modules, "x.js"))("patchright").chromium;
      break;
    }
    if (chromium) break;
  }
  if (!chromium) throw new Error("Не нашёл, чем рендерить: ни Chrome, ни patchright");

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  for (const f of files) {
    await page.goto("file://" + f.html);
    await page.screenshot({ path: f.png });
  }
  await browser.close();
}

async function main() {
  const force = process.argv.includes("--force");
  const { GUIDES } = loadGuides();

  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(TMP, { recursive: true });

  const files = [];
  GUIDES.forEach((g, i) => {
    const png = path.join(OUT, `${g.id}.jpg`);
    if (!force && fs.existsSync(png)) return;
    const html = path.join(TMP, `${g.id}.html`);
    fs.writeFileSync(html, card(g, i));
    files.push({ html, png, id: g.id });
  });

  if (!files.length) { console.log("Все обложки уже есть (--force чтобы перерисовать)"); return; }

  console.log(`Рисую ${files.length} обложек…`);
  if (fs.existsSync(CHROME)) renderWithChrome(files);
  else await renderWithPatchright(files);

  // Chrome умеет только PNG — на сайт кладём JPEG, он втрое легче.
  for (const f of files) {
    const png = f.png.replace(/\.jpg$/, ".png");
    if (fs.existsSync(png)) {
      try {
        execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "82", png, "--out", f.png], { stdio: "ignore" });
        fs.unlinkSync(png);
      } catch (e) { fs.renameSync(png, f.png); }
    }
  }

  const made = files.filter(f => fs.existsSync(f.png));
  const bytes = made.reduce((a, f) => a + fs.statSync(f.png).size, 0);
  console.log(`✓ Готово: ${made.length} шт., ${(bytes / 1048576).toFixed(1)} МБ → img/og/`);
  if (made.length < files.length) {
    console.log("⚠ Не отрисовались: " + files.filter(f => !fs.existsSync(f.png)).map(f => f.id).join(", "));
  }
}

main();
