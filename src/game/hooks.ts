// The tables of things the menus and the network can ask the game to do.
import { isDifficulty, RULES } from './difficulty';
import { setQuality } from '../core/quality';
import { SPECIES, TIER_LABEL } from './fishdata';
import type { Game } from './game';
import type { MenuHooks } from '../ui/ui';
import type { WardrobeHooks } from '../ui/wardrobe';
import type { NetEvents } from '../net/net';

/** What the menus, journal and panels can ask of the game. */
export function menuHooks(g: Game): MenuHooks {
  return {
    resume: () => g.closeMenus(),
    journal: () => {
      g.ui.showMenu(false);
      g.ui.showTitle(false);
      g.audio.pageTurn();
      g.ui.journalOpenAt(g.hour);
    g.ui.showJournal(true, g.save.journal, g.input.usingPad ? '<kbd>Circle</kbd>' : '<kbd>J</kbd> or <kbd>Esc</kbd>');
    },
    birdLog: () => g.save.birdLog,
    setWeather: (v) => {
      g.save.weather = v;
      g.writeSave();
    },
    getWeather: () => g.save.weather,
    setDifficulty: (d) => {
      if (!isDifficulty(d) || d === g.save.difficulty) return;
      g.save.difficulty = d;
      g.angling.applyRules();
      g.writeSave();
      g.ui.toast(`${RULES[d].label}: ${RULES[d].blurb}`, 3.5);
    },
    getDifficulty: () => g.save.difficulty,
    resetJournal: () => {
      g.save.journal = {};
      g.save.birdLog = {};
      g.save.birds = {};
      g.save.bestShot = 0;
      g.writeSave();
      g.audio.pageTurn();
      g.ui.showJournal(true, g.save.journal, '');
      g.ui.toast('The journal is blank again.', 3);
    },
    quit: () => {
      window.close();
      // A browser lets a page close only a window it opened itself. If it's still here, say how instead.
      setTimeout(() => g.ui.toast('The browser will not let the game close its own window. Press Alt+F4.', 6), 400);
    },
    savePainting: () => {
      g.wantShot = true;
    },
    setHour: (h) => g.setHour(h, true),
    getHour: () => g.hour,
    setClockRunning: (v) => {
      g.clockRunning = v;
      g.net.clockChanged(g.hour, v);
    },
    getClockRunning: () => g.clockRunning,
    setMusic: (v) => {
      g.save.music = v;
      g.audio.setVolumes(v, g.save.sfx);
      g.writeSave();
      g.ui.refreshMenu();
    },
    getMusic: () => g.save.music,
    setSfx: (v) => {
      g.save.sfx = v;
      g.audio.setVolumes(g.save.music, v);
      g.writeSave();
      g.ui.refreshMenu();
    },
    getSfx: () => g.save.sfx,
    rest: (h) => {
      g.restTo = h;
      g.fadeTarget = 1;
      g.input.lock();
    },
    sound: (k) => (k === 'tick' ? g.audio.uiTick() : g.audio.pageTurn()),
    setSensitivity: (v) => {
      g.save.sensitivity = v;
      g.input.sensitivity = v;
      g.writeSave();
      g.ui.refreshMenu();
    },
    getSensitivity: () => g.save.sensitivity,
    setWalkSpeed: (v) => {
      g.save.walkSpeed = v;
      g.writeSave();
      g.ui.refreshMenu();
    },
    getWalkSpeed: () => g.save.walkSpeed,
    setRowSpeed: (v) => {
      g.save.rowSpeed = v;
      g.writeSave();
      g.ui.refreshMenu();
    },
    getRowSpeed: () => g.save.rowSpeed,
    setMuteAway: (v) => {
      g.save.muteAway = v;
      g.writeSave();
    },
    getMuteAway: () => g.save.muteAway,
    wardrobe: (kind) => g.openWardrobe(kind),
    friends: () => g.friends.openFriends(),
    places: () => {
      g.ui.showMenu(false);
      g.ui.showTitle(false);
      g.input.unlock();
      g.ui.prompt(null);
      g.placeArmed = null;
      g.ui.showPlaces(true, g.net.role === 'guest' ? 'Your friend picks the place while you are in their cove.' : '');
      g.audio.pageTurn();
    },
    closePlaces: () => {
      g.ui.showPlaces(false);
      g.audio.uiTick();
      if (g.mode === 'title') g.ui.showTitle(true);
      else g.ui.showMenu(true);
    },
    choosePlace: (id) => g.choosePlace(id),
    setQuality: (id) => setQuality(id),
    setFpsCap: (v) => {
      g.save.fpsCap = v;
      g.writeSave();
    },
    getFpsCap: () => g.save.fpsCap,
    setResolution: (v) => {
      g.save.resolution = v;
      g.pipe.renderScale = v;
      g.resize();
      g.writeSave();
      g.ui.refreshMenu();
    },
    getResolution: () => g.pipe.renderScale,
    setQuietAway: (v) => {
      g.save.quietAway = v;
      g.writeSave();
    },
    getQuietAway: () => g.save.quietAway,
    setAdapt: (v) => {
      g.save.adapt = v;
      g.writeSave();
    },
    getAdapt: () => g.save.adapt,
    setShowFps: (v) => {
      g.save.showFps = v;
      g.ui.setFps(v ? '' : null);
      g.writeSave();
    },
    getShowFps: () => g.save.showFps,
    closeFriends: () => g.friends.closeFriends(),
    play: () => g.startPlay(),
    startHosting: (name) => {
      g.friends.setName(name);
      g.friends.netError = '';
      g.audio.uiTick();
      g.net.host(g.friends.playerName(), g.fisher.look);
      g.friends.renderFriends();
    },
    joinCove: (name) => g.friends.joinCove(name),
    leaveCove: () => {
      g.net.leave();
      g.friends.netStatus = '';
      g.friends.netError = '';
      g.friends.setBoatSlot(0);
      g.friends.renderFriends();
    },
    setName: (name) => g.friends.setName(name),
    getName: () => g.save.name,
  };
}

/** What the wardrobe asks of the game while it is open. */
export function wardrobeHooks(g: Game): WardrobeHooks {
  return {
    get: () => g.fisher.look,
    set: (l) => {
      g.fisher.applyLook(l);
      g.boat.applyLook(l);
      g.pet.applyLook(l);
      g.fishing.setGear(l);
      g.save.look = l;
      g.writeSave();
      g.net.sendLook(l);
    },
    close: () => g.closeMenus(),
    tick: () => g.audio.uiTick(),
  };
}

/** What the game does when friends come, go, move and speak. */
export function netEvents(g: Game): NetEvents {
  return {
    onStatus: (text) => {
      g.friends.netStatus = text;
      if (g.ui.joining) g.ui.joinStatus(text);
      g.friends.renderFriends();
    },
    onChange: () => g.friends.renderFriends(),
    onWelcome: (slot, hour, running, time) => {
      g.friends.setBoatSlot(slot);
      g.time = time;
      g.hour = hour;
      g.clockRunning = running;
      g.sky.fastCycles = 4;
      g.ui.joinStatus('');
      g.ui.showJoin(false);
      g.startPlay();
      g.ui.toast('You are in the cove.', 3.5);
    },
    onWrongMap: (map) => {
      // Replaced, not added: an extra history entry would stop Quit from closing the window.
      const h = location.hash.includes('map=') ? location.hash.replace(/map=[a-z]+/, `map=${map}`) : `${location.hash}&map=${map}`;
      history.replaceState(null, '', h.startsWith('#') ? h : `#${h}`);
      location.reload();
    },
    onFail: (message) => {
      g.friends.netError = message;
      g.friends.netStatus = '';
      if (g.ui.joining) g.ui.joinStatus(message, true);
      else if (!g.ui.friendsOpen) g.ui.toast(message, 6);
      g.friends.renderFriends();
    },
    onClock: (hour, running, time) => g.friends.syncClock(hour, running, time),
    onJoin: (p) => {
      g.audio.uiTick();
      g.ui.toast(`${p.name} joined the cove.`, 4);
    },
    onLeave: (p) => {
      // Before their boat disappears from under us.
      if (g.friends.rideWith === p.id || g.friends.ridePending === p.id) g.friends.endRide(`${p.name} left, so you're back on the jetty.`);
      const r = g.friends.remotes.get(p.id);
      if (r) {
        r.dispose();
        g.friends.remotes.delete(p.id);
      }
      if (g.net.live) g.ui.toast(`${p.name} left.`, 3.5);
    },
    onHostLost: () => {
      g.friends.setBoatSlot(0);
      g.ui.toast('Your friend closed their game. You can keep fishing here.', 6);
      g.friends.renderFriends();
    },
    onLook: (p) => g.friends.remotes.get(p.id)?.setLook(p.look),
    onCatch: (p, species) => {
      const sp = SPECIES.find((s) => s.id === species);
      if (sp) g.ui.toast(sp.tier === 'common' || sp.tier === 'uncommon' ? `${p.name} caught a ${sp.name}.` : `${p.name} caught a ${TIER_LABEL[sp.tier]} ${sp.name}!`, sp.tier === 'legendary' ? 8 : 4.5);
    },
  };
}
