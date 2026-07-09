import { minimatch } from 'minimatch'

export function normalizePatterns(patterns: string[] | undefined): string[] {
  if (!patterns) return []
  return patterns
    .map(p => p.trim().replace(/\\/g, '/').replace(/\/+$/, ''))
    .filter(Boolean)
}

export function isExcluded(relPath: string, name: string, patterns: string[]): boolean {
  if (!patterns.length) return false
  const rel = relPath.replace(/\\/g, '/')
  const opts = { dot: true, nocase: true }
  return patterns.some(pat =>
    pat.includes('/') ? minimatch(rel, pat, opts) : minimatch(name, pat, opts),
  )
}
