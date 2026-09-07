#!/usr/bin/env node
/* =====================================================================
   AI-SEO ОПТИМИЗАЦИЯ
   Через Claude API оптимизирует title, description, плотность ключевых
   слов, структуру FAQ в статье.
   Запуск:  node seo/ai-optimize.js <id> [keyword]
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

async function optimizeWithClaude(articleId, title, content, keyword) {
  const secrets = loadSecrets();
  if (!secrets.ANTHROPIC_API_KEY || secrets.ANTHROPIC_API_KEY === "sk-ant-") {
    console.warn("⚠️  ANTHROPIC_API_KEY не заполнен в ~/.claude/secrets/site-analytics.env");
    return null;
  }

  const prompt = `Ты SEO-оптимизатор. Проанализируй статью и верни JSON с улучшениями.

**Статья:**
Заголовок: "${title}"
Текст: ${content.substring(0, 2000)}...

**Задачи:**
1. Улучши title (~60 символов, включи ключевое слово "${keyword || "Claude Code"}")
2. Сгенерируй description (~160 символов, первое предложение или призыв)
3. Проверь плотность ключевого слова (должна быть 1–2%)
4. Убедись, что есть блок "Частые вопросы" с h3-заголовками
5. Предложи 2–3 FAQ вопроса для этой статьи (если нет)

Ответь ровно этим JSON (без кода, без markdown, только JSON):
{
  "optimizedTitle": "...",
  "optimizedDescription": "...",
  "keywordDensity": 1.2,
  "faqSuggestions": [
    {"question": "...", "answer": "..."}
  ],
  "notes": "..."
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
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      console.error(`Claude API ошибка: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const text = data.content[0]?.text || "";
    const json = JSON.parse(text);
    return json;
  } catch (err) {
    console.error("Ошибка оптимизации:", err.message);
    return null;
  }
}

async function main() {
  const articleId = process.argv[2];
  const keyword = process.argv[3];

  if (!articleId) {
    console.log("Использование: node seo/ai-optimize.js <article-id> [keyword]");
    process.exit(1);
  }

  const guides = loadGuides();
  const article = guides.find((g) => g.id === articleId);
  if (!article) {
    console.error(`Статья ${articleId} не найдена`);
    process.exit(1);
  }

  console.log(`🔍 Оптимизация ${articleId}...`);
  const optimization = await optimizeWithClaude(
    articleId,
    article.title,
    article.content || "",
    keyword
  );

  if (!optimization) {
    console.log("Оптимизация пропущена (нет API ключа)");
    process.exit(0);
  }

  console.log("\n📝 Рекомендации:");
  console.log(`Title: "${optimization.optimizedTitle}"`);
  console.log(`Description: "${optimization.optimizedDescription}"`);
  console.log(`Плотность ключевого слова: ${optimization.keywordDensity}%`);

  if (optimization.faqSuggestions?.length) {
    console.log("\n❓ Новые FAQ:");
    optimization.faqSuggestions.forEach((q) => {
      console.log(`  Q: ${q.question}`);
      console.log(`  A: ${q.answer.substring(0, 100)}...`);
    });
  }

  console.log("\n💾 Применить вручную в guides.js или скопировать JSON:");
  console.log(JSON.stringify(optimization, null, 2));
}

main().catch(console.error);
