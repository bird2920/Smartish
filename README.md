# 🎮 Smartish - Real-time Multiplayer Trivia Game

A Jackbox-style multiplayer game with real-time synchronization, built with React and Firebase.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Firebase](https://img.shields.io/badge/firebase-10.12-orange.svg)
![React](https://img.shields.io/badge/react-18.2-blue.svg)

## ✨ Features

- 🎯 **Real-time Multiplayer** - Players join with a 4-letter room code
- 🤖 **AI Question Generation** - Generate trivia questions from any topic using Gemini
- 📝 **CSV Upload** - Bring your own questions in CSV format
- 🏆 **Live Scoring** - Automatic scoring and leaderboard
- 🎨 **Beautiful UI** - Dark theme with Tailwind CSS
- 📱 **Responsive** - Works on desktop and mobile
- 🔒 **Secure** - Firebase security rules protect game integrity

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Firebase account (free tier works great!)

### Setup

```bash
# Install dependencies
npm install

# Follow Firebase setup guide
# See QUICKSTART.md for detailed instructions

# Start development server
npm run dev
```

Open http://localhost:5173 and create your first game!

## 📖 Documentation

- **[QUICKSTART.md](./QUICKSTART.md)** - Get running in 5 minutes
- **[FIREBASE_SETUP.md](./FIREBASE_SETUP.md)** - Detailed Firebase configuration
- **[ALTERNATIVES.md](./ALTERNATIVES.md)** - Supabase and other options
- **[firestore.rules](./firestore.rules)** - Security rules (must deploy!)

## 🎮 How to Play

### As Host:

1. Enter your name and click **"Create New Game"**
2. Share the 4-letter code with players
3. Upload questions via CSV **OR** generate AI questions
4. Wait for players to join
5. Click **"Start Game"**
6. Control game flow, reveal answers, move to next question

### As Player:

1. Enter your name and the game code
2. Click **"Join Game"**
3. Wait in lobby for host to start
4. Answer questions as they appear
5. See your score on the leaderboard!

## 📝 Question Formats

### CSV Format

```csv
Question, Correct Answer, Option 1, Option 2, Option 3
What is the capital of France?, Paris, London, Berlin, Madrid
Who painted the Mona Lisa?, Leonardo da Vinci, Michelangelo, Raphael, Donatello
```

### AI Generation

Simply enter a topic like:
- "90s pop culture"
- "US History"
- "Science and Nature"
- "Movies from 2020"

The AI generates 5 questions automatically!

## 🛠️ Tech Stack

- **Frontend**: React 18, Vite
- **Styling**: Tailwind CSS 3
- **Backend**: Firebase Firestore (real-time database)
- **Auth**: Firebase Anonymous Authentication
- **AI**: Google Gemini 2.5 Flash (optional)

## 📁 Project Structure

```
trivia-game/
├── TriviaGame.jsx        # Main React component (single file!)
├── main.jsx              # Entry point
├── index.html            # HTML template with Firebase config
├── index.css             # Tailwind directives
├── firestore.rules       # Firebase security rules
├── tailwind.config.cjs   # Tailwind configuration
├── postcss.config.cjs    # PostCSS configuration
└── package.json          # Dependencies
```

## 🔧 Configuration

### Firebase Config

Edit `index.html` (around line 15):

```javascript
window.__firebase_config = JSON.stringify({
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  // ... etc
});
```

Or use environment variables in `.env.local`:

```env
VITE_FIREBASE_API_KEY=your_key
VITE_FIREBASE_PROJECT_ID=your_project
# ... etc
```

### Validate Configuration

```bash
npm run validate
```

## 🔒 Security

- ✅ Firestore security rules prevent score tampering
- ✅ Anonymous authentication required
- ✅ Only host can control game flow
- ✅ Players can only update their own answers

**Important**: Deploy `firestore.rules` to Firebase Console!

## 🌐 Deployment

### Firebase Hosting (Recommended)

```bash
npm install -g firebase-tools
firebase login
firebase init hosting
npm run build
firebase deploy
```

### Vercel / Netlify

```bash
npm run build
# Deploy the dist/ folder
```

## 💰 Cost

**Firebase Free Tier:**
- 50K reads/day (enough for ~500 players/day)
- 20K writes/day
- 1GB storage
- Unlimited authentication

Perfect for personal projects, parties, and small events!

## 🐛 Troubleshooting

### "Firebase initialization failed"
- Check Firebase config in `index.html`
- Run `npm run validate`

### "Missing permissions"  
- Deploy Firestore rules from Firebase Console
- Enable Anonymous authentication

### Styling not working
- Ensure Tailwind CSS is installed: `npm install -D tailwindcss@^3.4.0`
- Check `tailwind.config.cjs` and `postcss.config.cjs` exist

### More help
Check the browser console (F12) for detailed error messages.

## 🎨 Customization

### Change Colors

Edit `TriviaGame.jsx` and modify Tailwind classes:

```jsx
// Change button colors
className="bg-purple-600 hover:bg-purple-700"
// to
className="bg-blue-600 hover:bg-blue-700"
```

### Add Custom Animations

Edit `tailwind.config.cjs`:

```javascript
animation: {
  'bounce-slow': 'bounce 3s infinite',
}
```

## 🤝 Contributing

Contributions welcome! Feel free to:
- Report bugs
- Suggest features  
- Submit pull requests

## 📄 License

MIT License - feel free to use for personal or commercial projects!

## 🙏 Acknowledgments

- Inspired by Jackbox Games
- Built with Firebase and React
- Powered by Google Gemini AI

---

**Made with ❤️ by [Your Name]**

Happy Trivia! 🎉
