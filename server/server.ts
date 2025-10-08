import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { smsService } from '../services/smsService';

// Load config from config.json if exists, else .env
let config: any = {};
const configPath = path.join(process.cwd(), 'config.json');
if (fs.existsSync(configPath)) {
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    console.warn('Failed to load config.json:', err);
  }
} else {
  dotenv.config();
  config = {
    ASG_USERNAME: process.env.ASG_USERNAME,
    ASG_PASSWORD: process.env.ASG_PASSWORD,
    ASG_SERVER: process.env.ASG_SERVER,
  };
}

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.post('/api/send-sms', async (req, res) => {
  const { recipients, message }: { recipients: string[]; message: string } = req.body;

  if (!recipients || !Array.isArray(recipients) || recipients.length === 0 || !message) {
    return res.status(400).json({ success: false, error: 'Invalid recipients or message' });
  }

  try {
    // Path to smsgate binary
    const smsgatePath = path.join(process.cwd(), '..', 'smsgate');

    // Prepare arguments
    const args = ['send'];
    recipients.forEach(phone => {
      // Normalize phone to E.164 format, assuming Czech Republic +420
      const normalizedPhone = phone.startsWith('+') ? phone : `+420${phone.replace(/\s/g, '')}`;
      args.push('--phone', normalizedPhone);
    });
    args.push(message);

    // Spawn smsgate process
    const smsgate = spawn(smsgatePath, args, {
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
      } else {
        res.status(500).json({ success: false, error: stderr || 'SMS sending failed' });
      }
    });

    smsgate.on('error', (err) => {
      res.status(500).json({ success: false, error: err.message });
    });

   } catch (err: any) {
     res.status(500).json({ success: false, error: err.message });
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
       direction: 'incoming' as const,
       from: phone,
       text: message,
       status: 'delivered' as const,
     };

     await smsService.saveIncoming(record);

     console.log('Incoming SMS saved:', record);

     res.json({ success: true });
   } catch (err: any) {
     console.error('Error processing incoming SMS:', err);
     res.status(500).json({ success: false, error: err.message });
   }
 });

  app.get('/api/gps-vehicles', async (req, res) => {
    try {
      const response = await fetch('https://gps.lokatory.cz/api/vehicles', {
        method: 'GET',
        headers: {
          'Authorization': 'Basic ' + Buffer.from('5186800:Hustopece2024').toString('base64'),
          'Content-Type': 'application/json',
        },
        redirect: 'follow',
      });

      console.log('GPS API status:', response.status);
      console.log('GPS API headers:', response.headers.raw());

      const text = await response.text();
      console.log('GPS API response:', text.substring(0, 500));

      if (!response.ok) {
        return res.status(response.status).json({ error: 'GPS API error', text });
      }

      try {
        const data = JSON.parse(text);
        res.json(data);
      } catch (parseErr) {
        console.error('GPS API returned non-JSON:', parseErr);
        res.status(500).json({ error: 'GPS API returned non-JSON', text: text.substring(0, 500) });
      }
    } catch (err: any) {
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
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to save config' });
    }
  });

  app.listen(PORT, () => {
    console.log(`SMS Gateway server running on port ${PORT}`);
  });