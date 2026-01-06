import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { getGameDocPath, getPlayersCollectionPath, getPlayerDocPath, getUserSettingsDocPath } from "../helpers/firebasePaths";
import { parseCSV } from "../helpers/questionUtils";
import { requestAiQuestions, getAIStatus } from "../helpers/aiClient";
import { updateDoc, getDocs, writeBatch, deleteDoc, setDoc } from "firebase/firestore";
import QuestionsEditor from "../components/QuestionsEditor";
import PlayerAchievements from "../components/PlayerAchievements";
import ProfilePanel from "../components/ProfilePanel";
import { achievementBus, getAchievementService } from "../services/achievements";
import QuackKingLogo from "../components/QuackKingLogo.jsx";

if (typeof window !== "undefined" && typeof window.setTestMode !== "function") {
  window.setTestMode = (flag) => {
    window.__testMode = !!flag;
  };
}

const ACHIEVEMENT_ICON_MAP = {
  core_under_1s_correct: "⚡️",
  core_perfect_party_game: "🎉",
  core_first_game_created: "🚀",
  core_first_game_joined: "🙌",
  core_five_perfect_games: "💯",
  core_clutch_answer: "🏁",
  core_lightning_round: "🌩️",
  core_comeback_kid: "📈",
  core_party_starter: "🎊",
  core_scholar_mode_activated: "📚",
};

const CURATED_THEME_SUGGESTIONS = [
  "Classic Rock",
  "90s Pop Culture",
  "80s Movies",
  "Sci-Fi Cinema",
  "Fantasy Worlds",
  "Space Exploration",
  "World Capitals",
  "Geography by Landmarks",
  "U.S. State Facts",
  "National Parks",
  "Ocean Creatures",
  "Mythical Creatures",
  "Greek Mythology",
  "Norse Mythology",
  "Egyptian Mythology",
  "Medieval History",
  "Ancient Civilizations",
  "Famous Explorers",
  "Pirates & Sea Legends",
  "The Wild West",
  "Inventors & Inventions",
  "Tech History",
  "AI & The Future",
  "Internet Nostalgia",
  "Video Game Classics",
  "Console Wars",
  "Esports Legends",
  "Minecraft Mastery",
  "Nintendo Universe",
  "PlayStation Icons",
  "Xbox Era Trivia",
  "Arcade Retro",
  "Food Around the World",
  "Desserts & Sweets",
  "Coffee Culture",
  "Soda Showdown",
  "Holiday Traditions",
  "Christmas Movie Quotes",
  "Halloween Spooky Facts",
  "Thanksgiving Oddities",
  "Disney Animated Era",
  "Pixar Deep Cuts",
  "DreamWorks Films",
  "Studio Ghibli Magic",
  "Superheroes (Marvel)",
  "Superheroes (DC)",
  "Villains We Love",
  "Movie Soundtracks",
  "Band Lyric Battles",
  "Encyclopedia of Random",
];

const sliceSuggestions = (list, startIndex, count) => {
  if (!list.length) return [];
  const start = startIndex % list.length;
  const end = start + count;
  if (end <= list.length) return list.slice(start, end);
  return [...list.slice(start), ...list.slice(0, end - list.length)];
};

// Lobby screen allows host to upload or generate questions and start game.
export default function LobbyScreen({
  db,
  gameCode,
  lobbyState,
  players,
  userId,
  isHost,
  auth,
  authUser,
  onRequestAccount,
}) {
  const DEFAULT_GENERATE_COUNT = 5;
  const MIN_GENERATE_QUESTIONS = 1;
  const MAX_GENERATE_QUESTIONS = 50;

  const [csvText, setCsvText] = useState("");
  const [generatorTopic, setGeneratorTopic] = useState("");
  const [generatorCount, setGeneratorCount] = useState(DEFAULT_GENERATE_COUNT);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [topicInput, setTopicInput] = useState("");
  const [topicStatus, setTopicStatus] = useState("idle");
  const [topicMessage, setTopicMessage] = useState("");
  const [localUserAchievements, setLocalUserAchievements] = useState([]);
  const [droppingPlayerId, setDroppingPlayerId] = useState("");
  const [hostSuggestionIndex, setHostSuggestionIndex] = useState(0);
  const [playerSuggestionIndex, setPlayerSuggestionIndex] = useState(0);
  const [logoFailed, setLogoFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showEditor, setShowEditor] = useState(true);
  const [questionTab, setQuestionTab] = useState("ai");
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSeedingMocks, setIsSeedingMocks] = useState(false);
  // Ref for auto-scrolling/focusing the QuestionsEditor after questions load
  const editorRef = useRef(null);
  const toolsRef = useRef(null);
  const copyTimeoutRef = useRef(null);

  const questionCount = lobbyState?.questions?.length || 0;
  const aiStatus = useMemo(() => getAIStatus(), []);
  const aiEnabled = aiStatus.isEnabled;
  const achievementService = useMemo(() => getAchievementService(), []);
  const aiUnavailableMessage = useMemo(() => {
    if (aiEnabled) return "";
    switch (aiStatus.reason) {
      case "missing-configuration":
        return "Add a Gemini API key or AI proxy URL to enable automatic question generation.";
      default:
        return "AI question generator is currently unavailable. You can still upload CSV questions.";
    }
  }, [aiEnabled, aiStatus.reason]);
  const playerRecord = players.find((p) => p.id === userId);
  const playerSuggestion = playerRecord?.topicSuggestion || "";
  const hostName = lobbyState?.hostName?.trim() || "";
  const showDevTools = Boolean(import.meta?.env?.DEV);
  const hostThemeSuggestions = useMemo(
    () => sliceSuggestions(CURATED_THEME_SUGGESTIONS, hostSuggestionIndex, 5),
    [hostSuggestionIndex]
  );
  const playerThemeSuggestions = useMemo(
    () => sliceSuggestions(CURATED_THEME_SUGGESTIONS, playerSuggestionIndex, 6),
    [playerSuggestionIndex]
  );
  const localRecentAchievements = useMemo(() => {
    if (!localUserAchievements.length) return [];
    return [...localUserAchievements]
      .sort((a, b) => {
        const aTime = a.unlock?.timestamp || 0;
        const bTime = b.unlock?.timestamp || 0;
        return bTime - aTime;
      })
      .slice(0, 6)
      .map((entry) => ({
        id: entry.achievement.id,
        label: entry.achievement.name,
        shortLabel:
          entry.achievement.name.length > 18
            ? `${entry.achievement.name.slice(0, 18).trim()}…`
            : entry.achievement.name,
        description: entry.achievement.description,
        icon: ACHIEVEMENT_ICON_MAP[entry.achievement.id],
        unlockedAt: entry.unlock?.timestamp || null,
      }));
  }, [localUserAchievements]);

  useEffect(() => {
    setTopicInput(playerSuggestion);
  }, [playerSuggestion]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!userId) {
      setLocalUserAchievements([]);
      return;
    }

    let isActive = true;
    const syncAchievements = () => {
      try {
        const unlocked = achievementService.getAchievementsForUser(userId);
        if (isActive) {
          setLocalUserAchievements(unlocked);
        }
      } catch (err) {
        console.error("Failed to load achievements:", err);
      }
    };

    syncAchievements();

    const eventTypes = ["GAME_CREATED", "GAME_JOINED", "GAME_FINISHED", "QUESTION_ANSWERED"];
    const unsubscribes = eventTypes.map((eventType) =>
      achievementBus.on(eventType, (event) => {
        if (event.data.userId !== userId) return;
        syncAchievements();
      })
    );

    return () => {
      isActive = false;
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [achievementService, userId]);

  // 🏁 Start Game (host only)
  const handleStartGame = useCallback(async () => {
    if (!isHost || !db || !lobbyState) return;

    if (lobbyState.questions.length === 0) {
      setError("You must upload or generate questions first.");
      return;
    }

    try {
      const gameDocRef = getGameDocPath(db, gameCode);

      // Reset player answers and scores
      const playersColRef = getPlayersCollectionPath(db, gameCode);
      const playerDocs = await getDocs(playersColRef);
      if (!playerDocs.empty) {
        const batch = writeBatch(db);
        playerDocs.docs.forEach((docSnap) =>
          batch.update(docSnap.ref, {
            lastAnswer: null,
            score: 0,
            answerTimestamp: null,
          })
        );
        await batch.commit();
      }

      // Start game
      await updateDoc(gameDocRef, {
        status: "PLAYING",
        currentQuestionIndex: 0,
        currentQuestionStartTime: Date.now(),
        lastHostActivity: Date.now(),
        pruneAfter: null,
      });
      if (typeof window?.setTestMode === "function") {
        window.setTestMode(false);
      }
    } catch (e) {
      console.error("❌ Error starting game:", e);
      setError(`Failed to start game: ${e.message}`);
    }
  }, [db, gameCode, isHost, lobbyState]);

  const handleDropPlayer = useCallback(
    async (playerId, playerName) => {
      if (!isHost || !db || !gameCode || !playerId) return;
      const confirmed = window.confirm(
        `Remove ${playerName || "this player"} from the lobby?`
      );
      if (!confirmed) return;

      setDroppingPlayerId(playerId);
      try {
        const playerDocRef = getPlayerDocPath(db, gameCode, playerId);
        await deleteDoc(playerDocRef);
      } catch (e) {
        console.error("❌ Error removing player:", e);
        setError("Failed to drop player. Please try again.");
      } finally {
        setDroppingPlayerId("");
      }
    },
    [db, gameCode, isHost]
  );

  // 📄 Upload CSV Questions
  const handleCSVUpload = useCallback(async () => {
    setError("");
    const questions = parseCSV(csvText);

    if (questions.length === 0) {
      setError('Could not parse any valid questions. Format: "Question","Answer","Opt1","Opt2","Opt3"');
      return;
    }

    try {
      const gameDocRef = getGameDocPath(db, gameCode);
      await updateDoc(gameDocRef, {
        questions,
        status: "UPLOAD",
        lastHostActivity: Date.now(),
      });
      // Defer scroll slightly to allow React + Firestore snapshot to render editor
      setTimeout(() => {
        if (editorRef.current) {
          editorRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 150);
    } catch (e) {
      console.error("Error saving questions:", e);
      setError(`Upload failed: ${e.message}`);
    }
  }, [csvText, db, gameCode]);

  const clampGeneratorCount = useCallback(
    (value) => {
      const parsed = Number(value);
      if (Number.isNaN(parsed)) return DEFAULT_GENERATE_COUNT;
      return Math.min(Math.max(parsed, MIN_GENERATE_QUESTIONS), MAX_GENERATE_QUESTIONS);
    },
    [DEFAULT_GENERATE_COUNT, MAX_GENERATE_QUESTIONS, MIN_GENERATE_QUESTIONS]
  );

  // 🤖 AI Generate Questions
  const handleGenerateQuestions = useCallback(
    async (topicOverride, countOverride) => {
      const rawTopic = typeof topicOverride === "string" ? topicOverride : generatorTopic;
      const topic = rawTopic.trim();
      const desiredCount = clampGeneratorCount(
        typeof countOverride === "number" ? countOverride : generatorCount
      );
      if (!db || !gameCode || !isHost || !topic) return;
      if (!aiEnabled) {
        setError(aiUnavailableMessage || "AI generator unavailable. Please upload questions manually.");
        return;
      }

      setIsGenerating(true);
      setError("");

      try {
        const aiQuestions = await requestAiQuestions(topic, desiredCount);
        if (!aiQuestions.length) {
          throw new Error("AI returned empty response.");
        }

        const timestamp = Date.now();
        const formatted = aiQuestions
          .map((q, i) => {
            if (!q.options || q.options.length !== 4) return null;
            return {
              id: `ai-${timestamp}-${i}`,
              topic,
              question: q.question,
              correctAnswer: q.correctAnswer,
              options: shuffle([...q.options]),
            };
          })
          .filter(Boolean);

        if (formatted.length === 0) {
          throw new Error("AI did not provide any usable questions.");
        }

        const gameDocRef = getGameDocPath(db, gameCode);
        await updateDoc(gameDocRef, {
          questions: formatted,
          status: "UPLOAD",
          currentTheme: topic,
          lastHostActivity: Date.now(),
        });
        setCsvText("");
        setGeneratorTopic(topicOverride ? topic : "");
        setTimeout(() => {
          if (editorRef.current) {
            editorRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }, 150);
      } catch (e) {
        console.error("AI generation failed:", e);
        const friendlyMessage =
          e.code === "AI_DISABLED"
            ? "AI generator is disabled. Upload CSV questions instead."
            : `Failed to generate questions: ${e.message}`;
        setError(friendlyMessage);
      } finally {
        setIsGenerating(false);
      }
    },
    [aiEnabled, aiUnavailableMessage, clampGeneratorCount, db, gameCode, generatorCount, generatorTopic, isHost]
  );

  // 🔀 Simple shuffle
  const shuffle = (array) => array.sort(() => Math.random() - 0.5);

  const cycleHostSuggestions = useCallback(() => {
    setHostSuggestionIndex((prev) => (prev + 5) % CURATED_THEME_SUGGESTIONS.length);
  }, []);

  const cyclePlayerSuggestions = useCallback(() => {
    setPlayerSuggestionIndex((prev) => (prev + 6) % CURATED_THEME_SUGGESTIONS.length);
  }, []);

  const handleCopyCode = useCallback(async () => {
    if (!gameCode) return;
    try {
      await navigator?.clipboard?.writeText(gameCode);
      setCopied(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("Failed to copy code:", err);
    }
  }, [gameCode]);

  const handleSeedMockPlayers = useCallback(async () => {
    if (!db || !gameCode || !isHost) return;
    const existingIds = new Set(players.map((player) => player.id));
    setIsSeedingMocks(true);
    try {
      const batch = writeBatch(db);
      let added = 0;
      for (let i = 1; i <= 25; i += 1) {
        const id = `mock-${String(i).padStart(2, "0")}`;
        if (existingIds.has(id)) continue;
        const playerDocRef = getPlayerDocPath(db, gameCode, id);
        batch.set(playerDocRef, {
          name: `Mock Player ${String(i).padStart(2, "0")}`,
          score: 0,
          isHost: false,
          lastAnswer: null,
          timestamp: Date.now(),
        });
        added += 1;
      }
      if (added > 0) {
        await batch.commit();
      }
    } catch (e) {
      console.error("❌ Error seeding mock players:", e);
      setError("Failed to seed mock players.");
    } finally {
      setIsSeedingMocks(false);
    }
  }, [db, gameCode, isHost, players]);

  // 💡 Player topic suggestion
  const handleSubmitSuggestion = useCallback(async () => {
    if (isHost || !db || !userId || !gameCode || !topicInput.trim()) return;
    setTopicStatus("saving");
    setTopicMessage("");
    try {
      const playerDocRef = getPlayerDocPath(db, gameCode, userId);
      await updateDoc(playerDocRef, {
        topicSuggestion: topicInput.trim(),
        topicSuggestionTimestamp: Date.now(),
      });
      setTopicStatus("success");
      setTopicMessage("Sent! Host can see your idea.");
    } catch (e) {
      console.error("❌ Error saving topic suggestion:", e);
      setTopicStatus("error");
      setTopicMessage("Couldn't send that. Please try again.");
    }
  }, [db, gameCode, isHost, topicInput, userId]);

  // 💾 Save edited questions from QuestionsEditor
  const handleSaveQuestions = useCallback(async (updatedQuestions) => {
    try {
      const gameDocRef = getGameDocPath(db, gameCode);
      await updateDoc(gameDocRef, { questions: updatedQuestions, lastHostActivity: Date.now() });
      setError("");
    } catch (e) {
      console.error("Error saving edited questions:", e);
      setError(`Failed to save: ${e.message}`);
    }
  }, [db, gameCode]);

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white px-4 py-10">
      <div className="absolute top-4 left-4 sm:top-6 sm:left-6 pointer-events-none select-none drop-shadow-[0_12px_35px_rgba(0,0,0,0.35)]">
        {!logoFailed ? (
          <img
            src="/QuackKing.svg"
            alt="QuackKing logo"
            onError={() => setLogoFailed(true)}
            className="w-[4.1rem] sm:w-[5.1rem]"
          />
        ) : (
          <QuackKingLogo className="text-xl sm:text-2xl font-black" />
        )}
      </div>
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20">
        <button
          type="button"
          onClick={() => setIsProfileOpen(true)}
          className="group relative flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white shadow-lg shadow-black/30 transition hover:-translate-y-[1px] hover:border-amber-200/70 hover:bg-white/20"
          aria-label="Open profile"
        >
          <span className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-300/20 via-transparent to-purple-500/20 opacity-0 transition group-hover:opacity-100" />
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            className="h-6 w-6 relative"
          >
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c0-4 3.5-6 8-6s8 2 8 6" />
          </svg>
        </button>
      </div>
      <div className="w-full max-w-6xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Game Lobby</p>
          {hostName && (
            <p className="text-sm text-slate-300">Hosted by {hostName}</p>
          )}
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <h2 className="text-4xl md:text-5xl font-extrabold">
              Code: <span className="text-yellow-300">{gameCode}</span>
            </h2>
            <div className="relative flex flex-col items-center">
              <div className="flex items-center justify-center gap-2">

                <button
                  type="button"
                  onClick={handleCopyCode}
                  aria-label="Copy game code"
                  title={copied ? "Copied!" : "Copy game code"}
                  className="inline-flex items-center justify-center p-1 text-white/60 hover:text-white active:scale-95 transition"
                >
                  <svg
                    aria-hidden
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M9 9.5c0-.55.45-1 1-1h8c.55 0 1 .45 1 1v10c0 .55-.45 1-1 1h-8c-.55 0-1-.45-1-1z" />
                    <path d="M6 14.5v-9c0-.55.45-1 1-1h8.5" />
                  </svg>
                  <span className="sr-only">Copy game code</span>
                </button>
              </div>

              {/* Copied below the code, centered, no layout shift */}
              <span
                className={`absolute top-full mt-1 text-[10px] font-semibold text-yellow-300 transition-opacity duration-150 ${copied ? "opacity-100" : "opacity-0"
                  }`}
              >
                Copied!
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6 items-start">
          <div className="space-y-6">
            {isHost ? (
              <>
                <div className="rounded-2xl border border-white/10 bg-indigo-500/5 backdrop-blur-xl p-6 space-y-5 shadow-2xl shadow-indigo-950/40">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.4em] text-indigo-300/80 font-bold">Invite & Spectate</p>
                      <h4 className="text-xl font-bold mt-1 text-white">Bring the crowd</h4>
                    </div>
                  </div>

                  <CopyInviteButton gameCode={gameCode} />

                  <div className="space-y-3">
                    <button
                      onClick={() => window.open(`/#/spectator/${gameCode}`, "_blank")}
                      className="w-full flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 font-bold text-indigo-100 transition hover:bg-white/10 hover:border-white/20 text-sm"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                        <rect width="20" height="15" x="2" y="7" rx="2" ry="2" />
                        <path d="M17 2l-5 5-5-5" />
                      </svg>
                      Launch TV Mode (QR)
                    </button>
                    <p className="text-center text-[11px] text-slate-400">
                      Opens the spectator screen with the QR code.
                    </p>
                  </div>
                </div>
                <div
                  ref={toolsRef}
                  className="rounded-2xl border border-white/10 bg-indigo-500/5 backdrop-blur-xl shadow-2xl shadow-indigo-950/40"
                >
                  <div className="p-6 space-y-6">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.4em] text-indigo-300/80 font-bold flex items-center gap-2">
                          <span role="img" aria-label="sparkles">✨</span>
                          Question Tools
                        </p>
                        <h3 className="text-xl font-bold mt-1 text-white">Load some questions</h3>
                        <p className="text-sm text-indigo-100/70">
                          Fastest with AI, or paste your own CSV.
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] uppercase tracking-[0.3em] text-indigo-300/60 font-bold">Loaded</p>
                        <p className="text-lg font-bold text-yellow-200">
                          {questionCount} {questionCount === 1 ? "question" : "questions"}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 rounded-full bg-white/5 p-1 text-xs text-slate-300">
                      {[
                        { id: "ai", label: "AI Generation" },
                        { id: "csv", label: "CSV Manual Entry" },
                      ].map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setQuestionTab(tab.id)}
                          className={`flex-1 rounded-full px-3 py-1.5 font-semibold transition ${questionTab === tab.id
                            ? "bg-slate-900 text-amber-100 shadow-sm shadow-black/40"
                            : "text-purple-100/80 hover:bg-white/10"
                            }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    {questionTab === "ai" && (
                      <div className="rounded-2xl border border-white/10 bg-indigo-500/5 backdrop-blur-xl shadow-2xl shadow-indigo-950/20">
                        <div className="p-6 space-y-4">
                          <div>
                            <p className="text-[10px] uppercase tracking-[0.3em] text-indigo-300/80 font-bold flex items-center gap-2">
                              <span role="img" aria-label="sparkles">✨</span>
                              AI Generator
                            </p>
                            <h3 className="text-lg font-bold mt-1 text-white">Pick a theme</h3>
                            <p className="text-sm text-indigo-100/70">
                              Choose a topic and question count.
                            </p>
                          </div>
                          {aiEnabled ? (
                            <>
                              <div className="flex flex-col sm:flex-row gap-3">
                                <input
                                  type="text"
                                  value={generatorTopic}
                                  onChange={(e) => setGeneratorTopic(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && generatorTopic.trim()) {
                                      handleGenerateQuestions();
                                    }
                                  }}
                                  disabled={isGenerating}
                                  className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-white placeholder:text-purple-100/60 focus:outline-none focus:ring-2 focus:ring-yellow-300/70 disabled:opacity-50"
                                  placeholder="e.g., Science, History, Pop Culture..."
                                />
                                <div className="sm:w-40">
                                  <label className="text-[11px] uppercase tracking-[0.3em] text-purple-100/80 block mb-1">
                                    Count
                                  </label>
                                  <input
                                    type="number"
                                    min={MIN_GENERATE_QUESTIONS}
                                    max={MAX_GENERATE_QUESTIONS}
                                    value={generatorCount}
                                    onChange={(e) => setGeneratorCount(clampGeneratorCount(e.target.value))}
                                    disabled={isGenerating}
                                    className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-white text-center font-semibold focus:outline-none focus:ring-2 focus:ring-yellow-300/70 disabled:opacity-50"
                                  />
                                </div>
                              </div>
                              <button
                                onClick={handleGenerateQuestions}
                                disabled={!generatorTopic.trim() || isGenerating}
                                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-4 py-3 font-semibold text-white shadow-lg shadow-purple-900/40 transition hover:from-purple-400 hover:to-pink-400 disabled:opacity-50"
                              >
                                {isGenerating ? (
                                  <>
                                    <span role="img" aria-label="magic" className="animate-spin">✨</span>
                                    Generating...
                                  </>
                                ) : (
                                  <>
                                    <span role="img" aria-label="wand">🔮</span>
                                    Generate {generatorCount} Question{generatorCount === 1 ? "" : "s"}
                                  </>
                                )}
                              </button>
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <p className="text-xs uppercase tracking-[0.35em] text-purple-100/80">
                                    Quick ideas
                                  </p>
                                  <button
                                    type="button"
                                    onClick={cycleHostSuggestions}
                                    disabled={isGenerating}
                                    className="text-[11px] font-semibold text-amber-100/90 underline-offset-4 hover:underline disabled:opacity-50"
                                  >
                                    Next
                                  </button>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {hostThemeSuggestions.map((idea) => (
                                    <button
                                      key={idea}
                                      onClick={() => setGeneratorTopic(idea)}
                                      disabled={isGenerating}
                                      className="px-3 py-1 text-xs rounded-full border border-white/15 bg-white/5 text-white hover:border-yellow-300 disabled:opacity-40"
                                    >
                                      {idea}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </>
                          ) : (
                            <div className="rounded-xl border border-rose-400/40 bg-rose-500/10 p-4 text-sm text-rose-100">
                              <p className="font-semibold mb-1">AI Generator Disabled</p>
                              <p>{aiUnavailableMessage}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {questionTab === "csv" && (
                      <div className="rounded-2xl border border-white/10 bg-indigo-500/5 backdrop-blur-xl shadow-2xl shadow-indigo-950/20">
                        <div className="p-6 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[10px] uppercase tracking-[0.3em] text-indigo-300/80 font-bold flex items-center gap-2">
                                <span role="img" aria-label="clipboard">📋</span>
                                CSV Manual Entry
                              </p>
                              <h3 className="text-lg font-bold mt-1 text-white">Paste your rows</h3>
                              <p className="text-sm text-indigo-100/70">
                                Question, Answer, Opt1, Opt2, Opt3
                              </p>
                            </div>
                          </div>
                          <textarea
                            value={csvText}
                            onChange={(e) => setCsvText(e.target.value)}
                            placeholder={'Q: What is 2+2?,4,2,3,5'}
                            className="w-full min-h-[130px] rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 font-mono text-sm text-white placeholder:text-purple-200/60 focus:outline-none focus:ring-2 focus:ring-blue-300/60 resize-none"
                          />
                          <button
                            onClick={handleCSVUpload}
                            disabled={!csvText.trim()}
                            className="w-full rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 px-4 py-3 font-semibold text-white shadow-lg shadow-blue-900/40 transition hover:from-blue-400 hover:to-cyan-400 disabled:opacity-50"
                          >
                            Upload {csvText.split("\n").filter((l) => l.trim()).length} Questions
                          </button>
                          <p className="text-xs text-purple-100/60">
                            Tip: copy rows straight from Sheets/Excel and drop them here.
                          </p>
                        </div>
                      </div>
                    )}

                    {error && (
                      <div className="rounded-2xl border border-rose-400/60 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                        {error}
                      </div>
                    )}

                    {isHost && questionCount > 0 && (
                      <div
                        ref={editorRef}
                        className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 space-y-3 shadow-inner shadow-black/30"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs uppercase tracking-[0.35em] text-purple-200/80">Question Editor</p>
                            <p className="text-sm text-purple-100/70">
                              Tweak anything that looks off before you start.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowEditor((prev) => !prev)}
                            className="text-xs font-semibold text-amber-100/90 underline-offset-4 hover:underline"
                          >
                            {showEditor ? "Hide" : "Show"}
                          </button>
                        </div>
                        {showEditor && (
                          <QuestionsEditor
                            questions={lobbyState.questions}
                            onSave={handleSaveQuestions}
                            isHost={isHost}
                          />
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-indigo-500/5 backdrop-blur-xl p-6 space-y-4 shadow-2xl shadow-indigo-950/40">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.4em] text-indigo-300/80 font-bold">Start</p>
                    <h4 className="text-xl font-bold mt-1 text-white">Ready to play?</h4>
                    <p className="text-sm text-purple-100/70">
                      {questionCount > 0
                        ? `You have ${questionCount} question${questionCount === 1 ? "" : "s"} loaded.`
                        : "Upload or generate questions to unlock the start button."}
                    </p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <button
                      onClick={handleStartGame}
                      disabled={questionCount === 0 || players.length < 2}
                      className="flex items-center justify-center gap-2 rounded-xl bg-red-500/90 px-4 py-3 text-lg font-bold text-white shadow-lg shadow-red-900/40 transition hover:bg-red-400/90 disabled:opacity-50"
                    >
                      Start Game
                    </button>
                    <button
                      onClick={async () => {
                        if (!isHost || !db || !lobbyState) return;
                        if (lobbyState.questions.length === 0) {
                          setError("You must upload or generate questions first.");
                          return;
                        }
                        try {
                          const gameDocRef = getGameDocPath(db, gameCode);
                          const playersColRef = getPlayersCollectionPath(db, gameCode);
                          const playerDocs = await getDocs(playersColRef);
                          if (!playerDocs.empty) {
                            const batch = writeBatch(db);
                            playerDocs.docs.forEach((docSnap) =>
                              batch.update(docSnap.ref, {
                                lastAnswer: null,
                                score: 0,
                                answerTimestamp: null,
                              })
                            );
                            await batch.commit();
                          }
                          await updateDoc(gameDocRef, {
                            status: "PLAYING",
                            currentQuestionIndex: 0,
                            currentQuestionStartTime: Date.now(),
                            lastHostActivity: Date.now(),
                            pruneAfter: null,
                          });
                          if (typeof window.setTestMode === "function") {
                            window.setTestMode(true);
                          }
                        } catch (e) {
                          console.error("❌ Error starting test mode:", e);
                          setError(`Failed to start test mode: ${e.message}`);
                        }
                      }}
                      disabled={questionCount === 0}
                      className="flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-slate-900/70 px-4 py-3 text-lg font-semibold text-white transition hover:bg-slate-900 disabled:opacity-50"
                    >
                      Play Solo
                    </button>
                  </div>
                  {players.length < 2 && (
                    <p className="text-center text-sm text-amber-200">
                      Need at least 2 players to launch the real game.
                    </p>
                  )}
                </div>

                {/* Host Settings */}
                <div className="rounded-2xl border border-white/10 bg-indigo-500/5 backdrop-blur-xl shadow-2xl shadow-indigo-950/30">
                  <div className="p-6 space-y-4">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.4em] text-emerald-300/80 font-bold flex items-center gap-2">
                        <span role="img" aria-label="gear">⚙️</span>
                        Game Settings
                      </p>
                      <h3 className="text-xl font-bold mt-1 text-white">Host Controls</h3>
                    </div>

                    <div className="space-y-4">
                      {/* Auto-Host Toggle */}
                      <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
                        <div>
                          <p className="font-semibold text-white">Auto-Host Mode</p>
                          <p className="text-xs text-purple-200/60">Automatically reveal & advance</p>
                        </div>
                        <button
                          onClick={() => {
                            const currentAuto = lobbyState?.autoHost ?? true;
                            const newAuto = !currentAuto;
                            const gameDocRef = getGameDocPath(db, gameCode);
                            updateDoc(gameDocRef, { autoHost: newAuto, lastHostActivity: Date.now() });

                            // Persist to user profile
                            if (userId) {
                              console.log('💾 Saving autoHost:', newAuto, 'for user:', userId);
                              const userSettingsRef = getUserSettingsDocPath(db, userId);
                              setDoc(userSettingsRef, {
                                hostSettings: { autoHost: newAuto }
                              }, { merge: true })
                                .then(() => console.log('✅ Saved autoHost successfully'))
                                .catch(err => console.error("❌ Failed to save user settings:", err));
                            }
                          }}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${(lobbyState?.autoHost ?? true) ? 'bg-emerald-500' : 'bg-slate-700'
                            }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${(lobbyState?.autoHost ?? true) ? 'translate-x-6' : 'translate-x-1'
                              }`}
                          />
                        </button>
                      </div>

                      {/* Timer Settings */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-xs font-semibold text-purple-200/80 uppercase tracking-wider">
                            Question Timer
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              min="5"
                              max="120"
                              value={lobbyState?.timerSettings?.revealTime ?? 30}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                if (!isNaN(val)) {
                                  const gameDocRef = getGameDocPath(db, gameCode);
                                  updateDoc(gameDocRef, { "timerSettings.revealTime": val, lastHostActivity: Date.now() });

                                  // Persist to user profile
                                  if (userId) {
                                    console.log('💾 Saving revealTime:', val, 'for user:', userId);
                                    const userSettingsRef = getUserSettingsDocPath(db, userId);
                                    setDoc(userSettingsRef, {
                                      hostSettings: { revealTime: val }
                                    }, { merge: true })
                                      .then(() => console.log('✅ Saved revealTime successfully'))
                                      .catch(err => console.error("❌ Failed to save user settings:", err));
                                  }
                                }
                              }}
                              className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-white text-center font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                            <span className="absolute right-3 top-2 text-xs text-purple-200/50">sec</span>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-semibold text-purple-200/80 uppercase tracking-wider">
                            Next Question
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              min="1"
                              max="60"
                              value={lobbyState?.timerSettings?.nextQuestionTime ?? 3}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                if (!isNaN(val)) {
                                  const gameDocRef = getGameDocPath(db, gameCode);
                                  updateDoc(gameDocRef, { "timerSettings.nextQuestionTime": val, lastHostActivity: Date.now() });

                                  // Persist to user profile
                                  if (userId) {
                                    console.log('💾 Saving nextQuestionTime:', val, 'for user:', userId);
                                    const userSettingsRef = getUserSettingsDocPath(db, userId);
                                    setDoc(userSettingsRef, {
                                      hostSettings: { nextQuestionTime: val }
                                    }, { merge: true })
                                      .then(() => console.log('✅ Saved nextQuestionTime successfully'))
                                      .catch(err => console.error("❌ Failed to save user settings:", err));
                                  }
                                }
                              }}
                              className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-white text-center font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                            <span className="absolute right-3 top-2 text-xs text-purple-200/50">sec</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-6">
                <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6 space-y-4 shadow-2xl shadow-purple-900/30">
                  <div>
                    <p className="text-xs uppercase tracking-[0.35em] text-yellow-200/80">Suggest a Theme</p>
                    <h3 className="text-2xl font-bold mt-1">Help the host pick a topic</h3>
                    <p className="text-sm text-purple-100/70">
                      Share your idea and they&apos;ll see it instantly.
                    </p>
                  </div>
                  <input
                    type="text"
                    value={topicInput}
                    onChange={(e) => setTopicInput(e.target.value.slice(0, 40))}
                    name="themeSuggestion"
                    autoComplete="off"
                    placeholder="e.g., World Capitals, 90s Throwbacks..."
                    className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-white placeholder:text-purple-100/60 focus:outline-none focus:ring-2 focus:ring-yellow-300/70"
                    disabled={topicStatus === "saving"}
                  />
                  <button
                    onClick={handleSubmitSuggestion}
                    disabled={!topicInput.trim() || topicStatus === "saving"}
                    className="w-full rounded-xl bg-gradient-to-r from-yellow-400 to-orange-400 px-4 py-3 font-semibold text-gray-900 shadow-lg shadow-amber-800/40 transition hover:from-yellow-300 hover:to-orange-300 disabled:opacity-50"
                  >
                    {topicStatus === "saving" ? "Sending..." : "Send to Host"}
                  </button>
                  {topicMessage && (
                    <p className={`text-sm ${topicStatus === "error" ? "text-rose-200" : "text-green-200"}`}>
                      {topicMessage}
                    </p>
                  )}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs uppercase tracking-[0.35em] text-purple-100/80">Quick ideas</p>
                      <button
                        type="button"
                        onClick={cyclePlayerSuggestions}
                        className="text-[11px] font-semibold text-amber-100/90 underline-offset-4 hover:underline"
                      >
                        Next
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {playerThemeSuggestions.map((idea) => (
                        <button
                          key={idea}
                          onClick={() => setTopicInput(idea)}
                          className="px-3 py-1 text-xs rounded-full border border-white/15 bg-white/5 text-white hover:border-yellow-300"
                        >
                          {idea}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6 text-sm text-purple-100/80 space-y-2">
                  {hostName && (
                    <p>Your host <span className="text-purple-100/90 normal-case font-semibold tracking-normal">{hostName}</span> is preparing questions. Hang tight, share suggestions, or hype up the lobby!</p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-xl shadow-2xl shadow-black/40 flex flex-col max-h-[80vh]">
            <div className="p-6 border-b border-white/10">
              <p className="text-xs uppercase tracking-[0.35em] text-purple-200/70">Squad</p>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-2xl font-bold">Players ({players.length})</h3>
                {showDevTools && isHost && (
                  <button
                    type="button"
                    onClick={handleSeedMockPlayers}
                    disabled={isSeedingMocks}
                    className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-amber-100/80 transition hover:bg-white/10 disabled:opacity-50"
                  >
                    {isSeedingMocks ? "Seeding..." : "Seed 25"}
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {players.map((p) => {
                const suggestion = (p.topicSuggestion || "").trim();
                return (
                  <div
                    key={p.id}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 shadow-inner shadow-black/20 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold text-white truncate">{p.name}</span>
                        <div className="flex gap-2 text-[0.65rem] font-semibold uppercase tracking-wide">
                          {p.isHost && <span className="text-purple-300">Host</span>}
                          {p.id === userId && <span className="text-green-300">You</span>}
                        </div>
                      </div>
                      {isHost && (
                        <button
                          onClick={() => handleDropPlayer(p.id, p.name)}
                          disabled={droppingPlayerId === p.id}
                          className="text-xs font-semibold text-rose-200 hover:text-rose-100 disabled:opacity-60"
                        >
                          {droppingPlayerId === p.id ? "Removing..." : "Remove"}
                        </button>
                      )}
                    </div>
                    {p.id === userId && (
                      <PlayerAchievements playerId={p.id} recentAchievements={localRecentAchievements} />
                    )}
                    {suggestion && (
                      <div className="rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm">
                        <div className="text-[0.6rem] uppercase tracking-[0.3em] text-purple-200/70 mb-1">
                          Suggested Theme
                        </div>
                        <p className="text-white break-words">{suggestion}</p>
                        {isHost && (
                          <button
                            // Set the generator topic to the suggested theme, then auto-generate.
                            onClick={() => {
                              setGeneratorTopic(suggestion);
                              void handleGenerateQuestions(suggestion, generatorCount);
                              toolsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                            }}
                            className="mt-2 text-xs font-semibold text-yellow-200 hover:text-yellow-100"
                          >
                            Use Theme
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {isHost && players.length === 1 && (
              <p className="border-t border-white/10 p-4 text-center text-amber-200 text-sm animate-pulse">
                Waiting for players...
              </p>
            )}
          </div>
        </div>
        <p className="text-xs text-purple-100/60 text-center break-all">User ID: {userId}</p>
      </div>
      {isProfileOpen && (
        <ProfilePanel
          isOpen={isProfileOpen}
          onClose={() => setIsProfileOpen(false)}
          db={db}
          auth={auth}
          authUser={authUser}
          userId={userId}
          onRequestAccount={onRequestAccount}
        />
      )}
    </div>
  );
}

// --- Copy Invite Button with confirmation ---
function CopyInviteButton({ gameCode }) {
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    setCanShare(typeof navigator === "object" && typeof navigator.share === "function");
  }, []);

  const inviteUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/#/game/${gameCode}`;
  }, [gameCode]);

  const handleCopy = useCallback(() => {
    if (!inviteUrl) return;
    navigator.clipboard
      .writeText(inviteUrl)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch((e) => console.error("Copy failed:", e));
  }, [inviteUrl]);

  const handleShare = useCallback(async () => {
    if (!canShare || !inviteUrl) return;
    try {
      await navigator.share({
        title: "Join my trivia game",
        text: `Use code ${gameCode} to hop into the lobby!`,
        url: inviteUrl,
      });
    } catch (err) {
      if (err?.name !== "AbortError") {
        console.error("Share failed:", err);
      }
    }
  }, [canShare, gameCode, inviteUrl]);

  return (
    <div className="relative w-full">
      <div className="flex gap-3">
        <button
          onClick={handleCopy}
          className="flex-1 flex items-center justify-center gap-2 p-3 bg-indigo-500/20 border border-indigo-400/30 text-indigo-100 font-bold rounded-xl hover:bg-indigo-500/30 transition text-sm sm:text-base"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          Copy Link
        </button>
        {canShare && (
          <button
            onClick={handleShare}
            className="flex-1 flex items-center justify-center gap-2 p-3 bg-indigo-500/20 border border-indigo-400/30 text-indigo-100 font-bold rounded-xl hover:bg-indigo-500/30 transition text-sm sm:text-base"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            Share
          </button>
        )}
      </div>
      {copied && (
        <div
          className="absolute inset-x-0 mx-auto -top-10 w-max px-4 py-1 rounded-lg bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-950/40 animate-fadeInOut z-50"
          style={{
            pointerEvents: "none",
          }}
        >
          <span role="img" aria-label="copied" className="mr-1">✅</span>
          Copied to clipboard!
        </div>
      )}
      <style>
        {`
        @keyframes fadeInOut {
          0% { opacity: 0; transform: translateY(5px);}
          15% { opacity: 1; transform: translateY(0);}
          85% { opacity: 1; transform: translateY(0);}
          100% { opacity: 0; transform: translateY(-5px);}
        }
        .animate-fadeInOut {
          animation: fadeInOut 2s both;
        }
        `}
      </style>
    </div>
  );
}
