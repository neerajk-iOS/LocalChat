const { app, BrowserWindow, Tray, Menu, shell, nativeImage, ipcMain, dialog } = require('electron');
const path  = require('path');
const fs    = require('fs');

// ── Persist server URL between launches ───────────────────────────────────────
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch { return {}; }
}
function saveConfig(data) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2));
}

let mainWindow = null;
let tray       = null;
let serverUrl  = null;

// ── Setup window (first launch / change server) ────────────────────────────────
function createSetupWindow() {
  const win = new BrowserWindow({
    width: 460,
    height: 320,
    resizable: false,
    center: true,
    title: 'LocalChat — Connect to Server',
    backgroundColor: '#0d0e14',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  win.setMenuBarVisibility(false);

  const cfg   = loadConfig();
  const saved = cfg.serverUrl || '';

  win.loadURL('data:text/html,' + encodeURIComponent(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #0d0e14; color: #e2e3ed;
    display: flex; align-items: center; justify-content: center;
    min-height: 100vh; padding: 24px;
  }
  .card { width: 100%; max-width: 380px; }
  h1 { font-size: 22px; font-weight: 800; margin-bottom: 4px; }
  h1 span { color: #818cf8; }
  p  { font-size: 12px; color: #6b7280; margin-bottom: 20px; }
  label { font-size: 12px; font-weight: 600; color: #9ca3af; display: block; margin-bottom: 6px; }
  input {
    width: 100%; padding: 10px 14px; background: #1a1b25;
    border: 1px solid #2d2e3d; border-radius: 8px;
    color: #e2e3ed; font-size: 14px; outline: none; margin-bottom: 14px;
  }
  input:focus { border-color: #6366f1; }
  button {
    width: 100%; padding: 11px; background: #6366f1;
    border: none; border-radius: 8px; color: #fff;
    font-size: 14px; font-weight: 600; cursor: pointer;
  }
  button:hover { background: #4f46e5; }
  .err { color: #ef4444; font-size: 12px; margin-bottom: 10px; display: none; }
</style>
</head>
<body>
<div class="card">
  <h1>Local<span>Chat</span></h1>
  <p>Enter the address of your LocalChat server</p>
  <label>Server URL</label>
  <input id="url" type="text" placeholder="http://192.168.1.50:3700" value="${saved}" />
  <div class="err" id="err">Could not reach that server. Check the address and try again.</div>
  <button id="btn">Connect</button>
</div>
<script>
const { ipcRenderer } = require('electron');
const btn = document.getElementById('btn');
const inp = document.getElementById('url');
const err = document.getElementById('err');
btn.onclick = async () => {
  let url = inp.value.trim();
  if (!url) return;
  if (!url.startsWith('http')) url = 'http://' + url;
  btn.textContent = 'Connecting…'; btn.disabled = true; err.style.display = 'none';
  try {
    const res = await fetch(url + '/api/users', { signal: AbortSignal.timeout(5000) });
    if (res.ok || res.status === 401) { ipcRenderer.send('server-confirmed', url); return; }
  } catch {}
  err.style.display = 'block';
  btn.textContent = 'Connect'; btn.disabled = false;
};
inp.addEventListener('keydown', e => { if (e.key === 'Enter') btn.click(); });
</script>
</body>
</html>`));

  return win;
}

// ── Main chat window ───────────────────────────────────────────────────────────
function createMainWindow(url) {
  if (mainWindow) { mainWindow.focus(); return; }

  mainWindow = new BrowserWindow({
    width: 1300,
    height: 820,
    minWidth: 860,
    minHeight: 600,
    title: 'LocalChat',
    backgroundColor: '#0d0e14',
    webPreferences: { nodeIntegration: false, contextIsolation: true },
    ...(process.platform !== 'darwin' ? { icon: path.join(__dirname, 'icon.png') } : {}),
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadURL(url);

  // Open external links in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url: u }) => {
    shell.openExternal(u);
    return { action: 'deny' };
  });

  mainWindow.on('close', e => {
    if (process.platform === 'darwin' && !app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── Tray ───────────────────────────────────────────────────────────────────────
function createTray(url) {
  let icon;
  try {
    icon = nativeImage.createFromPath(path.join(__dirname, 'icon.png')).resize({ width: 16, height: 16 });
  } catch {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip('LocalChat — ' + url);

  const rebuild = () => tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open LocalChat', click: () => { mainWindow ? mainWindow.show() : createMainWindow(serverUrl); } },
    { label: 'Open in Browser', click: () => shell.openExternal(serverUrl) },
    { type: 'separator' },
    { label: serverUrl, enabled: false },
    { type: 'separator' },
    { label: 'Admin Dashboard', click: () => shell.openExternal(serverUrl + '/admin') },
    { label: 'Change Server…', click: () => {
        if (mainWindow) { mainWindow.close(); mainWindow = null; }
        const setup = createSetupWindow();
        ipcMain.once('server-confirmed', (_, url) => {
          serverUrl = url;
          saveConfig({ serverUrl: url });
          setup.close();
          createMainWindow(url);
          createTray(url);
        });
    }},
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]));
  rebuild();
  tray.on('click', () => { mainWindow ? mainWindow.show() : createMainWindow(serverUrl); });
}

// ── App startup ────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  const cfg = loadConfig();

  if (cfg.serverUrl) {
    // Known server — go straight to chat
    serverUrl = cfg.serverUrl;
    createMainWindow(serverUrl);
    createTray(serverUrl);
  } else {
    // First launch — ask for server URL
    const setup = createSetupWindow();
    ipcMain.once('server-confirmed', (_, url) => {
      serverUrl = url;
      saveConfig({ serverUrl: url });
      setup.close();
      createMainWindow(url);
      createTray(url);
    });
  }

  app.on('activate', () => {
    if (serverUrl) mainWindow ? mainWindow.show() : createMainWindow(serverUrl);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => { app.isQuitting = true; });
