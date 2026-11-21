// save.js — SOLMAR's save game: cash, story progress, the day and the
// shells, kept in the browser's localStorage. Where localStorage does not
// exist (Node, the smoke test) an in-memory slot stands in, so saving and
// loading behave the same everywhere they are exercised.

const SAVE_KEY = 'solmar-save-v1';
let memorySlot = null;

function store() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch { /* a browser may refuse; fall through to memory */ }
  return null;
}

/** Write the parts of the state worth keeping between visits. */
export function saveGame(state) {
  const data = {
    cash: state.cash,
    missionIdx: state.mission.idx,
    storyDone: state.storyDone,
    shellsFound: state.shellsFound,
    shellsTaken: state.world.shells.map((s) => (s.taken ? 1 : 0)),
    dayT: state.dayT,
  };
  const ls = store();
  if (ls) { try { ls.setItem(SAVE_KEY, JSON.stringify(data)); } catch { memorySlot = data; } }
  else memorySlot = data;
  return data;
}

/** The saved game, or null when there is none. */
export function loadSave() {
  const ls = store();
  if (ls) {
    try {
      const raw = ls.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
  return memorySlot;
}

/** Apply a loaded save to a fresh state (world already built). */
export function applySave(state, data) {
  if (!data) return false;
  state.cash = data.cash ?? state.cash;
  state.mission.idx = Math.min(data.missionIdx ?? 0, 5);
  state.storyDone = !!data.storyDone;
  state.mission.complete = state.mission.idx >= 5;
  state.shellsFound = data.shellsFound ?? 0;
  if (Array.isArray(data.shellsTaken)) {
    data.shellsTaken.forEach((taken, i) => { if (state.world.shells[i]) state.world.shells[i].taken = !!taken; });
  }
  state.dayT = data.dayT ?? state.dayT;
  return true;
}

export function clearSave() {
  const ls = store();
  if (ls) { try { ls.removeItem(SAVE_KEY); } catch { /* nothing to clear */ } }
  memorySlot = null;
}
