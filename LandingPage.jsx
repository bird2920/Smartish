import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import QuackKingLogo from "./src/components/QuackKingLogo.jsx";
import ReferralModal from "./src/components/ReferralModal.jsx";
import { useReferralNotice } from "./src/hooks/useReferralNotice.js";

const TAGLINES = [
    "Are your friends as smart as they think they are?",
    "Prove your brain isn’t just decorative.",
    "Finally, a way to destroy friendships intelligently.",
    "Your ego called — it wants a rematch.",
    "A trivia game that rewards knowledge… and sarcasm.",
    "Less small talk. More smack talk.",
    "Perfect for people who can’t resist saying ‘actually…’.",
    "It’s like a pub quiz — but the bar is your couch.",
    "No controllers. No downloads. Just chaos.",
];

const LandingPage = () => {
    const navigate = useNavigate();
    const [logoFailed, setLogoFailed] = useState(false);
    const tagline = useMemo(
        () => TAGLINES[Math.floor(Math.random() * TAGLINES.length)],
        []
    );
    const { source, shouldShow, dismiss } = useReferralNotice({ canShow: true });

    return (
        <div className="relative min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white overflow-hidden">
            <div className="absolute inset-0 opacity-60 mix-blend-screen">
                <div className="h-full w-full bg-[radial-gradient(circle_at_20%_20%,rgba(99,102,241,0.12),transparent_30%),radial-gradient(circle_at_80%_10%,rgba(45,212,191,0.08),transparent_25%),radial-gradient(circle_at_20%_80%,rgba(124,58,237,0.08),transparent_22%)] blur-3xl" />
            </div>

            <div className="relative z-10 flex items-center justify-center px-4 py-8 sm:py-10">
                <div className="w-full max-w-5xl text-center space-y-6 sm:space-y-7 md:space-y-9">
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.35em] text-slate-300 shadow-sm">
                        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                        Live party trivia
                    </div>

                    {/* Logo/Title */}
                    <div className="space-y-3">
                        <h1 className="flex justify-center">
                            {!logoFailed ? (
                                <img
                                    src="/QuackKing.svg"
                                    alt="QuackKing logo with crown"
                                    onError={() => setLogoFailed(true)}
                                    className="h-14 sm:h-18 md:h-24 drop-shadow-[0_15px_45px_rgba(99,102,241,0.25)]"
                                />
                            ) : (
                                <QuackKingLogo className="text-5xl sm:text-6xl md:text-7xl font-black text-white tracking-tight drop-shadow-[0_15px_45px_rgba(99,102,241,0.25)]" />
                            )}
                        </h1>
                        <p className="text-xl sm:text-2xl text-slate-200 font-semibold">{tagline}</p>
                    </div>

                    {/* Description */}
                    <div className="bg-white/5 backdrop-blur-2xl rounded-3xl p-5 sm:p-8 shadow-[0_25px_120px_-35px_rgba(99,102,241,0.4)] border border-white/10 space-y-5 sm:space-y-7">
                        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 sm:gap-7 max-w-4xl mx-auto">
                            <div className="relative flex-shrink-0">
                                <div className="absolute inset-[-10px] sm:inset-[-14px] rounded-full bg-gradient-to-br from-amber-300/40 via-orange-300/20 to-amber-500/20 blur-2xl" />
                                <img
                                    src="/FavoriteDuck.svg"
                                    alt="QuackKing mascot duck wearing a crown"
                                    className="relative w-28 sm:w-30 drop-shadow-[0_12px_35px_rgba(0,0,0,0.35)]"
                                />
                            </div>
                            <p className="text-lg sm:text-xl leading-relaxed text-white/90">
                                Host a live trivia battle in seconds. Spin up a lobby, have friends join with a four-letter code on their phones, and run fast rounds with instant scoring using your CSV packs or AI-made questions.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5 space-y-1.5 shadow-lg">
                                <div className="text-4xl">🎮</div>
                                <h3 className="text-lg font-bold text-yellow-200">Easy to Play</h3>
                                <p className="text-sm text-slate-400">Share a 4-letter code and jump in.</p>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5 space-y-1.5 shadow-lg">
                                <div className="text-4xl">⚡</div>
                                <h3 className="text-lg font-bold text-yellow-200">Real-Time</h3>
                                <p className="text-sm text-slate-400">Fast scoring, instant leaderboards.</p>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5 space-y-1.5 shadow-lg">
                                <div className="text-4xl">🎯</div>
                                <h3 className="text-lg font-bold text-yellow-200">Time-Based</h3>
                                <p className="text-sm text-slate-400">30-second rounds with bonus points.</p>
                            </div>
                        </div>

                        <div className="grid sm:grid-cols-3 gap-3 sm:gap-4 text-sm text-slate-400">
                            <div className="rounded-2xl border border-white/5 bg-white/5 px-4 py-3">1) Host a lobby</div>
                            <div className="rounded-2xl border border-white/5 bg-white/5 px-4 py-3">2) Share the code</div>
                            <div className="rounded-2xl border border-white/5 bg-white/5 px-4 py-3">3) Battle for bragging rights</div>
                        </div>
                    </div>

                    {/* CTA Button */}
                    <div className="flex flex-col items-center gap-2">
                        <button
                            onClick={() => navigate('/game')}
                            className="bg-gradient-to-r from-yellow-300 via-amber-200 to-orange-400 hover:from-yellow-200 hover:to-orange-300 text-slate-950 font-black text-2xl sm:text-3xl px-12 py-5 rounded-2xl shadow-2xl transform hover:scale-105 transition-all duration-200 border-2 border-yellow-200"
                        >
                            Start Playing Now
                        </button>
                        <p className="text-slate-400 text-sm">
                            Upload your own questions via CSV or let AI generate them for you.
                        </p>
                    </div>
                </div>
            </div>

            <ReferralModal isOpen={shouldShow} onClose={dismiss} source={source} />
        </div>
    );
};

export default LandingPage;
