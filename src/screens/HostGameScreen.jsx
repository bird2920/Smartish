import React, { useState, useEffect, useCallback } from "react";
import { getGameDocPath, getPlayersCollectionPath, getPlayerDocPath } from "../helpers/firebasePaths";
import { updateDoc, getDocs, writeBatch } from "firebase/firestore";
import { calculateScoreUpdates } from "../helpers/scoringUtils";
import { achievementBus } from "../services/achievements";

export default function HostGameScreen({ db, gameCode, lobbyState, players, currentQuestion, userId }) {
  const [revealed, setRevealed] = useState(lobbyState?.answerRevealed || false);
  const [timeRemaining, setTimeRemaining] = useState(30);
  const [playersWhoAnswered, setPlayersWhoAnswered] = useState(new Set());
  const autoHostEnabled = lobbyState?.autoHost ?? true;
  const revealTime = lobbyState?.timerSettings?.revealTime ?? 30;
  const nextQuestionTime = lobbyState?.timerSettings?.nextQuestionTime ?? 3;
  const [nextQuestionCountdown, setNextQuestionCountdown] = useState(null);
  const FIRST_QUESTION_DELAY_SECONDS = 3;

  const questionNumber = (lobbyState?.currentQuestionIndex || 0) + 1;
  const totalQuestions = lobbyState?.questions?.length || 0;
  const isLastQuestion = questionNumber >= totalQuestions;

  // Sync revealed state from Firestore
  useEffect(() => {
    setRevealed(lobbyState?.answerRevealed || false);
  }, [lobbyState?.answerRevealed, lobbyState?.currentQuestionIndex]);

  // ⏳ Countdown timer
  useEffect(() => {
    if (!lobbyState?.currentQuestionStartTime) return;

    const startTime = lobbyState.currentQuestionStartTime;
    const shouldDelay = lobbyState.currentQuestionIndex === 0 && !lobbyState.answerRevealed;
    const delayMs = shouldDelay ? FIRST_QUESTION_DELAY_SECONDS * 1000 : 0;
    const tick = () => {
      const elapsed = Date.now() - startTime - delayMs;
      const adjustedElapsedSeconds = Math.max(0, Math.floor(elapsed / 1000));
      const remaining = Math.max(0, revealTime - adjustedElapsedSeconds);
      setTimeRemaining(remaining);
    };

    tick();
    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [
    lobbyState?.currentQuestionStartTime,
    lobbyState?.currentQuestionIndex,
    lobbyState?.answerRevealed,
    revealTime,
  ]);

  // 🔁 Clear answered tracking when a new question starts to avoid carrying stale answers
  useEffect(() => {
    setPlayersWhoAnswered(new Set());
  }, [lobbyState?.currentQuestionIndex]);

  // 👀 Track who answered
  useEffect(() => {
    const answered = new Set();
    const currentStart = lobbyState?.currentQuestionStartTime || 0;
    players.forEach((p) => {
      const hasAnswer = p.lastAnswer !== null && p.lastAnswer !== undefined;
      const isCurrentQuestion =
        typeof p.answerTimestamp === "number"
          ? p.answerTimestamp >= currentStart
          : false;
      if (hasAnswer && isCurrentQuestion) {
        answered.add(p.id);
      }
    });
    setPlayersWhoAnswered(answered);
  }, [players, lobbyState?.currentQuestionStartTime]);

  // 🎯 Reveal Answer
  const handleRevealAnswer = useCallback(async () => {
    if (!currentQuestion || !db) return;
    setRevealed(true);

    // Mark answer as revealed in Firestore
    try {
      const gameDocRef = getGameDocPath(db, gameCode);
      await updateDoc(gameDocRef, { answerRevealed: true, lastHostActivity: Date.now() });
    } catch (err) {
      console.error("❌ Error updating answerRevealed:", err);
    }

    // Calculate scores for correct answers & increment stats
    try {
      if (players.length > 0) {
        const scoreUpdates = calculateScoreUpdates({
          players,
          correctAnswer: currentQuestion.correctAnswer,
          questionStartTime: lobbyState?.currentQuestionStartTime,
        });

        if (scoreUpdates.length) {
          const batch = writeBatch(db);
          scoreUpdates.forEach(({ id, updates }) => {
            const playerDocRef = getPlayerDocPath(db, gameCode, id);
            batch.update(playerDocRef, updates);
          });
          await batch.commit();
        }
      }
    } catch (err) {
      console.error("❌ Error calculating scores:", err);
    }
  }, [db, gameCode, currentQuestion, lobbyState, players]);

  // ⏱️ Auto-reveal when timer expires (auto-host)
  useEffect(() => {
    if (!autoHostEnabled || revealed) return;
    if (timeRemaining > 0) return;
    handleRevealAnswer();
  }, [autoHostEnabled, revealed, timeRemaining, handleRevealAnswer]);

  // ➡️ Next Question
  const handleNextQuestion = useCallback(async () => {
    if (!db || !lobbyState) return;

    try {
      const gameDocRef = getGameDocPath(db, gameCode);

      // Reset player answers
      if (players.length > 0) {
        const batch = writeBatch(db);
        players.forEach((player) => {
          const playerDocRef = getPlayerDocPath(db, gameCode, player.id);
          batch.update(playerDocRef, {
            lastAnswer: null,
            answerTimestamp: null,
          });
        });
        await batch.commit();
      }

      // Move to next question
      await updateDoc(gameDocRef, {
        currentQuestionIndex: lobbyState.currentQuestionIndex + 1,
        currentQuestionStartTime: Date.now(),
        answerRevealed: false,
        lastHostActivity: Date.now(),
      });

      setRevealed(false);
    } catch (err) {
      console.error("❌ Error moving to next question:", err);
    }
  }, [db, gameCode, lobbyState]);

  // 🏁 End Game
  const handleEndGame = useCallback(async () => {
    if (!db) return;

    try {
      const gameDocRef = getGameDocPath(db, gameCode);
      await updateDoc(gameDocRef, {
        status: "RESULTS",
        lastHostActivity: Date.now(),
      });

      const playersForEvent = players.map((player) => ({
        userId: player.id,
        score: player.score ?? 0,
      }));

      // 🔥 Performance: Defer achievement emissions to avoid blocking the UI transition
      setTimeout(() => {
        const rankByUser = new Map();
        [...playersForEvent]
          .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
          .forEach((entry, index) => {
            rankByUser.set(entry.userId, index + 1);
          });

        playersForEvent.forEach((playerEntry) => {
          achievementBus.emit({
            type: "GAME_FINISHED",
            data: {
              userId: playerEntry.userId,
              gameId: gameCode,
              finalScore: playerEntry.score,
              players: playersForEvent,
              hostUserId: lobbyState?.hostUserId,
              finalRank: rankByUser.get(playerEntry.userId),
            },
          });
        });
      }, 0);
    } catch (err) {
      console.error("❌ Error ending game:", err);
    }
  }, [db, gameCode, players, lobbyState]);

  // 🛑 Stop Game and return to lobby (keep players)
  const handleReturnToLobby = useCallback(async () => {
    if (!db || !gameCode) return;
    const confirmed = window.confirm(
      "Stop the current game and return to the lobby? Scores and answers will reset."
    );
    if (!confirmed) return;

    try {
      if (players.length > 0) {
        const batch = writeBatch(db);
        players.forEach((player) => {
          const playerDocRef = getPlayerDocPath(db, gameCode, player.id);
          batch.update(playerDocRef, {
            score: 0,
            lastAnswer: null,
            answerTimestamp: null,
            correctCount: 0,
            answeredCount: 0,
          });
        });
        await batch.commit();
      }

      const gameDocRef = getGameDocPath(db, gameCode);
      await updateDoc(gameDocRef, {
        status: "LOBBY",
        currentQuestionIndex: 0,
        currentQuestionStartTime: null,
        answerRevealed: false,
        lastHostActivity: Date.now(),
      });
    } catch (err) {
      console.error("❌ Error returning to lobby:", err);
    }
  }, [db, gameCode]);

  // 🤖 Auto reveal when everyone answers
  useEffect(() => {
    if (!autoHostEnabled || revealed) return;
    const totalParticipants = players.filter((p) => !p.isHost).length;
    if (totalParticipants === 0) return;
    if (playersWhoAnswered.size === totalParticipants) {
      handleRevealAnswer();
    }
  }, [autoHostEnabled, players, playersWhoAnswered, revealed, handleRevealAnswer]);

  // ⏭️ Auto advance or end after reveal
  useEffect(() => {
    if (!autoHostEnabled || !revealed) {
      setNextQuestionCountdown(null);
      return;
    }

    const totalParticipants = players.filter((p) => !p.isHost).length;

    if (isLastQuestion) {
      if (totalParticipants === 0 || playersWhoAnswered.size !== totalParticipants) {
        setNextQuestionCountdown(null);
        return;
      }

      setNextQuestionCountdown(nextQuestionTime);
      const countdownInterval = setInterval(() => {
        setNextQuestionCountdown((prev) => {
          if (prev === null) return null;
          return Math.max(prev - 1, 0);
        });
      }, 1000);

      const endTimeout = setTimeout(() => {
        handleEndGame();
      }, nextQuestionTime * 1000);

      return () => {
        clearInterval(countdownInterval);
        clearTimeout(endTimeout);
      };
    }

    setNextQuestionCountdown(nextQuestionTime);
    const countdownInterval = setInterval(() => {
      setNextQuestionCountdown((prev) => {
        if (prev === null) return null;
        return Math.max(prev - 1, 0);
      });
    }, 1000);

    const advanceTimeout = setTimeout(() => {
      handleNextQuestion();
    }, nextQuestionTime * 1000);

    return () => {
      clearInterval(countdownInterval);
      clearTimeout(advanceTimeout);
    };
  }, [
    autoHostEnabled,
    revealed,
    isLastQuestion,
    players,
    playersWhoAnswered,
    handleNextQuestion,
    handleEndGame,
    lobbyState?.currentQuestionIndex,
  ]);

  if (!currentQuestion) return null;

  const timeColor = timeRemaining <= 10 ? "text-red-500 animate-pulse" : "text-yellow-400";

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6 flex flex-col items-center">
      {/* Header */}
      <div className="w-full max-w-4xl mb-6">
        <h2 className="text-3xl font-extrabold text-slate-300 mb-2 text-center">
          Host Controls — {gameCode}
        </h2>
        <p className="text-center text-gray-400">
          Question {questionNumber} of {totalQuestions}
        </p>
      </div>

      {/* Timer */}
      <div className={`text-6xl font-black mb-6 ${timeColor}`}>{timeRemaining}s</div>

      {/* Question */}
      <div className="w-full max-w-4xl bg-white/5 backdrop-blur-xl p-8 rounded-2xl border border-white/10 shadow-2xl shadow-indigo-950/40 mb-6">
        <h2 className="text-2xl font-bold mb-6 text-center break-words">
          {currentQuestion.question}
        </h2>

        {/* Options Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {currentQuestion.options.map((option, i) => {
            const isCorrect = option === currentQuestion.correctAnswer;
            let bgColor = "bg-indigo-600";

            if (revealed) {
              bgColor = isCorrect
                ? "bg-green-500 ring-4 ring-green-300"
                : "bg-red-500 opacity-50";
            }

            return (
              <div
                key={i}
                className={`p-3 rounded-xl font-bold text-base ${bgColor} text-white text-center ${!revealed && isCorrect ? "ring-2 ring-green-500 shadow-[0_0_10px_rgba(34,197,94,0.3)] opacity-90" : ""
                  }`}
              >
                {option}
                {revealed && isCorrect && " ✅"}
              </div>
            );
          })}
        </div>

        {/* Answer Status */}
        {revealed && (
          <div className="mt-4 p-4 bg-green-800 rounded-lg border-2 border-green-500">
            <p className="text-xl font-bold text-center text-green-200">
              ✅ Correct Answer: {currentQuestion.correctAnswer}
            </p>
          </div>
        )}
      </div>

      {/* Players Answered Status */}
      <div className="w-full max-w-4xl bg-white/5 backdrop-blur-xl p-6 rounded-xl border border-white/10 shadow-2xl shadow-indigo-950/40 mb-6">
        <h3 className="text-xl font-bold mb-4">
          Players Answered: {playersWhoAnswered.size} / {players.filter((p) => !p.isHost).length}
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {players
            .filter((p) => !p.isHost)
            .map((p) => {
              const hasAnswered = playersWhoAnswered.has(p.id);
              return (
                <div
                  key={p.id}
                  className={`p-2 rounded text-sm font-medium text-center ${hasAnswered
                    ? "bg-green-700 text-white"
                    : "bg-gray-700 text-gray-400"
                    }`}
                >
                  {p.name} {hasAnswered && "✓"}
                </div>
              );
            })}
        </div>
      </div>

      {/* Host Controls */}
      <div className="w-full max-w-4xl flex flex-col gap-3">
        <div className="w-full flex flex-col sm:flex-row gap-3 items-stretch">
          <div className="flex-1 bg-gray-800 p-4 rounded-xl flex items-center justify-between shadow-inner">
            <div>
              <p className="text-lg font-bold">Auto-Host Mode</p>
              <p className="text-sm text-gray-400">Reveal & advance automatically</p>
            </div>
            <button
              onClick={() => {
                const gameDocRef = getGameDocPath(db, gameCode);
                updateDoc(gameDocRef, { autoHost: !autoHostEnabled });
              }}
              className={`px-4 py-2 rounded-lg font-bold transition ${autoHostEnabled ? "bg-green-500 text-white" : "bg-gray-700 text-gray-300"
                }`}
            >
              {autoHostEnabled ? "On" : "Off"}
            </button>
          </div>

          {!revealed ? (
            <button
              onClick={handleRevealAnswer}
              className="flex-1 p-4 bg-yellow-500 text-gray-900 font-extrabold text-xl rounded-xl hover:bg-yellow-600 transition shadow-lg"
            >
              Reveal Answer
            </button>
          ) : isLastQuestion ? (
            <button
              onClick={handleEndGame}
              className="flex-1 p-4 bg-red-500 text-white font-extrabold text-xl rounded-xl hover:bg-red-600 transition shadow-lg"
            >
              End Game & Show Results
            </button>
          ) : (
            <button
              onClick={handleNextQuestion}
              className="flex-1 p-4 bg-indigo-500 text-white font-extrabold text-xl rounded-xl hover:bg-indigo-600 transition shadow-lg"
            >
              Next Question →
            </button>
          )}
        </div>

        <button
          onClick={handleReturnToLobby}
          className="w-full p-3 bg-gray-800 border border-red-500/60 text-red-200 font-bold rounded-xl hover:bg-red-500/10 transition shadow-inner"
        >
          Stop Game & Return to Lobby
        </button>

        {autoHostEnabled && revealed && nextQuestionCountdown !== null && (
          <div className="text-center text-sm text-gray-300">
            {isLastQuestion ? "Showing results in" : "Next question in"}{" "}
            <span className="font-bold text-yellow-400">{nextQuestionCountdown}s</span>
          </div>
        )}
      </div>
    </div>
  );
}
