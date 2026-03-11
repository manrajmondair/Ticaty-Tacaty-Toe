import { HARRY, VOLDEMORT, EMPTY, DRAW, TOTAL_BOARDS, TOTAL_CELLS } from './constants.js';

export function renderBoard(containerEl) {
  containerEl.innerHTML = '';
  for (let bi = 0; bi < TOTAL_BOARDS; bi++) {
    const miniBoard = document.createElement('div');
    miniBoard.classList.add('mini-board');
    miniBoard.dataset.board = bi;

    for (let ci = 0; ci < TOTAL_CELLS; ci++) {
      const cell = document.createElement('div');
      cell.classList.add('cell');
      cell.dataset.board = bi;
      cell.dataset.cell = ci;
      miniBoard.appendChild(cell);
    }

    const overlay = document.createElement('div');
    overlay.classList.add('board-overlay');
    miniBoard.appendChild(overlay);

    const shieldOverlay = document.createElement('div');
    shieldOverlay.classList.add('shield-overlay');
    miniBoard.appendChild(shieldOverlay);

    containerEl.appendChild(miniBoard);
  }
}

export function updateBoard(state, prevState) {
  for (let bi = 0; bi < TOTAL_BOARDS; bi++) {
    const miniBoardEl = document.querySelector(`.mini-board[data-board="${bi}"]`);
    if (!miniBoardEl) continue;

    // Update cells
    for (let ci = 0; ci < TOTAL_CELLS; ci++) {
      if (prevState && state.boards[bi][ci] === prevState.boards[bi][ci]) continue;

      const cellEl = miniBoardEl.querySelector(`.cell[data-cell="${ci}"]`);
      cellEl.classList.remove('harry-mark', 'voldemort-mark', 'taken', 'mark-appear');

      if (state.boards[bi][ci] === HARRY) {
        cellEl.classList.add('harry-mark', 'taken');
        if (!prevState || prevState.boards[bi][ci] !== HARRY) {
          cellEl.classList.add('mark-appear');
        }
      } else if (state.boards[bi][ci] === VOLDEMORT) {
        cellEl.classList.add('voldemort-mark', 'taken');
        if (!prevState || prevState.boards[bi][ci] !== VOLDEMORT) {
          cellEl.classList.add('mark-appear');
        }
      }
    }

    // Board winner overlay
    miniBoardEl.classList.remove('won-harry', 'won-voldemort', 'board-draw');
    const overlay = miniBoardEl.querySelector('.board-overlay');
    overlay.classList.remove('active');
    overlay.textContent = '';

    if (state.boardWinners[bi] === HARRY) {
      miniBoardEl.classList.add('won-harry');
      overlay.classList.add('active');
      overlay.textContent = '\u26A1'; // lightning bolt
    } else if (state.boardWinners[bi] === VOLDEMORT) {
      miniBoardEl.classList.add('won-voldemort');
      overlay.classList.add('active');
      overlay.textContent = '\u2620'; // skull
    } else if (state.boardWinners[bi] === DRAW) {
      miniBoardEl.classList.add('board-draw');
      overlay.classList.add('active');
      overlay.textContent = '\u2014'; // em dash
    }

    // Active board highlighting
    miniBoardEl.classList.remove('active-target', 'inactive-target');
    if (!state.gameOver && state.boardWinners[bi] === EMPTY) {
      if (state.activeBoard === null || state.activeBoard === bi) {
        miniBoardEl.classList.add('active-target');
      } else {
        miniBoardEl.classList.add('inactive-target');
      }
    }

    // Shield overlay
    const shieldEl = miniBoardEl.querySelector('.shield-overlay');
    const isShielded = state.patronusShields.some(s => s.boardIndex === bi);
    shieldEl.classList.toggle('active', isShielded);
    if (isShielded) {
      const shield = state.patronusShields.find(s => s.boardIndex === bi);
      shieldEl.dataset.turns = Math.ceil(shield.turnsLeft / 2);
    }
  }
}

export function animateSpellEffect(affectedCells, spellKey) {
  return new Promise(resolve => {
    const durations = {
      expelliarmus: 600,
      patronus: 800,
      avadaKedavra: 700,
      darkMark: 500
    };
    const duration = durations[spellKey] || 600;

    affectedCells.forEach(({ board, cell, effect }) => {
      if (cell >= 0) {
        const cellEl = document.querySelector(
          `.cell[data-board="${board}"][data-cell="${cell}"]`
        );
        if (cellEl) {
          cellEl.classList.add(`spell-${spellKey}`);
          setTimeout(() => cellEl.classList.remove(`spell-${spellKey}`), duration);
        }
      }
      if (effect === 'shield') {
        const miniBoardEl = document.querySelector(`.mini-board[data-board="${board}"]`);
        if (miniBoardEl) {
          const shieldEl = miniBoardEl.querySelector('.shield-overlay');
          shieldEl.classList.add('shield-cast');
          setTimeout(() => shieldEl.classList.remove('shield-cast'), duration);
        }
      }
    });

    setTimeout(resolve, duration);
  });
}
