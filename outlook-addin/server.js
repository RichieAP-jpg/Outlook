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

/**
 * Generate self-signed cert using Node.js crypto.generateCertificate (Node 21+)
 * or fallback to selfsigned package.
 */
function getCerts() {
  const certsDir = path.join(__dirname, 'certs');
  const certPath = path.join(certsDir, 'server.crt');
  const keyPath = path.join(certsDir, 'server.key');

  // Delete old broken certs if they exist
  if (fs.existsSync(certPath)) {
    try {
      // Test if existing cert is valid
      crypto.createSecureContext({
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath)
      });
      console.log('Using existing SSL certificates.');
      return { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) };
    } catch (e) {
      // Cert is broken, regenerate
      console.log('Existing certs are invalid, regenerating...');
      fs.unlinkSync(certPath);
      fs.unlinkSync(keyPath);
    }
  }

  if (!fs.existsSync(certsDir)) {
    fs.mkdirSync(certsDir, { recursive: true });
  }

  console.log('Generating SSL certificates...');

  // Method 1: Try Node.js built-in generateKeyPair + X509 (Node 20+)
  try {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });

    // Use selfsigned if available
    try {
      const selfsigned = require('selfsigned');
      const pems = selfsigned.generate(
        [{ name: 'commonName', value: 'localhost' }],
        { keySize: 2048, days: 365, algorithm: 'sha256' }
      );
      fs.writeFileSync(keyPath, pems.private);
      fs.writeFileSync(certPath, pems.cert);

      // Verify the cert works
      crypto.createSecureContext({ cert: pems.cert, key: pems.private });
      console.log('SSL certificates generated with selfsigned!');
      return { cert: pems.cert, key: pems.private };
    } catch (e) {
      // selfsigned failed or not installed
      console.log('selfsigned package failed:', e.message);
    }
  } catch (e) {
    console.log('Key generation failed:', e.message);
  }

  // Method 2: Use openssl CLI if available
  try {
    const { execSync } = require('child_process');
    execSync(
      `openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days 365 -nodes -subj "/CN=localhost"`,
      { stdio: 'pipe' }
    );
    console.log('SSL certificates generated with openssl!');
    return { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) };
  } catch (e) {
    // openssl not available
  }

  // Method 3: Use powershell to generate cert (Windows)
  try {
    const { execSync } = require('child_process');
    // Generate with PowerShell's New-SelfSignedCertificate
    const script = `
      $cert = New-SelfSignedCertificate -DnsName "localhost" -CertStoreLocation "Cert:\\CurrentUser\\My" -NotAfter (Get-Date).AddYears(1)
      $pwd = ConvertTo-SecureString -String "temp123" -Force -AsPlainText
      $pfxPath = "${certsDir.replace(/\\/g, '\\\\')}\\\\temp.pfx"
      Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $pwd | Out-Null
      Write-Output $pfxPath
    `;
    const pfxPath = path.join(certsDir, 'temp.pfx');
    execSync(`powershell -Command "${script.replace(/\n/g, '; ')}"`, { stdio: 'pipe' });

    // Convert PFX to PEM using Node crypto
    const pfxData = fs.readFileSync(pfxPath);
    // Node can use PFX directly
    fs.unlinkSync(pfxPath);
    console.log('SSL certificates generated with PowerShell!');
    return { pfx: pfxData, passphrase: 'temp123' };
  } catch (e) {
    // PowerShell method failed
  }

  console.error('');
  console.error('ERROR: Could not generate SSL certificates.');
  console.error('Please install openssl or run as administrator.');
  process.exit(1);
}

// Start server
const certs = getCerts();

https.createServer(certs, handleRequest).listen(PORT, () => {
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
