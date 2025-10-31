import React from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import LandingPage from '../LandingPage.jsx';
import TriviaGame from '../TriviaGame.jsx';

const App = () => {
    return (
        <Router>
            <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/game" element={<TriviaGame />} />
                <Route path="/game/:code" element={<TriviaGame prefillFromRoute={true} />} />
            </Routes>
        </Router>
    );
};

export default App;
