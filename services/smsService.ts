import { SUPABASE_ENABLED, supabaseService } from './supabaseClient';
import type { RideLog } from '../types';

export interface SmsMessageRecord {
  id: string; // uuid or local id
  timestamp: number;
  direction: 'outgoing' | 'incoming';
  rideLogId?: string | null;
  to?: string | null;
  from?: string | null;
  text: string;
  status?: 'sent' | 'failed' | 'pending' | 'delivered';
  meta?: any;
}

const LOCAL_KEY = 'rapid-dispatch-sms-messages';

const readLocal = (): SmsMessageRecord[] => {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const writeLocal = (rows: SmsMessageRecord[]) => {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(rows));
  } catch {}
};

export const smsService = {
  async getMessages(): Promise<SmsMessageRecord[]> {
    if (SUPABASE_ENABLED) {
      try {
        const rows = await supabaseService.getSmsMessages();
        return rows || [];
      } catch (err) {
        console.error('Error loading sms messages from supabase:', err);
        return readLocal();
      }
    }
    return readLocal();
  },

  async saveOutgoing(record: SmsMessageRecord) {
    if (SUPABASE_ENABLED) {
      try {
        await supabaseService.addSmsMessage(record);
        return;
      } catch (err) {
        console.error('Failed to save outgoing SMS to supabase, falling back to local:', err);
      }
    }
    const existing = readLocal();
    existing.unshift(record);
    writeLocal(existing);
  },

  async saveIncoming(record: SmsMessageRecord) {
    if (SUPABASE_ENABLED) {
      try {
        await supabaseService.addSmsMessage(record);
        return;
      } catch (err) {
        console.error('Failed to save incoming SMS to supabase, falling back to local:', err);
      }
    }
    const existing = readLocal();
    existing.unshift(record);
    writeLocal(existing);
  },

  async replaceAll(records: SmsMessageRecord[]) {
    if (SUPABASE_ENABLED) {
      try {
        await supabaseService.updateSmsMessages(records as any[]);
        return;
      } catch (err) {
        console.error('Failed to update sms messages in supabase, falling back to local:', err);
      }
    }
    writeLocal(records);
  }
};
