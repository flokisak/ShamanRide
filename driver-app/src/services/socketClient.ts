import io from 'socket.io-client';
import { safeGetAccessToken, getCachedAccessToken } from '../supabaseClient';

const RENDER_URL = process.env.NODE_ENV === 'production'
  ? 'https://shamanride.onrender.com'
  : 'http://localhost:3000';

// Driver socket connection - different from dispatcher
export async function initDriverSocket() {
  try {
    // Wait for authentication token
    await waitForToken();
    
    const token = getCachedAccessToken();
    if (!token) {
      throw new Error('No authentication token available');
    }

    console.log('🔗 Initializing driver socket connection to:', RENDER_URL);
    
    const socket = io(RENDER_URL, {
      auth: {
        token: token,
        userType: 'driver'
      },
      transports: ['websocket', 'polling'],
      timeout: 10000,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Driver socket connection timeout'));
      }, 10000);

      socket.on('connect', () => {
        clearTimeout(timeout);
        console.log('✅ Driver socket connected successfully');
        resolve(socket);
      });

      socket.on('connect_error', (err) => {
        clearTimeout(timeout);
        console.error('❌ Driver socket connection failed:', err);
        reject(err);
      });
    });
  } catch (err) {
    console.error('❌ Failed to initialize driver socket:', err);
    throw err;
  }
}

// Helper to wait for authentication token
export async function waitForToken(): Promise<string> {
  const maxAttempts = 30; // 30 seconds max wait
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    const token = getCachedAccessToken();
    if (token) {
      return token;
    }
    
    // Try to get fresh token
    try {
      const freshToken = await safeGetAccessToken();
      if (freshToken) {
        return freshToken;
      }
    } catch (err) {
      console.warn('Failed to get fresh token:', err);
    }
    
    // Wait 1 second before next attempt
    await new Promise(resolve => setTimeout(resolve, 1000));
    attempts++;
  }
  
  throw new Error('Authentication token not available after maximum attempts');
}

export default initDriverSocket;