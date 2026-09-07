#!/usr/bin/env node
/* =====================================================================
   PROGRAMMATIC SEO: ВАРИАТИВНЫЕ ВЕРСИИ
   Генерирует варианты статей для разных аудиторий/контекстов через Claude.
   Пример: "Claude Code гайд" → варианты для (новичок, разработчик, маркетолог)

   Запуск:  node seo/programmatic-variants.js <article-id> [variant-type]
   Типы: audience (новичок/опытный/профи), product (Фундамент/Ареопаг), feature (базовое/продвинутое)
   ===================================================================== */

const fs = require("fs");
const path = require("path");
const os = require("os");

const ROOT = path.resolve(__dirname, "..");

function loadSecrets() {
  const file = path.join(os.homedir(), ".claude/secrets/site-analytics.env");
  const env = {};
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return env;
}

function loadGuides() {
  const src = fs.readFileSync(path.join(ROOT, "guides.js"), "utf8");
  const sandbox = {};
  new Function("g", src.replace(/^const /gm, "g."))(sandbox);
  return sandbox.GUIDES || [];
}

const VARIANT_CONFIGS = {
  audience: [
    {
      variant: "beginner",
      name: "Новичок",
      instruction: "Переписать максимально просто, без технического жаргона. Добавить как начать с нуля.",
    },
    {
      variant: "intermediate",
      name: "Разработчик",
      instruction: "Сфокусироваться на коде, примерах, интеграции. Добавить CLI-команды и API вызовы.",
    },
    {
      variant: "advanced",
      name: "Профи",
      instruction: "Углубленно про оптимизацию, лимиты, edge cases. Добавить performance tips и батники.",
    },
  ],
  product: [
    {
      variant: "fundament",
      name: "Для «Фундамента»",
      instruction: 'Адаптировать под микро-курс 5 дней. Добавить чекпоинты "День 1", "День 2" и т.д.',
    },
    {
      variant: "areopag",
      name: "Для «Ареопага»",
      instruction:
        "Переформатировать под экскурсию (5 уроков). Добавить зачины, истории, трипвайеры.",
    },
  ],
};

async function generateVariantWithClaude(
  articleId,
  title,
  content,
  variantConfig
) {
  const secrets = loadSecrets();
  if (!secrets.ANTHROPIC_API_KEY || secrets.ANTHROPIC_API_KEY === "sk-ant-") {
    console.warn("⚠️  ANTHROPIC_API_KEY не заполнен");
    return null;
  }

  const prompt = `Ты контент-адаптер для разных аудиторий.

**Исходная статья:**
Заголовок: "${title}"
Текст: ${content.substring(0, 1500)}...

**Адаптируй для: ${variantConfig.name}**
${variantConfig.instruction}

Верни JSON с новой версией:
{
  "variant": "${variantConfig.variant}",
  "variantTitle": "заголовок под эту аудиторию",
  "variantContent": "переписанный контент (500-1000 слов)",
  "focusAreas": ["область 1", "область 2", "область 3"]
}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": secrets.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-opus-5",
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      console.error(`Claude API ошибка: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const text = data.content[0]?.text || "";
    return JSON.parse(text);
  } catch (err) {
    console.error("Ошибка генерации:", err.message);
    return null;
  }
}

function generateVariantId(articleId, variant) {
  return `${articleId}-${variant}`;
}

async function main() {
  const articleId = process.argv[2];
  const variantType = process.argv[3] || "audience";

  if (!articleId) {
    console.log("Использование: node seo/programmatic-variants.js <article-id> [variant-type]");
    console.log("Типы: audience, product");
    process.exit(1);
  }

  if (!VARIANT_CONFIGS[variantType]) {
    console.error(`Неизвестный тип: ${variantType}`);
    process.exit(1);
  }

  const guides = loadGuides();
  const article = guides.find((g) => g.id === articleId);
  if (!article) {
    console.error(`Статья ${articleId} не найдена`);
    process.exit(1);
  }

  console.log(`🎯 Генерируем варианты для ${articleId} (${variantType})...\n`);

  const variants = [];
  for (const config of VARIANT_CONFIGS[variantType]) {
    console.log(`  → ${config.name}...`);
    const variant = await generateVariantWithClaude(
      articleId,
      article.title,
      article.content || "",
      config
    );

    if (variant) {
      variants.push(variant);
      console.log(`     ✓ ${variant.variantTitle}`);
    } else {
      console.log(`     ✗ Пропущено`);
    }
  }

  if (variants.length === 0) {
    console.log("\n❌ Ни один вариант не сгенерирован");
    process.exit(1);
  }

  // Сохраняем результаты
  const outputDir = path.join(ROOT, "seo/variants");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputFile = path.join(outputDir, `${articleId}-${variantType}.json`);
  fs.writeFileSync(outputFile, JSON.stringify({ articleId, variantType, variants }, null, 2));

  console.log(`\n💾 Сохранено в ${outputFile}`);
  console.log("\n📋 Сгенерировано вариантов:");
  variants.forEach((v) => {
    const variantId = generateVariantId(articleId, v.variant);
    console.log(`  - ${variantId}`);
    console.log(`    Фокус: ${v.focusAreas.join(", ")}`);
  });

  console.log("\n👉 Для добавления в guides.js добавь эти записи:");
  variants.forEach((v) => {
    console.log(`
  {
    id: "${generateVariantId(articleId, v.variant)}",
    title: "${v.variantTitle}",
    category: "Вариант: ${v.variant}",
    // content: \`${v.variantContent.substring(0, 100)}...\`,
  },`);
  });
}

main().catch(console.error);
