// Exposes a small READ-ONLY API to the renderer. There is deliberately no write/delete call.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('wakil', {
  getWorkspace: () => ipcRenderer.invoke('workspace:get'),
  chooseWorkspace: () => ipcRenderer.invoke('workspace:choose'),
  closeWorkspace: () => ipcRenderer.invoke('workspace:close'),
  // creates only missing structure files, after a native confirmation dialog – never overwrites
  initWorkspace: (mode) => ipcRenderer.invoke('workspace:init', mode),
  getUsage: () => ipcRenderer.invoke('usage:get'),
  saveReport: (name, content) => ipcRenderer.invoke('report:save', name, content),
  readText: (rel) => ipcRenderer.invoke('file:text', rel),
  dataUrl: (rel) => ipcRenderer.invoke('file:dataUrl', rel),
  openFile: (rel) => ipcRenderer.invoke('file:open', rel),
  revealFile: (rel) => ipcRenderer.invoke('file:reveal', rel),
  openExternal: (url) => ipcRenderer.invoke('link:external', url),
  onChanged: (cb) => {
    const handler = (_e, data) => cb(data)
    ipcRenderer.on('workspace:changed', handler)
    return () => ipcRenderer.removeListener('workspace:changed', handler)
  },
  platform: process.platform,
})
