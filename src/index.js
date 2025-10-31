import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from '../TriviaGame.jsx';
import '../index.css'; // if Tailwind/global styles exist

// Entry point: mounts the Smartish trivia application.
// HashRouter used to support static hosting without server-side rewrites.

const container = document.getElementById('root');
if (!container) {
	throw new Error('Root container #root not found in index.html');
}

const root = createRoot(container);
root.render(
	<React.StrictMode>
		<HashRouter>
			<App prefillFromRoute={true} />
		</HashRouter>
	</React.StrictMode>
);
