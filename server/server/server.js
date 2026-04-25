"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = require("dotenv");
const path_1 = require("path");
// Load environment variables from parent directory FIRST
dotenv_1.default.config({ path: path_1.default.join(process.cwd(), '..', '.env') });
const express_1 = require("express");
const cors_1 = require("cors");
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const stream_chat_1 = require("stream-chat");
const smsService_1 = require("../services/smsService");
// Load config from config.json if exists, else .env
let config = {};
const configPath = path_1.default.join(process.cwd(), 'config.json');
if (fs_1.default.existsSync(configPath)) {
    try {
        config = JSON.parse(fs_1.default.readFileSync(configPath, 'utf8'));
    }
    catch (err) {
        console.warn('Failed to load config.json:', err);
    }
}
else {
    dotenv_1.default.config();
    config = {
        ASG_USERNAME: process.env.ASG_USERNAME,
        ASG_PASSWORD: process.env.ASG_PASSWORD,
        ASG_SERVER: process.env.ASG_SERVER,
        SMS_SERVER: process.env.SMS_SERVER,
        SMS_USERNAME: process.env.SMS_USERNAME,
        SMS_PASSWORD: process.env.SMS_PASSWORD,
    };
}
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3001;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.post('/api/send-sms', async (req, res) => {
    const { recipients, message } = req.body;
    if (!recipients || !Array.isArray(recipients) || recipients.length === 0 || !message) {
        return res.status(400).json({ success: false, error: 'Invalid recipients or message' });
    }
    try {
        // Check if we're in Vercel/serverless environment
        const isVercel = process.env.VERCEL || process.env.LAMBDA_TASK_ROOT;
        if (isVercel) {
            // Use HTTP API for Vercel deployment
            const smsServer = process.env.SMS_SERVER;
            const smsUsername = process.env.SMS_USERNAME;
            const smsPassword = process.env.SMS_PASSWORD;
            if (!smsServer || !smsUsername || !smsPassword) {
                return res.status(500).json({
                    success: false,
                    error: 'SMS configuration missing. Please set SMS_SERVER, SMS_USERNAME, and SMS_PASSWORD environment variables.'
                });
            }
            // Send SMS via HTTP API
            const results = [];
            for (const phone of recipients) {
                try {
                    // Normalize phone to E.164 format, assuming Czech Republic +420
                    const normalizedPhone = phone.startsWith('+') ? phone : `+420${phone.replace(/\s/g, '')}`;
                    // This is a generic HTTP API call - adjust based on your SMS provider
                    const smsResponse = await fetch(smsServer, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Basic ${Buffer.from(`${smsUsername}:${smsPassword}`).toString('base64')}`
                        },
                        body: JSON.stringify({
                            to: normalizedPhone,
                            message: message
                        })
                    });
                    if (!smsResponse.ok) {
                        const errorText = await smsResponse.text();
                        results.push({ phone: normalizedPhone, success: false, error: `HTTP ${smsResponse.status}: ${errorText}` });
                    }
                    else {
                        const responseData = await smsResponse.json().catch(() => ({}));
                        results.push({ phone: normalizedPhone, success: true, data: responseData });
                    }
                }
                catch (phoneErr) {
                    results.push({ phone, success: false, error: phoneErr.message });
                }
            }
            // Check if all SMS were sent successfully
            const allSuccessful = results.every(r => r.success);
            if (allSuccessful) {
                res.json({ success: true, data: results });
            }
            else {
                res.status(500).json({
                    success: false,
                    error: 'Some SMS failed to send',
                    details: results
                });
            }
        }
        else {
            // Use local smsgate binary for local development
            const smsgatePath = path_1.default.join(process.cwd(), '..', 'smsgate');
            // Prepare arguments
            const args = ['send'];
            recipients.forEach(phone => {
                // Normalize phone to E.164 format, assuming Czech Republic +420
                const normalizedPhone = phone.startsWith('+') ? phone : `+420${phone.replace(/\s/g, '')}`;
                args.push('--phone', normalizedPhone);
            });
            args.push(message);
            // Spawn smsgate process
            const smsgate = (0, child_process_1.spawn)(smsgatePath, args, {
                env: {
                    ...process.env,
                    ASG_USERNAME: config.ASG_USERNAME,
                    ASG_PASSWORD: config.ASG_PASSWORD,
                },
                stdio: ['pipe', 'pipe', 'pipe']
            });
            let stdout = '';
            let stderr = '';
            smsgate.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            smsgate.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            smsgate.on('close', (code) => {
                console.log(`SMS gate exited with code ${code}`);
                console.log(`stdout: ${stdout}`);
                console.log(`stderr: ${stderr}`);
                if (code === 0) {
                    res.json({ success: true, data: stdout });
                }
                else {
                    res.status(500).json({ success: false, error: stderr || 'SMS sending failed' });
                }
            });
            smsgate.on('error', (err) => {
                res.status(500).json({ success: false, error: err.message });
            });
        }
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
// Push notification subscription endpoint
app.post('/api/push-subscription', async (req, res) => {
    try {
        const { subscription, vehicleNumber, driverId, userAgent } = req.body;
        if (!subscription || !vehicleNumber) {
            return res.status(400).json({ success: false, error: 'Missing subscription or vehicle number' });
        }
        const pushUtils = await import("../../api/_push-utils.js");
        const result = await pushUtils.savePushSubscription({ subscription, vehicleNumber, driverId, userAgent });
        console.log('Push subscription stored:', {
            vehicleNumber,
            endpoint: subscription.endpoint,
            userAgent,
            persisted: result.persisted
        });
        res.json({ success: true, message: 'Subscription stored', ...result });
    }
    catch (error) {
        console.error('Push subscription error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});
// Notification action endpoint
app.post('/api/notification-action', async (req, res) => {
    try {
        const { action, notificationData } = req.body;
        const pushUtils = await import("../../api/_push-utils.js");
        const result = await pushUtils.updateRideFromNotificationAction({ action, notificationData });
        console.log('Notification action received:', { action, notificationData, result });
        res.json({ success: true, message: 'Action processed', ...result });
    }
    catch (error) {
        console.error('Notification action error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});
app.post('/api/send-push', async (req, res) => {
    try {
        const { vehicleNumber, ride, eventType = 'assigned', payload } = req.body || {};
        if (!vehicleNumber) {
            return res.status(400).json({ success: false, error: 'Missing vehicleNumber' });
        }
        const pushUtils = await import("../../api/_push-utils.js");
        const pushPayload = payload || pushUtils.buildRidePushPayload(ride || {}, eventType);
        const result = await pushUtils.sendPushToVehicle(vehicleNumber, pushPayload);
        res.json({ success: true, ...result });
    }
    catch (error) {
        console.error('send-push error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});
app.post('/api/webhook/sms-received', async (req, res) => {
    try {
        const { phone, message, timestamp } = req.body;
        if (!phone || !message) {
            return res.status(400).json({ success: false, error: 'Missing phone or message' });
        }
        // Save incoming SMS
        const record = {
            id: Date.now().toString(),
            timestamp: timestamp ? new Date(timestamp).getTime() : Date.now(),
            direction: 'incoming',
            from: phone,
            text: message,
            status: 'delivered',
        };
        await smsService_1.smsService.saveIncoming(record);
        console.log('Incoming SMS saved:', record);
        res.json({ success: true });
    }
    catch (err) {
        console.error('Error processing incoming SMS:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});
app.get('/api/gps-vehicles', async (req, res) => {
    try {
        const gpsApiUrl = process.env.GPS_API_URL || 'https://gps.lokatory.cz/api/vehicles';
        const gpsUsername = process.env.GPS_USERNAME;
        const gpsPassword = process.env.GPS_PASSWORD;
        if (!gpsUsername || !gpsPassword) {
            return res.status(500).json({ error: 'GPS configuration missing. Set GPS_USERNAME and GPS_PASSWORD.' });
        }
        const response = await fetch(gpsApiUrl, {
            method: 'GET',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(`${gpsUsername}:${gpsPassword}`).toString('base64'),
                'Content-Type': 'application/json',
            },
            redirect: 'follow',
        });
        console.log('GPS API status:', response.status);
        console.log('GPS API headers:', Object.fromEntries(response.headers.entries()));
        const text = await response.text();
        console.log('GPS API response:', text.substring(0, 500));
        if (!response.ok) {
            return res.status(response.status).json({ error: 'GPS API error', text });
        }
        try {
            const data = JSON.parse(text);
            res.json(data);
        }
        catch (parseErr) {
            console.error('GPS API returned non-JSON:', parseErr);
            res.status(500).json({ error: 'GPS API returned non-JSON', text: text.substring(0, 500) });
        }
    }
    catch (err) {
        console.error('GPS proxy error:', err);
        res.status(500).json({ error: err.message });
    }
});
app.post('/api/config', (req, res) => {
    const { server, username, password } = req.body;
    if (!server || !username || !password) {
        return res.status(400).json({ error: 'Missing server, username, or password' });
    }
    config.ASG_SERVER = server;
    config.ASG_USERNAME = username;
    config.ASG_PASSWORD = password;
    try {
        fs_1.default.writeFileSync(configPath, JSON.stringify(config, null, 2));
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to save config' });
    }
});
// Stream Chat token generation endpoint
app.post('/api/stream-chat-token', (req, res) => {
    try {
        const { userId } = req.body;
        console.log('Generating token for userId:', userId);
        if (!userId) {
            console.log('Missing userId in request');
            return res.status(400).json({ error: 'Missing userId' });
        }
        const apiKey = process.env.VITE_STREAM_API_KEY;
        const apiSecret = process.env.VITE_STREAM_API_SECRET;
        console.log('API Key present:', !!apiKey, 'API Secret present:', !!apiSecret);
        if (!apiKey || !apiSecret) {
            console.log('Stream Chat API key or secret not configured');
            return res.status(500).json({ error: 'Stream Chat API key or secret not configured' });
        }
        // Create server-side client for token generation
        const serverClient = stream_chat_1.StreamChat.getInstance(apiKey, apiSecret);
        console.log('Server client created successfully');
        // Generate token
        const token = serverClient.createToken(userId);
        console.log('Token generated successfully for user:', userId);
        res.json({ token });
    }
    catch (error) {
        console.error('Error generating Stream Chat token:', error);
        res.status(500).json({ error: 'Failed to generate token' });
    }
});
// Stream Chat user creation endpoint
app.post('/api/stream-chat-user', async (req, res) => {
    try {
        const { userId, userData } = req.body;
        if (!userId || !userData) {
            return res.status(400).json({ error: 'Missing userId or userData' });
        }
        const apiKey = process.env.VITE_STREAM_API_KEY;
        const apiSecret = process.env.VITE_STREAM_API_SECRET;
        if (!apiKey || !apiSecret) {
            return res.status(500).json({ error: 'Stream Chat API key or secret not configured' });
        }
        // Create server-side client for user management
        const serverClient = stream_chat_1.StreamChat.getInstance(apiKey, apiSecret);
        // Create or update user (remove role if it's not a valid Stream Chat role)
        const { role, ...userDataWithoutRole } = userData;
        await serverClient.upsertUser({
            id: userId,
            ...userDataWithoutRole
        });
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error creating Stream Chat user:', error);
        res.status(500).json({ error: 'Failed to create user' });
    }
});
// OSRM-based routing proxy endpoint with fallback
app.get('/api/route', async (req, res) => {
    try {
        const { coordinates } = req.query;
        if (!coordinates || typeof coordinates !== 'string') {
            return res.status(400).json({ error: 'Missing or invalid coordinates parameter' });
        }
        // Parse coordinates (format: lon1,lat1;lon2,lat2;...)
        const coordPairs = coordinates.split(';').map(pair => {
            const [lon, lat] = pair.split(',').map(Number);
            return { lat, lon };
        });
        if (coordPairs.length < 2) {
            return res.status(400).json({ error: 'At least 2 coordinate pairs required' });
        }
        // Skip OpenRouteService for now (requires API key), try GraphHopper first
        // Try Google Maps as primary routing service (we have API key configured)
        // Try Google Maps as primary routing service
        const googleMapsApiKey = process.env.VITE_GOOGLE_MAPS_API_KEY;
        if (googleMapsApiKey) {
            try {
                console.log('Trying Google Maps routing service...');
                // Build Google Maps Directions API URL
                const origin = `${coordPairs[0].lat},${coordPairs[0].lon}`;
                const destination = `${coordPairs[coordPairs.length - 1].lat},${coordPairs[coordPairs.length - 1].lon}`;
                let waypoints = '';
                if (coordPairs.length > 2) {
                    const intermediateWaypoints = coordPairs.slice(1, -1).map(coord => `${coord.lat},${coord.lon}`);
                    waypoints = `&waypoints=${intermediateWaypoints.join('|')}`;
                }
                const googleMapsUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}${waypoints}&mode=driving&key=${googleMapsApiKey}`;
                const response = await fetch(googleMapsUrl);
                if (response.ok) {
                    const googleData = await response.json();
                    if (googleData.status === 'OK' && googleData.routes && googleData.routes.length > 0) {
                        const route = googleData.routes[0];
                        // Convert Google Maps polyline to coordinates
                        const geometry = decodePolyline(route.overview_polyline.points);
                        // Calculate total distance and duration
                        const totalDistance = route.legs.reduce((sum, leg) => sum + leg.distance.value, 0);
                        const totalDuration = route.legs.reduce((sum, leg) => sum + leg.duration.value, 0);
                        const googleMapsLikeResponse = {
                            code: 'Ok',
                            routes: [{
                                    duration: totalDuration, // seconds
                                    distance: totalDistance, // meters
                                    geometry: {
                                        type: 'LineString',
                                        coordinates: geometry // [lon, lat] format for GeoJSON
                                    },
                                    legs: route.legs.map((leg) => ({
                                        duration: leg.duration.value,
                                        distance: leg.distance.value,
                                        steps: []
                                    }))
                                }],
                            waypoints: coordPairs.map(coord => ({
                                location: [coord.lon, coord.lat]
                            }))
                        };
                        console.log('Google Maps routing successful');
                        return res.json(googleMapsLikeResponse);
                    }
                }
                console.warn('Google Maps routing failed');
            }
            catch (googleError) {
                console.warn('Google Maps routing error:', googleError.message);
            }
        }
        else {
            console.warn('Google Maps API key not configured');
        }

        // Try OSRM as secondary routing service
        try {
            console.log('Trying OSRM routing service...');
            // Build OSRM URL (assuming OSRM server running on localhost:5000)
            const osrmCoords = coordPairs.map(coord => `${coord.lon},${coord.lat}`).join(';');
            const osrmUrl = `http://localhost:5000/route/v1/driving/${osrmCoords}?overview=full&geometries=geojson&steps=false`;
            const osrmResponse = await fetch(osrmUrl);

            if (osrmResponse.ok) {
                const osrmData = await osrmResponse.json();
                if (osrmData.code === 'Ok' && osrmData.routes && osrmData.routes.length > 0) {
                    const route = osrmData.routes[0];
                    const osrmLikeResponse = {
                        code: 'Ok',
                        routes: [{
                            duration: route.duration, // seconds
                            distance: route.distance, // meters
                            geometry: route.geometry, // GeoJSON LineString
                            legs: [{
                                duration: route.duration,
                                distance: route.distance,
                                steps: []
                            }]
                        }],
                        waypoints: coordPairs.map(coord => ({
                            location: [coord.lon, coord.lat]
                        }))
                    };
                    console.log('OSRM routing successful');
                    return res.json(osrmLikeResponse);
                }
            }
            console.warn('OSRM routing failed');
        } catch (osrmError) {
            console.warn('OSRM routing error:', osrmError.message);
        }

        // All routing services failed, return fallback flag
        console.log('All routing services failed, using local fallback calculation');
        res.status(200).json({
            fallback: true,
            message: 'All routing services are unavailable. Using local fallback calculation.'
        });
    }
    catch (error) {
        console.error('Routing proxy error:', error);
        // Return successful response with fallback flag so client knows to use local calculation
        res.status(200).json({
            fallback: true,
            message: 'Routing service error. Using fallback calculation.'
        });
    }
});
app.listen(PORT, () => {
    console.log(`SMS Gateway server running on port ${PORT}`);
});
// Polyline decoding function for Google Maps
function decodePolyline(encoded) {
    const poly = [];
    let index = 0;
    let lat = 0;
    let lng = 0;
    while (index < encoded.length) {
        let b;
        let shift = 0;
        let result = 0;
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lat += dlat;
        shift = 0;
        result = 0;
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lng += dlng;
        poly.push([lat * 1e-5, lng * 1e-5]); // Convert to [lat, lon]
    }
    return poly;
}
