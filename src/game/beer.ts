// A bottle from the basket: taken out, opened, sipped slowly. No rules beyond that.

export type BeerPhase = 'away' | 'taking' | 'raising' | 'sipping' | 'lowering' | 'held' | 'stowing';
export type BeerEvent = 'open' | 'sip' | 'ah' | 'empty' | 'stow';

export const SIPS_PER_BOTTLE = 5;

const TAKE_SECONDS = 0.7;
const RAISE_SECONDS = 0.75;
const SIP_SECONDS = 1.7;
const LOWER_SECONDS = 0.8;
const HOLD_SECONDS = 8;
const STOW_SECONDS = 0.6;

export class Beer {
  phase: BeerPhase = 'away';
  /** 0 is in the basket, 1 is in the hand. */
  out = 0;
  /** 0 is held at the chest, 1 is at the mouth. */
  lift = 0;
  /** Sips left in the open bottle. A stowed bottle keeps what it has. */
  sips = 0;
  private t = 0;

  get active(): boolean {
    return this.phase !== 'away';
  }

  /** Take the bottle out, or have another sip. Returns false if the hand is busy mid-movement. */
  press(): boolean {
    if (this.phase === 'away') {
      this.set('taking');
      return true;
    }
    if (this.phase === 'held') {
      this.set('raising');
      return true;
    }
    return false;
  }

  /** Back in the basket, whatever was happening. */
  putAway() {
    if (this.phase !== 'away' && this.phase !== 'stowing') this.set('stowing');
  }

  private set(p: BeerPhase) {
    this.phase = p;
    this.t = 0;
  }

  update(dt: number): BeerEvent[] {
    const ev: BeerEvent[] = [];
    this.t += dt;
    switch (this.phase) {
      case 'taking':
        this.out = Math.min(1, this.out + dt / TAKE_SECONDS);
        if (this.t >= TAKE_SECONDS) {
          this.out = 1;
          if (this.sips <= 0) {
            this.sips = SIPS_PER_BOTTLE;
            ev.push('open');
          }
          this.set('raising');
        }
        break;
      case 'raising':
        this.lift = Math.min(1, this.lift + dt / RAISE_SECONDS);
        if (this.t >= RAISE_SECONDS) {
          this.lift = 1;
          ev.push('sip');
          this.set('sipping');
        }
        break;
      case 'sipping':
        if (this.t >= SIP_SECONDS) {
          this.sips -= 1;
          ev.push('ah');
          this.set('lowering');
        }
        break;
      case 'lowering':
        this.lift = Math.max(0, this.lift - dt / LOWER_SECONDS);
        if (this.t >= LOWER_SECONDS) {
          this.lift = 0;
          if (this.sips <= 0) {
            ev.push('empty');
            this.set('stowing');
          } else {
            this.set('held');
          }
        }
        break;
      case 'held':
        if (this.t >= HOLD_SECONDS) this.set('stowing');
        break;
      case 'stowing':
        this.lift = Math.max(0, this.lift - dt / (STOW_SECONDS * 0.5));
        this.out = Math.max(0, this.out - dt / STOW_SECONDS);
        if (this.out <= 0) {
          this.lift = 0;
          ev.push('stow');
          this.set('away');
        }
        break;
      default:
    }
    return ev;
  }
}
