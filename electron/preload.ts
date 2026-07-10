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
  envVars: () => ipcRenderer.invoke('sys:env-vars'),
  pickFile: () => ipcRenderer.invoke('dialog:pick-file'),
  pickDir: () => ipcRenderer.invoke('dialog:pick-dir'),
  pickPackageFile: () => ipcRenderer.invoke('dialog:pick-package-file'),
  runRules: (ids: string[]) => ipcRenderer.invoke('rules:run', ids),
  planRules: (ids: string[]) => ipcRenderer.invoke('rules:plan', ids),
  exportRules: (ids: string[]) => ipcRenderer.invoke('ruleset:export', ids),
  importRules: () => ipcRenderer.invoke('ruleset:import'),
  importExample: () => ipcRenderer.invoke('ruleset:import-example'),
  onProgress: (cb: (p: ProgressEvent) => void) => {
    const handler = (_e: IpcRendererEvent, p: ProgressEvent): void => cb(p)
    ipcRenderer.on('rules:progress', handler)
    return () => {
      ipcRenderer.removeListener('rules:progress', handler)
    }
  },
}

contextBridge.exposeInMainWorld('api', api)
