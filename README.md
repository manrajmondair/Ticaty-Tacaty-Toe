<p align="center">
  <img src="https://img.shields.io/badge/Vanilla-HTML%2FCSS%2FJS-gold?style=for-the-badge" alt="Vanilla Stack"/>
  <img src="https://img.shields.io/badge/Zero-Dependencies-blueviolet?style=for-the-badge" alt="No Dependencies"/>
  <img src="https://img.shields.io/badge/ES-Modules-darkgreen?style=for-the-badge" alt="ES Modules"/>
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

## Play

**[ticatytacatytoe.vercel.app](https://ticatytacatytoe.vercel.app/)** — jump straight in, no setup needed.

#### Run Locally

Want to tweak the code or play offline? Clone and serve:

```bash
git clone https://github.com/manrajmondair/Ticaty-Tacaty-Toe.git
cd Ticaty-Tacaty-Toe
./serve.sh
```

Open **http://localhost:8080** in your browser. ES modules require a local server — `python3 -m http.server 8080` works too.

## Stack

Pure vanilla — no frameworks, no build tools, no dependencies.

```
index.html          Single page, four screens
styles.css          Dark theme, CSS Grid, spell animations
js/
  constants.js      Game enums and configuration
  gameState.js      State model, move logic, win detection
  board.js          DOM rendering and visual sync
  spells.js         Spell validation and execution
  ai.js             Three-tier AI engine
  ui.js             Screen management and event handling
  main.js           Entry point
```

## License

MIT

---

<p align="center">
  <sub>Built with dark magic and vanilla JavaScript.</sub>
</p>
