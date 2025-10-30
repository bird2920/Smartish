import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot, updateDoc, collection, query, getDoc, getDocs, deleteDoc, serverTimestamp, runTransaction } from 'firebase/firestore';

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

/** Shuffles an array (Fisher-Yates algorithm). */
const shuffleArray = (array) => {
    let newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
};

/** Parses CSV text into a structured questions array. */
const parseCSV = (csvText) => {
    const lines = csvText.split('\n').filter(line => line.trim() !== '');
    return lines.map((line, index) => {
        // Simple split by comma, and remove leading/trailing quotes/whitespace
        const parts = line.split(',').map(p => p.trim().replace(/^"|"$/g, ''));
        if (parts.length < 2) {
            console.error(`Skipping CSV line ${index + 1}: Not enough columns (Q/A required).`);
            return null;
        }

        const [question, correctAnswer, ...distractors] = parts;
        // Collect all options (correct answer + up to 4 distractors)
        const allOptions = [correctAnswer, ...distractors].filter(o => o).slice(0, 5);
        
        // Must have the correct answer and at least one other option for trivia game
        if (allOptions.length < 2) {
             console.error(`Skipping CSV line ${index + 1}: Not enough valid options.`);
             return null;
        }
        
        // Shuffle the options for display
        const options = shuffleArray(allOptions);

        return {
            id: index,
            question,
            correctAnswer,
            options,
        };
    }).filter(q => q !== null);
};


// --- Firebase Paths ---
const getGameDocPath = (db, gameCode) => doc(db, `artifacts/${appId}/public/data/games/${gameCode}`);
const getPlayersCollectionPath = (db, gameCode) => collection(db, `artifacts/${appId}/public/data/games/${gameCode}/players`);
const getPlayerDocPath = (db, gameCode, userId) => doc(db, `artifacts/${appId}/public/data/games/${gameCode}/players/${userId}`);


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

const LobbyScreen = ({ db, gameCode, lobbyState, players, userId, isHost }) => {
    const [csvText, setCsvText] = useState('');
    const [generatorTopic, setGeneratorTopic] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState('');

    const handleStartGame = useCallback(async () => {
        console.log('🎮 Start Game clicked!', { isHost, lobbyState, questionCount: lobbyState?.questions?.length, playerCount: players.length });
        
        if (!isHost) {
            console.error('❌ Not host - cannot start game');
            return;
        }
        
        if (!lobbyState) {
            console.error('❌ No lobby state - cannot start game');
            return;
        }
        
        if (lobbyState.questions.length === 0) {
            console.error('❌ No questions loaded - cannot start game');
            return;
        }

        const gameDocRef = getGameDocPath(db, gameCode);
        try {
            console.log('✅ Starting game with', lobbyState.questions.length, 'questions');
            
            // Reset player answers for the start
            const playersColRef = getPlayersCollectionPath(db, gameCode);
            const playerDocs = await getDocs(playersColRef);
            
            const updatePromises = playerDocs.docs.map(docSnap =>
                updateDoc(docSnap.ref, { lastAnswer: null, score: 0, answerTimestamp: null })
            );
            await Promise.all(updatePromises);

            // Start the game with the first question
            console.log('🚀 Setting game status to PLAYING');
            await updateDoc(gameDocRef, {
                status: 'PLAYING',
                currentQuestionIndex: 0,
                currentQuestionStartTime: Date.now()
            });
            
            console.log('✅ Game started successfully!');
        } catch (e) {
            console.error("❌ Error starting game:", e);
            alert('Error starting game: ' + e.message);
        }
    }, [db, gameCode, isHost, lobbyState, players.length]);

    const handleCSVUpload = () => {
        setError('');
        const questions = parseCSV(csvText);

        if (questions.length === 0) {
            setError('Could not parse any valid questions. Ensure format is: "Question","Answer","Opt1","Opt2","Opt3"');
            return;
        }

        const gameDocRef = getGameDocPath(db, gameCode);
        updateDoc(gameDocRef, {
            questions: questions,
            status: 'UPLOAD',
        }).catch(e => console.error("Error saving questions:", e));
    };
    
    const handleGenerateQuestions = useCallback(async () => {
        if (!db || !gameCode || !isHost || !generatorTopic.trim()) return;
        setIsGenerating(true);
        setError('');

        const systemPrompt = "You are a trivia question generator. Your task is to create exactly 5 multiple-choice trivia questions based on the user's requested topic. Each question MUST have one correct answer and exactly three plausible distractors. The response MUST be a JSON array conforming to the provided schema.";
        const userQuery = `Generate 5 trivia questions about the topic: "${generatorTopic.trim()}".`;

        const payload = {
            contents: [{ parts: [{ text: userQuery }] }],
            tools: [{ "google_search": {} }], // Use search grounding for accuracy
            systemInstruction: { parts: [{ text: systemPrompt }] },
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: QUESTION_SCHEMA
            }
        };

        try {
            const jsonString = await callGeminiApi(payload);
            const generatedQuestions = JSON.parse(jsonString);

            if (!Array.isArray(generatedQuestions) || generatedQuestions.length === 0) {
                throw new Error("Received empty or invalid question array from LLM.");
            }

            const formattedQuestions = generatedQuestions.map((q, index) => {
                const allOptions = [q.correctAnswer, q.distractor1, q.distractor2, q.distractor3].filter(o => o);
                if (allOptions.length !== 4) {
                     console.warn("Question did not yield 4 options:", q);
                     return null;
                }
                
                // Re-shuffle for in-game display
                const options = shuffleArray(allOptions); 

                return {
                    id: `llm-${index}`,
                    question: q.question,
                    correctAnswer: q.correctAnswer,
                    options,
                };
            }).filter(q => q !== null);

            if (formattedQuestions.length < 5) {
                 setError(`Only able to generate ${formattedQuestions.length} valid questions.`);
            }

            const gameDocRef = getGameDocPath(db, gameCode);
            await updateDoc(gameDocRef, {
                questions: formattedQuestions,
                status: 'UPLOAD',
            });
            setCsvText(''); // Clear CSV box if LLM is used
            setGeneratorTopic('');
            
        } catch (e) {
            console.error("Gemini Question Generation Failed:", e);
            setError(`Failed to generate questions. Error: ${e.message}. Please check the topic or try again later.`);
        } finally {
            setIsGenerating(false);
        }
    }, [db, gameCode, isHost, generatorTopic]);

    const questionCount = lobbyState?.questions?.length || 0;

    return (
        <div className="min-h-screen bg-gray-900 text-white p-3 sm:p-4 md:p-8 flex flex-col items-center">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-indigo-400 mb-2 tracking-wide text-center px-2">Lobby: {gameCode}</h2>
            <p className="text-base sm:text-lg md:text-xl text-gray-300 mb-4 sm:mb-6 text-center px-2">Ask players to join with this code.</p>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 md:gap-8 w-full max-w-6xl px-2">
                {/* Host Controls */}
                <div className={`col-span-1 lg:col-span-1 p-4 sm:p-6 rounded-xl shadow-2xl ${isHost ? 'bg-purple-800' : 'bg-gray-800'}`}>
                    <h3 className="text-xl sm:text-2xl font-bold mb-3 sm:mb-4 border-b pb-2">
                        {isHost ? 'Host Controls' : 'Waiting for Host...'}
                    </h3>
                    {isHost && (
                        <div className="space-y-3 sm:space-y-4">
                            {/* --- GEMINI QUESTION GENERATOR --- */}
                            {/* <div className="bg-purple-700 p-3 sm:p-4 rounded-lg shadow-inner">
                                <h4 className="text-lg sm:text-xl font-bold mb-2 text-yellow-300">✨ AI Question Generator</h4>
                                <p className="text-xs sm:text-sm text-gray-200 mb-2">Create a game instantly by providing a topic.</p>
                                <input
                                    type="text"
                                    className="w-full p-2 mb-2 bg-purple-600 border border-purple-500 rounded-lg text-white placeholder-gray-300 text-sm sm:text-base"
                                    placeholder="e.g., US History, 90s Cartoons"
                                    value={generatorTopic}
                                    onChange={(e) => setGeneratorTopic(e.target.value)}
                                    disabled={isGenerating}
                                />
                                <button
                                    onClick={handleGenerateQuestions}
                                    className="w-full p-2 bg-yellow-500 text-gray-900 font-bold rounded-lg shadow-md hover:bg-yellow-600 transition duration-200 disabled:opacity-50 text-sm sm:text-base"
                                    disabled={!generatorTopic.trim() || isGenerating}
                                >
                                    {isGenerating ? 'Generating 5 Questions...' : 'Generate 5 Questions'}
                                </button>
                            </div> */}
                            
                            {/* --- CSV UPLOAD (Original Feature) --- */}
                            <div className="pt-3 sm:pt-4 border-t border-purple-600">
                                <h4 className="text-lg sm:text-xl font-bold mb-2">Manual CSV Upload</h4>
                                <textarea
                                    className="w-full h-28 sm:h-32 p-2 sm:p-3 bg-gray-700 border border-gray-600 rounded-lg text-white font-mono text-xs sm:text-sm resize-none"
                                    placeholder="Paste CSV data here. Format: Question, CorrectAnswer, Option1, Option2..."
                                    value={csvText}
                                    onChange={(e) => setCsvText(e.target.value)}
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
                                <p className="text-base sm:text-lg font-semibold mb-2 sm:mb-3">
                                    Questions Loaded: <span className="text-yellow-300">{questionCount}</span>
                                </p>
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
                                        const inviteUrl = `${window.location.origin}/game/${gameCode}`;
                                        navigator.clipboard.writeText(inviteUrl).then(() => {
                                            console.log('Invite link copied:', inviteUrl);
                                        }).catch(e => console.error('Failed to copy invite link', e));
                                    }}
                                    className="mt-3 w-full p-3 sm:p-4 bg-yellow-500 text-gray-900 font-bold rounded-xl shadow-md hover:bg-yellow-400 transition duration-200 text-sm sm:text-base"
                                >
                                    Copy Invite Link
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Player List */}
                <div className="col-span-1 lg:col-span-2 p-4 sm:p-6 bg-gray-800 rounded-xl shadow-2xl">
                    <h3 className="text-xl sm:text-2xl font-bold mb-3 sm:mb-4 border-b border-gray-600 pb-2">
                        Players ({players.length})
                    </h3>
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
                    {isHost && players.length === 1 && (
                        <p className="text-yellow-400 mt-4 text-center text-base sm:text-lg animate-pulse">Waiting for players to join...</p>
                    )}
                </div>
            </div>

            <p className="mt-6 sm:mt-8 text-xs sm:text-sm text-gray-500 px-2 text-center break-all">Your User ID: {userId}</p>
        </div>
    );
};

const HostGameScreen = ({ db, gameCode, lobbyState, players, currentQuestion, userId }) => {
    const [showAnswers, setShowAnswers] = useState(false);
    const [isScoring, setIsScoring] = useState(false);
    
    // LLM Explanation State
    const [explanation, setExplanation] = useState(null);
    const [isExplaining, setIsExplaining] = useState(false);

    // Check if all players have answered
    const activePlayers = players.filter(p => !p.isHost);
    const answersSubmitted = activePlayers.filter(p => p.lastAnswer !== null).length;
    const allAnswered = answersSubmitted === activePlayers.length;

    useEffect(() => {
        // Automatically show answers 30 seconds after question starts, or when all players submit
        if (lobbyState?.status === 'PLAYING' && lobbyState.currentQuestionStartTime) {
            const timer = setTimeout(() => {
                if (!showAnswers && !isScoring) {
                    setShowAnswers(true);
                }
            }, 30000); // 30 seconds timeout

            if (allAnswered && !showAnswers && !isScoring) {
                 setShowAnswers(true);
            }

            return () => clearTimeout(timer);
        }
    }, [lobbyState, allAnswered, showAnswers, isScoring]);
    
    // Scoring logic (run once when showAnswers becomes true)
    useEffect(() => {
        if (!db || !gameCode || !currentQuestion || !showAnswers || isScoring) return;
        
        console.log('💰 Running scoring logic...');
        setIsScoring(true); // Prevent re-running score logic
        
        // Capture the player list NOW (not reactive)
        const playersToScore = players.filter(p => !p.isHost);
        const questionStartTime = lobbyState.currentQuestionStartTime;
        
        const scoreUpdates = playersToScore.map(player => {
            const playerDocRef = getPlayerDocPath(db, gameCode, player.id);
            let scoreIncrease = 0;
            
            // Time-based scoring: 1000 points max, decreases over 30 seconds
            if (player.lastAnswer === currentQuestion.correctAnswer && player.answerTimestamp) {
                const responseTime = player.answerTimestamp - questionStartTime; // milliseconds
                const responseTimeSeconds = responseTime / 1000;
                
                // Calculate score: 1000 points for instant answer, decreasing to 500 points at 30 seconds
                // Formula: 1000 - (500 * (time/30))
                const timePenalty = Math.min(responseTimeSeconds / 30, 1); // Cap at 1 (30 seconds)
                scoreIncrease = Math.round(1000 - (500 * timePenalty));
                scoreIncrease = Math.max(scoreIncrease, 500); // Minimum 500 points for correct answer
                
                console.log(`✅ ${player.name} answered correctly in ${responseTimeSeconds.toFixed(2)}s! +${scoreIncrease}`);
            } else if (player.lastAnswer === currentQuestion.correctAnswer) {
                // Fallback if timestamp missing
                scoreIncrease = 1000;
                console.log(`✅ ${player.name} answered correctly! +${scoreIncrease}`);
            } else {
                console.log(`❌ ${player.name} answered: ${player.lastAnswer}`);
            }
            
            // Only update if score is changing
            if (scoreIncrease > 0) {
                 return updateDoc(playerDocRef, {
                    score: player.score + scoreIncrease,
                });
            }
            return Promise.resolve();
        });
        
        Promise.all(scoreUpdates)
            .then(() => {
                console.log('✅ Scoring complete');
                setIsScoring(false); // Re-enable the 'Next' button
            })
            .catch(e => {
                console.error("Error scoring:", e);
                setIsScoring(false); // Also re-enable on error
            });
            
    }, [db, gameCode, currentQuestion?.id, showAnswers]); // Use question id instead of object


    const handleNextQuestion = async () => {
        console.log('➡️ Moving to next question...');
        const nextIndex = lobbyState.currentQuestionIndex + 1;

        if (nextIndex < lobbyState.questions.length) {
            // Next Question
            try {
                const gameDocRef = getGameDocPath(db, gameCode);
                await updateDoc(gameDocRef, {
                    currentQuestionIndex: nextIndex,
                    currentQuestionStartTime: Date.now(),
                });

                // Reset all player answers
                const playersColRef = getPlayersCollectionPath(db, gameCode);
                const playerDocs = await getDocs(playersColRef);
                const updatePromises = playerDocs.docs.map(docSnap =>
                    updateDoc(docSnap.ref, { lastAnswer: null, answerTimestamp: null })
                );
                await Promise.all(updatePromises);
                
                setShowAnswers(false); // Reset UI state
                setExplanation(null); // Reset LLM state
                setIsScoring(false); // Reset scoring flag for next question
                
                console.log('✅ Moved to question', nextIndex + 1);
            } catch (e) {
                console.error('❌ Error moving to next question:', e);
                alert('Error moving to next question: ' + e.message);
            }
            
        } else {
            // End Game
            try {
                const gameDocRef = getGameDocPath(db, gameCode);
                await updateDoc(gameDocRef, { status: 'RESULTS' });
                console.log('🏁 Game ended');
            } catch (e) {
                console.error('❌ Error ending game:', e);
                alert('Error ending game: ' + e.message);
            }
        }
    };
    
    const handleGenerateExplanation = useCallback(async () => {
        if (!db || !currentQuestion || isExplaining) return; // Note: added check for isExplaining here
        setIsExplaining(true);
        setExplanation(null);

        const systemPrompt = "You are a fun and engaging trivia master. Provide a concise, single-paragraph, and interesting explanation or fun fact about the correct answer, focusing on the context of the question. Your tone should be bright and educational.";
        const userQuery = `The trivia question was: "${currentQuestion.question}". The correct answer was: "${currentQuestion.correctAnswer}". Please provide a brief fun fact or explanation (max 3 sentences).`;

        const payload = {
            contents: [{ parts: [{ text: userQuery }] }],
            tools: [{ "google_search": {} }], // Use search grounding for accuracy
            systemInstruction: { parts: [{ text: systemPrompt }] },
        };

        try {
            const text = await callGeminiApi(payload);
            setExplanation(text);
        } catch (e) {
            console.error("Gemini Explanation Failed:", e);
            setExplanation(`Sorry, I couldn't generate an explanation right now. (Error: ${e.message})`);
        } finally {
            setIsExplaining(false);
        }
    }, [currentQuestion, isExplaining]);


    if (!currentQuestion) return null; // Should not happen in PLAYING mode

    const totalQuestions = lobbyState.questions.length;
    const nextIndex = lobbyState.currentQuestionIndex + 1;
    
    return (
        <div className="min-h-screen bg-gray-900 text-white p-3 sm:p-4 md:p-8 flex flex-col items-center">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-indigo-400 mb-4 sm:mb-6 text-center px-2">Host Screen - Game: {gameCode}</h1>

            {/* Question Card */}
            <div className="w-full max-w-4xl bg-gray-800 p-4 sm:p-6 md:p-8 rounded-2xl shadow-2xl mb-6 sm:mb-8">
                <p className="text-base sm:text-lg md:text-xl font-semibold mb-3 sm:mb-4 text-center text-gray-400">
                    Question {lobbyState.currentQuestionIndex + 1} of {totalQuestions}
                </p>
                <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-center mb-4 sm:mb-6 break-words">{currentQuestion.question}</h2>

                {/* Options and Correct Answer */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                    {currentQuestion.options.map((option, index) => (
                        <div
                            key={index}
                            className={`p-3 sm:p-4 rounded-xl font-bold text-sm sm:text-base md:text-lg transition-all duration-300 break-words ${
                                showAnswers && option === currentQuestion.correctAnswer
                                    ? 'bg-green-600 shadow-xl'
                                    : showAnswers && option !== currentQuestion.correctAnswer
                                    ? 'bg-red-800 opacity-50'
                                    : 'bg-gray-700'
                            }`}
                        >
                            {option}
                        </div>
                    ))}
                </div>
            </div>

            {/* Answers & Score */}
            <div className="w-full max-w-4xl bg-gray-800 p-4 sm:p-6 rounded-2xl shadow-xl mb-4">
                <h3 className="text-lg sm:text-xl md:text-2xl font-bold mb-3 sm:mb-4 border-b border-gray-600 pb-2">
                    Player Answers ({answersSubmitted} / {activePlayers.length})
                </h3>
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
            
            {/* --- GEMINI EXPLANATION --- */}
            {/* {showAnswers && (
                <div className="w-full max-w-4xl p-4 sm:p-6 bg-purple-900 rounded-2xl shadow-inner mb-4">
                    <h3 className="text-lg sm:text-xl font-bold mb-3 text-yellow-300">✨ Answer Explanation</h3>
                    
                    {explanation ? (
                        <p className="text-sm sm:text-base md:text-lg text-white p-3 bg-purple-800 rounded-lg break-words">{explanation}</p>
                    ) : (
                        <button
                            onClick={handleGenerateExplanation}
                            disabled={isExplaining}
                            className="w-full p-3 bg-indigo-500 text-white font-bold rounded-xl shadow-md hover:bg-indigo-600 transition duration-200 disabled:opacity-50 text-sm sm:text-base"
                        >
                            {isExplaining ? 'Fetching Fun Fact...' : 'Get Fun Fact/Explanation'}
                        </button>
                    )}
                </div>
            )} */}

            {/* Host Actions */}
            <div className="w-full max-w-4xl px-2">
                {!showAnswers ? (
                    <button
                        onClick={() => setShowAnswers(true)}
                        className="w-full p-3 sm:p-4 bg-yellow-500 text-gray-900 font-extrabold text-base sm:text-lg md:text-xl rounded-xl shadow-2xl hover:bg-yellow-600 transition duration-200 transform hover:scale-[1.01]"
                        disabled={isScoring}
                    >
                        {isScoring ? 'Scoring...' : 'Reveal Answers Now'}
                    </button>
                ) : (
                    <button
                        onClick={handleNextQuestion}
                        className="w-full p-3 sm:p-4 bg-purple-600 text-white font-extrabold text-base sm:text-lg md:text-xl rounded-xl shadow-2xl hover:bg-purple-700 transition duration-200 transform hover:scale-[1.01]"
                        disabled={isScoring}
                    >
                        {nextIndex < totalQuestions ? 'Next Question' : 'End Game & Show Results'}
                    </button>
                )}
            </div>
        </div>
    );
};

const PlayerGameScreen = ({ db, gameCode, lobbyState, players, currentQuestion, userId }) => {
    const player = players.find(p => p.id === userId);
    const [selectedAnswer, setSelectedAnswer] = useState(player?.lastAnswer || null);
    const [timeRemaining, setTimeRemaining] = useState(30);
    
    // Check for question change to reset answer state
    useEffect(() => {
        // Reset local state if player hasn't submitted an answer for the current question
        if (!player || player.lastAnswer === null) {
            setSelectedAnswer(null); 
        }
    }, [lobbyState?.currentQuestionIndex, player]);
    
    // Countdown timer
    useEffect(() => {
        if (!lobbyState?.currentQuestionStartTime) return;
        
        const startTime = lobbyState.currentQuestionStartTime;
        const updateTimer = () => {
            const elapsed = Date.now() - startTime;
            const remaining = Math.max(0, 30 - Math.floor(elapsed / 1000));
            setTimeRemaining(remaining);
        };
        
        updateTimer(); // Update immediately
        const interval = setInterval(updateTimer, 100); // Update every 100ms for smooth countdown
        
        return () => clearInterval(interval);
    }, [lobbyState?.currentQuestionStartTime, lobbyState?.currentQuestionIndex]);

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
