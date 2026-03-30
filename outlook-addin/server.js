/**
 * HTTPS dev server for the Outlook Add-in.
 * Auto-generates self-signed SSL certificates.
 */
const https = require('https');
const crypto = require('crypto');
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

async function getCerts() {
  const certsDir = path.join(__dirname, 'certs');
  const certPath = path.join(certsDir, 'server.crt');
  const keyPath = path.join(certsDir, 'server.key');

  // Try existing certs
  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    try {
      const cert = fs.readFileSync(certPath);
      const key = fs.readFileSync(keyPath);
      crypto.createSecureContext({ cert, key });
      console.log('Using existing SSL certificates.');
      return { cert, key };
    } catch (e) {
      console.log('Existing certs invalid, regenerating...');
      fs.unlinkSync(certPath);
      fs.unlinkSync(keyPath);
    }
  }

  if (!fs.existsSync(certsDir)) {
    fs.mkdirSync(certsDir, { recursive: true });
  }

  console.log('Generating SSL certificates...');

  // Generate with selfsigned package (v5 returns a Promise)
  const selfsigned = require('selfsigned');
  const pems = await selfsigned.generate(
    [{ name: 'commonName', value: 'localhost' }],
    { days: 365, keySize: 2048, algorithm: 'sha256' }
  );

  fs.writeFileSync(keyPath, pems.private);
  fs.writeFileSync(certPath, pems.cert);
  console.log('SSL certificates generated!');

  return { cert: pems.cert, key: pems.private };
}

// Start server
getCerts().then(({ cert, key }) => {
  https.createServer({ cert, key }, handleRequest).listen(PORT, () => {
    console.log('');
    console.log('===========================================');
    console.log('  Email to vCard - Outlook Add-in Server');
    console.log('===========================================');
    console.log('');
    console.log('  HTTPS server: https://localhost:' + PORT);
    console.log('  Taskpane:     https://localhost:' + PORT + '/taskpane.html');
    console.log('');
    console.log('  Le serveur est pret !');
    console.log('  Chargez manifest.xml dans Outlook.');
    console.log('  Ne fermez pas cette fenetre.');
    console.log('');
  });
}).catch((err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
