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

// Chat history item interface
interface ChatHistoryItem {
  vehicleId: number;
  vehicleName: string;
  lastMessage: string;
  timestamp: string;
  unreadCount: number;
}

export const DriverChat: React.FC<DriverChatProps> = ({ vehicles, onNewMessage }) => {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [allMessages, setAllMessages] = useState<ChatMessage[]>([]); // Store messages from all chats
  const [newMessage, setNewMessage] = useState('');
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatHistoryItem[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Get current user (dispatcher) - moved up for proper variable order
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

  // Load all messages for all vehicles (for chat history) - runs on mount and when vehicles change
  useEffect(() => {
    if (!currentUserId || vehicles.length === 0) return;

    const loadAllMessages = async () => {
      try {
        console.log('Loading all messages for chat history...');

        if (SUPABASE_ENABLED) {
          // Load messages from Supabase
          const { data, error } = await supabase.from('driver_messages').select('*')
            .or(`receiver_id.eq.${currentUserId},sender_id.eq.${currentUserId}`)
            .order('timestamp', { ascending: false });

          if (error) {
            console.warn('Could not load all messages from Supabase:', error);
            // Fallback to localStorage
            const localMessages = getDriverMessages();
            setAllMessages(localMessages);
            return;
          }

          if (data) {
            console.log(`Loaded ${data.length} messages from Supabase`);
            setAllMessages(data);

            // Also save to localStorage as backup
            saveDriverMessages(data);
          }
        } else {
          // Load from localStorage only
          const localMessages = getDriverMessages();
          console.log(`Loaded ${localMessages.length} messages from localStorage`);
          setAllMessages(localMessages);
        }
      } catch (err) {
        console.warn('Error loading all messages:', err);
        // Fallback to localStorage
        const localMessages = getDriverMessages();
        setAllMessages(localMessages);
      }
    };

    loadAllMessages();
  }, [currentUserId, vehicles.length]);

  // Calculate chat history and unread counts
  useEffect(() => {
    if (!currentUserId) return;

    const historyMap = new Map<number, ChatHistoryItem>();

    vehicles.forEach(vehicle => {
      const vehicleMessages = allMessages.filter(msg =>
        (msg.sender_id === `driver_${vehicle.id}` && msg.receiver_id === 'dispatcher') ||
        (msg.sender_id === 'dispatcher' && msg.receiver_id === `driver_${vehicle.id}`)
      );

      if (vehicleMessages.length > 0) {
        const unreadCount = vehicleMessages.filter(msg =>
          msg.sender_id === `driver_${vehicle.id}` && msg.receiver_id === 'dispatcher' && !msg.read
        ).length;

        const lastMessage = vehicleMessages.sort((a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        )[0];

        historyMap.set(vehicle.id, {
          vehicleId: vehicle.id,
          vehicleName: vehicle.name,
          lastMessage: lastMessage.message,
          timestamp: lastMessage.timestamp,
          unreadCount
        });
      } else {
        // Include vehicle in history even if no messages yet
        historyMap.set(vehicle.id, {
          vehicleId: vehicle.id,
          vehicleName: vehicle.name,
          lastMessage: '',
          timestamp: '',
          unreadCount: 0
        });
      }
    });

    const history = Array.from(historyMap.values()).sort((a, b) =>
      new Date(b.timestamp || '1970-01-01').getTime() - new Date(a.timestamp || '1970-01-01').getTime()
    );

    setChatHistory(history);
  }, [vehicles, allMessages, currentUserId]);

  // Load messages for selected vehicle - improved with better error handling
  useEffect(() => {
    if (!selectedVehicleId) return;

    const loadMessages = async () => {
      try {
        console.log(`Loading messages for vehicle: ${selectedVehicleId}`);

        if (SUPABASE_ENABLED) {
          // Load messages from Supabase using OR query
          const { data, error } = await supabase
            .from('driver_messages')
            .select('*')
            .or(`and(sender_id.eq.dispatcher,receiver_id.eq.driver_${selectedVehicleId}),and(sender_id.eq.driver_${selectedVehicleId},receiver_id.eq.dispatcher)`)
            .order('timestamp', { ascending: false });

          if (error) {
            console.warn('Could not load messages from Supabase:', error);
            // Fallback to localStorage
            const localMessages = getDriverMessages();
            const vehicleMessages = localMessages.filter(msg =>
              (msg.sender_id === 'dispatcher' && msg.receiver_id === `driver_${selectedVehicleId}`) ||
              (msg.sender_id === `driver_${selectedVehicleId}` && msg.receiver_id === 'dispatcher')
            );
            console.log(`Loaded ${vehicleMessages.length} messages from localStorage for vehicle ${selectedVehicleId}`);
            setMessages(vehicleMessages);
            return;
          }

          if (data && data.length > 0) {
            console.log(`Loaded ${data.length} messages for vehicle ${selectedVehicleId} from Supabase`);
            setMessages(data);
          } else {
            console.log(`No messages found for vehicle ${selectedVehicleId} in Supabase`);
            setMessages([]);
          }
        } else {
          // Load from localStorage
          const localMessages = getDriverMessages();
          const vehicleMessages = localMessages.filter(msg =>
            (msg.sender_id === 'dispatcher' && msg.receiver_id === `driver_${selectedVehicleId}`) ||
            (msg.sender_id === `driver_${selectedVehicleId}` && msg.receiver_id === 'dispatcher')
          );
          console.log(`Loaded ${vehicleMessages.length} messages from localStorage for vehicle ${selectedVehicleId}`);
          setMessages(vehicleMessages);
        }
      } catch (err) {
        console.warn('Error loading messages for vehicle:', selectedVehicleId, err);
        // Fallback to localStorage
        const localMessages = getDriverMessages();
        const vehicleMessages = localMessages.filter(msg =>
          (msg.sender_id === 'dispatcher' && msg.receiver_id === `driver_${selectedVehicleId}`) ||
          (msg.sender_id === `driver_${selectedVehicleId}` && msg.receiver_id === 'dispatcher')
        );
        setMessages(vehicleMessages);
      }
    };

    loadMessages();
  }, [selectedVehicleId]);

  // Subscribe to new messages globally (for all vehicles) - improved
  useEffect(() => {
    if (!currentUserId || !SUPABASE_ENABLED) return;

    console.log('Setting up real-time message subscription');

    const channel = supabase
      .channel('driver_messages_global')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'driver_messages'
       }, (payload) => {
        const incomingMessage = payload.new as ChatMessage;
        console.log('New message received:', incomingMessage);

        // Update allMessages for chat history (avoid duplicates)
        setAllMessages(prev => {
          const exists = prev.some(m => m.id === incomingMessage.id);
          if (!exists) {
            const updated = [...prev, incomingMessage];
            console.log(`Updated allMessages count: ${updated.length}`);

            // Also save to localStorage
            saveDriverMessages(updated);
            return updated;
          }
          return prev;
        });

        // Check if the message is relevant to the currently selected vehicle
        if (selectedVehicleId) {
          const isRelevant = (incomingMessage.sender_id === 'dispatcher' && incomingMessage.receiver_id === 'driver_' + selectedVehicleId) ||
                             (incomingMessage.sender_id === 'driver_' + selectedVehicleId && incomingMessage.receiver_id === 'dispatcher');

          if (isRelevant) {
            console.log('Message is relevant to selected vehicle, updating messages state');
            setMessages(prev => {
              const exists = prev.some(m => m.id === incomingMessage.id);
              if (!exists) {
                return [...prev, incomingMessage];
              }
              return prev;
            });

            // Notify about new message if it's from a vehicle
            if (incomingMessage.sender_id.startsWith('driver_')) {
              const vehicleId = parseInt(incomingMessage.sender_id.replace('driver_', ''));
              if (onNewMessage) {
                onNewMessage(vehicleId, incomingMessage.message);
              }
            }
          }
        }
      })
      .subscribe();

    return () => {
      console.log('Cleaning up message subscription');
      supabase.removeChannel(channel);
    };
  }, [selectedVehicleId, currentUserId, onNewMessage]);

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

      let newMessageData;

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
        newMessageData = data;
      } else {
        // Local storage fallback
        newMessageData = { ...messageData, id: `local-${Date.now()}` };
      }

      // Store message in local cache/history
      addDriverMessage(newMessageData);
      // Update local state immediately
      setMessages(prev => [newMessageData, ...prev]);

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
    if (senderId === 'dispatcher' || senderId === currentUserId) return 'Vy';
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

      {/* Two-column layout */}
      <div className="flex-1 flex gap-3 overflow-hidden">
        {/* Left column: Chat History */}
        <div className="w-1/3 bg-slate-900/50 rounded-lg overflow-hidden flex flex-col">
          <div className="flex-shrink-0 p-3 border-b border-slate-600">
            <h4 className="text-sm font-medium text-white flex items-center">
              <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2z m0 7a1 1 0 110-2 1 1 0 010 2z m0 7a1 1 0 110-2 1 1 0 010 2z" />
              </svg>
              Historie chatů
            </h4>
          </div>

          <div className="flex-1 overflow-y-auto">
            {chatHistory.map(chat => (
              <div
                key={chat.vehicleId}
                onClick={() => setSelectedVehicleId(chat.vehicleId)}
                className={`p-3 border-b border-slate-700 cursor-pointer hover:bg-slate-700/50 transition-colors ${
                  selectedVehicleId === chat.vehicleId ? 'bg-slate-700 border-l-4 border-primary' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-medium text-sm truncate">{chat.vehicleName}</div>
                    {chat.lastMessage && (
                      <div className="text-slate-400 text-xs truncate mt-1">{chat.lastMessage}</div>
                    )}
                    {chat.timestamp && (
                      <div className="text-slate-500 text-xs mt-1">
                        {new Date(chat.timestamp).toLocaleTimeString('cs-CZ', {
                          hour: '2-digit',
                          minute: '2-digit',
                          day: '2-digit',
                          month: '2-digit'
                        })}
                      </div>
                    )}
                  </div>
                  {chat.unreadCount > 0 && (
                    <div className="flex-shrink-0 ml-2">
                      <div className="bg-primary text-slate-900 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                        {chat.unreadCount}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {chatHistory.length === 0 && (
              <div className="p-4 text-center text-slate-500 text-sm">
                Žádné vozidlo nenalezeno
              </div>
            )}
          </div>
        </div>

        {/* Right column: Active Chat */}
        <div className="flex-1 bg-slate-900/50 rounded-lg overflow-hidden flex flex-col">
          <div className="flex-shrink-0 p-3 border-b border-slate-600">
            {selectedVehicleId ? (
              <div className="flex items-center">
                <div className="w-6 h-6 bg-[#8FBCBB]/80 rounded-lg flex items-center justify-center mr-2">
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03 8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <h4 className="text-sm font-medium text-white">
                  Chat s {vehicles.find(v => v.id === selectedVehicleId)?.name || 'vozidlem'}
                </h4>
              </div>
            ) : (
              <div className="text-slate-400 text-sm">
                Vyberte chat zleva
              </div>
            )}
          </div>

          {selectedVehicleId ? (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-3 min-h-0">
                {messages.length === 0 ? (
                  <p className="text-sm text-slate-400 italic text-center">
                    Žádné zprávy s tímto vozidlem
                  </p>
                ) : (
                  <div className="space-y-2">
                    {messages
                      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                      .map((msg) => (
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

              {/* Message input */}
              <div className="flex-shrink-0 p-3 border-t border-slate-600">
                <div className="flex gap-2">
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
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-slate-400">
                <div className="w-16 h-16 mx-auto mb-4 bg-slate-800 rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <p className="text-lg font-medium">Vyberte vozidlo zleva</p>
                <p className="text-sm mt-2">Začněte konverzaci se svým řidičem</p>
              </div>
            </div>
          )}
        </div>
      </div>


    </div>
  );
};
