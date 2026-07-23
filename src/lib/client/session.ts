'use client';

export interface Session {
  playerId: string;
  token: string;
  name: string;
}

const key = (code: string) => `basas:${code.toUpperCase()}`;

/** Guardamos la identidad por sala: si recargás la página, seguís siendo vos. */
export function saveSession(code: string, session: Session) {
  try {
    localStorage.setItem(key(code), JSON.stringify(session));
  } catch {
    /* modo privado sin storage: se juega igual mientras no recargues */
  }
}

export function loadSession(code: string): Session | null {
  try {
    const raw = localStorage.getItem(key(code));
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function clearSession(code: string) {
  try {
    localStorage.removeItem(key(code));
  } catch {
    /* no pasa nada */
  }
}

export function rememberName(name: string) {
  try {
    localStorage.setItem('basas:name', name);
  } catch {
    /* no pasa nada */
  }
}

export function lastName(): string {
  try {
    return localStorage.getItem('basas:name') ?? '';
  } catch {
    return '';
  }
}
