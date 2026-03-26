const { app, BrowserWindow, Tray, Menu, shell, nativeImage } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

const HTTP_PORT  = 3700;
const HTTPS_PORT = 3743;
const SERVER_URL = `http://localhost:${HTTP_PORT}`;

let mainWindow = null;
let tray       = null;
let serverProc = null;

// ── Start the embedded LocalChat server ───────────────────────────────────────
function startServer() {
  const serverEntry = path.join(__dirname, '..', 'server', 'index.js');
  serverProc = spawn(process.execPath, [serverEntry], {
    env: { ...process.env, NODE_ENV: 'production', PORT: String(HTTP_PORT), HTTPS_PORT: String(HTTPS_PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProc.stdout.on('data', d => process.stdout.write('[server] ' + d));
  serverProc.stderr.on('data', d => process.stderr.write('[server] ' + d));
  serverProc.on('exit', code => {
    if (code !== 0) console.error('[server] exited with code', code);
  });
}

// ── Wait until server responds, then open window ──────────────────────────────
function waitForServer(retries = 30, delay = 500) {
  return new Promise((resolve, reject) => {
    const attempt = () => {
      http.get(SERVER_URL + '/api/users', res => {
        if (res.statusCode < 500) resolve();
        else retry();
      }).on('error', () => {
        if (--retries <= 0) reject(new Error('Server did not start in time'));
        else setTimeout(attempt, delay);
      });
    };
    attempt();
  });
}

// ── Create the main browser window ───────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'LocalChat',
    backgroundColor: '#0d0e14',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    // Use the app icon if bundled
    ...(process.platform !== 'darwin' ? { icon: path.join(__dirname, 'icon.png') } : {}),
  });

  mainWindow.loadURL(SERVER_URL);
  mainWindow.setMenuBarVisibility(false);

  // Open external links in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('close', e => {
    // On macOS, closing the window hides it (app lives in tray)
    if (process.platform === 'darwin' && !app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── System tray icon ──────────────────────────────────────────────────────────
function createTray() {
  // Fallback to a blank 16x16 icon if no icon file provided
  let icon;
  try {
    icon = nativeImage.createFromPath(path.join(__dirname, 'icon.png')).resize({ width: 16, height: 16 });
  } catch {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip('LocalChat');

  const menu = Menu.buildFromTemplate([
    { label: 'Open LocalChat', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { label: 'Open in Browser', click: () => shell.openExternal(SERVER_URL) },
    { type: 'separator' },
    { label: `HTTP  :${HTTP_PORT}`,  enabled: false },
    { label: `HTTPS :${HTTPS_PORT}`, enabled: false },
    { type: 'separator' },
    { label: 'Admin Dashboard', click: () => shell.openExternal(`${SERVER_URL}/admin`) },
    { type: 'separator' },
    { label: 'Quit LocalChat', click: () => { app.isQuitting = true; app.quit(); } },
  ]);

  tray.setContextMenu(menu);
  tray.on('click', () => { mainWindow?.show(); mainWindow?.focus(); });
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  startServer();
  createTray();

  try {
    await waitForServer();
  } catch (e) {
    console.error('Server failed to start:', e.message);
  }

  createWindow();

  app.on('activate', () => {
    // macOS: re-open window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow?.show();
  });
});

app.on('window-all-closed', () => {
  // On macOS keep app running in tray; on other platforms quit
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (serverProc) serverProc.kill();
});
