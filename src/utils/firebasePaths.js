import { doc, collection } from 'firebase/firestore';

// Access global appId injected into index.html (fallback provided)
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

/**
 * Returns the game document reference path for a given game code.
 */
export const getGameDocPath = (db, gameCode) => doc(db, `artifacts/${appId}/public/data/games/${gameCode}`);

/**
 * Returns the players collection reference path for the given game code.
 */
export const getPlayersCollectionPath = (db, gameCode) => collection(db, `artifacts/${appId}/public/data/games/${gameCode}/players`);

/**
 * Returns an individual player document reference path.
 */
export const getPlayerDocPath = (db, gameCode, userId) => doc(db, `artifacts/${appId}/public/data/games/${gameCode}/players/${userId}`);

export default {
	getGameDocPath,
	getPlayersCollectionPath,
	getPlayerDocPath,
};
