// Patting the pet, the beer, and cheers with friends in reach: two bottles up close together set off fireworks.
import * as THREE from 'three';
import { damp } from '../core/noise';
import { wrapAngle } from '../core/noise';
import type { Game } from './game';

const EMPTY_LINES = [
  'Empty. There is always another in the basket.',
  'That one went down easy.',
  'The sun did not mind waiting.',
];

export class Social {
  constructor(readonly g: Game) {}

  /** Seconds left of each: a pat under way, and a bottle held up for a cheers. */
  patT = 0;
  patK = 0;
  cheersT = 0;
  cheersK = 0;
  patTarget = new THREE.Vector3();
  private clinked = new Map<string, number>();
  private patHintBoat = false;
  private petTmp = new THREE.Vector3();
  private patted = false;

  /** The closest friend in reach, and whether they've got a bottle up. */
  nearestFriend(): { id: string; name: string; at: THREE.Vector3; raised: boolean } | null {
    let best: { id: string; name: string; at: THREE.Vector3; raised: boolean } | null = null;
    let bd = Infinity;
    const me = this.g.fisher.root.getWorldPosition(new THREE.Vector3());
    for (const p of this.g.net.players.values()) {
      if (!p.state) continue;
      const r = this.g.friends.remotes.get(p.id);
      if (!r) continue;
      const at = r.fisher.root.getWorldPosition(new THREE.Vector3());
      const d = at.distanceTo(me);
      if (d < bd && d < this.cheersReach(this.g.seated || p.state.ib || p.state.ride !== '')) {
        bd = d;
        best = { id: p.id, name: p.name, at, raised: p.state.ch };
      }
    }
    return best;
  }

  /** Further between boats, since you can't stand toe to toe in one. */
  private cheersReach(boat: boolean): number {
    return boat ? 11 : 5;
  }

  /** What's in reach to do with others, added to whatever the place itself offers. Names came off the network, so they're escaped. */
  withSocial(prompt: string | null): string | null {
    const parts: string[] = prompt ? [prompt] : [];
    const friend = this.nearestFriend();
    if (friend && this.cheersT <= 0 && friend.raised) {
      const name = friend.name.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
      parts.push(`${this.g.input.usingPad ? '<kbd>Up</kbd>' : '<kbd>C</kbd>'} ${name} wants to cheers!`);
    }
    if (this.g.pet.exists && this.patT <= 0 && !this.g.guns.gunOut && this.canPat() && (this.g.seated ? !this.patHintBoat : !this.patted)) {
      parts.push(`<kbd>P</kbd> pat the ${this.g.pet.name}`);
    }
    return parts.length ? parts.join('&emsp;') : null;
  }

  private canPat(): boolean {
    if (!this.g.pet.exists || this.g.fishing.active || this.g.guns.gunOut || this.g.beer.active || this.cheersT > 0) return false;
    if (this.g.seated) return true;
    return this.g.pet.worldPos(this.petTmp).distanceTo(this.g.fisher.root.getWorldPosition(this.g.petTmp2)) < 3.2;
  }

  updateSocial(dt: number, menu: boolean) {
    const inp = this.g.input;
    const canAct = !menu && (this.g.mode === 'walk' || this.g.mode === 'row' || this.g.mode === 'sit' || this.g.mode === 'ride');
    // Patting.
    if (canAct && (inp.was('KeyP') || inp.was('PadDown')) && this.canPat()) {
      this.patT = 2.8;
      this.patted = true;
      if (this.g.seated) this.patHintBoat = true;
      this.g.speed = 0;
      this.g.audio.uiTick();
    }
    if (this.patT > 0) {
      this.patT -= dt;
      if (Math.abs(inp.moveX) + Math.abs(inp.moveY) > 0.1 || !canAct) this.patT = 0;
    }
    this.patK = damp(this.patK, this.patT > 0 ? 1 : 0, 7, dt);

    // Cheers: a bottle held up for a few seconds. Two raised near each other makes a clink.
    if (canAct && this.g.net.live && this.g.net.players.size > 0 && (inp.was('KeyC') || inp.was('PadUp')) && !this.g.fishing.active && !this.g.guns.gunOut && this.cheersT <= 0) {
      this.cheersT = 7;
      this.g.beer.putAway();
      this.g.audio.uiTick();
    }
    this.cheersT = Math.max(0, this.cheersT - dt);
    this.cheersK = damp(this.cheersK, this.cheersT > 0 ? 1 : 0, 8, dt);
    if (this.cheersT > 0 && this.g.mode === 'walk' && this.g.speed < 0.3) {
      const f = this.nearestFriend();
      if (f) this.g.facing += wrapAngle(Math.atan2(-(f.at.x - this.g.px), -(f.at.z - this.g.pz)) - this.g.facing) * (1 - Math.exp(-dt * 7));
    }
    this.checkClinks();
  }

  /** Everyone's game works this out for itself, from where everyone is, so nobody has to be told. */
  private checkClinks() {
    if (!this.g.net.live) return;
    const raised: { id: string; at: THREE.Vector3; boat: boolean }[] = [];
    if (this.cheersT > 0) raised.push({ id: this.g.net.myId, at: this.g.fisher.root.getWorldPosition(new THREE.Vector3()), boat: this.g.seated });
    for (const p of this.g.net.players.values()) {
      if (!p.state?.ch) continue;
      const r = this.g.friends.remotes.get(p.id);
      if (r) raised.push({ id: p.id, at: r.fisher.root.getWorldPosition(new THREE.Vector3()), boat: p.state.ib || p.state.ride !== '' });
    }
    if (raised.length < 2) return;
    const now = performance.now();
    const group = new Set<number>();
    let fresh = false;
    for (let i = 0; i < raised.length; i++) {
      for (let j = i + 1; j < raised.length; j++) {
        if (raised[i].at.distanceTo(raised[j].at) > this.cheersReach(raised[i].boat || raised[j].boat)) continue;
        group.add(i);
        group.add(j);
        const key = [raised[i].id, raised[j].id].sort().join('|');
        if (now - (this.clinked.get(key) ?? -1e9) > 8000) {
          this.clinked.set(key, now);
          fresh = true;
        }
      }
    }
    if (!fresh) return;
    // Straight ahead of this player's own view, so nobody has to turn round and miss it.
    const ahead = this.g.camera.getWorldDirection(new THREE.Vector3());
    ahead.y = 0;
    if (ahead.lengthSq() < 0.01) ahead.set(-1, 0, 0);
    ahead.normalize().multiplyScalar(82);
    this.g.fireworks.show(this.g.camera.position.clone().add(ahead), group.size);
    this.g.audio.clink();
    this.g.ui.toast('Cheers!', 3);
    if (this.cheersT > 0) this.cheersT = Math.min(this.cheersT, 1.8);
  }

  updateBeer(dt: number, menu: boolean) {
    const inp = this.g.input;
    const handsFree = this.g.fishing.state === 'idle' || this.g.fishing.state === 'wait';
    const canDrink = handsFree && (this.g.mode === 'walk' || this.g.mode === 'sit' || this.g.mode === 'row' || this.g.mode === 'ride');
    if (!canDrink) this.g.beer.putAway();
    // Taking up the oars means putting the bottle down first.
    if (this.g.mode === 'row' && !this.g.fishing.active && Math.abs(inp.moveX) + Math.abs(inp.moveY) > 0.05) this.g.beer.putAway();
    if ((inp.was('KeyB') || inp.was('PadL1')) && canDrink && !menu) this.g.beer.press();
    if (menu) return;
    for (const e of this.g.beer.update(dt)) {
      if (e === 'open') this.g.audio.beerOpen();
      else if (e === 'sip') this.g.audio.beerSip();
      else if (e === 'ah') this.g.audio.beerAh();
      else if (e === 'stow') this.g.audio.beerStow();
      else if (e === 'empty') this.g.ui.toast(EMPTY_LINES[Math.floor(Math.random() * EMPTY_LINES.length)], 3.5);
    }
  }
}
