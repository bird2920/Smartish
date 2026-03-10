const GEMINI_API_URL_BASE = "https://generativelanguage.googleapis.com/v1beta/models/";
const MODEL_NAME = "gemini-2.5-flash";
const ENV = typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {};
const RUNTIME_KEY =
  (typeof window !== "undefined" && window.GEMINI_API_KEY) ||
  (typeof globalThis !== "undefined" && globalThis.GEMINI_API_KEY) ||
  ENV.VITE_GEMINI_API_KEY ||
  "";
const GEMINI_API_KEY = RUNTIME_KEY;

export const QUESTION_SCHEMA = {
  type: "ARRAY",
  description: "List of trivia questions with one correct answer and three distractors.",
  items: {
    type: "OBJECT",
    properties: {
      question: { type: "STRING" },
      correctAnswer: { type: "STRING" },
      distractor1: { type: "STRING" },
      distractor2: { type: "STRING" },
      distractor3: { type: "STRING" },
    },
    required: ["question", "correctAnswer", "distractor1", "distractor2", "distractor3"],
  },
};

export function getGeminiConfig() {
  return {
    hasKey: Boolean(GEMINI_API_KEY),
    model: MODEL_NAME,
    apiBase: GEMINI_API_URL_BASE,
  };
}

export async function callGeminiApi(payload, model = MODEL_NAME, retries = 3) {
  if (!GEMINI_API_KEY) {
    const error = new Error("Gemini API key missing");
    error.code = "GEMINI_API_KEY_MISSING";
    throw error;
  }

  const url = `${GEMINI_API_URL_BASE}${model}:generateContent?key=${GEMINI_API_KEY}`;

  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data = await res.json();

      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("Empty or malformed Gemini response");
      return text;
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000));
    }
  }
}

export async function callAIApi(userQuery, systemPrompt) {
  if (!userQuery?.trim()) throw new Error("User prompt is required.");

  const payload = {
    ...(systemPrompt
      ? { systemInstruction: { parts: [{ text: systemPrompt }] } }
      : {}),
    contents: [{ role: "user", parts: [{ text: userQuery }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: QUESTION_SCHEMA,
    },
  };

  return callGeminiApi(payload);
}
