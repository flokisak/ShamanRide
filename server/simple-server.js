import http from 'http';

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  });
  
  if (req.url.startsWith('/api/route')) {
    res.end(JSON.stringify({ message: 'Route endpoint working', fallback: true }));
  } else if (req.url === '/api/test') {
    res.end(JSON.stringify({ message: 'Server is working', timestamp: new Date().toISOString() }));
  } else {
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

const PORT = 3003;
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Simple HTTP server running on http://127.0.0.1:${PORT}`);
});