const { contextBridge, ipcRenderer } = require('electron');

// Only the app's own local pages get the bridge; the Gradio page served from 127.0.0.1 does not.
if (location.protocol === 'file:') {
  contextBridge.exposeInMainWorld('tai', {
    state: () => ipcRenderer.invoke('state'),
    chooseFolder: () => ipcRenderer.invoke('choose-folder'),
    download: (ids, bypassVpn) => ipcRenderer.invoke('download', ids, bypassVpn),
    cancel: () => ipcRenderer.invoke('cancel'),
    launch: () => ipcRenderer.invoke('launch'),
    restart: () => ipcRenderer.invoke('restart'),
    openSetup: () => ipcRenderer.invoke('open-setup'),
    openModelsFolder: () => ipcRenderer.invoke('open-models-folder'),
    onProgress: (cb) => ipcRenderer.on('progress', (_e, p) => cb(p)),
    onStatus: (cb) => ipcRenderer.on('status', (_e, s) => cb(s)),
    onError: (cb) => ipcRenderer.on('error', (_e, e) => cb(e)),
  });
}
