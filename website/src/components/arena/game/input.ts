// website/src/components/arena/game/input.ts

export interface ArenaBindings {
  up: string; down: string; left: string; right: string;
  fire: string; melee: string; pickup: string; dodge: string;
}

export const DEFAULT_BINDINGS: ArenaBindings = {
  up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD',
  fire: 'Mouse0', melee: 'KeyE', pickup: 'KeyF', dodge: 'Space',
};

const STORAGE_KEY = 'arena:keybindings';

export function loadBindings(): ArenaBindings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const saved = raw ? JSON.parse(raw) : null;
    return saved ? { ...DEFAULT_BINDINGS, ...saved } : { ...DEFAULT_BINDINGS };
  } catch {
    return { ...DEFAULT_BINDINGS };
  }
}

export function saveBinding(action: keyof ArenaBindings, code: string): void {
  const current = loadBindings();
  current[action] = code;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
}

/**
 * Maps boolean key states to the server's 9-direction WASD enum.
 * 0=none, 1=up, 2=up-right, 3=right, 4=down-right,
 * 5=down, 6=down-left, 7=left, 8=up-left
 */
export function computeWasd(up: boolean, down: boolean, left: boolean, right: boolean): number {
  const u = up && !down;
  const d = down && !up;
  const l = left && !right;
  const r = right && !left;
  if (u && r) return 2;
  if (d && r) return 4;
  if (d && l) return 6;
  if (u && l) return 8;
  if (u) return 1;
  if (r) return 3;
  if (d) return 5;
  if (l) return 7;
  return 0;
}

/** Returns aim angle in radians (atan2 of mouse position relative to canvas center). */
export function computeAim(
  mouseX: number, mouseY: number,
  canvasCenterX: number, canvasCenterY: number
): number {
  return Math.atan2(mouseY - canvasCenterY, mouseX - canvasCenterX);
}

interface InputLoopOptions {
  socket: { emit: (event: string, data: unknown) => void };
  canvas: HTMLCanvasElement;
  getServerTick: () => number;
  getPlayerFacing: () => number;
}

/**
 * Starts the 30 Hz input loop. Returns a cleanup function to call on unmount.
 * Edge-triggered actions (melee, pickup, dodge) are sent once per keypress.
 */
export function start(opts: InputLoopOptions): () => void {
  const { socket, canvas, getServerTick, getPlayerFacing } = opts;
  let bindings = loadBindings();
  let seq = 0;

  const keys = new Set<string>();
  let mouseX = 0;
  let mouseY = 0;
  let lastMouseMove = 0;
  let fire = false;
  let melee = false;
  let pickup = false;
  let dodge = false;

  const getCanvasCenter = () => {
    const r = canvas.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  };

  const onKeyDown = (e: KeyboardEvent) => {
    keys.add(e.code);
    if (e.code === bindings.melee)  melee  = true;
    if (e.code === bindings.pickup) pickup = true;
    if (e.code === bindings.dodge)  dodge  = true;
  };
  const onKeyUp   = (e: KeyboardEvent) => keys.delete(e.code);
  const onMouseMove = (e: MouseEvent) => {
    mouseX = e.clientX; mouseY = e.clientY; lastMouseMove = Date.now();
  };
  const onMouseDown = (e: MouseEvent) => { if (e.button === 0) fire = true; };
  const onMouseUp   = (e: MouseEvent) => { if (e.button === 0) fire = false; };

  const onVisChange = () => {
    if (document.hidden) {
      keys.clear();
      fire = false; melee = false; pickup = false; dodge = false;
      socket.emit('msg', { t: 'input', seq: seq++, wasd: 0, aim: getPlayerFacing(),
        fire: false, melee: false, pickup: false, dodge: false, tick: getServerTick() });
    }
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  document.addEventListener('visibilitychange', onVisChange);

  const onBindingsChange = () => { bindings = loadBindings(); };
  window.addEventListener('arena:keybindings-changed', onBindingsChange);

  const interval = setInterval(() => {
    const up    = keys.has(bindings.up);
    const down  = keys.has(bindings.down);
    const left  = keys.has(bindings.left);
    const right = keys.has(bindings.right);

    const wasd = computeWasd(up, down, left, right);

    const { cx, cy } = getCanvasCenter();
    const aimFromMouse = computeAim(mouseX, mouseY, cx, cy);
    const aim = Date.now() - lastMouseMove < 200 ? aimFromMouse : getPlayerFacing();

    socket.emit('msg', { t: 'input', seq: seq++, wasd, aim, fire, melee, pickup, dodge,
      tick: getServerTick() });

    melee = false; pickup = false; dodge = false;
  }, 1000 / 30);

  return () => {
    clearInterval(interval);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    canvas.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mouseup', onMouseUp);
    document.removeEventListener('visibilitychange', onVisChange);
    window.removeEventListener('arena:keybindings-changed', onBindingsChange);
  };
}
