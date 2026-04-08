import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('__ELECTRON__', true);
contextBridge.exposeInMainWorld('electronAPI', {
  openFileDialog: (filters) => ipcRenderer.invoke('open-file-dialog', filters)
});
