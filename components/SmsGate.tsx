import React, { useState, useEffect } from 'react';
import { Person, RideLog, Vehicle, MessagingApp } from '../types';
import { sendSms, isSmsGateConfigured } from '../services/messagingService';
import { useTranslation } from '../contexts/LanguageContext';

import { smsService } from '../services/smsService';

interface SmsGateProps {
   people: Person[];
   vehicles: Vehicle[];
   rideLog: RideLog[];
   onSend?: (logId: string) => void;
   smsMessages?: any[];
   messagingApp: MessagingApp;
   onSmsSent?: (newMessages: any | any[]) => void;
 }

export const SmsGate: React.FC<SmsGateProps> = ({ people, vehicles, rideLog, onSend, smsMessages = [], messagingApp, onSmsSent }) => {
  const { t } = useTranslation();

  const [incoming, setIncoming] = useState<{ from: string; message: string; time: number }[]>([]);
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [newSmsRecipient, setNewSmsRecipient] = useState('');
  const [newSmsMessage, setNewSmsMessage] = useState('');
   const [filterPhone, setFilterPhone] = useState('');
   // show persisted messages if provided
   const persisted = smsMessages || [];

  // Filter messages by phone number
  const filteredMessages = filterPhone.trim()
    ? persisted.filter(msg => msg.to === filterPhone.trim() || msg.from === filterPhone.trim())
    : persisted;

  // Helper function to get contact name for a phone number
  const getContactName = (phoneNumber: string): string => {
    const person = people.find(p => p.phone === phoneNumber);
    return person ? person.name : phoneNumber;
  };





  // Dummy incoming SMS simulation (since we don't have a real webhook)
  useEffect(() => {
    const interval = setInterval(() => {
      // simulate inbound only rarely
      if (Math.random() > 0.98) {
        setIncoming(prev => [{ from: '+420000000', message: 'Confirmed pickup', time: Date.now() }, ...prev].slice(0, 20));
      }
    }, 8000);
    return () => clearInterval(interval);
  }, []);





  const handleReply = (phoneNumber: string) => {
    setReplyTo(phoneNumber);
    setReplyMessage('');
  };

  const handleSendReply = async () => {
    if (!replyTo || !replyMessage.trim()) return;
    setSending(true);
    try {
      const result = await sendSms([replyTo], replyMessage);
      if (result.success) {
        const record = {
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          direction: 'outgoing' as const,
          to: replyTo,
          text: replyMessage,
          status: 'sent' as const,
        };
         await smsService.saveOutgoing(record);
         onSmsSent?.(record);
        setReplyTo(null);
        setReplyMessage('');
        alert(t('smsGate.replySent'));
      } else {
        alert('Failed to send reply');
      }
    } catch (error) {
      console.error('Error sending reply:', error);
      alert('Error sending reply');
    } finally {
      setSending(false);
    }
  };

  const handleSendNewSms = async () => {
    const customPhones = newSmsRecipient.split(',').map(s => s.trim()).filter(s => s);
    if (customPhones.length === 0 || !newSmsMessage.trim()) return;
    setSending(true);
     try {
       const normalizedPhones = customPhones.map(phone => phone.replace(/\s/g, ''));
       const result = await sendSms(normalizedPhones, newSmsMessage);
       if (result.success) {
         const records = [];
         for (const phone of normalizedPhones) {
           const record = {
             id: `${Date.now()}-${phone}`,
             timestamp: Date.now(),
             direction: 'outgoing' as const,
             to: phone,
             text: newSmsMessage,
             status: 'sent' as const,
           };
           await smsService.saveOutgoing(record);
           records.push(record);
         }
         onSmsSent?.(records);
         setNewSmsRecipient(''); // Clear recipient
         setNewSmsMessage(''); // Clear message
         alert(t('smsGate.smsSent'));
         } else {
           alert('Failed to send SMS');
         }
       } catch (error) {
         console.error('Error sending SMS:', error);
         alert('Error sending SMS');
       } finally {
         setSending(false);
       }
   };

  return (
    <div className="h-full flex flex-col">

      <div className="grid grid-cols-2 gap-4 h-full">
        {/* Left Column: SMS Forms */}
        <div className="flex flex-col space-y-4 h-full overflow-y-auto">


          {/* New SMS Section */}
          <div className="p-3 bg-slate-800/40 rounded-md">
            <h5 className="text-sm text-white mb-2">{t('smsGate.newSms')}</h5>
             <div className="space-y-2">
               <input
                 type="tel"
                 value={newSmsRecipient}
                 onChange={(e) => setNewSmsRecipient(e.target.value)}
                 placeholder={t('smsGate.recipientPhone')} // Allow comma-separated for multiple
                 className="w-full bg-slate-700 border-0 rounded px-2 py-1 text-white text-sm"
               />
              <textarea
                value={newSmsMessage}
                onChange={(e) => setNewSmsMessage(e.target.value)}
                placeholder={t('smsGate.message')}
                rows={3}
                className="w-full bg-slate-700 border-0 rounded px-2 py-1 text-white text-sm"
              />
               <button
                 onClick={handleSendNewSms}
                 disabled={sending || !newSmsRecipient.trim() || !newSmsMessage.trim()}
                 className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white text-sm rounded"
               >
                 {sending ? t('smsGate.sending') : t('smsGate.sendSms')}
               </button>
            </div>
          </div>

          {/* Reply Section */}
          {replyTo && (
            <div className="p-3 bg-slate-800/40 rounded-md">
              <h5 className="text-sm text-white mb-2">{t('smsGate.replyTo')} {replyTo}</h5>
              <div className="space-y-2">
                <textarea
                  value={replyMessage}
                  onChange={(e) => setReplyMessage(e.target.value)}
                  placeholder={t('smsGate.replyMessage')}
                  rows={2}
                className="w-full bg-slate-700 border-0 rounded px-2 py-1 text-white text-sm"
                />
                <div className="flex space-x-2">
                  <button
                    onClick={handleSendReply}
                    disabled={sending || !replyMessage.trim()}
                    className="flex-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-600 text-white text-sm rounded"
                  >
                    {sending ? t('smsGate.sending') : t('smsGate.sendReply')}
                  </button>
                  <button
                    onClick={() => { setReplyTo(null); setReplyMessage(''); }}
                    className="px-3 py-2 bg-gray-600 hover:bg-gray-500 text-white text-sm rounded"
                  >
                    {t('general.cancel')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: SMS History */}
        <div className="flex flex-col h-full">
          <div className="flex justify-between items-center mb-2">
            <h5 className="text-sm text-white">{t('smsGate.inbox')}</h5>
            <div className="flex items-center space-x-2">
              <input
                type="tel"
                value={filterPhone}
                onChange={(e) => setFilterPhone(e.target.value)}
                placeholder={t('smsGate.filterByPhone')}
                className="bg-slate-700 border-0 rounded px-2 py-1 text-white text-xs w-32"
              />
              {filterPhone && (
                 <button
                   onClick={() => setFilterPhone('')}
                   className="text-xs text-[#81A1C1] hover:text-[#88C0D0]"
                 >
                  {t('general.clear')}
                </button>
              )}
            </div>
          </div>
          <div className="space-y-2 flex-1 overflow-y-auto bg-slate-800/20 rounded-md p-3">
            {filteredMessages.length > 0 ? filteredMessages.slice(0, 20).map((m, idx) => (
               <div key={m.id || idx} className={`p-2 rounded text-sm ${m.direction === 'outgoing' ? 'bg-[#A3BE8C]/30 text-[#A3BE8C]' : 'bg-slate-800/30 text-gray-200'}`}>
                 <div className="text-xs text-[#A3BE8C] flex justify-between items-center">
                  <span>{new Date(m.timestamp).toLocaleString()}</span>
                  <div className="flex items-center space-x-2">
                    <span>
                      {m.direction === 'outgoing'
                        ? `To: ${getContactName(m.to!)}`
                        : `From: ${getContactName(m.from!)}`
                      }
                    </span>
                     {m.direction === 'incoming' && (
                       <button
                         onClick={() => handleReply(m.from!)}
                         className="text-xs text-[#81A1C1] hover:text-[#88C0D0]"
                       >
                        {t('smsGate.reply')}
                      </button>
                    )}
                  </div>
                </div>
                <div className="whitespace-pre-wrap">{m.text}</div>
              </div>
             )) : (
               !filterPhone.trim() && incoming.length > 0 ? incoming.map((m, idx) => (
                  <div key={idx} className="p-2 bg-slate-800/30 rounded text-sm text-gray-200">
                    <div className="text-xs text-[#A3BE8C] flex justify-between items-center">
                      <span>{new Date(m.time).toLocaleTimeString()}</span>
                      <div className="flex items-center space-x-2">
                        <span>From: {getContactName(m.from)}</span>
                        <button
                          onClick={() => handleReply(m.from)}
                          className="text-xs text-[#81A1C1] hover:text-[#88C0D0]"
                        >
                          {t('smsGate.reply')}
                        </button>
                      </div>
                    </div>
                    <div className="whitespace-pre-wrap">{m.message}</div>
                  </div>
               )) : <div className="text-xs text-gray-400">{filterPhone.trim() ? t('smsGate.noMessagesForPhone') : t('smsGate.inboxEmpty')}</div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SmsGate;
