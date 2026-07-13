import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  backupConfig, configPath, defaultConfig, listBackups, loadConfig, restoreConfig, saveConfig,
} from '../electron/core/config'

let tmp: string
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jz-config-'))
})
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('config', () => {
  it('defaultConfig 结构完整且规则默认为空', () => {
    const cfg = defaultConfig()
    expect(cfg.version).toBe(2)
    expect(cfg.rules.length).toBe(0)
    expect(cfg.settings.backupBeforeImport).toBe(true)
    expect(cfg.people).toEqual([])
  })

  it('loadConfig 首次调用生成默认配置并落盘', () => {
    const cfg = loadConfig(tmp)
    expect(fs.existsSync(configPath(tmp))).toBe(true)
    expect(cfg.rules.length).toBe(0)
  })

  it('save + load 往返一致', () => {
    const cfg = loadConfig(tmp)
    cfg.rules = []
    cfg.settings.backupBeforeImport = false
    saveConfig(tmp, cfg)
    const again = loadConfig(tmp)
    expect(again.rules).toEqual([])
    expect(again.settings.backupBeforeImport).toBe(false)
  })

  it('手改后缺字段能兜底补全', () => {
    fs.writeFileSync(configPath(tmp), JSON.stringify({ version: 1, rules: [] }), 'utf8')
    const cfg = loadConfig(tmp)
    expect(cfg.settings.backupBeforeImport).toBe(true)
    expect(cfg.selectionMemory).toEqual({ pack: {}, deploy: {} })
    expect(cfg.uiState).toEqual({})
  })

  it('加载老规则(无 common/people)规范化为通用,补 people 名单', () => {
    fs.writeFileSync(
      configPath(tmp),
      JSON.stringify({
        version: 1,
        rules: [{ id: 'r1', type: 'env', name: 'old', enabled: true, key: 'K', value: 'V', op: 'set' }],
      }),
      'utf8',
    )
    const cfg = loadConfig(tmp)
    expect(cfg.people).toEqual([])
    expect(cfg.rules[0].common).toBe(true)
    expect(cfg.rules[0].people).toEqual([])
  })

  it('损坏的 config.json 被移到一旁并回退默认配置', () => {
    fs.writeFileSync(configPath(tmp), '{ not valid json', 'utf8')
    const cfg = loadConfig(tmp)
    expect(cfg.rules.length).toBe(0)
    // 坏文件被保留改名，新配置已落盘可正常解析
    expect(fs.readdirSync(tmp).some(f => f.startsWith('config.json.corrupt-'))).toBe(true)
    expect(() => JSON.parse(fs.readFileSync(configPath(tmp), 'utf8'))).not.toThrow()
  })

  it('backup/list/restore 闭环且最多保留 10 份', () => {
    // 备份前写入带标记的配置,用于验证 restore 真实回读
    const marked = loadConfig(tmp)
    marked.rules = [
      { id: 'marker', type: 'env', name: 'M', enabled: true, key: 'X', value: '1', op: 'set', scope: 'user' },
    ]
    saveConfig(tmp, marked)
    const dest = backupConfig(tmp)
    expect(fs.existsSync(dest)).toBe(true)
    expect(listBackups(tmp).length).toBe(1)

    // 预置 12 份旧备份,再 backup 一次后总数不超过 10
    const dir = path.join(tmp, 'config_backups')
    for (let i = 0; i < 12; i++) {
      const p = path.join(dir, `config-old-${String(i).padStart(2, '0')}.json`)
      fs.writeFileSync(p, '{}')
      fs.utimesSync(p, new Date(2020, 0, 1 + i), new Date(2020, 0, 1 + i))
    }
    backupConfig(tmp)
    expect(listBackups(tmp).length).toBeLessThanOrEqual(10)

    // 将当前配置改成不同状态,再 restore 应回读到备份中的标记
    const cfg = loadConfig(tmp)
    cfg.rules = []
    saveConfig(tmp, cfg)
    const restored = restoreConfig(tmp, dest)
    expect(restored.rules.length).toBe(1)
    expect(restored.rules[0].id).toBe('marker')
  })
})
