// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('figureshift', {
  login: (username: string, password: string, remember: boolean) =>
    ipcRenderer.invoke('twdb:login', { username, password, remember }),
  autoLogin: () => ipcRenderer.invoke('auth:autoLogin'),
  logout: () => ipcRenderer.invoke('auth:logout'),
  readPhoto: (args: { dir: string; file: string }) => ipcRenderer.invoke('photo:read', args),
  saveEdit: (args: { dir: string; file: string; mode: 'overwrite' | 'new'; bytes: Uint8Array }) =>
    ipcRenderer.invoke('photo:saveEdit', args),
  resizeSmokeTest: () => ipcRenderer.invoke('twdb:resizeSmokeTest'),
  pickRoot: () => ipcRenderer.invoke('library:pickRoot'),
  scan: (root: string) => ipcRenderer.invoke('library:scan', root),
  getLibraryRoot: () => ipcRenderer.invoke('settings:getLibraryRoot'),
  onChangeLibrary: (cb: () => void) => {
    const h = () => cb();
    ipcRenderer.on('menu:changeLibrary', h);
    return () => ipcRenderer.removeListener('menu:changeLibrary', h);
  },
  brands: () => ipcRenderer.invoke('twdb:brands'),
  models: (make: string) => ipcRenderer.invoke('twdb:models', make),
  saveMachine: (absPath: string, doc: unknown) => ipcRenderer.invoke('machine:save', absPath, doc),
  push: (absPath: string) => ipcRenderer.invoke('machine:push', absPath),
  onPushProgress: (cb: (p: { phase: string; current?: number; total?: number }) => void) => {
    const h = (_e: unknown, p: { phase: string; current?: number; total?: number }) => cb(p);
    ipcRenderer.on('push:progress', h);
    return () => ipcRenderer.removeListener('push:progress', h);
  },
  openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url),
});
