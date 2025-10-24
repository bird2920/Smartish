# Testing Multiplayer - How to Add Multiple Players

## The Issue
Each browser/device gets ONE Firebase anonymous auth user ID. If you:
- Open multiple tabs in the same browser → Same user ID (overwrites player)
- Open incognito window → NEW user ID ✅
- Use different browser → NEW user ID ✅
- Use different device → NEW user ID ✅

## ✅ How to Test with Multiple Players

### Option 1: Different Browsers (Same Computer)
1. **Host**: Open in Chrome → Create game
2. **Player 1**: Open in Firefox → Join game
3. **Player 2**: Open in Safari → Join game
4. **Player 3**: Open in Edge → Join game

### Option 2: Incognito/Private Windows
1. **Host**: Regular Chrome → Create game
2. **Player 1**: Chrome Incognito Window → Join game
3. **Player 2**: New Chrome Incognito Window → Join game
   - **Important**: Each incognito window must be fully separate
   - On Mac: Cmd+Shift+N for each new window
   - On Windows: Ctrl+Shift+N for each new window

### Option 3: Different Devices (Best Test)
1. **Host**: Your computer → Create game
2. **Player 1**: Your phone → Join game
3. **Player 2**: Friend's phone → Join game
4. **Player 3**: Tablet → Join game

### Option 4: Network Access (For Real Testing)
Make your dev server accessible on your local network:

\`\`\`bash
# Stop current server (Ctrl+C)
# Restart with network access
npm run dev -- --host
\`\`\`

Then find your local IP:
\`\`\`bash
# Mac/Linux:
ifconfig | grep "inet " | grep -v 127.0.0.1

# Windows:
ipconfig
\`\`\`

Players can join from any device on same WiFi:
- Your computer: http://localhost:5173
- Other devices: http://192.168.1.XXX:5173 (use your actual IP)

## Why This Happens

Firebase Anonymous Auth creates ONE user per browser session:
- Same browser tab = same user ❌
- Same regular browser windows = same user ❌
- Different incognito windows = different users ✅
- Different browsers = different users ✅
- Different devices = different users ✅

## Alternative: Allow Multiple Players per Browser

If you want to test easily from one browser, I can modify the code to generate random player IDs instead of using Firebase auth userId. This would let you join the same game multiple times from different tabs.

Would you like me to implement that option for easier testing?
