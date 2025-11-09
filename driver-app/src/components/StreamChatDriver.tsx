import React, { useEffect, useState } from 'react';
import { StreamChat } from 'stream-chat';
import {
  Chat,
  Channel,
  ChannelHeader,
  MessageList,
  MessageInput,
  Thread,
  Window,
} from 'stream-chat-react';
import { supabase } from '../supabaseClient';
import { streamClient, initializeStreamChat, getUserChannels, createDispatcherDriverChannel, createDriverDriverChannel } from '../services/streamChatService.ts';
import 'stream-chat-react/dist/css/v2/index.css';

// Simple notification function for driver app
const notifyDriver = (title: string, body: string) => {
  try {
    // Try to show browser notification
    if ('Notification' in window && Notification.permission === 'granted') {
      const notification = new Notification(title, {
        body,
        icon: '/icon.png',
        badge: '/icon.png',
        requireInteraction: false,
        silent: false,
      });

      // Auto-close after 3 seconds
      setTimeout(() => {
        notification.close();
      }, 3000);
    }

    // Try to vibrate if supported
    if ('vibrate' in navigator) {
      navigator.vibrate([100, 50, 100]);
    }

    // Play a simple beep sound
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.setValueAtTime(600, audioContext.currentTime);
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.15);
    } catch (audioError) {
      // Ignore audio errors
    }
  } catch (error) {
    console.warn('Notification failed:', error);
  }
};

// Mobile detection hook
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
    };

    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);
    return () => window.removeEventListener('resize', checkIsMobile);
  }, []);

  return isMobile;
};

interface StreamChatDriverProps {
  vehicleNumber: number;
  driverName?: string;
  otherDrivers?: any[];
}

export const StreamChatDriver: React.FC<StreamChatDriverProps> = ({
  vehicleNumber,
  driverName,
  otherDrivers = []
}) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [currentChannel, setCurrentChannel] = useState<any>(null);
  const [driverId, setDriverId] = useState<string>('');
  const isMobile = useIsMobile();


  // Request notification permissions on mount
  useEffect(() => {
    const requestPermissions = async () => {
      try {
        if ('Notification' in window && Notification.permission === 'default') {
          await Notification.requestPermission();
        }
      } catch (error) {
        console.warn('Could not request notification permissions:', error);
      }
    };

    requestPermissions();
  }, []);

  // Initialize Stream Chat for driver
  useEffect(() => {
    const initChat = async () => {
      if (!vehicleNumber) return;

      console.log('Stream Chat: Starting initialization for vehicle:', vehicleNumber);

      try {
        const driverUserId = `driver_${vehicleNumber}`;
        setDriverId(driverUserId);

        // Check if Supabase user is authenticated
        console.log('Stream Chat: Checking Supabase authentication...');
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) {
          console.error('Stream Chat: Authentication error:', error);
          return;
        }
        if (!user) {
          console.warn('Stream Chat: User not authenticated, skipping initialization');
          return;
        }
        const userName = user?.user_metadata?.name || user?.email || `Driver ${vehicleNumber}`;
        console.log('Stream Chat: User authenticated:', userName);

        // Initialize with driver user
        console.log('Stream Chat: Calling initializeStreamChat...');
        console.log('Stream Chat: Device info - UserAgent:', navigator.userAgent);
        console.log('Stream Chat: Device info - Is mobile:', /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));

        await initializeStreamChat(driverUserId, {
          name: userName,
          role: 'driver',
          vehicleId: vehicleNumber
        });
        setIsInitialized(true);
        console.log('Stream Chat initialized for driver:', driverUserId);
      } catch (error) {
        console.error('Failed to initialize Stream Chat for driver:', error);
        console.error('Stream Chat error details:', {
          message: error.message,
          stack: error.stack,
          name: error.name
        });
        // Don't set initialized state on error to allow retry
      }
    };

    initChat();

    return () => {
      if (streamClient.user) {
        streamClient.disconnectUser().catch(error =>
          console.warn('Error disconnecting Stream Chat:', error)
        );
      }
    };
  }, [vehicleNumber]); // Only depend on vehicleNumber to prevent excessive re-initialization

  // Create channels when initialized
  useEffect(() => {
    if (!isInitialized || !driverId || !vehicleNumber) return;

    const createChannels = async () => {
      try {
        // Ensure client is connected before creating channels
        if (!streamClient.user || !streamClient.userID) {
          console.warn('Stream Chat client not connected, skipping channel creation');
          return;
        }

        // Create dispatcher channel
        await createDispatcherDriverChannel('dispatcher', vehicleNumber.toString());
        console.log('Dispatcher-driver channel created/verified');

        // Create driver-to-driver channels with other drivers
        if (otherDrivers.length > 0) {
          for (const otherDriver of otherDrivers) {
            try {
              await createDriverDriverChannel(vehicleNumber.toString(), otherDriver.id.toString());
              console.log(`Driver-to-driver channel created with driver ${otherDriver.id}`);
            } catch (error) {
              console.warn(`Driver-to-driver channel creation failed for driver ${otherDriver.id} (might already exist):`, error);
            }
          }
        }
      } catch (error) {
        console.warn('Channel creation failed:', error);
      }
    };

    createChannels();
   }, [isInitialized, driverId, vehicleNumber]); // Removed otherDrivers dependency to prevent excessive re-creation

  // Listen for new messages and show notifications
  useEffect(() => {
    if (!isInitialized || !driverId) return;

    const handleNewMessage = (event: any) => {
      // Only show notification if the message is not from the current user
      if (event.message?.user?.id !== streamClient.userID) {
        const channel = event.channel;
        const senderName = event.message.user?.name || 'Neznámý uživatel';
        const channelName = getChannelDisplayName(channel);

        // Show notification for new messages
        notifyDriver(
          `Nová zpráva od ${senderName}`,
          `V chatu ${channelName}: ${event.message.text?.substring(0, 50)}${event.message.text?.length > 50 ? '...' : ''}`
        );

        console.log('New message notification shown for driver:', {
          sender: senderName,
          channel: channelName,
          message: event.message.text
        });
      }
    };

    streamClient.on('message.new', handleNewMessage);

    return () => {
      streamClient.off('message.new', handleNewMessage);
    };
  }, [isInitialized, driverId, vehicleNumber, otherDrivers]);

  // Channel dropdown component for mobile
  const ChannelDropdown = () => {
    const [channels, setChannels] = useState<any[]>([]);
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
      if (!isInitialized || !driverId) return;

      const loadChannels = async () => {
        try {
          const userChannels = await getUserChannels(driverId);
          // Sort channels: dispatcher first, then driver-to-driver
          const sortedChannels = userChannels.sort((a, b) => {
            const aIsDispatcher = a.id.includes('dispatcher-driver');
            const bIsDispatcher = b.id.includes('dispatcher-driver');
            if (aIsDispatcher && !bIsDispatcher) return -1;
            if (!aIsDispatcher && bIsDispatcher) return 1;
            return 0;
          });
          setChannels(sortedChannels);
        } catch (error) {
          console.error('Error loading channels for driver:', error);
        }
      };

      loadChannels();
    }, [isInitialized, driverId, vehicleNumber, otherDrivers]);

    const getChannelDisplayName = (channel: any) => {
      if (channel.id.includes('dispatcher-driver')) {
        return 'Dispečer';
      } else if (channel.id.includes('driver-driver')) {
        // Extract the other driver's ID
        const match = channel.id.match(/driver-driver-(\d+)-(\d+)/);
        if (match) {
          const driver1 = parseInt(match[1]);
          const driver2 = parseInt(match[2]);
          const otherDriverId = driver1 === vehicleNumber ? driver2 : driver1;
          const otherDriver = otherDrivers.find(d => d.id === otherDriverId);
          return otherDriver ? otherDriver.name : `Řidič ${otherDriverId}`;
        }
      }
      return channel.id;
    };

    const getChannelIcon = (channel: any) => {
      if (channel.id.includes('dispatcher-driver')) {
        return (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        );
      } else {
        return (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      }
    };

    const handleChannelSelect = (channel: any) => {
      setCurrentChannel(channel);
      setIsOpen(false);
    };

    return (
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors text-sm"
          title="Vybrat chat"
        >
          <span className="truncate max-w-32">
            {currentChannel ? getChannelDisplayName(currentChannel) : 'Vyberte chat'}
          </span>
          <svg
            className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setIsOpen(false)}
            />
            <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-lg z-20 max-h-60 overflow-y-auto">
              {channels.length > 0 ? (
                <div className="py-1">
                  {channels.map(channel => (
                    <div
                      key={channel.id}
                      onClick={() => handleChannelSelect(channel)}
                      className={`px-3 py-2 cursor-pointer transition-colors ${
                        currentChannel?.id === channel.id
                          ? 'bg-cyan-400 text-slate-900'
                          : 'hover:bg-slate-700 text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${
                          currentChannel?.id === channel.id ? 'bg-slate-900' : 'bg-green-400'
                        }`}></div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {getChannelDisplayName(channel)}
                          </div>
                        </div>
                        <div className="flex-shrink-0">
                          {getChannelIcon(channel)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-3 py-2 text-center text-slate-500 text-sm">
                  Načítání...
                </div>
              )}
            </div>
          </>
        )}
      </div>
    );
  };

  // Compact ChannelList component for drivers (desktop)
  const CompactChannelList = () => {
    const [channels, setChannels] = useState<any[]>([]);

    useEffect(() => {
      if (!isInitialized || !driverId) return;

      const loadChannels = async () => {
        try {
          const userChannels = await getUserChannels(driverId);
          // Sort channels: dispatcher first, then driver-to-driver
          const sortedChannels = userChannels.sort((a, b) => {
            const aIsDispatcher = a.id.includes('dispatcher-driver');
            const bIsDispatcher = b.id.includes('dispatcher-driver');
            if (aIsDispatcher && !bIsDispatcher) return -1;
            if (!aIsDispatcher && bIsDispatcher) return 1;
            return 0;
          });
          setChannels(sortedChannels);
        } catch (error) {
          console.error('Error loading channels for driver:', error);
        }
      };

      loadChannels();
    }, [isInitialized, driverId, vehicleNumber, otherDrivers]);

    const getChannelDisplayName = (channel: any) => {
      if (channel.id.includes('dispatcher-driver')) {
        return 'Dispečer';
      } else if (channel.id.includes('driver-driver')) {
        // Extract the other driver's ID
        const match = channel.id.match(/driver-driver-(\d+)-(\d+)/);
        if (match) {
          const driver1 = parseInt(match[1]);
          const driver2 = parseInt(match[2]);
          const otherDriverId = driver1 === vehicleNumber ? driver2 : driver1;
          const otherDriver = otherDrivers.find(d => d.id === otherDriverId);
          return otherDriver ? otherDriver.name : `Řidič ${otherDriverId}`;
        }
      }
      return channel.id;
    };

    const getChannelIcon = (channel: any) => {
      if (channel.id.includes('dispatcher-driver')) {
        return (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        );
      } else {
        return (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      }
    };

    return (
      <div className="w-32 flex flex-col bg-slate-900/30 rounded-lg min-h-0 border-r border-slate-700/50">
        <div className="flex-1 overflow-y-auto">
          <div className="p-2">
            <h5 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2 px-1">
              Chaty
            </h5>
          </div>
          {channels.length > 0 ? (
            <div className="space-y-1">
              {channels.map(channel => (
                <div
                  key={channel.id}
                  onClick={() => setCurrentChannel(channel)}
                  className={`mx-1 px-2 py-2 rounded-lg cursor-pointer transition-all duration-200 ${
                    currentChannel?.id === channel.id
                      ? 'bg-cyan-400 text-slate-900 shadow-md'
                      : 'hover:bg-slate-700/50 text-white'
                  }`}
                  title={getChannelDisplayName(channel)}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${
                      currentChannel?.id === channel.id ? 'bg-slate-900' : 'bg-green-400'
                    }`}></div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">
                        {getChannelDisplayName(channel)}
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      {getChannelIcon(channel)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 text-center text-slate-500 text-xs">
              Načítání...
            </div>
          )}
        </div>
      </div>
    );
  };

  // Debug logging for mobile troubleshooting
  console.log('StreamChatDriver render state:', {
    isInitialized,
    hasUser: !!streamClient.user,
    userID: streamClient.userID,
    userAgent: navigator.userAgent,
    isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  });

  if (!isInitialized || !streamClient.user || !streamClient.userID) {
    return (
      <div className="bg-slate-800 p-3 rounded-lg shadow-2xl flex flex-col h-full">
        <div className="flex items-center justify-center h-full">
          <div className="text-center text-slate-400">
            <p>Načítání chatu...</p>
            <p className="text-xs mt-2">Připojování k Stream Chat</p>
            <p className="text-xs mt-1 text-slate-500">
              Initialized: {isInitialized ? '✓' : '✗'} |
              User: {streamClient.user ? '✓' : '✗'} |
              UserID: {streamClient.userID || 'none'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-3 rounded-lg shadow-2xl flex flex-col bg-slate-800 ${isMobile ? 'h-[85vh]' : 'h-full'}`}>
       <div className="flex-shrink-0 mb-4">
         <div className="flex items-center justify-between">
           <h3 className="text-sm font-semibold text-white flex items-center">
             <div className="w-6 h-6 bg-[#8FBCBB]/80 rounded-lg flex items-center justify-center mr-2 relative">
               <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
               </svg>
             </div>
             Chat
           </h3>
           {isMobile && <ChannelDropdown />}
         </div>
       </div>

      <Chat client={streamClient} theme="str-chat__theme-dark">
        <div className="flex-1 flex gap-2 min-h-0">
           {/* Channel list - desktop only */}
           {!isMobile && <CompactChannelList />}

           {/* Main chat area */}
           <div className="flex-1 bg-slate-900/50 rounded-lg flex flex-col min-h-0">
            {currentChannel ? (
              <Channel channel={currentChannel}>
                <Window>
                  <ChannelHeader />
                  <MessageList />
                  <MessageInput />
                </Window>
                <Thread />
              </Channel>
            ) : (
              <div className="flex-1 flex items-center justify-center p-6">
                <div className="text-center text-slate-400 max-w-sm">
                  <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-slate-800 to-slate-700 rounded-2xl flex items-center justify-center shadow-lg">
                    <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                <h3 className="text-xl font-semibold text-white mb-2">Vyberte chat</h3>
                <p className="text-sm leading-relaxed mb-4">
                  {isMobile
                    ? 'Použijte rozbalovací menu pro výběr chatu.'
                    : 'Klikněte na chat v seznamu vlevo pro zahájení konverzace s dispečerem nebo jinými řidiči.'
                  }
                </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </Chat>
    </div>
  );
};
