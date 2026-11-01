import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import { IpcChannels, type AutomatApi, type MenuAction } from '../shared/ipc'

const api: AutomatApi = {
  openFile: () => ipcRenderer.invoke(IpcChannels.openFile),
  pathForFile: (file) => webUtils.getPathForFile(file),
  saveFile: (content, filePath) => ipcRenderer.invoke(IpcChannels.saveFile, content, filePath),
  saveExport: (defaultName, filter, data) =>
    ipcRenderer.invoke(IpcChannels.exportSave, defaultName, filter, data),
  beginExportSequence: (baseName, extension, count) =>
    ipcRenderer.invoke(IpcChannels.exportSequenceBegin, baseName, extension, count),
  writeExportSequence: (index, data) =>
    ipcRenderer.invoke(IpcChannels.exportSequenceWrite, index, data),
  exportPdf: (defaultName, html) => ipcRenderer.invoke(IpcChannels.exportPdf, defaultName, html),
  setDirty: (dirty) => ipcRenderer.send(IpcChannels.windowDirty, dirty),
  onCloseRequest: (callback) => {
    const listener = (): void => callback()
    ipcRenderer.on(IpcChannels.closeRequest, listener)
    return () => {
      ipcRenderer.removeListener(IpcChannels.closeRequest, listener)
    }
  },
  closeWindow: () => ipcRenderer.send(IpcChannels.closeWindow),
  onMenuAction: (callback) => {
    const listener = (_event: IpcRendererEvent, action: MenuAction): void => callback(action)
    ipcRenderer.on(IpcChannels.menuAction, listener)
    return () => {
      ipcRenderer.removeListener(IpcChannels.menuAction, listener)
    }
  },
  loadSettings: () => ipcRenderer.invoke(IpcChannels.loadSettings),
  saveSettings: (settings) => ipcRenderer.invoke(IpcChannels.saveSettings, settings)
}

contextBridge.exposeInMainWorld('api', api)
