// Sitting back to watch the world through the fisher's eyes, and the energy that hard rowing spends and rest brings back.
import * as THREE from 'three';
import { Look } from '../core/time';
import { clamp, damp } from '../core/noise';
import type { Game } from './game';

export class Resting {
  constructor(readonly g: Game) {}

  /** Sitting back to watch the world, seen through the fisher's own eyes. */
  relax = false;
  /** 0 to 1: the view easing from behind the fisher into their eyes. */
  relaxK = 0;
  loungeK = 0;
  private hintedRelax = false;
  eyeTmp = new THREE.Vector3();
  /** Rowing hard: 1 fresh, 0 spent. Winded means spent, and not yet back to a quarter. */
  energy = 1;
  winded = false;
  sprinting = false;
  sprintK = 0;
  private energyShow = 0;

  private get canRelax(): boolean {
    return this.g.mode === 'walk' || this.g.mode === 'sit' || this.g.mode === 'row' || this.g.mode === 'ride' || (this.g.mode === 'transition' && this.relax);
  }

  /** The energy bar: refills unless rowing hard, faster at rest, fastest sitting back or with a beer. */
  updateEnergy(dt: number) {
    if (!this.sprinting) {
      const pulling = this.g.mode === 'row' && Math.abs(this.g.input.moveY) + Math.abs(this.g.input.moveX) > 0.05;
      const rate = this.relax || this.g.beer.active ? 1 / 7 : pulling ? 1 / 40 : 1 / 16;
      this.energy = Math.min(1, this.energy + dt * rate);
    }
    if (this.winded && this.energy >= 0.3) this.winded = false;
    // Shown in the boat while it matters, then it fades away once full.
    const show = this.g.mode === 'row' && !this.g.guns.gunOut && (this.energy < 0.999 || this.sprinting);
    this.energyShow = show ? 2 : Math.max(0, this.energyShow - dt);
    this.g.ui.energy(this.energyShow > 0 && this.g.mode === 'row' && !this.g.guns.gunOut ? this.energy : null, this.winded, this.relax || this.g.beer.active);
    this.sprinting = false;
  }

  updateRelax(dt: number, menu: boolean) {
    const inp = this.g.input;
    if (!menu && (inp.was('KeyV') || inp.was('PadR3'))) {
      if (this.relax) this.endRelax();
      else this.startRelax();
    }
    // A step, or a pull on the oars, and you're back up.
    if (this.relax && !menu && this.g.mode !== 'sit' && this.g.mode !== 'transition' && Math.abs(inp.moveX) + Math.abs(inp.moveY) > 0.2) this.endRelax();
    if (this.relax && (this.g.guns.gunOut || !this.canRelax)) this.endRelax();
    // In slowly, out a little quicker.
    this.relaxK = clamp(this.relaxK + (this.relax ? dt / 1.9 : -dt / 1.3), 0, 1);
    this.loungeK = damp(this.loungeK, this.relax ? 1 : 0, 2.2, dt);
    if (this.loungeK < 0.002) this.loungeK = 0;
  }

  private startRelax() {
    if (this.g.guns.gunOut || this.g.airborne || !this.canRelax || this.g.mode === 'transition') return;
    if (this.g.mode === 'walk') {
      if (this.g.speed > 0.6) this.g.speed = 0;
      this.g.strolling = false;
      this.g.enterSit('ground');
    }
    this.relax = true;
    this.g.audio.uiTick();
    if (!this.hintedRelax) {
      this.hintedRelax = true;
      this.g.ui.hint(this.g.input.usingPad ? 'Sitting back. Look around with the right stick.<br><kbd>R3</kbd> or move to get up' : 'Sitting back. Look around with the mouse.<br><kbd>V</kbd> or move to get up', 6);
    }
  }

  endRelax() {
    if (!this.relax) return;
    this.relax = false;
    this.g.cam.pitch = clamp(this.g.cam.pitch, -0.55, 1.1);
    if (this.g.mode === 'sit' && this.g.sitKind === 'ground') this.g.leaveSit();
  }

  /** Just in front of the fisher's eyes. */
  eyePos(out: THREE.Vector3): THREE.Vector3 {
    this.g.fisher.head.updateWorldMatrix(true, false);
    return out.set(0, 0.08, -0.1).applyMatrix4(this.g.fisher.head.matrixWorld);
  }
}
