const express  = require('express');
const http     = require('http');
const https    = require('https');
const { Server } = require('socket.io');
const cors     = require('cors');
const helmet   = require('helmet');
const path     = require('path');
const fs       = require('fs');
const os       = require('os');

// Routes
const authRouter     = require('./routes/auth');
const usersRouter    = require('./routes/users');
const groupsRouter   = require('./routes/groups');
const messagesRouter = require('./routes/messages');
const filesRouter    = require('./routes/files');
const adminRouter    = require('./routes/admin');
const linksRouter    = require('./routes/links');
const initSockets    = require('./sockets/chat');
const { requireAuth, verifyToken } = require('./middleware/auth');

const HTTP_PORT  = Number(process.env.PORT)       || 3700;
const HTTPS_PORT = Number(process.env.HTTPS_PORT)  || 3743;

// Allowed CORS origins — set ALLOWED_ORIGINS env var to a comma-separated list
// e.g. "https://chat.example.com,https://app.example.com"
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : null; // null = allow all (dev mode)

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

const CERT_DIR  = process.env.CERT_DIR || __dirname;
const CERT_FILE = path.join(CERT_DIR, 'cert.pem');
const KEY_FILE  = path.join(CERT_DIR, 'key.pem');
const META_FILE = path.join(CERT_DIR, 'cert.meta.json');

async function getTlsCert(lanIP) {
  // If real certs exist from Let's Encrypt / Caddy (env vars)
  if (process.env.TLS_CERT && process.env.TLS_KEY) {
    return { cert: process.env.TLS_CERT, key: process.env.TLS_KEY };
  }

  if (fs.existsSync(CERT_FILE) && fs.existsSync(KEY_FILE) && fs.existsSync(META_FILE)) {
    try {
      const meta = JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
      if (meta.lanIP === lanIP) {
        return { cert: fs.readFileSync(CERT_FILE), key: fs.readFileSync(KEY_FILE) };
      }
    } catch { /* regenerate */ }
  }

  const selfsigned = require('selfsigned');
  const attrs = [{ name: 'commonName', value: 'LocalChat' }];
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
  console.log(`  🔐 TLS cert generated for IP ${lanIP}`);

  return { cert: pems.cert, key: pems.private };
}

async function main() {
  const lanIP = getLanIP();

  let tls = null;
  try {
    tls = await getTlsCert(lanIP);
  } catch (e) {
    console.warn('  ⚠️  TLS cert generation failed:', e.message);
  }

  const app = express();

  const httpServer  = http.createServer(app);
  const httpsServer = tls ? https.createServer({ cert: tls.cert, key: tls.key }, app) : null;

  // ── Security headers ─────────────────────────────────────
  app.use(helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc:  ["'self'", "'unsafe-inline'"],
        styleSrc:   ["'self'", "'unsafe-inline'"],
        imgSrc:     ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", 'wss:', 'ws:'],
        mediaSrc:   ["'self'", 'blob:'],
      },
    },
  }));

  // ── CORS ─────────────────────────────────────────────────
  const corsOptions = {
    origin: ALLOWED_ORIGINS || true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  };
  app.use(cors(corsOptions));

  // ── Socket.IO with JWT auth ───────────────────────────────
  const io = new Server({
    cors: {
      origin: ALLOWED_ORIGINS || true,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    maxHttpBufferSize: 100 * 1024 * 1024, // 100MB (reduced from 500MB)
  });
  io.attach(httpServer);
  if (httpsServer) io.attach(httpsServer);

  // Authenticate Socket.IO connections with JWT
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
    if (!token) return next(new Error('Authentication required'));
    try {
      const payload = verifyToken(token);
      socket.userId = payload.userId;
      next();
    } catch (err) {
      next(new Error('Invalid or expired token'));
    }
  });

  // ── Body parsing ─────────────────────────────────────────
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.set('trust proxy', 1);

  // ── Rate limiting ─────────────────────────────────────────
  const { rateLimit } = require('express-rate-limit');
  app.use('/api/auth', rateLimit({
    windowMs: 15 * 60 * 1000, max: 20,
    message: { error: 'Too many requests, please try again later.' },
  }));
  app.use('/api', rateLimit({
    windowMs: 1 * 60 * 1000, max: 300,
    message: { error: 'Too many requests, please try again later.' },
  }));

  // ── API Routes ────────────────────────────────────────────
  app.use('/api/auth',     authRouter);
  app.use('/api/users',    requireAuth, usersRouter);
  app.use('/api/groups',   requireAuth, groupsRouter);
  app.use('/api/messages', requireAuth, messagesRouter);
  // File GET routes are public (avatars/media URLs embedded in messages)
  // File POST (upload) is protected — handled inside the router
  app.use('/api/files',    filesRouter);
  app.use('/api/links',    requireAuth, linksRouter);
  app.use('/admin',        adminRouter);

  // ── Cert helpers ──────────────────────────────────────────
  function pemToDer(pem) {
    const b64 = pem.toString()
      .replace(/-----BEGIN CERTIFICATE-----/g, '')
      .replace(/-----END CERTIFICATE-----/g, '')
      .replace(/\s+/g, '');
    return Buffer.from(b64, 'base64');
  }

  app.get('/cert.pem', (req, res) => {
    if (!tls?.cert) return res.status(503).send('Certificate not ready — restart the server.');
    res.setHeader('Content-Type', 'application/x-pem-file');
    res.setHeader('Content-Disposition', 'attachment; filename="localchat-ca.pem"');
    res.send(tls.cert);
  });

  app.get('/localchat.crt', (req, res) => {
    if (!tls?.cert) return res.status(503).send('Certificate not ready — restart the server.');
    res.setHeader('Content-Type', 'application/x-x509-ca-cert');
    res.setHeader('Content-Disposition', 'attachment; filename="localchat-ca.crt"');
    res.send(pemToDer(tls.cert));
  });

  app.get('/localchat.mobileconfig', (req, res) => {
    if (!tls?.cert) return res.status(503).send('Certificate not ready — restart the server.');
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
      <key>PayloadDescription</key><string>Trusts LocalChat certificate</string>
      <key>PayloadDisplayName</key><string>LocalChat CA</string>
      <key>PayloadIdentifier</key><string>com.localchat.ca</string>
      <key>PayloadOrganization</key><string>LocalChat</string>
      <key>PayloadType</key><string>com.apple.security.root</string>
      <key>PayloadUUID</key><string>${uuid1}</string>
      <key>PayloadVersion</key><integer>1</integer>
    </dict>
  </array>
  <key>PayloadDescription</key><string>Enables secure calling in LocalChat</string>
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

  // ── Serve React client (production build) ─────────────────
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
          <p>API at <code>http://localhost:${HTTP_PORT}/api</code></p>
        </body></html>
      `);
    }
  });

  // ── Socket.IO ─────────────────────────────────────────────
  initSockets(io);

  // ── mDNS Discovery ────────────────────────────────────────
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
  console.log(`  🟢 HTTP   →  http://localhost:${HTTP_PORT}`);
  console.log(`  🌐 Network →  http://${lanIP}:${HTTP_PORT}`);
  console.log(`  🛠️  Admin  →  http://localhost:${HTTP_PORT}/admin`);
  console.log(`  🔑 Auth   →  POST /api/auth/register | /api/auth/login`);

  if (httpsServer) {
    await new Promise(resolve => httpsServer.listen(HTTPS_PORT, '0.0.0.0', resolve));
    console.log(`  🔒 HTTPS  →  https://localhost:${HTTPS_PORT}`);
    console.log(`  📱 Mobile →  https://${lanIP}:${HTTPS_PORT}`);
  }
  console.log('');
  if (!process.env.JWT_SECRET) {
    console.warn('  ⚠️  JWT_SECRET not set in environment. Using default dev secret.');
    console.warn('     Set JWT_SECRET env var before deploying to production!\n');
  }
}

main().catch(err => {
  console.error('[Startup Error]', err);
  process.exit(1);
});
