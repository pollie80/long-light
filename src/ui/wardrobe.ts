// The wardrobe: every part of the fisher, sensible and silly, changed live on the figure.
import { BOAT_GROUPS, CharacterLook, DEFAULT_LOOK, GROUPS, PET_GROUPS, PICKS, PickKey, randomLook, SLIDERS, SliderKey } from '../actors/look';
import { ICON } from './icons';

const TAB_ICON: Record<string, string> = { Face: ICON.face, Hair: ICON.scissors, Hat: ICON.hat, Clothes: ICON.shirt, Body: ICON.ruler, Gear: ICON.hook, Boat: ICON.boat, Colours: ICON.brush };

export interface WardrobePanel {
  title: string;
  icon: string;
  groups: string[];
}

export const LOOK_PANEL: WardrobePanel = { title: 'Your look', icon: ICON.hat, groups: GROUPS };
export const BOAT_PANEL: WardrobePanel = { title: 'Your boat', icon: ICON.boat, groups: BOAT_GROUPS };
export const PET_PANEL: WardrobePanel = { title: 'Your pet', icon: ICON.paw, groups: PET_GROUPS };

export interface WardrobeHooks {
  get(): CharacterLook;
  set(l: CharacterLook): void;
  close(): void;
  tick(): void;
}

export class Wardrobe {
  open = false;
  private el: HTMLElement;
  private body: HTMLElement;
  private tabs: HTMLElement;
  private panel = LOOK_PANEL;
  group = GROUPS[0];
  private focusI = 0;
  private padPrev: boolean[] = [];

  constructor(root: HTMLElement, private hooks: WardrobeHooks) {
    this.el = document.createElement('div');
    this.el.id = 'wardrobe';
    this.el.className = 'paper hidden';
    this.el.innerHTML = /* html */ `
      <h2 id="wTitle"></h2>
      <div id="wTabs"></div>
      <div id="wBody"></div>
      <div id="wFoot">
        <button data-w="sane" class="iconBtn" title="A random, sensible look">${ICON.dice}<span>Random</span></button>
        <button data-w="silly" class="iconBtn" title="A random, silly look">${ICON.party}<span>Silly</span></button>
        <button data-w="reset" class="iconBtn" title="Back to how you started">${ICON.reset}<span>Reset</span></button>
        <button data-w="done" class="pill done">${ICON.check}<span>Done</span></button>
      </div>
      <div class="note">Drag the picture to turn, scroll to zoom</div>`;
    root.appendChild(this.el);
    this.body = this.el.querySelector('#wBody')!;
    this.tabs = this.el.querySelector('#wTabs')!;
    this.el.querySelectorAll<HTMLButtonElement>('#wFoot button').forEach((b) => {
      b.onclick = () => this.action(b.dataset.w!);
    });
    window.addEventListener('keydown', (e) => {
      if (!this.open) return;
      if (e.code === 'ArrowUp') this.moveFocus(-1);
      else if (e.code === 'ArrowDown') this.moveFocus(1);
      else if (e.code === 'ArrowLeft') this.adjust(-1);
      else if (e.code === 'ArrowRight') this.adjust(1);
      else if (e.code === 'Tab') this.nextTab(e.shiftKey ? -1 : 1);
    });
  }

  private action(a: string) {
    if (a === 'done') {
      this.hooks.close();
      return;
    }
    if (a === 'sane') this.hooks.set(this.only(randomLook(false)));
    if (a === 'silly') this.hooks.set(this.only(randomLook(true)));
    if (a === 'reset') this.hooks.set(this.only(DEFAULT_LOOK));
    this.hooks.tick();
    this.render();
  }

  /** The current look with just this panel's parts taken from another. */
  private only(from: CharacterLook): CharacterLook {
    const out = { ...this.hooks.get() };
    for (const r of PICKS) if (this.panel.groups.includes(r.group)) out[r.key] = from[r.key];
    for (const r of SLIDERS) if (this.panel.groups.includes(r.group)) out[r.key] = from[r.key];
    return out;
  }

  private nextTab(dir: number) {
    const groups = this.panel.groups;
    const i = groups.indexOf(this.group);
    this.group = groups[(i + dir + groups.length) % groups.length];
    this.focusI = 0;
    this.hooks.tick();
    this.render();
  }

  private step(key: PickKey, dir: number) {
    const row = PICKS.find((r) => r.key === key)!;
    const look = this.hooks.get();
    const i = row.choices.findIndex((c) => c.id === look[key]);
    const next = row.choices[(i + dir + row.choices.length) % row.choices.length];
    this.hooks.set({ ...look, [key]: next.id });
    this.hooks.tick();
    this.render();
  }

  /** The row being changed, so the figure can hold up whatever it is about. */
  get activeKey(): string {
    const r = this.rows()[this.focusI];
    return r?.dataset.pick ?? r?.dataset.slider ?? '';
  }

  private rows(): HTMLElement[] {
    return Array.from(this.body.querySelectorAll<HTMLElement>('.wRow'));
  }

  private moveFocus(dir: number) {
    const rows = this.rows();
    if (!rows.length) return;
    this.focusI = (this.focusI + dir + rows.length) % rows.length;
    this.showFocus();
    this.hooks.tick();
  }

  private showFocus() {
    const rows = this.rows();
    rows.forEach((r, i) => r.classList.toggle('focus', i === this.focusI));
    rows[this.focusI]?.scrollIntoView({ block: 'nearest' });
  }

  private adjust(dir: number) {
    const row = this.rows()[this.focusI];
    if (!row) return;
    if (row.dataset.pick) this.step(row.dataset.pick as PickKey, dir);
    if (row.dataset.slider) {
      const key = row.dataset.slider as SliderKey;
      const s = SLIDERS.find((x) => x.key === key)!;
      const look = this.hooks.get();
      const v = Math.min(s.max, Math.max(s.min, look[key] + dir * (s.max - s.min) * 0.06));
      this.hooks.set({ ...look, [key]: v });
      this.render();
    }
  }

  private render() {
    const look = this.hooks.get();
    this.tabs.innerHTML = '';
    this.tabs.classList.toggle('gone', this.panel.groups.length < 2);
    for (const g of this.panel.groups) {
      const t = document.createElement('button');
      t.innerHTML = `${TAB_ICON[g] ?? ''}<span>${g}</span>`;
      t.className = g === this.group ? 'on' : '';
      t.onclick = () => {
        this.group = g;
        this.focusI = 0;
        this.hooks.tick();
        this.render();
      };
      this.tabs.appendChild(t);
    }
    const scroll = this.body.scrollTop;
    this.body.innerHTML = '';
    for (const row of PICKS.filter((r) => r.group === this.group)) {
      const el = document.createElement('div');
      el.className = 'wRow';
      el.dataset.pick = row.key;
      // Working on a row with the mouse makes it the one in focus, as the arrow keys would.
      el.addEventListener('pointerdown', () => {
        this.focusI = this.rows().indexOf(el);
        this.showFocus();
      });
      const current = row.choices.find((c) => c.id === look[row.key]) ?? row.choices[0];
      const label = document.createElement('label');
      label.textContent = row.label;
      el.appendChild(label);
      if (row.colours) {
        const name = document.createElement('b');
        name.textContent = current.label;
        label.appendChild(name);
        const swatches = document.createElement('div');
        swatches.className = 'swatches';
        for (const c of row.choices) {
          const s = document.createElement('button');
          s.style.background = `#${(c.color ?? 0).toString(16).padStart(6, '0')}`;
          s.title = c.label;
          s.className = c.id === current.id ? 'on' : '';
          s.onclick = () => {
            this.hooks.set({ ...this.hooks.get(), [row.key]: c.id });
            this.hooks.tick();
            this.render();
          };
          swatches.appendChild(s);
        }
        el.appendChild(swatches);
      } else {
        const pick = document.createElement('div');
        pick.className = 'pick';
        const prev = document.createElement('button');
        prev.textContent = '‹';
        prev.onclick = () => this.step(row.key, -1);
        const value = document.createElement('span');
        value.textContent = current.label;
        if (current.silly) value.classList.add('silly');
        value.onclick = () => this.step(row.key, 1);
        const next = document.createElement('button');
        next.textContent = '›';
        next.onclick = () => this.step(row.key, 1);
        pick.append(prev, value, next);
        el.appendChild(pick);
      }
      this.body.appendChild(el);
    }
    for (const s of SLIDERS.filter((r) => r.group === this.group)) {
      const el = document.createElement('div');
      el.className = 'wRow';
      el.dataset.slider = s.key;
      const label = document.createElement('label');
      label.textContent = s.label;
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(s.min);
      input.max = String(s.max);
      input.step = '0.01';
      input.value = String(look[s.key]);
      input.oninput = () => this.hooks.set({ ...this.hooks.get(), [s.key]: parseFloat(input.value) });
      el.append(label, input);
      this.body.appendChild(el);
    }
    this.body.scrollTop = scroll;
    this.showFocus();
  }

  show(v: boolean, panel: WardrobePanel = LOOK_PANEL) {
    this.open = v;
    this.el.classList.toggle('hidden', !v);
    if (v) {
      this.panel = panel;
      this.group = panel.groups[0];
      this.el.querySelector('#wTitle')!.innerHTML = `${panel.icon} ${panel.title}`;
      this.focusI = 0;
      this.render();
    }
  }

  /** Controller navigation. */
  update() {
    if (!this.open) return;
    const p = Array.from(navigator.getGamepads?.() ?? []).find((x) => x);
    if (!p) return;
    const edge = (i: number) => {
      const b = !!p.buttons[i]?.pressed;
      const r = b && !this.padPrev[i];
      this.padPrev[i] = b;
      return r;
    };
    if (edge(12)) this.moveFocus(-1);
    if (edge(13)) this.moveFocus(1);
    if (edge(14)) this.adjust(-1);
    if (edge(15)) this.adjust(1);
    if (edge(4)) this.nextTab(-1);
    if (edge(5)) this.nextTab(1);
    if (edge(2)) this.action('sane');
    if (edge(3)) this.action('silly');
  }
}
