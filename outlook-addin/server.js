/**
 * HTTPS dev server for the Outlook Add-in.
 * Auto-generates self-signed SSL certificates if not found.
 */
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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
 * Generate self-signed SSL certificates using Node.js crypto.
 * No need for openssl CLI.
 */
function generateCerts() {
  const certsDir = path.join(__dirname, 'certs');
  const certPath = path.join(certsDir, 'server.crt');
  const keyPath = path.join(certsDir, 'server.key');

  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    return { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) };
  }

  console.log('Generating SSL certificates...');

  if (!fs.existsSync(certsDir)) {
    fs.mkdirSync(certsDir, { recursive: true });
  }

  // Use Node.js built-in crypto to generate self-signed cert
  const crypto = require('crypto');

  // Generate RSA key pair
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  // Create a self-signed certificate
  // We need to use a basic X509 certificate generation
  // Node 15+ has crypto.X509Certificate, but for broader compat we use a minimal approach
  try {
    // Try using Node's built-in certificate generation (Node 15+)
    const cert = generateSelfSignedCert(privateKey);
    fs.writeFileSync(keyPath, privateKey);
    fs.writeFileSync(certPath, cert);
    console.log('SSL certificates generated successfully!');
    return { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) };
  } catch (e) {
    // Fallback: create cert using forge-like minimal ASN.1
    const certPem = createMinimalSelfSignedCert(privateKey, publicKey);
    fs.writeFileSync(keyPath, privateKey);
    fs.writeFileSync(certPath, certPem);
    console.log('SSL certificates generated successfully!');
    return { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) };
  }
}

/**
 * Create a minimal self-signed certificate using raw ASN.1/DER encoding.
 */
function createMinimalSelfSignedCert(privateKeyPem, publicKeyPem) {
  const crypto = require('crypto');

  // Helper to create DER length encoding
  function derLength(len) {
    if (len < 128) return Buffer.from([len]);
    if (len < 256) return Buffer.from([0x81, len]);
    return Buffer.from([0x82, (len >> 8) & 0xff, len & 0xff]);
  }

  // Wrap content in a DER sequence
  function derSequence(contents) {
    const body = Buffer.concat(contents);
    return Buffer.concat([Buffer.from([0x30]), derLength(body.length), body]);
  }

  // DER integer
  function derInteger(buf) {
    // Add leading zero if high bit set
    if (buf[0] & 0x80) buf = Buffer.concat([Buffer.from([0x00]), buf]);
    return Buffer.concat([Buffer.from([0x02]), derLength(buf.length), buf]);
  }

  // DER OID
  function derOid(oidBytes) {
    return Buffer.concat([Buffer.from([0x06]), derLength(oidBytes.length), Buffer.from(oidBytes)]);
  }

  // DER UTF8String
  function derUtf8String(str) {
    const buf = Buffer.from(str, 'utf8');
    return Buffer.concat([Buffer.from([0x0c]), derLength(buf.length), buf]);
  }

  // DER BitString
  function derBitString(content) {
    const body = Buffer.concat([Buffer.from([0x00]), content]);
    return Buffer.concat([Buffer.from([0x03]), derLength(body.length), body]);
  }

  // DER explicit tag
  function derExplicit(tag, content) {
    return Buffer.concat([Buffer.from([0xa0 | tag]), derLength(content.length), content]);
  }

  // OIDs
  const sha256WithRSA = [0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x0b]; // 1.2.840.113549.1.1.11
  const commonName = [0x55, 0x04, 0x03]; // 2.5.4.3

  // Serial number
  const serial = derInteger(Buffer.from([0x01]));

  // Signature algorithm
  const sigAlgo = derSequence([derOid(sha256WithRSA), Buffer.from([0x05, 0x00])]); // NULL params

  // Issuer and Subject: CN=localhost
  const cn = derSequence([derSequence([derOid(commonName), derUtf8String('localhost')])]);
  const rdnSequence = derSequence([cn]);

  // Validity: now to +1 year
  const now = new Date();
  const oneYear = new Date(now.getTime() + 365 * 24 * 3600 * 1000);
  function utcTime(d) {
    const s = d.toISOString().replace(/[-:T]/g, '').slice(2, 14) + 'Z';
    const buf = Buffer.from(s, 'ascii');
    return Buffer.concat([Buffer.from([0x17]), derLength(buf.length), buf]);
  }
  const validity = derSequence([utcTime(now), utcTime(oneYear)]);

  // Extract public key DER from PEM
  const pubPemBody = publicKeyPem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
  const pubDer = Buffer.from(pubPemBody, 'base64');

  // Version 3
  const version = derExplicit(0, derInteger(Buffer.from([0x02])));

  // TBS Certificate
  const tbs = derSequence([version, serial, sigAlgo, rdnSequence, validity, rdnSequence, pubDer]);

  // Sign the TBS
  const sign = crypto.createSign('SHA256');
  sign.update(tbs);
  const signature = sign.sign(privateKeyPem);

  // Full certificate
  const cert = derSequence([tbs, sigAlgo, derBitString(signature)]);

  // Encode as PEM
  const b64 = cert.toString('base64');
  let pem = '-----BEGIN CERTIFICATE-----\n';
  for (let i = 0; i < b64.length; i += 64) {
    pem += b64.slice(i, i + 64) + '\n';
  }
  pem += '-----END CERTIFICATE-----\n';

  return pem;
}

// Generate or load certs, then start HTTPS server
const { cert, key } = generateCerts();

https.createServer({ cert, key }, handleRequest).listen(PORT, () => {
  console.log('');
  console.log('===========================================');
  console.log('  Email to vCard - Outlook Add-in Server');
  console.log('===========================================');
  console.log('');
  console.log(`  HTTPS server: https://localhost:${PORT}`);
  console.log(`  Taskpane:     https://localhost:${PORT}/taskpane.html`);
  console.log('');
  console.log('  Le serveur est prêt !');
  console.log('  Vous pouvez maintenant charger le manifest.xml dans Outlook.');
  console.log('  Ne fermez pas cette fenêtre.');
  console.log('');
});
