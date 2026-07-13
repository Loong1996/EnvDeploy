import fs from 'fs'
import path from 'path'

export function packagesDir(baseDir: string): string {
  const dir = path.join(baseDir, 'packages')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function resolvePackagePath(baseDir: string, p: string): string {
  return path.isAbsolute(p) ? path.normalize(p) : path.join(packagesDir(baseDir), p)
}

/**
 * child 是否等于 parent 或位于 parent 之内。用于阻止路径自包含
 * （如导入目标含程序自身数据目录、打包输出落在源目录内），否则复制/备份会自我嵌套、无限增长。
 * path.relative 在 win32 上对盘符/大小写已做归一，跨盘返回绝对路径。
 */
export function isInsideOrEqual(child: string, parent: string): boolean {
  const rel = path.relative(parent, child)
  if (rel === '') return true
  if (path.isAbsolute(rel)) return false
  return rel !== '..' && !rel.startsWith('..' + path.sep)
}
