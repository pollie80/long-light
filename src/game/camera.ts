// The camera: behind the fisher, round the wardrobe, down the sights, into the fisher's own eyes, and the slow drift on the title.
import * as THREE from 'three';
import { COTTAGE, groundY, pathPoint } from '../world/land';
import { lookAt } from '../core/time';
import { clamp, damp, smoothstep } from '../core/noise';
import { GUNS } from './guns';
import { Q } from '../core/quality';
import { wrapAngle } from '../core/noise';
import { START } from '../world/land';
import type { Game } from './game';

export class CameraRig {
  constructor(readonly g: Game) {}

  // Camera.
  yaw = Math.PI / 2 - 0.05;
  pitch = 0.09;
  dist = 6;
  fov = 44;
  focus = new THREE.Vector3(START.x, START.y + 1.3, START.z);
  camFrom = new THREE.Vector3();
  camFromQ = new THREE.Quaternion();
  introT = 0;
  private sideNow = 0.75;
  wardrobeAngle = 0.35;
  wardrobeDist = 3.1;
  private wardrobeGear = false;
  wardrobeKind: 'self' | 'boat' | 'pet' = 'self';

  aimDir(): THREE.Vector3 {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
  }

  rodAim(): THREE.Vector3 {
    const a = this.aimDir();
    const up = new THREE.Vector3(0, 1, 0);
    const f = this.g.fishing;
    const v = new THREE.Vector3();
    switch (f.state) {
      case 'charge': return v.copy(a).multiplyScalar(-0.3 - f.charge * 0.55).addScaledVector(up, 0.85).normalize();
      case 'flight': return v.copy(a).multiplyScalar(0.85).addScaledVector(up, 0.45).normalize();
      case 'wait': return v.copy(a).multiplyScalar(0.78).addScaledVector(up, 0.42 + Math.sin(this.g.time * 0.8) * 0.02).normalize();
      case 'bite': return v.copy(a).multiplyScalar(0.72).addScaledVector(up, 0.42).normalize();
      case 'reel': return v.copy(a).multiplyScalar(0.55).addScaledVector(up, 0.82).normalize();
      case 'landed': return v.copy(a).multiplyScalar(0.48).addScaledVector(up, 0.86).normalize();
      default: return v.copy(a).multiplyScalar(0.8).addScaledVector(up, 0.6).normalize();
    }
  }

  updateCamera(dt: number) {
    const inp = this.g.input;
    const looked = Math.abs(inp.lookX) + Math.abs(inp.lookY) > 0.0005;
    if (!this.g.anyMenuOpen()) {
      // Zoomed in, the same hand movement turns the view less.
      const slow = this.g.guns.gunOut ? Math.min(1, this.g.camera.fov / 40) : 1;
      this.yaw -= inp.lookX * slow;
      this.pitch = this.g.rest.relax ? clamp(this.pitch + inp.lookY, -1.3, 1.25) : clamp(this.pitch + inp.lookY * slow, -0.55, 1.1);
    }
    const moving = Math.abs(inp.moveX) + Math.abs(inp.moveY) > 0.02;
    if (looked || moving || inp.action) this.g.idleT = 0;
    else this.g.idleT += dt;

    // In front of the mirror, as it were.
    if (this.g.ui.wardrobe.open) {
      if (inp.dragging) this.wardrobeAngle -= inp.lookX * 1.6;
      const kind = this.wardrobeKind === 'pet' && !this.g.pet.exists ? 'self' : this.wardrobeKind;
      const [dMin, dMax] = kind === 'boat' ? [4, 16] : kind === 'pet' ? [0.8, 4] : [0.95, 4.6];
      const gear = kind === 'self' && this.g.ui.wardrobe.group === 'Gear';
      if (gear !== this.wardrobeGear) {
        this.wardrobeGear = gear;
        if (gear) this.wardrobeDist = Math.max(this.wardrobeDist, 4.4);
      }
      this.wardrobeDist = clamp(this.wardrobeDist * Math.exp(inp.wheel * 0.0011), dMin, dMax);
      inp.wheel = 0;
      const p = kind === 'boat' ? new THREE.Vector3(this.g.boat.x, this.g.boat.y, this.g.boat.z) : kind === 'pet' ? this.g.pet.worldPos() : this.g.fisher.root.getWorldPosition(new THREE.Vector3());
      const eye = kind === 'boat' ? 1.7 : kind === 'pet' ? 0.5 : this.g.fisher.eyeHeight;
      const seated = kind === 'self' && (this.g.seated || this.g.mode === 'sit');
      const top = seated ? eye - 0.42 : eye;
      const close = kind === 'self' ? 1 - smoothstep(1.2, 2.6, this.wardrobeDist) : 0;
      const fy = p.y + top * (0.62 + 0.38 * close);
      const a = (kind === 'boat' ? this.g.boat.heading : this.facingYaw()) + Math.PI + this.wardrobeAngle;
      const cx = p.x + Math.sin(a) * this.wardrobeDist;
      const cz = p.z + Math.cos(a) * this.wardrobeDist;
      // Up close, look from just under the hat brim, so the face can be seen.
      const cy = Math.max(fy + 0.08 - 0.17 * close, Math.max(groundY(cx, cz), 0) + 0.4);
      this.g.camera.position.set(cx, cy, cz);
      // Aim past the figure so it stands clear of the page on the left.
      const left = new THREE.Vector3(-Math.cos(a), 0, Math.sin(a)).multiplyScalar(this.wardrobeDist * 0.21);
      this.g.camera.lookAt(p.x + left.x, fy, p.z + left.z);
      if (this.g.camera.fov !== 36) {
        this.g.camera.fov = 36;
        this.fov = 36;
        this.g.camera.updateProjectionMatrix();
      }
      this.g.idleT = 0;
      return;
    }
    inp.wheel = 0;

    // Sighting along the gun, just behind the right shoulder. Aiming brings the view in; with the rifle, right
    // up to the eye and through the scope.
    if (this.g.guns.gunOut && this.g.guns.canHoldGun) {
      this.pitch = clamp(this.pitch, -1.25, 0.55);
      const spec = GUNS[this.g.guns.gunKind];
      const scope = spec.scope ? smoothstep(0.1, 0.9, this.g.guns.aimK) : 0;
      const cp = Math.cos(this.pitch);
      const dir = new THREE.Vector3(-Math.sin(this.yaw) * cp, -Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
      const head = this.g.fisher.root.getWorldPosition(new THREE.Vector3());
      head.y += this.g.fisher.eyeHeight - (this.g.seated ? 0.42 : 0.02);
      const side = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const near = spec.scope ? 0 : this.g.guns.aimK;
      const pos = head.clone().addScaledVector(side, 0.68 - near * 0.2).addScaledVector(dir, -2.4 + near * 1.0);
      pos.y += 0.18 - near * 0.06 + this.g.guns.recoil * 0.05;
      pos.y = Math.max(pos.y, Math.max(groundY(pos.x, pos.z), 0.25) + 0.3);
      if (scope > 0) pos.lerp(this.g.rest.eyePos(this.g.rest.eyeTmp).addScaledVector(dir, 0.12), scope);
      this.g.camera.position.lerp(pos, scope > 0.5 ? 1 : 1 - Math.exp(-dt * 16));
      this.g.camera.lookAt(this.g.camera.position.clone().addScaledVector(dir, 60));
      this.fov = damp(this.fov, spec.scope ? 40 - scope * 32 : 40 - this.g.guns.aimK * 11, 12, dt);
      if (this.g.camera.fov !== this.fov) {
        this.g.camera.fov = this.fov;
        this.g.camera.updateProjectionMatrix();
      }
      // Through the scope there's no head in the way, and no gun either.
      this.g.fisher.setFirstPerson(scope > 0.5);
      if (scope > 0.5) this.g.fisher.gun.visible = false;
      this.g.idleT = 0;
      return;
    }
    if (this.g.rest.relaxK <= 0) this.g.fisher.setFirstPerson(false);

    // Target.
    let desiredDist = 6.4;
    let fov = 44;
    let sideOffset = 0.75;
    const focus = new THREE.Vector3();
    if (this.g.mode === 'row' || this.g.mode === 'ride' || (this.g.mode === 'transition' && this.g.inBoat)) {
      const v = this.g.vessel;
      focus.set(v.x, v.y + 1.15 * this.g.fisher.look.height, v.z);
      desiredDist = 8.2;
      fov = 42;
      sideOffset = 0.9;
      // Settles in behind the boat on a long turn.
      if (!looked && !this.g.fishing.active && !this.g.rest.relax && Math.abs(this.g.boat.turnRate) > 0.02) {
        this.yaw += wrapAngle(this.g.boat.heading - this.yaw) * (1 - Math.exp(-dt * 1.5));
      }
    } else if (this.g.mode === 'sit') {
      focus.set(this.g.px, this.g.py + 1.05 * this.g.fisher.look.height, this.g.pz);
      desiredDist = 6.8;
      fov = 38;
      sideOffset = 1.0;
    } else {
      const p = this.g.fisher.root.getWorldPosition(new THREE.Vector3());
      focus.set(p.x, p.y + 1.32 * this.g.fisher.look.height, p.z);
      if (this.g.strolling && !looked) {
        const lead = this.g.facing;
        this.yaw += wrapAngle(lead - this.yaw) * (1 - Math.exp(-dt * 0.38));
      }
      fov = 44 + Math.max(0, this.g.speed - 2.6) * 0.8;
    }
    if (this.g.fishing.state === 'landed') {
      desiredDist -= 1.4;
      fov -= 3;
    }
    // After a long stillness the camera breathes slowly round on its own.
    if (this.g.idleT > 35 && this.g.mode !== 'title' && this.g.rest.relaxK <= 0) {
      const k = smoothstep(35, 50, this.g.idleT);
      this.yaw += dt * 0.012 * k;
    }

    // A sip brings the view in a little, and centres the figure.
    if (this.g.beer.lift > 0.05 && this.g.speed < 0.4) {
      desiredDist *= 0.68;
      sideOffset = 0;
    }
    // So does a pat, and lower, where the hand and the pet are.
    if (this.g.social.patK > 0.05) {
      desiredDist *= 1 - this.g.social.patK * (this.g.seated ? 0.5 : 0.48);
      sideOffset = 0;
      focus.y -= this.g.social.patK * (this.g.seated ? 0.35 : 0.72);
    }
    // Compose to one side: the eye goes past the figure, out to the water.
    this.sideNow = damp(this.sideNow, this.g.fishing.state === 'landed' ? 0 : sideOffset, 1.6, dt);
    focus.x += Math.cos(this.yaw) * this.sideNow;
    focus.z += -Math.sin(this.yaw) * this.sideNow;
    this.focus.x = damp(this.focus.x, focus.x, 7, dt);
    this.focus.y = damp(this.focus.y, focus.y, 5, dt);
    this.focus.z = damp(this.focus.z, focus.z, 7, dt);
    this.dist = damp(this.dist, desiredDist, 2.2, dt);
    this.fov = damp(this.fov, fov, 2, dt);

    // During a sip seen from behind, the view eases round to the side the bottle is on.
    const seesBack = Math.cos(wrapAngle(this.yaw - this.facingYaw())) > 0.2;
    const orbitWant = (this.g.beer.lift > 0.05 && this.g.speed < 0.4 && seesBack) || (this.g.social.patT > 0 && seesBack) ? 1.32 : 0;
    this.g.beerOrbit = damp(this.g.beerOrbit, orbitWant, 1.5, dt);
    const viewYaw = this.yaw - this.g.beerOrbit;

    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    const pos = new THREE.Vector3(this.focus.x + Math.sin(viewYaw) * cp * this.dist, this.focus.y + sp * this.dist, this.focus.z + Math.cos(viewYaw) * cp * this.dist);
    // On a slope, step in closer rather than climbing above the fisher and staring at the ground.
    let useDist = this.dist;
    const inBuilding = (p: THREE.Vector3) =>
      (p.x > COTTAGE.x - 5.0 && p.x < COTTAGE.x + 3.9 && Math.abs(p.z - COTTAGE.z) < 5.8 && p.y < COTTAGE.y + 6.2) ||
      (p.x > 24.6 && p.x < 29.4 && p.z > -19 && p.z < -13 && p.y < 5);
    for (let i = 0; i < 12; i++) {
      const gy = groundY(pos.x, pos.z);
      const floor = gy > 0.2 ? gy + 0.95 : Math.max(gy, 0) + 0.42;
      const blocked = inBuilding(pos);
      if ((pos.y >= floor && !blocked) || useDist < (blocked ? 1.2 : 2.6)) break;
      useDist *= 0.84;
      pos.set(this.focus.x + Math.sin(viewYaw) * cp * useDist, this.focus.y + sp * useDist, this.focus.z + Math.cos(viewYaw) * cp * useDist);
    }
    const gyFinal = groundY(pos.x, pos.z);
    const floorFinal = gyFinal > 0.2 ? gyFinal + 0.95 : Math.max(gyFinal, 0) + 0.42;
    if (pos.y < floorFinal) pos.y = floorFinal;

    if (this.g.mode === 'title') return;

    if (this.g.mode === 'intro') {
      this.introT += dt / 4.2;
      const k = smoothstep(0, 1, this.introT);
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(pos, this.focus, new THREE.Vector3(0, 1, 0)));
      this.g.camera.position.lerpVectors(this.camFrom, pos, k);
      this.g.camera.quaternion.slerpQuaternions(this.camFromQ, q, k);
      if (this.introT >= 1) {
        this.g.mode = 'walk';
        this.g.ui.hint(this.g.input.usingPad
          ? 'left stick to run, right stick to look<br><kbd>Triangle</kbd> stroll, <kbd>Square</kbd> use, <kbd>L1</kbd> a beer, <kbd>Options</kbd> menu'
          : '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> to run, mouse to look<br><kbd>Q</kbd> stroll along the path by itself<br><kbd>Space</kbd> jump, <kbd>E</kbd> use, <kbd>B</kbd> a beer, <kbd>Esc</kbd> menu', 14);
      }
    } else {
      this.g.camera.position.copy(pos);
      this.g.camera.lookAt(this.focus);
    }
    let fovNow = this.fov;
    // Sitting back: the view glides in over the shoulder and into the fisher's own eyes.
    if (this.g.rest.relaxK > 0 && this.g.mode !== 'intro') {
      const k = this.g.rest.relaxK;
      const e = k * k * k * (k * (k * 6 - 15) + 10);
      // While it settles, the eyes come up to the horizon, unless you look somewhere yourself.
      if (this.g.rest.relax && k < 1 && !looked) {
        this.pitch = damp(this.pitch, 0.06, 1.4, dt);
        // And round to the way the fisher is facing, so you look out of your own eyes, not over your shoulder.
        this.yaw += wrapAngle(this.facingYaw() - this.yaw) * (1 - Math.exp(-dt * 2.4));
      }
      const cpR = Math.cos(this.pitch);
      const look = new THREE.Vector3(-Math.sin(this.yaw) * cpR, -Math.sin(this.pitch), -Math.cos(this.yaw) * cpR);
      const eye = this.g.rest.eyePos(this.g.rest.eyeTmp);
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(eye, eye.clone().add(look), new THREE.Vector3(0, 1, 0)));
      this.g.camera.position.lerp(eye, e);
      this.g.camera.quaternion.slerp(q, e);
      fovNow = this.fov + (58 - this.fov) * e;
      this.g.fisher.setFirstPerson(e > 0.82);
      this.g.idleT = 0;
    }
    if (Math.abs(this.g.camera.fov - fovNow) > 0.01) {
      this.g.camera.fov = fovNow;
      this.g.camera.updateProjectionMatrix();
    }
  }

  facingYaw(): number {
    return this.g.seated ? this.g.vessel.heading + this.g.fisherYaw : this.g.facing;
  }

  titleCamera(t: number) {
    // A slow drift across the meadow, looking out to the bay.
    const a = Math.sin(t * 0.03) * 0.5 + 0.5;
    const camX = 72 + a * 6;
    const camZ = -13 + a * 3;
    this.g.camera.position.set(camX, Math.max(13.5 + a * 1.2, groundY(camX, camZ) + 4), camZ);
    this.g.camera.lookAt(-140, 7, 18 + a * 8);
    if (this.g.camera.fov !== 42) {
      this.g.camera.fov = 42;
      this.g.camera.updateProjectionMatrix();
    }
  }
}
