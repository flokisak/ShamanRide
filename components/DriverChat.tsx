import React, { useState, useEffect, useRef } from 'react';
import { Person, Vehicle } from '../types';
import { useTranslation } from '../contexts/LanguageContext';
import { supabase, SUPABASE_ENABLED } from '../services/supabaseClient';
import io from 'socket.io-client';

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
  vehicleId: number | 'general';
  vehicleName: string;
  lastMessage: string;
  timestamp: string;
  unreadCount: number;
}

export const DriverChat: React.FC<DriverChatProps> = ({ vehicles, onNewMessage }) => {
  const { t } = useTranslation();

  console.log('DriverChat component mounted with', vehicles.length, 'vehicles');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [allMessages, setAllMessages] = useState<ChatMessage[]>([]); // Store messages from all chats
  const [newMessage, setNewMessage] = useState('');
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | 'general' | null>('general');
  const [sending, setSending] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatHistoryItem[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [socket, setSocket] = useState<any>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  // Socket.io connection for real-time messaging
  useEffect(() => {
    if (!currentUserId) return;

    const getToken = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      return session?.access_token;
    };

    const initSocket = async () => {
      const token = await getToken();

      const socketInstance = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000', {
        auth: { token },
        transports: ['websocket', 'polling']
      });

      socketInstance.on('connect', () => {
        console.log('Dispatcher chat connected to server');
        setSocketConnected(true);

        // Join group chat for shift messages
        socketInstance.emit('join_group_chat', 'dispatcher_shift');
        console.log('Dispatcher chat joined group chat: dispatcher_shift');
      });

      socketInstance.on('disconnect', () => {
        console.log('Dispatcher chat disconnected from server');
        setSocketConnected(false);
      });

       // Listen for new messages
       socketInstance.on('new_message', (messageData) => {
         console.log('Dispatcher chat received message:', messageData);

         // Save to Supabase for persistence
         if (SUPABASE_ENABLED) {
           console.log('Saving received message to Supabase:', messageData);
           supabase.from('driver_messages').insert(messageData).then(({ data, error }) => {
             if (error) {
               console.error('Failed to save received message to Supabase:', error, 'Message data:', messageData);
               // Fallback to localStorage
               addDriverMessage(messageData);
             } else {
               console.log('Successfully saved received message to Supabase:', data);
             }
           });
         } else {
           console.log('Supabase disabled, saving received message to localStorage');
           // Save to localStorage
           addDriverMessage(messageData);
         }

         // Update allMessages for chat history
         setAllMessages(prev => {
           const exists = prev.some(m => m.id === messageData.id);
           if (!exists) {
             return [messageData, ...prev];
           }
           return prev;
         });

         // Add to current chat messages if it's relevant to the selected chat
         if (selectedVehicleId) {
           let isRelevant = false;

           if (selectedVehicleId === 'general') {
             isRelevant = messageData.receiver_id === 'general';
           } else {
             isRelevant = (messageData.sender_id === `driver_${selectedVehicleId}` && messageData.receiver_id === 'dispatcher') ||
                         (messageData.sender_id === 'dispatcher' && messageData.receiver_id === `driver_${selectedVehicleId}`);
           }

           if (isRelevant) {
             setMessages(prev => {
               const exists = prev.some(m => m.id === messageData.id);
               if (!exists) {
                 return [messageData, ...prev];
               }
               return prev;
             });
           }
         }

         // Notify parent component
         if (onNewMessage && messageData.sender_id !== 'dispatcher') {
           const vehicleId = messageData.sender_id.startsWith('driver_') ?
             parseInt(messageData.sender_id.replace('driver_', '')) : null;
           if (vehicleId) {
             onNewMessage(vehicleId, messageData.message);
           }
         }
       });

      setSocket(socketInstance);
    };

    initSocket();

    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [currentUserId, selectedVehicleId, onNewMessage]);

  // Join chat rooms for all vehicles when they load
  useEffect(() => {
    if (!socket || !socketConnected || vehicles.length === 0) return;

    console.log('Dispatcher chat joining rooms for', vehicles.length, 'vehicles');
    vehicles.forEach(vehicle => {
      const roomName = `chat:Ddispatcher_R${vehicle.id}`;
      socket.emit('join_chat_dispatcher_driver', {
        dispatcherId: 'dispatcher',
        driverId: vehicle.id
      });
      console.log(`Dispatcher chat joined room: ${roomName}`);
    });
  }, [socket, socketConnected, vehicles]);

  // Join appropriate chat room when recipient changes
  useEffect(() => {
    if (!socket || !socketConnected || !selectedVehicleId) return;

    if (selectedVehicleId !== 'general') {
      socket.emit('join_chat_dispatcher_driver', {
        dispatcherId: 'dispatcher',
        driverId: selectedVehicleId
      });
    }
  }, [selectedVehicleId, socket, socketConnected]);

  // Load all messages for all vehicles (for chat history) - runs on mount and when vehicles change
  useEffect(() => {
    console.log('DriverChat: Loading messages, currentUserId:', currentUserId, 'vehicles:', vehicles.length);
    if (!currentUserId || vehicles.length === 0) {
      console.log('DriverChat: Skipping load - no userId or vehicles');
      return;
    }

    const loadAllMessages = async () => {
      try {
        console.log('Loading all messages for chat history...');

        if (SUPABASE_ENABLED) {
          // Load messages from Supabase - get all messages involving dispatcher
          // Get messages sent by dispatcher, received by dispatcher, or general messages
          const { data: sentMessages, error: sentError } = await supabase.from('driver_messages').select('*')
            .eq('sender_id', 'dispatcher')
            .order('timestamp', { ascending: false });

          const { data: receivedMessages, error: receivedError } = await supabase.from('driver_messages').select('*')
            .eq('receiver_id', 'dispatcher')
            .order('timestamp', { ascending: false });

          const { data: generalMessages, error: generalError } = await supabase.from('driver_messages').select('*')
            .eq('receiver_id', 'general')
            .order('timestamp', { ascending: false });

          if (sentError || receivedError || generalError) {
            console.warn('Error loading messages:', { sentError, receivedError, generalError });
            // Continue with partial data
          }

          // Combine all messages and remove duplicates
          const allMessages = [...(sentMessages || []), ...(receivedMessages || []), ...(generalMessages || [])];
          const uniqueMessages = allMessages.filter((msg, index, self) =>
            index === self.findIndex(m => m.id === msg.id)
          );

          const data = uniqueMessages.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

          if (data && data.length > 0) {
            console.log(`Loaded ${data.length} messages from Supabase`);
            setAllMessages(data);

            // Also save to localStorage as backup
            saveDriverMessages(data);
          } else {
            console.log('No messages found in Supabase');
            setAllMessages([]);
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
    console.log('DriverChat: Building chat history, vehicles:', vehicles.length, 'allMessages:', allMessages.length);
    if (!currentUserId) return;

    const historyMap = new Map<number | 'general', ChatHistoryItem>();

    // Add general chat
    const generalMessages = allMessages.filter(msg => msg.receiver_id === 'general');
    if (generalMessages.length > 0) {
      const unreadCount = generalMessages.filter(msg =>
        msg.sender_id !== 'dispatcher' && !msg.read
      ).length;

      const lastMessage = generalMessages.sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )[0];

      historyMap.set('general', {
        vehicleId: 'general' as any,
        vehicleName: 'Všeobecný chat (celá směna)',
        lastMessage: lastMessage.message,
        timestamp: lastMessage.timestamp,
        unreadCount
      });
    } else {
      // Include general chat even if no messages yet
      historyMap.set('general', {
        vehicleId: 'general' as any,
        vehicleName: 'Všeobecný chat (celá směna)',
        lastMessage: '',
        timestamp: '',
        unreadCount: 0
      });
    }

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

    console.log('DriverChat: Setting chatHistory with', history.length, 'items:', history.map(h => ({ id: h.vehicleId, name: h.vehicleName })));
    setChatHistory(history);
  }, [vehicles, allMessages, currentUserId]);

  // Load messages for selected vehicle or general chat - improved with better error handling
  useEffect(() => {
    if (!selectedVehicleId) {
      setMessages([]);
      return;
    }

    console.log(`Loading messages for: ${selectedVehicleId}`);

    // First try to load from allMessages (which includes real-time messages)
    let filteredMessages;

    if (selectedVehicleId === 'general') {
      filteredMessages = allMessages.filter(msg => msg.receiver_id === 'general');
    } else {
      filteredMessages = allMessages.filter(msg =>
        (msg.sender_id === 'dispatcher' && msg.receiver_id === `driver_${selectedVehicleId}`) ||
        (msg.sender_id === `driver_${selectedVehicleId}` && msg.receiver_id === 'dispatcher')
      );
    }

    console.log(`Loaded ${filteredMessages.length} messages from allMessages for ${selectedVehicleId}`);
    setMessages(filteredMessages);

        // Also load from Supabase/localStorage as backup and to ensure we have all historical messages
    const loadFromStorage = async () => {
      try {
        if (SUPABASE_ENABLED) {
          console.log('Loading messages from Supabase for:', selectedVehicleId);

          // First, let's check if we can access the table at all
          const { data: testData, error: testError } = await supabase
            .from('driver_messages')
            .select('*', { count: 'exact', head: true });

          if (testError) {
            console.error('Cannot access driver_messages table:', testError);
          } else {
            console.log('driver_messages table is accessible, total records:', testData);
          }

          // Also try to get all messages to see what's in the table
          const { data: allData, error: allError } = await supabase
            .from('driver_messages')
            .select('*')
            .order('timestamp', { ascending: false })
            .limit(10);

          if (allError) {
            console.error('Cannot query driver_messages table:', allError);
          } else {
            console.log('Recent messages in driver_messages table:', allData);
          }

          let query;

          if (selectedVehicleId === 'general') {
            // Load general messages
            query = supabase
              .from('driver_messages')
              .select('*')
              .eq('receiver_id', 'general')
              .order('timestamp', { ascending: false });
          } else {
            // Load messages from Supabase using OR query for specific vehicle
            query = supabase
              .from('driver_messages')
              .select('*')
              .or(`and(sender_id.eq.dispatcher,receiver_id.eq.driver_${selectedVehicleId}),and(sender_id.eq.driver_${selectedVehicleId},receiver_id.eq.dispatcher)`)
              .order('timestamp', { ascending: false });
          }

          const { data, error } = await query;

          if (error) {
            console.error('Could not load messages from Supabase:', error);
            // Fallback to localStorage
            const localMessages = getDriverMessages();
            let localFilteredMessages;

            if (selectedVehicleId === 'general') {
              localFilteredMessages = localMessages.filter(msg => msg.receiver_id === 'general');
            } else {
              localFilteredMessages = localMessages.filter(msg =>
                (msg.sender_id === 'dispatcher' && msg.receiver_id === `driver_${selectedVehicleId}`) ||
                (msg.sender_id === `driver_${selectedVehicleId}` && msg.receiver_id === 'dispatcher')
              );
            }

            // Merge with existing messages to avoid duplicates
            const mergedMessages = [...filteredMessages];
            localFilteredMessages.forEach(msg => {
              if (!mergedMessages.some(m => m.id === msg.id)) {
                mergedMessages.push(msg);
              }
            });

            console.log(`Merged ${mergedMessages.length} messages (including ${localFilteredMessages.length} from localStorage) for ${selectedVehicleId}`);
            setMessages(mergedMessages);
            return;
          }

          console.log(`Loaded ${data?.length || 0} messages from Supabase for ${selectedVehicleId}:`, data);
          if (data && data.length > 0) {
            // Merge with existing messages to avoid duplicates
            const mergedMessages = [...filteredMessages];
            data.forEach(msg => {
              if (!mergedMessages.some(m => m.id === msg.id)) {
                mergedMessages.push(msg);
              }
            });

            console.log(`Merged ${mergedMessages.length} messages (including ${data.length} from Supabase) for ${selectedVehicleId}`);
            setMessages(mergedMessages);
          } else {
            console.log('No messages found in Supabase, using only real-time messages');
            setMessages(filteredMessages);
          }
        } else {
          console.log('Supabase disabled, loading from localStorage');
          // Load from localStorage
          const localMessages = getDriverMessages();
          let localFilteredMessages;

          if (selectedVehicleId === 'general') {
            localFilteredMessages = localMessages.filter(msg => msg.receiver_id === 'general');
          } else {
            localFilteredMessages = localMessages.filter(msg =>
              (msg.sender_id === 'dispatcher' && msg.receiver_id === `driver_${selectedVehicleId}`) ||
              (msg.sender_id === `driver_${selectedVehicleId}` && msg.receiver_id === 'dispatcher')
            );
          }

          // Merge with existing messages to avoid duplicates
          const mergedMessages = [...filteredMessages];
          localFilteredMessages.forEach(msg => {
            if (!mergedMessages.some(m => m.id === msg.id)) {
              mergedMessages.push(msg);
            }
          });

          console.log(`Merged ${mergedMessages.length} messages (including ${localFilteredMessages.length} from localStorage) for ${selectedVehicleId}`);
          setMessages(mergedMessages);
        }
      } catch (err) {
        console.error('Error loading messages for:', selectedVehicleId, err);
      }
    };

    loadFromStorage();
  }, [selectedVehicleId, allMessages]);



  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    console.log('DriverChat sendMessage called:', { newMessage: newMessage.trim(), selectedVehicleId, sending, socket: !!socket, socketConnected });
    if (!newMessage.trim() || !selectedVehicleId || sending || !socket || !socketConnected) {
      console.log('DriverChat sendMessage blocked:', { noMessage: !newMessage.trim(), noVehicle: !selectedVehicleId, sending, noSocket: !socket, notConnected: !socketConnected });
      return;
    }

    setSending(true);
    try {
      // Determine room and chat type
      let room;
      let chatType;
      if (selectedVehicleId === 'general') {
        room = 'shift_chat:dispatcher_shift';
        chatType = 'group';
      } else {
        room = `chat:Ddispatcher_R${selectedVehicleId}`;
        chatType = 'dispatcher_driver';
      }

      const messageData = {
        room,
        message: newMessage.trim(),
        senderId: 'dispatcher',
        receiverId: selectedVehicleId === 'general' ? 'general' : `driver_${selectedVehicleId}`,
        type: chatType
      };

      console.log('Dispatcher sending message via socket:', messageData);

      // Send via socket
      socket.emit('message', messageData);

        // Create local message object for immediate UI update
        const localMessageData = {
          id: crypto.randomUUID(),
          sender_id: 'dispatcher',
          receiver_id: selectedVehicleId === 'general' ? 'general' : `driver_${selectedVehicleId}`,
          message: newMessage.trim(),
          timestamp: new Date().toISOString(),
          read: true,
          encrypted: false // Local messages are not encrypted
        };

       // Save to Supabase for persistence
       if (SUPABASE_ENABLED) {
         console.log('Saving sent message to Supabase:', localMessageData);
         supabase.from('driver_messages').insert(localMessageData).then(({ data, error }) => {
           if (error) {
             console.error('Failed to save sent message to Supabase:', error, 'Message data:', localMessageData);
             // Fallback to localStorage
             addDriverMessage(localMessageData);
           } else {
             console.log('Successfully saved sent message to Supabase:', data);
           }
         });
       } else {
         console.log('Supabase disabled, saving sent message to localStorage');
         // Save to localStorage
         addDriverMessage(localMessageData);
       }

       // Update allMessages for chat history
       setAllMessages(prev => [localMessageData, ...prev]);

       // Update local state immediately
       setMessages(prev => [localMessageData, ...prev]);

       // Update chat history
       setChatHistory(prev => prev.map(chat => {
         if ((selectedVehicleId === 'general' && chat.vehicleId === 'general') ||
             (chat.vehicleId === selectedVehicleId)) {
           return {
             ...chat,
             lastMessage: newMessage.trim(),
             timestamp: new Date().toISOString(),
             unreadCount: 0
           };
         }
         return chat;
       }));

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

  // Debug info
  console.log('DriverChat render:', { vehicles: vehicles.length, chatHistory: chatHistory.length, selectedVehicleId, socketConnected });

  if (vehicles.length === 0) {
    return (
      <div className="bg-slate-800 p-3 rounded-lg shadow-2xl flex flex-col h-full" tabIndex={-1}>
        <div className="flex items-center justify-center h-full">
          <div className="text-center text-slate-400">
            <p>Načítání vozidel...</p>
            <p className="text-xs mt-2">Pokud se nezobrazí, zkontrolujte konzoli prohlížeče</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 p-3 rounded-lg shadow-2xl flex flex-col h-full" tabIndex={-1}>
      {/* Header */}
      <div className="flex-shrink-0 mb-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white flex items-center">
            <div className="w-6 h-6 bg-[#8FBCBB]/80 rounded-lg flex items-center justify-center mr-2">
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            Chat s vozidly ({vehicles.length} vozidel, {chatHistory.length} chatů)
          </h3>
          <div className="flex items-center gap-3">
            <div className="text-xs text-slate-400">
              {vehicles.filter(v => v.status === 'AVAILABLE' || v.status === 'BUSY').length} online
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${socketConnected ? 'bg-green-400' : 'bg-red-400'}`}></div>
              <span className="text-xs text-slate-300">
                {socketConnected ? 'Připojeno' : 'Offline'}
              </span>
            </div>
          </div>
        </div>
      </div>

       {/* Two-column layout */}
       <div className="flex-1 flex gap-4 min-h-0">
         {/* Left Column: Compact Chat List */}
          <div className="w-48 flex flex-col bg-slate-900/30 rounded-lg min-h-0">

          {/* Chat History - Compact List */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-2">
              <h5 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2 px-1">
                Aktivní chaty ({chatHistory.length})
              </h5>
            </div>
            {chatHistory.length > 0 ? (
              <div className="space-y-1">
                {chatHistory.map(chat => (
                  <div
                    key={chat.vehicleId}
                    onClick={() => {
                      console.log('Clicked on chat:', chat.vehicleId, chat.vehicleName);
                      setSelectedVehicleId(chat.vehicleId);
                    }}
                    className={`mx-2 px-3 py-2 rounded-lg cursor-pointer transition-all duration-200 ${
                      selectedVehicleId === chat.vehicleId
                        ? 'bg-primary text-slate-900 shadow-md'
                        : 'hover:bg-slate-700/50 text-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${
                            selectedVehicleId === chat.vehicleId ? 'bg-slate-900' : 'bg-green-400'
                          }`}></div>
                          <div className="text-sm font-medium truncate">{chat.vehicleName}</div>
                        </div>
                        {chat.lastMessage && (
                          <div className={`text-xs truncate mt-1 ${
                            selectedVehicleId === chat.vehicleId ? 'text-slate-700' : 'text-slate-400'
                          }`}>
                            {chat.lastMessage}
                          </div>
                        )}
                        {chat.timestamp && (
                          <div className={`text-xs mt-1 ${
                            selectedVehicleId === chat.vehicleId ? 'text-slate-600' : 'text-slate-500'
                          }`}>
                            {new Date(chat.timestamp).toLocaleTimeString('cs-CZ', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </div>
                        )}
                      </div>
                      {chat.unreadCount > 0 && (
                        <div className="flex-shrink-0 ml-2">
                          <div className="bg-red-500 text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                            {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center text-slate-500 text-sm">
                <div className="w-8 h-8 mx-auto mb-2 bg-slate-800 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                Žádné aktivní chaty
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Active Chat */}
        <div className="flex-1 bg-slate-900/50 rounded-lg flex flex-col min-h-0">
          {selectedVehicleId ? (
            <>
              <div className="flex items-center justify-between p-3 border-b border-slate-600">
                <h4 className="text-sm font-medium text-white">
                  {selectedVehicleId === 'general'
                    ? 'Všeobecný chat (celá směna)'
                    : `Chat s ${vehicles.find(v => v.id === selectedVehicleId)?.name || 'vozidlem'}`
                  }
                </h4>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${socketConnected ? 'bg-green-400' : 'bg-red-400'}`}></div>
                  <span className="text-xs text-slate-400">
                    {socketConnected ? 'Online' : 'Offline'}
                  </span>
                </div>
              </div>

               {/* Messages */}
               <div className="flex-1 overflow-hidden flex flex-col min-h-0 max-h-96">
                 <div className="flex-1 overflow-y-auto p-3 space-y-2">
                   {messages.length === 0 ? (
                     <p className="text-sm text-slate-400 italic text-center py-4">
                       {selectedVehicleId === 'general'
                         ? 'Žádné zprávy ve všeobecném chatu'
                         : 'Žádné zprávy s tímto vozidlem'
                       }
                     </p>
                   ) : (
                      <>
                        {messages
                          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                          .map((msg, index) => {
                            const isNewestMessage = index === 0; // First message is the newest
                            const shouldFlash = isNewestMessage && !msg.read; // Only flash if newest AND unread
                            return (
                              <div
                                key={msg.id}
                                className={`flex ${msg.sender_id === currentUserId ? 'justify-end' : 'justify-start'}`}
                              >
                                <div
                                  className={`max-w-xs px-3 py-2 rounded-lg text-sm relative ${
                                    msg.sender_id === currentUserId
                                      ? 'bg-primary text-slate-900'
                                      : 'bg-slate-700 text-white'
                                  } ${
                                    shouldFlash
                                      ? 'ring-2 ring-blue-400 ring-opacity-60 shadow-lg shadow-blue-400/20 animate-pulse'
                                      : ''
                                  }`}
                                >
                                  {shouldFlash && (
                                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-400 rounded-full animate-ping"></div>
                                  )}
                                  <div className="text-xs opacity-75 mb-1">
                                    {getSenderName(msg.sender_id)} • {formatTime(msg.timestamp)}
                                  </div>
                                  <div className="break-words">{msg.message}</div>
                                </div>
                              </div>
                            );
                          })}
                        <div ref={messagesEndRef} />
                      </>
                   )}
                 </div>
               </div>

              {/* Message input */}
              <div className="flex-shrink-0 p-3 border-t border-slate-600">
                <div className="flex gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Napište zprávu..."
                    className="flex-1 px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                    disabled={sending}
                    tabIndex={-1}
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!newMessage.trim() || sending || !socketConnected}
                    className="px-4 py-2 bg-primary hover:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg btn-modern text-slate-900 font-medium text-sm whitespace-nowrap"
                  >
                    {sending ? 'Odesílání...' : 'Odeslat'}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="text-center text-slate-400 max-w-sm">
                <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-slate-800 to-slate-700 rounded-2xl flex items-center justify-center shadow-lg">
                  <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">Vyberte chat</h3>
                <p className="text-sm leading-relaxed">
                  Klikněte na vozidlo v seznamu vlevo nebo použijte rychlou volbu nahoře pro zahájení konverzace s řidičem.
                </p>
                <div className="mt-4 flex justify-center">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                    {vehicles.length} vozidel online
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
