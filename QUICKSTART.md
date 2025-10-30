# 🚀 Quick Start: Get Smartish Running

## TL;DR (5 minutes)

1. **Create Firebase project** at [console.firebase.google.com](https://console.firebase.google.com)
2. **Enable Firestore** (test mode) and **Anonymous Auth**
3. **Copy config** from Project Settings > Your apps > Web
4. **Paste into** `index.html` (replace the YOUR_KEY placeholders)
5. **Deploy rules** from `firestore.rules` 
6. Run `npm run dev` and play!

---

## Detailed Steps

### 1️⃣ Create Firebase Project (2 min)

```bash
# Open Firebase Console
open https://console.firebase.google.com
```

- Click "Add project" 
- Name it (e.g., `trivia-game-yourname`)
- Disable analytics (not needed)
- Click "Create project"

### 2️⃣ Enable Firestore (1 min)

- Left sidebar: **Build** > **Firestore Database**
- Click "Create database"
- Choose **"Start in test mode"** → Next
- Select region → Enable

### 3️⃣ Enable Authentication (1 min)

- Left sidebar: **Build** > **Authentication**
- Click "Get started"
- **Sign-in method** tab → **Anonymous** → Enable → Save

### 4️⃣ Get Your Config (1 min)

- Click ⚙️ gear icon → **Project settings**
- Scroll to "Your apps" → Click **Web** icon `</>`
- Register app (nickname: `trivia-web`)
- **Copy the config object**

Example:
```javascript
const firebaseConfig = {
  apiKey: "AIzaSyA...",
  authDomain: "trivia-game-abc123.firebaseapp.com",
  projectId: "trivia-game-abc123",
  storageBucket: "trivia-game-abc123.firebasestorage.app",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abc123def456"
};
```

### 5️⃣ Update Config (Choose One Method)

#### Method A: Quick (Hardcode in index.html)

Open `index.html` and replace placeholders around line 15:

```javascript
window.__firebase_config = JSON.stringify({
  apiKey: "AIzaSyA...",  // ← paste your actual values
  authDomain: "trivia-game-abc123.firebaseapp.com",
  projectId: "trivia-game-abc123",
  storageBucket: "trivia-game-abc123.firebasestorage.app",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abc123def456"
});
```

#### Method B: Secure (Environment Variables)

```bash
# Create .env.local file
cp .env.example .env.local

# Edit .env.local with your values
# Then restart dev server
```

### 6️⃣ Deploy Security Rules

In Firebase Console:
- **Firestore Database** → **Rules** tab
- Copy content from your local `firestore.rules` file
- Paste and click **Publish**

### 7️⃣ Validate & Run

```bash
# Validate your config
npm run validate

# Start the dev server
npm run dev
```

Open http://localhost:5173

---

## ✅ Testing Your Setup

1. **Create a game** (enter your name, click "Create New Game")
2. **Copy the 4-letter code**
3. Open **incognito window** → http://localhost:5173
4. **Join the game** with the code
5. As host: paste CSV questions OR use AI generator
6. Click "Start Game" and play!

---

## 🐛 Troubleshooting

### "Firebase initialization failed"
- Check console for specific error
- Verify config values are correct (no "YOUR_KEY" placeholders)
- Ensure no trailing commas or syntax errors

### "Missing or insufficient permissions"
- Deploy Firestore rules from `firestore.rules`
- Check Anonymous auth is enabled

### "Network request failed"
- Firebase project must be active
- Check internet connection
- Verify Firestore database is created

### Config validation
```bash
npm run validate
```

---

## 🎮 Next Steps

- **Add AI Questions**: Get Gemini API key from [aistudio.google.com](https://aistudio.google.com/app/apikey)
- **Customize Styling**: Edit Tailwind classes in `TriviaGame.jsx`
- **Deploy**: Use Firebase Hosting or Vercel (see DEPLOYMENT.md - coming soon!)

---

## 💰 Cost Tracking

Firebase free tier is enough for:
- ✅ 100+ concurrent games
- ✅ 500+ players/day  
- ✅ Thousands of questions

Monitor usage:
- Firebase Console → **Usage and billing**
- Set budget alerts at $1 to be safe

---

## 🆘 Need Help?

1. Check `FIREBASE_SETUP.md` for detailed docs
2. Check `ALTERNATIVES.md` for Supabase option
3. Validate config: `npm run validate`
4. Check browser console for errors (F12)

**Most common issue:** Forgot to replace YOUR_KEY placeholders in index.html!
