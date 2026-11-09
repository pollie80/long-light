// A friend, as seen on this screen: their fisher, their boat, their line and whatever is on it.
import * as THREE from 'three';
import { Boat } from '../actors/boat';
import { Pet } from '../actors/pet';
import { Fisher, PoseInput } from '../actors/fisher';
import { CharacterLook } from '../actors/look';
import { damp } from '../core/noise';
import { fishModel, disposeFish } from '../game/fishart';
import { neonOf, SPECIES } from '../game/fishdata';
import { makeBobber, setBobberStyle, setLineColour } from '../game/fishing';
import type { GunKind } from '../game/guns';
import { swellAt } from '../world/land';
import type { Water } from '../world/water';
import type { NetState } from './protocol';

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const LINE_POINTS = 18;

/** What a friend's figure needs to know about the rest of the cove, to sit in someone else's boat. */
export interface RemoteWorld {
  boatOf(id: string): Boat | null;
  seatOf(player: string, owner: string): number;
}

export class RemotePlayer {
  id = '';
  world: RemoteWorld | null = null;
  private attachedTo: THREE.Object3D | null = null;
  private seatTarget = new THREE.Vector3();
  private petSeat = new THREE.Vector3();
  fisher: Fisher;
  boat: Boat;
  pet: Pet;
  private bobber = makeBobber();
  private line: THREE.Line;
  private linePos = new Float32Array(LINE_POINTS * 3);
  private model: THREE.Group | null = null;
  private modelId = '';
  private lastFish = 'idle';
  private tag: HTMLDivElement;
  private seen = false;
  private inBoat = false;
  private x = 0;
  private y = 0;
  private z = 0;
  private yaw = 0;
  private fy = Math.PI;
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private recoil = 0;
  private patK = 0;
  private cheersK = 0;
  private tmp3 = new THREE.Vector3();
  private lastShots = -1;
  onShot: ((at: THREE.Vector3, kind: GunKind) => void) | null = null;
  private lure = new THREE.Vector3();

  constructor(private scene: THREE.Scene, private late: THREE.Scene, lineMat: THREE.Material, look: CharacterLook, name: string, uiRoot: HTMLElement) {
    this.fisher = new Fisher(look);
    this.boat = new Boat(look);
    this.pet = new Pet(look);
    scene.add(this.pet.root);
    this.pet.root.visible = false;
    scene.add(this.boat.group);
    scene.add(this.fisher.root);
    scene.add(this.fisher.rod);
    scene.add(this.fisher.gun);
    this.fisher.gun.visible = false;
    this.fisher.root.visible = false;
    this.fisher.rod.visible = false;
    this.boat.group.visible = false;
    this.bobber.visible = false;
    scene.add(this.bobber);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.linePos, 3));
    this.line = new THREE.Line(g, lineMat.clone());
    setBobberStyle(this.bobber, look.bobber);
    setLineColour(this.line.material as THREE.Material, look.line);
    this.line.frustumCulled = false;
    this.line.visible = false;
    late.add(this.line);
    this.tag = document.createElement('div');
    this.tag.className = 'nameTag';
    this.tag.textContent = name;
    uiRoot.appendChild(this.tag);
  }

  setName(name: string) {
    if (this.tag.textContent !== name) this.tag.textContent = name;
  }

  setLook(look: CharacterLook) {
    this.fisher.applyLook(look);
    this.boat.applyLook(look);
    this.pet.applyLook(look);
    setBobberStyle(this.bobber, look.bobber);
    setLineColour(this.line.material as THREE.Material, look.line);
    if (!this.seen) this.pet.root.visible = false;
  }

  /** Puts the figure in a boat, theirs or a friend's, or back on its own feet. */
  private setBoarded(v: boolean, vessel: Boat) {
    this.inBoat = v;
    const parent = v ? vessel.body : this.scene;
    if (this.attachedTo === parent) return;
    this.attachedTo = parent;
    parent.add(this.fisher.root);
    if (v) this.fisher.root.position.copy(this.seatTarget);
    else this.fisher.root.position.set(this.x, this.y, this.z);
  }

  update(dt: number, t: number, s: NetState | null, water: Water, camera: THREE.PerspectiveCamera, lampK: number, viewW: number, viewH: number) {
    if (!s) return;
    if (!this.seen) {
      // First sight: go straight there rather than sliding in from the origin.
      this.seen = true;
      this.x = s.x;
      this.y = s.y;
      this.z = s.z;
      this.yaw = s.yaw;
      this.fy = s.fy;
      this.boat.x = s.bx;
      this.boat.z = s.bz;
      this.boat.heading = s.bh;
      this.fisher.root.visible = true;
      this.fisher.rod.visible = true;
      this.boat.group.visible = true;
      this.pet.root.visible = this.pet.exists;
    }
    this.boat.puppet(dt, t, s.bx, s.bz, s.bh, s.bs, s.bp, s.bo, s.br, water);
    this.boat.mat.uniforms.uEmisOn.value = lampK;

    // Their own boat, or the one they've climbed into.
    const other = s.ride && this.world ? this.world.boatOf(s.ride) : null;
    const vessel = other ?? this.boat;
    const riding = other !== null;
    if (riding) other.passengerSeat(this.world!.seatOf(this.id, s.ride), this.seatTarget);
    else this.seatTarget.set(0, -0.03, -0.02);
    this.setBoarded(s.ib || riding, vessel);
    // Shuffling up when someone gets off, rather than jumping.
    if (s.ib || riding) this.fisher.root.position.lerp(this.seatTarget, 1 - Math.exp(-dt * 5));
    if (s.ib || riding) {
      this.fy += wrap(s.fy - this.fy) * (1 - Math.exp(-dt * 8));
      this.fisher.root.rotation.set(0, this.fy, 0);
    } else {
      this.x = damp(this.x, s.x, 11, dt);
      // Quicker than the rest, or a jump loses its height to the smoothing.
      this.y = damp(this.y, s.y, 20, dt);
      this.z = damp(this.z, s.z, 11, dt);
      this.yaw += wrap(s.yaw - this.yaw) * (1 - Math.exp(-dt * 11));
      this.fisher.root.position.set(this.x, this.y, this.z);
      this.fisher.root.rotation.set(0, this.yaw, 0);
    }

    const handleL = new THREE.Vector3();
    const handleR = new THREE.Vector3();
    if (s.ib) {
      this.boat.handle(1, handleL);
      this.boat.handle(0, handleR);
    }
    // Their shot: the flash, and the sound of it carrying across the water.
    if (this.lastShots === -1) this.lastShots = s.shots;
    if (s.shots !== this.lastShots) {
      this.lastShots = s.shots;
      this.recoil = 1;
      this.onShot?.(this.fisher.gunTip, s.gk);
    }
    this.recoil = Math.max(0, this.recoil - dt * 6);
    this.patK = damp(this.patK, s.pat && this.pet.exists ? 1 : 0, 7, dt);
    this.cheersK = damp(this.cheersK, s.ch ? 1 : 0, 8, dt);
    const fishing = s.fs !== 'idle' && !s.gun;
    const pose: PoseInput = {
      mode: s.mode,
      speed: s.sp,
      handleL,
      handleR,
      rowLean: s.br ? -Math.cos(s.bp) : -Math.cos(s.bp) * 0.25,
      fishing,
      rodDir: new THREE.Vector3(s.rx, s.ry, s.rz).normalize(),
      rodBend: s.bend,
      reelSpin: s.spin,
      beerOut: s.bOut,
      beerLift: s.bLift,
      air: s.air,
      gun: s.gun,
      gunKind: s.gk,
      lounge: s.lg,
      recoil: this.recoil,
      pat: this.patK,
      patAt: s.pat && this.pet.exists ? this.pet.headTop(this.tmp3) : undefined,
      cheers: this.cheersK,
    };
    this.fisher.update(dt, t, pose);
    this.pet.update(dt, t, {
      pos: this.fisher.root.getWorldPosition(this.tmp2),
      facing: s.ib ? s.bh : riding ? vessel.heading : this.yaw,
      speed: s.sp,
      inBoat: s.ib || riding,
      air: s.air,
      boat: vessel,
      patting: s.pat,
      rideSeat: riding ? this.petSeat.set(this.seatTarget.x, this.seatTarget.y + 0.36, this.seatTarget.z - 0.52) : undefined,
    });

    this.updateFishing(t, s, water);
    this.updateTag(camera, viewW, viewH);
  }

  private updateFishing(t: number, s: NetState, water: Water) {
    const lineOut = s.fs === 'flight' || s.fs === 'wait' || s.fs === 'bite' || s.fs === 'reel' || s.fs === 'landed';
    this.lure.set(s.lx, s.ly, s.lz);
    // Moments that make a mark on the water.
    if (this.lastFish === 'flight' && s.fs === 'wait') water.splash(s.lx, s.lz, 0.6, 0.15);
    if (this.lastFish === 'wait' && s.fs === 'bite') water.splash(s.lx, s.lz, 0.7, 0.2);
    if (this.lastFish === 'released' && s.fs === 'idle' && this.model) water.splash(this.model.position.x, this.model.position.z, 0.55, 0.18);
    this.lastFish = s.fs;

    const swell = swellAt(s.lx, s.lz, t);
    const onWater = s.fs === 'wait' || s.fs === 'bite' || s.fs === 'reel';
    this.bobber.visible = s.fs === 'flight' || onWater;
    if (this.bobber.visible) {
      this.bobber.position.set(s.lx, onWater ? swell - (s.fs === 'bite' ? 0.08 + Math.max(0, Math.sin(t * 7)) * 0.12 : 0.02) : s.ly, s.lz);
    }

    const wantFish = (s.fs === 'reel' || s.fs === 'landed' || s.fs === 'released') && !!s.fish;
    const wantId = s.fn ? `${s.fish}~` : s.fish;
    if (wantFish && this.modelId !== wantId) {
      this.dropModel();
      const sp = SPECIES.find((x) => x.id === s.fish);
      if (sp) {
        this.model = fishModel(s.fn ? neonOf(sp) : sp);
        this.modelId = wantId;
        this.scene.add(this.model);
      }
    }
    if (!wantFish) this.dropModel();
    if (this.model) {
      if (s.fs === 'reel') {
        // A leap shows as height on the lure.
        const up = Math.max(0, s.ly);
        this.model.position.set(s.lx, -0.28 + (up > 0.02 ? up + 0.28 : 0), s.lz);
        this.model.rotation.set(up > 0.02 ? 0.4 : 0, t * 0.8, Math.sin(t * (up > 0.02 ? 26 : 7)) * (up > 0.02 ? 0.35 : 0.12), 'YXZ');
      } else {
        this.model.position.set(s.lx, s.ly, s.lz);
        this.model.rotation.set(-Math.PI / 2 + Math.sin(t * 5.5) * 0.08, t * 0.6, 0, 'YXZ');
      }
    }

    this.line.visible = lineOut;
    if (lineOut) {
      const a = this.fisher.rodTip;
      const b = onWater ? this.bobber.position : this.lure;
      const taut = s.fs === 'reel' || s.fs === 'landed' ? 0.05 : s.fs === 'bite' ? 0.25 : 0.65;
      const dist = a.distanceTo(b);
      for (let i = 0; i < LINE_POINTS; i++) {
        const k = i / (LINE_POINTS - 1);
        const sag = Math.sin(k * Math.PI) * dist * 0.075 * taut;
        this.linePos[i * 3] = a.x + (b.x - a.x) * k;
        this.linePos[i * 3 + 1] = a.y + (b.y - a.y) * k - sag;
        this.linePos[i * 3 + 2] = a.z + (b.z - a.z) * k;
      }
      (this.line.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  private dropModel() {
    if (this.model) {
      disposeFish(this.model);
      this.model = null;
    }
    this.modelId = '';
  }

  private updateTag(camera: THREE.PerspectiveCamera, w: number, h: number) {
    const p = this.fisher.root.getWorldPosition(this.tmp);
    const d = camera.position.distanceTo(p);
    p.y += this.fisher.eyeHeight + 0.62;
    p.project(camera);
    const show = p.z < 1 && d < 170 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1;
    if (!show) {
      this.tag.style.opacity = '0';
      return;
    }
    this.tag.style.opacity = String(Math.max(0.35, 1 - Math.max(0, d - 40) / 170));
    this.tag.style.transform = `translate(-50%, -100%) translate(${((p.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-p.y * 0.5 + 0.5) * h).toFixed(1)}px)`;
  }

  dispose() {
    this.dropModel();
    this.pet.dispose();
    this.scene.remove(this.boat.group);
    this.scene.remove(this.fisher.root);
    this.scene.remove(this.fisher.rod);
    this.scene.remove(this.fisher.gun);
    this.scene.remove(this.bobber);
    this.late.remove(this.line);
    this.line.geometry.dispose();
    this.tag.remove();
  }
}
