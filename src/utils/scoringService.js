// Scoring service centralizes time-based scoring logic
// Configurable caps and minimums for flexibility

export const MAX_SCORE = 1000;
export const MIN_SCORE = 500;
export const QUESTION_DURATION_SECONDS = 30;

/**
 * Calculates score for a correct answer given response time (ms).
 * Linear decay from MAX_SCORE to MIN_SCORE across QUESTION_DURATION_SECONDS.
 */
export function calculateScore(responseTimeMs) {
  if (typeof responseTimeMs !== 'number' || responseTimeMs < 0) {
    return MIN_SCORE; // fallback
  }
  const seconds = responseTimeMs / 1000;
  const timeRatio = Math.min(seconds / QUESTION_DURATION_SECONDS, 1); // clamp 0..1
  const raw = Math.round(MAX_SCORE - (MAX_SCORE - MIN_SCORE) * timeRatio);
  return Math.max(MIN_SCORE, raw);
}

/**
 * Derives remaining time (seconds) from a start timestamp.
 */
export function getRemainingTime(startTime) {
  if (!startTime) return QUESTION_DURATION_SECONDS;
  const elapsed = (Date.now() - startTime) / 1000;
  return Math.max(0, QUESTION_DURATION_SECONDS - Math.floor(elapsed));
}

export default { calculateScore, getRemainingTime };