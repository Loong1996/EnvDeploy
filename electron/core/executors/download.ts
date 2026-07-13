import fs from 'fs'
import path from 'path'
import http from 'http'
import https from 'https'
import type { DownloadRule } from '@shared/types'
import type { ExecContext, RuleExecutor } from '../executor'
import { expandVars } from '../vars'

const MAX_REDIRECT = 5

function fetchTo(url: string, dest: string, ctx: ExecContext, redirects = 0): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (redirects > MAX_REDIRECT) return reject(new Error('重定向次数过多'))
    const mod = url.startsWith('https:') ? https : http
    const tmp = `${dest}.download`
    // 写流提升到请求作用域：请求层错误（含超时 destroy）也要关流、删临时文件
    let out: fs.WriteStream | null = null
    const fail = (err: Error): void => {
      if (out) {
        out.destroy()
        out = null
        fs.unlink(tmp, () => reject(err))
      } else {
        reject(err)
      }
    }
    const req = mod.get(url, res => {
      const status = res.statusCode ?? 0
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume()
        const next = new URL(res.headers.location, url).toString()
        resolve(fetchTo(next, dest, ctx, redirects + 1))
        return
      }
      if (status !== 200) {
        res.resume()
        reject(new Error(`下载失败，HTTP ${status}`))
        return
      }
      const total = Number(res.headers['content-length'] ?? 0)
      let received = 0
      out = fs.createWriteStream(tmp)
      res.on('data', chunk => {
        received += chunk.length
        ctx.onProgress(received, total || received, `${(received / 1048576).toFixed(1)} MiB`)
      })
      res.pipe(out)
      res.on('error', err => { res.destroy(); fail(err) })
      out.on('error', fail)
      out.on('finish', () => out?.close(() => {
        out = null
        try {
          fs.renameSync(tmp, dest)
          resolve()
        } catch (e) {
          fs.unlink(tmp, () => reject(e instanceof Error ? e : new Error(String(e))))
        }
      }))
    })
    req.on('error', fail)
    req.setTimeout(30000, () => req.destroy(new Error('下载超时')))
  })
}

export const downloadExecutor: RuleExecutor<DownloadRule> = {
  type: 'download',
  label: '下载',

  validate(rule) {
    const errs: string[] = []
    if (!rule.url?.trim()) errs.push('下载地址不能为空')
    else if (!/^https?:\/\//i.test(rule.url.trim())) errs.push('仅支持 http/https 地址')
    if (!rule.target?.trim()) errs.push('保存路径不能为空')
    return errs
  },

  async plan(rule) {
    const target = path.normalize(expandVars(rule.target))
    if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
      throw new Error(`保存路径是已存在的目录，请填写文件路径: ${target}`)
    }
    if (fs.existsSync(target) && !rule.overwrite) {
      return { noop: true, changes: [{ kind: 'noop', detail: `已存在，跳过: ${target}` }] }
    }
    return { noop: false, changes: [{ kind: 'download', detail: `下载 ${rule.url} → ${target}` }] }
  },

  async execute(rule, ctx) {
    const url = expandVars(rule.url).trim()
    if (!/^https?:\/\//i.test(url)) throw new Error('仅支持 http/https 地址')
    const target = path.normalize(expandVars(rule.target))
    if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
      throw new Error(`保存路径是已存在的目录，请填写文件路径: ${target}`)
    }
    if (fs.existsSync(target) && !rule.overwrite) {
      ctx.onProgress(1, 1, path.basename(target))
      return `目标已存在，跳过下载: ${target}`
    }
    fs.mkdirSync(path.dirname(target), { recursive: true })
    ctx.onProgress(0, 1, path.basename(target))
    await fetchTo(url, target, ctx)
    return `已下载到 ${target}`
  },
}
