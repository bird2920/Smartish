import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import LobbyScreen from './src/components/LobbyScreen.jsx';
import HostGameScreen from './src/components/HostGameScreen.jsx';
import { useParams } from 'react-router-dom';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot, updateDoc, collection, query, getDoc, getDocs, deleteDoc, serverTimestamp, runTransaction } from 'firebase/firestore';
import { getGameDocPath, getPlayersCollectionPath, getPlayerDocPath } from './src/utils/firebasePaths.js';
import useTimer from './src/hooks/useTimer.js';
import { parseCSV } from './src/utils/csvParser.js';

// currentQuestionStartTime: serverTimestamp()
// --- Global Variable Access (MANDATORY) ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// --- LLM API Configuration ---
const GEMINI_API_KEY = ""; // Kept empty, will be supplied by the environment
const GEMINI_API_URL_BASE = "https://generativelanguage.googleapis.com/v1beta/models/";
const MODEL_NAME = "gemini-2.5-flash-preview-09-2025";

// JSON Schema for Question Generation
const QUESTION_SCHEMA = {
    type: "ARRAY",
    description: "A list of 5 trivia questions, each with a question, the correct answer, and three distractors (incorrect options).",
    items: {
        type: "OBJECT",
        properties: {
            question: { type: "STRING", description: "The trivia question text." },
            correctAnswer: { type: "STRING", description: "The single correct answer for the question." },
            distractor1: { type: "STRING", description: "The first incorrect option." },
            distractor2: { type: "STRING", description: "The second incorrect option." },
            distractor3: { type: "STRING", description: "The third incorrect option." },
        },
        required: ["question", "correctAnswer", "distractor1", "distractor2", "distractor3"],
        propertyOrdering: ["question", "correctAnswer", "distractor1", "distractor2", "distractor3"]
    }
};

/**
 * Generic fetch wrapper with exponential backoff for the Gemini API.
 */
async function callGeminiApi(payload, model = MODEL_NAME, retries = 3) {
    const url = `${GEMINI_API_URL_BASE}${model}:generateContent?key=${GEMINI_API_KEY}`;

    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                if (i === retries - 1) {
                    let errorBody = 'Unknown error body (failed to read response text).';
                    try {
                        errorBody = await response.text(); 
                    } catch (e) {
                        // Ignore if cannot read body
                    }
                    throw new Error(`API Error ${response.status}: ${response.statusText || 'No status text'} - Body: ${errorBody}`);
                }
                
                // For retriable errors, just wait and continue the loop.
                const delay = Math.pow(2, i) * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }

            const result = await response.json();
            
            // Check for error field in 200 OK responses
            if (result.error) {
                throw new Error(`Gemini API Error: ${result.error.message || JSON.stringify(result.error)}`);
            }
            
            const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!text) {
                // Check for safety blocks
                const finishReason = result.candidates?.[0]?.finishReason;
                if (finishReason === 'SAFETY') { 
                     throw new Error(`Gemini response was blocked by safety settings.`);
                }
                
                throw new Error("Gemini response was empty or malformed (No text content found).");
            }

            return text;

        } catch (error) {
            // Only log the error on the final attempt, otherwise just wait and retry.
            if (i === retries - 1) {
                console.error(`Attempt ${i + 1} failed for Gemini API call:`, error);
                throw error; // Rethrow on final failure
            }
            
            // Wait with exponential backoff for the next retry
            const delay = Math.pow(2, i) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}


// --- Utility Functions ---

/** Generates a 4-character uppercase alphanumeric game code. */
const generateGameCode = () => {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
};

// shuffleArray + parseCSV now provided by csvParser.js (parseCSV imported above)


// Firebase path helpers now imported from utils/firebasePaths.js


// --- Custom Hook for Firebase Initialization and Authentication ---
const useFirebase = () => {
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        try {
            const app = initializeApp(firebaseConfig);
            const firestore = getFirestore(app);
            const authInstance = getAuth(app);

            setDb(firestore);
            setAuth(authInstance);

            const unsubscribe = onAuthStateChanged(authInstance, async (user) => {
                if (user) {
                    setUserId(user.uid);
                } else {
                    // Sign in with custom token or anonymously
                    try {
                        if (initialAuthToken) {
                            const userCred = await signInWithCustomToken(authInstance, initialAuthToken);
                            setUserId(userCred.user.uid);
                        } else {
                            const userCred = await signInAnonymously(authInstance);
                            setUserId(userCred.user.uid);
                        }
                    } catch (error) {
                        console.error("Firebase Auth failed:", error);
                    }
                }
                setIsLoading(false);
            });

            return () => unsubscribe();
        } catch (error) {
            console.error("Firebase initialization failed:", error);
            setIsLoading(false);
        }
    }, []);

    return { db, auth, userId, isLoading };
};

// --- Game Logic and Components ---

/** Main App Component */
const App = ({ prefillFromRoute }) => {
    const params = prefillFromRoute ? useParams() : {};
    const { db, userId, isLoading } = useFirebase();
    const [gameCode, setGameCode] = useState('');
    const [lobbyState, setLobbyState] = useState(null); // Game document state
    const [players, setPlayers] = useState([]); // Array of player documents
    const [screenName, setScreenName] = useState('');
    const [mode, setMode] = useState('HOME'); // HOME, LOBBY, GAME

    const isHost = useMemo(() => lobbyState?.hostUserId === userId, [lobbyState, userId]);

    // Firestore Listener for Game State
    useEffect(() => {
        if (!db || !gameCode) return;

        const gameDocRef = getGameDocPath(db, gameCode);
        const unsubscribeGame = onSnapshot(gameDocRef, (docSnap) => {
            if (docSnap.exists()) {
                setLobbyState(docSnap.data());
                setMode('LOBBY'); // Change mode if we successfully load a game
            } else if (gameCode && mode === 'LOBBY') {
                // Game was deleted or no longer exists
                setLobbyState(null);
                setPlayers([]);
                setGameCode('');
                setMode('HOME');
                // Use a non-alert message box in a real app
                console.log("Game ended by host.");
            }
        }, (error) => console.error("Error listening to game doc:", error));

        const playersColRef = getPlayersCollectionPath(db, gameCode);
        const unsubscribePlayers = onSnapshot(playersColRef, (querySnapshot) => {
            const playerList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setPlayers(playerList.sort((a, b) => b.score - a.score)); // Sort by score
        }, (error) => console.error("Error listening to players collection:", error));

        return () => {
            unsubscribeGame();
            unsubscribePlayers();
        };
    }, [db, gameCode, mode]);

    // Game/Player Actions
    const handleCreateGame = useCallback(async () => {
        if (!db || !userId || !screenName) return;

        const newCode = generateGameCode();
        const gameDocRef = getGameDocPath(db, newCode);

        try {
            // 1. Create Game Document
            await setDoc(gameDocRef, {
                gameCode: newCode,
                hostUserId: userId,
                status: 'LOBBY', // LOBBY, UPLOAD, PLAYING, SCORING, RESULTS
                questions: [],
                currentQuestionIndex: -1,
                currentQuestionStartTime: null,
            });

            // 2. Create Player Document (Host)
            const playerDocRef = getPlayerDocPath(db, newCode, userId);
            await setDoc(playerDocRef, {
                name: screenName,
                score: 0,
                isHost: true,
                lastAnswer: null,
                timestamp: Date.now(),
            });

            setGameCode(newCode);
            setMode('LOBBY');
        } catch (error) {
            console.error("Error creating game:", error);
            // Use a non-alert message box in a real app
            console.log("Failed to create game. Check console for details.");
        }
    }, [db, userId, screenName]);

    const handleJoinGame = useCallback(async (code) => {
        if (!db || !userId || !screenName) return;
        const normalizedCode = code.toUpperCase();

        const gameDocRef = getGameDocPath(db, normalizedCode);
        const gameSnap = await getDoc(gameDocRef);

        if (!gameSnap.exists()) {
            // Use a non-alert message box in a real app
            console.log("Game code is invalid or game has ended.");
            return;
        }

        const gameData = gameSnap.data();
        if (gameData.status !== 'LOBBY' && gameData.status !== 'UPLOAD') {
             // Use a non-alert message box in a real app
             console.log("Game is already in progress and cannot be joined.");
             return;
        }

        try {
            // Create Player Document
            const playerDocRef = getPlayerDocPath(db, normalizedCode, userId);
            await setDoc(playerDocRef, {
                name: screenName,
                score: 0,
                isHost: false,
                lastAnswer: null,
                timestamp: Date.now(),
            });

            setGameCode(normalizedCode);
            setMode('LOBBY');
        } catch (error) {
            console.error("Error joining game:", error);
            // Use a non-alert message box in a real app
            console.log("Failed to join game. Check console for details.");
        }
    }, [db, userId, screenName]);

    // --- RENDER FUNCTIONS ---

    if (isLoading) {
        return <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white"><p>Loading Firebase...</p></div>;
    }

    // If route has code param and we're still at HOME with no gameCode set, prefill into Home component
    const routePrefilledCode = prefillFromRoute && params?.code ? params.code.toUpperCase().substring(0,4) : null;

    if (mode === 'HOME' || !userId) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
                <Home
                    onJoin={handleJoinGame}
                    onCreate={handleCreateGame}
                    screenName={screenName}
                    setScreenName={setScreenName}
                    prefilledCode={routePrefilledCode}
                />
            </div>
        );
    }

    const currentQuestion = lobbyState?.questions?.[lobbyState.currentQuestionIndex];

    if (mode === 'LOBBY' && (lobbyState?.status === 'LOBBY' || lobbyState?.status === 'UPLOAD')) {
        return (
            <LobbyScreen
                db={db}
                gameCode={gameCode}
                lobbyState={lobbyState}
                players={players}
                userId={userId}
                isHost={isHost}
                setMode={setMode}
            />
        );
    }

    if (mode === 'LOBBY' && lobbyState?.status === 'PLAYING' && isHost) {
         return (
             <HostGameScreen
                 db={db}
                 gameCode={gameCode}
                 lobbyState={lobbyState}
                 players={players}
                 currentQuestion={currentQuestion}
                 userId={userId}
             />
         );
    }
    
    if (mode === 'LOBBY' && lobbyState?.status === 'PLAYING' && !isHost) {
        return (
            <PlayerGameScreen
                db={db}
                gameCode={gameCode}
                lobbyState={lobbyState}
                players={players}
                currentQuestion={currentQuestion}
                userId={userId}
            />
        );
    }
    
    // Fallback/Results Screen
    return (
        <ResultsScreen
            db={db}
            gameCode={gameCode}
            lobbyState={lobbyState}
            players={players}
            isHost={isHost}
            setGameCode={setGameCode}
            setMode={setMode}
        />
    );
};

// --- Sub-Components ---

const Home = ({ onJoin, onCreate, screenName, setScreenName, prefilledCode }) => {
    const [inputCode, setInputCode] = useState(prefilledCode || '');
    const nameInputRef = useRef(null);
    const [error, setError] = useState('');

    useEffect(() => {
        if (nameInputRef.current) {
            nameInputRef.current.focus();
        }
    }, []);

    const handleJoinClick = () => {
        if (!screenName.trim()) {
            setError("Please enter a screen name.");
            return;
        }
        if (!inputCode.trim() || inputCode.trim().length !== 4) {
            setError("Please enter a 4-letter game code.");
            return;
        }
        setError('');
        onJoin(inputCode);
    };

    const handleCreateClick = () => {
        if (!screenName.trim()) {
            setError("Please enter a screen name.");
            return;
        }
        setError('');
        onCreate();
    };

    return (
        <div className="w-full max-w-md bg-white p-4 sm:p-6 shadow-2xl rounded-xl animate-fade-in-down mx-2">
            <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4 sm:mb-6 text-center">Smartish</h1>
            <p className="text-red-600 text-center mb-4 font-semibold text-sm">{error}</p>

            <div className="mb-4 sm:mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">Your Screen Name</label>
                <input
                    ref={nameInputRef}
                    type="text"
                    value={screenName}
                    onChange={(e) => setScreenName(e.target.value.substring(0, 15))}
                    placeholder="Enter your name (Max 15 chars)"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 transition duration-150 text-base"
                />
            </div>

            <div className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-3">
                    <input
                        type="text"
                        value={inputCode}
                        onChange={(e) => !prefilledCode && setInputCode(e.target.value.toUpperCase().substring(0, 4))}
                        placeholder="CODE"
                        maxLength="4"
                        disabled={!!prefilledCode}
                        className={`w-full sm:flex-grow p-3 border-4 rounded-xl text-center text-xl font-bold tracking-widest uppercase focus:ring-indigo-500 focus:border-indigo-500 ${prefilledCode ? 'bg-gray-200 border-green-400 text-green-700 cursor-not-allowed' : 'border-indigo-300'}`}
                    />
                    <button
                        onClick={handleJoinClick}
                        disabled={!screenName.trim() || inputCode.length !== 4}
                        className="w-full sm:w-auto sm:min-w-[140px] p-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg hover:bg-indigo-700 transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-base"
                    >
                        Join Game
                    </button>
                </div>
                <div className="text-center text-gray-500 py-2 text-sm">
                    — OR —
                </div>
                <button
                    onClick={handleCreateClick}
                    disabled={!screenName.trim()}
                    className="w-full p-4 bg-purple-600 text-white font-bold text-base sm:text-lg rounded-xl shadow-lg hover:bg-purple-700 transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.02]"
                >
                    Create New Game (Host)
                </button>
            </div>
        </div>
    );
};



const PlayerGameScreen = ({ db, gameCode, lobbyState, players, currentQuestion, userId }) => {
    const player = players.find(p => p.id === userId);
    const [selectedAnswer, setSelectedAnswer] = useState(player?.lastAnswer || null);
    const startTime = lobbyState?.currentQuestionStartTime;
    const { remaining: timeRemaining } = useTimer(startTime);
    
    // Check for question change to reset answer state
    useEffect(() => {
        // Reset local state if player hasn't submitted an answer for the current question
        if (!player || player.lastAnswer === null) {
            setSelectedAnswer(null); 
        }
    }, [lobbyState?.currentQuestionIndex, player]);
    
    // Timer now handled by useTimer hook

    const handleAnswerSubmit = useCallback(async (answer) => {
        if (!db || !gameCode || !player || player.lastAnswer) return;

        const playerDocRef = getPlayerDocPath(db, gameCode, userId);
        try {
            await updateDoc(playerDocRef, {
                lastAnswer: answer,
                answerTimestamp: Date.now(), // Record when the answer was submitted
            });
            setSelectedAnswer(answer);
        } catch (e) {
            console.error("Error submitting answer:", e);
        }
    }, [db, gameCode, userId, player]);
    

    if (!currentQuestion || !player) return null;

    return (
        <div className="min-h-screen bg-gray-900 text-white p-3 sm:p-4 md:p-8 flex flex-col items-center justify-start">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-green-400 mb-4 sm:mb-6 text-center px-2">{player.name} - Score: {player.score}</h1>
            
            {/* Timer */}
            <div className={`text-4xl sm:text-5xl font-black mb-4 sm:mb-6 ${timeRemaining <= 10 ? 'text-red-500 animate-pulse' : 'text-yellow-400'}`}>
                {timeRemaining}s
            </div>
            
            {/* Question Card */}
            <div className="w-full max-w-2xl bg-gray-800 p-4 sm:p-6 rounded-2xl shadow-2xl mb-6 sm:mb-8">
                <p className="text-base sm:text-lg font-semibold mb-2 sm:mb-3 text-center text-gray-400">
                    Question {lobbyState.currentQuestionIndex + 1}
                </p>
                <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-center break-words">{currentQuestion.question}</h2>
            </div>

            {/* Options */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 w-full max-w-2xl px-2">
                {currentQuestion.options.map((option, index) => {
                    const isSelected = selectedAnswer === option;
                    
                    let bgColor = 'bg-indigo-600 hover:bg-indigo-700';
                    let disabled = false;

                    if (player.lastAnswer) {
                        disabled = true;
                        if (isSelected) {
                            bgColor = 'bg-yellow-500 text-gray-900 shadow-lg ring-4 ring-yellow-300';
                        } else {
                            bgColor = 'bg-gray-700 opacity-50';
                        }
                    }

                    return (
                        <button
                            key={index}
                            onClick={() => handleAnswerSubmit(option)}
                            disabled={disabled}
                            className={`p-3 sm:p-4 rounded-xl font-extrabold text-base sm:text-lg md:text-xl text-white transition-all duration-200 shadow-md transform hover:scale-[1.02] disabled:hover:scale-100 break-words ${bgColor}`}
                        >
                            {option}
                        </button>
                    );
                })}
            </div>
            
            {player.lastAnswer && (
                <p className="mt-8 text-2xl font-bold text-yellow-400 animate-pulse">
                    {selectedAnswer ? 'Answer Locked In!' : 'Waiting for Host...'}
                </p>
            )}
            
            <p className="mt-8 text-sm text-gray-500">Game Code: {gameCode}</p>

        </div>
    );
};

const ResultsScreen = ({ db, gameCode, players, isHost, setGameCode, setMode }) => {
    
    // Sort players for the leaderboard
    const sortedPlayers = useMemo(() => {
        return players
            .filter(p => !p.isHost)
            .sort((a, b) => b.score - a.score);
    }, [players]);
    
    const handleEndGame = async () => {
        if (!isHost) return;
        
        try {
            // Delete all player documents first
            const playersColRef = getPlayersCollectionPath(db, gameCode);
            const playerDocs = await getDocs(playersColRef);
            const deletePromises = playerDocs.docs.map(docSnap => deleteDoc(docSnap.ref));
            await Promise.all(deletePromises);
            
            // Delete the game document
            const gameDocRef = getGameDocPath(db, gameCode);
            await deleteDoc(gameDocRef);
            
            // Go back to home screen
            setGameCode('');
            setMode('HOME');
        } catch (e) {
            console.error("Error ending game:", e);
        }
    };
    
    // Ensure the player who is not the host returns to home screen if the game doc no longer exists
    
    return (
        <div className="min-h-screen bg-gray-900 text-white p-3 sm:p-4 md:p-8 flex flex-col items-center">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-red-500 mb-2 text-center px-2">GAME OVER</h1>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-semibold text-yellow-400 mb-6 sm:mb-8 text-center px-2">Final Results for {gameCode}</h2>
            
            {/* Leaderboard */}
            <div className="w-full max-w-xl bg-gray-800 p-4 sm:p-6 rounded-2xl shadow-2xl">
                <h3 className="text-2xl sm:text-3xl font-bold mb-3 sm:mb-4 text-center border-b border-gray-600 pb-2">Leaderboard</h3>
                <div className="space-y-2 sm:space-y-3">
                    {sortedPlayers.map((player, index) => (
                        <div key={player.id} className={`flex items-center justify-between p-3 sm:p-4 rounded-xl shadow-lg transform ${
                            index === 0 ? 'bg-yellow-500 text-gray-900 scale-105 ring-4 ring-yellow-300' : 'bg-gray-700'
                        }`}>
                            <span className="text-lg sm:text-xl md:text-2xl font-black w-8 sm:w-10 flex-shrink-0">{index + 1}.</span>
                            <span className={`text-base sm:text-lg md:text-xl font-extrabold flex-grow truncate mx-2 sm:mx-4 ${index === 0 ? 'text-gray-900' : 'text-white'}`}>
                                {player.name}
                            </span>
                            <span className={`text-base sm:text-lg md:text-2xl font-black flex-shrink-0 ${index === 0 ? 'text-gray-900' : 'text-indigo-400'}`}>
                                {player.score.toLocaleString()} pts
                            </span>
                        </div>
                    ))}
                </div>
            </div>
            
            {isHost ? (
                <button
                    onClick={handleEndGame}
                    className="mt-8 sm:mt-10 p-3 sm:p-4 bg-red-600 text-white font-extrabold text-base sm:text-lg md:text-xl rounded-xl shadow-2xl hover:bg-red-700 transition duration-200 transform hover:scale-[1.01] w-full max-w-md"
                >
                    End Game and Close Room
                </button>
            ) : (
                <p className="mt-8 sm:mt-10 text-base sm:text-lg md:text-xl font-medium text-gray-400 text-center px-2">Waiting for host to close the room...</p>
            )}
        </div>
    );
};

// Export App as default
export default App;
