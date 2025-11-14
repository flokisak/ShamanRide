import { StreamChat } from 'stream-chat';
import { supabase } from './supabaseClient';

// Stream Chat configuration
const STREAM_API_KEY = import.meta.env.VITE_STREAM_API_KEY || 'your-stream-api-key';
const STREAM_API_SECRET = import.meta.env.VITE_STREAM_API_SECRET || 'your-stream-api-secret';

// Initialize Stream Chat client
export const streamClient = StreamChat.getInstance(STREAM_API_KEY);

// Cache for channel queries to prevent excessive API calls
const channelCache = new Map<string, { channels: any[], timestamp: number }>();
const CACHE_DURATION = 30000; // 30 seconds

// Clear channel cache for a user
const clearChannelCache = (userId: string) => {
  const cacheKey = `channels_${userId}`;
  channelCache.delete(cacheKey);
};

// User management functions
export const createStreamUser = async (userId: string, userData: any, retryCount = 0) => {
  try {
    // Create or update user via server endpoint
    const response = await fetch('/api/stream-chat?action=user', {
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
      if (response.status === 429 && retryCount < 3) {
        // Rate limited, wait and retry
        const retryAfter = response.headers.get('retry-after') || '5';
        const waitTime = parseInt(retryAfter) * 1000;
        console.log(`Rate limited, waiting ${waitTime}ms before retry ${retryCount + 1}`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return createStreamUser(userId, userData, retryCount + 1);
      }
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
export const createDispatcherDriverChannel = async (dispatcherId: string, driverId: string, vehicleData?: any, retryCount = 0) => {
  try {
    const driverUserId = `driver_${driverId}`;

    // Create the dispatcher user if it doesn't exist
    await createStreamUser(dispatcherId, {
      name: 'Dispatcher',
      role: 'dispatcher',
    });

    // Small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 100));

    // Create the driver user with vehicle name/license plate
    const driverName = vehicleData?.name || vehicleData?.licensePlate || `Driver ${driverId}`;
    await createStreamUser(driverUserId, {
      name: driverName,
      role: 'driver',
      ...vehicleData
    });

    // Small delay before channel creation
    await new Promise(resolve => setTimeout(resolve, 100));

    const channelId = `dispatcher-driver-${driverId}`;

    // Check if channel already exists and update its name if needed
    try {
      const existingChannel = streamClient.channel('messaging', channelId);
      await existingChannel.watch();

      // Update channel name if it's different
      if ((existingChannel.data as any)?.name !== driverName) {
        await existingChannel.update({
          name: driverName
        } as any);
        console.log(`Updated existing channel: ${channelId} with name: ${driverName}`);
      }

      // Clear cache for both users
      clearChannelCache(dispatcherId);
      clearChannelCache(driverUserId);

      return existingChannel;
    } catch (error) {
      // Channel doesn't exist, create it
      console.log(`Channel ${channelId} doesn't exist, creating new one`);
    }

    const channel = streamClient.channel('messaging', channelId, {
      name: driverName,
      members: [dispatcherId, driverUserId],
    } as any);

    await channel.create();
    console.log(`Created channel: ${channelId} with name: ${driverName}`);

    // Clear cache for both users
    clearChannelCache(dispatcherId);
    clearChannelCache(driverUserId);

    return channel;
  } catch (error: any) {
    if (error?.response?.status === 429 && retryCount < 3) {
      // Rate limited, wait and retry
      const retryAfter = error.response.headers?.['retry-after'] || '5';
      const waitTime = parseInt(retryAfter) * 1000;
      console.log(`Channel creation rate limited, waiting ${waitTime}ms before retry ${retryCount + 1}`);
      return createDispatcherDriverChannel(dispatcherId, driverId, vehicleData, retryCount + 1);
    }
    console.error('Error creating dispatcher-driver channel:', error);
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
      members: [dispatcherId], // Dispatcher starts, drivers can be added later
    });

    await channel.create();
    console.log(`Created shift channel: ${channelId}`);
    return channel;
  } catch (error) {
    console.error('Error creating shift channel:', error);
    throw error;
  }
};

export const addDriverToShiftChannel = async (shiftId: string, driverId: string) => {
  try {
    const channelId = `dispatcher-shift-${shiftId}`;
    const channel = streamClient.channel('messaging', channelId);

    await channel.addMembers([`driver_${driverId}`]);
    console.log(`Added driver ${driverId} to shift channel ${shiftId}`);
  } catch (error) {
    console.error('Error adding driver to shift channel:', error);
  }
};

export const getUserChannels = async (userId: string, retryCount = 0) => {
  // Check cache first
  const cacheKey = `channels_${userId}`;
  const cached = channelCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log(`Using cached channels for user ${userId}: ${cached.channels.length} channels`);
    return cached.channels;
  }

  try {
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

    // Cache the result
    channelCache.set(cacheKey, { channels, timestamp: Date.now() });

    return channels;
  } catch (error: any) {
    if (error?.response?.status === 429 && retryCount < 3) {
      // Rate limited, wait and retry
      const retryAfter = error.response.headers?.['retry-after'] || '5';
      const waitTime = parseInt(retryAfter) * 1000;
      console.log(`Channel query rate limited, waiting ${waitTime}ms before retry ${retryCount + 1}`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return getUserChannels(userId, retryCount + 1);
    }
    console.error('Error querying user channels:', error);

    // Return cached data if available, even if stale, to prevent flashing
    if (cached) {
      console.log(`Returning stale cached channels due to error: ${cached.channels.length} channels`);
      return cached.channels;
    }

    return [];
  }
};

// Token generation (server-side only - this would typically be done on your backend)
export const generateStreamToken = async (userId: string): Promise<string> => {
  try {
    const response = await fetch('/api/stream-chat?action=token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId }),
    });

    if (!response.ok) {
      throw new Error(`Failed to generate token: ${response.statusText}`);
    }

    const data = await response.json();
    return data.token;
  } catch (error) {
    console.error('Error fetching Stream Chat token:', error);
    throw error;
  }
};

// Sync Supabase users with Stream Chat
export const syncSupabaseUserToStream = async (supabaseUser: any) => {
  try {
    const streamUserData = {
      id: supabaseUser.id,
      name: supabaseUser.user_metadata?.name || supabaseUser.email || supabaseUser.id,
      email: supabaseUser.email,
      role: 'dispatcher', // Default role, can be extended
    };

    await createStreamUser(supabaseUser.id, streamUserData);
    return streamUserData;
  } catch (error) {
    console.error('Error syncing Supabase user to Stream:', error);
    throw error;
  }
};

// Initialize Stream Chat for current user
export const initializeStreamChat = async () => {
  try {
    // Check if already connected
    if (streamClient.user && streamClient.userID) {
      console.log('Stream Chat already connected, skipping initialization');
      return streamClient.userID;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('No authenticated user found');
    }

    // Generate token (in production, this should come from your backend)
    const token = await generateStreamToken(user.id);

    // Connect user first
    await connectStreamUser(user.id, token);

    // Then sync user data after connection
    await syncSupabaseUserToStream(user);

    console.log('Stream Chat initialized successfully');
    return user.id;
  } catch (error) {
    console.error('Error initializing Stream Chat:', error);
    throw error;
  }
};
