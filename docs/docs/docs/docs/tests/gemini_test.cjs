const fs = require("fs");
const readline = require("readline");
const fetch = require("node-fetch");

// ❗ НЕ ТРОГАЕМ
const API_KEY = "";
const url =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
  API_KEY;

// =======================
// LOAD STATIC FILES
// =======================
const rules = fs.readFileSync("product_rules.txt", "utf8");
const baseState = JSON.parse(fs.readFileSync("state.json", "utf8"));

// =======================
// RUNTIME STATE
// =======================
const runtime = {
  activeContext: null, // текстовый якорь
  locked: false
};

// =======================
// CLI
// =======================
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// =======================
// PHASE A — CONTEXT DETECTION
// =======================
async function detectContextWithModel(userText) {
  const prompt = `
Ты — ассистент для людей с СДВГ.

Твоя задача — ОПРЕДЕЛИТЬ КОНТЕКСТ ДЕЙСТВИЯ.

Контекст — это краткая формулировка того,
ЧТО человек пытается СДЕЛАТЬ
или с ЧЕМ он пытается СПРАВИТЬСЯ
прямо сейчас.

ПРАВИЛА:
— НЕ предлагай шаги
— НЕ давай советов
— НЕ объясняй
— ответь ОДНОЙ строкой
— без списков
— без переформулировок

Ввод пользователя:
${userText}

Контекст:
`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }]
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const data = await res.json();

  if (!data.candidates) {
    throw new Error("Контекст не получен от модели");
  }

  return data.candidates[0].content.parts[0].text.trim();
}

// =======================
// PHASE B — ACTION MODE
// =======================
async function continueWithContext(userText) {
  const prompt = `
Ты — ассистент для людей с СДВГ.
Ты — якорь действия.

ТЕКУЩИЙ КОНТЕКСТ (ТЕКСТОВЫЙ ЯКОРЬ, МЕНЯТЬ ЗАПРЕЩЕНО):
"${runtime.activeContext}"

SEMANTIC LOCK (ОБЯЗАТЕЛЬНО):
— используй контекст ДОСЛОВНО
— НЕ переформулируй его
— НЕ заменяй синонимами
— НЕ расширяй и НЕ сужай смысл
— если действие нельзя напрямую
  объяснить через текст контекста —
  оно ЗАПРЕЩЕНО
— если в контексте НЕТ слов
  "выход", "уйти", "сборы", "покинуть дом",
  любые действия выхода ИЗ ДОМА ЗАПРЕЩЕНЫ

ПРАВИЛА ПРОДУКТА:
${rules}

СОСТОЯНИЕ ПОЛЬЗОВАТЕЛЯ:
Энергия: ${baseState.userState.energy}
Настроение: ${baseState.userState.mood}
Время: ${baseState.userState.timeAvailable} минут

ФОРМАТ ОТВЕТА (СТРОГО):

Состояние:
(1 короткое предложение)

Задача:
(дословно продолжает текущий контекст,
БЕЗ изменения формулировки)

Первый шаг:
(одно физическое действие до 5 минут,
напрямую связанное с контекстом)

Ввод пользователя:
${userText}
`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }]
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const data = await res.json();

  if (!data.candidates) {
    throw new Error("Ответ не получен от модели");
  }

  console.log("\n🤖", data.candidates[0].content.parts[0].text);
}

// =======================
// MAIN ENTRY
// =======================
async function ask(userText) {
  // ФАЗА A — контекст ещё не задан
  if (!runtime.locked) {
    const context = await detectContextWithModel(userText);
    runtime.activeContext = context;
    runtime.locked = true;

    console.log("\n🔒 Контекст зафиксирован:");
    console.log(runtime.activeContext);
    return;
  }

  // ФАЗА B — продолжение
  await continueWithContext(userText);
}

// =======================
// LOOP
// =======================
function loop() {
  rl.question("\n> ", async (q) => {
    try {
      await ask(q);
    } catch (e) {
      console.log("❌", e.message);
    }
    loop();
  });
}

loop();
