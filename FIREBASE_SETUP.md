# Firebase Setup Guide

## Step 1: Create Firebase Project (5 minutes)

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click "Add project" or "Create a project"
3. Enter project name (e.g., `trivia-game-2025`)
4. Disable Google Analytics (optional, not needed for this project)
5. Click "Create project"

## Step 2: Enable Firestore Database

1. In left sidebar: **Build** > **Firestore Database**
2. Click "Create database"
3. Choose **Start in test mode** (we'll add rules next)
4. Select a location (choose closest to your users, e.g., `us-central1`)
5. Click "Enable"

## Step 3: Enable Authentication

1. In left sidebar: **Build** > **Authentication**
2. Click "Get started"
3. Go to **Sign-in method** tab
4. Click **Anonymous**
5. Toggle "Enable" and click "Save"

## Step 4: Get Your Firebase Config

1. Click the gear icon ⚙️ next to "Project Overview"
2. Select "Project settings"
3. Scroll to "Your apps" section
4. Click the **Web** icon `</>`
5. Register app with a nickname (e.g., `trivia-web`)
6. Copy the `firebaseConfig` object

It will look like:
```javascript
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

## Step 5: Update index.html

Open `index.html` and replace the placeholder config:

```html
window.__firebase_config = JSON.stringify({
  apiKey: "YOUR_ACTUAL_KEY_HERE",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
});
```

## Step 6: Deploy Security Rules

1. In Firebase Console: **Firestore Database** > **Rules** tab
2. Replace the content with the rules from `firestore.rules`:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /artifacts/{appId}/public/data/games/{gameCode} {
      // Anyone can read game state
      allow read: if true;
      
      // Authenticated users can create games
      allow create: if request.auth != null;
      
      // Only the host can update game state
      allow update: if request.auth != null && 
                       request.auth.uid == resource.data.hostUserId;
      
      // Only the host can delete the game
      allow delete: if request.auth != null && 
                       request.auth.uid == resource.data.hostUserId;
      
      match /players/{playerId} {
        // Anyone can read player data
        allow read: if true;
        
        // Only create your own player document
        allow create: if request.auth != null && 
                         request.auth.uid == playerId;
        
        // Only update your own player document (and can't change score)
        allow update: if request.auth != null && 
                         request.auth.uid == playerId &&
                         request.resource.data.score == resource.data.score;
        
        // Host can delete any player (kick/cleanup)
        allow delete: if request.auth != null;
      }
    }
  }
}
```

3. Click "Publish"

## Step 7: Test Your Game

1. Ensure `npm run dev` is running
2. Open http://localhost:5173
3. You should see no Firebase errors in the console
4. Try creating a game and joining with another browser tab

## Optional: Add Gemini API Key (for AI question generation)

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Click "Create API Key"
3. Copy the key
4. Add to `index.html`:
   ```javascript
   window.GEMINI_API_KEY = "YOUR_GEMINI_KEY_HERE";
   ```

**Note:** For production, move API keys to a backend proxy for security!

## Cost Monitoring

Firebase Spark Plan (Free) includes:
- ✅ 50K Firestore reads/day
- ✅ 20K Firestore writes/day
- ✅ 1GB storage
- ✅ Unlimited authentication

This is enough for:
- ~100 concurrent games
- ~500 players/day
- Multiple games per day

To monitor usage:
1. Firebase Console > **Usage and billing**
2. Set up budget alerts if needed

## Troubleshooting

**"Missing or insufficient permissions"**
- Check that Firestore rules are published
- Verify Anonymous auth is enabled

**"Firebase not initialized"**
- Check that config is valid JSON in index.html
- Open browser console for specific errors

**"Network error"**
- Check Firebase project is active
- Verify Firestore database is created
