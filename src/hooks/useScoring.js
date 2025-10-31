import { useState, useEffect } from 'react';
import { calculateScore } from '../utils/scoringService';
import { updateDoc, getDocs } from 'firebase/firestore';
import { getPlayersCollectionPath, getPlayerDocPath } from '../utils/firebasePaths';

/**
 * useScoring
 * Triggers scoring when showAnswers flips true for a question.
 * Returns { scoring, lastRunQuestionId }
 */
export default function useScoring({ db, gameCode, lobbyState, players, currentQuestion, showAnswers }) {
	const [scoring, setScoring] = useState(false);
	const [lastRunQuestionId, setLastRunQuestionId] = useState(null);

	useEffect(() => {
		const run = async () => {
			if (!db || !gameCode || !currentQuestion || !showAnswers) return;
			if (lastRunQuestionId === currentQuestion.id) return; // prevent duplicate
			setScoring(true);
			const questionStartTime = lobbyState.currentQuestionStartTime;
			const activePlayers = players.filter(p => !p.isHost);
			try {
				// Score each player locally
				const updates = activePlayers.map(player => {
					if (player.lastAnswer !== currentQuestion.correctAnswer) return Promise.resolve();
					const playerDocRef = getPlayerDocPath(db, gameCode, player.id);
					let increase = 0;
					if (player.answerTimestamp) {
						const rt = player.answerTimestamp - questionStartTime;
						increase = calculateScore(rt);
					} else {
						increase = calculateScore(0);
					}
					return updateDoc(playerDocRef, { score: player.score + increase });
				});
				await Promise.all(updates);
				setLastRunQuestionId(currentQuestion.id);
			} catch (e) {
				console.error('Scoring error:', e);
			} finally {
				setScoring(false);
			}
		};
		run();
	}, [db, gameCode, currentQuestion?.id, showAnswers]);

	return { scoring, lastRunQuestionId };
}
