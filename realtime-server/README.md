# ShamanRide Real-time Server

Socket.io-based real-time server for ShamanRide chat and ride synchronization.

## Features

- **Real-time Chat**: Private dispatcher-driver chats, driver-driver chats, and group shift chats
- **Ride Synchronization**: Live ride updates, status changes, cancellations, and GPS tracking
- **JWT Authentication**: Secure socket connections using Supabase JWT tokens
- **Supabase Persistence**: All messages and ride updates are stored in Supabase asynchronously

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set environment variables:
```bash
cp .env.example .env
# Edit .env with your Supabase credentials
```

3. Start the server:
```bash
npm start
```

## Environment Variables

- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_ANON_KEY`: Your Supabase anon key
- `SUPABASE_SERVICE_KEY`: Your Supabase service key (for server-side operations)
- `PORT`: Server port (default: 3000)

## Deployment to Render.com

1. Connect your GitHub repository
2. Set the root directory to `realtime-server`
3. Set build command to `npm install`
4. Set start command to `npm start`
5. Add environment variables in Render dashboard:
   - `SUPABASE_URL`: Your Supabase project URL
   - `SUPABASE_ANON_KEY`: Your Supabase anon key
   - `SUPABASE_SERVICE_KEY`: Your Supabase service key (for server-side operations)
   - `PORT`: 10000 (Render.com default)

6. Update CORS origins in server.js with your deployed app URLs before deployment

## API

### Socket Events

#### Chat Events
- `join_chat_dispatcher_driver`: Join private dispatcher-driver chat
- `join_chat_driver_driver`: Join driver-driver chat
- `join_group_chat`: Join shift group chat
- `message`: Send chat message
- `new_message`: Receive chat message

#### Ride Events
- `join_shift`: Join shift room for ride updates
- `ride_update`: Send ride update
- `ride_updated`: Receive ride update
- `status_change`: Send status change
- `status_changed`: Receive status change
- `ride_cancelled`: Receive ride cancellation
- `position_update`: Send GPS position
- `position_updated`: Receive GPS position

## Architecture

- **Authentication**: JWT tokens from Supabase
- **Rooms**: Isolated communication channels
- **Persistence**: Async saves to Supabase
- **Real-time**: WebSocket connections via Socket.io