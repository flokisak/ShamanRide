import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';

const DriverChat: React.FC = () => {
  const [socket, setSocket] = useState<any>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Assuming token is available, perhaps from context or props
    const token = 'your_token_here'; // Replace with actual token retrieval

    const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';
    const socketInstance = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling']
    });

    socketInstance.on('connect', () => {
      setIsConnected(true);
    });

    socketInstance.on('disconnect', () => {
      setIsConnected(false);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  return (
    <div>
      <h1>Driver Chat</h1>
      <p>Connected: {isConnected ? 'Yes' : 'No'}</p>
      {/* Add chat UI here */}
    </div>
  );
};

export default DriverChat;
