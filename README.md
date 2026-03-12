<p align="center">
  <img src="https://img.shields.io/badge/Vanilla-UI-gold?style=for-the-badge" alt="Vanilla UI"/>
  <img src="https://img.shields.io/badge/Firebase-Realtime%20%2B%20Auth-orange?style=for-the-badge" alt="Firebase Stack"/>
  <img src="https://img.shields.io/badge/Vercel-API%20Routes-black?style=for-the-badge" alt="Vercel APIs"/>
</p>

<h1 align="center">
  <br>
  <sub>&#9651;</sub>
  <br>
  Horcrux Hunter
  <br>
  <sup><sub>An Asymmetric Wizard's Duel</sub></sup>
</h1>

<p align="center">
  <em>Not your ordinary tic-tac-toe.</em><br>
  Ultimate Tic-Tac-Toe meets asymmetric warfare — wrapped in a dark magical aesthetic.
</p>

---

<h3 align="center">
  <a href="https://ticatytacatytoe.vercel.app/">⚡ Play Now</a>
</h3>

---

## The Game

Two wizards. Different goals. Four forbidden spells. One board.

**Harry Potter** must align **3 mini-boards in a row** on a 9-board meta-grid.
**Lord Voldemort** must corrupt **5 out of 9 boards** — no row needed.

Every cell you play sends your opponent to a specific mini-board (Ultimate TTT rules). Strategy runs deep.

## Spells

Each side wields two one-use spells that bend the rules of the game:

| Spell | Side | Effect |
|:------|:-----|:-------|
| **Expelliarmus** | Harry | Remove one of Voldemort's marks |
| **Patronus Shield** | Harry | Protect a board for 2 turns |
| **Avada Kedavra** | Voldemort | Claim two adjacent empty cells |
| **Dark Mark** | Voldemort | Corrupt one of Harry's marks |

Casting a spell consumes your turn. Choose wisely.

## Modes

- **Local Duel** — Two players, one screen
- **Face the Dark Lord** — Play as Harry or Voldemort against an AI opponent
  - *Easy* — Random moves
  - *Medium* — Heuristic evaluation
  - *Hard* — Minimax with alpha-beta pruning and iterative deepening
- **Online Duel** — Free ranked matchmaking with guest accounts, account upgrades, reconnects, and a global leaderboard

## Online Stack

The online mode stays within a no-subscription setup:

- **Vercel Hobby** serves the app and runs the authoritative `/api` routes
- **Firebase Authentication** handles guest sessions and email/password upgrades
- **Firebase Realtime Database** powers presence, matchmaking state, live matches, profiles, and the leaderboard

If the Firebase env vars are missing, the local and AI modes still work and the UI will show online mode as unavailable instead of breaking.

## Play

**[ticatytacatytoe.vercel.app](https://ticatytacatytoe.vercel.app/)** — jump straight in, no setup needed.

#### Run Locally

Want to tweak the code or play locally?

```bash
git clone https://github.com/manrajmondair/Ticaty-Tacaty-Toe.git
cd Ticaty-Tacaty-Toe
cp .env.example .env
npm install
./serve.sh
```

Open **http://127.0.0.1:5173** in your browser.

`./serve.sh` runs the Vite dev server. For the full online stack, run the app through Vercel locally so the API routes are available too:

```bash
vercel dev
```

Add the Firebase values from [.env.example](./.env.example) before testing multiplayer, and publish the rules from [firebase.database.rules.json](./firebase.database.rules.json) to your Firebase Realtime Database project.

## Environment Variables

The browser build uses:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_DATABASE_URL`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`

The Vercel API routes use:

- `FIREBASE_DATABASE_URL`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

## Firebase Setup Checklist

Before online mode can work in production, set up one free Firebase Spark project:

1. Create a Firebase project and add a **Web App** to it.
2. Enable **Authentication** providers:
   - Anonymous
   - Email/Password
3. Create a **Realtime Database** and start it in locked mode.
4. Publish the rules from [firebase.database.rules.json](./firebase.database.rules.json).
5. Copy the Firebase web app config into the `VITE_FIREBASE_*` variables.
6. Create a Firebase service account and copy its values into:
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY`
   - `FIREBASE_DATABASE_URL`
7. Add those same environment variables to Vercel for Production.

After that, pushing to `main` should trigger a fresh Vercel deployment and the online mode will be able to use guest accounts, matchmaking, reconnects, and the leaderboard.

## Stack

Vanilla UI with a light build step for the Firebase client SDK and Vercel API routes.

```
index.html          Single-page app with title, setup, online lobby, game, and leaderboard screens
styles.css          Dark theme, game board, online lobby, and leaderboard styling
api/                Vercel API routes for profiles, matchmaking, and authoritative match actions
tests/              Shared engine and ranking tests
js/
  constants.js      Game enums and configuration
  gameState.js      State model, move logic, win detection
  engine.js         Shared action interpreter for client and server
  board.js          DOM rendering and visual sync
  spells.js         Spell validation and execution
  ai.js             Three-tier AI engine
  firebaseClient.js Firebase browser SDK bootstrap and subscriptions
  online.js         Online session, queue, match, and leaderboard client
  ui.js             Screen management and all local/AI/online event handling
  main.js           Entry point
```

## License

MIT

---

<p align="center">
  <sub>Built with dark magic and vanilla JavaScript.</sub>
</p>
