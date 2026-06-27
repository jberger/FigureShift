import { app, BrowserWindow, dialog, ipcMain, protocol, net, shell } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import started from 'electron-squirrel-startup';
import { TwdbClient } from '@joelberger/twdb-client';
import { attemptLogin } from './main/twdbAuth';
import { resizeSmokeTest } from './main/resizeSmokeTest';
import { getBrands, getCreateModels } from './main/brands';
import { scanLibrary } from './main/scan';
import { writeMachineYaml, type MachineDoc } from './main/machineYaml';
import { pushMachine } from './main/push';

// `figimg://` serves thumbnails to the renderer; must be registered before app ready.
protocol.registerSchemesAsPrivileged([
  { scheme: 'figimg', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// The authenticated client is kept after a successful login so scanning can
// fetch the brand list for path inference.
let client: TwdbClient | null = null;

// Root of the most recent scan; figimg only serves files inside it.
let scannedRoot: string | null = null;

// IPC handlers bridging the renderer to twdb-client (main/Node process).
ipcMain.handle(
  'twdb:login',
  async (_event, { username, password }: { username: string; password: string }) => {
    const c = new TwdbClient();
    const res = await attemptLogin(username, password, () => c);
    if (res.ok) client = c;
    return res;
  },
);
ipcMain.handle('twdb:resizeSmokeTest', () => resizeSmokeTest());

ipcMain.handle('library:pickRoot', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('library:scan', async (_event, root: string) => {
  scannedRoot = path.resolve(root);
  if (!client) return scanLibrary(root, [], async () => []);
  const c = client;
  const brands = await getBrands(c);
  const makeNames = brands.map((b) => b.name);
  const getModels = async (make: string): Promise<string[]> => {
    const brand = brands.find((b) => b.name === make);
    return brand ? getCreateModels(c, brand.id) : [];
  };
  return scanLibrary(root, makeNames, getModels);
});

ipcMain.handle('twdb:brands', async () =>
  client ? [...new Set((await getBrands(client)).map((b) => b.name))] : [],
);

ipcMain.handle('twdb:models', async (_event, make: string) => {
  if (!client) return [];
  const brand = (await getBrands(client)).find((b) => b.name === make);
  return brand ? [...new Set(await getCreateModels(client, brand.id))] : [];
});

ipcMain.handle('machine:save', async (_event, absPath: string, doc: MachineDoc) => {
  writeMachineYaml(absPath, doc);
  return { ok: true };
});

ipcMain.handle('machine:push', async (_event, absPath: string) => {
  if (!client) return { ok: false as const, message: 'Not logged in.' };
  try {
    const res = await pushMachine(client, absPath);
    return { ok: true as const, ...res };
  } catch (err) {
    return { ok: false as const, message: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle('app:openExternal', (_event, url: string) => shell.openExternal(url));

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // Open the DevTools.
  mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Serve image thumbnails, confined to the scanned library root.
  protocol.handle('figimg', (request) => {
    const abs = path.resolve(decodeURIComponent(new URL(request.url).pathname.replace(/^\//, '')));
    const ok = scannedRoot && (abs === scannedRoot || abs.startsWith(scannedRoot + path.sep));
    if (!ok) return new Response('forbidden', { status: 403 });
    return net.fetch(pathToFileURL(abs).toString());
  });
  createWindow();
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
