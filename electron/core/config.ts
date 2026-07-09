import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import type { AppConfig, BackupInfo } from '@shared/types'

const CONFIG_FILE = 'config.json'
const BACKUP_DIR = 'config_backups'
const MAX_BACKUPS = 10

export function defaultConfig(): AppConfig {
  return {
    version: 1,
    rules: [
      {
        id: randomUUID(), type: 'pack', name: '导出 Claude 配置', enabled: true,
        source: '${USERPROFILE}/.claude', output: 'claude.zip',
        excludes: ['projects', 'shell-snapshots', 'todos', 'plugins', 'session-env'],
      },
      {
        id: randomUUID(), type: 'import', name: '部署 Claude 配置', enabled: true,
        zip: 'claude.zip', target: '${USERPROFILE}/.claude', preserve: [], rename: '',
      },
      {
        id: randomUUID(), type: 'env', name: 'Python 控制台 UTF-8', enabled: true,
        key: 'PYTHONUTF8', value: '1', op: 'set',
      },
    ],
    settings: { backupBeforeImport: true },
    selectionMemory: { pack: {}, deploy: {} },
    uiState: {},
  }
}

export function configPath(baseDir: string): string {
  return path.join(baseDir, CONFIG_FILE)
}

export function loadConfig(baseDir: string): AppConfig {
  const file = configPath(baseDir)
  if (!fs.existsSync(file)) {
    const cfg = defaultConfig()
    saveConfig(baseDir, cfg)
    return cfg
  }
  let raw: Partial<AppConfig>
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<AppConfig>
  } catch {
    fs.renameSync(file, `${file}.corrupt-${timestamp()}`)
    const cfg = defaultConfig()
    saveConfig(baseDir, cfg)
    return cfg
  }
  const def = defaultConfig()
  return {
    version: raw.version ?? def.version,
    rules: Array.isArray(raw.rules) ? raw.rules : [],
    settings: { ...def.settings, ...raw.settings },
    selectionMemory: { pack: {}, deploy: {}, ...raw.selectionMemory },
    uiState: raw.uiState ?? {},
  }
}

export function saveConfig(baseDir: string, cfg: AppConfig): void {
  fs.writeFileSync(configPath(baseDir), JSON.stringify(cfg, null, 2), 'utf8')
}

function timestamp(): string {
  const d = new Date()
  const p = (n: number, w = 2): string => String(n).padStart(w, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${p(d.getMilliseconds(), 3)}`
}

export function backupConfig(baseDir: string): string {
  const src = configPath(baseDir)
  if (!fs.existsSync(src)) throw new Error('配置文件不存在，无可备份内容')
  const dir = path.join(baseDir, BACKUP_DIR)
  fs.mkdirSync(dir, { recursive: true })
  const dest = path.join(dir, `config-${timestamp()}.json`)
  fs.copyFileSync(src, dest)
  for (const extra of listBackups(baseDir).slice(MAX_BACKUPS)) fs.rmSync(extra.path)
  return dest
}

export function listBackups(baseDir: string): BackupInfo[] {
  const dir = path.join(baseDir, BACKUP_DIR)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const p = path.join(dir, f)
      return { file: f, path: p, mtime: fs.statSync(p).mtimeMs }
    })
    .sort((a, b) => b.mtime - a.mtime)
}

export function restoreConfig(baseDir: string, backupPath: string): AppConfig {
  fs.copyFileSync(backupPath, configPath(baseDir))
  return loadConfig(baseDir)
}
