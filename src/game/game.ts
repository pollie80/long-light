// Ties the place, the fisher and the day together.
import * as THREE from 'three';
import { bakeCloud3D, bakeNoise2D, bakeTransmittance, makeDabAtlas } from '../render/bakes';
import { Pipeline } from '../render/pipeline';
import { Sky, SkyWeather } from '../render/sky';
import { Shadows } from '../render/shadows';
import { L, MAX_LIGHTS, U } from '../render/shared';
import { Water } from '../world/water';
import { makeFarMountains, makeRockies, makeTerrain } from '../world/terrain';
import { cullGrass, makeGrass, makeRocks, makeTrees } from '../world/foliage';
import { makeProps, PropWorld } from '../world/props';
import { Life } from '../world/life';
import { BOAT_SLOTS, coastSD, COTTAGE, DECK_Y, groundY, JETTY, MAGIC_SPOTS, onJetty, PATH, pathDistance, pathPoint, PATH_LENGTH, slopeAt, START } from '../world/land';
import { Boat } from '../actors/boat';
import { Fisher, PoseInput, PoseMode } from '../actors/fisher';
import { Fishing } from './fishing';
import { Beer } from './beer';
import { advanceHour, Look, keyIsMoon, lookAt, moonDir, nightMagic, phaseOf, skyMoodAt, sunDir } from '../core/time';
import { Input } from '../core/input';
import { CharacterLook, cleanLook } from '../actors/look';
import { AudioWorld, Surface } from '../audio/audio';
import { Journal, UI } from '../ui/ui';
import { clamp, damp, smoothstep, wrapAngle } from '../core/noise';
import { Pet } from '../actors/pet';
import { Hunt } from './hunt';
import { Swimmers } from './swimmers';
import { GUN_ORDER, GUNS, GunKind } from './guns';
import { BirdEntry, BIRDS } from './birddata';
import { blendWeather, CALM, weatherAt, WeatherNow } from '../world/weather';
import { Difficulty, isDifficulty, RULES } from './difficulty';
import { Angling } from './angling';
import { Friends } from './friends';
import { CameraRig } from './camera';
import { Social } from './social';
import { Resting } from './resting';
import { Gunplay } from './gunplay';
import { loadSave, SAVE_KEY } from './save';
import { menuHooks, netEvents, wardrobeHooks } from './hooks';
import { Fireworks } from '../world/fireworks';
import { Q, setQuality } from '../core/quality';
import { MAP, MapId, MAPS, switchMap } from '../world/maps';
import { Net, NetPlayer } from '../net/net';
import { RemotePlayer } from '../net/remote';
import { cleanName, codeFromHash, inviteLink, NetState } from '../net/protocol';
import { SPECIES, TIER_LABEL, weightKg, TIERS, Species } from './fishdata';

type Mode = 'title' | 'intro' | 'walk' | 'transition' | 'row' | 'sit' | 'ride';

const DOOR = { x: 112.4, z: COTTAGE.z };

/** Where a passenger's pet sits: on the boards at their feet. */
const RIDE_PET_OFFSET = new THREE.Vector3(0, 0.36, -0.52);
const JUMP_SPEED = 4.4;
const GRAVITY = 12.5;
/** Seconds of rowing hard from full to spent. */
const SPRINT_S = 9;

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

export class Game {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(44, 1, 0.3, 30000);
  pipe: Pipeline;
  input: Input;
  audio = new AudioWorld();
  ui: UI;
  save = loadSave();
  angling = new Angling(this);
  friends = new Friends(this);
  cam = new CameraRig(this);
  social = new Social(this);
  rest = new Resting(this);
  guns = new Gunplay(this);

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
  lineMat!: THREE.Material;
  airborne = false;
  hunt!: Hunt;
  fireworks!: Fireworks;
  swimmers!: Swimmers;
  petTmp2 = new THREE.Vector3();
  private jumpY = 0;
  private jumpV = 0;
  wasMenu = false;
  placeArmed: MapId | null = null;
  private lastDraw = -1e9;
  private fpsLabelT = 0;
  private qualityT = 0;
  private qualityUpT = 0;
  private qualityCeil = 1;
  private qualityRaisedAt = -1e9;
  private lampK = 0;
  lastPose: PoseInput | null = null;

  // Every visit starts late in the afternoon, so the walk down to the boat leads into the sunset.
  hour = 17.72;
  clockRunning = true;
  time = 0;
  look: Look = lookAt(17.72);
  weather: SkyWeather = { cover: 0.5, cirrus: 0.5, alto: 0.5, hero: 1, seedX: 0.13, seedY: 0.37 };
  /** How far the changing weather is switched in, and what it is now. */
  private weatherK = 0;
  wx: WeatherNow = CALM;
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
  strolling = false;
  private strollS = 9;
  private strollDir = 1;
  // Boat seat.
  fisherYaw = Math.PI;
  inBoat = false;
  sitKind: 'dock' | 'bench' | 'ground' = 'dock';
  pet!: Pet;
  private unlockedFor = 0;
  private magicNoticed = -1;
  beerOrbit = 0;
  idleT = 0;
  // Transition between jetty and boat.
  tr: { t: number; dur: number; from: THREE.Vector3; to: () => THREE.Vector3; fromYaw: number; toYaw: () => number; done: () => void } | null = null;
  private fade = 0;
  fadeTarget = 0;
  restTo: number | null = null;
  private wordsHidden = false;
  wantShot = false;
  private fpsAvg = 60;
  private frameMs = 16;
  lastNow = 0;
  private hintedBoat = false;
  private catchUp = false;
  cardOpen = false;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.pipe = new Pipeline(renderer);
    this.input = new Input(renderer.domElement);
    this.ui = new UI(menuHooks(this), wardrobeHooks(this));
    this.net = new Net(netEvents(this));
    this.net.getClock = () => ({ hour: this.hour, running: this.clockRunning, time: this.time });
    // A covered or minimised window stops drawing, but friends are still here.
    window.setInterval(() => this.friends.keepFriendsGoing(), 1000);
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

  writeSave() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.save));
    } catch {
      /* Nothing to do without storage. */
    }
  }

  anyMenuOpen() {
    return this.ui.menuOpen || this.ui.journalOpen || this.ui.restOpen || this.ui.wardrobe.open || this.ui.friendsOpen || this.ui.placesOpen;
  }

  private openMenu() {
    this.input.unlock();
    this.audio.pageTurn();
    this.ui.showMenu(true);
  }

  closeMenus() {
    this.ui.showMenu(false);
    this.ui.showJournal(false, this.save.journal, '');
    this.ui.showRest(false);
    this.ui.showFriends(false);
    this.ui.showPlaces(false);
    if (this.ui.wardrobe.open) {
      this.ui.setWardrobe(false);
    }
    this.audio.uiTick();
    if (this.mode !== 'title') this.input.lock();
    else this.ui.showTitle(true);
  }

  /** Drops the internal resolution on slower computers, rather than let a friend's game crawl. */
  choosePlace(id: MapId) {
    if (this.net.role === 'guest') return;
    if (id === MAP.id) {
      this.closeMenus();
      return;
    }
    if (this.net.role === 'host' && this.placeArmed !== id) {
      this.placeArmed = id;
      this.ui.placeNote(`Going to ${MAPS[id].name} ends your invite, and your friends go back to fishing alone. Choose it again to go.`);
      return;
    }
    this.net.leave();
    switchMap(id);
  }

  private adaptQuality(dt: number) {
    if (!this.save.adapt) return;
    // Another program hogging the graphics card while this one is behind it says nothing about this computer.
    if (document.hidden || !document.hasFocus()) {
      this.qualityT = 0;
      this.qualityUpT = 0;
      return;
    }
    const pipe = this.pipe;
    this.qualityT = this.fpsAvg < 27 ? this.qualityT + dt : 0;
    this.qualityUpT = this.fpsAvg > 58 ? this.qualityUpT + dt : 0;
    if (this.qualityT >= 5 && pipe.renderScale > 0.5) {
      // Struggling soon after a step back up means that step was too much, so stay below it for good.
      if (this.time - this.qualityRaisedAt < 30) this.qualityCeil = pipe.renderScale - 0.15;
      pipe.renderScale = Math.max(0.5, pipe.renderScale - 0.15);
      this.qualityT = 0;
      this.qualityUpT = 0;
      this.resize();
    } else if (this.qualityUpT >= 12 && pipe.renderScale < this.qualityCeil) {
      // A slow patch has passed, so the sharp picture comes back.
      pipe.renderScale = Math.min(this.qualityCeil, pipe.renderScale + 0.15);
      this.qualityRaisedAt = this.time;
      this.qualityUpT = 0;
      this.resize();
    }
  }

  /** Leaves the title screen for the cove. */
  startPlay() {
    if (this.mode !== 'title') return;
    this.audio.init();
    this.ui.showTitle(false);
    this.mode = 'intro';
    this.cam.introT = 0;
    this.cam.camFrom.copy(this.camera.position);
    this.cam.camFromQ.copy(this.camera.quaternion);
    this.input.lock();
  }

  openWardrobe(kind: 'self' | 'boat' | 'pet' = 'self') {
    this.cam.wardrobeKind = kind;
    this.ui.showMenu(false);
    this.ui.showJournal(false, this.save.journal, '');
    this.ui.prompt(null);
    this.ui.showTitle(false);
    this.ui.setWardrobe(true, kind);
    this.input.unlock();
    this.cam.wardrobeAngle = kind === 'boat' ? 0.95 : 0.35;
    this.cam.wardrobeDist = kind === 'boat' ? 8 : kind === 'pet' ? 2.1 : 3.1;
    this.audio.pageTurn();
  }

  resize() {
    this.pipe.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  setHour(h: number, fast = false) {
    this.hour = ((h % 24) + 24) % 24;
    if (fast) this.sky.fastCycles = 6;
    this.ui.showClock(this.hour);
    this.friends.clockChanged();
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
      if (this.save.resolution > 0) this.pipe.renderScale = this.save.resolution;
      this.resize();
      this.sky = new Sky(this.renderer, trans, noise, cloud);
      this.shadows = new Shadows(this.renderer);
    this.ui.setFps(this.save.showFps ? '' : null);
      this.water = new Water(this.renderer);
      this.sky.dome.layers.set(L.OPAQUE);
      this.scene.add(this.sky.dome);
      this.scene.add(this.water.mesh);
    });
    await step(0.16, 'shaping the hills', () => this.scene.add(makeTerrain()));
    await step(0.34, 'sketching the far mountains', () => {
      this.scene.add(makeFarMountains());
      if (MAP.terrain.rockies) this.scene.add(makeRockies());
    });
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
        const dx = x - this.cam.focus.x;
        const dz = z - this.cam.focus.z;
        const right = new THREE.Vector3(Math.cos(this.cam.yaw), 0, -Math.sin(this.cam.yaw));
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
    this.friends.joinCode = codeFromHash(location.hash);
    if (this.friends.joinCode) this.ui.showJoin(true);
    this.lastNow = performance.now();
    requestAnimationFrame((n) => this.loop(n));
  }

  private buildActors() {
    const startLook = cleanLook(this.save.look);
    this.boat = new Boat(startLook);
    this.scene.add(this.boat.group);
    this.boat.onBump = () => this.audio.creak(0.6);
    this.pet = new Pet(startLook);
    this.scene.add(this.pet.root);
    this.fisher = new Fisher(startLook);
    this.scene.add(this.fisher.root);
    this.scene.add(this.fisher.rod);
    this.scene.add(this.fisher.gun);
    this.hunt = new Hunt();
    this.scene.add(this.hunt.group);
    this.fireworks = new Fireworks();
    this.scene.add(this.fireworks.group);
    this.fireworks.onLaunch = (d) => this.audio.rocket(d);
    this.fireworks.onBurst = (d) => this.audio.boom(d);
    this.hunt.onSplash = () => this.audio.splash(0.35);
    this.hunt.seen = (id) => !!this.save.birdLog[id];
    // Something special overhead: a quiet word, not a name, so it's still a surprise.
    this.hunt.onRare = () => {
      if (this.mode !== 'title' && !this.anyMenuOpen()) this.ui.toast('Something rare is on the wing.', 3.5);
    };
    this.guns.flash = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(18, 11, 4) }));
    this.guns.flash.layers.set(L.MAIN_ONLY);
    this.guns.flash.visible = false;
    this.scene.add(this.guns.flash);
    this.fisher.root.position.set(this.px, this.py, this.pz);
    this.fisher.onStep = (foot) => this.audio.step(this.surfaceHere(), foot);
    this.lineMat = new THREE.ShaderMaterial({
      // Each line takes a copy, coloured from the wardrobe.
      uniforms: { uCol: { value: new THREE.Color(0.96, 0.93, 0.82) }, uA: { value: 0.62 } },
      vertexShader: `void main(){ gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uCol; uniform float uA; void main(){ gl_FragColor = vec4(uCol, uA); }`,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.fishing = new Fishing(this.scene, this.lineMat);
    this.fishing.setGear(startLook);
    this.pipe.late.add(this.fishing.line);
    this.fishing.seen = (id) => !!this.save.journal[id];
    this.swimmers = new Swimmers((id) => !!this.save.journal[id]);
    this.scene.add(this.swimmers.group);
    this.fishing.onBite = () => {
      this.ui.prompt(this.input.usingPad ? 'a bite! <kbd>Cross</kbd>' : 'a bite! <kbd>Space</kbd>');
    };
    this.fishing.onSlip = () => this.ui.toast(this.fishing.rules.earlySpooks ? 'Too slow. It slipped away.' : 'It slipped away. No matter.', 3);
    this.fishing.onCast = (perfect) => {
      if (perfect) this.ui.toast('Right in the sweet spot.', 1.6);
    };
    this.fishing.onSpook = () => this.ui.toast('Too soon. You scared it off.', 2.4);
    this.angling.applyRules();
    this.fishing.onSnap = () => this.ui.toast('The line snapped. It got away.', 3);
    this.fishing.onHook = (strike) => {
      if (strike) this.ui.toast('Good strike. Well hooked.', 1.8);
    };
    this.fishing.onFreed = (s, x, z, heading, size) => this.swimmers.release(s, x, z, heading, size);
    this.fishing.onLanded = (s, size) => {
      const j = this.save.journal;
      const first = !j[s.id];
      const record = !first && size > (j[s.id].biggest ?? 0);
      if (first) j[s.id] = { count: 0, firstHour: this.hour };
      j[s.id].count += 1;
      j[s.id].biggest = Math.max(j[s.id].biggest ?? 0, size);
      if (s.neon) j[s.id].neon = (j[s.id].neon ?? 0) + 1;
      this.writeSave();
      if (first) this.audio.firstOfKind();
      // The rare ones are worth a bit more noise.
      if (s.tier === 'epic' || s.tier === 'legendary') this.audio.landed();
      this.cardOpen = true;
      this.ui.showCard(s, first, this.hour, j[s.id].count, size, this.input.usingPad ? '<kbd>Cross</kbd> let it go' : '<kbd>Space</kbd> let it go', weightKg(s, size), record);
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
    // Changing weather, if it's on: eased in and out so switching it never jolts the sky.
    this.weatherK = damp(this.weatherK, this.save.weather ? 1 : 0, 0.5, Math.min(dt, 0.1));
    if (this.weatherK < 0.001) this.weatherK = 0;
    const wx: WeatherNow = this.weatherK > 0 ? blendWeather(weatherAt(Date.now()), this.weatherK) : CALM;
    this.wx = wx;
    const keyI = look.keyI * wx.light;
    U.uKeyCol.value.set(look.keyCol[0] * keyI, look.keyCol[1] * keyI, look.keyCol[2] * keyI);
    U.uShadowTint.value.set(...look.shadow);
    U.uBounce.value.set(...look.bounce);
    U.uAmb.value = look.amb;
    U.uFog.value = look.fog * wx.mist;
    U.uMist.value = Math.min(1, look.mist * wx.mist + Math.max(0, wx.mist - 1) * 0.12);
    U.uWarmth.value = look.warmth;
    U.uNight.value = look.night;
    U.uTime.value = this.time;
    // Weather drifts over days; cloud shadows only exist when the sun is well up.
    const shadeK = smoothstep(0.08, 0.3, this.sun.y) * 0.72;
    U.uCloudShade.value.set(this.time * 0.0009, this.time * 0.0003, 0.4 + (Math.min(1, skyMoodAt(h).cover + wx.cover) - 0.45) * 0.8, shadeK);
    const gust = 0.72 + Math.sin(this.time * 0.13) * 0.28 + Math.sin(this.time * 0.37) * 0.12;
    U.uWind.value.set(0.84 * gust * wx.wind, 0.42 * gust * wx.wind);

    const mood = skyMoodAt(h);
    this.skyI = mood.intensity;
    this.weather.cover = Math.min(1, Math.max(0, mood.cover + wx.cover));
    this.weather.cirrus = Math.min(1, Math.max(0, mood.cirrus + wx.cirrus));
    this.weather.alto = Math.min(1, Math.max(0, mood.alto + wx.alto));

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
    const lc = this.boat.lanternRGB;
    U.uPLC.value[li].set(lc.r * lk, lc.g * lk, lc.b * lk);
    wu.uLanternPos.value.copy(lantern);
    wu.uLanternCol.value.set(lc.r * lk, lc.g * lk, lc.b * lk);

    // The nearest pool of magic throws its colour on whatever is close to it.
    if (this.ui.wardrobe.open) {
      const p = this.fisher.root.getWorldPosition(new THREE.Vector3());
      const a = this.cam.facingYaw() + Math.PI + 0.6;
      U.uPL.value[8].set(p.x + Math.sin(a) * 2.2, p.y + 2.1, p.z + Math.cos(a) * 2.2, 8);
      const k = 0.35 + look.night * 1.1 + (this.sun.y < 0.2 ? 0.4 : 0);
      U.uPLC.value[8].set(1.0 * k, 0.93 * k, 0.84 * k);
    } else if (magic > 0.01) {
      let best = MAGIC_SPOTS[0];
      let bd = Infinity;
      for (const m of MAGIC_SPOTS) {
        const d = Math.hypot(this.cam.focus.x - m.x, this.cam.focus.z - m.z) - m.r;
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

  walkable(x: number, z: number): boolean {
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
    if (this.guns.gunOut && hasMove) {
      // Walking with the gun up: a careful step in any direction, still facing where you aim.
      const s = Math.sin(this.cam.yaw);
      const c = Math.cos(this.cam.yaw);
      const dx = -s * my + c * mx;
      const dz = -c * my - s * mx;
      const l = Math.hypot(dx, dz) || 1;
      const pace = 1.5 * Math.min(1, Math.hypot(mx, my)) * this.save.walkSpeed;
      const nx = this.px + (dx / l) * pace * dt;
      const nz = this.pz + (dz / l) * pace * dt;
      if (this.walkable(nx, nz)) {
        this.px = nx;
        this.pz = nz;
      }
    }
    if (this.guns.gunOut) {
      mx = 0;
      my = 0;
      this.strolling = false;
      this.facing += wrapAngle(this.cam.yaw - this.facing) * (1 - Math.exp(-dt * 14));
    } else if (this.social.patT > 0) {
      mx = 0;
      my = 0;
      this.strolling = false;
    } else if (this.fishing.active) {
      mx = 0;
      my = 0;
      this.strolling = false;
    } else if (this.strolling) {
      const pace = 2.3 * this.save.walkSpeed;
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
    if (hasMove && !this.fishing.active && !this.guns.gunOut) {
      const f = Math.min(1, Math.hypot(mx, my));
      const s = Math.sin(this.cam.yaw);
      const c = Math.cos(this.cam.yaw);
      const fx = -s;
      const fz = -c;
      const rx = c;
      const rz = -s;
      const dx = fx * my + rx * mx;
      const dz = fz * my + rz * mx;
      const l = Math.hypot(dx, dz) || 1;
      wx = dx / l;
      wz = dz / l;
      // Running is the normal pace; Shift (or L3) is for taking it slowly.
      wish = f * (inp.jog ? 2.5 : 4.2) * this.save.walkSpeed;
    }
    this.speed = damp(this.speed, wish, wish > this.speed ? 3.5 : 5.5, dt);
    if (this.speed > 0.02) {
      if (wish > 0) {
        const targetFacing = Math.atan2(-wx, -wz);
        this.facing += wrapAngle(targetFacing - this.facing) * (1 - Math.exp(-dt * 11));
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
    this.updateJump(dt);
    this.fisher.root.position.set(this.px, this.py + this.jumpY, this.pz);
    this.fisher.root.rotation.set(0, this.facing, 0);

    // What is within reach.
    let prompt: string | null = null;
    const pad = inp.usingPad;
    const E = pad ? '<kbd>Square</kbd>' : '<kbd>E</kbd>';
    const canUse = !this.fishing.active && !this.airborne;
    const onDeck = onJetty(this.px, this.pz);
    const atBoat = onDeck && Math.abs(this.px - this.boat.home.x) < 3.4;
    const atEnd = onDeck && this.px < JETTY.endX + 2.2;
    const benchD = Math.hypot(this.px - this.props.bench.x, this.pz - this.props.bench.z);
    const doorD = Math.hypot(this.px - DOOR.x, this.pz - DOOR.z);
    // A friend's boat within a step, unless your own is nearer.
    const friendBoat = canUse ? this.friendBoatNear(3.7) : null;
    const preferFriend = friendBoat !== null && (!atBoat || friendBoat.d < Math.hypot(this.px - this.boat.x, this.pz - this.boat.z));
    if (canUse) {
      if (preferFriend) prompt = `${E} climb into ${this.friends.safeName(friendBoat!.name)}'s boat`;
      else if (atEnd) prompt = `${E} sit at the end of the jetty`;
      else if (atBoat) prompt = `${E} step into the boat`;
      else if (benchD < 2.3) prompt = `${E} sit a while`;
      else if (doorD < 2.3) prompt = `${E} go in and rest`;
      else if (onDeck && this.px < -6 && !this.angling.hintedCast && !this.guns.gunOut) prompt = pad ? 'hold <kbd>Cross</kbd> to cast from here' : 'hold <kbd>Space</kbd> to cast from here';
      else if (!this.strolling && this.speed < 0.1 && !onDeck && this.idleT > 8 && !this.hintedBoat) prompt = pad ? '<kbd>Triangle</kbd> stroll along the path' : '<kbd>Q</kbd> stroll along the path';
    }
    if (canUse && !this.ui.menuOpen) this.ui.prompt(this.social.withSocial(prompt));

    if (canUse && (inp.was('KeyE') || inp.was('PadSquare'))) {
      if (preferFriend) this.friends.boardFriend(friendBoat!.id);
      else if (atEnd) this.enterSit('dock');
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

    // Space jumps. Standing where you can cast, a hold casts and a tap jumps.
    const castHere = onDeck && this.px < -6;
    const keyPressed = inp.was('Space') || inp.was('PadCross');
    if (this.guns.gunOut) {
      // No casting with your hands full. Space still jumps.
      if (keyPressed && !this.airborne && !this.wasMenu) this.jump();
    } else if (keyPressed && !this.fishing.active && !this.airborne && !this.wasMenu && (!castHere || this.speed > 0.4)) this.jump();
    else if (castHere && !this.airborne) this.angling.handleCast(dt, new THREE.Vector3(this.px, this.py + 1.5, this.pz));
    else if (this.fishing.active) this.fishing.reelIn();
  }

  jump() {
    this.airborne = true;
    this.jumpV = JUMP_SPEED;
    this.jumpY = 0.001;
    this.audio.step(this.surfaceHere(), 0);
  }

  private updateJump(dt: number) {
    if (!this.airborne) return;
    this.jumpV -= GRAVITY * dt;
    this.jumpY += this.jumpV * dt;
    if (this.jumpY <= 0) {
      this.jumpY = 0;
      this.jumpV = 0;
      this.airborne = false;
      const surface = this.surfaceHere();
      this.audio.step(surface, 0);
      this.audio.step(surface, 1);
    }
  }

  enterSit(kind: 'dock' | 'bench' | 'ground') {
    this.sitKind = kind;
    const from = this.fisher.root.position.clone();
    const b = this.props.bench;
    const target = kind === 'dock' ? new THREE.Vector3(JETTY.endX + 0.28, DECK_Y - 0.02, 0) : kind === 'ground' ? new THREE.Vector3(this.px, this.py, this.pz) : new THREE.Vector3(b.x, b.y - 0.47, b.z);
    const toYaw = kind === 'dock' ? Math.PI / 2 : kind === 'ground' ? this.facing : b.rot;
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
        if (kind !== 'ground') {
          this.ui.prompt(this.input.usingPad ? '<kbd>Square</kbd> get up, <kbd>R3</kbd> lean back, <kbd>L1</kbd> a beer' : '<kbd>E</kbd> get up, <kbd>V</kbd> lean back, <kbd>B</kbd> a beer');
          setTimeout(() => this.ui.prompt(null), 3500);
        }
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
    // From the end of the jetty, sitting or not, a line can still go out.
    const castHere = this.sitKind === 'dock' || (this.sitKind === 'ground' && onJetty(this.px, this.pz) && this.px < -6);
    if (castHere && !this.guns.gunOut) this.angling.handleCast(dt, new THREE.Vector3(this.px, this.py + 1.0, this.pz));
    if (((inp.was('KeyE') || inp.was('PadSquare')) && !this.fishing.active) || anyMove) this.leaveSit();
  }

  /** Up on your feet again. */
  leaveSit() {
    if (this.mode !== 'sit') return;
    this.fishing.reelIn();
    this.rest.relax = false;
    const back = this.sitKind === 'dock'
      ? new THREE.Vector3(JETTY.endX + 2.0, DECK_Y, 0)
      : this.sitKind === 'ground'
        ? new THREE.Vector3(this.px, this.py, this.pz)
        : new THREE.Vector3(this.px + Math.sin(this.facing) * -0.7, groundY(this.px - Math.sin(this.facing) * 0.7, this.pz - Math.cos(this.facing) * 0.7), this.pz - Math.cos(this.facing) * 0.7);
    this.ui.prompt(null);
    this.tr = {
      t: 0, dur: 0.75, from: this.fisher.root.position.clone(), to: () => back, fromYaw: this.facing, toYaw: () => this.facing,
      done: () => {
        this.mode = 'walk';
        this.px = back.x;
        this.pz = back.z;
        this.py = back.y;
      },
    };
    this.mode = 'transition';
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
        if (!this.angling.hintedCast) {
          this.ui.hint(this.input.usingPad
            ? 'left stick to row, hold <kbd>Cross</kbd> to cast'
            : '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> to row<br>hold <kbd>Space</kbd> to cast, wherever you like', 9);
          this.angling.hintedCast = true;
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
    const resting = fishingActive || this.beer.active || this.guns.gunOut || this.social.patT > 0 || this.social.cheersT > 0;
    // Shift rows twice as hard while there's energy for it.
    const pulling = !resting && Math.abs(inp.moveY) + Math.abs(inp.moveX) > 0.05;
    this.rest.sprinting = inp.jog && pulling && !this.rest.winded && this.rest.energy > 0;
    if (this.rest.sprinting) {
      this.rest.energy = Math.max(0, this.rest.energy - dt / (SPRINT_S * RULES[this.save.difficulty].sprintScale));
      if (this.rest.energy <= 0) this.rest.winded = true;
    }
    this.rest.sprintK = damp(this.rest.sprintK, this.rest.sprinting ? 1 : 0, 4, dt);
    this.boat.power = this.save.rowSpeed * (1 + this.rest.sprintK);
    const fwd = resting ? 0 : inp.moveY;
    const turn = resting ? 0 : inp.moveX;
    this.boat.update(dt, t, fwd, turn, !resting, this.water);

    const nearMoor = this.boat.isNearMoor();
    let prompt: string | null = null;
    const E = inp.usingPad ? '<kbd>Square</kbd>' : '<kbd>E</kbd>';
    if (!fishingActive && nearMoor) prompt = `${E} step onto the jetty`;
    // Alongside a friend out on the water, you can climb across. Your own boat finds its own way home.
    const alongside = !fishingActive && !nearMoor ? this.friendBoatNear(6.5) : null;
    if (alongside) prompt = `${E} climb across to ${this.friends.safeName(alongside.name)}'s boat`;
    if (!fishingActive) this.ui.prompt(this.social.withSocial(prompt));
    if (!fishingActive && nearMoor && (inp.was('KeyE') || inp.was('PadSquare'))) this.leaveBoat();
    else if (alongside && (inp.was('KeyE') || inp.was('PadSquare'))) this.friends.boardFriend(alongside.id);

    const seat = this.boat.seat(new THREE.Vector3());
    if (!this.guns.gunOut) this.angling.handleCast(dt, seat.clone().add(new THREE.Vector3(0, 0.75, 0)));
  }

  /** The boat being sailed in, whoever's it is. */
  get vessel(): Boat {
    return (this.friends.rideWith ? this.friends.remotes.get(this.friends.rideWith)?.boat : null) ?? this.boat;
  }

  get seated(): boolean {
    return this.inBoat || this.friends.rideWith !== null;
  }

  private friendBoatNear(reach: number): { id: string; name: string; d: number } | null {
    if (!this.net.live) return null;
    const me = this.fisher.root.getWorldPosition(new THREE.Vector3());
    let best: { id: string; name: string; d: number } | null = null;
    for (const p of this.net.players.values()) {
      const r = this.friends.remotes.get(p.id);
      if (!r || !p.state) continue;
      const d = Math.hypot(r.boat.x - me.x, r.boat.z - me.z);
      if (d < reach && (!best || d < best.d)) best = { id: p.id, name: p.name, d };
    }
    return best;
  }

  private lastMouse = false;
  leftClickPressed(): boolean {
    return this.input.action && !this.lastMouse && !this.input.held('Space');
  }

  // ---- Sitting back ---------------------------------------------------------------------------------

  // ---- Camera -------------------------------------------------------------------------------------

  // ---- Frame --------------------------------------------------------------------------------------

  private loop(now: number) {
    requestAnimationFrame((n) => this.loop(n));
    // The screen may refresh 240 times a second. A fishing game has no use for that, and the graphics card
    // shouldn't run flat out to provide it, least of all while you're in another program.
    const away = this.save.quietAway && !document.hasFocus();
    const cap = away ? 20 : this.save.fpsCap;
    if (cap > 0) {
      const step = 1000 / cap;
      const since = now - this.lastDraw;
      if (since < step - 2) return;
      this.lastDraw = since > step * 2 ? now : this.lastDraw + step;
    }
    this.frame(now, false);
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
      this.friends.clockSendT += dt;
      if (this.friends.clockSendT > 0.25) {
        this.friends.clockSendT = 0;
        this.friends.clockChanged();
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
      this.cam.titleCamera(t);
      // Any key or a click on the picture starts the game, unless a panel or an invite is up.
      // The same key shuts the page it opened.
      if (menu && ((inp.was('KeyM') && this.ui.placesOpen) || (inp.was('KeyF') && this.ui.friendsOpen) || (inp.was('KeyJ') && this.ui.journalOpen))) this.closeMenus();
      const page = !menu && !warm ? (inp.was('KeyJ') ? 'journal' : inp.was('KeyF') ? 'friends' : inp.was('KeyM') ? 'places' : null) : null;
      if (page === 'journal') this.ui.hooks.journal();
      else if (page === 'friends') this.friends.openFriends();
      else if (page === 'places') this.ui.hooks.places();
      else if (inp.anyPress && !warm && !menu && !this.ui.joining) this.startPlay();
      if (menu && (inp.was('Escape') || inp.was('PadCircle'))) {
        this.closeMenus();
        this.friends.renderFriends();
      }
    } else if (menu) {
      // World keeps breathing behind the page, but the fisher waits.
      if (this.mode === 'walk' || this.mode === 'sit') {
        this.updateJump(dt);
        this.fisher.root.position.set(this.px, this.py + this.jumpY, this.pz);
        this.fisher.root.rotation.set(0, this.facing, 0);
      }
    } else if (this.mode === 'walk') {
      this.updateWalk(dt);
    } else if (this.mode === 'row') {
      this.updateRow(dt, t);
    } else if (this.mode === 'ride') {
      this.friends.updateRide(dt);
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
      if (inp.was('KeyF') && !this.ui.wardrobe.open) {
        if (this.ui.friendsOpen) this.closeMenus();
        else if (!this.anyMenuOpen() || this.ui.menuOpen) this.friends.openFriends();
      }
      if (inp.was('KeyM') && !this.ui.wardrobe.open) {
        if (this.ui.placesOpen) this.closeMenus();
        else if (!this.anyMenuOpen() || this.ui.menuOpen) this.ui.hooks.places();
      }
      if (inp.was('KeyJ')) {
        if (this.ui.journalOpen) this.closeMenus();
        else if (!this.ui.menuOpen) {
          inp.unlock();
          this.audio.pageTurn();
          this.ui.journalOpenAt(this.hour);
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
    this.wasMenu = menu;

    this.social.updateBeer(dt, menu);

    if (!warm && this.mode !== 'title') this.guns.updateGun(dt, menu);
    if (!warm && this.mode !== 'title') this.rest.updateRelax(dt, menu);
    if (!warm && this.mode !== 'title') this.rest.updateEnergy(dt);
    if (!warm) this.social.updateSocial(dt, menu);
    if (!warm) this.fireworks.update(dt, this.camera, this.pipe.h);
    if (!warm && this.mode !== 'title') this.swimmers.update(dt, t, this.fisher.root.getWorldPosition(this.friends.seatTmp), this.hour, this.water, this.fishing);
    this.hunt.hour = this.hour;
    if (!warm) this.hunt.update(dt, t, this.fisher.root.getWorldPosition(this.petTmp2), this.water);
    const pose = this.buildPose();
    this.lastPose = pose;
    this.fisher.update(dt, t, pose);
    this.fishing.preview(this.ui.wardrobe.open && this.cam.wardrobeKind === 'self' && this.ui.wardrobe.group === 'Gear' && this.ui.wardrobe.activeKey !== 'gunFinish', this.fisher.rodTip, t);
    this.pet.update(dt, t, {
      pos: this.fisher.root.getWorldPosition(this.petTmp2),
      facing: this.seated ? this.vessel.heading : this.facing,
      speed: Math.max(this.speed, this.mode === 'transition' ? 2 : 0),
      inBoat: this.seated,
      air: this.airborne,
      boat: this.vessel,
      patting: this.social.patT > 0,
      rideSeat: this.friends.rideWith ? this.friends.petRideSeat.copy(this.fisher.root.position).add(RIDE_PET_OFFSET) : undefined,
    });
    if (!warm) this.adaptQuality(dt);
    if (this.save.showFps) {
      this.fpsLabelT -= dt;
      if (this.fpsLabelT <= 0) {
        this.fpsLabelT = 0.5;
        this.ui.setFps(`${Math.round(this.fpsAvg)} fps`);
      }
    }

    this.cam.updateCamera(dt);
    this.camera.updateMatrixWorld();
    if (!warm) this.friends.updateFriends(dt, t, this.lampK);

    // World.
    this.pipe.mark('js');
    this.updateWorld(dt);
    this.pipe.mark('sky');
    U.uPlayer.value.copy(this.fisher.root.getWorldPosition(new THREE.Vector3()));
    this.sky.dome.position.copy(this.camera.position);
    this.water.update(dt, t, this.cam.focus.x, this.cam.focus.z);
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
    this.life.update(dt, t, this.look, this.hour, this.sun, this.cam.focus, this.pipe, this.camera.near, this.camera.far, this.water);
    this.props.cloth.uniforms.uTime = U.uTime;

    cullGrass(this.grass, this.camera.position);
    this.shadows.update(this.scene, this.cam.focus, this.keyDir);
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
    const lx = this.cam.focus.x;
    const lz = this.cam.focus.z;
    const sd = coastSD(lx, lz);
    this.audio.update({
      hour: this.hour,
      phase: phaseOf(this.hour),
      shore: 1 - smoothstep(2, 75, Math.abs(sd)),
      overLand: smoothstep(-2, -30, sd),
      altitude: Math.max(0, this.cam.focus.y),
      night: this.look.night,
      inBoat: this.inBoat,
      boatSpeed: Math.abs(this.boat.speed),
    });

    inp.endFrame();
  }

  buildPose(): PoseInput {
    const f = this.fishing;
    let mode: PoseMode = 'stand';
    if (this.mode === 'sit') mode = this.sitKind === 'dock' ? 'dockSit' : this.sitKind === 'ground' ? 'groundSit' : 'benchSit';
    // Trying things on: the rod held up with its float hanging, or each gun in turn for the finish.
    const w = this.ui.wardrobe;
    const gearView = w.open && this.cam.wardrobeKind === 'self' && w.group === 'Gear';
    const gunView = gearView && w.activeKey === 'gunFinish';
    const showing = (this.angling.fishingShows && !this.guns.gunOut) || (gearView && !gunView);
    if (this.inBoat) mode = showing || this.guns.gunOut || this.rest.loungeK > 0.3 ? 'boatSit' : 'row';
    if (this.friends.rideWith) mode = 'boatSit';
    const handleL = new THREE.Vector3();
    const handleR = new THREE.Vector3();
    if (this.inBoat) {
      // The rower faces the stern, so the fisher's left hand takes the oar on the boat's right.
      this.boat.handle(1, handleL);
      this.boat.handle(0, handleR);
      // Swivel on the thwart to face a cast, or back to the oars.
      // Round on the thwart: to face a cast or a shot, the pet up in the bow, a friend's raised bottle, or back to the oars.
      const friend = this.social.cheersT > 0 ? this.social.nearestFriend() : null;
      const aimYaw = this.social.patT > 0 ? 0 : friend ? Math.atan2(-(friend.at.x - this.boat.x), -(friend.at.z - this.boat.z)) - this.boat.heading : showing || this.guns.gunOut ? Math.atan2(-this.cam.aimDir().x, -this.cam.aimDir().z) - this.boat.heading : Math.PI;
      this.fisherYaw += wrapAngle(aimYaw - this.fisherYaw) * (1 - Math.exp(-(this.guns.gunOut ? 12 : this.social.patT > 0 ? 7 : showing ? 5 : 3) * 0.016));
      this.fisher.root.rotation.y = this.fisherYaw;
    } else if (this.friends.rideWith) {
      // A passenger faces the bow, unless there's something to turn round for.
      const v = this.vessel;
      const friend = this.social.cheersT > 0 ? this.social.nearestFriend() : null;
      const aimYaw = this.social.patT > 0 ? 0 : friend ? Math.atan2(-(friend.at.x - v.x), -(friend.at.z - v.z)) - v.heading : showing || this.guns.gunOut ? Math.atan2(-this.cam.aimDir().x, -this.cam.aimDir().z) - v.heading : 0;
      this.fisherYaw += wrapAngle(aimYaw - this.fisherYaw) * (1 - Math.exp(-(this.guns.gunOut ? 12 : this.social.patT > 0 ? 7 : showing ? 5 : 3) * 0.016));
      this.fisher.root.rotation.y = this.fisherYaw;
    } else if (showing) {
      const a = this.cam.aimDir();
      const target = Math.atan2(-a.x, -a.z);
      this.facing += wrapAngle(target - this.facing) * 0.12;
      this.fisher.root.rotation.y = this.facing;
    }
    const ph = this.boat.oarPhase;
    const fwd = new THREE.Vector3(-Math.sin(this.cam.facingYaw()), 0, -Math.cos(this.cam.facingYaw()));
    const shownGun: GunKind = gunView ? GUN_ORDER[Math.floor(this.time / 2.4) % GUN_ORDER.length] : this.guns.gunKind;
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const rodDir = gunView
      ? fwd.clone().addScaledVector(new THREE.Vector3(0, 1, 0), -0.2).normalize()
      : this.guns.gunOut ? this.guns.shotDir()
        : gearView ? fwd.clone().multiplyScalar(0.6).addScaledVector(right, 0.6).add(new THREE.Vector3(0, 0.5, 0)).normalize()
          : this.cam.rodAim().applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.55 * this.rest.loungeK);
    return {
      mode,
      speed: this.mode === 'walk' ? this.speed : this.mode === 'transition' ? 1.2 : 0,
      handleL,
      handleR,
      rowLean: this.boat.rowing ? -Math.cos(ph) : -Math.cos(ph) * 0.25,
      fishing: showing,
      air: this.airborne,
      gun: this.guns.gunOut || gunView,
      gunKind: shownGun,
      reload: this.guns.gunOut && this.guns.reloadT > 0 ? 1 - this.guns.reloadT / GUNS[this.guns.gunKind].reload : 0,
      lounge: this.rest.loungeK,
      recoil: this.guns.recoil,
      pat: this.social.patK,
      patAt: this.social.patK > 0.01 && this.pet.exists ? this.pet.headTop(this.social.patTarget) : undefined,
      cheers: this.social.cheersK,
      rodDir,
      rodBend: gearView ? 0.12 : f.bendAmount(this.time),
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
      THREE,
      species: (id: string) => SPECIES.find((x) => x.id === id) ?? null,
      setHour: (h: number) => {
        this.hour = h;
        this.clockRunning = false;
        this.friends.clockChanged();
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
        if (this.friends.rideWith) this.friends.endRide(null);
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
          this.cam.yaw = facing;
        }
        this.cam.focus.set(x, this.py + 1.3, z);
        this.cam.dist = 5.4;
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
        this.cam.focus.set(x, 1.2, z);
      },
      cam: (yaw: number, pitch: number, dist?: number) => {
        this.cam.yaw = yaw;
        this.cam.pitch = pitch;
        if (dist) this.cam.dist = dist;
      },
    };
  }
}
