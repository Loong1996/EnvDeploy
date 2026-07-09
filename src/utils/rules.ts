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
      return { ...base, type, key: '', value: '', op: 'set' }
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
    case 'env':
      return r.op === 'append_path' ? `${r.key} += ${r.value}` : `${r.key} = ${r.value}`
  }
}
