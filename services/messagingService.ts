/* Lightweight messaging gateway helper.
    Uses local SMS gateway server with smsgate when available.
    Falls back to a no-op that resolves when not configured.
 */
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export function isSmsGateConfigured(): boolean {
  // Assume backend is running on localhost:3001
  return true; // Always try to use the backend
}

export async function sendSmsViaSmsGate(recipients: string[], message: string): Promise<{ success: boolean; data?: any; error?: any }> {
  try {
    if (!API_BASE) {
      return { success: false, error: 'API_BASE_URL not configured. Please set VITE_API_BASE_URL environment variable.' };
    }

    const res = await fetch(`${API_BASE}/api/send-sms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ recipients, message }),
    });

    let data;
    try {
      data = await res.json();
    } catch (parseErr) {
      // If JSON parsing fails, create a meaningful error
      data = { error: `HTTP ${res.status}: ${res.statusText}`, rawResponse: await res.text().catch(() => 'Unable to read response') };
    }

    if (!res.ok) {
      console.warn('SMS gateway failed:', { status: res.status, statusText: res.statusText, body: data });
      return { success: false, error: data.error || `HTTP ${res.status}: ${res.statusText}` };
    }

    return { success: true, data };
  } catch (err: any) {
    console.warn('SMS server not available:', err);
    const errorMessage = err.message || 'Network error or server unreachable';
    return { success: false, error: `Connection failed: ${errorMessage}. Make sure the backend server is running on ${API_BASE || 'configured API_BASE_URL'}.` };
  }
}

// Generic sendSms wrapper so other services can import a single function name.
export async function sendSms(recipients: string[], message: string) {
  return sendSmsViaSmsGate(recipients, message);
}
