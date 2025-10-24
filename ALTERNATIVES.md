# Free Alternative: Supabase Setup

## Why Supabase?

**Supabase Free Tier:**
- ✅ 500MB database storage
- ✅ Unlimited API requests
- ✅ 50,000 monthly active users
- ✅ Real-time subscriptions
- ✅ No daily limits (vs Firebase's 50K reads/day)
- ✅ Open source

**Better for:** Higher traffic, more games, cost-conscious projects

---

## Quick Setup (10 minutes)

### Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Sign up (free, no credit card)
3. Click "New Project"
4. Enter:
   - Name: `trivia-game`
   - Database Password: (save this!)
   - Region: (closest to users)
5. Wait 2-3 minutes for provisioning

### Step 2: Create Database Schema

1. In Supabase Dashboard: **SQL Editor**
2. Click "New query"
3. Paste this schema:

\`\`\`sql
-- Create games table
CREATE TABLE games (
  game_code TEXT PRIMARY KEY,
  host_user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'LOBBY',
  questions JSONB DEFAULT '[]'::jsonb,
  current_question_index INTEGER DEFAULT -1,
  current_question_start_time BIGINT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create players table
CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_code TEXT NOT NULL REFERENCES games(game_code) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  score INTEGER DEFAULT 0,
  is_host BOOLEAN DEFAULT false,
  last_answer TEXT,
  timestamp BIGINT NOT NULL,
  UNIQUE(game_code, user_id)
);

-- Enable real-time
ALTER PUBLICATION supabase_realtime ADD TABLE games;
ALTER PUBLICATION supabase_realtime ADD TABLE players;

-- Row Level Security (RLS)
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;

-- Games policies
CREATE POLICY "Anyone can read games" ON games FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create games" ON games FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Host can update their game" ON games FOR UPDATE USING (auth.uid() = host_user_id);
CREATE POLICY "Host can delete their game" ON games FOR DELETE USING (auth.uid() = host_user_id);

-- Players policies
CREATE POLICY "Anyone can read players" ON players FOR SELECT USING (true);
CREATE POLICY "Users can create their player doc" ON players FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their player doc" ON players FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Anyone can delete players" ON players FOR DELETE USING (true);
\`\`\`

4. Click "Run"

### Step 3: Get API Keys

1. Go to **Project Settings** > **API**
2. Copy:
   - Project URL (e.g., `https://xxxxx.supabase.co`)
   - `anon` public key

### Step 4: Install Supabase Client

\`\`\`bash
npm install @supabase/supabase-js
\`\`\`

### Step 5: Create Supabase Adapter

I'll create a version of TriviaGame.jsx that works with Supabase...

(Would you like me to create the full Supabase version? It's about 200 lines of changes to swap Firebase for Supabase.)

---

## Comparison: Firebase vs Supabase

| Feature | Firebase (Free) | Supabase (Free) |
|---------|----------------|-----------------|
| Daily Reads | 50K | Unlimited |
| Daily Writes | 20K | Unlimited |
| Storage | 1GB | 500MB |
| Real-time | ✅ | ✅ |
| Auth | ✅ | ✅ |
| Setup Time | 5 min | 10 min |
| SQL Access | ❌ | ✅ |
| Self-hostable | ❌ | ✅ |

**Recommendation:**
- **Firebase**: Easier setup, better for beginners
- **Supabase**: Better limits, more control, growing ecosystem

---

## My Suggestion for This Project

**Start with Firebase** because:
1. Your code is already written for it
2. 5-minute setup vs 30 minutes of code refactoring
3. 50K reads/day is plenty for testing and small-medium games
4. You can always migrate to Supabase later if you hit limits

Just follow `FIREBASE_SETUP.md` and you'll be running in 5 minutes!
