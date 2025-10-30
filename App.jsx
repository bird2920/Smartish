import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LandingPage from './LandingPage.jsx';
import TriviaGame from './TriviaGame.jsx';

const App = () => {
    return (
        <Router>
            <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/game" element={<TriviaGame />} />
            </Routes>
        </Router>
    );
};

export default App;
