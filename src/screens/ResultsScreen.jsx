import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getGameDocPath,
  getPlayersCollectionPath,
  getPlayerDocPath,
} from "../helpers/firebasePaths";
import { getDocs, deleteDoc, updateDoc, writeBatch } from "firebase/firestore";
import { persistGameStats } from "../helpers/userStats";
import QuackKingLogo from "../components/QuackKingLogo.jsx";

export default function ResultsScreen({
  db,
  gameCode,
  lobbyState,
  players,
  isHost,
  userId,
  authUser,
  setGameCode,
  setMode,
  onRequestAccount,
}) {
  // 🧮 Sort players by score, excluding host
  const sortedPlayers = useMemo(
    () => players.filter((p) => !p.isHost).sort((a, b) => b.score - a.score),
    [players]
  );
  const playerRecord = useMemo(
    () => players.find((p) => p.id === userId),
    [players, userId]
  );
  const placement = useMemo(() => {
    if (!playerRecord || playerRecord.isHost) return null;
    const index = sortedPlayers.findIndex((p) => p.id === userId);
    return index === -1 ? null : index + 1;
  }, [playerRecord, sortedPlayers, userId]);
  const [saveStatus, setSaveStatus] = useState("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const [logoFailed, setLogoFailed] = useState(false);
  const isSignedIn = Boolean(authUser) && !authUser?.isAnonymous;
  const playerSnapshotRef = useRef(null);
  const placementRef = useRef(null);

  useEffect(() => {
    if (playerRecord) {
      playerSnapshotRef.current = playerRecord;
    }
  }, [playerRecord]);

  useEffect(() => {
    placementRef.current = placement;
  }, [placement]);

  const latestPlayerRecord = playerRecord || playerSnapshotRef.current;

  // 🧹 End Game and clean up Firestore docs
  const handleEndGame = async () => {
    if (!isHost || !db || !gameCode) return;

    try {
      // Delete player documents
      const playersColRef = getPlayersCollectionPath(db, gameCode);
      const playerDocs = await getDocs(playersColRef);
      await Promise.all(playerDocs.docs.map((d) => deleteDoc(d.ref)));

      // Delete game document
      const gameDocRef = getGameDocPath(db, gameCode);
      await deleteDoc(gameDocRef);

      // Reset to home
      setGameCode("");
      setMode("HOME");
    } catch (e) {
      console.error("❌ Error ending game:", e);
    }
  };

  // 🔄 Start New Round - keep players and questions
  const handleNewRound = async () => {
    if (!isHost || !db || !gameCode) return;

    try {
      // Reset all player scores and answers
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

      // Reset game state to lobby
      const gameDocRef = getGameDocPath(db, gameCode);
      await updateDoc(gameDocRef, {
        status: "LOBBY",
        currentQuestionIndex: 0,
        currentQuestionStartTime: null,
        answerRevealed: false,
        lastHostActivity: Date.now(),
      });
    } catch (e) {
      console.error("❌ Error starting new round:", e);
    }
  };

  const handlePersistStats = useCallback(async () => {
    const record = latestPlayerRecord;
    if (!db || !userId || !record) return;
    setSaveStatus("saving");
    setSaveMessage("");
    try {
      await persistGameStats({
        db,
        userId,
        playerRecord: record,
        placement: placement ?? placementRef.current ?? null,
        gameCode,
        playerName: record?.name ?? null,
        theme: lobbyState?.theme ?? null,
      });
      setSaveStatus("success");
      setSaveMessage("Saved! Your stats are now tracked for future games.");
    } catch (e) {
      console.error("❌ Error saving stats:", e);
      setSaveStatus("error");
      setSaveMessage("Could not save stats. Please try again.");
    }
  }, [db, gameCode, lobbyState?.theme, placement, playerRecord, userId]);

  const handleSaveClick = () => {
    if (!latestPlayerRecord) {
      setSaveMessage("No player stats were recorded for you.");
      setSaveStatus("error");
      return;
    }

    if (!isSignedIn) {
      onRequestAccount?.({
        mode: "signup",
        onSuccess: () => {
          setTimeout(() => {
            handlePersistStats();
          }, 0);
        },
      });
      return;
    }

    handlePersistStats();
  };

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
      <div className="w-full max-w-4xl mx-auto space-y-8">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 py-1 text-xs uppercase tracking-[0.35em] text-slate-300">
            <span role="img" aria-label="trophy">🏁</span>
            Final Results
          </div>
          <h1 className="text-4xl md:text-5xl font-black">
            Game Over — <span className="text-yellow-300">{gameCode}</span>
          </h1>
          <p className="text-slate-400">Great run! See how everyone stacked up below.</p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl p-6 shadow-[0_25px_120px_-35px_rgba(99,102,241,0.4)]">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-purple-100/80">Leaderboard</p>
              <h2 className="text-3xl font-extrabold">Top Players</h2>
            </div>
            <div className="text-sm text-slate-400">
              {sortedPlayers.length} player{sortedPlayers.length === 1 ? "" : "s"} ranked
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {sortedPlayers.length === 0 && (
              <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 px-5 py-6 text-center text-purple-100/70">
                No player stats recorded yet.
              </div>
            )}
            {sortedPlayers.map((p, index) => {
              const answered = p.answeredCount || 0;
              const correct = p.correctCount || 0;
              const incorrect = answered - correct;
              const isFirst = index === 0;
              const isSecond = index === 1;
              const isThird = index === 2;
              const cardGradient = isFirst
                ? "from-yellow-200 via-yellow-400 to-amber-500 text-slate-900"
                : isSecond
                  ? "from-slate-100/80 via-slate-200/70 to-slate-300/60 text-slate-900"
                  : isThird
                    ? "from-amber-200/60 via-orange-200/50 to-orange-300/50 text-slate-900"
                    : "from-white/10 to-white/5 text-white";
              const chipBg = isFirst || isSecond || isThird ? "bg-white/30 text-slate-900" : "bg-white/10 text-purple-100";
              return (
                <div
                  key={p.id}
                  className={`rounded-2xl border border-white/10 bg-gradient-to-r ${cardGradient} px-5 py-4 shadow-2xl shadow-black/30`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <span className="text-3xl font-black tracking-tight">{index + 1}</span>
                        <span className="text-lg font-bold truncate">{p.name}</span>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide">
                        <span className={`rounded-full px-3 py-1 ${chipBg}`}>
                          {p.score.toLocaleString()} pts
                        </span>
                        <span className="rounded-full bg-green-500/20 px-3 py-1 text-green-100">
                          ✅ {correct}
                        </span>
                        <span className="rounded-full bg-rose-500/20 px-3 py-1 text-rose-100">
                          ❌ {incorrect}
                        </span>
                        <span className="rounded-full bg-amber-500/20 px-3 py-1 text-amber-100">
                          ↺ {answered}
                        </span>
                      </div>
                    </div>
                    {isFirst && (
                      <div className="text-4xl" role="img" aria-label="champion">🏆</div>
                    )}
                    {isSecond && !isFirst && (
                      <div className="text-4xl" role="img" aria-label="medal">🥈</div>
                    )}
                    {isThird && !isFirst && !isSecond && (
                      <div className="text-4xl" role="img" aria-label="medal">🥉</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl p-6 shadow-[0_25px_120px_-35px_rgba(99,102,241,0.4)] text-center space-y-3">
          <h3 className="text-2xl font-bold">Keep this run forever</h3>
          <p className="text-purple-100/80">
            {isSignedIn
              ? "Store this game in your profile and build a streak."
              : "Sign up (or sign in) to save your score, answers, and games played."}
          </p>
          <button
            onClick={handleSaveClick}
            disabled={saveStatus === "saving" || !latestPlayerRecord}
            className="w-full rounded-2xl bg-gradient-to-r from-yellow-400 to-orange-500 px-6 py-4 text-lg font-semibold text-slate-900 shadow-xl shadow-amber-600/30 transition hover:scale-[1.01] disabled:opacity-60"
          >
            {saveStatus === "saving"
              ? "Saving..."
              : isSignedIn
                ? "Save this game"
                : "Sign up & save"}
          </button>
          {saveMessage && (
            <p
              className={`text-sm ${saveStatus === "success" ? "text-green-300" : "text-rose-200"
                }`}
            >
              {saveMessage}
            </p>
          )}
          {!latestPlayerRecord && (
            <p className="text-sm text-rose-200">
              We couldn&apos;t find your player record for this game.
            </p>
          )}
        </div>

        {isHost ? (
          <div className="grid gap-4 md:grid-cols-2">
            <button
              onClick={handleNewRound}
              className="rounded-2xl border border-green-300/40 bg-gradient-to-r from-emerald-400/80 to-green-500/70 px-6 py-4 text-lg font-bold text-white shadow-xl shadow-emerald-900/40 transition hover:scale-[1.01]"
            >
              🔄 New Round (keep everyone)
            </button>
            <button
              onClick={handleEndGame}
              className="rounded-2xl border border-rose-400/40 bg-gradient-to-r from-rose-500/80 to-red-600/80 px-6 py-4 text-lg font-bold text-white shadow-xl shadow-rose-900/40 transition hover:scale-[1.01]"
            >
              Close Room & Reset
            </button>
          </div>
        ) : (
          <p className="text-center text-slate-300 text-lg">
            Waiting for the host to start a new round or end the game...
          </p>
        )}
      </div>
    </div>
  );
}
