/**
 * Simple HTTPS dev server for the Outlook Add-in.
 * Office Add-ins require HTTPS, even in development.
 *
 * Usage:
 *   1. Generate self-signed certs (see README)
 *   2. node server.js
 *   3. The add-in will be served at https://localhost:3000
 */
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml',
  '.vcf': 'text/vcard'
};

function handleRequest(req, res) {
  let filePath = req.url === '/' ? '/taskpane.html' : req.url;
  filePath = path.join(__dirname, filePath);

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*'
    });
    res.end(data);
  });
}

// Try HTTPS first (required for Office Add-ins)
const certPath = path.join(__dirname, 'certs', 'server.crt');
const keyPath = path.join(__dirname, 'certs', 'server.key');

if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  const options = {
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath)
  };
  https.createServer(options, handleRequest).listen(PORT, () => {
    console.log(`[HTTPS] Add-in server running at https://localhost:${PORT}`);
    console.log('Taskpane: https://localhost:' + PORT + '/taskpane.html');
  });
} else {
  console.log('No SSL certs found in ./certs/. Starting HTTP server (for testing only).');
  console.log('For Outlook, generate certs with: npm run generate-certs');
  http.createServer(handleRequest).listen(PORT, () => {
    console.log(`[HTTP] Add-in server running at http://localhost:${PORT}`);
    console.log('Taskpane: http://localhost:' + PORT + '/taskpane.html');
  });
}
