import React, { useState, useEffect, useRef } from 'react';
import { Person, Vehicle } from '../types';
import { useTranslation } from '../contexts/LanguageContext';
import { supabase, SUPABASE_ENABLED } from '../services/supabaseClient';

interface DriverChatProps {
  vehicles: Vehicle[];
  onNewMessage?: (vehicleId: number, message: string) => void;
}

interface ChatMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  message: string;
  timestamp: string;
  read: boolean;
}

// Local storage helpers for driver messages
const DRIVER_MESSAGES_KEY = 'rapid-dispatch-driver-messages';

const getDriverMessages = (): ChatMessage[] => {
  try {
    return JSON.parse(localStorage.getItem(DRIVER_MESSAGES_KEY) || '[]');
  } catch {
    return [];
  }
};

const saveDriverMessages = (messages: ChatMessage[]) => {
  localStorage.setItem(DRIVER_MESSAGES_KEY, JSON.stringify(messages));
};

const addDriverMessage = (message: ChatMessage) => {
  const messages = getDriverMessages();
  messages.push(message);
  saveDriverMessages(messages);
};

export const DriverChat: React.FC<DriverChatProps> = ({ vehicles, onNewMessage }) => {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Calculate unread message counts for each vehicle
  const unreadCounts = vehicles.reduce((acc, vehicle) => {
    const vehicleMessages = messages.filter(msg =>
      (msg.sender_id === `driver_${vehicle.id}` && msg.receiver_id === currentUserId && !msg.read)
    );
    acc[vehicle.id] = vehicleMessages.length;
    return acc;
  }, {} as Record<number, number>);

  // Get current user (dispatcher)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    const getCurrentUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        setCurrentUserId(user?.id || 'dispatcher');
      } catch {
        setCurrentUserId('dispatcher');
      }
    };
    getCurrentUser();
  }, []);

  // Load messages for selected vehicle
  useEffect(() => {
    if (!selectedVehicleId) return;

    const loadMessages = async () => {
      try {
        const { data1, error1 } = await supabase.from('driver_messages').select('*').eq('sender_id', 'dispatcher').eq('receiver_id', `driver_${selectedVehicleId}`).order('timestamp', { ascending: true });
        const { data2, error2 } = await supabase.from('driver_messages').select('*').eq('sender_id', `driver_${selectedVehicleId}`).eq('receiver_id', 'dispatcher').order('timestamp', { ascending: true });
        if (error1) {
          console.warn('Could not load messages 1:', error1);
        }
        if (error2) {
          console.warn('Could not load messages 2:', error2);
        }
        const data = [...(data1 || []), ...(data2 || [])];
        data.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        setMessages(data);
      } catch (err) {
        console.warn('Error loading messages:', err);
      }
    };

    loadMessages();
  }, [selectedVehicleId]);

  // Subscribe to new messages (only when Supabase is enabled)
  useEffect(() => {
    if (!selectedVehicleId || !currentUserId || !SUPABASE_ENABLED) return;

    const channel = supabase
      .channel('driver_messages')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'driver_messages'
       }, (payload) => {
        const incomingMessage = payload.new as ChatMessage;
        // Check if the message is relevant (between dispatcher and selected vehicle)
        const isRelevant = (incomingMessage.sender_id === 'dispatcher' && incomingMessage.receiver_id === 'driver_' + selectedVehicleId) ||
                           (incomingMessage.sender_id === 'driver_' + selectedVehicleId && incomingMessage.receiver_id === 'dispatcher');
        if (isRelevant) {
          setMessages(prev => [...prev, incomingMessage]);

          // Notify about new message if it's from a vehicle
          if (incomingMessage.sender_id.startsWith('driver_')) {
            const vehicleId = parseInt(incomingMessage.sender_id.replace('driver_', ''));
            if (onNewMessage) {
              onNewMessage(vehicleId, incomingMessage.message);
            }
          }
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedVehicleId, currentUserId]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedVehicleId || sending) return;

    setSending(true);
    try {
      const messageData = {
        sender_id: 'dispatcher',
        receiver_id: `driver_${selectedVehicleId}`,
        message: newMessage.trim(),
        timestamp: new Date().toISOString(),
        read: false
      };

      if (SUPABASE_ENABLED) {
        const { data, error } = await supabase
          .from('driver_messages')
          .insert({
            sender_id: messageData.sender_id,
            receiver_id: messageData.receiver_id,
            message: messageData.message,
            read: messageData.read
          })
          .select()
          .single();

        if (error) throw error;
        // Use the returned data which includes the database timestamp
        addDriverMessage(data);
        setMessages(prev => [...prev, data]);
      } else {
        // Local storage fallback
        addDriverMessage(messageData);
        // Update local state immediately
        setMessages(prev => [...prev, messageData]);
      }

      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('cs-CZ', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Mark messages as read when vehicle is selected
  useEffect(() => {
    if (!selectedVehicleId || !currentUserId || messages.length === 0) return;

    const unreadMessages = messages.filter(msg =>
      msg.sender_id === `driver_${selectedVehicleId}` &&
      msg.receiver_id === 'dispatcher' &&
      !msg.read
    );

    if (unreadMessages.length > 0) {
      if (SUPABASE_ENABLED) {
        // Update read status in Supabase
        unreadMessages.forEach(async (msg) => {
          await supabase
            .from('driver_messages')
            .update({ read: true })
            .eq('id', msg.id);
        });
      } else {
        // Update read status in localStorage
        const allMessages = getDriverMessages();
        const updatedMessages = allMessages.map(msg =>
          unreadMessages.some(unread => unread.id === msg.id)
            ? { ...msg, read: true }
            : msg
        );
        saveDriverMessages(updatedMessages);
      }

      // Update local state
      setMessages(prev => prev.map(msg =>
        unreadMessages.some(unread => unread.id === msg.id)
          ? { ...msg, read: true }
          : msg
      ));
    }
  }, [selectedVehicleId, messages]);

  const getSenderName = (senderId: string) => {
    if (senderId === currentUserId) return 'Vy';
    if (senderId.startsWith('driver_')) {
      const vehicleId = parseInt(senderId.replace('driver_', ''));
      const vehicle = vehicles.find(v => v.id === vehicleId);
      return vehicle ? vehicle.name : 'Vozidlo';
    }
    return 'Neznámý';
  };

  return (
    <div className="bg-slate-800 p-3 rounded-lg shadow-2xl flex flex-col h-full">
      <div className="flex-shrink-0 mb-4">
        <h3 className="text-sm font-semibold text-white flex items-center">
          <div className="w-6 h-6 bg-[#8FBCBB]/80 rounded-lg flex items-center justify-center mr-2">
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          Chat s vozidly
        </h3>
      </div>

      <div className="flex-shrink-0 mb-3">
        <select
          value={selectedVehicleId || ''}
          onChange={(e) => setSelectedVehicleId(e.target.value ? parseInt(e.target.value) : null)}
          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-primary focus:border-primary"
        >
          <option value="">Vyberte vozidlo...</option>
           {vehicles.map(vehicle => (
            <option key={vehicle.id} value={vehicle.id}>
              {vehicle.name} {unreadCounts[vehicle.id] > 0 && `(${unreadCounts[vehicle.id]})`}
            </option>
          ))}
        </select>
      </div>

      {selectedVehicleId && (
        <>
          <div className="flex-1 overflow-y-auto mb-3 bg-slate-900/50 rounded-lg p-3 min-h-0">
             {messages.length === 0 ? (
               <p className="text-sm text-slate-400 italic text-center">
                 Žádné zprávy s tímto vozidlem
               </p>
            ) : (
              <div className="space-y-2">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.sender_id === currentUserId ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-xs px-3 py-2 rounded-lg text-sm ${
                        msg.sender_id === currentUserId
                          ? 'bg-primary text-slate-900'
                          : 'bg-slate-700 text-white'
                      }`}
                    >
                      <div className="text-xs opacity-75 mb-1">
                        {getSenderName(msg.sender_id)} • {formatTime(msg.timestamp)}
                      </div>
                      <div>{msg.message}</div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          <div className="flex-shrink-0 flex gap-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Napište zprávu..."
              className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-primary focus:border-primary"
              disabled={sending}
            />
            <button
              onClick={sendMessage}
              disabled={!newMessage.trim() || sending}
              className="px-4 py-2 bg-primary hover:bg-nord-frost4 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg btn-modern text-slate-900 font-medium text-sm whitespace-nowrap"
            >
              {sending ? 'Odesílání...' : 'Odeslat'}
            </button>
          </div>
        </>
      )}
    </div>
  );
};