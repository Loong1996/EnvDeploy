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
