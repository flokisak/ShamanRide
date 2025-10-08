// proxy.js
import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = 8080;

// Enable CORS for all routes
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  next();
});

// General proxy endpoint
app.get("/", async (req, res) => {
  try {
    const targetUrl = req.query.url;
    if (!targetUrl) {
      return res.status(400).json({ error: "Missing url parameter" });
    }

    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "ShamanRide/1.0 (misahlavacu@gmail.com)",
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: "Proxy error" });
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Proxy failed" });
  }
});

app.listen(PORT, () => {
  console.log(`Proxy running on http://localhost:${PORT}`);
});

