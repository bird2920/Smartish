// CSV Parser Utility extracted from TriviaGame.jsx
// Provides parseCSV for transforming pasted CSV lines into question objects.

// Fisher-Yates shuffle
export const shuffleArray = (array) => {
	const copy = [...array];
	for (let i = copy.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[copy[i], copy[j]] = [copy[j], copy[i]];
	}
	return copy;
};

/**
 * Parses CSV text into a structured array of question objects.
 * Expected format per line: Question,CorrectAnswer,Option1,Option2,Option3...
 * Returns only valid questions (at least 2 total options including the correct one).
 */
export const parseCSV = (csvText) => {
	if (!csvText || typeof csvText !== 'string') return [];
	const lines = csvText.split('\n').filter(line => line.trim() !== '');
	return lines
		.map((line, index) => {
			const parts = line.split(',').map(p => p.trim().replace(/^"|"$/g, ''));
			if (parts.length < 2) {
				console.error(`Skipping CSV line ${index + 1}: Not enough columns (Q/A required).`);
				return null;
			}
			const [question, correctAnswer, ...distractors] = parts;
			const allOptions = [correctAnswer, ...distractors].filter(Boolean).slice(0, 5);
			if (allOptions.length < 2) {
				console.error(`Skipping CSV line ${index + 1}: Not enough valid options.`);
				return null;
			}
			return {
				id: index,
				question,
				correctAnswer,
				options: shuffleArray(allOptions),
			};
		})
		.filter(Boolean);
};

export default { parseCSV, shuffleArray };
