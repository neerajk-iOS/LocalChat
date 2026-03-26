const express  = require('express');
const http     = require('http');
const https    = require('https');
const { Server } = require('socket.io');
const cors     = require('cors');
const path     = require('path');
const fs       = require('fs');
const os       = require('os');

// Routes
const usersRouter    = require('./routes/users');
const groupsRouter   = require('./routes/groups');
const messagesRouter = require('./routes/messages');
const filesRouter    = require('./routes/files');
const adminRouter    = require('./routes/admin');
const linksRouter    = require('./routes/links');
const initSockets    = require('./sockets/chat');

const HTTP_PORT  = Number(process.env.PORT)      || 3700;
const HTTPS_PORT = Number(process.env.HTTPS_PORT) || 3743;

// ── Determine LAN IP ──────────────────────────────────────
function getLanIP() {
  try {
    const ifaces = os.networkInterfaces();
    for (const iface of Object.values(ifaces)) {
      for (const d of iface) {
        if (d.family === 'IPv4' && !d.internal) return d.address;
      }
    }
  } catch { /* sandboxed */ }
  return '127.0.0.1';
}

// ── Generate / load TLS cert (selfsigned v5 is async) ────
// Allow an external volume to store certs (useful in Docker)
const CERT_DIR  = process.env.CERT_DIR || __dirname;
const CERT_FILE = path.join(CERT_DIR, 'cert.pem');
const KEY_FILE  = path.join(CERT_DIR, 'key.pem');
const META_FILE = path.join(CERT_DIR, 'cert.meta.json');

async function getTlsCert(lanIP) {
  // Re-use cached cert if the LAN IP hasn't changed
  if (fs.existsSync(CERT_FILE) && fs.existsSync(KEY_FILE) && fs.existsSync(META_FILE)) {
    try {
      const meta = JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
      if (meta.lanIP === lanIP) {
        return {
          cert: fs.readFileSync(CERT_FILE),
          key:  fs.readFileSync(KEY_FILE),
        };
      }
    } catch { /* regenerate */ }
  }

  // Generate a new cert with SubjectAltName including the LAN IP.
  // SAN is required by Chrome ≥58 and all modern mobile browsers.
  const selfsigned = require('selfsigned');
  const attrs = [{ name: 'commonName', value: 'LocalChat LAN' }];
  const pems = await selfsigned.generate(attrs, {
    days: 825,
    keySize: 2048,
    extensions: [{
      name: 'subjectAltName',
      altNames: [
        { type: 2, value: 'localhost' },
        { type: 7, ip: '127.0.0.1' },
        { type: 7, ip: lanIP },
      ],
    }],
  });

  fs.writeFileSync(CERT_FILE, pems.cert);
  fs.writeFileSync(KEY_FILE,  pems.private);
  fs.writeFileSync(META_FILE, JSON.stringify({ lanIP, generated: new Date().toISOString() }));
  console.log(`  🔐 TLS cert generated for IP ${lanIP}  (cert.pem / key.pem)`);

  return { cert: pems.cert, key: pems.private };
}

// ── Main async startup ────────────────────────────────────
async function main() {
  const lanIP = getLanIP();

  // Try to get TLS cert; fall back gracefully if selfsigned unavailable
  let tls = null;
  try {
    tls = await getTlsCert(lanIP);
  } catch (e) {
    console.warn('  ⚠️  TLS cert generation failed:', e.message);
    console.warn('     HTTPS server will not start. Calling requires HTTPS.');
  }

  // ── Express app ─────────────────────────────────────────
  const app = express();

  // HTTP server — localhost dev + Vite proxy target
  const httpServer = http.createServer(app);

  // HTTPS server — cross-device WebRTC access
  const httpsServer = tls
    ? https.createServer({ cert: tls.cert, key: tls.key }, app)
    : null;

  // Single Socket.IO instance attached to BOTH servers.
  // All sockets (HTTP + HTTPS) share the same namespace so
  // io.to(socketId) works regardless of which server they connected through.
  const io = new Server({
    cors: { origin: '*', methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
    maxHttpBufferSize: 500 * 1024 * 1024,
  });
  io.attach(httpServer);
  if (httpsServer) io.attach(httpsServer);

  // ── Middleware ───────────────────────────────────────────
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Trust proxy headers from Caddy/Cloudflare
  app.set('trust proxy', 1);

  // Rate limiting
  const { rateLimit } = require('express-rate-limit');
  // Strict limit on registration — prevents account farming
  app.use('/api/users', rateLimit({
    windowMs: 15 * 60 * 1000, max: 10,
    message: { error: 'Too many requests, please try again later.' },
    skip: (req) => req.method !== 'POST',
  }));
  // General API limit
  app.use('/api', rateLimit({
    windowMs: 1 * 60 * 1000, max: 300,
    message: { error: 'Too many requests, please try again later.' },
  }));

  // ── API Routes ───────────────────────────────────────────
  app.use('/api/users',    usersRouter);
  app.use('/api/groups',   groupsRouter);
  app.use('/api/messages', messagesRouter);
  app.use('/api/files',    filesRouter);
  app.use('/api/links',    linksRouter);
  app.use('/admin',        adminRouter);

  // ── Cert helpers ─────────────────────────────────────────
  // Convert PEM → raw DER bytes (strip headers, decode base64)
  function pemToDer(pem) {
    const b64 = pem.toString()
      .replace(/-----BEGIN CERTIFICATE-----/g, '')
      .replace(/-----END CERTIFICATE-----/g, '')
      .replace(/\s+/g, '');
    return Buffer.from(b64, 'base64');
  }

  // ── /cert.pem — raw PEM download ─────────────────────────
  app.get('/cert.pem', (req, res) => {
    if (!tls?.cert) return res.status(503).send('Certificate not ready — restart the server.');
    res.setHeader('Content-Type', 'application/x-pem-file');
    res.setHeader('Content-Disposition', 'attachment; filename="localchat-ca.pem"');
    res.send(tls.cert);
  });

  // ── /localchat.crt — triggers Android system cert installer ──
  // Chrome on Android opens a "Name the certificate" dialog automatically
  // when it downloads a file with this MIME type + .crt extension.
  app.get('/localchat.crt', (req, res) => {
    if (!tls?.cert) return res.status(503).send('Certificate not ready — restart the server.');
    res.setHeader('Content-Type', 'application/x-x509-ca-cert');
    res.setHeader('Content-Disposition', 'attachment; filename="localchat-ca.crt"');
    res.send(pemToDer(tls.cert));
  });

  // ── /localchat.mobileconfig — triggers iOS "Install Profile" dialog ──
  // Safari on iOS/iPadOS auto-opens this and shows "Profile Downloaded,
  // go to Settings to install" — one more tap to install, no digging in menus.
  app.get('/localchat.mobileconfig', (req, res) => {
    if (!tls?.cert) return res.status(503).send('Certificate not ready — restart the server.');
    const certB64 = Buffer.from(tls.cert.toString()
      .replace(/-----BEGIN CERTIFICATE-----/g, '')
      .replace(/-----END CERTIFICATE-----/g, '')
      .replace(/\s+/g, '')).toString(); // already base64 from PEM
    // Re-extract raw base64 from PEM for the plist <data> element
    const derB64 = pemToDer(tls.cert).toString('base64');
    const uuid1  = 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890';
    const uuid2  = 'B2C3D4E5-F6A7-8901-BCDE-F12345678901';
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>PayloadCertificateFileName</key><string>localchat-ca.crt</string>
      <key>PayloadContent</key><data>${derB64}</data>
      <key>PayloadDescription</key><string>Trusts LocalChat's local network certificate for secure calling</string>
      <key>PayloadDisplayName</key><string>LocalChat CA</string>
      <key>PayloadIdentifier</key><string>com.localchat.ca</string>
      <key>PayloadOrganization</key><string>LocalChat</string>
      <key>PayloadType</key><string>com.apple.security.root</string>
      <key>PayloadUUID</key><string>${uuid1}</string>
      <key>PayloadVersion</key><integer>1</integer>
    </dict>
  </array>
  <key>PayloadDescription</key><string>Enables secure audio/video calling in LocalChat on your local network</string>
  <key>PayloadDisplayName</key><string>LocalChat Certificate</string>
  <key>PayloadIdentifier</key><string>com.localchat.profile</string>
  <key>PayloadOrganization</key><string>LocalChat</string>
  <key>PayloadRemovalDisallowed</key><false/>
  <key>PayloadType</key><string>Configuration</string>
  <key>PayloadUUID</key><string>${uuid2}</string>
  <key>PayloadVersion</key><integer>1</integer>
</dict>
</plist>`;
    res.setHeader('Content-Type', 'application/x-apple-aspen-config');
    res.setHeader('Content-Disposition', 'attachment; filename="localchat.mobileconfig"');
    res.send(xml);
  });

  // ── /trust — smart landing page (detects platform, shows the right button) ──
  app.get('/trust', (req, res) => {
    const ua       = req.headers['user-agent'] || '';
    const isIOS    = /iPhone|iPad|iPod/i.test(ua);
    const isAndroid= /Android/i.test(ua);
    const hasCert  = !!tls;
    const httpsUrl = `https://${lanIP}:${HTTPS_PORT}`;
    const base     = `http://${lanIP}:${HTTP_PORT}`;

    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>LocalChat — Trust Certificate</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
  background:#0d1117;color:#e6edf3;min-height:100vh;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  padding:24px 16px;gap:0}
.card{background:#161b22;border:1px solid #30363d;border-radius:16px;
  padding:28px 24px;max-width:480px;width:100%;text-align:center}
.icon{font-size:3rem;margin-bottom:12px}
h1{font-size:1.25rem;font-weight:700;color:#58a6ff;margin-bottom:8px}
.sub{font-size:.88rem;color:#8b949e;margin-bottom:24px;line-height:1.5}
.btn-primary{display:flex;align-items:center;justify-content:center;gap:10px;
  background:#238636;color:#fff;text-decoration:none;padding:14px 24px;
  border-radius:10px;font-size:1rem;font-weight:700;width:100%;
  border:none;cursor:pointer;transition:background .15s;margin-bottom:12px}
.btn-primary:hover{background:#2ea043}
.btn-secondary{display:flex;align-items:center;justify-content:center;gap:8px;
  background:transparent;color:#58a6ff;text-decoration:none;padding:10px 20px;
  border-radius:8px;font-size:.88rem;font-weight:600;width:100%;
  border:1px solid #30363d;cursor:pointer;transition:background .15s;margin-bottom:8px}
.btn-secondary:hover{background:#1c2128}
.steps{text-align:left;background:#0d1117;border-radius:10px;padding:16px;
  margin-top:20px;font-size:.85rem;color:#8b949e;line-height:1.7}
.steps strong{color:#e6edf3}
.steps ol{padding-left:18px}
.steps li{margin-bottom:4px}
.badge{display:inline-block;background:#238636;color:#fff;font-size:.72rem;
  padding:2px 8px;border-radius:20px;font-weight:700;vertical-align:middle;margin-left:6px}
.divider{border:none;border-top:1px solid #30363d;margin:20px 0}
.warn{background:#1a1007;border:1px solid #f0883e;border-radius:8px;
  padding:12px;color:#ffa657;font-size:.82rem;text-align:left;margin-top:16px;line-height:1.5}
code{background:#0d1117;border:1px solid #30363d;border-radius:4px;
  padding:1px 5px;font-size:.85em;color:#f0c027}
a.plain{color:#58a6ff;font-size:.82rem}
</style></head><body>
<div class="card">
  <div class="icon">🔒</div>
  <h1>Trust LocalChat Certificate</h1>
  <p class="sub">One-time setup to enable audio &amp; video calling on your local network.</p>

  ${!hasCert ? `<div class="warn">⚠️ Certificate not generated yet.<br>Please restart the server and refresh this page.</div>` : ''}

  ${hasCert && isIOS ? `
  <!-- iOS: .mobileconfig auto-shows "Profile Downloaded" dialog in Settings -->
  <a class="btn-primary" href="${base}/localchat.mobileconfig">
    📲 Install Certificate (iOS)
    <span class="badge">Auto</span>
  </a>
  <div class="steps">
    <strong>After tapping above:</strong>
    <ol>
      <li>iOS will say <em>"Profile Downloaded"</em> — tap <strong>Close</strong></li>
      <li>Open <strong>Settings → General → VPN &amp; Device Management</strong></li>
      <li>Tap <strong>LocalChat Certificate</strong> → <strong>Install</strong> → enter passcode</li>
      <li>Go to <strong>Settings → General → About → Certificate Trust Settings</strong></li>
      <li>Toggle <strong>LocalChat CA</strong> → <strong>ON</strong> → tap <em>Continue</em></li>
      <li>Open <a href="${httpsUrl}">${httpsUrl}</a> — no warning! ✅</li>
    </ol>
  </div>
  ` : ''}

  ${hasCert && isAndroid ? `
  <!-- Android: .crt with x509 MIME type directly opens system cert installer -->
  <a class="btn-primary" href="${base}/localchat.crt">
    📲 Install Certificate (Android)
    <span class="badge">Auto</span>
  </a>
  <div class="steps">
    <strong>After tapping above:</strong>
    <ol>
      <li>Android opens the <em>"Name the certificate"</em> dialog automatically</li>
      <li>Leave the name as-is and tap <strong>OK</strong></li>
      <li>Open <a href="${httpsUrl}">${httpsUrl}</a> — no warning! ✅</li>
    </ol>
    <br>
    <strong>If the dialog doesn't appear:</strong>
    <ol>
      <li>Go to <strong>Settings → Security → Install a certificate → CA certificate</strong></li>
      <li>Pick the downloaded <code>localchat-ca.crt</code> file</li>
    </ol>
  </div>
  ` : ''}

  ${hasCert && !isIOS && !isAndroid ? `
  <!-- Desktop fallback -->
  <a class="btn-primary" href="${base}/cert.pem">⬇ Download Certificate (.pem)</a>
  <hr class="divider">
  <div class="steps">
    <strong>Chrome / Edge:</strong><br>
    Navigate to <code>${httpsUrl}</code> → click <strong>Advanced → Proceed to ${lanIP} (unsafe)</strong><br>
    Or type <code>thisisunsafe</code> on the warning page (no text box needed).<br><br>
    <strong>Firefox:</strong><br>
    Navigate to <code>${httpsUrl}</code> → <strong>Advanced… → Accept the Risk and Continue</strong>
  </div>
  ` : ''}

  ${hasCert ? `
  <hr class="divider">
  <a class="plain" href="${httpsUrl}">➜ Open LocalChat (HTTPS) ${httpsUrl}</a>
  ` : ''}
</div>
</body></html>`);
  });

  // ── Serve React client (production build) ────────────────
  const CLIENT_DIST = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(CLIENT_DIST));
  app.get('*', (req, res) => {
    const index = path.join(CLIENT_DIST, 'index.html');
    if (fs.existsSync(index)) {
      res.sendFile(index);
    } else {
      res.status(200).send(`
        <html><body style="font-family:sans-serif;text-align:center;padding:60px">
          <h2>🚀 LocalChat Server is running!</h2>
          <p>Build the client: <code>cd client && npm run build</code></p>
          <p style="color:#888">API at <code>http://localhost:${HTTP_PORT}/api</code></p>
        </body></html>
      `);
    }
  });

  // ── Socket.IO ────────────────────────────────────────────
  initSockets(io);

  // ── LAN Discovery via mDNS ───────────────────────────────
  process.on('uncaughtException', (err) => {
    if (err.code === 'ERR_SYSTEM_ERROR' && err.syscall === 'uv_interface_addresses') return;
    console.error('[Fatal]', err);
    process.exit(1);
  });
  try {
    const { Bonjour } = require('bonjour-service');
    new Bonjour().publish({ name: 'LocalChat', type: 'http', port: HTTP_PORT });
    console.log('  📡 mDNS: LocalChat advertised on LAN');
  } catch { /* not available in all environments */ }

  // ── Start servers ─────────────────────────────────────────
  await new Promise(resolve => httpServer.listen(HTTP_PORT, '0.0.0.0', resolve));

  console.log('');
  console.log('  ██╗      ██████╗  ██████╗ █████╗ ██╗      ██████╗██╗  ██╗ █████╗ ████████╗');
  console.log('  ██║     ██╔═══██╗██╔════╝██╔══██╗██║     ██╔════╝██║  ██║██╔══██╗╚══██╔══╝');
  console.log('  ██║     ██║   ██║██║     ███████║██║     ██║     ███████║███████║   ██║   ');
  console.log('  ██║     ██║   ██║██║     ██╔══██║██║     ██║     ██╔══██║██╔══██║   ██║   ');
  console.log('  ███████╗╚██████╔╝╚██████╗██║  ██║███████╗╚██████╗██║  ██║██║  ██║   ██║   ');
  console.log('  ╚══════╝ ╚═════╝  ╚═════╝╚═╝  ╚═╝╚══════╝ ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   ');
  console.log('');
  console.log(`  🟢 HTTP   →  http://localhost:${HTTP_PORT}   (dev / Vite proxy)`);
  console.log(`  🌐 Network →  http://${lanIP}:${HTTP_PORT}`);
  console.log(`  🛠️  Admin  →  http://localhost:${HTTP_PORT}/admin`);

  if (httpsServer) {
    await new Promise(resolve => httpsServer.listen(HTTPS_PORT, '0.0.0.0', resolve));
    console.log(`  🔒 HTTPS  →  https://localhost:${HTTPS_PORT}   (WebRTC calls)`);
    console.log(`  📱 Mobile →  https://${lanIP}:${HTTPS_PORT}   ← open on phone/tablet`);
    console.log(`  📋 Trust  →  http://${lanIP}:${HTTP_PORT}/trust  ← cert install guide`);
  } else {
    console.log('  ⚠️  HTTPS disabled — audio/video calls require HTTPS on non-localhost devices');
  }
  console.log('');
}

main().catch(err => {
  console.error('[Startup Error]', err);
  process.exit(1);
});
