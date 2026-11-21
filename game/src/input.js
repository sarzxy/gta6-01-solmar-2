// input.js — keyboard and mouse input as one shared state object. The
// game reads held keys (up/down/left/right/run) and one-frame edges
// (interactPressed, confirmPressed, pausePressed); the smoke test drives
// the very same object by writing its fields directly.

export function createInput() {
  return {
    up: false, down: false, left: false, right: false, run: false,
    interactPressed: false, confirmPressed: false, pausePressed: false,
    attached: false,
    _down: null, _up: null,
  };
}

const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ShiftLeft: 'run', ShiftRight: 'run',
};

/** Wire an input state to the window's keyboard and mouse. Browser only. */
export function attachInput(input, target = window) {
  if (input.attached || typeof target.addEventListener !== 'function') return input;
  input.attached = true;
  input._down = (ev) => {
    const field = KEYMAP[ev.code];
    if (field) { input[field] = true; ev.preventDefault(); }
    if (ev.code === 'KeyE' || ev.code === 'KeyF') input.interactPressed = true;
    if (ev.code === 'Enter' || ev.code === 'Space') { input.confirmPressed = true; ev.preventDefault(); }
    if (ev.code === 'Escape' || ev.code === 'KeyP') input.pausePressed = true;
  };
  input._up = (ev) => {
    const field = KEYMAP[ev.code];
    if (field) input[field] = false;
  };
  target.addEventListener('keydown', input._down);
  target.addEventListener('keyup', input._up);
  target.addEventListener('mousedown', () => { input.confirmPressed = true; });
  return input;
}

/** Clear the one-frame edges after a step has read them. */
export function clearEdges(input) {
  input.interactPressed = false;
  input.confirmPressed = false;
  input.pausePressed = false;
}
