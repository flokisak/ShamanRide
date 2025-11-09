import io from 'socket.io-client';
import { getCachedAccessToken, safeGetAccessToken } from './supabaseClient';

const DEFAULT_SOCKET_URL = typeof window !== 'undefined' ? (import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000') : null;

export async function waitForToken(timeoutMs = 3000) {
  const cached = getCachedAccessToken();
  if (cached) return cached;
  try {
    const refreshed = await safeGetAccessToken({ forceRefresh: true });
    if (refreshed) return getCachedAccessToken();
  } catch (e) {
    // ignore
  }

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const t = getCachedAccessToken();
    if (t) return t;
    // small delay
    // eslint-disable-next-line no-await-in-loop
    await new Promise(r => setTimeout(r, 200));
  }
  try {
    await safeGetAccessToken({ forceRefresh: true });
  } catch (e) {
    // ignore
  }
  return getCachedAccessToken();
}

// Initialize a single dispatcher socket. This function deduplicates concurrent
// calls using a promise stored on window.__shamanride_socket_promise__.
export async function initDispatcherSocket() {
  if (typeof window === 'undefined') return null;
  const win: any = window as any;
  if (win.dispatcherSocket) return win.dispatcherSocket;
  if (win.__shamanride_socket_promise__) return win.__shamanride_socket_promise__;

  win.__shamanride_socket_promise__ = (async () => {
    try {
      const token = await waitForToken(3000);
      const socketUrl = DEFAULT_SOCKET_URL;
      if (!socketUrl) return null;

      const socket = io(socketUrl, {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnection: true,
        // Let socket.io manage reconnection/backoff; we avoid multiple manual
        // reconnect loops spread across components.
      });

      // Basic handlers for diagnostics
      socket.on('connect', () => {
        console.log('initDispatcherSocket: connected to', socketUrl);
      });
      socket.on('connect_error', (err: any) => {
        console.warn('initDispatcherSocket: connect_error', err);
      });
      socket.on('disconnect', (reason: any) => {
        console.log('initDispatcherSocket: disconnected', reason);
      });

      // publish globally for legacy callers
      try { win.dispatcherSocket = socket; } catch (e) { /* ignore */ }
      return socket;
    } finally {
      // clear the promise so future attempts can retry if initialization failed
      try { delete win.__shamanride_socket_promise__; } catch (e) { /* ignore */ }
    }
  })();

  return win.__shamanride_socket_promise__;
}

export default initDispatcherSocket;
