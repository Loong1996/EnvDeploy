import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'
import { randomUUID } from 'crypto'
import type { AppConfig } from '@shared/types'
import {
  backupConfig, listBackups, loadConfig, restoreConfig, saveConfig,
} from './core/config'
import { listRuleTypes, planRules, registerBuiltins, runRules } from './core/engine'
import { parseRuleset, serializeRuleset } from './core/ruleset'
import { reconcileImportedPeople } from '@shared/people'
import { isAdmin } from './core/executors/env'

registerBuiltins()

/** 配置/packages 的落盘基准目录:打包后为 exe 所在目录,开发时归入 dev-data/ 子目录(不污染工程根) */
function appDir(): string {
  if (process.env.PORTABLE_EXECUTABLE_DIR) return process.env.PORTABLE_EXECUTABLE_DIR
  if (app.isPackaged) return path.dirname(app.getPath('exe'))
  const dev = path.join(process.cwd(), 'dev-data')
  fs.mkdirSync(dev, { recursive: true })
  return dev
}

function createWindow(): void {
  const win = new BrowserWindow({
    title: '环境部署工具',
    width: 1080,
    height: 720,
    minWidth: 860,
    minHeight: 600,
    autoHideMenuBar: true,
    backgroundColor: '#0f1115',
    show: false,
    webPreferences: { preload: path.join(__dirname, '../preload/index.js'), sandbox: false },
  })
  win.once('ready-to-show', () => win.show())
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(path.join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  ipcMain.handle('config:load', () => loadConfig(appDir()))
  ipcMain.handle('config:save', (_e, cfg: AppConfig) => saveConfig(appDir(), cfg))
  ipcMain.handle('config:backup', () => backupConfig(appDir()))
  ipcMain.handle('config:list-backups', () => listBackups(appDir()))
  ipcMain.handle('config:restore', (_e, p: string) => restoreConfig(appDir(), p))
  ipcMain.handle('rule-types', () => listRuleTypes())
  ipcMain.handle('sys:is-admin', () => isAdmin())
  ipcMain.handle('sys:env-vars', () => {
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(process.env)) if (v !== undefined) out[k] = v
    return out
  })

  ipcMain.handle('dialog:pick-file', async () => {
    const r = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: '所有文件', extensions: ['*'] }],
    })
    return r.canceled ? null : r.filePaths[0]
  })

  ipcMain.handle('dialog:pick-dir', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  })

  // 导入源文件专用：默认定位到 exe 的 packages/；选中项在 packages 内则返回相对路径（保持跨机器可移植）
  ipcMain.handle('dialog:pick-package-file', async () => {
    const pkgDir = path.join(appDir(), 'packages')
    fs.mkdirSync(pkgDir, { recursive: true })
    const r = await dialog.showOpenDialog({
      defaultPath: pkgDir,
      properties: ['openFile'],
      filters: [{ name: '所有文件', extensions: ['*'] }],
    })
    if (r.canceled) return null
    const picked = r.filePaths[0]
    const rel = path.relative(pkgDir, picked)
    return (!rel.startsWith('..') && !path.isAbsolute(rel)) ? rel.split(path.sep).join('/') : picked
  })

  ipcMain.handle('rules:run', async (e, ruleIds: string[]) => {
    const cfg = loadConfig(appDir())
    const rules = ruleIds
      .map(id => cfg.rules.find(r => r.id === id))
      .filter((r): r is NonNullable<typeof r> => r !== undefined)
    return runRules(rules, { baseDir: appDir(), settings: cfg.settings }, p => {
      e.sender.send('rules:progress', p)
    })
  })

  ipcMain.handle('rules:plan', async (_e, ruleIds: string[]) => {
    const cfg = loadConfig(appDir())
    const rules = ruleIds
      .map(id => cfg.rules.find(r => r.id === id))
      .filter((r): r is NonNullable<typeof r> => r !== undefined)
    return planRules(rules, { baseDir: appDir(), settings: cfg.settings })
  })

  ipcMain.handle('ruleset:export', async (_e, ruleIds: string[]) => {
    const cfg = loadConfig(appDir())
    const rules = cfg.rules.filter(r => ruleIds.includes(r.id))
    const r = await dialog.showSaveDialog({
      defaultPath: 'ruleset.rules.json',
      filters: [{ name: '规则集', extensions: ['json'] }],
    })
    if (r.canceled || !r.filePath) return { ok: false, canceled: true }
    fs.writeFileSync(r.filePath, serializeRuleset(rules, cfg.people), 'utf8')
    return { ok: true, path: r.filePath }
  })

  const importFrom = (file: string): { ok: boolean; config?: AppConfig; added?: number; error?: string } => {
    try {
      const imported = parseRuleset(fs.readFileSync(file, 'utf8'))
      const cfg = loadConfig(appDir())
      const { people, rules } = reconcileImportedPeople(cfg.people, imported, () => randomUUID())
      cfg.people = people
      cfg.rules = [...cfg.rules, ...rules]
      saveConfig(appDir(), cfg)
      return { ok: true, config: cfg, added: rules.length }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  ipcMain.handle('ruleset:import', async () => {
    const r = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: '规则集', extensions: ['json'] }],
    })
    if (r.canceled) return { ok: false, canceled: true }
    return importFrom(r.filePaths[0])
  })

  ipcMain.handle('ruleset:import-example', () => {
    const file = app.isPackaged
      ? path.join(process.resourcesPath, 'examples', 'ai-coding-env.rules.json')
      : path.join(process.cwd(), 'examples', 'ai-coding-env.rules.json')
    return importFrom(file)
  })

  createWindow()
})

app.on('window-all-closed', () => app.quit())
