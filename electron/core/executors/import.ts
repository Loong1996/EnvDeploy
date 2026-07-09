import fs from 'fs'
import os from 'os'
import path from 'path'
import StreamZip from 'node-stream-zip'
import type { ImportRule } from '@shared/types'
import type { RuleExecutor } from '../executor'
import { expandVars } from '../vars'
import { normalizePatterns } from '../match'
import { collectPreserved } from '../fswalk'
import { resolvePackagePath } from '../paths'

function isZipFile(file: string): boolean {
  const buf = Buffer.alloc(4)
  const fd = fs.openSync(file, 'r')
  try {
    fs.readSync(fd, buf, 0, 4, 0)
  } finally {
    fs.closeSync(fd)
  }
  return buf.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
}

function timestamp(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

/** 把已存在的文件/目录移到旁边的 -backup-<时间戳> 位置 */
function backupAside(target: string): string {
  let dest = `${target}-backup-${timestamp()}`
  let n = 1
  while (fs.existsSync(dest)) dest = `${target}-backup-${timestamp()}-${n++}`
  fs.renameSync(target, dest)
  return dest
}

/** 防 zip-slip:目标必须落在 root 内 */
function safeJoin(root: string, entryName: string): string {
  const dest = path.join(root, entryName)
  const resolved = path.resolve(dest)
  const rootResolved = path.resolve(root)
  if (resolved !== rootResolved && !resolved.startsWith(rootResolved + path.sep)) {
    throw new Error(`非法压缩条目: ${entryName}`)
  }
  return dest
}

export const importExecutor: RuleExecutor<ImportRule> = {
  type: 'import',
  label: '导入',

  validate(rule) {
    const errs: string[] = []
    if (!rule.zip?.trim()) errs.push('源文件不能为空')
    if (!rule.target?.trim()) errs.push('目标目录不能为空')
    return errs
  },

  async execute(rule, ctx) {
    // 扩展预留:zip 字段语义为「本地路径或 URL」,远程源暂未实现
    if (/^https?:\/\//i.test(rule.zip)) throw new Error('暂不支持远程 zip 源（未来扩展）')
    const src = resolvePackagePath(ctx.baseDir, expandVars(rule.zip))
    const target = path.normalize(expandVars(rule.target))
    if (!fs.existsSync(src) || !fs.statSync(src).isFile()) throw new Error(`源文件不存在: ${src}`)

    // 非 zip:单文件复制
    if (!isZipFile(src)) {
      const filename = path.basename(rule.rename.trim()) || path.basename(src)
      fs.mkdirSync(target, { recursive: true })
      const dest = path.join(target, filename)
      if (fs.existsSync(dest)) {
        if (ctx.settings.backupBeforeImport) backupAside(dest)
        else fs.rmSync(dest, { recursive: true, force: true })
      }
      fs.copyFileSync(src, dest)
      ctx.onProgress(1, 1, filename)
      return `已复制文件到 ${dest}`
    }

    // 暂存 preserve 匹配项
    let tmpDir: string | null = null
    if (fs.existsSync(target)) {
      const preserved = collectPreserved(target, normalizePatterns(rule.preserve))
      if (preserved.length) {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jz-preserve-'))
        for (const { abs, rel } of preserved) {
          const dst = path.join(tmpDir, rel)
          fs.mkdirSync(path.dirname(dst), { recursive: true })
          fs.cpSync(abs, dst, { recursive: true })
        }
      }
      if (ctx.settings.backupBeforeImport) backupAside(target)
      else fs.rmSync(target, { recursive: true, force: true })
    }
    fs.mkdirSync(target, { recursive: true })

    const zip = new StreamZip.async({ file: src })
    let total = 0
    try {
      const entries = Object.values(await zip.entries())
      total = entries.length
      let done = 0
      for (const entry of entries) {
        const dest = safeJoin(target, entry.name)
        if (entry.isDirectory) {
          fs.mkdirSync(dest, { recursive: true })
        } else {
          fs.mkdirSync(path.dirname(dest), { recursive: true })
          await zip.extract(entry.name, dest)
        }
        ctx.onProgress(++done, total, entry.name)
      }
    } finally {
      await zip.close()
    }

    // 还原保留项(覆盖 zip 同名内容)
    if (tmpDir) {
      fs.cpSync(tmpDir, target, { recursive: true, force: true })
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }

    return `已解压 ${total} 个文件到 ${target}`
  },
}
