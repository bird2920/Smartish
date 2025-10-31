import { useState, useCallback } from 'react';
import { generateQuestions, generateExplanation } from '../services/geminiService';

/**
 * React hook providing Gemini API operations with loading and error state.
 * Returns: { loading, error, questions, explanation, fetchQuestions, fetchExplanation, reset }
 */
export default function useGeminiApi() {
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(null);
	const [questions, setQuestions] = useState([]);
	const [explanation, setExplanation] = useState(null);

	const fetchQuestions = useCallback(async (topic) => {
		setLoading(true);
		setError(null);
		setQuestions([]);
		try {
			const q = await generateQuestions(topic);
			setQuestions(q);
			return q;
		} catch (e) {
			setError(e.message || 'Failed to generate questions');
			return [];
		} finally {
			setLoading(false);
		}
	}, []);

	const fetchExplanation = useCallback(async (question, correctAnswer) => {
		setLoading(true);
		setError(null);
		setExplanation(null);
		try {
			const text = await generateExplanation(question, correctAnswer);
			setExplanation(text);
			return text;
		} catch (e) {
			setError(e.message || 'Failed to generate explanation');
			return null;
		} finally {
			setLoading(false);
		}
	}, []);

	const reset = useCallback(() => {
		setError(null);
		setQuestions([]);
		setExplanation(null);
	}, []);

	return {
		loading,
		error,
		questions,
		explanation,
		fetchQuestions,
		fetchExplanation,
		reset,
	};
}
