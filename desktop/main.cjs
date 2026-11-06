// The desktop build, for Steam: the same game in its own window with a known browser engine, so every
// player gets the same graphics code rather than whatever browser they happen to have.
const { app, BrowserWindow, session, shell } = require('electron');
const path = require('node:path');

// With LL_SMOKE=1 the game boots in a hidden window, reports whether it got going, and quits.
const smoke = process.env.LL_SMOKE === '1';

app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
// Sound shouldn't wait for a click when there's no web page to protect anyone from.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const ALLOWED = new Set(['pointerLock', 'fullscreen', 'clipboard-sanitized-write']);

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(ALLOWED.has(permission)));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => ALLOWED.has(permission));

  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    fullscreen: !smoke,
    show: false,
    backgroundColor: '#14101a',
    autoHideMenuBar: true,
    title: 'Long Light',
    icon: path.join(__dirname, '..', 'Long Light.ico'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Friends stay connected while this window is behind another. The game slows itself down instead.
      backgroundThrottling: false,
    },
  });
  win.setMenu(null);

  // The game never navigates. Links out, if any, belong in the player's own browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file:')) e.preventDefault();
  });

  if (!smoke) win.once('ready-to-show', () => win.show());
  void win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  if (smoke) {
    const started = Date.now();
    const timer = setInterval(async () => {
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      try {
        const ready = await win.webContents.executeJavaScript('window.__ll?.ready === true');
        if (ready) {
          const stats = await win.webContents.executeJavaScript('JSON.stringify(window.__ll.stats())');
          console.log(`READY after ${seconds}s ${stats}`);
          clearInterval(timer);
          app.exit(0);
        }
      } catch (e) {
        console.log(`waiting: ${e.message}`);
      }
      if (Date.now() - started > 180000) {
        console.log('TIMED OUT');
        clearInterval(timer);
        app.exit(1);
      }
    }, 1000);
  }
});

app.on('window-all-closed', () => app.quit());
