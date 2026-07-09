import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { Api } from '@shared/api'
import type { AppConfig, ProgressEvent } from '@shared/types'

const api: Api = {
  loadConfig: () => ipcRenderer.invoke('config:load'),
  saveConfig: (cfg: AppConfig) => ipcRenderer.invoke('config:save', cfg),
  backupConfig: () => ipcRenderer.invoke('config:backup'),
  listBackups: () => ipcRenderer.invoke('config:list-backups'),
  restoreConfig: (p: string) => ipcRenderer.invoke('config:restore', p),
  ruleTypes: () => ipcRenderer.invoke('rule-types'),
  isAdmin: () => ipcRenderer.invoke('sys:is-admin'),
  pickFile: () => ipcRenderer.invoke('dialog:pick-file'),
  pickDir: () => ipcRenderer.invoke('dialog:pick-dir'),
  runRules: (ids: string[]) => ipcRenderer.invoke('rules:run', ids),
  onProgress: (cb: (p: ProgressEvent) => void) => {
    const handler = (_e: IpcRendererEvent, p: ProgressEvent): void => cb(p)
    ipcRenderer.on('rules:progress', handler)
    return () => {
      ipcRenderer.removeListener('rules:progress', handler)
    }
  },
}

contextBridge.exposeInMainWorld('api', api)
