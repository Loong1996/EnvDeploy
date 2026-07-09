import fs from 'fs'
import path from 'path'
import { ZipArchive } from 'archiver'
import type { PackRule } from '@shared/types'
import type { RuleExecutor } from '../executor'
import { expandVars } from '../vars'
import { normalizePatterns } from '../match'
import { collectFiles } from '../fswalk'
import { resolvePackagePath } from '../paths'

export const packExecutor: RuleExecutor<PackRule> = {
  type: 'pack',
  label: '打包',

  validate(rule) {
    const errs: string[] = []
    if (!rule.source?.trim()) errs.push('源路径不能为空')
    if (!rule.output?.trim()) errs.push('输出文件不能为空')
    return errs
  },

  async execute(rule, ctx) {
    const source = path.normalize(expandVars(rule.source))
    const output = resolvePackagePath(ctx.baseDir, expandVars(rule.output))
    if (!fs.existsSync(source)) throw new Error(`源路径不存在: ${source}`)
    fs.mkdirSync(path.dirname(output), { recursive: true })

    if (!output.toLowerCase().endsWith('.zip')) {
      if (!fs.statSync(source).isFile()) throw new Error(`非 zip 输出仅支持单文件源: ${source}`)
      fs.copyFileSync(source, output)
      ctx.onProgress(1, 1, path.basename(output))
      return `已复制文件到 ${output}`
    }

    const files = fs.statSync(source).isFile()
      ? [{ abs: source, rel: path.basename(source) }]
      : collectFiles(source, normalizePatterns(rule.excludes))

    await new Promise<void>((resolve, reject) => {
      const out = fs.createWriteStream(output)
      const archive = new ZipArchive({ zlib: { level: 6 } })
      let done = 0
      archive.on('entry', entry => ctx.onProgress(++done, files.length, entry.name))
      archive.on('error', reject)
      out.on('error', reject)
      out.on('close', () => resolve())
      archive.pipe(out)
      for (const f of files) archive.file(f.abs, { name: f.rel.replace(/\\/g, '/') })
      void archive.finalize()
    })

    return `已打包 ${files.length} 个文件到 ${output}`
  },
}
