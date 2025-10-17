import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import { supabase } from '../../services/supabaseClient';

const Chat = ({ currentUser, shiftId, chatType, targetId }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const messagesEndRef = useRef(null);

  // Determine room name based on chat type
  const getRoomName = () => {
    if (chatType === 'dispatcher_driver') {
      return `chat:D${currentUser.id}_R${targetId}`;
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

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Initialize socket connection
  useEffect(() => {
    if (!currentUser) return;

    // Get JWT token for authentication
    const getToken = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      return session?.access_token;
    };

    const initSocket = async () => {
      const token = await getToken();

      const socketInstance = io(process.env.REACT_APP_SOCKET_URL || 'http://localhost:3000', {
        auth: { token },
        transports: ['websocket', 'polling']
      });

      socketInstance.on('connect', () => {
        console.log('Connected to chat server');
        setIsConnected(true);

        // Join appropriate room
        const room = getRoomName();
        if (room) {
          if (chatType === 'dispatcher_driver') {
            socketInstance.emit('join_chat_dispatcher_driver', {
              dispatcherId: currentUser.id,
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
      });

      socketInstance.on('disconnect', () => {
        console.log('Disconnected from chat server');
        setIsConnected(false);
      });

      // Listen for new messages
      socketInstance.on('new_message', (messageData) => {
        console.log('Received message:', messageData);
        setMessages(prev => [...prev, messageData]);
      });

      setSocket(socketInstance);
    };

    initSocket();

    return () => {
      if (socket) {
        socket.disconnect();
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
          query = query.or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.driver_${targetId}),and(sender_id.eq.driver_${targetId},receiver_id.eq.${currentUser.id})`);
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
  const sendMessage = () => {
    if (!newMessage.trim() || !socket || !isConnected) return;

    const room = getRoomName();
    if (!room) return;

    const messageData = {
      room,
      message: newMessage.trim(),
      senderId: chatType === 'dispatcher_driver' ? currentUser.id : `driver_${currentUser.id}`,
      receiverId: room,
      type: chatType
    };

    socket.emit('message', messageData);
    setNewMessage('');
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
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`}></div>
          <span className="text-sm text-slate-300">
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg, index) => (
          <div
            key={msg.id || index}
            className={`flex ${msg.sender_id === (chatType === 'dispatcher_driver' ? currentUser.id : `driver_${currentUser.id}`) ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                msg.sender_id === (chatType === 'dispatcher_driver' ? currentUser.id : `driver_${currentUser.id}`)
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-200'
              }`}
            >
              <p className="text-sm">{msg.message}</p>
              <p className="text-xs opacity-70 mt-1">
                {formatTime(msg.timestamp)}
              </p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Message input */}
      <div className="p-4 border-t border-slate-700">
        <div className="flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
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