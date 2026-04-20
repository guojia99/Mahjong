const http = require('http');
const httpProxy = require('http-proxy');

const FRONTEND_PORT = 9998;
const BACKEND_PORT = 9997;
const PROXY_PORT = 9999;

const proxy = httpProxy.createProxyServer({});

proxy.on('error', (err, req, res) => {
  console.error('[proxy] error:', err.message);
  if (!res.headersSent) {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
  }
  res.end('Bad Gateway');
});

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/') || req.url.startsWith('/media/')) {
    proxy.web(req, res, { target: `http://127.0.0.1:${BACKEND_PORT}`, changeOrigin: true });
  } else {
    proxy.web(req, res, { target: `http://127.0.0.1:${FRONTEND_PORT}`, changeOrigin: true });
  }
});

server.on('upgrade', (req, socket, head) => {
  proxy.ws(req, socket, head, { target: `http://127.0.0.1:${FRONTEND_PORT}`, ws: true });
});

server.listen(PROXY_PORT, () => {
  console.log(`[proxy] http://127.0.0.1:${PROXY_PORT} -> frontend :${FRONTEND_PORT} / backend :${BACKEND_PORT}`);
});
