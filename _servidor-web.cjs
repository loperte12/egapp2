// Servidor estático con fallback SPA para verificar el export web de Expo.
// Uso: node _servidor-web.cjs [puerto]   (por defecto 4173)
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, process.argv[3] || 'dist');
const PORT = Number(process.argv[2] || 4173);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.pmtiles': 'application/octet-stream',
  '.map': 'application/json', '.txt': 'text/plain; charset=utf-8',
};

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  let file = path.normalize(path.join(ROOT, urlPath));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (urlPath === '/' || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(ROOT, 'index.html'); // fallback SPA
  }
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`sirviendo dist/ en http://localhost:${PORT}`));
