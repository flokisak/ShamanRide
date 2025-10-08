/* Lightweight messaging gateway helper.
    Uses local SMS gateway server with smsgate when available.
    Falls back to a no-op that resolves when not configured.
 */
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

export function isSmsGateConfigured(): boolean {
  // Assume backend is running on localhost:3001
  return true; // Always try to use the backend
}

export async function sendSmsViaSmsGate(recipients: string[], message: string): Promise<{ success: boolean; data?: any; error?: any }> {
  try {
    const res = await fetch(`${API_BASE}/api/send-sms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ recipients, message }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn('SMS gateway failed:', { status: res.status, body: data });
      return { success: false, error: data };
    }

    return { success: true, data };
  } catch (err) {
    console.warn('SMS server not available:', err);
    return { success: false, error: err.message };
  }
}

// Generic sendSms wrapper so other services can import a single function name.
export async function sendSms(recipients: string[], message: string) {
  return sendSmsViaSmsGate(recipients, message);
}
