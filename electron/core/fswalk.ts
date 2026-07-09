import fs from 'fs'
import path from 'path'
import { isExcluded } from './match'

export function collectFiles(source: string, patterns: string[]): { abs: string; rel: string }[] {
  const result: { abs: string; rel: string }[] = []
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name)
      const rel = path.relative(source, abs)
      if (isExcluded(rel, entry.name, patterns)) continue
      if (entry.isDirectory()) walk(abs)
      else if (entry.isFile()) result.push({ abs, rel })
    }
  }
  walk(source)
  return result
}

export function collectPreserved(root: string, patterns: string[]): { abs: string; rel: string }[] {
  if (!patterns.length) return []
  const result: { abs: string; rel: string }[] = []
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name)
      const rel = path.relative(root, abs)
      if (isExcluded(rel, entry.name, patterns)) {
        result.push({ abs, rel })
        continue
      }
      if (entry.isDirectory()) walk(abs)
    }
  }
  walk(root)
  return result
}
