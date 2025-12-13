"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.smsService = void 0;
const supabaseClient_1 = require("./supabaseClient");
const LOCAL_KEY = 'rapid-dispatch-sms-messages';
const readLocal = () => {
    try {
        // Check if we're in a browser environment
        if (typeof window !== 'undefined' && window.localStorage) {
            const raw = localStorage.getItem(LOCAL_KEY);
            return raw ? JSON.parse(raw) : [];
        }
        return [];
    }
    catch {
        return [];
    }
};
const writeLocal = (rows) => {
    try {
        // Check if we're in a browser environment
        if (typeof window !== 'undefined' && window.localStorage) {
            localStorage.setItem(LOCAL_KEY, JSON.stringify(rows));
        }
    }
    catch { }
};
exports.smsService = {
    async getMessages() {
        if (supabaseClient_1.SUPABASE_ENABLED) {
            try {
                const rows = await supabaseClient_1.supabaseService.getSmsMessages();
                return rows || [];
            }
            catch (err) {
                console.error('Error loading sms messages from supabase:', err);
                return readLocal();
            }
        }
        return readLocal();
    },
    async saveOutgoing(record) {
        if (supabaseClient_1.SUPABASE_ENABLED) {
            try {
                await supabaseClient_1.supabaseService.addSmsMessage(record);
                return;
            }
            catch (err) {
                console.error('Failed to save outgoing SMS to supabase, falling back to local:', err);
            }
        }
        const existing = readLocal();
        existing.unshift(record);
        writeLocal(existing);
    },
    async saveIncoming(record) {
        if (supabaseClient_1.SUPABASE_ENABLED) {
            try {
                await supabaseClient_1.supabaseService.addSmsMessage(record);
                return;
            }
            catch (err) {
                console.error('Failed to save incoming SMS to supabase, falling back to local:', err);
            }
        }
        const existing = readLocal();
        existing.unshift(record);
        writeLocal(existing);
    },
    async replaceAll(records) {
        if (supabaseClient_1.SUPABASE_ENABLED) {
            try {
                await supabaseClient_1.supabaseService.updateSmsMessages(records);
                return;
            }
            catch (err) {
                console.error('Failed to update sms messages in supabase, falling back to local:', err);
            }
        }
        writeLocal(records);
    }
};
