# ShamanRide Stabilization Plan

## Goal
Bring the dispatcher and driver PWA from prototype state to a reliable internal MVP for live taxi dispatch.

## MVP Scope
- Dispatcher creates a ride with customer and route details.
- System assigns or suggests the best vehicle using current driver GPS location when available.
- Driver receives the ride in the PWA, can accept, start, complete, or cancel it.
- Dispatcher sees ride status and driver position on the map.
- Driver sees shift earnings and cash totals.
- SMS remains as fallback communication for drivers and customers.

## Stabilization Priorities
1. Security and configuration
   - Never expose Supabase service-role keys in browser bundles.
   - Move GPS/SMS credentials to environment variables.
   - Keep one authoritative backend/realtime path.

2. Build and type safety
   - Make `npm run build` and `tsc --noEmit` pass for both apps.
   - Remove dead server variants after the working runtime is confirmed.

3. Dispatch flow
   - Use live GPS locations for automatic assignment before falling back to stored vehicle locations.
   - Persist every ride transition through a single service path.
   - Keep dispatcher and driver state synchronized.

4. Driver GPS
   - Add `watchPosition` in the PWA while a shift is active.
   - Store location updates in Supabase and queue them offline.
   - Refresh dispatcher map from live location data.

5. Push-to-talk radio
   - Replace old text chat with a "radio" module after MVP dispatch is stable.
   - Prefer push-to-talk with short live audio rooms for active shift users.
   - Keep SMS as fallback for missed or offline communication.

## Radio Direction
The old chat should not be revived as the main driver communication. Driving favors voice. The practical next design is:
- A dispatcher-to-all-drivers channel.
- Optional dispatcher-to-one-driver channel.
- Push-to-talk button with clear pressed/listening states.
- Later: recorded short voice notes when live audio is unavailable.

## Done Criteria For MVP
- Clean build and typecheck.
- No service secrets in frontend bundles.
- A ride can move through `PENDING -> ACCEPTED -> IN_PROGRESS -> COMPLETED`.
- Driver GPS appears on the dispatcher map within a short polling/realtime interval.
- Manual SMS fallback works without crashing the backend.

## Web Push Setup
Server-side Web Push requires these environment variables:
- `VITE_VAPID_PUBLIC_KEY` for the driver PWA build.
- `VAPID_PUBLIC_KEY` for API/realtime servers. Use the same value as `VITE_VAPID_PUBLIC_KEY`.
- `VAPID_PRIVATE_KEY` for API/realtime servers only.
- `VAPID_SUBJECT`, for example `mailto:dispatch@example.com`.

Generate keys with:

```bash
npm run push:vapid
```

Run `database/push_subscriptions.sql` in Supabase before enabling Web Push in production.
