import { StreamChat } from 'stream-chat';

// Stream Chat configuration
const STREAM_API_KEY = import.meta.env.VITE_STREAM_API_KEY || 'your-stream-api-key';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

console.log('Stream Chat: Environment check - STREAM_API_KEY:', STREAM_API_KEY ? 'set' : 'not set');
console.log('Stream Chat: Environment check - API_BASE_URL:', API_BASE_URL || 'empty');

if (!STREAM_API_KEY || STREAM_API_KEY === 'your-stream-api-key') {
  console.error('Stream Chat: VITE_STREAM_API_KEY is not properly set!');
}

if (!API_BASE_URL) {
  console.error('Stream Chat: VITE_API_BASE_URL is not set! API calls will fail.');
}

// Initialize Stream Chat client
export const streamClient = StreamChat.getInstance(STREAM_API_KEY);

// User management functions
export const createStreamUser = async (userId: string, userData: any) => {
  try {
    // Create or update user via server endpoint
    const response = await fetch(`${API_BASE_URL}/api/stream-chat-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        userData: {
          name: userData.name || userData.email || userId,
          ...userData
        }
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create user: ${response.statusText}`);
    }

    console.log(`Stream user created/updated: ${userId}`);
  } catch (error) {
    console.error('Error creating Stream user:', error);
    throw error;
  }
};

export const connectStreamUser = async (userId: string, userToken: string) => {
  try {
    // Check if already connected to avoid multiple connectUser calls
    if (streamClient.user && streamClient.userID === userId) {
      console.log(`Stream user already connected: ${userId}`);
      return;
    }

    await streamClient.connectUser(
      {
        id: userId,
      },
      userToken
    );
    console.log(`Stream user connected: ${userId}`);
  } catch (error) {
    console.error('Error connecting Stream user:', error);
    throw error;
  }
};

export const disconnectStreamUser = async () => {
  try {
    await streamClient.disconnectUser();
    console.log('Stream user disconnected');
  } catch (error) {
    console.error('Error disconnecting Stream user:', error);
  }
};

// Channel management functions
export const createDispatcherDriverChannel = async (dispatcherId: string, driverId: string) => {
  try {
    // Ensure client is connected
    if (!streamClient.user || !streamClient.userID) {
      throw new Error('Stream Chat client not connected');
    }

    const driverUserId = `driver_${driverId}`;

    // Create the dispatcher user if it doesn't exist
    await createStreamUser(dispatcherId, {
      name: 'Dispatcher',
      role: 'dispatcher',
    });

    // Create the driver user if it doesn't exist
    await createStreamUser(driverUserId, {
      name: `Driver ${driverId}`,
      role: 'driver',
    });

    const channelId = `dispatcher-driver-${driverId}`;
    const channel = streamClient.channel('messaging', channelId, {
      members: [dispatcherId, driverUserId],
    });

    await channel.create();
    console.log(`Created channel: ${channelId}`);
    return channel;
  } catch (error) {
    console.error('Error creating dispatcher-driver channel:', error);
    throw error;
  }
};

export const createDriverDriverChannel = async (driverId1: string, driverId2: string) => {
  try {
    // Ensure client is connected
    if (!streamClient.user || !streamClient.userID) {
      throw new Error('Stream Chat client not connected');
    }

    const driverUserId1 = `driver_${driverId1}`;
    const driverUserId2 = `driver_${driverId2}`;

    // Create both driver users if they don't exist
    await createStreamUser(driverUserId1, {
      name: `Driver ${driverId1}`,
      role: 'driver',
    });

    await createStreamUser(driverUserId2, {
      name: `Driver ${driverId2}`,
      role: 'driver',
    });

    // Create channel with sorted IDs to ensure consistent channel names
    const sortedIds = [driverId1, driverId2].sort();
    const channelId = `driver-driver-${sortedIds[0]}-${sortedIds[1]}`;
    const channel = streamClient.channel('messaging', channelId, {
      members: [driverUserId1, driverUserId2],
    });

    await channel.create();
    console.log(`Created driver-to-driver channel: ${channelId}`);
    return channel;
  } catch (error) {
    console.error('Error creating driver-to-driver channel:', error);
    throw error;
  }
};

export const createShiftChannel = async (shiftId: string, dispatcherId: string) => {
  try {
    // Create the dispatcher user if it doesn't exist
    await createStreamUser(dispatcherId, {
      name: 'Dispatcher',
      role: 'dispatcher',
    });

    const channelId = `dispatcher-shift-${shiftId}`;
    const channel = streamClient.channel('messaging', channelId, {
      members: [dispatcherId],
    });

    await channel.create();
    console.log(`Created shift channel: ${channelId}`);
    return channel;
  } catch (error) {
    console.error('Error creating shift channel:', error);
    throw error;
  }
};

export const getUserChannels = async (userId: string) => {
  try {
    // Ensure client is connected before querying channels
    if (!streamClient.user || !streamClient.userID) {
      console.warn('Stream Chat client not connected, cannot query channels');
      return [];
    }

    const filter = {
      members: { $in: [userId] }
    };

    const sort = [{ last_message_at: -1 }];
    const channels = await streamClient.queryChannels(filter, sort, {
      limit: 20,
      state: true,
      watch: true,
    });

    console.log(`Found ${channels.length} channels for user ${userId}`);
    return channels;
  } catch (error) {
    console.error('Error querying user channels:', error);
    return [];
  }
};

// Token generation (server-side only - this would typically be done on your backend)
export const generateStreamToken = async (userId: string): Promise<string> => {
  try {
    console.log('Stream Chat: Generating token for userId:', userId);
    console.log('Stream Chat: API_BASE_URL:', API_BASE_URL);
    console.log('Stream Chat: STREAM_API_KEY:', STREAM_API_KEY ? 'set' : 'not set');

    if (!API_BASE_URL) {
      throw new Error('API_BASE_URL is not configured. Set VITE_API_BASE_URL environment variable.');
    }

    const response = await fetch(`${API_BASE_URL}/api/stream-chat-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId }),
    });

    console.log('Stream Chat: Token response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Stream Chat: Token response error:', errorText);
      throw new Error(`Failed to generate token: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Stream Chat: Token generated successfully');
    return data.token;
  } catch (error) {
    console.error('Error fetching Stream Chat token:', error);
    throw error;
  }
};

// Initialize Stream Chat for current user
export const initializeStreamChat = async (userId: string, userData?: any) => {
  try {
    console.log('Stream Chat: initializeStreamChat called for userId:', userId);

    // Check if already connected
    if (streamClient.user && streamClient.userID === userId) {
      console.log('Stream Chat already connected, skipping initialization');
      return userId;
    }

    // Sync user data
    if (userData) {
      console.log('Stream Chat: Creating/updating user data...');
      await createStreamUser(userId, userData);
    }

    // Generate token (in production, this should come from your backend)
    console.log('Stream Chat: Generating token...');
    const token = await generateStreamToken(userId);

    // Connect user
    console.log('Stream Chat: Connecting user...');
    await connectStreamUser(userId, token);

    console.log('Stream Chat initialized successfully');
    return userId;
  } catch (error) {
    console.error('Error initializing Stream Chat:', error);
    throw error;
  }
};
