import path from 'path';
import dotenv from 'dotenv';

// Load environment variables from parent directory FIRST
dotenv.config({ path: path.join(process.cwd(), '..', '.env') });

import express from 'express';
import cors from 'cors';

const app = express();
const PORT = Number(process.env.PORT || 3002);

app.use(cors());
app.use(express.json());

app.get('/api/test', (req, res) => {
  res.json({ message: 'Server is working', timestamp: new Date().toISOString() });
});

app.get('/api/route', (req, res) => {
  res.json({ message: 'Route endpoint working' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Minimal server running on port ${PORT}`);
});
