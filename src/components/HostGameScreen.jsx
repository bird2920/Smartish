import React, { useState, useEffect, useCallback } from 'react';
import { updateDoc, getDocs } from 'firebase/firestore';
import { getGameDocPath, getPlayersCollectionPath, getPlayerDocPath } from '../utils/firebasePaths';
import useScoring from '../hooks/useScoring';

/**
 * HostGameScreen component extracted from TriviaGame.jsx
 * Props:
 *  - db, gameCode, lobbyState, players, currentQuestion, userId
 */
const HostGameScreen = ({ db, gameCode, lobbyState, players, currentQuestion, userId }) => {
    const [showAnswers, setShowAnswers] = useState(false);
    const [isScoring, setIsScoring] = useState(false); // retained for button disable
    const [explanation, setExplanation] = useState(null);
    const [isExplaining, setIsExplaining] = useState(false);

    // Active (non-host) players
    const activePlayers = players.filter(p => !p.isHost);
    const answersSubmitted = activePlayers.filter(p => p.lastAnswer !== null).length;
    const allAnswered = answersSubmitted === activePlayers.length;

    useEffect(() => {
        if (lobbyState?.status === 'PLAYING' && lobbyState.currentQuestionStartTime) {
            const timer = setTimeout(() => {
                if (!showAnswers && !isScoring) {
                    setShowAnswers(true);
                }
            }, 30000);
            if (allAnswered && !showAnswers && !isScoring) {
                setShowAnswers(true);
            }
            return () => clearTimeout(timer);
        }
    }, [lobbyState, allAnswered, showAnswers, isScoring]);

    // New scoring hook
    const { scoring } = useScoring({ db, gameCode, lobbyState, players, currentQuestion, showAnswers });
    useEffect(() => { setIsScoring(scoring); }, [scoring]);

    const handleNextQuestion = async () => {
        const nextIndex = lobbyState.currentQuestionIndex + 1;
        if (nextIndex < lobbyState.questions.length) {
            try {
                const gameDocRef = getGameDocPath(db, gameCode);
                await updateDoc(gameDocRef, {
                    currentQuestionIndex: nextIndex,
                    currentQuestionStartTime: Date.now(),
                });
                const playersColRef = getPlayersCollectionPath(db, gameCode);
                const playerDocs = await getDocs(playersColRef);
                await Promise.all(playerDocs.docs.map(docSnap => updateDoc(docSnap.ref, { lastAnswer: null, answerTimestamp: null })));
                setShowAnswers(false);
                setExplanation(null);
                setIsScoring(false);
            } catch (e) {
                console.error('Error moving to next question:', e);
            }
        } else {
            try {
                const gameDocRef = getGameDocPath(db, gameCode);
                await updateDoc(gameDocRef, { status: 'RESULTS' });
            } catch (e) {
                console.error('Error ending game:', e);
            }
        }
    };

    const handleGenerateExplanation = useCallback(async () => {
        // Placeholder for future Gemini explanation generation. Kept minimal in extracted file.
        if (!currentQuestion || isExplaining) return;
        setIsExplaining(true);
        setExplanation('Generating explanation...');
        // Implementation would call an injected LLM function
        setTimeout(() => {
            setExplanation('Fun fact placeholder about the correct answer.');
            setIsExplaining(false);
        }, 1500);
    }, [currentQuestion, isExplaining]);

    if (!currentQuestion) return null;
    const totalQuestions = lobbyState.questions.length;
    const nextIndex = lobbyState.currentQuestionIndex + 1;

    return (
        <div className="min-h-screen bg-gray-900 text-white p-3 sm:p-4 md:p-8 flex flex-col items-center">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-indigo-400 mb-4 sm:mb-6 text-center px-2">Host Screen - Game: {gameCode}</h1>
            <div className="w-full max-w-4xl bg-gray-800 p-4 sm:p-6 md:p-8 rounded-2xl shadow-2xl mb-6 sm:mb-8">
                <p className="text-base sm:text-lg md:text-xl font-semibold mb-3 sm:mb-4 text-center text-gray-400">Question {lobbyState.currentQuestionIndex + 1} of {totalQuestions}</p>
                <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-center mb-4 sm:mb-6 break-words">{currentQuestion.question}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                    {currentQuestion.options.map((option, index) => (
                        <div key={index} className={`p-3 sm:p-4 rounded-xl font-bold text-sm sm:text-base md:text-lg transition-all duration-300 break-words ${
                            showAnswers && option === currentQuestion.correctAnswer
                                ? 'bg-green-600 shadow-xl'
                                : showAnswers && option !== currentQuestion.correctAnswer
                                ? 'bg-red-800 opacity-50'
                                : 'bg-gray-700'
                        }`}>{option}</div>
                    ))}
                </div>
            </div>
            <div className="w-full max-w-4xl bg-gray-800 p-4 sm:p-6 rounded-2xl shadow-xl mb-4">
                <h3 className="text-lg sm:text-xl md:text-2xl font-bold mb-3 sm:mb-4 border-b border-gray-600 pb-2">Player Answers ({answersSubmitted} / {activePlayers.length})</h3>
                <div className="max-h-64 overflow-y-auto space-y-2">
                    {activePlayers.map(player => (
                        <div key={player.id} className="flex items-center justify-between p-2 sm:p-3 rounded-lg shadow-md bg-gray-700">
                            <span className="text-sm sm:text-base md:text-lg font-medium text-gray-50 truncate pr-2">{player.name}</span>
                            <span className={`font-semibold text-xs sm:text-sm md:text-base flex-shrink-0 ${
                                player.lastAnswer
                                    ? showAnswers && player.lastAnswer === currentQuestion.correctAnswer
                                        ? 'text-green-400'
                                        : showAnswers ? 'text-red-400' : 'text-yellow-400'
                                    : 'text-gray-500 italic'
                            }`}>
                                {player.lastAnswer ? (showAnswers ? player.lastAnswer : 'ANSWERED') : 'Waiting...'}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
            <div className="w-full max-w-4xl px-2">
                {!showAnswers ? (
                    <button onClick={() => setShowAnswers(true)} disabled={isScoring} className="w-full p-3 sm:p-4 bg-yellow-500 text-gray-900 font-extrabold text-base sm:text-lg md:text-xl rounded-xl shadow-2xl hover:bg-yellow-600 transition duration-200 transform hover:scale-[1.01]">
                        {isScoring ? 'Scoring...' : 'Reveal Answers Now'}
                    </button>
                ) : (
                    <button onClick={handleNextQuestion} disabled={isScoring} className="w-full p-3 sm:p-4 bg-purple-600 text-white font-extrabold text-base sm:text-lg md:text-xl rounded-xl shadow-2xl hover:bg-purple-700 transition duration-200 transform hover:scale-[1.01]">
                        {nextIndex < totalQuestions ? 'Next Question' : 'End Game & Show Results'}
                    </button>
                )}
            </div>
        </div>
    );
};

export default HostGameScreen;