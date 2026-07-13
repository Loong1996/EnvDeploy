import fs from 'fs'
import os from 'os'
import path from 'path'
import StreamZip from 'node-stream-zip'
import type { ImportRule, PlanChange } from '@shared/types'
import type { ExecContext, RuleExecutor } from '../executor'
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

/**
 * 把已存在的文件/目录**复制**到 exe 目录下的 backups/ 里。
 * 用复制而非 rename：rename 会在目标被占用/受控文件夹时报 EPERM，且无法跨卷。
 * 命名 <名字>-backup-<时间戳>，同秒冲突再加 -n，多次备份互不覆盖。
 */
function backupToStore(baseDir: string, target: string): string {
  const store = path.join(baseDir, 'backups')
  fs.mkdirSync(store, { recursive: true })
  const base = path.basename(target)
  let dest = path.join(store, `${base}-backup-${timestamp()}`)
  let n = 1
  while (fs.existsSync(dest)) dest = path.join(store, `${base}-backup-${timestamp()}-${n++}`)
  fs.cpSync(target, dest, { recursive: true })
  return dest
}

/** 备份一个路径，但同一次部署内同一目标只备份一次（ctx.backedUp 去重） */
function backupOnce(ctx: ExecContext, target: string): void {
  const key = path.normalize(target).toLowerCase()
  if (ctx.backedUp?.has(key)) return
  backupToStore(ctx.baseDir, target)
  ctx.backedUp?.add(key)
}

const LOCK_HINT = (name: string): string =>
  `「${name}」被占用，无法替换。请关闭正在使用它的程序（资源管理器 / 编辑器 / 终端）后重试；` +
  `开发模式（npm run dev）下若目标位于项目目录内，会被文件监视器占用，请改用项目外的目标目录。`

/** 带重试删除单个路径；被占用时抛出可操作提示。
 * 重试较多是为了盖过开发模式下 Vite 读取刚解压文件造成的短暂占用竞争。 */
function removePath(p: string, label = path.basename(p)): void {
  try {
    fs.rmSync(p, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    if (code === 'EPERM' || code === 'EBUSY' || code === 'EACCES') throw new Error(LOCK_HINT(label))
    throw e
  }
}

/**
 * 清空目录**内容**但保留目录本身：不去 rename/删除被占用的目录节点，
 * 只逐个删除里面的条目——目标目录被资源管理器/编辑器/监视器占用时更可能成功。
 * keep（小写顶层名集合）中的条目「原地保留」，跳过删除——避免删掉被占用的保留项而报错。
 */
function clearDirContents(dir: string, keep: Set<string> = new Set()): void {
  for (const name of fs.readdirSync(dir)) {
    if (keep.has(name.toLowerCase())) continue
    removePath(path.join(dir, name), name)
  }
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

  async plan(rule, ctx) {
    if (/^https?:\/\//i.test(rule.zip)) throw new Error('暂不支持远程 zip 源（未来扩展）')
    const src = resolvePackagePath(ctx.baseDir, expandVars(rule.zip))
    const target = path.normalize(expandVars(rule.target))
    if (!fs.existsSync(src) || !fs.statSync(src).isFile()) throw new Error(`源文件不存在: ${src}`)
    const doBackup = rule.backup ?? ctx.settings.backupBeforeImport

    // 备份去重：返回该目标本次是否需要备份，并登记
    const willBackup = (p: string): boolean => {
      if (!doBackup) return false
      const key = path.normalize(p).toLowerCase()
      const first = !ctx.backedUp?.has(key)
      ctx.backedUp?.add(key)
      return first
    }
    const bkText = (p: string): string => (willBackup(p) ? '备份到 backups/ 后' : doBackup ? '（本次已备份，跳过）' : '')

    if (!isZipFile(src)) {
      const filename = path.basename(rule.rename.trim()) || path.basename(src)
      const dest = path.join(target, filename)
      const changes: PlanChange[] = []
      const bk = fs.existsSync(dest) ? bkText(dest) : ''
      changes.push({ kind: 'create', detail: `${bk}复制文件 → ${dest}` })
      return { noop: false, changes }
    }

    const merge = (rule.mode ?? 'replace') === 'merge'
    const changes: PlanChange[] = []
    if (fs.existsSync(target)) {
      const preserved = collectPreserved(target, normalizePatterns(rule.preserve))
      const bk = bkText(target)
      changes.push({ kind: 'delete', detail: merge ? `${bk}叠加导入（不清空，覆盖同名）: ${target}` : `${bk}清空目标目录: ${target}` })
      if (preserved.length) changes.push({ kind: 'create', detail: `保留 ${preserved.length} 项` })
    }
    changes.push({ kind: 'create', detail: `${merge ? '叠加解压' : '解压导入'}到 ${target}` })
    return { noop: false, changes }
  },

  async execute(rule, ctx) {
    // 扩展预留:zip 字段语义为「本地路径或 URL」,远程源暂未实现
    if (/^https?:\/\//i.test(rule.zip)) throw new Error('暂不支持远程 zip 源（未来扩展）')
    const src = resolvePackagePath(ctx.baseDir, expandVars(rule.zip))
    const target = path.normalize(expandVars(rule.target))
    if (!fs.existsSync(src) || !fs.statSync(src).isFile()) throw new Error(`源文件不存在: ${src}`)
    const doBackup = rule.backup ?? ctx.settings.backupBeforeImport

    // 非 zip:单文件复制
    if (!isZipFile(src)) {
      const filename = path.basename(rule.rename.trim()) || path.basename(src)
      fs.mkdirSync(target, { recursive: true })
      const dest = path.join(target, filename)
      if (fs.existsSync(dest)) {
        if (doBackup) backupOnce(ctx, dest)
        // 目标是文件：copyFileSync 原地覆盖即可（不删文件节点，更稳）；是目录才需先删
        if (fs.statSync(dest).isDirectory()) removePath(dest)
      }
      fs.copyFileSync(src, dest)
      ctx.onProgress(1, 1, filename)
      return `已复制文件到 ${dest}`
    }

    // 保留策略：
    //  · 顶层整项（keepTop）「原地保留」——不快照、不删除、不被 zip 覆盖、不还原，被占用也不碰它；
    //  · 嵌套保留项（其所在顶层目录会被整体清空）仍走「快照→清空→还原」兜底。
    let tmpDir: string | null = null
    let keepTop = new Set<string>()
    if (fs.existsSync(target)) {
      const preserved = collectPreserved(target, normalizePatterns(rule.preserve))
      keepTop = new Set(
        preserved
          .map(p => p.rel.replace(/\\/g, '/'))
          .filter(r => !r.includes('/'))
          .map(r => r.toLowerCase()),
      )
      const nested = preserved.filter(p => p.rel.replace(/\\/g, '/').includes('/'))
      if (nested.length) {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jz-preserve-'))
        for (const { abs, rel } of nested) {
          const dst = path.join(tmpDir, rel)
          fs.mkdirSync(path.dirname(dst), { recursive: true })
          fs.cpSync(abs, dst, { recursive: true })
        }
      }
      if (doBackup) backupOnce(ctx, target)
      // merge=不清空，直接叠加覆盖同名；replace=清空后解压（顶层保留项跳过删除）
      if ((rule.mode ?? 'replace') === 'replace') clearDirContents(target, keepTop)
    }
    fs.mkdirSync(target, { recursive: true })

    const zip = new StreamZip.async({ file: src })
    let total = 0
    try {
      const entries = Object.values(await zip.entries())
      total = entries.length
      let done = 0
      for (const entry of entries) {
        // 顶层保留项：zip 不得覆盖其内容，整段跳过
        const topSeg = entry.name.replace(/\\/g, '/').split('/')[0].toLowerCase()
        if (keepTop.has(topSeg)) {
          ctx.onProgress(++done, total, entry.name)
          continue
        }
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

    // 还原嵌套保留项(覆盖 zip 同名内容);顶层保留项已原地保留，无需还原
    if (tmpDir) {
      fs.cpSync(tmpDir, target, { recursive: true, force: true })
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }

    return `已${(rule.mode ?? 'replace') === 'merge' ? '叠加' : '解压'} ${total} 个文件到 ${target}`
  },
}
