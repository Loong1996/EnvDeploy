import type { Rule, RuleType } from '@shared/types'

export function newRule(type: RuleType): Rule {
  const base = { id: crypto.randomUUID(), name: '', enabled: true }
  switch (type) {
    case 'pack':
      return { ...base, type, source: '', output: '', excludes: [] }
    case 'import':
      return { ...base, type, zip: '', target: '', preserve: [], rename: '' }
    case 'json':
      return { ...base, type, file: '', op: 'upsert', data: {} }
    case 'env':
      return { ...base, type, key: '', value: '', op: 'set', scope: 'user', pathPosition: 'append' }
    case 'run':
      return { ...base, type, command: '', shell: 'powershell', cwd: '', elevated: false }
    case 'download':
      return { ...base, type, url: '', target: '', overwrite: false }
  }
}

export function moveRule(all: Rule[], draggedId: string, targetId: string): Rule[] {
  if (draggedId === targetId) return all
  const from = all.findIndex(r => r.id === draggedId)
  if (from < 0 || !all.some(r => r.id === targetId)) return all
  const next = [...all]
  const [moved] = next.splice(from, 1)
  next.splice(next.findIndex(r => r.id === targetId), 0, moved)
  return next
}

export function ruleSummary(r: Rule): string {
  switch (r.type) {
    case 'pack':
      return `${r.source} → ${r.output}`
    case 'import':
      return `${r.zip} → ${r.target}`
    case 'json':
      return `${r.file} (${r.op})`
    case 'env': {
      const tag = r.scope === 'machine' ? '[机器]' : '[用户]'
      if (r.op === 'remove') return `${tag} 移除 ${r.key}${r.value ? ` (${r.value})` : ''}`
      if (r.op === 'append_path') return `${tag} ${r.key} ${r.pathPosition === 'prepend' ? '^=' : '+='} ${r.value}`
      return `${tag} ${r.key} = ${r.value}`
    }
    case 'run': {
      const head = r.command.split(/\r?\n/).find(l => l.trim()) ?? '(空命令)'
      return `${r.shell}${r.elevated ? '·管理员' : ''}: ${head}`
    }
    case 'download':
      return `${r.url} → ${r.target}`
  }
}
