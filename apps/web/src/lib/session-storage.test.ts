import { beforeEach, describe, expect, it } from 'vitest';
import { clearSession, loadSession, saveSession, type StoredSession } from './session-storage';

const VALID: StoredSession = { roomId: 'room-1', sessionToken: 'a'.repeat(32), playerId: 'player-1' };

describe('session-storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns null when nothing is stored', () => {
    expect(loadSession()).toBeNull();
  });

  it('round-trips a saved session', () => {
    saveSession(VALID);
    expect(loadSession()).toEqual(VALID);
  });

  it('clears a stored session', () => {
    saveSession(VALID);
    clearSession();
    expect(loadSession()).toBeNull();
  });

  it('returns null for invalid JSON instead of throwing', () => {
    window.localStorage.setItem('durak.session', '{not json');
    expect(loadSession()).toBeNull();
  });

  it('returns null when a required field is missing', () => {
    window.localStorage.setItem('durak.session', JSON.stringify({ roomId: 'room-1', playerId: 'player-1' }));
    expect(loadSession()).toBeNull();
  });

  it('returns null when a field has the wrong type', () => {
    window.localStorage.setItem(
      'durak.session',
      JSON.stringify({ roomId: 'room-1', sessionToken: 42, playerId: 'player-1' }),
    );
    expect(loadSession()).toBeNull();
  });

  it('ignores unexpected extra fields rather than leaking them back out', () => {
    window.localStorage.setItem('durak.session', JSON.stringify({ ...VALID, hand: ['secret-card'] }));
    expect(loadSession()).toEqual(VALID);
  });
});
