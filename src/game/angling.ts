// Your side of fishing: casting from where you stand, the mode's rules, and what the prompts say at each step.
import * as THREE from 'three';
import { RULES } from './difficulty';
import type { Game } from './game';

/** Where you can cast, a press shorter than this is a jump and a longer one is a cast. */
const TAP_S = 0.22;

export class Angling {
  constructor(readonly g: Game) {}

  private chargeT = 0;
  private chargeByKey = false;
  hintedCast = false;

  /** A key press might still turn out to be a tap for a jump, so the fisher does not raise the rod yet. */
  get fishingShows(): boolean {
    const f = this.g.fishing;
    return f.active && !(f.state === 'charge' && this.chargeByKey && this.chargeT < TAP_S && this.g.mode === 'walk');
  }

  /** Hands the chosen mode's rules to the fishing and the birds. */
  applyRules() {
    const r = RULES[this.g.save.difficulty];
    this.g.fishing.rules = r;
    this.g.hunt.speedK = r.birdSpeed;
  }

  private hintedSpook = false;

  handleCast(dt: number, from: THREE.Vector3) {
    const inp = this.g.input;
    const f = this.g.fishing;
    if (f.state !== 'reel') this.g.ui.tension(null);
    const pressed = inp.was('Space') || inp.was('PadCross') || (this.g.leftClickPressed());
    switch (f.state) {
      case 'idle':
        if (pressed && !this.g.anyMenuOpen() && !this.g.wasMenu) {
          f.beginCharge();
          this.chargeT = 0;
          this.chargeByKey = inp.was('Space') || inp.was('PadCross');
          this.g.ui.prompt(null);
        }
        break;
      case 'charge': {
        this.chargeT += dt;
        this.g.ui.charge(this.fishingShows ? f.charge : null, f.rules.castSweet ? f.sweetAt : null);
        if (!inp.action) {
          this.g.ui.charge(null);
          if (this.g.mode === 'walk' && !this.fishingShows) {
            f.reelIn();
            this.g.jump();
          } else {
            f.release(this.g.fisher.rodTip.clone(), this.g.cam.aimDir(), this.g.audio);
            this.hintedCast = true;
          }
          this.g.ui.prompt(null);
        }
        break;
      }
      case 'wait': {
        if (f.rules.earlySpooks && !this.hintedSpook) {
          this.hintedSpook = true;
          this.g.ui.toast('Wait for a real bite. Strike at a nibble and it swims off.', 4);
        }
        const k = inp.usingPad ? '<kbd>Circle</kbd>' : '<kbd>R</kbd>';
        this.g.ui.prompt(`${k} reel in`);
        if (inp.was('KeyR') || inp.was('PadCircle')) {
          f.reelIn();
          this.g.ui.prompt(null);
        }
        break;
      }
      case 'reel': {
        const key = inp.usingPad ? '<kbd>Cross</kbd>' : '<kbd>Space</kbd>';
        const running = f.rules.tension && f.runT > 0;
        this.g.ui.prompt(running ? `it's running! let go of ${key}` : inp.action ? null : `hold ${key} to reel`);
        this.g.ui.tension(f.rules.tension ? f.tension : null, running);
        break;
      }
      case 'landed':
        if (pressed) {
          f.letGo();
          this.g.ui.showCard(null, false, 0, 0, 0, '');
          this.g.cardOpen = false;
          this.g.ui.prompt(null);
        }
        break;
      default:
    }
  }
}
