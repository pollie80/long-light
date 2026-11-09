// Keyboard, mouse and gamepad, reduced to the few intents the game cares about.
import { clamp } from './noise';

const DEADZONE = 0.14;
const dz = (v: number) => (Math.abs(v) < DEADZONE ? 0 : (v - Math.sign(v) * DEADZONE) / (1 - DEADZONE));

export class Input {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  moveX = 0;
  moveY = 0;
  lookX = 0;
  lookY = 0;
  jog = false;
  /** Space, left mouse or Cross/R2 held. */
  action = false;
  private padAction = false;
  private padPrev: boolean[] = [];
  private mouseDown = false;
  private rightDown = false;
  private padAim = false;
  /** Right mouse or L2 held: looking down the sights or through a scope. */
  aim = false;
  private accX = 0;
  private accY = 0;
  locked = false;
  /** Multiplies mouse movement. */
  sensitivity = 1;
  /** True while playing: the mouse should be captured. */
  wantLock = false;
  /** The browser would not lock after many tries, so raw movement drives the camera instead. */
  lockUnavailable = false;
  wheel = 0;
  private lastTry = 0;
  private failures = 0;
  /**
   * A browser driven by a test script never takes the real mouse. On Windows, Chrome holds the cursor inside its
   * window while the pointer is locked, even a hidden test window, which traps the mouse of whoever is at the
   * desk. Those browsers get a stand-in lock that behaves the same to the game. `?reallock` asks for the real one.
   */
  private fakeLock = navigator.webdriver === true && !/[?&]reallock(?:[=&#]|$)/.test(location.search);
  private standInTo = false;
  private standInTimer = 0;

  /** The stand-in lock changes on the next tick, as the real one does, so callers see the same order of events. */
  private setStandIn(on: boolean) {
    this.standInTo = on;
    if (this.standInTimer) return;
    this.standInTimer = window.setTimeout(() => {
      this.standInTimer = 0;
      const was = this.locked;
      this.locked = this.standInTo;
      if (this.locked) {
        this.failures = 0;
        this.lockUnavailable = false;
      }
      if (was !== this.locked) this.onLockChange?.(this.locked);
    }, 0);
  }
  usingPad = false;
  anyPress = false;
  onLockChange: ((locked: boolean) => void) | null = null;

  constructor(private canvas: HTMLElement) {
    const typing = (e: Event) => {
      const t = e.target as HTMLElement | null;
      return t?.tagName === 'INPUT' && (t as HTMLInputElement).type === 'text';
    };
    window.addEventListener('keydown', (e) => {
      // Letters typed into a box are not game keys, but Esc still closes the page it is on.
      if (e.repeat || (typing(e) && e.code !== 'Escape')) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      this.anyPress = true;
      this.usingPad = false;
      // Any key is a user gesture, so it can bring the capture back. Esc is how you ask to leave it.
      if (this.wantLock && !this.locked && e.code !== 'Escape') this.lock();
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'F2'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
      this.rightDown = false;
    });
    window.addEventListener('mousemove', (e) => {
      this.accX += e.movementX;
      this.accY += e.movementY;
      this.usingPad = false;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouseDown = true;
      if (e.button === 2) this.rightDown = true;
      this.anyPress = true;
      // The left button does things; the right one aims.
      this.pressed.add(e.button === 2 ? 'MouseR' : 'Mouse');
      if (this.wantLock && !this.locked) this.lock();
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.rightDown = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
      this.wheel += e.deltaY;
      e.preventDefault();
    }, { passive: false });
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === this.canvas;
      if (this.locked) {
        this.failures = 0;
        this.lockUnavailable = false;
      }
      // Only a real change counts: browsers also fire this for attempts that never took hold.
      if (was !== this.locked) this.onLockChange?.(this.locked);
    });
  }

  lock() {
    if (this.fakeLock) {
      this.setStandIn(true);
      return;
    }
    const c = this.canvas as HTMLCanvasElement & { requestPointerLock(o?: unknown): Promise<void> | undefined };
    if (document.pointerLockElement === c) return;
    this.lastTry = performance.now();
    // One refusal per attempt, however it arrives. Chrome's cooldown after Esc lasts about three
    // attempts, so many in a row means this browser simply will not capture the mouse.
    const fail = () => {
      this.failures += 1;
      if (this.failures > 15) this.lockUnavailable = true;
    };
    const plain = () => {
      try {
        const p = c.requestPointerLock();
        if (p?.catch) p.catch(fail);
      } catch {
        fail();
      }
    };
    try {
      // Raw movement first, for an even feel; not every setup offers it.
      const p = c.requestPointerLock({ unadjustedMovement: true });
      if (p?.catch) p.catch(plain);
    } catch {
      plain();
    }
  }

  /**
   * Chrome refuses a new lock for about a second after Esc releases one, so a quick return from the
   * menu fails. Keep trying while the click that asked for it is still fresh.
   */
  private maintainLock() {
    if (!this.wantLock || this.locked || !document.hasFocus()) return;
    if (performance.now() - this.lastTry < 300) return;
    const active = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation?.isActive ?? false;
    if (active) this.lock();
  }

  get dragging(): boolean {
    return this.mouseDown;
  }

  unlock() {
    // Said at once, so nothing can recapture the mouse between now and the next frame.
    this.wantLock = false;
    if (this.fakeLock) {
      this.setStandIn(false);
      return;
    }
    if (document.pointerLockElement) document.exitPointerLock();
  }

  was(code: string): boolean {
    return this.pressed.has(code);
  }

  held(code: string): boolean {
    return this.keys.has(code);
  }

  /** Call once per frame before reading intents. */
  poll(dt: number) {
    let mx = 0;
    let my = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) my += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) my -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) mx += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) mx -= 1;
    this.maintainLock();
    // Without the capture the cursor is free, and moving it to another screen must not spin the view.
    const mouseCounts = this.locked || this.lockUnavailable || !this.wantLock;
    let lx = mouseCounts ? this.accX * 0.0021 * this.sensitivity : 0;
    let ly = mouseCounts ? this.accY * 0.0018 * this.sensitivity : 0;
    this.accX = 0;
    this.accY = 0;
    this.jog = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');

    this.padAction = false;
    this.padAim = false;
    const pads = navigator.getGamepads?.() ?? [];
    for (const p of pads) {
      if (!p) continue;
      const ax = dz(p.axes[0] ?? 0);
      const ay = dz(p.axes[1] ?? 0);
      const rx = dz(p.axes[2] ?? 0);
      const ry = dz(p.axes[3] ?? 0);
      if (Math.abs(ax) + Math.abs(ay) + Math.abs(rx) + Math.abs(ry) > 0.01) this.usingPad = true;
      mx += ax;
      my -= ay;
      lx += rx * dt * 2.4;
      ly += ry * dt * 1.8;
      const b = (i: number) => !!p.buttons[i]?.pressed;
      // Standard mapping: 0 Cross, 1 Circle, 2 Square, 3 Triangle, 7 R2, 9 Options, 10 L3, 11 R3, 6 L2, 14 and 15 left and right.
      const edge = (i: number, code: string) => {
        if (b(i) && !this.padPrev[i]) {
          this.pressed.add(code);
          this.anyPress = true;
          this.usingPad = true;
        }
        this.padPrev[i] = b(i);
      };
      edge(0, 'PadCross');
      edge(1, 'PadCircle');
      edge(2, 'PadSquare');
      edge(3, 'PadTriangle');
      edge(9, 'PadOptions');
      edge(10, 'PadL3');
      edge(4, 'PadL1');
      edge(5, 'PadR1');
      edge(12, 'PadUp');
      edge(13, 'PadDown');
      edge(7, 'PadR2');
      edge(8, 'PadShare');
      edge(11, 'PadR3');
      edge(14, 'PadLeft');
      edge(15, 'PadRight');
      if (b(6) || (p.buttons[6]?.value ?? 0) > 0.3) this.padAim = true;
      if (b(0) || b(7)) this.padAction = true;
      if (b(10)) this.jog = true;
      break;
    }
    this.moveX = clamp(mx, -1, 1);
    this.moveY = clamp(my, -1, 1);
    this.lookX = lx;
    this.lookY = ly;
    this.action = this.keys.has('Space') || this.mouseDown || this.padAction;
    this.aim = this.rightDown || this.padAim;
  }

  /** Clears one-frame presses. Call at the end of the frame. */
  endFrame() {
    this.pressed.clear();
    this.anyPress = false;
  }
}
