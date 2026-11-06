// HTML overlay: title, prompts, catch card, journal, menu. Reads and writes game state through callbacks.
import './styles.css';
import { clockLabel, sunDir } from '../core/time';
import { SPECIES, Species } from '../game/fishdata';
import { paintFish } from '../game/fishart';
import { Wardrobe, WardrobeHooks } from './wardrobe';
import { ICON } from './icons';

export interface JournalEntry { count: number; firstHour: number; biggest?: number }
export type Journal = Record<string, JournalEntry>;

export interface MenuHooks {
  resume(): void;
  journal(): void;
  quit(): void;
  savePainting(): void;
  setHour(h: number): void;
  getHour(): number;
  setClockRunning(v: boolean): void;
  getClockRunning(): boolean;
  setPaint(v: number): void;
  getPaint(): number;
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
  wardrobe(): void;
  friends(): void;
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
  /** The invite panel on the title screen for someone who followed a link. */
  joining = false;
  private focusI = 0;
  private padPrev: boolean[] = [];
  wardrobe!: Wardrobe;

  constructor(private hooks: MenuHooks, wardrobeHooks: WardrobeHooks) {
    this.root.innerHTML = /* html */ `
      <div id="title" class="fade hidden">
        <h1>Long Light</h1>
        <p>a quiet place to fish</p>
        <div class="titleBtns" id="tBtns">
          <button class="pill big" id="tPlay">${ICON.play}<span>Play</span></button>
          <button class="pill" id="tLook">${ICON.hat}<span>Your look</span></button>
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
        <h2 id="cName"></h2>
        <div id="cArt"></div>
        <div class="verse" id="cVerse"></div>
        <div class="note" id="cNote"></div>
        <div class="go" id="cGo"></div>
      </div>
      <div id="veil" class="hidden"></div>
      <div id="journal" class="paper hidden">
        <header><h2>What the bay has given</h2><span id="jCount"></span></header>
        <div id="jgrid"></div>
        <div id="jfoot"><div id="jDetail"></div><button class="iconBtn" id="jClose">${ICON.close}<span>Close</span></button></div>
      </div>
      <div id="rest" class="paper hidden">
        <h3>${ICON.bed} Rest until</h3>
        <button data-h="5.4">Dawn</button>
        <button data-h="9.5">Morning</button>
        <button data-h="17.2">Late afternoon</button>
        <button data-h="20.3">Nightfall</button>
        <button data-h="-1" class="quiet">Cancel</button>
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
          <button class="tile" id="mJournal">${ICON.book}<span>Journal</span></button>
          <button class="tile" id="mLook">${ICON.hat}<span>Your look</span></button>
          <button class="tile" id="mInvite">${ICON.people}<span>Friends</span><i id="mCount" class="gone"></i></button>
        </div>
        <div id="mSettings">
          <h4>World</h4>
          <div class="set">${ICON.sun}<label for="timeTrack">Time of day</label><input id="timeTrack" type="range" min="0" max="24" step="0.05"><b id="mTimeV"></b></div>
          <div class="set switch" id="mClock" role="switch" tabindex="0">${ICON.clock}<label>Sun moves by itself</label><span class="sw"><i></i></span></div>
          <div class="set">${ICON.brush}<label for="mPaint">Paint effect</label><input id="mPaint" type="range" min="0" max="10" step="1"><b id="mPaintV"></b></div>
          <h4>Sound</h4>
          <div class="set">${ICON.music}<label for="mMusic">Music</label><input id="mMusic" type="range" min="0" max="100" step="1"><b id="mMusicV"></b></div>
          <div class="set">${ICON.speaker}<label for="mSfx">Sounds</label><input id="mSfx" type="range" min="0" max="100" step="1"><b id="mSfxV"></b></div>
          <div class="set switch" id="mAway" role="switch" tabindex="0">${ICON.muted}<label>Mute when in background</label><span class="sw"><i></i></span></div>
          <h4>Mouse</h4>
          <div class="set">${ICON.mouse}<label for="mSens">Sensitivity</label><input id="mSens" type="range" min="10" max="300" step="5"><b id="mSensV"></b></div>
        </div>
        <div id="mKeys" class="gone">
          <h4>Moving</h4>
          <div class="keyRow"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span>Walk or row</div>
          <div class="keyRow"><span><kbd>Mouse</kbd></span>Look around</div>
          <div class="keyRow"><span><kbd>Q</kbd></span>Stroll the path by itself</div>
          <div class="keyRow"><span><kbd>Shift</kbd></span>Hurry a little</div>
          <h4>Doing</h4>
          <div class="keyRow"><span><kbd>E</kbd></span>Use what is nearby</div>
          <div class="keyRow"><span><kbd>Space</kbd> or <kbd>Click</kbd></span>Cast, hook, reel</div>
          <div class="keyRow"><span><kbd>B</kbd></span>Have a beer</div>
          <h4>Other</h4>
          <div class="keyRow"><span><kbd>J</kbd></span>Journal</div>
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
    el('mLook').onclick = () => h.wardrobe();
    el('mInvite').onclick = () => h.friends();
    el('mHelp').onclick = () => {
      const showKeys = el('mKeys').classList.contains('gone');
      el('mKeys').classList.toggle('gone', !showKeys);
      el('mSettings').classList.toggle('gone', showKeys);
      el('mHelpT').textContent = showKeys ? 'Settings' : 'Controls';
      h.sound('tick');
    };
    // Title screen.
    el('tPlay').onclick = () => h.play();
    el('tLook').onclick = () => h.wardrobe();
    el('tFriends').onclick = () => h.friends();
    el('jLook').onclick = () => h.wardrobe();
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
    for (const id of ['mClock', 'mAway']) {
      el(id).onkeydown = (e) => {
        if (e.code === 'Enter' || e.code === 'Space') el(id).click();
      };
    }
    el('mAway').onclick = () => {
      h.setMuteAway(!h.getMuteAway());
      h.sound('tick');
      this.refreshMenu();
    };
    el<HTMLInputElement>('mSens').oninput = (e) => h.setSensitivity(parseFloat((e.target as HTMLInputElement).value) / 100);
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
    el<HTMLInputElement>('mPaint').oninput = (e) => h.setPaint(parseFloat((e.target as HTMLInputElement).value));
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
    const key = `${sp.id}:${silhouette}:${w}`;
    let c = this.fishCache.get(key);
    if (!c) {
      c = paintFish(sp, w, h, silhouette);
      this.fishCache.set(key, c);
    }
    return c;
  }

  showCard(sp: Species | null, first: boolean, hour: number, count: number, sizeM: number, go: string) {
    const card = el('card');
    if (!sp) {
      card.classList.add('hidden');
      return;
    }
    el('cKick').textContent = first ? 'new in the journal' : count > 1 ? `the ${count === 2 ? 'second' : count === 3 ? 'third' : `${count}th`} one of these` : '';
    el('cName').textContent = sp.name;
    const art = el('cArt');
    art.innerHTML = '';
    const canvas = document.createElement('canvas');
    const src = this.fishPainting(sp, false);
    canvas.width = src.width;
    canvas.height = src.height;
    canvas.getContext('2d')!.drawImage(src, 0, 0);
    art.appendChild(canvas);
    el('cVerse').textContent = sp.verse;
    el('cNote').textContent = `${fmtLen(sizeM)}, in ${timeName(hour)}`;
    el('cGo').innerHTML = go;
    card.classList.remove('hidden');
  }

  private fillJournal(j: Journal) {
    const grid = el('jgrid');
    grid.innerHTML = '';
    const known = SPECIES.filter((s) => j[s.id]).length;
    el('jCount').textContent = `${known} of ${SPECIES.length} met`;
    const detail = el('jDetail');
    detail.textContent = known ? 'Point at a fish to read about it.' : 'Nothing yet. The water can wait, and so can you.';
    for (const sp of SPECIES) {
      const e = j[sp.id];
      const slot = document.createElement('div');
      slot.className = 'jslot';
      const src = this.fishPainting(sp, !e, 372, 198);
      const c = document.createElement('canvas');
      c.width = src.width;
      c.height = src.height;
      c.getContext('2d')!.drawImage(src, 0, 0);
      slot.appendChild(c);
      const name = document.createElement('b');
      name.textContent = e ? sp.name : '...';
      slot.appendChild(name);
      const em = document.createElement('em');
      em.textContent = e ? (e.count > 1 ? `met ${e.count} times` : 'met once') : '';
      slot.appendChild(em);
      slot.onmouseenter = () => {
        detail.textContent = e ? `${sp.name}. ${sp.verse}` : `Not yet met. ${sp.hint}`;
      };
      grid.appendChild(slot);
    }
  }

  showJournal(v: boolean, j: Journal, closeKey: string) {
    this.journalOpen = v;
    if (v) {
      this.fillJournal(j);
      el('jClose').onclick = () => this.hooks.resume();
      void closeKey;
    }
    el('journal').classList.toggle('hidden', !v);
    this.updateVeil();
  }

  private updateVeil() {
    el('veil').classList.toggle('hidden', !(this.journalOpen || this.menuOpen || this.restOpen || this.friendsOpen));
  }

  setWardrobe(v: boolean) {
    this.wardrobe.show(v);
  }

  refreshMenu() {
    const h = this.hooks;
    const hour = h.getHour();
    el<HTMLInputElement>('timeTrack').value = String(hour);
    el('mTimeV').textContent = clockLabel(hour);
    el('mClock').classList.toggle('on', h.getClockRunning());
    el('mClock').setAttribute('aria-checked', String(h.getClockRunning()));
    const p = h.getPaint();
    el<HTMLInputElement>('mPaint').value = String(p);
    el('mPaintV').textContent = p === 0 ? 'Off' : p < 4 ? 'Light' : p < 7 ? 'Medium' : 'Strong';
    const m = h.getMusic();
    el<HTMLInputElement>('mMusic').value = String(Math.round(m * 100));
    el('mMusicV').textContent = m < 0.02 ? 'Off' : `${Math.round(m * 100)}`;
    const s = h.getSfx();
    el<HTMLInputElement>('mSfx').value = String(Math.round(s * 100));
    el('mSfxV').textContent = s < 0.02 ? 'Off' : `${Math.round(s * 100)}`;
    const sens = h.getSensitivity();
    el<HTMLInputElement>('mSens').value = String(Math.round(sens * 100));
    el('mSensV').textContent = `${Math.round(sens * 100)}%`;
    el('mAway').classList.toggle('on', h.getMuteAway());
    el('mAway').setAttribute('aria-checked', String(h.getMuteAway()));
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
      const stepSize = cur.id === 'timeTrack' ? 0.5 : cur.id === 'mPaint' ? 1 : 5;
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
    if (this.menuOpen) {
      const hour = this.hooks.getHour();
      el('mTimeV').textContent = clockLabel(hour);
      if (document.activeElement !== el('timeTrack')) el<HTMLInputElement>('timeTrack').value = String(hour);
    }
  }
}
