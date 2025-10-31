import { useState, useEffect, useCallback } from 'react';
import { QUESTION_DURATION_SECONDS } from '../utils/scoringService';

/**
 * useTimer
 * Tracks countdown from a given start timestamp for a fixed duration (default: 30s).
 * Returns { remaining, percent, expired, restart }
 */
export default function useTimer(startTime, durationSeconds = QUESTION_DURATION_SECONDS, tickMs = 100) {
	const [remaining, setRemaining] = useState(durationSeconds);

	useEffect(() => {
		if (!startTime) {
			setRemaining(durationSeconds);
			return;
		}
		const update = () => {
			const elapsed = Date.now() - startTime;
			const left = Math.max(0, durationSeconds - Math.floor(elapsed / 1000));
			setRemaining(left);
		};
		update();
		const id = setInterval(update, tickMs);
		return () => clearInterval(id);
	}, [startTime, durationSeconds, tickMs]);

	const percent = (durationSeconds - remaining) / durationSeconds;
	const expired = remaining === 0;

	const restart = useCallback((newStart = Date.now()) => {
		// Consumers should update the external startTime state to newStart for effect to re-run.
		setRemaining(durationSeconds);
		return newStart;
	}, [durationSeconds]);

	return { remaining, percent, expired, restart };
}