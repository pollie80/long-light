// Ties the place, the fisher and the day together.
import * as THREE from 'three';
import { bakeCloud3D, bakeNoise2D, bakeTransmittance, makeDabAtlas } from '../render/bakes';
import { Pipeline } from '../render/pipeline';
import { Sky, SkyWeather } from '../render/sky';
import { Shadows } from '../render/shadows';
import { L, MAX_LIGHTS, U } from '../render/shared';
import { Water } from '../world/water';
import { makeFarMountains, makeTerrain } from '../world/terrain';
import { cullGrass, makeGrass, makeRocks, makeTrees } from '../world/foliage';
import { makeProps, PropWorld } from '../world/props';
import { Life } from '../world/life';
import { BOAT_SLOTS, coastSD, COTTAGE, DECK_Y, groundY, JETTY, MAGIC_SPOTS, onJetty, PATH, pathDistance, pathPoint, PATH_LENGTH, slopeAt } from '../world/land';
import { Boat } from '../actors/boat';
import { Fisher, PoseInput, PoseMode } from '../actors/fisher';
import { Fishing } from './fishing';
import { Beer } from './beer';
import { advanceHour, Look, keyIsMoon, lookAt, moonDir, nightMagic, phaseOf, skyMoodAt, sunDir } from '../core/time';
import { Input } from '../core/input';
import { CharacterLook, cleanLook } from '../actors/look';
import { AudioWorld, Surface } from '../audio/audio';
import { Journal, UI } from '../ui/ui';
import { clamp, damp, smoothstep } from '../core/noise';
import { Net, NetPlayer } from '../net/net';
import { RemotePlayer } from '../net/remote';
import { cleanName, codeFromHash, inviteLink, NetState } from '../net/protocol';
import { SPECIES } from './fishdata';

type Mode = 'title' | 'intro' | 'walk' | 'transition' | 'row' | 'sit';

const SAVE_KEY = 'longlight.save.v1';
const DOOR = { x: 112.4, z: COTTAGE.z };
const START = pathPoint(9);

interface Save { journal: Journal; paint: number; music: number; sfx: number; sensitivity: number; muteAway: boolean; name: string; look?: Partial<CharacterLook> }

function loadSave(): Save {
  const d: Save = { journal: {}, paint: 6, music: 0.7, sfx: 0.9, sensitivity: 1, muteAway: true, name: '' };
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return { ...d, ...JSON.parse(raw) };
  } catch {
    /* A private window has no storage. The game simply starts fresh. */
  }
  return d;
}

const EMPTY_LINES = [
  'Empty. There is always another in the basket.',
  'That one went down easy.',
  'The sun did not mind waiting.',
];

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export class Game {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(44, 1, 0.3, 30000);
  pipe: Pipeline;
  input: Input;
  audio = new AudioWorld();
  ui: UI;
  save = loadSave();

  sky!: Sky;
  grass!: THREE.Group;
  shadows!: Shadows;
  water!: Water;
  props!: PropWorld;
  life!: Life;
  boat!: Boat;
  fisher!: Fisher;
  fishing!: Fishing;
  beer = new Beer();
  net: Net;
  private remotes = new Map<string, RemotePlayer>();
  private lineMat!: THREE.Material;
  private netError = '';
  private netStatus = '';
  private joinCode: string | null = null;
  private clockSendT = 0;
  private clockTouchedAt = -1e9;
  private qualityT = 0;
  private lampK = 0;
  private lastPose: PoseInput | null = null;

  // Every visit starts late in the afternoon, so the walk down to the boat leads into the sunset.
  hour = 17.72;
  clockRunning = true;
  time = 0;
  look: Look = lookAt(17.72);
  weather: SkyWeather = { cover: 0.5, cirrus: 0.5, alto: 0.5, hero: 1, seedX: 0.13, seedY: 0.37 };
  sun = new THREE.Vector3();
  moon = new THREE.Vector3();
  keyDir = new THREE.Vector3();
  skyI = 2;

  mode: Mode = 'title';
  // Walking.
  px = START.x;
  pz = START.z;
  py = START.y;
  facing = Math.PI / 2;
  speed = 0;
  private strolling = false;
  private strollS = 9;
  private strollDir = 1;
  // Boat seat.
  private fisherYaw = Math.PI;
  private inBoat = false;
  private sitKind: 'dock' | 'bench' = 'dock';
  // Camera.
  yaw = Math.PI / 2 - 0.05;
  pitch = 0.09;
  dist = 6;
  fov = 44;
  focus = new THREE.Vector3(START.x, START.y + 1.3, START.z);
  private camFrom = new THREE.Vector3();
  private camFromQ = new THREE.Quaternion();
  private introT = 0;
  private sideNow = 0.75;
  private wardrobeAngle = 0.35;
  private wardrobeDist = 3.1;
  private unlockedFor = 0;
  private magicNoticed = -1;
  private beerOrbit = 0;
  private idleT = 0;
  // Transition between jetty and boat.
  private tr: { t: number; dur: number; from: THREE.Vector3; to: () => THREE.Vector3; fromYaw: number; toYaw: () => number; done: () => void } | null = null;
  private fade = 0;
  private fadeTarget = 0;
  private restTo: number | null = null;
  private wordsHidden = false;
  private wantShot = false;
  private fpsAvg = 60;
  private frameMs = 16;
  private lastNow = 0;
  private hintedCast = false;
  private hintedBoat = false;
  private catchUp = false;
  private cardOpen = false;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.pipe = new Pipeline(renderer);
    this.input = new Input(renderer.domElement);
    this.ui = new UI({
      resume: () => this.closeMenus(),
      journal: () => {
        this.ui.showMenu(false);
        this.audio.pageTurn();
        this.ui.showJournal(true, this.save.journal, this.input.usingPad ? '<kbd>Circle</kbd>' : '<kbd>J</kbd> or <kbd>Esc</kbd>');
      },
      quit: () => window.close(),
      savePainting: () => {
        this.wantShot = true;
      },
      setHour: (h) => this.setHour(h, true),
      getHour: () => this.hour,
      setClockRunning: (v) => {
        this.clockRunning = v;
        this.net.clockChanged(this.hour, v);
      },
      getClockRunning: () => this.clockRunning,
      setPaint: (v) => {
        this.save.paint = v;
        this.applyPaint();
        this.writeSave();
        this.ui.refreshMenu();
      },
      getPaint: () => this.save.paint,
      setMusic: (v) => {
        this.save.music = v;
        this.audio.setVolumes(v, this.save.sfx);
        this.writeSave();
        this.ui.refreshMenu();
      },
      getMusic: () => this.save.music,
      setSfx: (v) => {
        this.save.sfx = v;
        this.audio.setVolumes(this.save.music, v);
        this.writeSave();
        this.ui.refreshMenu();
      },
      getSfx: () => this.save.sfx,
      rest: (h) => {
        this.restTo = h;
        this.fadeTarget = 1;
        this.input.lock();
      },
      sound: (k) => (k === 'tick' ? this.audio.uiTick() : this.audio.pageTurn()),
      setSensitivity: (v) => {
        this.save.sensitivity = v;
        this.input.sensitivity = v;
        this.writeSave();
        this.ui.refreshMenu();
      },
      getSensitivity: () => this.save.sensitivity,
      setMuteAway: (v) => {
        this.save.muteAway = v;
        this.writeSave();
      },
      getMuteAway: () => this.save.muteAway,
      wardrobe: () => this.openWardrobe(),
      friends: () => this.openFriends(),
      closeFriends: () => this.closeFriends(),
      play: () => this.startPlay(),
      startHosting: (name) => {
        this.setName(name);
        this.netError = '';
        this.audio.uiTick();
        this.net.host(this.playerName(), this.fisher.look);
        this.renderFriends();
      },
      joinCove: (name) => this.joinCove(name),
      leaveCove: () => {
        this.net.leave();
        this.netStatus = '';
        this.netError = '';
        this.setBoatSlot(0);
        this.renderFriends();
      },
      setName: (name) => this.setName(name),
      getName: () => this.save.name,
    }, {
      get: () => this.fisher.look,
      set: (l) => {
        this.fisher.applyLook(l);
        this.save.look = l;
        this.writeSave();
        this.net.sendLook(l);
      },
      close: () => this.closeMenus(),
      tick: () => this.audio.uiTick(),
    });
    this.net = new Net({
      onStatus: (text) => {
        this.netStatus = text;
        if (this.ui.joining) this.ui.joinStatus(text);
        this.renderFriends();
      },
      onChange: () => this.renderFriends(),
      onWelcome: (slot, hour, running, time) => {
        this.setBoatSlot(slot);
        this.time = time;
        this.hour = hour;
        this.clockRunning = running;
        this.sky.fastCycles = 4;
        this.ui.joinStatus('');
        this.ui.showJoin(false);
        this.startPlay();
        this.ui.toast('You are in the cove.', 3.5);
      },
      onFail: (message) => {
        this.netError = message;
        this.netStatus = '';
        if (this.ui.joining) this.ui.joinStatus(message, true);
        else if (!this.ui.friendsOpen) this.ui.toast(message, 6);
        this.renderFriends();
      },
      onClock: (hour, running, time) => this.syncClock(hour, running, time),
      onJoin: (p) => {
        this.audio.uiTick();
        this.ui.toast(`${p.name} joined the cove.`, 4);
      },
      onLeave: (p) => {
        const r = this.remotes.get(p.id);
        if (r) {
          r.dispose();
          this.remotes.delete(p.id);
        }
        if (this.net.live) this.ui.toast(`${p.name} left.`, 3.5);
      },
      onHostLost: () => {
        this.setBoatSlot(0);
        this.ui.toast('Your friend closed their game. You can keep fishing here.', 6);
        this.renderFriends();
      },
      onLook: (p) => this.remotes.get(p.id)?.setLook(p.look),
      onCatch: (p, species) => {
        const sp = SPECIES.find((s) => s.id === species);
        if (sp) this.ui.toast(`${p.name} caught a ${sp.name}.`, 4.5);
      },
    });
    this.net.getClock = () => ({ hour: this.hour, running: this.clockRunning, time: this.time });
    // A covered or minimised window stops drawing, but friends are still here.
    window.setInterval(() => this.keepFriendsGoing(), 1000);
    this.input.sensitivity = this.save.sensitivity;
    this.audio.musicVol = this.save.music;
    this.audio.sfxVol = this.save.sfx;
    this.input.onLockChange = (locked) => {
      // Esc releases the pointer in the browser, which is also the moment to open the menu.
      if (!locked && this.mode !== 'title' && !this.anyMenuOpen()) this.openMenu();
    };
    renderer.domElement.addEventListener('mousedown', () => {
      if (this.mode !== 'title' && !this.anyMenuOpen()) this.input.lock();
    });
    window.addEventListener('resize', () => this.resize());
  }

  private writeSave() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.save));
    } catch {
      /* Nothing to do without storage. */
    }
  }

  private anyMenuOpen() {
    return this.ui.menuOpen || this.ui.journalOpen || this.ui.restOpen || this.ui.wardrobe.open || this.ui.friendsOpen;
  }

  private openMenu() {
    this.input.unlock();
    this.audio.pageTurn();
    this.ui.showMenu(true);
  }

  private closeMenus() {
    this.ui.showMenu(false);
    this.ui.showJournal(false, this.save.journal, '');
    this.ui.showRest(false);
    this.ui.showFriends(false);
    if (this.ui.wardrobe.open) {
      this.ui.setWardrobe(false);
      this.applyPaint();
    }
    this.audio.uiTick();
    if (this.mode !== 'title') this.input.lock();
    else this.ui.showTitle(true);
  }

  private openFriends() {
    this.ui.showMenu(false);
    this.ui.showTitle(false);
    this.input.unlock();
    this.ui.prompt(null);
    this.ui.showFriends(true);
    this.renderFriends();
    this.audio.pageTurn();
  }

  private closeFriends() {
    this.ui.showFriends(false);
    this.audio.uiTick();
    if (this.mode === 'title') {
      this.ui.showTitle(true);
      return;
    }
    // Back to the page it was opened from.
    this.ui.showMenu(true);
  }

  private playerName(): string {
    return cleanName(this.save.name);
  }

  private setName(name: string) {
    const clean = name.trim().slice(0, 20);
    this.save.name = clean;
    this.writeSave();
    if (this.net.live) this.net.sendName(this.playerName());
    this.renderFriends();
  }

  private renderFriends() {
    const people = [] as { name: string; you: boolean; host: boolean }[];
    if (this.net.live) {
      people.push({ name: this.playerName(), you: true, host: this.net.role === 'host' });
      for (const p of this.net.players.values()) people.push({ name: p.name, you: false, host: p.id === 'host' });
    }
    this.ui.renderFriends({
      role: this.net.role,
      link: this.net.ready ? inviteLink(this.net.code) : '',
      status: this.netStatus,
      error: this.netError,
      people,
    });
  }

  private joinCove(name: string) {
    if (!this.joinCode) return;
    this.setName(name);
    this.audio.init();
    this.netError = '';
    this.ui.joinStatus('Connecting…');
    this.net.join(this.joinCode, this.playerName(), this.fisher.look);
  }

  private setBoatSlot(slot: number) {
    const s = BOAT_SLOTS[slot] ?? BOAT_SLOTS[0];
    this.boat.home = { x: s.x, z: s.z };
    if (this.boat.moored && !this.inBoat) {
      this.boat.x = s.x;
      this.boat.z = s.z;
    }
  }

  /** The clock here was changed by hand: everyone else needs to know. */
  private clockChanged() {
    this.clockTouchedAt = performance.now();
    this.net.clockChanged(this.hour, this.clockRunning);
  }

  private syncClock(hour: number, running: boolean, time: number) {
    // While you are moving the sun yourself, your own hand wins over the echo from the host.
    if (this.net.role === 'guest' && performance.now() - this.clockTouchedAt < 700) return;
    const diff = Math.abs(((hour - this.hour + 36) % 24) - 12);
    if (diff > 0.25) this.sky.fastCycles = 4;
    // Small differences are only drift; a little nudge keeps it from showing.
    if (diff > 0.02) this.hour = hour;
    this.clockRunning = running;
    if (this.net.role === 'guest' && Math.abs(time - this.time) > 3) this.time = time;
    if (this.net.role === 'host') this.net.pushClock();
  }

  private netState(): NetState {
    const b = this.boat;
    const f = this.fishing;
    const root = this.fisher.root;
    const p = root.getWorldPosition(new THREE.Vector3());
    const r = (v: number) => Math.round(v * 1000) / 1000;
    const pose = this.lastPose ?? this.buildPose();
    const rod = pose.rodDir!;
    return {
      x: r(p.x), y: r(p.y), z: r(p.z), yaw: r(this.inBoat ? 0 : root.rotation.y),
      mode: pose.mode,
      sp: r(pose.speed),
      ib: this.inBoat, fy: r(this.fisherYaw),
      bx: r(b.x), bz: r(b.z), bh: r(b.heading), bp: r(b.oarPhase), bo: b.oarOut > 0.5, br: b.rowing, bs: r(b.speed),
      fs: f.state,
      lx: r(f.lure.x), ly: r(f.lure.y), lz: r(f.lure.z),
      rx: r(rod.x), ry: r(rod.y), rz: r(rod.z),
      bend: r(pose.rodBend ?? 0), spin: r(pose.reelSpin ?? 0),
      fish: f.species && (f.state === 'reel' || f.state === 'landed' || f.state === 'released') ? f.species.id : '',
      bOut: r(this.beer.out), bLift: r(this.beer.lift),
    };
  }

  private updateFriends(dt: number, t: number, lampK: number) {
    if (!this.net.live && this.remotes.size === 0) return;
    this.net.tick(dt, () => this.netState());
    for (const p of this.net.players.values()) {
      let r = this.remotes.get(p.id);
      if (!r) {
        r = new RemotePlayer(this.scene, this.pipe.late, this.lineMat, p.look, p.name, document.getElementById('ui')!);
        this.remotes.set(p.id, r);
      }
      r.setName(p.name);
      r.update(dt, t, p.state, this.water, this.camera, lampK, window.innerWidth, window.innerHeight);
    }
  }

  /** Keeps the clock and the connection alive when the window is not drawing. */
  private keepFriendsGoing() {
    if (!this.net.live) return;
    const now = performance.now();
    const gap = (now - this.lastNow) / 1000;
    if (gap < 0.9) return;
    this.lastNow = now;
    this.time += gap;
    if (this.clockRunning) this.hour = advanceHour(this.hour, gap);
    this.net.tick(gap, () => this.netState());
  }

  /** Drops the internal resolution on slower computers, rather than let a friend's game crawl. */
  private adaptQuality(dt: number) {
    this.qualityT = this.fpsAvg < 27 ? this.qualityT + dt : 0;
    if (this.qualityT < 5 || this.pipe.renderScale <= 0.5) return;
    this.qualityT = 0;
    this.pipe.renderScale = Math.max(0.5, this.pipe.renderScale - 0.15);
    this.resize();
  }

  /** Leaves the title screen for the cove. */
  private startPlay() {
    if (this.mode !== 'title') return;
    this.audio.init();
    this.ui.showTitle(false);
    this.mode = 'intro';
    this.introT = 0;
    this.camFrom.copy(this.camera.position);
    this.camFromQ.copy(this.camera.quaternion);
    this.input.lock();
  }

  private openWardrobe() {
    this.ui.showMenu(false);
    this.ui.showJournal(false, this.save.journal, '');
    this.ui.prompt(null);
    this.ui.showTitle(false);
    this.ui.setWardrobe(true);
    this.input.unlock();
    this.wardrobeAngle = 0.35;
    this.wardrobeDist = 3.1;
    // A finer brush while choosing, so small things like eyes can be seen.
    this.pipe.settings.radius = (2 + this.save.paint * 0.9) * 0.5;
    this.audio.pageTurn();
  }

  private applyPaint() {
    const p = this.save.paint;
    this.pipe.settings.radius = 2 + p * 0.9;
    this.pipe.settings.strength = p > 0 ? 1 : 0;
  }

  private resize() {
    this.pipe.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  setHour(h: number, fast = false) {
    this.hour = ((h % 24) + 24) % 24;
    if (fast) this.sky.fastCycles = 6;
    this.ui.showClock(this.hour);
    this.clockChanged();
  }

  async boot() {
    const step = async (f: number, text: string, fn: () => void) => {
      this.ui.setLoading(f, text);
      await nextFrame();
      await nextFrame();
      fn();
    };
    let noise!: THREE.Texture;
    let trans!: THREE.Texture;
    let cloud!: THREE.Data3DTexture;
    await step(0.04, 'mixing the pigments', () => {
      noise = bakeNoise2D(this.renderer);
      U.uNoise.value = noise;
      U.uDabs.value = makeDabAtlas();
    });
    await step(0.1, 'stretching the canvas', () => {
      trans = bakeTransmittance(this.renderer);
      cloud = bakeCloud3D(this.renderer) as unknown as THREE.Data3DTexture;
      this.resize();
      this.applyPaint();
      this.sky = new Sky(this.renderer, trans, noise, cloud);
      this.shadows = new Shadows(this.renderer);
      this.water = new Water(this.renderer);
      this.sky.dome.layers.set(L.OPAQUE);
      this.scene.add(this.sky.dome);
      this.scene.add(this.water.mesh);
    });
    await step(0.16, 'shaping the hills', () => this.scene.add(makeTerrain()));
    await step(0.34, 'sketching the far mountains', () => this.scene.add(makeFarMountains()));
    await step(0.4, 'planting the pines', () => {
      this.scene.add(makeTrees());
      this.scene.add(makeRocks());
    });
    await step(0.56, 'letting the grass grow', () => {
      this.grass = makeGrass();
      this.scene.add(this.grass);
    });
    await step(0.7, 'building the cottage and the jetty', () => {
      this.props = makeProps();
      this.scene.add(this.props.group);
      this.life = new Life(this.props.chimney, this.props.lighthouseLamp);
      this.scene.add(this.life.group);
      this.life.onFishJump = (x, z) => {
        const dx = x - this.focus.x;
        const dz = z - this.focus.z;
        const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
        const pan = clamp((dx * right.x + dz * right.z) / 40, -1, 1);
        this.audio.farSplash(pan);
      };
    });
    await step(0.78, 'putting the boat in the water', () => this.buildActors());
    await step(0.84, 'mixing the colours of the sky', () => {
      this.updateWorld(0.016, true);
      this.sky.renderFull(this.sun, this.moon, this.look, this.time, this.weather);
    });
    this.ui.setLoading(0.9, 'first brushstrokes');
    await nextFrame();
    // Compile everything before the curtain lifts so the first walk does not stutter.
    await this.renderer.compileAsync(this.scene, this.camera);
    this.camera.layers.enableAll();
    for (let i = 0; i < 3; i++) {
      this.frame(performance.now(), true);
      await nextFrame();
    }
    this.ui.setLoading(1, 'ready');
    this.ui.hideLoading();
    this.ui.showTitle(true);
    this.joinCode = codeFromHash(location.hash);
    if (this.joinCode) this.ui.showJoin(true);
    this.lastNow = performance.now();
    requestAnimationFrame((n) => this.loop(n));
  }

  private buildActors() {
    this.boat = new Boat();
    this.scene.add(this.boat.group);
    this.fisher = new Fisher(cleanLook(this.save.look));
    this.scene.add(this.fisher.root);
    this.scene.add(this.fisher.rod);
    this.fisher.root.position.set(this.px, this.py, this.pz);
    this.fisher.onStep = (foot) => this.audio.step(this.surfaceHere(), foot);
    this.lineMat = new THREE.ShaderMaterial({
      vertexShader: `void main(){ gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position,1.0); }`,
      fragmentShader: `void main(){ gl_FragColor = vec4(0.96,0.93,0.82,0.62); }`,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.fishing = new Fishing(this.scene, this.lineMat);
    this.pipe.late.add(this.fishing.line);
    this.fishing.seen = (id) => !!this.save.journal[id];
    this.fishing.onBite = () => {
      this.ui.prompt(this.input.usingPad ? 'a bite! <kbd>Cross</kbd>' : 'a bite! <kbd>Space</kbd>');
    };
    this.fishing.onSlip = () => this.ui.toast('It slipped away. No matter.', 3);
    this.fishing.onLanded = (s, size) => {
      const j = this.save.journal;
      const first = !j[s.id];
      if (first) j[s.id] = { count: 0, firstHour: this.hour };
      j[s.id].count += 1;
      j[s.id].biggest = Math.max(j[s.id].biggest ?? 0, size);
      this.writeSave();
      if (first) this.audio.firstOfKind();
      this.cardOpen = true;
      this.ui.showCard(s, first, this.hour, j[s.id].count, size, this.input.usingPad ? '<kbd>Cross</kbd> let it go' : '<kbd>Space</kbd> let it go');
      this.net.sendCatch(s.id);
    };
    this.boat.onCatch = (p) => this.audio.oarCatch(p);
    this.boat.onDrip = () => this.audio.oarDrip();
  }

  private surfaceHere(): Surface {
    if (onJetty(this.px, this.pz)) return 'wood';
    if (groundY(this.px, this.pz) < 1.55) return 'sand';
    const d = pathDistance(this.px, this.pz).d;
    if (d < 1.1) return 'stone';
    return 'grass';
  }

  // ---- World state --------------------------------------------------------------------------------

  private updateWorld(dt: number, firstFrame = false) {
    const h = this.hour;
    this.sun.set(...sunDir(h));
    this.moon.set(...moonDir(h));
    const look = lookAt(h);
    this.look = look;
    const magic = nightMagic(h);
    this.water.mat.uniforms.uMagicAmt.value = magic;
    this.life.setMagic(magic);
    const isMoon = keyIsMoon(h);
    this.keyDir.copy(isMoon ? this.moon : this.sun);
    U.uKeyDir.value.copy(this.keyDir);
    U.uKeyCol.value.set(look.keyCol[0] * look.keyI, look.keyCol[1] * look.keyI, look.keyCol[2] * look.keyI);
    U.uShadowTint.value.set(...look.shadow);
    U.uBounce.value.set(...look.bounce);
    U.uAmb.value = look.amb;
    U.uFog.value = look.fog;
    U.uMist.value = look.mist;
    U.uWarmth.value = look.warmth;
    U.uNight.value = look.night;
    U.uTime.value = this.time;
    // Weather drifts over days; cloud shadows only exist when the sun is well up.
    const shadeK = smoothstep(0.08, 0.3, this.sun.y) * 0.72;
    U.uCloudShade.value.set(this.time * 0.0009, this.time * 0.0003, 0.4 + (skyMoodAt(h).cover - 0.45) * 0.8, shadeK);
    const gust = 0.72 + Math.sin(this.time * 0.13) * 0.28 + Math.sin(this.time * 0.37) * 0.12;
    U.uWind.value.set(0.84 * gust, 0.42 * gust);

    const mood = skyMoodAt(h);
    this.skyI = mood.intensity;
    this.weather.cover = mood.cover;
    this.weather.cirrus = mood.cirrus;
    this.weather.alto = mood.alto;

    const wu = this.water.mat.uniforms;
    wu.uScatter.value.set(...look.waterScatter);
    wu.uGlow.value = look.night;

    // Lamps.
    const evening = smoothstep(18.7, 19.45, h);
    const morning = h < 7 ? 1 - smoothstep(5.5, 6.3, h) : 0;
    const lampF = h > 12 ? evening : morning;
    const flick = 0.95 + Math.sin(this.time * 9.1) * 0.025 + Math.sin(this.time * 23.3) * 0.025;
    const lamps = this.props.lamps;
    for (let i = 0; i < MAX_LIGHTS; i++) {
      if (i < lamps.length) {
        const l = lamps[i];
        U.uPL.value[i].set(l.x, l.y, l.z, 15);
        const k = lampF * flick * l.strength * 4.2;
        U.uPLC.value[i].set(1.0 * k, 0.5 * k, 0.18 * k);
      } else {
        U.uPLC.value[i].set(0, 0, 0);
      }
    }
    this.props.glowMat.uniforms.uEmisOn.value = lampF * flick * 4.2 + 0.0;
    this.boat.mat.uniforms.uEmisOn.value = lampF * flick * 4;
    this.lampK = lampF * flick * 4;
    const lantern = this.boat.lanternWorld(new THREE.Vector3());
    const li = MAX_LIGHTS - 1;
    U.uPL.value[li].set(lantern.x, lantern.y, lantern.z, 13);
    const lk = lampF * flick * 0.85;
    U.uPLC.value[li].set(1.0 * lk, 0.55 * lk, 0.2 * lk);
    wu.uLanternPos.value.copy(lantern);
    wu.uLanternCol.value.set(1.0 * lk, 0.55 * lk, 0.22 * lk);

    // The nearest pool of magic throws its colour on whatever is close to it.
    if (this.ui.wardrobe.open) {
      const p = this.fisher.root.getWorldPosition(new THREE.Vector3());
      const a = this.facingYaw() + Math.PI + 0.6;
      U.uPL.value[8].set(p.x + Math.sin(a) * 2.2, p.y + 2.1, p.z + Math.cos(a) * 2.2, 8);
      const k = 0.35 + look.night * 1.1 + (this.sun.y < 0.2 ? 0.4 : 0);
      U.uPLC.value[8].set(1.0 * k, 0.93 * k, 0.84 * k);
    } else if (magic > 0.01) {
      let best = MAGIC_SPOTS[0];
      let bd = Infinity;
      for (const m of MAGIC_SPOTS) {
        const d = Math.hypot(this.focus.x - m.x, this.focus.z - m.z) - m.r;
        if (d < bd) {
          bd = d;
          best = m;
        }
      }
      const t = Math.max(0, Math.min(1, best.hue * 2));
      const t2 = Math.max(0, Math.min(1, best.hue * 2 - 1));
      const r = (0.1 + (0.2 - 0.1) * t) * (1 - t2) + 0.74 * t2;
      const g = (0.86 + (0.42 - 0.86) * t) * (1 - t2) + 0.28 * t2;
      const b = (0.8 + (1.0 - 0.8) * t) * (1 - t2) + 1.0 * t2;
      U.uPL.value[8].set(best.x, 1.6, best.z, best.r * 2.1);
      const k = magic * 3.4 * (0.8 + Math.sin(this.time * 0.6) * 0.2);
      U.uPLC.value[8].set(r * k, g * k, b * k);
      if (bd < 0 && this.magicNoticed !== MAGIC_SPOTS.indexOf(best) && magic > 0.5) {
        this.magicNoticed = MAGIC_SPOTS.indexOf(best);
        this.ui.toast('The water is awake here.', 4);
      }
      if (bd > 25) this.magicNoticed = -1;
    }

    this.sky.update(dt, this.sun, this.moon, look, this.time, this.weather, this.skyI);
    if (this.sky.fastCycles > 0) this.sky.fastCycles = Math.max(0, this.sky.fastCycles - dt);
    if (firstFrame) return;
  }

  // ---- Player -------------------------------------------------------------------------------------

  private walkable(x: number, z: number): boolean {
    if (onJetty(x, z)) return true;
    if (x > 114.7 && x < 121.4 && z > COTTAGE.z - 4.9 && z < COTTAGE.z + 4.9) return false;
    if (x > 270 || x < -70 || Math.abs(z) > 300) return false;
    const y = groundY(x, z);
    if (y < 0.08) return false;
    if (slopeAt(x, z, 0.6) > 1.05) return false;
    return true;
  }

  private routePoint(s: number): { x: number; z: number } {
    if (s <= PATH_LENGTH) {
      const p = pathPoint(s);
      return { x: p.x, z: p.z };
    }
    return { x: JETTY.startX - (s - PATH_LENGTH), z: 0 };
  }

  private routeEnd() {
    return PATH_LENGTH + (JETTY.startX - (this.boat.home.x + 1.5));
  }

  private startStroll() {
    let s: number;
    if (onJetty(this.px, this.pz)) s = PATH_LENGTH + (JETTY.startX - this.px);
    else s = pathPoint(0).s + this.nearestPathS();
    this.strollS = s;
    // Head for whichever end is further, so a stroll is always a real walk.
    this.strollDir = s > this.routeEnd() * 0.5 ? -1 : 1;
    this.strolling = true;
    this.ui.toast(this.strollDir > 0 ? 'down to the water' : 'back up to the cottage', 2.4);
  }

  private nearestPathS(): number {
    return PATH[pathDistance(this.px, this.pz).i].s;
  }

  private updateWalk(dt: number) {
    const inp = this.input;
    let mx = inp.moveX;
    let my = inp.moveY;
    const hasMove = Math.abs(mx) + Math.abs(my) > 0.02;
    if (hasMove) this.strolling = false;

    let wish = 0;
    let wx = 0;
    let wz = 0;
    if (this.fishing.active) {
      mx = 0;
      my = 0;
      this.strolling = false;
    } else if (this.strolling) {
      const pace = 2.3;
      this.strollS += pace * this.strollDir * dt;
      const end = this.routeEnd();
      if (this.strollS >= end || this.strollS <= 2) this.strolling = false;
      const t = this.routePoint(this.strollS + this.strollDir * 2.2);
      const dx = t.x - this.px;
      const dz = t.z - this.pz;
      const l = Math.hypot(dx, dz) || 1;
      wx = dx / l;
      wz = dz / l;
      wish = pace;
    }
    if (hasMove && !this.fishing.active) {
      const f = Math.min(1, Math.hypot(mx, my));
      const s = Math.sin(this.yaw);
      const c = Math.cos(this.yaw);
      const fx = -s;
      const fz = -c;
      const rx = c;
      const rz = -s;
      const dx = fx * my + rx * mx;
      const dz = fz * my + rz * mx;
      const l = Math.hypot(dx, dz) || 1;
      wx = dx / l;
      wz = dz / l;
      wish = f * (inp.jog ? 4.2 : 2.5);
    }
    this.speed = damp(this.speed, wish, wish > this.speed ? 3.5 : 5.5, dt);
    if (this.speed > 0.02) {
      if (wish > 0) {
        const targetFacing = Math.atan2(-wx, -wz);
        this.facing += wrapAngle(targetFacing - this.facing) * (1 - Math.exp(-dt * 7));
      }
      const fx = -Math.sin(this.facing);
      const fz = -Math.cos(this.facing);
      const step = this.speed * dt;
      const nx = this.px + fx * step;
      const nz = this.pz + fz * step;
      if (this.walkable(nx, nz)) {
        this.px = nx;
        this.pz = nz;
      } else if (this.walkable(nx, this.pz)) {
        this.px = nx;
      } else if (this.walkable(this.px, nz)) {
        this.pz = nz;
      } else {
        this.speed *= 0.6;
      }
    }
    const ground = onJetty(this.px, this.pz) ? Math.max(DECK_Y, groundY(this.px, this.pz)) : groundY(this.px, this.pz);
    this.py = damp(this.py, ground, 14, dt);
    this.fisher.root.position.set(this.px, this.py, this.pz);
    this.fisher.root.rotation.set(0, this.facing, 0);

    // What is within reach.
    let prompt: string | null = null;
    const pad = inp.usingPad;
    const E = pad ? '<kbd>Square</kbd>' : '<kbd>E</kbd>';
    const canUse = !this.fishing.active;
    const onDeck = onJetty(this.px, this.pz);
    const atBoat = onDeck && Math.abs(this.px - this.boat.home.x) < 3.4;
    const atEnd = onDeck && this.px < JETTY.endX + 2.2;
    const benchD = Math.hypot(this.px - this.props.bench.x, this.pz - this.props.bench.z);
    const doorD = Math.hypot(this.px - DOOR.x, this.pz - DOOR.z);
    if (canUse) {
      if (atEnd) prompt = `${E} sit at the end of the jetty`;
      else if (atBoat) prompt = `${E} step into the boat`;
      else if (benchD < 2.3) prompt = `${E} sit a while`;
      else if (doorD < 2.3) prompt = `${E} go in and rest`;
      else if (onDeck && this.px < -6 && !this.hintedCast) prompt = pad ? 'hold <kbd>Cross</kbd> to cast from here' : 'hold <kbd>Space</kbd> to cast from here';
      else if (!this.strolling && this.speed < 0.1 && !onDeck && this.idleT > 8 && !this.hintedBoat) prompt = pad ? '<kbd>Triangle</kbd> stroll along the path' : '<kbd>Q</kbd> stroll along the path';
    }
    if (canUse && !this.ui.menuOpen) this.ui.prompt(prompt);

    if (canUse && (inp.was('KeyE') || inp.was('PadSquare'))) {
      if (atEnd) this.enterSit('dock');
      else if (atBoat) this.boardBoat();
      else if (benchD < 2.3) this.enterSit('bench');
      else if (doorD < 2.3) {
        this.input.unlock();
        this.ui.prompt(null);
        this.ui.showRest(true);
      }
    }
    if ((inp.was('KeyQ') || inp.was('PadTriangle')) && !this.fishing.active) {
      this.hintedBoat = true;
      if (this.strolling) this.strolling = false;
      else this.startStroll();
    }

    // Casting from the deck.
    if (onDeck && this.px < -6) this.handleCast(dt, new THREE.Vector3(this.px, this.py + 1.5, this.pz));
    else if (this.fishing.active) this.fishing.reelIn();
  }

  private enterSit(kind: 'dock' | 'bench') {
    this.sitKind = kind;
    const from = this.fisher.root.position.clone();
    const b = this.props.bench;
    const target = kind === 'dock' ? new THREE.Vector3(JETTY.endX + 0.28, DECK_Y - 0.02, 0) : new THREE.Vector3(b.x, b.y - 0.47, b.z);
    const toYaw = kind === 'dock' ? Math.PI / 2 : b.rot;
    this.ui.prompt(null);
    this.tr = {
      t: 0, dur: 1.0, from, to: () => target, fromYaw: this.facing, toYaw: () => toYaw,
      done: () => {
        this.mode = 'sit';
        this.px = target.x;
        this.pz = target.z;
        this.py = target.y;
        this.facing = toYaw;
        this.ui.toast('', 0.01);
        this.ui.prompt(this.input.usingPad ? '<kbd>Square</kbd> get up, <kbd>L1</kbd> a beer' : '<kbd>E</kbd> get up, <kbd>B</kbd> a beer');
        setTimeout(() => this.ui.prompt(null), 3500);
      },
    };
    this.mode = 'transition';
  }

  private updateSit(dt: number) {
    const f = this.fisher;
    f.root.position.set(this.px, this.py, this.pz);
    f.root.rotation.set(0, this.facing, 0);
    const inp = this.input;
    const anyMove = Math.abs(inp.moveX) + Math.abs(inp.moveY) > 0.2;
    if (inp.was('KeyE') || inp.was('PadSquare') || anyMove) {
      const back = this.sitKind === 'dock'
        ? new THREE.Vector3(JETTY.endX + 2.0, DECK_Y, 0)
        : new THREE.Vector3(this.px + Math.sin(this.facing) * -0.7, groundY(this.px - Math.sin(this.facing) * 0.7, this.pz - Math.cos(this.facing) * 0.7), this.pz - Math.cos(this.facing) * 0.7);
      this.ui.prompt(null);
      this.tr = {
        t: 0, dur: 0.75, from: f.root.position.clone(), to: () => back, fromYaw: this.facing, toYaw: () => this.facing,
        done: () => {
          this.mode = 'walk';
          this.px = back.x;
          this.pz = back.z;
          this.py = back.y;
        },
      };
      this.mode = 'transition';
    }
  }

  // ---- Boat ---------------------------------------------------------------------------------------

  private boardBoat() {
    this.fishing.reelIn();
    this.ui.prompt(null);
    this.audio.creak(0.2);
    const from = this.fisher.root.position.clone();
    this.tr = {
      t: 0, dur: 1.5, from, to: () => this.boat.seat(new THREE.Vector3()).add(new THREE.Vector3(0, -0.4, 0)), fromYaw: this.facing, toYaw: () => this.boat.heading + Math.PI,
      done: () => {
        this.boat.moored = false;
        this.inBoat = true;
        this.boat.body.add(this.fisher.root);
        this.fisher.root.position.set(0, -0.03, -0.02);
        this.fisher.root.rotation.set(0, Math.PI, 0);
        this.fisherYaw = Math.PI;
        this.mode = 'row';
        this.water.splash(this.boat.x, this.boat.z, 0.9, 0.08);
        this.audio.splash(0.2);
        if (!this.hintedCast) {
          this.ui.hint(this.input.usingPad
            ? 'left stick to row, hold <kbd>Cross</kbd> to cast'
            : '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> to row<br>hold <kbd>Space</kbd> to cast, wherever you like', 9);
          this.hintedCast = true;
        }
      },
    };
    this.mode = 'transition';
  }

  private leaveBoat() {
    this.fishing.reelIn();
    this.ui.prompt(null);
    this.scene.add(this.fisher.root);
    const seat = this.boat.seat(new THREE.Vector3()).add(new THREE.Vector3(0, -0.4, 0));
    this.fisher.root.position.copy(seat);
    this.inBoat = false;
    const yawStart = this.boat.heading + Math.PI;
    this.fisher.root.rotation.set(0, yawStart, 0);
    const landing = new THREE.Vector3(this.boat.home.x, DECK_Y, Math.sign(this.boat.home.z) * 0.2);
    this.boat.moored = true;
    this.audio.creak(0.2);
    this.tr = {
      t: 0, dur: 1.5, from: seat, to: () => landing, fromYaw: yawStart, toYaw: () => -Math.PI / 2,
      done: () => {
        this.mode = 'walk';
        this.px = landing.x;
        this.pz = landing.z;
        this.py = landing.y;
        this.facing = -Math.PI / 2;
      },
    };
    this.mode = 'transition';
  }

  private updateRow(dt: number, t: number) {
    const inp = this.input;
    const fishingActive = this.fishing.active;
    const resting = fishingActive || this.beer.active;
    const fwd = resting ? 0 : inp.moveY;
    const turn = resting ? 0 : inp.moveX;
    this.boat.update(dt, t, fwd, turn, !resting, this.water);

    const nearMoor = this.boat.isNearMoor();
    let prompt: string | null = null;
    const E = inp.usingPad ? '<kbd>Square</kbd>' : '<kbd>E</kbd>';
    if (!fishingActive && nearMoor) prompt = `${E} step onto the jetty`;
    if (!fishingActive) this.ui.prompt(prompt);
    if (!fishingActive && nearMoor && (inp.was('KeyE') || inp.was('PadSquare'))) this.leaveBoat();

    const seat = this.boat.seat(new THREE.Vector3());
    this.handleCast(dt, seat.clone().add(new THREE.Vector3(0, 0.75, 0)));
  }

  private handleCast(dt: number, from: THREE.Vector3) {
    const inp = this.input;
    const f = this.fishing;
    const pressed = inp.was('Space') || inp.was('PadCross') || (this.leftClickPressed());
    switch (f.state) {
      case 'idle':
        if (pressed && !this.anyMenuOpen()) {
          f.beginCharge();
          this.hintedCast = true;
          this.ui.prompt(null);
        }
        break;
      case 'charge': {
        this.ui.charge(f.charge);
        if (!inp.action) {
          this.ui.charge(null);
          f.release(this.fisher.rodTip.clone(), this.aimDir(), this.audio);
          this.ui.prompt(null);
        }
        break;
      }
      case 'wait': {
        const k = inp.usingPad ? '<kbd>Circle</kbd>' : '<kbd>R</kbd>';
        this.ui.prompt(`${k} reel in`);
        if (inp.was('KeyR') || inp.was('PadCircle')) {
          f.reelIn();
          this.ui.prompt(null);
        }
        break;
      }
      case 'reel':
        this.ui.prompt(inp.action ? null : inp.usingPad ? 'hold <kbd>Cross</kbd> to reel' : 'hold <kbd>Space</kbd> to reel');
        break;
      case 'landed':
        if (pressed) {
          f.letGo();
          this.ui.showCard(null, false, 0, 0, 0, '');
          this.cardOpen = false;
          this.ui.prompt(null);
        }
        break;
      default:
    }
  }

  private lastMouse = false;
  private leftClickPressed(): boolean {
    return this.input.action && !this.lastMouse && !this.input.held('Space');
  }

  private aimDir(): THREE.Vector3 {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
  }

  private rodAim(): THREE.Vector3 {
    const a = this.aimDir();
    const up = new THREE.Vector3(0, 1, 0);
    const f = this.fishing;
    const v = new THREE.Vector3();
    switch (f.state) {
      case 'charge': return v.copy(a).multiplyScalar(-0.3 - f.charge * 0.55).addScaledVector(up, 0.85).normalize();
      case 'flight': return v.copy(a).multiplyScalar(0.85).addScaledVector(up, 0.45).normalize();
      case 'wait': return v.copy(a).multiplyScalar(0.78).addScaledVector(up, 0.42 + Math.sin(this.time * 0.8) * 0.02).normalize();
      case 'bite': return v.copy(a).multiplyScalar(0.72).addScaledVector(up, 0.42).normalize();
      case 'reel': return v.copy(a).multiplyScalar(0.55).addScaledVector(up, 0.82).normalize();
      case 'landed': return v.copy(a).multiplyScalar(0.48).addScaledVector(up, 0.86).normalize();
      default: return v.copy(a).multiplyScalar(0.8).addScaledVector(up, 0.6).normalize();
    }
  }

  // ---- Camera -------------------------------------------------------------------------------------

  private updateCamera(dt: number) {
    const inp = this.input;
    const looked = Math.abs(inp.lookX) + Math.abs(inp.lookY) > 0.0005;
    if (!this.anyMenuOpen()) {
      this.yaw -= inp.lookX;
      this.pitch = clamp(this.pitch + inp.lookY, -0.55, 1.1);
    }
    const moving = Math.abs(inp.moveX) + Math.abs(inp.moveY) > 0.02;
    if (looked || moving || inp.action) this.idleT = 0;
    else this.idleT += dt;

    // In front of the mirror, as it were.
    if (this.ui.wardrobe.open) {
      if (inp.dragging) this.wardrobeAngle -= inp.lookX * 1.6;
      this.wardrobeDist = clamp(this.wardrobeDist * Math.exp(inp.wheel * 0.0011), 0.95, 4.6);
      inp.wheel = 0;
      const p = this.fisher.root.getWorldPosition(new THREE.Vector3());
      const eye = this.fisher.eyeHeight;
      const seated = this.inBoat || this.mode === 'sit';
      const top = seated ? eye - 0.42 : eye;
      const close = 1 - smoothstep(1.2, 2.6, this.wardrobeDist);
      const fy = p.y + top * (0.62 + 0.38 * close);
      const a = this.facingYaw() + Math.PI + this.wardrobeAngle;
      const cx = p.x + Math.sin(a) * this.wardrobeDist;
      const cz = p.z + Math.cos(a) * this.wardrobeDist;
      // Up close, look from just under the hat brim, so the face can be seen.
      const cy = Math.max(fy + 0.08 - 0.17 * close, Math.max(groundY(cx, cz), 0) + 0.4);
      this.camera.position.set(cx, cy, cz);
      // Aim past the figure so it stands clear of the page on the left.
      const left = new THREE.Vector3(-Math.cos(a), 0, Math.sin(a)).multiplyScalar(this.wardrobeDist * 0.21);
      this.camera.lookAt(p.x + left.x, fy, p.z + left.z);
      if (this.camera.fov !== 36) {
        this.camera.fov = 36;
        this.fov = 36;
        this.camera.updateProjectionMatrix();
      }
      this.idleT = 0;
      return;
    }
    inp.wheel = 0;

    // Target.
    let desiredDist = 6.4;
    let fov = 44;
    let sideOffset = 0.75;
    const focus = new THREE.Vector3();
    if (this.mode === 'row' || (this.mode === 'transition' && this.inBoat)) {
      focus.set(this.boat.x, this.boat.y + 1.15 * this.fisher.look.height, this.boat.z);
      desiredDist = 8.2;
      fov = 42;
      sideOffset = 0.9;
      // Settles in behind the boat on a long turn.
      if (!looked && !this.fishing.active && Math.abs(this.boat.turnRate) > 0.02) {
        this.yaw += wrapAngle(this.boat.heading - this.yaw) * (1 - Math.exp(-dt * 0.42));
      }
    } else if (this.mode === 'sit') {
      focus.set(this.px, this.py + 1.05 * this.fisher.look.height, this.pz);
      desiredDist = 6.8;
      fov = 38;
      sideOffset = 1.0;
    } else {
      const p = this.fisher.root.getWorldPosition(new THREE.Vector3());
      focus.set(p.x, p.y + 1.32 * this.fisher.look.height, p.z);
      if (this.strolling && !looked) {
        const lead = this.facing;
        this.yaw += wrapAngle(lead - this.yaw) * (1 - Math.exp(-dt * 0.38));
      }
      fov = 44 + Math.max(0, this.speed - 2.6) * 0.8;
    }
    if (this.fishing.state === 'landed') {
      desiredDist -= 1.4;
      fov -= 3;
    }
    // After a long stillness the camera breathes slowly round on its own.
    if (this.idleT > 35 && this.mode !== 'title') {
      const k = smoothstep(35, 50, this.idleT);
      this.yaw += dt * 0.012 * k;
    }

    // A sip brings the view in a little, and centres the figure.
    if (this.beer.lift > 0.05 && this.speed < 0.4) {
      desiredDist *= 0.68;
      sideOffset = 0;
    }
    // Compose to one side: the eye goes past the figure, out to the water.
    this.sideNow = damp(this.sideNow, this.fishing.state === 'landed' ? 0 : sideOffset, 1.6, dt);
    focus.x += Math.cos(this.yaw) * this.sideNow;
    focus.z += -Math.sin(this.yaw) * this.sideNow;
    this.focus.x = damp(this.focus.x, focus.x, 7, dt);
    this.focus.y = damp(this.focus.y, focus.y, 5, dt);
    this.focus.z = damp(this.focus.z, focus.z, 7, dt);
    this.dist = damp(this.dist, desiredDist, 2.2, dt);
    this.fov = damp(this.fov, fov, 2, dt);

    // During a sip seen from behind, the view eases round to the side the bottle is on.
    const seesBack = Math.cos(wrapAngle(this.yaw - this.facingYaw())) > 0.2;
    const orbitWant = this.beer.lift > 0.05 && this.speed < 0.4 && seesBack ? 1.32 : 0;
    this.beerOrbit = damp(this.beerOrbit, orbitWant, 1.5, dt);
    const viewYaw = this.yaw - this.beerOrbit;

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

    if (this.mode === 'title') return;

    if (this.mode === 'intro') {
      this.introT += dt / 4.2;
      const k = smoothstep(0, 1, this.introT);
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(pos, this.focus, new THREE.Vector3(0, 1, 0)));
      this.camera.position.lerpVectors(this.camFrom, pos, k);
      this.camera.quaternion.slerpQuaternions(this.camFromQ, q, k);
      if (this.introT >= 1) {
        this.mode = 'walk';
        this.ui.hint(this.input.usingPad
          ? 'left stick to walk, right stick to look<br><kbd>Triangle</kbd> stroll, <kbd>Square</kbd> use, <kbd>L1</kbd> a beer, <kbd>Options</kbd> menu'
          : '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> to walk, mouse to look<br><kbd>Q</kbd> stroll along the path by itself<br><kbd>E</kbd> use, <kbd>B</kbd> a beer, <kbd>Esc</kbd> menu', 14);
      }
    } else {
      this.camera.position.copy(pos);
      this.camera.lookAt(this.focus);
    }
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  private facingYaw(): number {
    return this.inBoat ? this.boat.heading + this.fisherYaw : this.facing;
  }

  private titleCamera(t: number) {
    // A slow drift across the meadow, looking out to the bay.
    const a = Math.sin(t * 0.03) * 0.5 + 0.5;
    this.camera.position.set(72 + a * 6, 13.5 + a * 1.2, -13 + a * 3);
    this.camera.lookAt(-140, 7, 18 + a * 8);
    if (this.camera.fov !== 42) {
      this.camera.fov = 42;
      this.camera.updateProjectionMatrix();
    }
  }

  // ---- Frame --------------------------------------------------------------------------------------

  private loop(now: number) {
    this.frame(now, false);
    requestAnimationFrame((n) => this.loop(n));
  }

  frame(now: number, warm: boolean) {
    const dt = Math.min(0.1, Math.max(0.0001, (now - this.lastNow) / 1000));
    this.lastNow = now;
    this.frameMs = this.frameMs * 0.95 + dt * 1000 * 0.05;
    this.fpsAvg = 1000 / this.frameMs;
    if (!warm) this.time += dt;
    const t = this.time;

    const inp = this.input;
    // The mouse belongs to the game while playing, and to you the moment a page opens.
    inp.wantLock = this.mode !== 'title' && !this.anyMenuOpen();
    if (!inp.wantLock && inp.locked) inp.unlock();
    inp.poll(dt);
    this.ui.update(dt);

    // Clock.
    if (this.clockRunning && !warm) {
      this.hour = advanceHour(this.hour, dt);
    }
    if (inp.held('KeyT') && !this.anyMenuOpen() && this.mode !== 'title') {
      this.hour = (this.hour + dt * 1.1) % 24;
      this.sky.fastCycles = 1;
      this.ui.showClock(this.hour, 2.5);
      this.clockSendT += dt;
      if (this.clockSendT > 0.25) {
        this.clockSendT = 0;
        this.clockChanged();
      }
    }
    if (inp.was('Tab')) this.ui.showClock(this.hour, 4);

    // Fading to rest.
    const fadeRate = this.restTo !== null ? 1.1 : 0.9;
    this.fade = damp(this.fade, this.fadeTarget, fadeRate * 2.6, dt);
    if (this.restTo !== null && this.fade > 0.985) {
      this.setHour(this.restTo, true);
      this.sky.renderFull(this.sun.set(...sunDir(this.hour)), this.moon.set(...moonDir(this.hour)), lookAt(this.hour), this.time, this.weather);
      this.restTo = null;
      this.fadeTarget = 0;
    }
    this.pipe.fade(this.fade);

    // Modes.
    const menu = this.anyMenuOpen();
    document.body.classList.toggle('captured', inp.locked);
    if (menu) this.speed = 0;
    if (inp.wantLock && !inp.locked && !inp.lockUnavailable && document.hasFocus()) {
      this.unlockedFor += dt;
      if (this.unlockedFor > 1.6) {
        this.ui.toast('click to give the mouse back to the game', 2.5);
        this.unlockedFor = -1.5;
      }
    } else {
      this.unlockedFor = 0;
    }
    // Silent while you are somewhere else, unless asked otherwise.
    this.audio.setAway(this.save.muteAway && (document.hidden || !document.hasFocus()));
    if (this.mode === 'title') {
      this.titleCamera(t);
      // Any key or a click on the picture starts the game, unless a panel or an invite is up.
      if (inp.anyPress && !warm && !menu && !this.ui.joining) this.startPlay();
      if (menu && (inp.was('Escape') || inp.was('PadCircle'))) {
        this.closeMenus();
        this.renderFriends();
      }
    } else if (menu) {
      // World keeps breathing behind the page, but the fisher waits.
      if (this.mode === 'walk' || this.mode === 'sit') {
        this.fisher.root.position.set(this.px, this.py, this.pz);
        this.fisher.root.rotation.set(0, this.facing, 0);
      }
    } else if (this.mode === 'walk') {
      this.updateWalk(dt);
    } else if (this.mode === 'row') {
      this.updateRow(dt, t);
    } else if (this.mode === 'sit') {
      this.updateSit(dt);
    } else if (this.mode === 'transition' && this.tr) {
      const tr = this.tr;
      tr.t += dt;
      const k = smoothstep(0, 1, tr.t / tr.dur);
      const to = tr.to();
      const p = this.fisher.root.position;
      p.lerpVectors(tr.from, to, k);
      p.y += Math.sin(k * Math.PI) * 0.16;
      this.fisher.root.rotation.y = tr.fromYaw + wrapAngle(tr.toYaw() - tr.fromYaw) * k;
      if (tr.t >= tr.dur) {
        this.tr = null;
        tr.done();
      }
    }
    if (this.mode !== 'row' && !this.inBoat) {
      // Moored boat still breathes on its rope; ease it home if it was just left.
      if (this.boat.moored) {
        const dx = this.boat.home.x - this.boat.x;
        const dz = this.boat.home.z - this.boat.z;
        this.boat.x += dx * Math.min(1, dt * 1.2);
        this.boat.z += dz * Math.min(1, dt * 1.2);
        this.boat.heading += wrapAngle(Math.PI / 2 - this.boat.heading) * Math.min(1, dt * 1.0);
        this.boat.speed = 0;
      }
      this.boat.update(dt, t, 0, 0, false, this.water);
    } else if (this.mode === 'transition') {
      this.boat.update(dt, t, 0, 0, false, this.water);
    }

    // Keyboard odds and ends.
    if (!warm && this.mode !== 'title') {
      if (inp.was('KeyJ')) {
        if (this.ui.journalOpen) this.closeMenus();
        else if (!this.ui.menuOpen) {
          inp.unlock();
          this.audio.pageTurn();
          this.ui.showJournal(true, this.save.journal, '<kbd>J</kbd> or <kbd>Esc</kbd>');
        }
      }
      if (inp.was('PadOptions')) {
        if (this.anyMenuOpen()) this.closeMenus();
        else this.openMenu();
      }
      if (inp.was('PadCircle') && this.anyMenuOpen()) this.closeMenus();
      // With pointer lock on, Esc arrives as a lock change instead, handled in the constructor.
      if (inp.was('Escape')) {
        if (this.anyMenuOpen()) this.closeMenus();
        else this.openMenu();
      }
      if (inp.was('KeyH')) {
        this.wordsHidden = !this.wordsHidden;
        this.ui.setWordsHidden(this.wordsHidden);
      }
      if (inp.was('F2')) this.wantShot = true;
    }

    // Fishing and fisher pose.
    this.fishing.update(dt, t, this.hour, inp.action && !menu, (inp.was('Space') || inp.was('PadCross') || this.leftClickPressed()) && !menu, this.fisher.rodBase, this.fisher.rodTip, this.water, this.audio);
    this.lastMouse = inp.action;

    this.updateBeer(dt, menu);

    const pose = this.buildPose();
    this.lastPose = pose;
    this.fisher.update(dt, t, pose);
    if (!warm) this.adaptQuality(dt);

    this.updateCamera(dt);
    this.camera.updateMatrixWorld();
    if (!warm) this.updateFriends(dt, t, this.lampK);

    // World.
    this.pipe.mark('js');
    this.updateWorld(dt);
    this.pipe.mark('sky');
    U.uPlayer.value.copy(this.fisher.root.getWorldPosition(new THREE.Vector3()));
    this.sky.dome.position.copy(this.camera.position);
    this.water.update(dt, t, this.focus.x, this.focus.z);
    const wu = this.water.mat.uniforms;
    wu.uScene.value = this.pipe.opaque.texture;
    wu.uDepth.value = this.pipe.opaque.depthTexture;
    wu.uReflect.value = this.pipe.reflect.texture;
    wu.uReflectVP.value.copy(this.pipe.reflectVP);
    wu.uRes.value.set(this.pipe.w, this.pipe.h);
    wu.uNearZ.value = this.camera.near;
    wu.uFarZ.value = this.camera.far;
    this.pipe.mark('waveBake');
    this.life.setBoat(this.boat.x, this.boat.z);
    this.life.update(dt, t, this.look, this.hour, this.sun, this.focus, this.pipe, this.camera.near, this.camera.far, this.water);
    this.props.cloth.uniforms.uTime = U.uTime;

    cullGrass(this.grass, this.camera.position);
    this.shadows.update(this.scene, this.focus, this.keyDir);
    this.pipe.mark('shadowsBefore');
    this.pipe.render(this.scene, this.camera, this.look, this.sun, this.skyI);

    if (this.wantShot) {
      this.wantShot = false;
      this.renderer.domElement.toBlob((b) => {
        if (!b) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        const hh = String(Math.floor(this.hour)).padStart(2, '0');
        const mm = String(Math.floor((this.hour % 1) * 60)).padStart(2, '0');
        a.download = `Long Light ${hh}.${mm}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        this.ui.toast('kept', 2);
      }, 'image/png');
    }

    // Audio.
    const lx = this.focus.x;
    const lz = this.focus.z;
    const sd = coastSD(lx, lz);
    this.audio.update({
      hour: this.hour,
      phase: phaseOf(this.hour),
      shore: 1 - smoothstep(2, 75, Math.abs(sd)),
      overLand: smoothstep(-2, -30, sd),
      altitude: Math.max(0, this.focus.y),
      night: this.look.night,
      inBoat: this.inBoat,
      boatSpeed: Math.abs(this.boat.speed),
    });

    inp.endFrame();
  }

  private updateBeer(dt: number, menu: boolean) {
    const inp = this.input;
    const handsFree = this.fishing.state === 'idle' || this.fishing.state === 'wait';
    const canDrink = handsFree && (this.mode === 'walk' || this.mode === 'sit' || this.mode === 'row');
    if (!canDrink) this.beer.putAway();
    // Taking up the oars means putting the bottle down first.
    if (this.mode === 'row' && !this.fishing.active && Math.abs(inp.moveX) + Math.abs(inp.moveY) > 0.05) this.beer.putAway();
    if ((inp.was('KeyB') || inp.was('PadL1')) && canDrink && !menu) this.beer.press();
    if (menu) return;
    for (const e of this.beer.update(dt)) {
      if (e === 'open') this.audio.beerOpen();
      else if (e === 'sip') this.audio.beerSip();
      else if (e === 'ah') this.audio.beerAh();
      else if (e === 'stow') this.audio.beerStow();
      else if (e === 'empty') this.ui.toast(EMPTY_LINES[Math.floor(Math.random() * EMPTY_LINES.length)], 3.5);
    }
  }

  private buildPose(): PoseInput {
    const f = this.fishing;
    let mode: PoseMode = 'stand';
    if (this.mode === 'sit') mode = this.sitKind === 'dock' ? 'dockSit' : 'benchSit';
    if (this.inBoat) mode = f.active ? 'boatSit' : 'row';
    const handleL = new THREE.Vector3();
    const handleR = new THREE.Vector3();
    if (this.inBoat) {
      // The rower faces the stern, so the fisher's left hand takes the oar on the boat's right.
      this.boat.handle(1, handleL);
      this.boat.handle(0, handleR);
      // Swivel on the thwart to face a cast, or back to the oars.
      const aimYaw = f.active ? Math.atan2(-this.aimDir().x, -this.aimDir().z) - this.boat.heading : Math.PI;
      this.fisherYaw += wrapAngle(aimYaw - this.fisherYaw) * (1 - Math.exp(-(f.active ? 5 : 3) * 0.016));
      this.fisher.root.rotation.y = this.fisherYaw;
    } else if (f.active) {
      const a = this.aimDir();
      const target = Math.atan2(-a.x, -a.z);
      this.facing += wrapAngle(target - this.facing) * 0.12;
      this.fisher.root.rotation.y = this.facing;
    }
    const ph = this.boat.oarPhase;
    return {
      mode,
      speed: this.mode === 'walk' ? this.speed : this.mode === 'transition' ? 1.2 : 0,
      handleL,
      handleR,
      rowLean: this.boat.rowing ? -Math.cos(ph) : -Math.cos(ph) * 0.25,
      fishing: f.active,
      rodDir: this.rodAim(),
      rodBend: f.bendAmount(this.time),
      reelSpin: f.reelSpin,
      beerOut: this.beer.out,
      beerLift: this.beer.lift,
    };
  }

  /** Test and tuning hooks; not used in play. */
  debugApi() {
    return {
      ready: true,
      game: this,
      setHour: (h: number) => {
        this.hour = h;
        this.clockRunning = false;
        this.clockChanged();
        this.updateWorld(0.016);
        this.sky.renderFull(this.sun, this.moon, this.look, this.time, this.weather);
        this.shadows.force();
      },
      stats: () => ({
        fps: Math.round(this.fpsAvg),
        ms: +this.frameMs.toFixed(1),
        res: `${this.pipe.w}x${this.pipe.h}`,
        hour: +this.hour.toFixed(2),
        mode: this.mode,
        fish: this.fishing.state,
        px: +this.px.toFixed(1),
        pz: +this.pz.toFixed(1),
      }),
      place: (x: number, z: number, facing?: number) => {
        this.mode = 'walk';
        if (this.inBoat) {
          this.inBoat = false;
          this.boat.moored = true;
          this.scene.add(this.fisher.root);
        }
        this.ui.showTitle(false);
        this.px = x;
        this.pz = z;
        this.py = onJetty(x, z) ? DECK_Y : groundY(x, z);
        if (facing !== undefined) {
          this.facing = facing;
          this.yaw = facing;
        }
        this.focus.set(x, this.py + 1.3, z);
        this.dist = 5.4;
      },
      board: () => {
        this.mode = 'walk';
        this.ui.showTitle(false);
        this.px = this.boat.home.x;
        this.pz = 0;
        this.py = DECK_Y;
        this.boat.moored = false;
        this.boat.x = this.boat.home.x;
        this.boat.z = this.boat.home.z;
        this.inBoat = true;
        this.boat.body.add(this.fisher.root);
        this.fisher.root.position.set(0, -0.03, -0.02);
        this.fisher.root.rotation.set(0, Math.PI, 0);
        this.fisherYaw = Math.PI;
        this.mode = 'row';
      },
      boatAt: (x: number, z: number, heading: number) => {
        this.boat.x = x;
        this.boat.z = z;
        this.boat.heading = heading;
        this.focus.set(x, 1.2, z);
      },
      cam: (yaw: number, pitch: number, dist?: number) => {
        this.yaw = yaw;
        this.pitch = pitch;
        if (dist) this.dist = dist;
      },
    };
  }
}
