import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import { supabase, getCachedAccessToken, safeGetAccessToken } from '../services/supabaseClient';
import { generateRoomKey, encryptMessage, decryptMessage } from '../services/encryptionService';

const Chat = ({ currentUser, shiftId, chatType, targetId }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [isTyping, setIsTyping] = useState(false);
  const [typingUsers, setTypingUsers] = useState([]);
  const [offlineQueue, setOfflineQueue] = useState([]);
  const [userPresence, setUserPresence] = useState({});
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // Determine room name based on chat type
  const getRoomName = () => {
    if (chatType === 'dispatcher_driver') {
      // Use fixed dispatcher ID to match driver app
      return `chat:Ddispatcher_R${targetId}`;
    } else if (chatType === 'driver_driver') {
      return `chat:R${currentUser.id}_R${targetId}`;
    } else if (chatType === 'group') {
      return `shift_chat:${shiftId}`;
    }
    return null;
  };

  // Scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Auto-scroll disabled to prevent focus stealing
  // useEffect(() => {
  //   scrollToBottom();
  // }, [messages]);

  // Initialize socket connection
  useEffect(() => {
    if (!currentUser) return;

  const socketRef = { current: null };
  const createdByThisComponent = { value: false };
  const retryRef = { timer: null, attempts: 0 };
  const cleanupRef = { current: null };
  let destroyed = false;

    // Get JWT token for authentication (prefer cached token, allow safe refresh/wait)
    const waitForToken = async (timeoutMs = 3000) => {
      const cached = getCachedAccessToken();
      if (cached) return cached;

      try {
        const refreshed = await safeGetAccessToken({ forceRefresh: true });
        if (refreshed) return refreshed;
      } catch (e) {
        // ignore
      }

      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const t = getCachedAccessToken();
        if (t) return t;
        await new Promise(r => setTimeout(r, 200));
      }

      try {
        return await safeGetAccessToken({ forceRefresh: true });
      } catch (e) {
        return null;
      }
    };

    const attachHandlers = (socketInstance) => {
      // Define handlers so we can remove them later
      const onConnect = () => {
        if (destroyed) return;
        console.log('SocketChat: Connected to chat server');
        console.log('SocketChat: currentUser:', currentUser);
        console.log('SocketChat: chatType:', chatType, 'shiftId:', shiftId, 'targetId:', targetId);
        setIsConnected(true);
        setConnectionStatus('connected');

        // Send queued messages when reconnected
        if (offlineQueue.length > 0) {
          console.log('SocketChat: Sending queued messages:', offlineQueue.length);
          offlineQueue.forEach(messageData => {
            socketInstance.emit('message', messageData);
          });
          setOfflineQueue([]);
        }

        // Join appropriate room
        const room = getRoomName();
        console.log('SocketChat: Joining room:', room);
        if (room) {
           if (chatType === 'dispatcher_driver') {
             socketInstance.emit('join_chat_dispatcher_driver', {
               dispatcherId: 'dispatcher', // Use fixed dispatcher ID to match driver app
               driverId: targetId
             });
          } else if (chatType === 'driver_driver') {
            socketInstance.emit('join_chat_driver_driver', {
              driverId1: currentUser.id,
              driverId2: targetId
            });
          } else if (chatType === 'group') {
            socketInstance.emit('join_group_chat', shiftId);
          }
        }
      };

      const onDisconnect = (reason) => {
        if (destroyed) return;
        console.log('SocketChat: Disconnected from chat server, reason:', reason);
        setIsConnected(false);
        setConnectionStatus('disconnected');
      };

      const onConnectError = (error) => {
        if (destroyed) return;
        console.error('SocketChat: Connection error:', error);
        setIsConnected(false);
        setConnectionStatus('error');
      };

      const onError = (err) => {
        if (destroyed) return;
        console.warn('SocketChat: socket error:', err);
      };

      const onReconnect = () => {
        if (destroyed) return;
        console.log('SocketChat: Reconnected, rejoining rooms');
        setConnectionStatus('connected');
        // Rejoin rooms on reconnect
        const room = getRoomName();
        if (room) {
          if (chatType === 'dispatcher_driver') {
            socketInstance.emit('join_chat_dispatcher_driver', {
              dispatcherId: 'dispatcher', // Use fixed dispatcher ID to match driver app
              driverId: targetId
            });
          } else if (chatType === 'driver_driver') {
            socketInstance.emit('join_chat_driver_driver', {
              driverId1: currentUser.id,
              driverId2: targetId
            });
          } else if (chatType === 'group') {
            socketInstance.emit('join_group_chat', shiftId);
          }
        }
      };

      const onNewMessage = (messageData) => {
        if (destroyed) return;
        console.log('Received message:', messageData);

        // Replace optimistic message if server provided temp_id
        setMessages(prev => {
          if (messageData.temp_id) {
            const idx = prev.findIndex(m => m.id === messageData.temp_id);
            if (idx !== -1) {
              const copy = prev.slice();
              copy[idx] = { ...messageData, status: 'sent' };
              // Remove possible duplicate optimistic copies with same content
              return copy.filter((m, i) => !(i !== idx && m.id === messageData.id));
            }
          }
          // Fallback: if message id already exists, skip; otherwise append
          if (!prev.some(m => m.id === messageData.id)) return [...prev, { ...messageData, status: 'sent' }];
          return prev;
        });

        // Mark message as read if it's not from current user
        if (messageData.sender_id !== (chatType === 'dispatcher_driver' ? 'dispatcher' : `driver_${currentUser.id}`)) {
          socketInstance.emit('mark_as_read', {
            messageId: messageData.id,
            room: getRoomName()
          });
        }
      };

      const onMessageDelivered = (data) => {
        if (destroyed) return;
        setMessages(prev => prev.map(msg =>
          msg.id === data.messageId ? { ...msg, status: 'delivered' } : msg
        ));
      };

      const onMessageError = (error) => {
        if (destroyed) return;
        console.error('Message error:', error);
        // Update message status to failed
        if (error.messageId) {
          setMessages(prev => prev.map(msg =>
            msg.id === error.messageId ? { ...msg, status: 'failed' } : msg
          ));
        }
      };

      const onUserTyping = (data) => {
        if (destroyed) return;
        if (data.userId !== currentUser.id) {
          setTypingUsers(prev => {
            if (!prev.includes(data.userId)) {
              return [...prev, data.userId];
            }
            return prev;
          });
        }
      };

      const onUserStoppedTyping = (data) => {
        if (destroyed) return;
        setTypingUsers(prev => prev.filter(id => id !== data.userId));
      };

      const onMessageRead = (data) => {
        if (destroyed) return;
        setMessages(prev => prev.map(msg =>
          msg.id === data.messageId ? { ...msg, read: true, read_at: data.readAt } : msg
        ));
      };

      const onPresenceUpdate = (data) => {
        if (destroyed) return;
        setUserPresence(prev => ({
          ...prev,
          [data.userId]: {
            status: data.status,
            lastSeen: data.lastSeen
          }
        }));
      };

      // Attach handlers
      socketInstance.on('connect', onConnect);
      socketInstance.on('disconnect', onDisconnect);
      socketInstance.on('connect_error', onConnectError);
      socketInstance.on('error', onError);
      socketInstance.on('reconnect', onReconnect);
      socketInstance.on('new_message', onNewMessage);
      socketInstance.on('message_delivered', onMessageDelivered);
      socketInstance.on('message_error', onMessageError);
      socketInstance.on('user_typing', onUserTyping);
      socketInstance.on('user_stopped_typing', onUserStoppedTyping);
      socketInstance.on('message_read', onMessageRead);
      socketInstance.on('presence_update', onPresenceUpdate);

      // Return a cleanup function to remove handlers
      return () => {
        socketInstance.off('connect', onConnect);
        socketInstance.off('disconnect', onDisconnect);
        socketInstance.off('connect_error', onConnectError);
        socketInstance.off('error', onError);
        socketInstance.off('reconnect', onReconnect);
        socketInstance.off('new_message', onNewMessage);
        socketInstance.off('message_delivered', onMessageDelivered);
        socketInstance.off('message_error', onMessageError);
        socketInstance.off('user_typing', onUserTyping);
        socketInstance.off('user_stopped_typing', onUserStoppedTyping);
        socketInstance.off('message_read', onMessageRead);
        socketInstance.off('presence_update', onPresenceUpdate);
      };
    };

    const connect = async (attempt = 0) => {
      if (destroyed) return;
      // Wait for token
      const token = await waitForToken();
      if (!token) {
        // Exponential backoff retry
        const delay = Math.min(30000, 500 * Math.pow(2, attempt));
        console.warn(`SocketChat: no token available, retrying in ${delay}ms (attempt ${attempt})`);
        retryRef.attempts = attempt + 1;
        retryRef.timer = setTimeout(() => connect(attempt + 1), delay);
        return;
      }

      // Reuse global dispatcher socket if present
      // If present, we will attach temporary handlers and NOT disconnect it on cleanup
  const win = window;
  const existing = win && win.dispatcherSocket ? win.dispatcherSocket : null;

      if (existing) {
        socketRef.current = existing;
        // Attach handlers and keep a reference to cleanup
        const cleanupHandlers = attachHandlers(existing);
        cleanupRef.current = cleanupHandlers;
        // Update state
        setSocket(existing);
        return;
      }

      // Create a new socket and publish it globally so other components can reuse
      const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';
      console.log('SocketChat connecting to:', socketUrl);
      const socketInstance = io(socketUrl, {
        auth: { token },
        transports: ['websocket', 'polling']
      });

      createdByThisComponent.value = true;
  socketRef.current = socketInstance;
  // Attach handlers and keep cleanup
  const cleanupHandlers = attachHandlers(socketInstance);
  cleanupRef.current = cleanupHandlers;

      // Make socket available globally for dispatcher/other components
      try {
        if (typeof window !== 'undefined') {
          window.dispatcherSocket = socketInstance;
        }
      } catch (e) {
        // ignore
      }

      setSocket(socketInstance);
    };

    connect();

    return () => {
      destroyed = true;
      if (retryRef.timer) clearTimeout(retryRef.timer);
      // Remove attached handlers for this component
      try {
        if (cleanupRef.current) {
          try { cleanupRef.current(); } catch (e) { /* ignore */ }
          cleanupRef.current = null;
        }
      } catch (e) { /* ignore */ }

      // Only disconnect socket if we created it
      try {
        const win = window;
        const s = socketRef.current;
        if (s && createdByThisComponent.value) {
          try { s.disconnect(); } catch (e) { /* ignore */ }
          if (win && win.dispatcherSocket === s) {
            win.dispatcherSocket = null;
          }
        }
      } catch (e) {
        // ignore
      }
    };
  }, [currentUser, chatType, targetId, shiftId]);

  // Load message history on mount
  useEffect(() => {
    const loadMessages = async () => {
      try {
        const room = getRoomName();
        if (!room) return;

        // Query messages from Supabase
        let query = supabase
          .from('driver_messages')
          .select('*')
          .order('timestamp', { ascending: true })
          .limit(50);

        if (chatType === 'dispatcher_driver') {
          query = query.or(`and(sender_id.eq.dispatcher,receiver_id.eq.driver_${targetId}),and(sender_id.eq.driver_${targetId},receiver_id.eq.dispatcher)`);
        } else if (chatType === 'driver_driver') {
          query = query.or(`and(sender_id.eq.driver_${currentUser.id},receiver_id.eq.driver_${targetId}),and(sender_id.eq.driver_${targetId},receiver_id.eq.driver_${currentUser.id})`);
        } else if (chatType === 'group') {
          query = query.eq('receiver_id', room);
        }

        const { data, error } = await query;
        if (error) {
          console.error('Error loading messages:', error);
        } else {
          setMessages(data || []);
        }
      } catch (err) {
        console.error('Error loading message history:', err);
      }
    };

    if (currentUser && chatType) {
      loadMessages();
    }
  }, [currentUser, chatType, targetId, shiftId]);

  // Send message
  const sendMessage = async () => {
    if (!newMessage.trim()) return;

    const room = getRoomName();
    if (!room) return;

    // Generate room-specific encryption key (for local optimistic display)
    const encryptionKey = generateRoomKey(room);

    // We'll send plaintext to the server; server will persist/encrypt and broadcast
    const tempId = crypto.randomUUID();

    const messageData = {
      room,
      message: newMessage.trim(), // send plaintext; server will encrypt/persist
      senderId: chatType === 'dispatcher_driver' ? 'dispatcher' : `driver_${currentUser.id}`,
      receiverId: room,
      type: chatType,
      temp_id: tempId
    };

    // Optimistically add message to UI (decrypted for display)
    const optimisticMessage = {
      id: tempId,
      sender_id: messageData.senderId,
      receiver_id: messageData.receiverId,
      message: newMessage.trim(), // show plaintext locally
      timestamp: new Date().toISOString(),
      read: false,
      type: messageData.type,
      status: 'sending',
      encrypted: false
    };
    setMessages(prev => [...prev, optimisticMessage]);

    setNewMessage('');

    try {
      if (socket && isConnected) {
        // Emit message with temp_id so server can persist and return DB id
        socket.emit('message', messageData);
      } else {
        // Queue message for later send; keep temp_id so we can reconcile
        console.log('SocketChat: Queuing message (offline):', messageData);
        setOfflineQueue(prev => [...prev, messageData]);
        setMessages(prev => prev.map(msg => msg.id === optimisticMessage.id ? { ...msg, status: 'queued' } : msg));
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prev => prev.map(msg => msg.id === optimisticMessage.id ? { ...msg, status: 'failed' } : msg));
    }
  };

  // Handle typing indicator
  const handleInputChange = (e) => {
    setNewMessage(e.target.value);

    if (!isTyping && e.target.value.trim()) {
      setIsTyping(true);
      socket?.emit('typing_start', {
        room: getRoomName(),
        userId: currentUser.id
      });
    }

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set new timeout to stop typing indicator
    typingTimeoutRef.current = setTimeout(() => {
      if (isTyping) {
        setIsTyping(false);
        socket?.emit('typing_stop', {
          room: getRoomName(),
          userId: currentUser.id
        });
      }
    }, 1000);
  };

  // Handle enter key
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('cs-CZ', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 text-white">
      {/* Connection status */}
      <div className="p-2 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            connectionStatus === 'connected' ? 'bg-green-400' :
            connectionStatus === 'connecting' ? 'bg-yellow-400' :
            connectionStatus === 'error' ? 'bg-red-400' : 'bg-gray-400'
          }`}></div>
          <span className="text-sm text-slate-300">
            {connectionStatus === 'connected' ? 'Connected' :
             connectionStatus === 'connecting' ? 'Connecting...' :
             connectionStatus === 'error' ? 'Connection Error' : 'Disconnected'}
          </span>
          {offlineQueue.length > 0 && (
            <span className="text-xs text-yellow-400 bg-yellow-900 px-2 py-1 rounded">
              {offlineQueue.length} queued
            </span>
          )}
          {/* Presence indicators */}
          {Object.entries(userPresence).map(([userId, presence]) => (
            <div key={userId} className="flex items-center gap-1">
              <div className={`w-2 h-2 rounded-full ${
                presence.status === 'online' ? 'bg-green-400' : 'bg-gray-400'
              }`}></div>
              <span className="text-xs text-slate-400">
                {presence.status === 'online' ? 'Online' : 'Offline'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg, index) => (
          <div
            key={msg.id || index}
            className={`flex ${msg.sender_id === (chatType === 'dispatcher_driver' ? 'dispatcher' : `driver_${currentUser.id}`) ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                msg.sender_id === (chatType === 'dispatcher_driver' ? 'dispatcher' : `driver_${currentUser.id}`)
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-200'
              }`}
            >
              <p className="text-sm">{msg.message}</p>
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs opacity-70">
                  {formatTime(msg.timestamp)}
                </p>
                {msg.status && (
                  <p className="text-xs opacity-70">
                    {msg.status === 'sending' ? '⏳' :
                     msg.status === 'sent' ? '✓' :
                     msg.status === 'delivered' ? '✓✓' :
                     msg.status === 'failed' ? '❌' :
                     msg.status === 'queued' ? '📱' :
                     msg.read ? '👁️' : ''}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* Typing indicators */}
        {typingUsers.length > 0 && (
          <div className="flex justify-start">
            <div className="bg-slate-700 text-slate-200 px-4 py-2 rounded-lg max-w-xs lg:max-w-md">
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
                <span className="text-xs opacity-70">
                  {typingUsers.length === 1 ? 'Someone is typing...' : `${typingUsers.length} people are typing...`}
                </span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Message input */}
      <div className="p-4 border-t border-slate-700">
        <div className="flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={handleInputChange}
            onKeyPress={handleKeyPress}
            placeholder="Type a message..."
            className="flex-1 px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={!isConnected}
          />
          <button
            onClick={sendMessage}
            disabled={!newMessage.trim() || !isConnected}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
};

export default Chat;