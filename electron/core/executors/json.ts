import fs from 'fs'
import path from 'path'
import type { JsonRule } from '@shared/types'
import type { RuleExecutor } from '../executor'
import { expandVars } from '../vars'

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

export function deepMerge(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base }
  for (const [k, v] of Object.entries(overlay)) {
    if (DANGEROUS_KEYS.has(k)) continue
    const cur = result[k]
    result[k] = isPlainObject(cur) && isPlainObject(v) ? deepMerge(cur, v) : v
  }
  return result
}

export const jsonExecutor: RuleExecutor<JsonRule> = {
  type: 'json',
  label: 'JSON',

  validate(rule) {
    const errs: string[] = []
    if (!rule.file?.trim()) errs.push('文件路径不能为空')
    if (!isPlainObject(rule.data)) errs.push('数据必须是 JSON 对象')
    return errs
  },

  async execute(rule, ctx) {
    const filepath = path.normalize(expandVars(rule.file))
    const data = rule.data
    if (!isPlainObject(data)) throw new Error('数据必须是 JSON 对象')
    ctx.onProgress(0, 1, path.basename(filepath))

    if (rule.op === 'overwrite') {
      fs.mkdirSync(path.dirname(filepath), { recursive: true })
      if (fs.existsSync(filepath)) fs.copyFileSync(filepath, filepath + '.bak')
      fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8')
      ctx.onProgress(1, 1, path.basename(filepath))
      return `已全量覆盖 ${filepath}`
    }

    if (!fs.existsSync(filepath)) throw new Error(`文件不存在: ${filepath}`)
    const existing: unknown = JSON.parse(fs.readFileSync(filepath, 'utf8'))
    if (!isPlainObject(existing)) throw new Error(`JSON 文件顶层不是对象: ${filepath}`)

    fs.copyFileSync(filepath, filepath + '.bak')

    let merged: Record<string, unknown>
    let msg: string
    if (rule.op === 'append') {
      const conflicts = Object.keys(data).filter(k => k in existing)
      if (conflicts.length) throw new Error(`以下 key 已存在，无法追加: ${conflicts.join(', ')}`)
      merged = deepMerge(existing, data)
      msg = `已追加 ${Object.keys(data).length} 个 key 到 ${filepath}`
    } else if (rule.op === 'modify') {
      const missing = Object.keys(data).filter(k => !(k in existing))
      if (missing.length) throw new Error(`以下 key 不存在，无法修改: ${missing.join(', ')}`)
      merged = deepMerge(existing, data)
      msg = `已修改 ${Object.keys(data).length} 个 key 在 ${filepath}`
    } else if (rule.op === 'upsert') {
      merged = deepMerge(existing, data)
      msg = `已合并 ${Object.keys(data).length} 个 key 到 ${filepath}`
    } else {
      throw new Error(`未知操作: ${String(rule.op)}`)
    }

    fs.writeFileSync(filepath, JSON.stringify(merged, null, 2), 'utf8')
    ctx.onProgress(1, 1, path.basename(filepath))
    return msg
  },
}
