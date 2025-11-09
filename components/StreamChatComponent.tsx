import React, { useEffect, useState, useCallback } from 'react';
import { StreamChat } from 'stream-chat';
import {
  Chat,
  Channel,
  ChannelHeader,
  ChannelList,
  MessageList,
  MessageInput,
  Thread,
  Window,
} from 'stream-chat-react';
import { Person, Vehicle, VehicleStatus } from '../types';
import { useTranslation } from '../contexts/LanguageContext';
import { streamClient, initializeStreamChat, createDispatcherDriverChannel, createShiftChannel, getUserChannels } from '../services/streamChatService';
import { notifyUser } from '../services/notifications';
import 'stream-chat-react/dist/css/v2/index.css';

// Error boundary for Chat component
class ChatErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Stream Chat Error Boundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-slate-800 p-3 rounded-lg shadow-2xl flex flex-col h-full">
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-slate-400">
              <div className="w-12 h-12 mx-auto mb-4 bg-red-500/20 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <p className="text-red-400 font-medium">Chyba chat komponenty</p>
              <p className="text-xs mt-2 text-slate-500 max-w-xs mx-auto">
                {this.state.error?.message || 'Nastala chyba při vykreslování chatu'}
              </p>
              <button
                onClick={() => window.location.reload()}
                className="mt-4 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm rounded-lg transition-colors"
              >
                Restartovat aplikaci
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

interface StreamChatComponentProps {
  vehicles: Vehicle[];
  people: Person[];
  onChannelSelect: (channel: any) => void;
  selectedChannelId?: string;
  refreshTrigger?: number; // Optional trigger to refresh channels
}

// Custom ChannelList component - moved outside to prevent re-creation
const CustomChannelList: React.FC<{
  isInitialized: boolean;
  currentChannel: any;
  setCurrentChannel: (channel: any) => void;
  vehicles: Vehicle[];
  getChannelDisplayName: (channel: any) => string;
  refreshTrigger?: number;
}> = ({ isInitialized, currentChannel, setCurrentChannel, vehicles, getChannelDisplayName, refreshTrigger }) => {
  const [channels, setChannels] = useState<any[]>([]);
  const [isLoadingChannels, setIsLoadingChannels] = useState(false);

  const loadChannels = useCallback(async (retryCount = 0) => {
    // Prevent multiple simultaneous calls
    if (isLoadingChannels) return;

    // Ensure Stream Chat client is connected before loading channels
    if (!streamClient.user || !streamClient.userID) {
      console.warn('Stream Chat client not connected, skipping channel loading');
      // If not connected and we haven't retried too many times, wait and retry
      if (retryCount < 3) {
        setTimeout(() => loadChannels(retryCount + 1), 2000);
      }
      return;
    }

    setIsLoadingChannels(true);
    try {
      // Small delay to avoid immediate rate limiting after initialization
      await new Promise(resolve => setTimeout(resolve, 500));
      const userChannels = await getUserChannels('dispatcher');
      setChannels(userChannels);
    } catch (error) {
      console.error('Error loading channels:', error);
      // Retry once on error, but not too aggressively
      if (retryCount === 0) {
        setTimeout(() => loadChannels(1), 3000);
      }
      // Don't set channels to empty array on error to prevent flashing
    } finally {
      setIsLoadingChannels(false);
    }
  }, [isLoadingChannels]);

  useEffect(() => {
    if (!isInitialized) return;
    loadChannels();
  }, [isInitialized, loadChannels]);

  // Periodic refresh of channels to catch newly created channels
  useEffect(() => {
    if (!isInitialized) return;

    const interval = setInterval(() => {
      loadChannels();
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [isInitialized, loadChannels]);

  // Manual refresh trigger
  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      loadChannels();
    }
  }, [refreshTrigger, loadChannels]);

  return (
    <div className="w-48 flex flex-col bg-slate-900/30 rounded-lg min-h-0">
      <div className="flex-1 overflow-y-auto">
        <div className="p-2">
          <h5 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2 px-1">
            Aktivní chaty ({channels.length})
          </h5>
        </div>
        {channels.length > 0 ? (
          <div className="space-y-1">
            {channels.map(channel => (
              <div
                key={channel.id}
                onClick={() => setCurrentChannel(channel)}
                className={`mx-2 px-3 py-2 rounded-lg cursor-pointer transition-all duration-200 ${
                  currentChannel?.id === channel.id
                    ? 'bg-cyan-400 text-slate-900 shadow-md'
                    : 'hover:bg-slate-700/50 text-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full bg-blue-400`}></div>
                      <div className="text-sm font-medium truncate">
                        {getChannelDisplayName(channel)}
                      </div>
                    </div>
                    {channel.state?.last_message_at && (
                      <div className={`text-xs mt-1 text-slate-500`}>
                        {new Date(channel.state.last_message_at).toLocaleTimeString('cs-CZ', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4 text-center text-slate-500 text-sm">
            Načítání chatů...
          </div>
        )}
      </div>
    </div>
  );
};

export const StreamChatComponent: React.FC<StreamChatComponentProps> = ({
  vehicles,
  people,
  onChannelSelect,
  selectedChannelId,
  refreshTrigger,
}) => {
  const { t } = useTranslation();
  const [isInitialized, setIsInitialized] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [currentChannel, setCurrentChannel] = useState<any>(null);

  const getChannelDisplayName = (channel: any): string => {
    // First try to get the channel name from data
    if (channel.data?.name) {
      return channel.data.name;
    }

    // Fallback: try to extract vehicle ID from channel ID and get vehicle name
    const channelIdMatch = channel.id.match(/dispatcher-driver-(\d+)/);
    if (channelIdMatch) {
      const vehicleId = parseInt(channelIdMatch[1]);
      const vehicle = vehicles.find(v => v.id === vehicleId);
      if (vehicle) {
        return vehicle.name || vehicle.licensePlate || `Vozidlo ${vehicleId}`;
      }
    }

    // Final fallback: use channel ID
    return channel.id;
  };

  const getStatusDotClass = (status: VehicleStatus) => {
    switch (status) {
      case VehicleStatus.Available: return 'bg-green-500';
      case VehicleStatus.Busy: return 'bg-yellow-500';
      case VehicleStatus.Break: return 'bg-orange-500';
      case VehicleStatus.OutOfService: return 'bg-red-500';
      case VehicleStatus.NotDrivingToday: return 'bg-sky-500';
      default: return 'bg-gray-500';
    }
  };

  // Initialize Stream Chat
  useEffect(() => {
    const initChat = async () => {
      try {
        setConnectionError(null);
        await initializeStreamChat();
        setIsInitialized(true);
        console.log('Stream Chat initialized in component');
      } catch (error) {
        console.error('Failed to initialize Stream Chat:', error);
        setConnectionError(error instanceof Error ? error.message : 'Failed to connect to Stream Chat');
        setIsInitialized(false);
      }
    };

    initChat();

    // Handle page unload
    const handleBeforeUnload = () => {
      streamClient.disconnectUser();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // Monitor connection state and reload channels when connected
  useEffect(() => {
    const handleConnectionChange = (event: any) => {
      if (event.type === 'connection.changed') {
        if (event.online) {
          console.log('Stream Chat connected');
          setConnectionError(null);
          // Note: CustomChannelList handles its own channel reloading
        } else {
          console.log('Stream Chat disconnected');
          setConnectionError('Connection lost');
        }
      }
    };

    streamClient.on('connection.changed', handleConnectionChange);

    return () => {
      streamClient.off('connection.changed', handleConnectionChange);
    };
  }, []);

  // Listen for new messages and show notifications
  useEffect(() => {
    if (!isInitialized) return;

    const handleNewMessage = (event: any) => {
      // Only show notification if the message is not from the current user
      if (event.message?.user?.id !== streamClient.userID) {
        const channel = event.channel;
        const senderName = event.message.user?.name || 'Neznámý uživatel';
        const channelName = getChannelDisplayName(channel);

        // Show notification for new messages
        notifyUser('message', {
          title: `Nová zpráva od ${senderName}`,
          body: `V chatu ${channelName}: ${event.message.text?.substring(0, 50)}${event.message.text?.length > 50 ? '...' : ''}`,
          focusStealing: false, // Don't steal focus for message notifications
        });

        console.log('New message notification shown:', {
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
  }, [isInitialized, vehicles]);

  // Create channels when vehicles are loaded
  useEffect(() => {
    if (!isInitialized || vehicles.length === 0) return;

    const createChannels = async () => {
      try {
        // Create individual driver channels with delays to avoid rate limits
        for (const vehicle of vehicles) {
          try {
            await createDispatcherDriverChannel('dispatcher', vehicle.id.toString(), {
              name: vehicle.name,
              licensePlate: vehicle.licensePlate,
              type: vehicle.type,
              status: vehicle.status
            });
            // Add delay between channel creations to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 200));
          } catch (error) {
            console.warn(`Channel for vehicle ${vehicle.id} might already exist:`, error);
          }
        }

        // Create general shift channel
        const today = new Date().toISOString().split('T')[0];
        try {
          await createShiftChannel(today, 'dispatcher');
        } catch (error) {
          console.warn('Shift channel might already exist:', error);
        }

        console.log('Channels created/verified');
      } catch (error) {
        console.error('Error creating channels:', error);
      }
    };

    createChannels();
  }, [isInitialized, vehicles]);



  if (!isInitialized || connectionError) {
    return (
      <div className="bg-slate-800 p-3 rounded-lg shadow-2xl flex flex-col h-full">
        <div className="flex items-center justify-center h-full">
          <div className="text-center text-slate-400">
            {connectionError ? (
              <>
                <div className="w-12 h-12 mx-auto mb-4 bg-red-500/20 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <p className="text-red-400 font-medium">Chyba připojení k chatu</p>
                <p className="text-xs mt-2 text-slate-500 max-w-xs mx-auto">{connectionError}</p>
                <button
                  onClick={() => window.location.reload()}
                  className="mt-4 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm rounded-lg transition-colors"
                >
                  Zkusit znovu
                </button>
              </>
            ) : (
              <>
                <p>Načítání chatu...</p>
                <p className="text-xs mt-2">Připojování k Stream Chat</p>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Check if client is connected
  if (!streamClient.user || !streamClient.userID) {
    return (
      <div className="bg-slate-800 p-3 rounded-lg shadow-2xl flex flex-col h-full">
        <div className="flex items-center justify-center h-full">
          <div className="text-center text-slate-400">
            <div className="w-12 h-12 mx-auto mb-4 bg-yellow-500/20 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <p className="text-yellow-400 font-medium">Čekání na připojení</p>
            <p className="text-xs mt-2 text-slate-500">Ověřování připojení k Stream Chat...</p>
          </div>
        </div>
      </div>
    );
  }

  // Double-check connection state before rendering Chat component
  if (!streamClient.userID || !streamClient.user) {
    console.error('Stream Chat: Client not properly connected', {
      userID: streamClient.userID,
      user: streamClient.user,
      wsConnection: streamClient.wsConnection
    });
    return (
      <div className="bg-slate-800 p-3 rounded-lg shadow-2xl flex flex-col h-full">
        <div className="flex items-center justify-center h-full">
          <div className="text-center text-slate-400">
            <div className="w-12 h-12 mx-auto mb-4 bg-red-500/20 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <p className="text-red-400 font-medium">Chyba připojení</p>
            <p className="text-xs mt-2 text-slate-500">Klient není správně připojen k Stream Chat</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm rounded-lg transition-colors"
            >
              Restartovat aplikaci
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 rounded-lg shadow-2xl flex flex-col h-full bg-slate-800">
      <div className="flex-shrink-0 mb-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white flex items-center">
            <div className="w-6 h-6 bg-[#8FBCBB]/80 rounded-lg flex items-center justify-center mr-2 relative">
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            Stream Chat s vozidly ({vehicles.length} vozidel)
          </h3>
          <div className="flex items-center gap-3">
            <div className="text-xs text-slate-400">
              {vehicles.filter(v => v.status === 'AVAILABLE').length} dostupných, {vehicles.filter(v => v.status === 'BUSY').length} obsazených
            </div>
          </div>
        </div>
      </div>

      <ChatErrorBoundary>
        <Chat client={streamClient} theme="str-chat__theme-dark">
          <div className="flex-1 flex gap-4 min-h-0">
             <CustomChannelList
               isInitialized={isInitialized}
               currentChannel={currentChannel}
               setCurrentChannel={setCurrentChannel}
               vehicles={vehicles}
               getChannelDisplayName={getChannelDisplayName}
               refreshTrigger={refreshTrigger}
             />

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
                    <p className="text-sm leading-relaxed">
                      Klikněte na vozidlo v seznamu vlevo pro zahájení konverzace s řidičem.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Chat>
      </ChatErrorBoundary>
    </div>
  );
};
