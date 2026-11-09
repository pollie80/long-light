// Guns in hand: switching, reloading, the sights and the scope, and where each shot lands.
import * as THREE from 'three';
import { groundY } from '../world/land';
import { clamp, damp } from '../core/noise';
import { GUN_ORDER, GUNS, GunKind } from './guns';
import { RULES } from './difficulty';
import { TIER_LABEL, TIERS, Species } from './fishdata';
import type { Game } from './game';

export class Gunplay {
  constructor(readonly g: Game) {}

  gunOut = false;
  /** Which gun is in hand, and what's left in each. */
  gunKind: GunKind = 'pistol';
  private ammo: Record<GunKind, number> = { pistol: GUNS.pistol.magazine, rifle: GUNS.rifle.magazine, shotgun: GUNS.shotgun.magazine };
  /** Working the bolt, or bringing the next gun up: no firing till it's done. */
  private cycleT = 0;
  /** 0 to 1: looking down the sights, or through the scope. */
  aimK = 0;
  private hintedScope = false;
  private wheelAcc = 0;
  reloadT = 0;
  recoil = 0;
  private flashT = 0;
  shotsFired = 0;
  flash!: THREE.Mesh;
  private hintedGun = false;

  /** Exactly where the sights are pointing. */
  shotDir(): THREE.Vector3 {
    const cp = Math.cos(this.g.cam.pitch);
    return new THREE.Vector3(-Math.sin(this.g.cam.yaw) * cp, -Math.sin(this.g.cam.pitch), -Math.cos(this.g.cam.yaw) * cp).normalize();
  }

  private toggleGun() {
    if (this.g.fishing.active || this.g.beer.active || !this.canHoldGun) return;
    if (this.g.rest.relax) this.g.rest.endRelax();
    this.gunOut = !this.gunOut;
    this.g.audio.uiTick();
    this.showSights();
    if (!this.gunOut) {
      // Back to the usual view without a lurch.
      this.g.cam.pitch = clamp(this.g.cam.pitch, -0.55, 1.1);
    } else if (!this.hintedGun) {
      this.hintedGun = true;
      this.g.ui.hint(this.g.input.usingPad
        ? '<kbd>R2</kbd> fire, <kbd>L2</kbd> aim, <kbd>Right</kbd> next gun, <kbd>Left</kbd> reload, <kbd>R1</kbd> put it away'
        : '<kbd>Click</kbd> fire, <kbd>Right-click</kbd> aim<br><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> or scroll to change gun, <kbd>R</kbd> reload, <kbd>G</kbd> put it away', 8);
    }
  }

  private showSights() {
    const spec = GUNS[this.gunKind];
    this.g.ui.sights(this.gunOut ? { rounds: this.ammo[this.gunKind], magazine: spec.magazine, kind: this.gunKind, name: spec.name, reloading: this.reloadT > 0 } : null);
  }

  /** Another gun to hand. It comes out if it wasn't already. */
  private selectGun(kind: GunKind) {
    if (this.g.fishing.active || this.g.beer.active || !this.canHoldGun) return;
    if (kind === this.gunKind && this.gunOut) return;
    if (this.g.rest.relax) this.g.rest.endRelax();
    this.gunKind = kind;
    this.gunOut = true;
    this.reloadT = 0;
    this.cycleT = 0.35;
    this.g.fisher.setGun(kind);
    this.g.audio.uiTick();
    if (this.ammo[kind] <= 0) this.startReload();
    this.showSights();
    if (GUNS[kind].scope && !this.hintedScope) {
      this.hintedScope = true;
      this.g.ui.hint(this.g.input.usingPad ? 'hold <kbd>L2</kbd> to look through the scope' : 'hold <kbd>Right-click</kbd> to look through the scope', 5);
    }
  }

  private startReload() {
    const spec = GUNS[this.gunKind];
    if (this.reloadT > 0 || this.ammo[this.gunKind] >= spec.magazine) return;
    this.reloadT = spec.reload;
    this.g.audio.reloadOf(this.gunKind);
    this.showSights();
  }

  private fireGun() {
    const kind = this.gunKind;
    const spec = GUNS[kind];
    if (this.ammo[kind] <= 0 || this.reloadT > 0 || this.cycleT > 0) return;
    // The bullet goes where the sights were. The kick comes after.
    const dir = this.shotDir();
    const aim = RULES[this.g.save.difficulty].aimSpread;
    const spread = (a: number) => spec.spread(a) * aim;
    const hit = this.g.hunt.fire(this.g.camera.position, dir, spec.reach, spread);
    if (!hit && dir.y < -0.02) {
      const fishHit = this.g.swimmers.fire(this.g.camera.position, dir, Math.min(spec.reach, 70), spread);
      const t = -this.g.camera.position.y / dir.y;
      if (t > 0 && t < spec.reach) {
        const x = this.g.camera.position.x + dir.x * t;
        const z = this.g.camera.position.z + dir.z * t;
        if (groundY(x, z) < -0.1) {
          this.g.water.splash(x, z, kind === 'shotgun' ? 1.1 : 0.5, kind === 'shotgun' ? 0.12 : 0.18);
          this.g.audio.splash(0.2);
        }
      }
      if (fishHit) {
        this.g.water.splash(fishHit.x, fishHit.z, 0.7, 0.2);
        // If it was the one coming to the float, another will have to come instead.
        if (this.g.fishing.preset === fishHit.catch && this.g.fishing.presetSize === fishHit.size) {
          this.g.fishing.preset = null;
          this.g.fishing.presetSize = 0;
        }
        this.shotFish(fishHit.catch, fishHit.size);
      }
    }
    this.ammo[kind] -= 1;
    this.shotsFired += 1;
    this.recoil = 1;
    this.flashT = kind === 'shotgun' ? 0.075 : 0.055;
    this.g.cam.pitch -= spec.kick * (1 - this.aimK * 0.5);
    this.g.audio.shot(1, kind);
    this.cycleT = spec.cycle;
    if (kind === 'rifle' && this.ammo[kind] > 0) this.g.audio.bolt();
    if (this.ammo[kind] === 0) this.startReload();
    this.showSights();
    if (hit) {
      let fresh: string | null = null;
      for (const h of hit.hits) {
        this.g.save.birds[h.kind.name] = (this.g.save.birds[h.kind.name] ?? 0) + 1;
        const e = this.g.save.birdLog[h.kind.id];
        if (!e) {
          this.g.save.birdLog[h.kind.id] = { count: 1, longest: h.distance, firstHour: this.g.hour, neon: h.neon ? 1 : 0 };
          fresh = h.kind.name;
        } else {
          e.count += 1;
          e.longest = Math.max(e.longest, h.distance);
          if (h.neon) e.neon = (e.neon ?? 0) + 1;
        }
      }
      const best = hit.distance > this.g.save.bestShot;
      if (best) this.g.save.bestShot = hit.distance;
      this.g.writeSave();
      const total = Object.values(this.g.save.birds).reduce((a, b) => a + b, 0);
      const top = hit.hits.reduce((a, b) => (TIERS.indexOf(b.kind.tier) > TIERS.indexOf(a.kind.tier) ? b : a));
      const rare = TIERS.indexOf(top.kind.tier) >= 2 ? `${TIER_LABEL[top.kind.tier]}! ` : '';
      const glowing = hit.hits.some((x) => x.neon) ? 'A glowing ' : '';
      const what = hit.count > 1 ? `${hit.count} birds with one shot` : `${glowing}${glowing ? hit.name.toLowerCase() : hit.name}, ${Math.round(hit.distance)} m`;
      const note = fresh ? `, and a new page in the journal` : best ? ', your longest yet' : '';
      this.g.ui.toast(`${rare}${what}${note}. ${total} in all.`, 3.6);
      if (fresh) this.g.audio.firstOfKind();
    }
  }

  /** A fish brought up by a shot goes in the journal like any other catch. */
  private shotFish(s: Species, size: number) {
    const j = this.g.save.journal;
    const first = !j[s.id];
    if (first) j[s.id] = { count: 0, firstHour: this.g.hour };
    const record = !first && size > (j[s.id].biggest ?? 0);
    j[s.id].count += 1;
    j[s.id].biggest = Math.max(j[s.id].biggest ?? 0, size);
    if (s.neon) j[s.id].neon = (j[s.id].neon ?? 0) + 1;
    this.g.writeSave();
    if (first) this.g.audio.firstOfKind();
    const len = size >= 1 ? `${size.toFixed(1)} m` : `${Math.round(size * 100)} cm`;
    this.g.ui.toast(`${s.neon ? 'A glowing ' : 'A '}${s.name.toLowerCase()}, ${len}${first ? ', and a new page in the journal' : record ? ', your biggest yet' : ''}.`, 3.4);
  }

  get canHoldGun(): boolean {
    return this.g.mode === 'walk' || this.g.mode === 'row' || this.g.mode === 'ride';
  }

  updateGun(dt: number, menu: boolean) {
    const inp = this.g.input;
    if (!menu && (inp.was('KeyG') || inp.was('PadR1'))) this.toggleGun();
    if (!menu) {
      const pick = inp.was('Digit1') ? 'pistol' : inp.was('Digit2') ? 'rifle' : inp.was('Digit3') ? 'shotgun' : null;
      if (pick) this.selectGun(pick);
      // Scrolling, or right on the pad, goes round them in turn.
      if (this.gunOut) this.wheelAcc += inp.wheel;
      else this.wheelAcc = 0;
      const step = Math.abs(this.wheelAcc) > 60 ? Math.sign(this.wheelAcc) : inp.was('PadRight') ? 1 : 0;
      if (step && this.gunOut) {
        this.wheelAcc = 0;
        const i = GUN_ORDER.indexOf(this.gunKind);
        this.selectGun(GUN_ORDER[(i + step + GUN_ORDER.length) % GUN_ORDER.length]);
      }
      if (this.gunOut && (inp.was('KeyR') || inp.was('PadLeft'))) this.startReload();
    }
    this.recoil = Math.max(0, this.recoil - dt * 6);
    this.cycleT = Math.max(0, this.cycleT - dt);
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        this.reloadT = 0;
        this.ammo[this.gunKind] = GUNS[this.gunKind].magazine;
        this.showSights();
      }
    }
    const aiming = this.gunOut && this.canHoldGun && !menu && inp.aim && this.reloadT <= 0;
    this.aimK = damp(this.aimK, aiming ? 1 : 0, 9, dt);
    if (this.aimK < 0.002) this.aimK = 0;
    this.g.ui.scope(this.gunOut && GUNS[this.gunKind].scope && this.aimK > 0.6);
    if (this.gunOut && !menu && this.canHoldGun && !this.g.wasMenu && (inp.was('Mouse') || inp.was('PadR2'))) this.fireGun();
    if (this.gunOut && !this.canHoldGun) {
      this.gunOut = false;
      this.g.ui.sights(null);
    }
    this.flashT = Math.max(0, this.flashT - dt);
    this.flash.visible = this.flashT > 0;
    if (this.flash.visible) this.flash.position.copy(this.g.fisher.gunTip);
  }
}
