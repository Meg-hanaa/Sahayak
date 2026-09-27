/**
 * Token Storage Utility
 *
 * Strictly stores session access tokens in sessionStorage for the duration of
 * that browser session. Never uses localStorage, logs tokens, or exposes them in error messages.
 */

const STORAGE_PREFIX = 'sahayak_token_';

export function getSessionToken(sessionId: string): string | null {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return null;
  }
  try {
    return window.sessionStorage.getItem(`${STORAGE_PREFIX}${sessionId}`);
  } catch {
    return null;
  }
}

export function setSessionToken(sessionId: string, token: string): void {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return;
  }
  try {
    window.sessionStorage.setItem(`${STORAGE_PREFIX}${sessionId}`, token);
  } catch {
    // sessionStorage quota exceeded or disabled
  }
}

export function removeSessionToken(sessionId: string): void {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return;
  }
  try {
    window.sessionStorage.removeItem(`${STORAGE_PREFIX}${sessionId}`);
  } catch {
    // ignore
  }
}
