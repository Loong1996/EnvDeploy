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
  return patterns.some(pat => {
    // ./ 前缀：锚定到根，按相对路径匹配——即使去掉 ./ 后不含 /，也只匹配根层，不波及子目录同名
    if (pat.startsWith('./')) return minimatch(rel, pat.slice(2), opts)
    // 含 / 的模式按相对路径匹配（定位具体位置）；裸名字按文件名匹配（所有层级同名）
    return pat.includes('/') ? minimatch(rel, pat, opts) : minimatch(name, pat, opts)
  })
}
