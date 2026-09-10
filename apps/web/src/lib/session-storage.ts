/** Persists just enough to rejoin an active room after a page reload or a dropped socket. */
export type StoredSession = {
  roomId: string;
  sessionToken: string;
  playerId: string;
};

const STORAGE_KEY = 'durak.session';

export function loadSession(): StoredSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (
      typeof parsed.roomId !== 'string' ||
      typeof parsed.sessionToken !== 'string' ||
      typeof parsed.playerId !== 'string'
    ) {
      return null;
    }
    return { roomId: parsed.roomId, sessionToken: parsed.sessionToken, playerId: parsed.playerId };
  } catch {
    return null;
  }
}

export function saveSession(session: StoredSession): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}
