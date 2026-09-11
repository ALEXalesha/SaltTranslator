const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const paths = require('./paths');
const { downloadModel } = require('./downloader');
const { freePort, waitReady, startBackend, stopBackend } = require('./backend');
const catalog = require('./catalog.json');

const DATA = paths.dataDir();
const APP_DIR = app.isPackaged ? path.join(process.resourcesPath, 'app') : path.join(__dirname, '..');
// Windows' own bsdtar understands zip; a Git or MSYS tar earlier in PATH does not.
const TAR = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');

app.setPath('userData', path.join(DATA, 'electron'));
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

let win = null;
let backend = null;
let download = null;
let quitting = false;

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function status(text) {
  send('status', text);
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    return null;
  }
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { windowsHide: true }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${path.basename(command)}: ${stderr || err.message}`));
      else resolve(stdout);
    });
  });
}

function modelsDir() {
  return paths.readConfig(DATA).modelsDir || path.join(DATA, 'models');
}

function foundModels(dir = modelsDir()) {
  const found = new Set(paths.modelsFound(dir, catalog.models.map((m) => m.folder)));
  return catalog.models.filter((m) => found.has(m.folder));
}

function freeBytes(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const s = fs.statfsSync(dir);
    return s.bavail * s.bsize;
  } catch {
    return null;
  }
}

async function ensureRuntime() {
  if (!app.isPackaged) return path.join(__dirname, '..', '.venv', 'Scripts', 'python.exe');
  const dir = path.join(DATA, 'runtime');
  const python = path.join(dir, 'python.exe');
  const version = app.getVersion();
  if (fs.existsSync(python) && readText(path.join(dir, 'runtime.version')) === version) return python;
  status('Распаковываю Python. Это один раз и займёт около минуты…');
  // Unpack next to the old runtime and swap at the end, so a crash mid-way never leaves a half-runtime marked as ready.
  const fresh = path.join(DATA, 'runtime.new');
  fs.rmSync(fresh, { recursive: true, force: true });
  fs.mkdirSync(fresh, { recursive: true });
  await run(TAR, ['-x', '-f', path.join(process.resourcesPath, 'runtime.zip'), '-C', fresh]);
  if (readText(path.join(fresh, 'runtime.version')) !== version) throw new Error('Архив с Python повреждён, переустанови программу.');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.renameSync(fresh, dir);
  return python;
}

async function showError(error) {
  if (!win || win.isDestroyed()) return;
  await win.loadFile('loading.html');
  send('error', { message: error.message || String(error), log: backend ? backend.log() : '' });
}

async function launch() {
  await win.loadFile('loading.html');
  const python = await ensureRuntime();
  status('Запускаю переводчик и загружаю модель…');
  const port = await freePort();
  const current = startBackend({
    command: python,
    // -u: piped stdout is block-buffered, and the error page would show an empty log right when it matters.
    args: ['-E', '-s', '-u', '-X', 'utf8', path.join(APP_DIR, 'app.py')],
    cwd: APP_DIR,
    port,
    modelsDir: modelsDir(),
  });
  backend = current;
  current.proc.on('exit', (code) => {
    if (!quitting && backend === current) showError(new Error(`Переводчик неожиданно завершился (код ${code}).`));
  });
  await waitReady({ port, exitCode: () => current.exitCode(), timeoutMs: 180_000, intervalMs: 300 });
  if (backend === current) await win.loadURL(`http://127.0.0.1:${port}/`);
}

async function restart() {
  const old = backend;
  backend = null;
  if (old) await stopBackend(old);
  try {
    await launch();
  } catch (e) {
    showError(e);
  }
}

function state() {
  const dir = modelsDir();
  return {
    modelsDir: dir,
    found: foundModels(dir).map((m) => m.label),
    models: catalog.models.map((m) => ({
      id: m.id,
      label: m.label,
      folder: m.folder,
      downloadable: m.downloadable,
      size: (m.files || []).reduce((sum, f) => sum + f.size, 0),
    })),
    network: paths.physicalIPv4(),
    freeBytes: freeBytes(dir),
  };
}

function guardNavigation(contents) {
  const external = (url) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
  };
  contents.setWindowOpenHandler(({ url }) => {
    external(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    const u = new URL(url);
    if (u.protocol === 'file:' || u.hostname === '127.0.0.1') return;
    event.preventDefault();
    external(url);
  });
}

function handle(channel, fn) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!event.senderFrame || !event.senderFrame.url.startsWith('file:')) throw new Error('forbidden');
    return fn(...args);
  });
}

handle('state', () => state());

handle('choose-folder', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Папка с моделями',
    defaultPath: modelsDir(),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (!res.canceled && res.filePaths[0]) paths.writeConfig(DATA, { ...paths.readConfig(DATA), modelsDir: res.filePaths[0] });
  return state();
});

handle('download', async (ids, bypassVpn) => {
  if (download) throw new Error('Загрузка уже идёт');
  const dir = modelsDir();
  const models = catalog.models.filter((m) => m.downloadable && ids.includes(m.id));
  const localAddress = bypassVpn ? paths.physicalIPv4()?.address : undefined;
  download = new AbortController();
  try {
    for (const model of models) {
      await downloadModel({
        model,
        modelsDir: dir,
        localAddress,
        signal: download.signal,
        onProgress: (p) => send('progress', { ...p, model: model.label }),
      });
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, cancelled: e.name === 'AbortError', error: e.message };
  } finally {
    download = null;
  }
});

handle('cancel', () => download?.abort());
handle('launch', () => launch().catch(showError));
handle('restart', () => restart());
handle('open-setup', async () => {
  const old = backend;
  backend = null;
  if (old) await stopBackend(old);
  await win.loadFile('setup.html');
});
handle('open-models-folder', () => shell.openPath(modelsDir()));

async function start() {
  win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 720,
    minHeight: 520,
    title: 'Translator AI',
    icon: path.join(__dirname, 'icon.ico'),
    autoHideMenuBar: true,
    backgroundColor: '#101216',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  guardNavigation(win.webContents);
  // Gradio registers a beforeunload handler. Without this, Electron silently cancels both closing the
  // window and our own switch to the error page when Python dies.
  win.webContents.on('will-prevent-unload', (event) => event.preventDefault());
  win.on('page-title-updated', (e) => e.preventDefault());
  try {
    if (foundModels().length === 0) {
      await win.loadFile('setup.html');
      return;
    }
    await launch();
  } catch (e) {
    showError(e);
  }
}

if (gotLock) {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.whenReady().then(start);
  app.on('before-quit', () => {
    quitting = true;
    download?.abort();
    if (backend) stopBackend(backend);
  });
  app.on('window-all-closed', () => app.quit());
}
