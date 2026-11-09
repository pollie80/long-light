// Playing together: the friends panel, names, the shared clock, what we tell the others each tick, and riding in a friend's boat.
import * as THREE from 'three';
import { BOAT_SLOTS, DECK_Y, groundY, JETTY } from '../world/land';
import { Boat } from '../actors/boat';
import { advanceHour } from '../core/time';
import { clamp } from '../core/noise';
import { GUNS } from './guns';
import { RemotePlayer } from '../net/remote';
import { cleanName, inviteLink, NetState } from '../net/protocol';
import type { Game } from './game';

export class Friends {
  constructor(readonly g: Game) {}

  remotes = new Map<string, RemotePlayer>();
  netError = '';
  netStatus = '';
  joinCode: string | null = null;
  /** Whose boat we're a passenger in, once settled, and on the way to it. */
  rideWith: string | null = null;
  ridePending: string | null = null;
  seatTmp = new THREE.Vector3();
  petRideSeat = new THREE.Vector3();
  clockSendT = 0;
  private clockTouchedAt = -1e9;

  openFriends() {
    this.g.ui.showMenu(false);
    this.g.ui.showTitle(false);
    this.g.input.unlock();
    this.g.ui.prompt(null);
    this.g.ui.showFriends(true);
    this.renderFriends();
    this.g.audio.pageTurn();
  }

  closeFriends() {
    this.g.ui.showFriends(false);
    this.g.audio.uiTick();
    if (this.g.mode === 'title') {
      this.g.ui.showTitle(true);
      return;
    }
    // Back to the page it was opened from.
    this.g.ui.showMenu(true);
  }

  playerName(): string {
    return cleanName(this.g.save.name);
  }

  setName(name: string) {
    const clean = name.trim().slice(0, 20);
    this.g.save.name = clean;
    this.g.writeSave();
    if (this.g.net.live) this.g.net.sendName(this.playerName());
    this.renderFriends();
  }

  renderFriends() {
    const people = [] as { name: string; you: boolean; host: boolean }[];
    if (this.g.net.live) {
      people.push({ name: this.playerName(), you: true, host: this.g.net.role === 'host' });
      for (const p of this.g.net.players.values()) people.push({ name: p.name, you: false, host: p.id === 'host' });
    }
    this.g.ui.renderFriends({
      role: this.g.net.role,
      link: this.g.net.ready ? inviteLink(this.g.net.code) : '',
      status: this.netStatus,
      error: this.netError,
      people,
    });
  }

  joinCove(name: string) {
    if (!this.joinCode) return;
    this.setName(name);
    this.g.audio.init();
    this.netError = '';
    this.g.ui.joinStatus('Connecting…');
    this.g.net.join(this.joinCode, this.playerName(), this.g.fisher.look);
  }

  setBoatSlot(slot: number) {
    const s = BOAT_SLOTS[slot] ?? BOAT_SLOTS[0];
    this.g.boat.home = { x: s.x, z: s.z };
    if (this.g.boat.moored && !this.g.inBoat) {
      this.g.boat.x = s.x;
      this.g.boat.z = s.z;
    }
  }

  /** The clock here was changed by hand: everyone else needs to know. */
  clockChanged() {
    this.clockTouchedAt = performance.now();
    this.g.net.clockChanged(this.g.hour, this.g.clockRunning);
  }

  syncClock(hour: number, running: boolean, time: number) {
    // While you are moving the sun yourself, your own hand wins over the echo from the host.
    if (this.g.net.role === 'guest' && performance.now() - this.clockTouchedAt < 700) return;
    const diff = Math.abs(((hour - this.g.hour + 36) % 24) - 12);
    if (diff > 0.25) this.g.sky.fastCycles = 4;
    // Small differences are only drift; a little nudge keeps it from showing.
    if (diff > 0.02) this.g.hour = hour;
    this.g.clockRunning = running;
    if (this.g.net.role === 'guest' && Math.abs(time - this.g.time) > 3) this.g.time = time;
    if (this.g.net.role === 'host') this.g.net.pushClock();
  }

  private netState(): NetState {
    const b = this.g.boat;
    const f = this.g.fishing;
    const root = this.g.fisher.root;
    const p = root.getWorldPosition(new THREE.Vector3());
    const r = (v: number) => Math.round(v * 1000) / 1000;
    const pose = this.g.lastPose ?? this.g.buildPose();
    const rod = pose.rodDir!;
    return {
      x: r(p.x), y: r(p.y), z: r(p.z), yaw: r(this.g.seated ? 0 : root.rotation.y),
      air: this.g.airborne,
      gun: this.g.guns.gunOut,
      gk: this.g.guns.gunKind,
      rl: r(this.g.guns.gunOut && this.g.guns.reloadT > 0 ? 1 - this.g.guns.reloadT / GUNS[this.g.guns.gunKind].reload : 0),
      lg: r(this.g.rest.loungeK),
      shots: this.g.guns.shotsFired,
      pat: this.g.social.patT > 0,
      ch: this.g.social.cheersT > 0,
      ride: this.rideWith ?? '',
      fn: f.species?.neon === true && (f.state === 'reel' || f.state === 'landed' || f.state === 'released'),
      mode: pose.mode,
      sp: r(pose.speed),
      ib: this.g.inBoat, fy: r(this.g.fisherYaw),
      bx: r(b.x), bz: r(b.z), bh: r(b.heading), bp: r(b.oarPhase), bo: b.oarOut > 0.5, br: b.rowing, bs: r(b.speed),
      fs: f.state,
      lx: r(f.lure.x), ly: r(f.lure.y), lz: r(f.lure.z),
      rx: r(rod.x), ry: r(rod.y), rz: r(rod.z),
      bend: r(pose.rodBend ?? 0), spin: r(pose.reelSpin ?? 0),
      fish: f.species && (f.state === 'reel' || f.state === 'landed' || f.state === 'released') ? f.species.id : '',
      fl: r(f.size),
      bOut: r(this.g.beer.out), bLift: r(this.g.beer.lift),
    };
  }

  updateFriends(dt: number, t: number, lampK: number) {
    if (!this.g.net.live && this.remotes.size === 0) return;
    this.g.net.tick(dt, () => this.netState());
    for (const p of this.g.net.players.values()) {
      let r = this.remotes.get(p.id);
      if (!r) {
        r = new RemotePlayer(this.g.scene, this.g.pipe.late, this.g.lineMat, p.look, p.name, document.getElementById('ui')!);
        r.id = p.id;
        r.world = {
          boatOf: (id) => (id === this.g.net.myId ? this.g.boat : this.remotes.get(id)?.boat ?? null),
          seatOf: (player, owner) => this.seatOf(player, owner),
        };
        r.onShot = (at, kind) => {
          const d = at.distanceTo(this.g.camera.position);
          this.g.audio.shot(Math.max(0.12, Math.min(0.8, 24 / (d + 8))), kind);
        };
        this.remotes.set(p.id, r);
      }
      r.setName(p.name);
      r.update(dt, t, p.state, this.g.water, this.g.camera, lampK, window.innerWidth, window.innerHeight);
    }
    // The friend in reach gets a small cheers by their name, when a cheers could happen.
    const canAct = this.g.mode === 'walk' || this.g.mode === 'row' || this.g.mode === 'sit' || this.g.mode === 'ride';
    const free = canAct && !this.g.anyMenuOpen() && !this.g.fishing.active && !this.g.guns.gunOut && this.g.social.cheersT <= 0;
    const near = free ? this.g.social.nearestFriend() : null;
    const key = this.g.input.usingPad ? '<kbd>Up</kbd>' : '<kbd>C</kbd>';
    for (const [id, r] of this.remotes) r.setCheers(near?.id === id ? (near.raised ? 'raised' : 'near') : 'none', key);
  }

  /** Keeps the clock and the connection alive when the window is not drawing. */
  keepFriendsGoing() {
    if (!this.g.net.live) return;
    const now = performance.now();
    const gap = (now - this.g.lastNow) / 1000;
    if (gap < 0.9) return;
    this.g.lastNow = now;
    this.g.time += gap;
    if (this.g.clockRunning) this.g.hour = advanceHour(this.g.hour, gap);
    this.g.net.tick(gap, () => this.netState());
  }

  safeName(name: string): string {
    return name.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  }

  /** Everyone in a boat works out the seating the same way: by id, so nobody has to arrange it. */
  private seatOf(player: string, owner: string): number {
    const riders: string[] = [];
    for (const p of this.g.net.players.values()) if (p.state?.ride === owner) riders.push(p.id);
    if ((this.rideWith ?? this.ridePending) === owner) riders.push(this.g.net.myId);
    riders.sort();
    return riders.indexOf(player);
  }

  boardFriend(id: string) {
    const first = this.remotes.get(id);
    if (!first) return;
    this.g.fishing.reelIn();
    this.g.ui.prompt(null);
    this.g.audio.creak(0.2);
    this.g.strolling = false;
    this.g.social.patT = 0;
    const from = this.g.fisher.root.getWorldPosition(new THREE.Vector3());
    const fromYaw = this.g.cam.facingYaw();
    if (this.g.inBoat) {
      // Over the side, and your own boat goes home by itself.
      this.g.scene.add(this.g.fisher.root);
      this.g.fisher.root.position.copy(from);
      this.g.inBoat = false;
      this.g.boat.moored = true;
    }
    this.ridePending = id;
    const here = () => this.remotes.get(id)?.boat ?? null;
    this.g.tr = {
      t: 0, dur: 1.3, from,
      to: () => {
        const b = here();
        if (!b) return from;
        b.body.updateMatrixWorld();
        return b.passengerSeat(this.seatOf(this.g.net.myId, id), this.seatTmp).clone().applyMatrix4(b.body.matrixWorld);
      },
      fromYaw,
      toYaw: () => here()?.heading ?? fromYaw,
      done: () => {
        const b = here();
        this.ridePending = null;
        if (!b) return;
        this.rideWith = id;
        b.body.add(this.g.fisher.root);
        b.passengerSeat(this.seatOf(this.g.net.myId, id), this.g.fisher.root.position);
        this.g.fisher.root.rotation.set(0, 0, 0);
        this.g.fisherYaw = 0;
        this.g.mode = 'ride';
        this.g.water.splash(b.x, b.z, 0.7, 0.06);
        this.g.audio.splash(0.15);
      },
    };
    this.g.mode = 'transition';
  }

  /** Nearest place to step off: the jetty if it's alongside, otherwise the closest bit of solid ground in reach. */
  private landingNear(b: Boat): THREE.Vector3 | null {
    if (b.x < JETTY.startX + 3 && b.x > JETTY.endX - 3 && Math.abs(b.z) < 8) {
      return new THREE.Vector3(clamp(b.x, JETTY.endX + 0.6, JETTY.startX - 0.4), DECK_Y, Math.sign(b.z || 1) * 0.4);
    }
    for (let r = 2; r <= 12; r += 2) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const x = b.x + Math.cos(a) * r;
        const z = b.z + Math.sin(a) * r;
        const y = groundY(x, z);
        if (y > 0.3 && this.g.walkable(x, z)) return new THREE.Vector3(x, y, z);
      }
    }
    return null;
  }

  updateRide(dt: number) {
    const id = this.rideWith;
    const owner = id ? this.remotes.get(id) : null;
    if (!id || !owner) {
      this.endRide(null);
      return;
    }
    const b = owner.boat;
    // Shuffles up if someone ahead gets off.
    const seat = b.passengerSeat(this.seatOf(this.g.net.myId, id), this.seatTmp);
    this.g.fisher.root.position.lerp(seat, 1 - Math.exp(-dt * 5));
    const inp = this.g.input;
    const busy = this.g.fishing.active;
    const pad = inp.usingPad;
    const E = pad ? '<kbd>Square</kbd>' : '<kbd>E</kbd>';
    const landing = this.landingNear(b);
    if (!busy) this.g.ui.prompt(this.g.social.withSocial(landing ? `${E} step ashore` : null));
    if (!busy && (inp.was('KeyE') || inp.was('PadSquare'))) {
      if (landing) this.stepOff(landing);
      else this.g.ui.toast('Too far out to step off. Ask them to row closer.', 3);
    }
    if (!this.g.guns.gunOut) this.g.angling.handleCast(dt, new THREE.Vector3());
  }

  private stepOff(landing: THREE.Vector3) {
    this.g.fishing.reelIn();
    this.g.ui.prompt(null);
    this.g.audio.creak(0.2);
    const from = this.g.fisher.root.getWorldPosition(new THREE.Vector3());
    const fromYaw = this.g.cam.facingYaw();
    this.g.scene.add(this.g.fisher.root);
    this.g.fisher.root.position.copy(from);
    this.g.fisher.root.rotation.set(0, fromYaw, 0);
    this.rideWith = null;
    const toYaw = Math.atan2(-(landing.x - from.x), -(landing.z - from.z));
    this.g.tr = {
      t: 0, dur: 1.3, from, to: () => landing, fromYaw, toYaw: () => toYaw,
      done: () => {
        this.g.mode = 'walk';
        this.g.px = landing.x;
        this.g.pz = landing.z;
        this.g.py = landing.y;
        this.g.facing = toYaw;
      },
    };
    this.g.mode = 'transition';
  }

  /** The boat's gone: back to the jetty, by whatever means. */
  endRide(message: string | null) {
    this.rideWith = null;
    this.ridePending = null;
    this.g.tr = null;
    this.g.fishing.reelIn();
    this.g.scene.add(this.g.fisher.root);
    this.g.px = this.g.boat.home.x;
    this.g.pz = Math.sign(this.g.boat.home.z) * 0.4;
    this.g.py = DECK_Y;
    this.g.facing = -Math.PI / 2;
    this.g.speed = 0;
    this.g.fisher.root.position.set(this.g.px, this.g.py, this.g.pz);
    this.g.fisher.root.rotation.set(0, this.g.facing, 0);
    this.g.mode = 'walk';
    if (message) this.g.ui.toast(message, 5);
  }
}
