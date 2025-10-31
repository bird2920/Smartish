import React, { useState, useCallback } from 'react';
import { updateDoc, getDocs } from 'firebase/firestore';
import { parseCSV } from '../utils/csvParser';
import { getGameDocPath, getPlayersCollectionPath } from '../utils/firebasePaths';
import useGeminiApi from '../hooks/useGeminiApi';

// NOTE: If parseCSV isn't yet isolated, we can move the inline function from TriviaGame.jsx into /utils/parseCsv.js

const LobbyScreen = ({ db, gameCode, lobbyState, players, userId, isHost }) => {
	const [csvText, setCsvText] = useState('');
	const [generatorTopic, setGeneratorTopic] = useState('');
	const [error, setError] = useState('');
	const { loading: aiLoading, error: aiError, questions: aiQuestions, fetchQuestions, reset: resetAi } = useGeminiApi();

	const handleStartGame = useCallback(async () => {
		if (!isHost || !lobbyState || lobbyState.questions.length === 0) return;
		const gameDocRef = getGameDocPath(db, gameCode);
		try {
			// Reset player answers
			const playersColRef = getPlayersCollectionPath(db, gameCode);
			const playerDocs = await getDocs(playersColRef);
			const resetPromises = playerDocs.docs.map(docSnap => updateDoc(docSnap.ref, { lastAnswer: null, score: 0, answerTimestamp: null }));
			await Promise.all(resetPromises);
			await updateDoc(gameDocRef, {
				status: 'PLAYING',
				currentQuestionIndex: 0,
				currentQuestionStartTime: Date.now(),
			});
		} catch (e) {
			console.error('Error starting game:', e);
			alert('Error starting game: ' + e.message);
		}
	}, [db, gameCode, isHost, lobbyState]);

	const handleCSVUpload = () => {
		setError('');
		const questions = parseCSV(csvText);
		if (questions.length === 0) {
			setError('Could not parse any valid questions. Ensure format is: "Question","Answer","Opt1","Opt2","Opt3"');
			return;
		}
		const gameDocRef = getGameDocPath(db, gameCode);
		updateDoc(gameDocRef, { questions, status: 'UPLOAD' }).catch(e => console.error('Error saving questions:', e));
	};

	const handleGenerateQuestions = useCallback(async () => {
		if (!db || !gameCode || !isHost || !generatorTopic.trim()) return;
		setError('');
		resetAi();
		const generated = await fetchQuestions(generatorTopic.trim());
		if (!generated.length) {
			setError(aiError || 'No questions generated.');
			return;
		}
		try {
			const gameDocRef = getGameDocPath(db, gameCode);
			await updateDoc(gameDocRef, { questions: generated, status: 'UPLOAD' });
			setCsvText('');
			setGeneratorTopic('');
		} catch (e) {
			console.error('Error saving generated questions:', e);
			setError(e.message);
		}
	}, [db, gameCode, isHost, generatorTopic, fetchQuestions, resetAi, aiError]);

	const questionCount = lobbyState?.questions?.length || 0;

	return (
		<div className="min-h-screen bg-gray-900 text-white p-3 sm:p-4 md:p-8 flex flex-col items-center">
			<h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-indigo-400 mb-2 tracking-wide text-center px-2">Lobby: {gameCode}</h2>
			<p className="text-base sm:text-lg md:text-xl text-gray-300 mb-4 sm:mb-6 text-center px-2">Ask players to join with this code.</p>
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 md:gap-8 w-full max-w-6xl px-2">
				<div className={`col-span-1 lg:col-span-1 p-4 sm:p-6 rounded-xl shadow-2xl ${isHost ? 'bg-purple-800' : 'bg-gray-800'}`}>
					<h3 className="text-xl sm:text-2xl font-bold mb-3 sm:mb-4 border-b pb-2">{isHost ? 'Host Controls' : 'Waiting for Host...'}</h3>
					{isHost && (
						<div className="space-y-3 sm:space-y-4">
							<div className="bg-purple-700 p-3 sm:p-4 rounded-lg shadow-inner">
								<h4 className="text-lg sm:text-xl font-bold mb-2 text-yellow-300">✨ AI Question Generator</h4>
								<p className="text-xs sm:text-sm text-gray-200 mb-2">Type a topic and instantly load 5 questions.</p>
								<input
									type="text"
									className="w-full p-2 mb-2 bg-purple-600 border border-purple-500 rounded-lg text-white placeholder-gray-300 text-sm sm:text-base"
									placeholder="e.g., US History, 90s Cartoons"
									value={generatorTopic}
									onChange={e => setGeneratorTopic(e.target.value)}
									disabled={aiLoading}
								/>
								<button
									onClick={handleGenerateQuestions}
									className="w-full p-2 bg-yellow-500 text-gray-900 font-bold rounded-lg shadow-md hover:bg-yellow-600 transition duration-200 disabled:opacity-50 text-sm sm:text-base"
									disabled={!generatorTopic.trim() || aiLoading}
								>
									{aiLoading ? 'Generating 5 Questions...' : 'Generate 5 Questions'}
								</button>
								{aiError && <p className="text-red-200 text-xs mt-2 break-words">{aiError}</p>}
								{!!aiQuestions.length && <p className="text-green-200 text-xs mt-2">Generated {aiQuestions.length} questions (auto-saved).</p>}
							</div>
							<div className="pt-3 sm:pt-4 border-t border-purple-600">
								<h4 className="text-lg sm:text-xl font-bold mb-2">Manual CSV Upload</h4>
								<textarea
									className="w-full h-28 sm:h-32 p-2 sm:p-3 bg-gray-700 border border-gray-600 rounded-lg text-white font-mono text-xs sm:text-sm resize-none"
									placeholder="Paste CSV data here. Format: Question, CorrectAnswer, Option1, Option2..."
									value={csvText}
									onChange={e => setCsvText(e.target.value)}
								/>
								<button
									onClick={handleCSVUpload}
									className="w-full p-2 sm:p-3 bg-green-500 text-white font-bold rounded-xl shadow-md hover:bg-green-600 transition duration-200 disabled:opacity-50 text-sm sm:text-base mt-2"
									disabled={!csvText.trim()}
								>
									Upload {csvText.split('\n').filter(l => l.trim()).length} Questions
								</button>
							</div>
							{error && <p className="text-red-300 text-xs sm:text-sm italic pt-3 sm:pt-4">{error}</p>}
							<div className="pt-3 sm:pt-4 border-t border-purple-600 mt-3 sm:mt-4">
								<p className="text-base sm:text-lg font-semibold mb-2 sm:mb-3">Questions Loaded: <span className="text-yellow-300">{questionCount}</span></p>
								<button
									onClick={handleStartGame}
									disabled={questionCount === 0 || players.length < 2}
									className="w-full p-3 sm:p-4 bg-red-500 text-white font-extrabold text-base sm:text-lg rounded-xl shadow-xl hover:bg-red-600 transition duration-200 disabled:opacity-50"
								>
									Start Game ({questionCount} Qs)
								</button>
								{players.length < 2 && <p className="text-xs sm:text-sm text-center pt-2 text-yellow-300">Need at least 2 players to start.</p>}
								<button
									onClick={() => {
										const inviteUrl = `${window.location.origin}/#/game/${gameCode}`;
										navigator.clipboard.writeText(inviteUrl).catch(e => console.error('Failed to copy invite link', e));
									}}
									className="mt-3 w-full p-3 sm:p-4 bg-yellow-500 text-gray-900 font-bold rounded-xl shadow-md hover:bg-yellow-400 transition duration-200 text-sm sm:text-base"
								>
									Copy Invite Link
								</button>
							</div>
						</div>
					)}
				</div>
				<div className="col-span-1 lg:col-span-2 p-4 sm:p-6 bg-gray-800 rounded-xl shadow-2xl">
					<h3 className="text-xl sm:text-2xl font-bold mb-3 sm:mb-4 border-b border-gray-600 pb-2">Players ({players.length})</h3>
					<div className="max-h-96 overflow-y-auto space-y-2">
						{players.map(player => (
							<div key={player.id} className="flex items-center justify-between bg-gray-700 p-2 sm:p-3 rounded-lg shadow-md">
								<span className="text-base sm:text-lg font-medium text-gray-50 flex-grow truncate pr-2">{player.name}</span>
								<div className="flex gap-1 sm:gap-2 flex-shrink-0">
									{player.isHost && <span className="text-xs sm:text-sm font-semibold text-purple-400">HOST</span>}
									{player.id === userId && <span className="text-xs sm:text-sm font-semibold text-green-400">(You)</span>}
								</div>
							</div>
						))}
					</div>
					{isHost && players.length === 1 && <p className="text-yellow-400 mt-4 text-center text-base sm:text-lg animate-pulse">Waiting for players to join...</p>}
				</div>
			</div>
			<p className="mt-6 sm:mt-8 text-xs sm:text-sm text-gray-500 px-2 text-center break-all">Your User ID: {userId}</p>
		</div>
	);
};

export default LobbyScreen;
