import React from "react";
import { useNavigate } from "react-router-dom";

const LandingPage = () => {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center p-4">
            <div className="max-w-4xl w-full text-center space-y-8 animate-fade-in">
                {/* Logo/Title */}
                <div className="space-y-4">
                    <h1 className="text-6xl sm:text-7xl md:text-8xl font-extrabold text-white tracking-tight">
                        Smartish
                    </h1>
                    <p className="text-2xl sm:text-3xl text-indigo-200 font-semibold">
                        The Jackbox-Style Trivia Game
                    </p>
                </div>

                {/* Description */}
                <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 sm:p-12 shadow-2xl border border-white/20">
                    <div className="space-y-6 text-white">
                        <p className="text-lg sm:text-xl leading-relaxed">
                            Host multiplayer trivia games with your friends! One person hosts, 
                            everyone else joins with a simple code, and compete in real-time 
                            on your own devices.
                        </p>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-6">
                            <div className="space-y-2">
                                <div className="text-5xl">🎮</div>
                                <h3 className="text-xl font-bold text-yellow-300">Easy to Play</h3>
                                <p className="text-sm text-indigo-200">Join with a 4-letter code</p>
                            </div>
                            <div className="space-y-2">
                                <div className="text-5xl">⚡</div>
                                <h3 className="text-xl font-bold text-yellow-300">Real-Time</h3>
                                <p className="text-sm text-indigo-200">Live scoring & competition</p>
                            </div>
                            <div className="space-y-2">
                                <div className="text-5xl">🎯</div>
                                <h3 className="text-xl font-bold text-yellow-300">Time-Based</h3>
                                <p className="text-sm text-indigo-200">30-second rounds with bonus points</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* CTA Button */}
                <button
                    onClick={() => navigate('/game')}
                    className="bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-500 hover:to-orange-600 text-gray-900 font-extrabold text-2xl sm:text-3xl px-12 py-6 rounded-2xl shadow-2xl transform hover:scale-105 transition-all duration-200 border-4 border-yellow-300"
                >
                    Start Playing Now! 🚀
                </button>

                {/* Footer */}
                <p className="text-indigo-300 text-sm">
                    Upload your own questions via CSV or let AI generate them for you
                </p>
            </div>
        </div>
    );
};

export default LandingPage;