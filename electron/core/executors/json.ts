import fs from 'fs'
import path from 'path'
import type { JsonRule, PlanChange } from '@shared/types'
import type { RuleExecutor } from '../executor'
import { expandVars } from '../vars'

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/** 拆分点路径；含空段（a..b、首尾 .）视为非法 → null */
function splitPath(path: string): string[] | null {
  const segs = path.split('.')
  if (segs.some(s => s.length === 0)) return null
  return segs
}

/** 读点路径值；路径不存在或中途非对象 → undefined */
export function getByPath(obj: Record<string, unknown>, path: string): unknown {
  const segs = splitPath(path)
  if (!segs) return undefined
  let cur: unknown = obj
  for (const s of segs) {
    if (!isPlainObject(cur)) return undefined
    cur = cur[s]
  }
  return cur
}

/** 删除点路径末端 key；路径不存在 / 中途非对象 / 危险 key / 空段 → 不删，返回 false */
export function deleteByPath(obj: Record<string, unknown>, path: string): boolean {
  const segs = splitPath(path)
  if (!segs || segs.some(s => DANGEROUS_KEYS.has(s))) return false
  let cur: unknown = obj
  for (let i = 0; i < segs.length - 1; i++) {
    if (!isPlainObject(cur)) return false
    cur = cur[segs[i]]
  }
  if (!isPlainObject(cur)) return false
  const last = segs[segs.length - 1]
  if (!(last in cur)) return false
  delete cur[last]
  return true
}

/** 写点路径值；逐层建对象；命中危险 key / 空段则整条跳过 */
export function setByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const segs = splitPath(path)
  if (!segs || segs.some(s => DANGEROUS_KEYS.has(s))) return
  let cur: Record<string, unknown> = obj
  for (let i = 0; i < segs.length - 1; i++) {
    const s = segs[i]
    if (!isPlainObject(cur[s])) cur[s] = {}
    cur = cur[s] as Record<string, unknown>
  }
  cur[segs[segs.length - 1]] = value
}

/**
 * 统一收尾：对每个「在原文件里存在」的 preserve 路径，把原值写回结果对应位置。
 * 返回实际保留（原文件存在）的路径列表，供 plan/日志统计。
 */
function applyPreserve(
  result: Record<string, unknown>,
  existing: Record<string, unknown>,
  preserve: string[] | undefined,
): string[] {
  const kept: string[] = []
  for (const p of preserve ?? []) {
    const old = getByPath(existing, p)
    if (old !== undefined) {
      setByPath(result, p, old)
      kept.push(p)
    }
  }
  return kept
}

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
    if (rule.op === 'delete') {
      if (!(rule.keys ?? []).some(k => k.trim())) errs.push('请至少指定一个要删除的 key')
    } else if (!isPlainObject(rule.data)) {
      errs.push('数据必须是 JSON 对象')
    }
    return errs
  },

  async plan(rule) {
    const filepath = path.normalize(expandVars(rule.file))
    const data = rule.data
    if (!isPlainObject(data)) return { noop: false, changes: [{ kind: 'modify', detail: '数据不是对象' }] }
    if (rule.op === 'overwrite') {
      const exists = fs.existsSync(filepath)
      const changes: PlanChange[] = [{ kind: exists ? 'modify' : 'create', detail: `全量写入 ${filepath}` }]
      if (exists && rule.preserve?.length) {
        const prev: unknown = JSON.parse(fs.readFileSync(filepath, 'utf8'))
        if (isPlainObject(prev)) {
          const kept = rule.preserve.filter(p => getByPath(prev, p) !== undefined)
          if (kept.length) changes.push({ kind: 'noop', detail: `保留 ${kept.length} 项：${kept.join(', ')}` })
        }
      }
      return { noop: false, changes }
    }
    if (!fs.existsSync(filepath)) throw new Error(`文件不存在: ${filepath}`)
    const existing: unknown = JSON.parse(fs.readFileSync(filepath, 'utf8'))
    if (!isPlainObject(existing)) throw new Error(`JSON 文件顶层不是对象: ${filepath}`)
    if (rule.op === 'delete') {
      const probe = structuredClone(existing)
      const hit = (rule.keys ?? []).filter(k => deleteByPath(probe, k))
      if (!hit.length) return { noop: true, changes: [{ kind: 'noop', detail: '目标 key 均不存在，无变化' }] }
      return { noop: false, changes: hit.map(k => ({ kind: 'delete', detail: k })) }
    }
    if (rule.op === 'append') {
      const conflicts = Object.keys(data).filter(k => k in existing)
      if (conflicts.length) throw new Error(`以下 key 已存在，无法追加: ${conflicts.join(', ')}`)
    } else if (rule.op === 'modify') {
      const missing = Object.keys(data).filter(k => !(k in existing))
      if (missing.length) throw new Error(`以下 key 不存在，无法修改: ${missing.join(', ')}`)
    }
    const merged = deepMerge(existing, data)
    const kept = rule.op === 'upsert' ? applyPreserve(merged, existing, rule.preserve) : []
    if (JSON.stringify(merged) === JSON.stringify(existing)) {
      return { noop: true, changes: [{ kind: 'noop', detail: '已是目标状态，无变化' }] }
    }
    const changes: PlanChange[] = Object.keys(data).map(k => ({
      kind: (k in existing ? 'modify' : 'create') as PlanChange['kind'],
      detail: `${k}`,
    }))
    if (kept.length) changes.push({ kind: 'noop', detail: `保留 ${kept.length} 项：${kept.join(', ')}` })
    return { noop: false, changes }
  },

  async execute(rule, ctx) {
    const filepath = path.normalize(expandVars(rule.file))
    const data = rule.data
    if (!isPlainObject(data)) throw new Error('数据必须是 JSON 对象')
    ctx.onProgress(0, 1, path.basename(filepath))

    if (rule.op === 'overwrite') {
      fs.mkdirSync(path.dirname(filepath), { recursive: true })
      const out = structuredClone(data)
      if (fs.existsSync(filepath)) {
        const prev: unknown = JSON.parse(fs.readFileSync(filepath, 'utf8'))
        if (isPlainObject(prev)) applyPreserve(out, prev, rule.preserve)
        fs.copyFileSync(filepath, filepath + '.bak')
      }
      fs.writeFileSync(filepath, JSON.stringify(out, null, 2), 'utf8')
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
      applyPreserve(merged, existing, rule.preserve)
      msg = `已合并 ${Object.keys(data).length} 个 key 到 ${filepath}`
    } else if (rule.op === 'delete') {
      const out = structuredClone(existing)
      const removed = (rule.keys ?? []).filter(k => deleteByPath(out, k))
      merged = out
      msg = `已删除 ${removed.length} 个 key 从 ${filepath}`
    } else {
      throw new Error(`未知操作: ${String(rule.op)}`)
    }

    fs.writeFileSync(filepath, JSON.stringify(merged, null, 2), 'utf8')
    ctx.onProgress(1, 1, path.basename(filepath))
    return msg
  },
}
