// HTML overlay: title, prompts, catch card, journal, menu. Reads and writes game state through callbacks.
import './styles.css';
import { clockLabel, sunDir } from '../core/time';
import { SPECIES, Species, TIER_LABEL, TIERS, Tier, BANDS, BandId, bandAt, neonOf, placeSpecies, speciesIn, weightKg } from '../game/fishdata';
import { paintFish } from '../game/fishart';
import { BirdEntry, BirdKind, birdsOf, neonBird } from '../game/birddata';
import { paintBird } from '../game/birdart';
import { BOAT_PANEL, LOOK_PANEL, PET_PANEL, Wardrobe, WardrobeHooks, WardrobePanel } from './wardrobe';
import { ICON } from './icons';
import { MAP, MAP_ORDER, MapId, MAPS } from '../world/maps';
import { Q, QUALITIES, QUALITY_ORDER, QualityId } from '../core/quality';
import coveImg from '../../assets/place-cove.jpg?inline';
import philippinesImg from '../../assets/place-philippines.jpg?inline';
import canadaImg from '../../assets/place-canada.jpg?inline';

/** Filled stars for a tier, so rarity reads at a glance and without relying on colour. */
const tierStars = (t: Tier) => '★'.repeat(TIERS.indexOf(t) + 1) + '☆'.repeat(TIERS.length - 1 - TIERS.indexOf(t));

const BAND_ICON: Record<BandId, string> = { any: ICON.clock, dawn: ICON.dawn, day: ICON.sun, golden: ICON.sunset, night: ICON.moon, awake: ICON.sparkle };
const BAND_NOTE: Record<BandId, string> = {
  any: 'These are out at every hour. Point at one to read about it.',
  dawn: 'First light has fish of its own. Point at one to read about it.',
  day: 'What bites in full daylight. Point at one to read about it.',
  golden: 'The evening rise, right through sunset. Point at one to read about it.',
  night: 'After dark, about one fish in three comes up neon. Point at one to read about it.',
  awake: 'Where the water glows at night, nearly everything comes up neon, and any night fish may turn up.',
};

const PLACE_IMG: Record<MapId, string> = { cove: coveImg, philippines: philippinesImg, canada: canadaImg };

export interface JournalEntry { count: number; firstHour: number; neon?: number; biggest?: number }
export type Journal = Record<string, JournalEntry>;

export interface MenuHooks {
  resume(): void;
  journal(): void;
  resetJournal(): void;
  /** The birds brought down, by kind. */
  birdLog(): Record<string, BirdEntry>;
  setWeather(v: boolean): void;
  getWeather(): boolean;
  quit(): void;
  savePainting(): void;
  setHour(h: number): void;
  getHour(): number;
  setClockRunning(v: boolean): void;
  getClockRunning(): boolean;
  setMusic(v: number): void;
  getMusic(): number;
  setSfx(v: number): void;
  getSfx(): number;
  rest(h: number): void;
  sound(kind: 'tick' | 'page'): void;
  setSensitivity(v: number): void;
  getSensitivity(): number;
  setMuteAway(v: boolean): void;
  getMuteAway(): boolean;
  setWalkSpeed(v: number): void;
  getWalkSpeed(): number;
  setRowSpeed(v: number): void;
  getRowSpeed(): number;
  wardrobe(kind: 'self' | 'boat' | 'pet'): void;
  friends(): void;
  places(): void;
  closePlaces(): void;
  choosePlace(id: MapId): void;
  setQuality(id: QualityId): void;
  setFpsCap(v: number): void;
  getFpsCap(): number;
  setResolution(v: number): void;
  getResolution(): number;
  setQuietAway(v: boolean): void;
  getQuietAway(): boolean;
  setAdapt(v: boolean): void;
  getAdapt(): boolean;
  setShowFps(v: boolean): void;
  getShowFps(): boolean;
  play(): void;
  closeFriends(): void;
  startHosting(name: string): void;
  joinCove(name: string): void;
  leaveCove(): void;
  setName(name: string): void;
  getName(): string;
}

export interface FriendsView {
  role: 'solo' | 'host' | 'guest';
  link: string;
  status: string;
  error: string;
  people: { name: string; you: boolean; host: boolean }[];
}

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const fmtLen = (m: number) => (m >= 1 ? `${m.toFixed(1)} m` : `${Math.round(m * 100)} cm`);
const fmtWeight = (kg: number) => (kg >= 10 ? `${Math.round(kg)} kg` : kg >= 1 ? `${kg.toFixed(1)} kg` : `${Math.max(1, Math.round(kg * 1000 / 10) * 10)} g`);

/** What the gun HUD shows. */
export interface SightsView {
  rounds: number;
  magazine: number;
  kind: 'pistol' | 'rifle' | 'shotgun';
  name: string;
  reloading: boolean;
}

const PHASE_NAMES: [number, string][] = [
  [4.8, 'the small hours'], [7, 'first light'], [9.5, 'morning'], [12.5, 'late morning'], [16.3, 'afternoon'],
  [18.1, 'the golden hour'], [19.2, 'sunset'], [20.4, 'dusk'], [24, 'night'],
];
export const timeName = (h: number) => (PHASE_NAMES.find(([t]) => h < t) ?? [0, 'night'])[1];

export class UI {
  private root = el('ui');
  private fishCache = new Map<string, HTMLCanvasElement>();
  private toastT = 0;
  private hintT = 0;
  private clockT = 0;
  menuOpen = false;
  journalOpen = false;
  restOpen = false;
  friendsOpen = false;
  placesOpen = false;
  /** The invite panel on the title screen for someone who followed a link. */
  joining = false;
  private focusI = 0;
  private padPrev: boolean[] = [];
  private jPlace: MapId = MAP.id;
  /** Which half of the book is open. */
  private jKind: 'fish' | 'birds' = 'fish';
  private birdCache = new Map<string, HTMLCanvasElement>();
  private jBand: BandId = 'any';
  private jData: Journal | null = null;
  private resetArmed = false;
  private resetTimer = 0;
  wardrobe!: Wardrobe;

  constructor(readonly hooks: MenuHooks, wardrobeHooks: WardrobeHooks) {
    this.root.innerHTML = /* html */ `
      <div id="title" class="fade hidden">
        <h1>Long Light</h1>
        <p>${MAP.tagline}</p>
        <div class="titleBtns" id="tBtns">
          <button class="pill big" id="tPlay">${ICON.play}<span>Play</span></button>
          <button class="pill" id="tPlace">${ICON.map}<span>${MAP.name}</span></button>
          <button class="pill" id="tLook">${ICON.hat}<span>Your look</span></button>
          <button class="pill" id="tBoat">${ICON.boat}<span>Your boat</span></button>
          <button class="pill" id="tPet">${ICON.paw}<span>Your pet</span></button>
          <button class="pill" id="tFriends">${ICON.people}<span>Play with friends</span></button>
        </div>
        <div class="titleBtns gone" id="tJoin">
          <div class="joinCard paper">
            <h3>${ICON.people} A friend invited you</h3>
            <label class="field">Your name <input type="text" id="jName" maxlength="20" placeholder="What should they call you?" autocomplete="off"></label>
            <div class="joinRow">
              <button class="pill big" id="jGo">${ICON.play}<span>Join them</span></button>
              <button class="pill" id="jLook">${ICON.hat}<span>Your look</span></button>
            </div>
            <div class="status" id="jStatus"></div>
            <button class="textBtn gone" id="jAlone">Play on your own instead</button>
          </div>
        </div>
      </div>
      <div id="prompt" class="fade hidden"></div>
      <div id="hint" class="fade hidden"></div>
      <div id="toast" class="fade hidden"></div>
      <div id="clock" class="fade hidden">
        <svg viewBox="0 0 148 72" width="148" height="72">
          <path d="M6 66 A 68 62 0 0 1 142 66" fill="none" stroke="rgba(255,244,220,.5)" stroke-width="1.2" stroke-dasharray="1 5" stroke-linecap="round"/>
          <line x1="0" y1="66" x2="148" y2="66" stroke="rgba(255,244,220,.5)" stroke-width="1"/>
          <circle id="clockSun" cx="74" cy="6" r="6.5" fill="#ffe7b0"/>
        </svg>
        <span id="clockText"></span>
      </div>
      <div id="charge" class="fade hidden"><i></i></div>
      <div id="card" class="paper hidden">
        <div class="kicker" id="cKick"></div>
        <div class="tier" id="cTier"></div>
        <h2 id="cName"></h2>
        <div id="cArt"></div>
        <div class="verse" id="cVerse"></div>
        <div class="note" id="cNote"></div>
        <div class="go" id="cGo"></div>
      </div>
      <div id="veil" class="hidden"></div>
      <div id="journal" class="paper hidden">
        <header><h2>${ICON.book} Journal</h2><div id="jKinds"><button data-k="fish" class="on">${ICON.fish}<span>Fish</span></button><button data-k="birds">${ICON.bird}<span>Birds</span></button></div><span id="jCount"></span></header>
        <nav id="jPlaces" aria-label="Place"></nav>
        <nav id="jBands" aria-label="Time of day"></nav>
        <div id="jgrid"></div>
        <div id="jfoot"><div id="jDetail"></div><button class="iconBtn danger" id="jReset" title="Forget every fish and bird">${ICON.reset}<span id="jResetT">Reset</span></button><button class="iconBtn" id="jClose">${ICON.close}<span>Close</span></button></div>
      </div>
      <div id="rest" class="paper hidden">
        <h3>${ICON.bed} Rest until</h3>
        <button data-h="5.4">Dawn</button>
        <button data-h="9.5">Morning</button>
        <button data-h="17.2">Late afternoon</button>
        <button data-h="20.3">Nightfall</button>
        <button data-h="-1" class="quiet">Cancel</button>
      </div>
      <div id="fps" class="gone"></div>
      <div id="scope" class="gone"></div>
      <div id="energy" class="gone"><span class="eIc">${ICON.boat}</span><div class="eBar"><i></i></div><b id="eNote"></b></div>
      <div id="sights" class="gone"><i></i><div id="rounds"></div><div id="gunName"></div></div>
      <div id="places" class="paper hidden">
        <h2>${ICON.map} Choose a place</h2>
        <div class="placeCards">
          ${MAP_ORDER.map((id) => `<button class="placeCard${id === MAP.id ? ' here' : ''}" data-map="${id}"><img src="${PLACE_IMG[id]}" alt=""><b>${MAPS[id].name}</b><span>${MAPS[id].blurb}</span><i>${id === MAP.id ? 'You are here' : ''}</i></button>`).join('')}
        </div>
        <div class="status" id="pNote"></div>
        <div class="friendsFoot"><button class="iconBtn" id="pBack">${ICON.back}<span>Back</span></button></div>
      </div>
      <div id="friends" class="paper hidden">
        <h2>${ICON.people} Friends</h2>
        <label class="field">Your name <input type="text" id="fName" maxlength="20" placeholder="What should they call you?" autocomplete="off"></label>
        <div id="fSolo">
          <p class="lead">Send friends a link and they appear here in your cove, up to 8 of you. They need Chrome or Edge on a computer, and no account.</p>
          <button class="pill big" id="fStart">${ICON.link}<span>Create invite link</span></button>
        </div>
        <div id="fLive" class="gone">
          <p class="lead" id="fLead"></p>
          <div class="linkRow">
            <input type="text" id="fLink" readonly>
            <button class="pill" id="fCopy">${ICON.copy}<span id="fCopyT">Copy</span></button>
          </div>
          <h4>In the cove</h4>
          <ul id="fList"></ul>
        </div>
        <div class="status" id="fStatus"></div>
        <div class="friendsFoot">
          <button class="iconBtn" id="fBack">${ICON.back}<span>Back</span></button>
          <button class="iconBtn gone" id="fLeave">${ICON.door}<span id="fLeaveT">Stop</span></button>
        </div>
      </div>
      <div id="menu" class="paper hidden">
        <div class="tiles">
          <button class="tile primary" id="mResume">${ICON.play}<span>Resume</span></button>
          <button class="tile" id="mJournal">${ICON.book}<span>Journal</span><kbd class="tkey">J</kbd></button>
          <button class="tile" id="mInvite">${ICON.people}<span>Friends</span><i id="mCount" class="gone"></i><kbd class="tkey">F</kbd></button>
          <button class="tile" id="mPlace">${ICON.map}<span>Place</span><kbd class="tkey">M</kbd></button>
          <button class="tile" id="mLook">${ICON.hat}<span>Your look</span></button>
          <button class="tile" id="mBoat">${ICON.boat}<span>Your boat</span></button>
          <button class="tile" id="mPet">${ICON.paw}<span>Your pet</span></button>
          <button class="tile" id="mGfx">${ICON.gem}<span>Graphics</span></button>
        </div>
        <div id="mSettings">
          <h4>World</h4>
          <div class="set">${ICON.sun}<label for="timeTrack">Time of day</label><input id="timeTrack" type="range" min="0" max="24" step="0.05"><b id="mTimeV"></b></div>
          <div class="set switch" id="mClock" role="switch" tabindex="0">${ICON.clock}<label>Sun moves by itself</label><span class="sw"><i></i></span></div>
          <div class="set switch" id="mWeather" role="switch" tabindex="0">${ICON.cloud}<label>Changing weather</label><span class="sw"><i></i></span></div>
          <h4>Sound</h4>
          <div class="set">${ICON.music}<label for="mMusic">Music</label><input id="mMusic" type="range" min="0" max="100" step="1"><b id="mMusicV"></b></div>
          <div class="set">${ICON.speaker}<label for="mSfx">Sounds</label><input id="mSfx" type="range" min="0" max="100" step="1"><b id="mSfxV"></b></div>
          <div class="set switch" id="mAway" role="switch" tabindex="0">${ICON.muted}<label>Mute when in background</label><span class="sw"><i></i></span></div>
          <h4>Moving</h4>
          <div class="set">${ICON.boot}<label for="mWalk">Walking speed</label><input id="mWalk" type="range" min="50" max="300" step="5"><b id="mWalkV"></b></div>
          <div class="set">${ICON.boat}<label for="mRow">Rowing speed</label><input id="mRow" type="range" min="50" max="2000" step="10"><b id="mRowV"></b></div>
          <div class="set">${ICON.mouse}<label for="mSens">Mouse sensitivity</label><input id="mSens" type="range" min="10" max="300" step="5"><b id="mSensV"></b></div>
        </div>
        <div id="mGraphics" class="gone">
          <h4>Quality <small>changing this reloads the game</small></h4>
          <div class="pills" id="gQuality">${QUALITY_ORDER.map((q) => `<button data-q="${q}" class="${q === Q.id ? 'on' : ''}">${QUALITIES[q].label}</button>`).join('')}</div>
          <h4>Frame rate limit</h4>
          <div class="pills" id="gCap">${[30, 60, 120, 0].map((v) => `<button data-cap="${v}">${v || 'None'}</button>`).join('')}</div>
          <div class="set">${ICON.expand}<label for="gRes">Resolution</label><input id="gRes" type="range" min="50" max="100" step="5"><b id="gResV"></b></div>
          <div class="set switch" id="gAdapt" role="switch" tabindex="0">${ICON.gem}<label>Lower resolution if it gets slow</label><span class="sw"><i></i></span></div>
          <div class="set switch" id="gQuiet" role="switch" tabindex="0">${ICON.clock}<label>Slow down in the background</label><span class="sw"><i></i></span></div>
          <div class="set switch" id="gFps" role="switch" tabindex="0">${ICON.keys}<label>Show frame rate</label><span class="sw"><i></i></span></div>
        </div>
        <div id="mKeys" class="gone">
          <h4>Moving</h4>
          <div class="keyRow"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span>Run or row</div>
          <div class="keyRow"><span><kbd>Mouse</kbd></span>Look around</div>
          <div class="keyRow"><span><kbd>Q</kbd></span>Stroll the path by itself</div>
          <div class="keyRow"><span><kbd>Shift</kbd></span>Walk instead of run</div>
          <div class="keyRow"><span><kbd>Shift</kbd> in a boat</span>Row twice as fast</div>
          <div class="keyRow"><span><kbd>Space</kbd> tap</span>Jump</div>
          <div class="keyRow"><span><kbd>V</kbd></span>Sit back and relax, through your own eyes</div>
          <h4>Doing</h4>
          <div class="keyRow"><span><kbd>E</kbd></span>Use what is nearby, or climb into a friend's boat</div>
          <div class="keyRow"><span><kbd>Space</kbd> hold or <kbd>Click</kbd></span>Cast, hook, reel</div>
          <div class="keyRow"><span><kbd>B</kbd></span>Have a beer</div>
          <div class="keyRow"><span><kbd>P</kbd></span>Pat your pet, ashore or afloat</div>
          <div class="keyRow"><span><kbd>C</kbd> near a friend</span>Cheers, with fireworks</div>
          <h4>Guns, for the birds</h4>
          <div class="keyRow"><span><kbd>G</kbd></span>Gun in or out</div>
          <div class="keyRow"><span><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> or scroll</span>Desert Eagle, hunting rifle, shotgun</div>
          <div class="keyRow"><span><kbd>Click</kbd></span>Fire</div>
          <div class="keyRow"><span><kbd>Right-click</kbd> hold</span>Aim, or the rifle's scope</div>
          <div class="keyRow"><span><kbd>R</kbd></span>Reload</div>
          <h4>Other</h4>
          <div class="keyRow"><span><kbd>J</kbd></span>Journal</div>
          <div class="keyRow"><span><kbd>F</kbd></span>Friends</div>
          <div class="keyRow"><span><kbd>M</kbd></span>Choose a place</div>
          <div class="keyRow"><span><kbd>T</kbd> hold</span>Bring the sun along</div>
          <div class="keyRow"><span><kbd>H</kbd></span>Hide the words</div>
          <div class="keyRow"><span><kbd>Esc</kbd></span>This menu</div>
        </div>
        <div class="mFoot">
          <button class="iconBtn" id="mSave" title="Save this view as a picture">${ICON.camera}<span>Screenshot</span></button>
          <button class="iconBtn" id="mFull" title="Fill the screen">${ICON.expand}<span>Full screen</span></button>
          <button class="iconBtn" id="mHelp" title="See the controls">${ICON.keys}<span id="mHelpT">Controls</span></button>
          <button class="iconBtn" id="mQuit" title="Close the game">${ICON.door}<span>Quit</span></button>
        </div>
      </div>
    `;
    this.wire();
    this.wardrobe = new Wardrobe(this.root, wardrobeHooks);
  }

  private wire() {
    const h = this.hooks;
    el('mResume').onclick = () => h.resume();
    el('mJournal').onclick = () => h.journal();
    el('mLook').onclick = () => h.wardrobe('self');
    el('mBoat').onclick = () => h.wardrobe('boat');
    el('mPet').onclick = () => h.wardrobe('pet');
    el('mInvite').onclick = () => h.friends();
    const section = (which: 'mSettings' | 'mKeys' | 'mGraphics') => {
      for (const id of ['mSettings', 'mKeys', 'mGraphics']) el(id).classList.toggle('gone', id !== which);
      el('mHelpT').textContent = which === 'mKeys' ? 'Settings' : 'Controls';
      h.sound('tick');
    };
    el('mHelp').onclick = () => section(el('mKeys').classList.contains('gone') ? 'mKeys' : 'mSettings');
    el('mGfx').onclick = () => section(el('mGraphics').classList.contains('gone') ? 'mGraphics' : 'mSettings');
    el('mPlace').onclick = () => h.places();
    el('tPlace').onclick = () => h.places();
    el('pBack').onclick = () => h.closePlaces();
    el('places').querySelectorAll<HTMLButtonElement>('.placeCard').forEach((b) => {
      b.onclick = () => h.choosePlace(b.dataset.map as MapId);
    });
    el('gQuality').querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      b.onclick = () => {
        if (b.dataset.q !== Q.id) h.setQuality(b.dataset.q as QualityId);
      };
    });
    el('gCap').querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      b.onclick = () => {
        h.setFpsCap(Number(b.dataset.cap));
        h.sound('tick');
        this.refreshMenu();
      };
    });
    el<HTMLInputElement>('gRes').oninput = (e) => h.setResolution(parseFloat((e.target as HTMLInputElement).value) / 100);
    const flip = (id: string, get: () => boolean, set: (v: boolean) => void) => {
      el(id).onclick = () => {
        set(!get());
        h.sound('tick');
        this.refreshMenu();
      };
      el(id).onkeydown = (e) => {
        if (e.code === 'Enter' || e.code === 'Space') el(id).click();
      };
    };
    flip('gAdapt', h.getAdapt, h.setAdapt);
    flip('gQuiet', h.getQuietAway, h.setQuietAway);
    flip('gFps', h.getShowFps, h.setShowFps);
    // Title screen.
    el('tPlay').onclick = () => h.play();
    el('tLook').onclick = () => h.wardrobe('self');
    el('tBoat').onclick = () => h.wardrobe('boat');
    el('tPet').onclick = () => h.wardrobe('pet');
    el('tFriends').onclick = () => h.friends();
    el('jLook').onclick = () => h.wardrobe('self');
    el('jGo').onclick = () => h.joinCove(el<HTMLInputElement>('jName').value);
    el('jAlone').onclick = () => {
      this.showJoin(false);
      h.play();
    };
    // Friends panel.
    el('fStart').onclick = () => h.startHosting(el<HTMLInputElement>('fName').value);
    el('fBack').onclick = () => h.closeFriends();
    el('fLeave').onclick = () => h.leaveCove();
    el<HTMLInputElement>('fName').onchange = (e) => h.setName((e.target as HTMLInputElement).value);
    el<HTMLInputElement>('jName').onchange = (e) => h.setName((e.target as HTMLInputElement).value);
    el('fCopy').onclick = async () => {
      const box = el<HTMLInputElement>('fLink');
      box.select();
      let ok = false;
      try {
        await navigator.clipboard.writeText(box.value);
        ok = true;
      } catch {
        ok = document.execCommand?.('copy') ?? false;
      }
      el('fCopyT').textContent = ok ? 'Copied' : 'Press Ctrl+C';
      setTimeout(() => (el('fCopyT').textContent = 'Copy'), 2200);
    };
    el<HTMLInputElement>('fLink').onclick = (e) => (e.target as HTMLInputElement).select();
    for (const id of ['mClock', 'mAway', 'mWeather']) {
      el(id).onkeydown = (e) => {
        if (e.code === 'Enter' || e.code === 'Space') el(id).click();
      };
    }
    el('mAway').onclick = () => {
      h.setMuteAway(!h.getMuteAway());
      h.sound('tick');
      this.refreshMenu();
    };
    el('mWeather').onclick = () => {
      h.setWeather(!h.getWeather());
      h.sound('tick');
      this.refreshMenu();
    };
    el<HTMLInputElement>('mSens').oninput = (e) => h.setSensitivity(parseFloat((e.target as HTMLInputElement).value) / 100);
    el<HTMLInputElement>('mWalk').oninput = (e) => h.setWalkSpeed(parseFloat((e.target as HTMLInputElement).value) / 100);
    el<HTMLInputElement>('mRow').oninput = (e) => h.setRowSpeed(parseFloat((e.target as HTMLInputElement).value) / 100);
    el('mQuit').onclick = () => h.quit();
    el('mSave').onclick = () => h.savePainting();
    el('mFull').onclick = () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen().catch(() => {});
    };
    el('mClock').onclick = () => {
      h.setClockRunning(!h.getClockRunning());
      h.sound('tick');
      this.refreshMenu();
    };
    el<HTMLInputElement>('timeTrack').oninput = (e) => h.setHour(parseFloat((e.target as HTMLInputElement).value));
    el<HTMLInputElement>('mMusic').oninput = (e) => h.setMusic(parseFloat((e.target as HTMLInputElement).value) / 100);
    el<HTMLInputElement>('mSfx').oninput = (e) => h.setSfx(parseFloat((e.target as HTMLInputElement).value) / 100);
    el('rest').querySelectorAll('button').forEach((b) => {
      b.addEventListener('click', () => {
        const v = parseFloat((b as HTMLElement).dataset.h ?? '-1');
        this.showRest(false);
        if (v >= 0) h.rest(v);
        else h.resume();
      });
    });
  }

  setLoading(fraction: number, text: string) {
    const l = document.getElementById('loading');
    if (!l) return;
    (l.querySelector('i') as HTMLElement).style.width = `${Math.round(fraction * 100)}%`;
    (l.querySelector('p') as HTMLElement).textContent = text;
  }

  hideLoading() {
    const l = document.getElementById('loading');
    if (!l) return;
    l.style.opacity = '0';
    l.style.pointerEvents = 'none';
    setTimeout(() => l.remove(), 1600);
  }

  showTitle(v: boolean) {
    el('title').classList.toggle('hidden', !v);
  }

  prompt(html: string | null) {
    const p = el('prompt');
    if (html) {
      if (p.dataset.t !== html) {
        p.innerHTML = html;
        p.dataset.t = html;
      }
      p.classList.remove('hidden');
    } else {
      p.classList.add('hidden');
      p.dataset.t = '';
    }
  }

  toast(text: string, secs = 4) {
    const t = el('toast');
    t.textContent = text;
    t.classList.remove('hidden');
    this.toastT = secs;
  }

  hint(html: string, secs = 12) {
    const t = el('hint');
    t.innerHTML = html;
    t.classList.remove('hidden');
    this.hintT = secs;
  }

  hideHint() {
    el('hint').classList.add('hidden');
    this.hintT = 0;
  }

  charge(amount: number | null) {
    const c = el('charge');
    if (amount === null) {
      c.classList.add('hidden');
      return;
    }
    c.classList.remove('hidden');
    (c.querySelector('i') as HTMLElement).style.width = `${Math.round(amount * 100)}%`;
  }

  /** Reveal the sun-and-arc clock for a few seconds. */
  showClock(hour: number, secs = 3) {
    this.clockT = secs;
    const s = sunDir(hour);
    const isNight = s[1] < -0.05;
    const sun = el('clockSun');
    const h = ((hour % 24) + 24) % 24;
    const dayT = (h - 6.25) / 12.5;
    const nightT = ((h < 12 ? h + 24 : h) - 18.75) / 11.5;
    const t = isNight ? nightT : Math.min(1, Math.max(0, dayT));
    const a = Math.PI * Math.min(1, Math.max(0, t));
    sun.setAttribute('cx', String(74 - Math.cos(a) * 68));
    sun.setAttribute('cy', String(66 - Math.sin(a) * 60));
    sun.setAttribute('fill', isNight ? '#dfe6ff' : h > 17.5 || h < 7.2 ? '#ffb070' : '#ffe7b0');
    sun.setAttribute('r', isNight ? '5' : '6.5');
    el('clockText').textContent = clockLabel(h);
    el('clock').classList.remove('hidden');
  }

  fishPainting(sp: Species, silhouette: boolean, w = 620, h = 330): HTMLCanvasElement {
    const key = `${sp.id}:${silhouette}:${w}:${sp.neon ? 1 : 0}`;
    let c = this.fishCache.get(key);
    if (!c) {
      c = paintFish(sp, w, h, silhouette);
      this.fishCache.set(key, c);
    }
    return c;
  }

  showCard(sp: Species | null, first: boolean, hour: number, count: number, sizeM: number, go: string, kg = 0, record = false) {
    const card = el('card');
    if (!sp) {
      card.classList.add('hidden');
      return;
    }
    el('cKick').textContent = first ? 'new in the journal' : record ? 'your biggest one yet' : count > 1 ? `the ${count === 2 ? 'second' : count === 3 ? 'third' : `${count}th`} one of these` : '';
    el('cKick').classList.toggle('record', record);
    el('cName').textContent = sp.name;
    const tier = el('cTier');
    tier.className = `tier tier-${sp.tier}`;
    tier.innerHTML = `<span>${tierStars(sp.tier)}</span> ${TIER_LABEL[sp.tier]}${sp.neon ? ' &middot; <b class="neonTag">Neon</b>' : ''}`;
    const art = el('cArt');
    art.innerHTML = '';
    const canvas = document.createElement('canvas');
    const src = this.fishPainting(sp, false);
    canvas.width = src.width;
    canvas.height = src.height;
    canvas.getContext('2d')!.drawImage(src, 0, 0);
    art.appendChild(canvas);
    el('cVerse').textContent = sp.verse;
    el('cNote').textContent = `${fmtLen(sizeM)}${kg > 0 ? `, ${fmtWeight(kg)}` : ''}, in ${timeName(hour)}`;
    el('cGo').innerHTML = go;
    card.classList.remove('hidden');
  }

  /** Opens on where you are and the part of the day it is now, which is what you're most likely to want. */
  journalOpenAt(hour: number) {
    this.jPlace = MAP.id;
    this.jBand = bandAt(hour);
  }

  private birdPainting(b: BirdKind, silhouette: boolean, w: number, h: number, neon = false): HTMLCanvasElement {
    const key = `${b.id}|${silhouette}|${w}|${neon}`;
    let c = this.birdCache.get(key);
    if (!c) {
      c = paintBird(neon ? neonBird(b) : b, w, h, silhouette, neon);
      this.birdCache.set(key, c);
    }
    return c;
  }

  private fillBirds() {
    const log = this.hooks.birdLog();
    const places = el('jPlaces');
    places.innerHTML = '';
    for (const id of MAP_ORDER) {
      const birds = birdsOf(id);
      const b = document.createElement('button');
      b.className = id === this.jPlace ? 'on' : '';
      b.innerHTML = `${ICON.map}<span></span><i>${birds.filter((x) => log[x.id]).length}/${birds.length}</i>`;
      b.querySelector('span')!.textContent = MAPS[id].name;
      b.onclick = () => {
        this.jPlace = id;
        this.hooks.sound('tick');
        this.fillJournal(this.jData ?? {});
      };
      places.appendChild(b);
    }
    el('jBands').classList.add('gone');
    const all = birdsOf(this.jPlace);
    el('jCount').textContent = `${all.filter((b) => log[b.id]).length} of ${all.length} brought down here`;
    const detail = el('jDetail');
    const note = 'Birds of this place, from the everyday to the almost never seen. Some only fly after dark.';
    detail.textContent = note;
    const grid = el('jgrid');
    grid.innerHTML = '';
    for (const bird of all) {
      const e = log[bird.id];
      const slot = document.createElement('div');
      slot.className = `jslot tier-${bird.tier}`;
      const stars = document.createElement('i');
      stars.className = 'jstars';
      stars.textContent = tierStars(bird.tier);
      slot.appendChild(stars);
      const src = this.birdPainting(bird, !e, 372, 198, !!e?.neon);
      const c = document.createElement('canvas');
      c.width = src.width;
      c.height = src.height;
      c.getContext('2d')!.drawImage(src, 0, 0);
      slot.appendChild(c);
      const name = document.createElement('b');
      name.textContent = e ? bird.name : '...';
      slot.appendChild(name);
      const em = document.createElement('em');
      em.textContent = e ? `${e.count > 1 ? `${e.count} brought down` : 'one brought down'}${e.longest > 0 ? `, ${Math.round(e.longest)} m` : ''}${e.neon ? `, ${e.neon} neon` : ''}` : '';
      slot.appendChild(em);
      slot.onmouseenter = () => {
        detail.textContent = e ? `${bird.name}. ${TIER_LABEL[bird.tier]}.${e.longest > 0 ? ` Longest shot ${Math.round(e.longest)} m.` : ''} ${bird.verse}` : `Not yet. ${TIER_LABEL[bird.tier]}. ${bird.hint}`;
      };
      slot.onmouseleave = () => {
        detail.textContent = note;
      };
      grid.appendChild(slot);
    }
  }

  private fillJournal(j: Journal) {
    el('jKinds').querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      b.classList.toggle('on', b.dataset.k === this.jKind);
      b.onclick = () => {
        if (this.jKind === b.dataset.k) return;
        this.jKind = b.dataset.k as 'fish' | 'birds';
        this.hooks.sound('tick');
        this.fillJournal(j);
      };
    });
    if (this.jKind === 'birds') {
      this.fillBirds();
      return;
    }
    el('jBands').classList.remove('gone');
    // Places.
    const places = el('jPlaces');
    places.innerHTML = '';
    for (const id of MAP_ORDER) {
      const fish = placeSpecies(id);
      const b = document.createElement('button');
      b.className = id === this.jPlace ? 'on' : '';
      b.innerHTML = `${ICON.map}<span></span><i>${fish.filter((s) => j[s.id]).length}/${fish.length}</i>`;
      b.querySelector('span')!.textContent = MAPS[id].name;
      b.onclick = () => {
        this.jPlace = id;
        this.hooks.sound('tick');
        this.fillJournal(j);
      };
      places.appendChild(b);
    }
    // Parts of the day.
    const bands = el('jBands');
    bands.innerHTML = '';
    for (const band of BANDS) {
      const fish = speciesIn(this.jPlace, band.id);
      const b = document.createElement('button');
      b.className = band.id === this.jBand ? 'on' : '';
      b.innerHTML = `${BAND_ICON[band.id]}<span>${band.label}</span><i>${fish.filter((s) => j[s.id]).length}/${fish.length}</i>`;
      b.onclick = () => {
        this.jBand = band.id;
        this.hooks.sound('tick');
        this.fillJournal(j);
      };
      bands.appendChild(b);
    }
    const all = placeSpecies(this.jPlace);
    el('jCount').textContent = `${all.filter((s) => j[s.id]).length} of ${all.length} met here`;
    const detail = el('jDetail');
    const note = BAND_NOTE[this.jBand];
    detail.textContent = note;
    // The fish.
    const grid = el('jgrid');
    grid.innerHTML = '';
    for (const sp of speciesIn(this.jPlace, this.jBand)) {
      const e = j[sp.id];
      const slot = document.createElement('div');
      slot.className = `jslot tier-${sp.tier}`;
      const stars = document.createElement('i');
      stars.className = 'jstars';
      stars.textContent = tierStars(sp.tier);
      slot.appendChild(stars);
      // Once one's come up glowing, that's the picture to keep.
      const shown = e?.neon ? neonOf(sp) : sp;
      const src = this.fishPainting(shown, !e, 372, 198);
      const c = document.createElement('canvas');
      c.width = src.width;
      c.height = src.height;
      c.getContext('2d')!.drawImage(src, 0, 0);
      slot.appendChild(c);
      const name = document.createElement('b');
      name.textContent = e ? sp.name : '...';
      slot.appendChild(name);
      const em = document.createElement('em');
      em.textContent = e ? `${e.count > 1 ? `met ${e.count} times` : 'met once'}${e.neon ? `, ${e.neon} neon` : ''}` : '';
      slot.appendChild(em);
      const best = e?.biggest ? `Biggest ${fmtLen(e.biggest)}, ${fmtWeight(weightKg(sp, e.biggest))}. ` : '';
      slot.onmouseenter = () => {
        detail.textContent = e ? `${sp.name}. ${best}${sp.verse}` : `Not yet met. ${sp.hint}`;
      };
      slot.onmouseleave = () => {
        detail.textContent = note;
      };
      grid.appendChild(slot);
    }
  }

  showJournal(v: boolean, j: Journal, closeKey: string) {
    this.journalOpen = v;
    if (v) {
      this.jData = j;
      this.fillJournal(j);
      el('jClose').onclick = () => this.hooks.resume();
      // Two presses, because this can't be undone: the first only asks.
      this.resetArmed = false;
      el('jReset').classList.remove('armed');
      el('jResetT').textContent = 'Reset';
      el('jReset').onclick = () => {
        if (!this.resetArmed) {
          this.resetArmed = true;
          el('jReset').classList.add('armed');
          el('jResetT').textContent = 'Erase every fish and bird? Press again';
          window.clearTimeout(this.resetTimer);
          this.resetTimer = window.setTimeout(() => {
            this.resetArmed = false;
            el('jReset').classList.remove('armed');
            el('jResetT').textContent = 'Reset';
          }, 4000);
          this.hooks.sound('tick');
          return;
        }
        window.clearTimeout(this.resetTimer);
        this.resetArmed = false;
        el('jReset').classList.remove('armed');
        el('jResetT').textContent = 'Reset';
        this.hooks.resetJournal();
      };
      void closeKey;
    }
    el('journal').classList.toggle('hidden', !v);
    this.updateVeil();
  }

  private updateVeil() {
    el('veil').classList.toggle('hidden', !(this.journalOpen || this.menuOpen || this.restOpen || this.friendsOpen || this.placesOpen));
  }

  setWardrobe(v: boolean, kind: 'self' | 'boat' | 'pet' = 'self') {
    const panel: WardrobePanel = kind === 'boat' ? BOAT_PANEL : kind === 'pet' ? PET_PANEL : LOOK_PANEL;
    this.wardrobe.show(v, panel);
  }

  refreshMenu() {
    const h = this.hooks;
    const hour = h.getHour();
    el<HTMLInputElement>('timeTrack').value = String(hour);
    el('mTimeV').textContent = clockLabel(hour);
    el('mClock').classList.toggle('on', h.getClockRunning());
    el('mClock').setAttribute('aria-checked', String(h.getClockRunning()));
    const m = h.getMusic();
    el<HTMLInputElement>('mMusic').value = String(Math.round(m * 100));
    el('mMusicV').textContent = m < 0.02 ? 'Off' : `${Math.round(m * 100)}`;
    const s = h.getSfx();
    el<HTMLInputElement>('mSfx').value = String(Math.round(s * 100));
    el('mSfxV').textContent = s < 0.02 ? 'Off' : `${Math.round(s * 100)}`;
    const sens = h.getSensitivity();
    el<HTMLInputElement>('mSens').value = String(Math.round(sens * 100));
    el('mSensV').textContent = `${Math.round(sens * 100)}%`;
    const walk = h.getWalkSpeed();
    el<HTMLInputElement>('mWalk').value = String(Math.round(walk * 100));
    el('mWalkV').textContent = `${Math.round(walk * 100)}%`;
    const row = h.getRowSpeed();
    el<HTMLInputElement>('mRow').value = String(Math.round(row * 100));
    el('mRowV').textContent = `${Math.round(row * 100)}%`;
    el('mAway').classList.toggle('on', h.getMuteAway());
    el('mAway').setAttribute('aria-checked', String(h.getMuteAway()));
    el('mWeather').classList.toggle('on', h.getWeather());
    el('mWeather').setAttribute('aria-checked', String(h.getWeather()));
    el('gCap').querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.classList.toggle('on', Number(b.dataset.cap) === h.getFpsCap()));
    const res = h.getResolution();
    el<HTMLInputElement>('gRes').value = String(Math.round(res * 100));
    el('gResV').textContent = `${Math.round(res * 100)}%`;
    for (const [id, on] of [['gAdapt', h.getAdapt()], ['gQuiet', h.getQuietAway()], ['gFps', h.getShowFps()]] as [string, boolean][]) {
      el(id).classList.toggle('on', on);
      el(id).setAttribute('aria-checked', String(on));
    }
  }

  showPlaces(v: boolean, note = '') {
    this.placesOpen = v;
    el('pNote').textContent = note;
    el('places').classList.toggle('hidden', !v);
    this.updateVeil();
  }

  placeNote(text: string) {
    el('pNote').textContent = text;
  }

  /** The sights, which gun, and how many rounds are left, or null when the gun is away. */
  sights(v: SightsView | null) {
    const box = el('sights');
    box.classList.toggle('gone', v === null);
    if (v === null) {
      this.scope(false);
      return;
    }
    const rounds = el('rounds');
    if (rounds.dataset.kind !== v.kind) {
      rounds.dataset.kind = v.kind;
      rounds.className = `r-${v.kind}`;
      rounds.innerHTML = '<b></b>'.repeat(v.magazine);
    }
    rounds.querySelectorAll('b').forEach((b, i) => b.classList.toggle('spent', i >= v.rounds));
    el('gunName').textContent = v.reloading ? `${v.name}, reloading` : v.name;
    box.classList.toggle('reloading', v.reloading);
  }

  /** How much rowing hard is left in you, or null to hide it. */
  energy(v: number | null, winded = false, resting = false) {
    const box = el('energy');
    box.classList.toggle('gone', v === null);
    if (v === null) return;
    (box.querySelector('.eBar i') as HTMLElement).style.transform = `scaleX(${Math.max(0, Math.min(1, v)).toFixed(3)})`;
    box.classList.toggle('winded', winded);
    box.classList.toggle('resting', resting && v < 1);
    el('eNote').textContent = winded ? 'catch your breath' : resting && v < 1 ? 'resting' : '';
  }

  /** Looking through the rifle's scope. */
  scope(on: boolean) {
    const s = el('scope');
    if (s.classList.contains('gone') === !on) return;
    s.classList.toggle('gone', !on);
    el('sights').classList.toggle('scoped', on);
  }

  setFps(text: string | null) {
    el('fps').classList.toggle('gone', text === null);
    if (text !== null) el('fps').textContent = text;
  }

  showFriends(v: boolean) {
    this.friendsOpen = v;
    if (v) el<HTMLInputElement>('fName').value = this.hooks.getName();
    el('friends').classList.toggle('hidden', !v);
    this.updateVeil();
  }

  renderFriends(view: FriendsView) {
    const live = view.role !== 'solo';
    el('fSolo').classList.toggle('gone', live);
    el('fLive').classList.toggle('gone', !live || !view.link);
    el('fLeave').classList.toggle('gone', !live);
    el('fLeaveT').textContent = view.role === 'host' ? 'Stop inviting' : 'Leave';
    el('fLead').textContent = view.role === 'host' ? 'Send this link to your friends. It works while your game is open.' : 'Send this link to bring in more friends.';
    const box = el<HTMLInputElement>('fLink');
    if (box.value !== view.link) box.value = view.link;
    const list = el('fList');
    list.innerHTML = '';
    for (const p of view.people) {
      const li = document.createElement('li');
      if (p.host) li.insertAdjacentHTML('afterbegin', ICON.crown);
      else li.insertAdjacentHTML('afterbegin', ICON.face);
      const n = document.createElement('span');
      n.textContent = p.name + (p.you ? ' (you)' : '');
      li.appendChild(n);
      list.appendChild(li);
    }
    const status = el('fStatus');
    status.textContent = view.error || view.status;
    status.classList.toggle('bad', !!view.error);
    const count = el('mCount');
    count.textContent = String(view.people.length);
    count.classList.toggle('gone', view.people.length < 2);
  }

  /** The title screen for someone who followed an invite link. */
  showJoin(v: boolean) {
    this.joining = v;
    el('tJoin').classList.toggle('gone', !v);
    el('tBtns').classList.toggle('gone', v);
    if (v) el<HTMLInputElement>('jName').value = this.hooks.getName();
  }

  joinStatus(text: string, failed = false) {
    const s = el('jStatus');
    s.textContent = text;
    s.classList.toggle('bad', failed);
    el('jAlone').classList.toggle('gone', !failed);
    el<HTMLButtonElement>('jGo').disabled = !failed && !!text;
  }

  showMenu(v: boolean) {
    this.menuOpen = v;
    if (v) {
      this.refreshMenu();
      this.focusI = 0;
      el('mKeys').classList.add('gone');
      el('mGraphics').classList.add('gone');
      el('mSettings').classList.remove('gone');
      el('mHelpT').textContent = 'Controls';
    }
    el('menu').classList.toggle('hidden', !v);
    this.updateVeil();
  }

  showRest(v: boolean) {
    this.restOpen = v;
    this.focusI = 0;
    el('rest').classList.toggle('hidden', !v);
    this.updateVeil();
  }

  setWordsHidden(v: boolean) {
    this.root.style.opacity = v ? '0' : '1';
  }

  /** L1 and R1 go through the parts of the day, the d-pad through the places. */
  private padJournal() {
    const p = Array.from(navigator.getGamepads?.() ?? []).find((x) => x);
    if (!p || !this.jData) return;
    const edge = (i: number) => {
      const b = !!p.buttons[i]?.pressed;
      const r = b && !this.padPrev[i];
      this.padPrev[i] = b;
      return r;
    };
    const step = (edge(5) ? 1 : 0) - (edge(4) ? 1 : 0);
    const place = (edge(15) ? 1 : 0) - (edge(14) ? 1 : 0);
    const kind = edge(3);
    if (kind) this.jKind = this.jKind === 'fish' ? 'birds' : 'fish';
    if (step && this.jKind === 'fish') {
      const i = BANDS.findIndex((b) => b.id === this.jBand);
      this.jBand = BANDS[(i + step + BANDS.length) % BANDS.length].id;
    }
    if (place) this.jPlace = MAP_ORDER[(MAP_ORDER.indexOf(this.jPlace) + place + MAP_ORDER.length) % MAP_ORDER.length];
    if (step || place || kind) {
      this.hooks.sound('tick');
      this.fillJournal(this.jData);
    }
  }

  /** Lets a PS4 controller drive the menus. */
  private padNav() {
    const pads = navigator.getGamepads?.() ?? [];
    const p = Array.from(pads).find((x) => x);
    if (!p) return;
    const edge = (i: number) => {
      const b = !!p.buttons[i]?.pressed;
      const r = b && !this.padPrev[i];
      this.padPrev[i] = b;
      return r;
    };
    const up = edge(12);
    const down = edge(13);
    const left = edge(14);
    const right = edge(15);
    const ok = edge(0);
    const container = this.restOpen ? el('rest') : this.menuOpen ? el('menu') : null;
    if (!container) return;
    const items = Array.from(container.querySelectorAll<HTMLElement>('button, input[type=range], .switch')).filter((it) => it.offsetParent !== null);
    if (!items.length) return;
    if (up) this.focusI = (this.focusI + items.length - 1) % items.length;
    if (down) this.focusI = (this.focusI + 1) % items.length;
    items.forEach((it, i) => it.classList.toggle('focus', i === this.focusI));
    const cur = items[this.focusI];
    if (up || down) {
      cur.scrollIntoView({ block: 'nearest' });
      this.hooks.sound('tick');
    }
    if (ok && !(cur instanceof HTMLInputElement)) cur.click();
    if ((left || right) && cur instanceof HTMLInputElement) {
      const stepSize = cur.id === 'timeTrack' ? 0.5 : 5;
      const v = Math.min(parseFloat(cur.max), Math.max(parseFloat(cur.min), parseFloat(cur.value) + (right ? stepSize : -stepSize)));
      cur.value = String(v);
      cur.dispatchEvent(new Event('input'));
    }
  }

  update(dt: number) {
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) el('toast').classList.add('hidden');
    }
    if (this.hintT > 0) {
      this.hintT -= dt;
      if (this.hintT <= 0) el('hint').classList.add('hidden');
    }
    if (this.clockT > 0) {
      this.clockT -= dt;
      if (this.clockT <= 0) el('clock').classList.add('hidden');
    }
    this.wardrobe.update();
    if (this.menuOpen || this.restOpen) this.padNav();
    if (this.journalOpen) this.padJournal();
    if (this.menuOpen) {
      const hour = this.hooks.getHour();
      el('mTimeV').textContent = clockLabel(hour);
      if (document.activeElement !== el('timeTrack')) el<HTMLInputElement>('timeTrack').value = String(hour);
    }
  }
}
