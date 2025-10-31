// Gemini Service: centralizes all LLM interactions
// Assumes an API key injected at build/runtime (e.g., via global __gemini_api_key)

const GEMINI_API_KEY = typeof __gemini_api_key !== 'undefined' ? __gemini_api_key : '';
const GEMINI_API_URL_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';
const DEFAULT_MODEL = 'gemini-2.5-flash-preview-09-2025';

// JSON Schema for Question Generation
export const QUESTION_SCHEMA = {
	type: 'ARRAY',
	description: 'A list of 5 trivia questions, each with a question, the correct answer, and three distractors (incorrect options).',
	items: {
		type: 'OBJECT',
		properties: {
			question: { type: 'STRING', description: 'The trivia question text.' },
			correctAnswer: { type: 'STRING', description: 'The single correct answer for the question.' },
			distractor1: { type: 'STRING', description: 'The first incorrect option.' },
			distractor2: { type: 'STRING', description: 'The second incorrect option.' },
			distractor3: { type: 'STRING', description: 'The third incorrect option.' },
		},
		required: ['question', 'correctAnswer', 'distractor1', 'distractor2', 'distractor3'],
		propertyOrdering: ['question', 'correctAnswer', 'distractor1', 'distractor2', 'distractor3'],
	},
};

/**
 * Generic fetch wrapper with exponential backoff for the Gemini API.
 * Returns raw text content.
 */
export async function callGeminiApi(payload, { model = DEFAULT_MODEL, retries = 3 } = {}) {
	if (!GEMINI_API_KEY) {
		throw new Error('Gemini API key not provided.');
	}
	const url = `${GEMINI_API_URL_BASE}${model}:generateContent?key=${GEMINI_API_KEY}`;
	for (let attempt = 0; attempt < retries; attempt++) {
		try {
			const res = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
			});
			if (!res.ok) {
				const body = await res.text().catch(() => '');
				throw new Error(`Gemini API ${res.status}: ${res.statusText} ${body}`);
			}
			const json = await res.json();
			if (json.error) {
				throw new Error(json.error.message || 'Gemini returned an error field.');
			}
			const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
			if (!text) {
				const finishReason = json.candidates?.[0]?.finishReason;
				if (finishReason === 'SAFETY') {
					throw new Error('Response blocked by safety filters.');
				}
				throw new Error('Empty/malformed Gemini response.');
			}
			return text;
		} catch (err) {
			if (attempt === retries - 1) throw err;
			const delay = Math.pow(2, attempt) * 1000;
			await new Promise(r => setTimeout(r, delay));
		}
	}
}

/**
 * Generate 5 trivia questions about a topic. Returns formatted questions array.
 */
export async function generateQuestions(topic) {
	const systemPrompt = 'You are a trivia question generator. Your task is to create exactly 5 multiple-choice trivia questions based on the user\'s requested topic. Each question MUST have one correct answer and exactly three plausible distractors. The response MUST be a JSON array conforming to the provided schema.';
	const userQuery = `Generate 5 trivia questions about the topic: "${topic}".`;
	const payload = {
		contents: [{ parts: [{ text: userQuery }] }],
		tools: [{ google_search: {} }],
		systemInstruction: { parts: [{ text: systemPrompt }] },
		generationConfig: {
			responseMimeType: 'application/json',
			responseSchema: QUESTION_SCHEMA,
		},
	};
	const text = await callGeminiApi(payload);
	let raw;
	try {
		raw = JSON.parse(text);
	} catch (e) {
		throw new Error('Failed parsing JSON: ' + e.message);
	}
	if (!Array.isArray(raw) || raw.length === 0) {
		throw new Error('Invalid or empty question array from Gemini.');
	}
	const formatted = raw.map((q, idx) => {
		const allOptions = [q.correctAnswer, q.distractor1, q.distractor2, q.distractor3].filter(Boolean);
		if (allOptions.length !== 4) return null;
		// Simple shuffle
		for (let i = allOptions.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[allOptions[i], allOptions[j]] = [allOptions[j], allOptions[i]];
		}
		return {
			id: `llm-${idx}`,
			question: q.question,
			correctAnswer: q.correctAnswer,
			options: allOptions,
		};
	}).filter(Boolean);
	return formatted;
}

/**
 * Generate a brief explanation/fun fact for a question/answer pair.
 */
export async function generateExplanation(question, correctAnswer) {
	const systemPrompt = 'You are a fun and engaging trivia master. Provide a concise, single-paragraph, interesting explanation or fun fact about the correct answer, focusing on the context of the question. Tone: bright and educational.';
	const userQuery = `The trivia question was: "${question}". The correct answer was: "${correctAnswer}". Provide a brief fun fact or explanation (max 3 sentences).`;
	const payload = {
		contents: [{ parts: [{ text: userQuery }] }],
		tools: [{ google_search: {} }],
		systemInstruction: { parts: [{ text: systemPrompt }] },
	};
	const text = await callGeminiApi(payload, {});
	return text.trim();
}

export default {
	callGeminiApi,
	generateQuestions,
	generateExplanation,
};
