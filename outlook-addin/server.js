/**
 * HTTPS dev server for the Outlook Add-in.
 * Auto-generates self-signed SSL certificates using the 'selfsigned' package.
 *
 * First run: npm install selfsigned && node server.js
 */
const https = require('https');
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

/**
 * Get or generate SSL certificates.
 */
function getCerts() {
  const certsDir = path.join(__dirname, 'certs');
  const certPath = path.join(certsDir, 'server.crt');
  const keyPath = path.join(certsDir, 'server.key');

  // Use existing certs if available
  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    return {
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath)
    };
  }

  // Generate new certs
  console.log('Generating SSL certificates...');

  const selfsigned = require('selfsigned');
  const attrs = [{ name: 'commonName', value: 'localhost' }];
  const pems = selfsigned.generate(attrs, {
    days: 365,
    keySize: 2048,
    algorithm: 'sha256'
  });

  if (!fs.existsSync(certsDir)) {
    fs.mkdirSync(certsDir, { recursive: true });
  }

  fs.writeFileSync(certPath, pems.cert);
  fs.writeFileSync(keyPath, pems.private);
  console.log('SSL certificates generated!');

  return {
    cert: pems.cert,
    key: pems.private
  };
}

// Start HTTPS server
const { cert, key } = getCerts();

https.createServer({ cert, key }, handleRequest).listen(PORT, () => {
  console.log('');
  console.log('===========================================');
  console.log('  Email to vCard - Outlook Add-in Server');
  console.log('===========================================');
  console.log('');
  console.log(`  HTTPS server: https://localhost:${PORT}`);
  console.log(`  Taskpane:     https://localhost:${PORT}/taskpane.html`);
  console.log('');
  console.log('  Le serveur est pret !');
  console.log('  Vous pouvez maintenant charger manifest.xml dans Outlook.');
  console.log('  Ne fermez pas cette fenetre.');
  console.log('');
});
