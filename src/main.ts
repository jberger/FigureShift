import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { TwdbClient } from '@joelberger/twdb-client';
import { attemptLogin } from './main/twdbAuth';
import { resizeSmokeTest } from './main/resizeSmokeTest';
import { getBrandNames } from './main/brands';
import { scanLibrary } from './main/scan';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// The authenticated client is kept after a successful login so scanning can
// fetch the brand list for path inference.
let client: TwdbClient | null = null;

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
  const brandNames = client ? await getBrandNames(client) : [];
  return scanLibrary(root, brandNames);
});

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
app.on('ready', createWindow);

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
