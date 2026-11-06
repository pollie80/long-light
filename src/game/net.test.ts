import { describe, expect, it } from 'vitest';
import { cleanName, cleanPlayer, cleanState, codeFromHash, inviteLink, makeCode, MAX_PLAYERS } from '../net/protocol';
import { BOAT_SLOTS, groundY, JETTY } from '../world/land';
import { DEFAULT_LOOK } from '../actors/look';
import { mulberry32 } from '../core/noise';

describe('invite links', () => {
  it('survive the round trip from code to link and back', () => {
    const rnd = mulberry32(9);
    for (let i = 0; i < 200; i++) {
      const code = makeCode(rnd);
      expect(code).toMatch(/^[a-z2-9]{6}$/);
      const link = inviteLink(code);
      expect(link.startsWith('https://')).toBe(true);
      expect(codeFromHash(link.slice(link.indexOf('#')))).toBe(code);
    }
  });

  it('ignore anything that is not an invite', () => {
    for (const bad of ['', '#', '#join=', '#join=abc', '#join=abc123456', '#join=<img src=x>', '#other=abc234']) {
      expect(codeFromHash(bad)).toBeNull();
    }
  });
});

describe('what arrives from the network', () => {
  it('cannot put anything strange in a name', () => {
    expect(cleanName('  Sam ')).toBe('Sam');
    expect(cleanName('x'.repeat(100)).length).toBe(20);
    expect(cleanName('a\u0000b\nc')).toBe('abc');
    expect(cleanName(undefined)).toBe('A friend');
    expect(cleanName({})).toBe('A friend');
    expect(cleanName('   ')).toBe('A friend');
  });

  it('turns junk into safe numbers and known states', () => {
    const s = cleanState({ x: Number.NaN, y: Infinity, z: 'no', yaw: 1e30, mode: 'hack', fs: '<b>', fish: 5, bOut: 99, bLift: -4, ib: 'yes' })!;
    expect(s.x).toBe(0);
    expect(s.y).toBe(0);
    expect(s.z).toBe(0);
    expect(Math.abs(s.yaw)).toBeLessThanOrEqual(100);
    expect(s.mode).toBe('stand');
    expect(s.fs).toBe('idle');
    expect(s.fish).toBe('');
    expect(s.bOut).toBe(1);
    expect(s.bLift).toBe(0);
    expect(s.ib).toBe(false);
    expect(cleanState(null)).toBeNull();
    expect(cleanState('x')).toBeNull();
  });

  it('rejects malformed players and repairs bad looks', () => {
    expect(cleanPlayer(null)).toBeNull();
    expect(cleanPlayer({ name: 'no id' })).toBeNull();
    const p = cleanPlayer({ id: 'p1', name: 'Sam', look: { hat: 'not-a-hat', height: 500 }, slot: 99 })!;
    expect(p.look.hat).toBe(DEFAULT_LOOK.hat);
    expect(p.look.height).toBeLessThan(2);
    expect(p.slot).toBe(MAX_PLAYERS - 1);
  });
});

describe('boat places', () => {
  it('exist for everyone, on water, alongside the jetty', () => {
    expect(BOAT_SLOTS.length).toBe(MAX_PLAYERS);
    for (const s of BOAT_SLOTS) {
      expect(groundY(s.x, s.z)).toBeLessThan(-0.45);
      expect(s.x).toBeLessThan(JETTY.startX);
      expect(s.x).toBeGreaterThan(JETTY.endX);
      expect(Math.abs(s.z)).toBeGreaterThan(JETTY.halfWidth);
    }
  });

  it('leave room between boats', () => {
    for (let i = 0; i < BOAT_SLOTS.length; i++) {
      for (let j = i + 1; j < BOAT_SLOTS.length; j++) {
        const a = BOAT_SLOTS[i];
        const b = BOAT_SLOTS[j];
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(5);
      }
    }
  });
});
