import { useMemo, useRef, useState } from 'react'
import type { Rule, RuleType, RuleTypeInfo } from '@shared/types'
import RuleCard from './RuleCard'
import { ruleSummary } from '../utils/rules'

interface Props {
  rules: Rule[]
  types: RuleTypeInfo[]
  showTypeFilter: boolean
  addTypes: RuleType[]
  onAdd(type: RuleType): void
  onEdit(rule: Rule): void
  onDelete(id: string): void
  onRun(id: string): void
  onToggle(id: string, enabled: boolean): void
  onMove(draggedId: string, targetId: string): void
}

export default function RuleList(props: Props) {
  const [typeFilter, setTypeFilter] = useState<RuleType | 'all'>('all')
  const [search, setSearch] = useState('')
  const dragId = useRef<string | null>(null)

  const labelOf = (t: RuleType): string => props.types.find(x => x.type === t)?.label ?? t

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase()
    return props.rules.filter(r => {
      if (typeFilter !== 'all' && r.type !== typeFilter) return false
      if (kw && !r.name.toLowerCase().includes(kw) && !ruleSummary(r).toLowerCase().includes(kw)) return false
      return true
    })
  }, [props.rules, typeFilter, search])

  return (
    <div className="rule-list">
      <div className="toolbar">
        {props.showTypeFilter && (
          <div className="segments">
            <button className={typeFilter === 'all' ? 'seg active' : 'seg'} onClick={() => setTypeFilter('all')}>
              全部
            </button>
            {props.types.map(t => (
              <button
                key={t.type}
                className={typeFilter === t.type ? 'seg active' : 'seg'}
                onClick={() => setTypeFilter(t.type)}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
        <input
          className="search"
          placeholder="搜索名称 / 路径…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="spacer" />
        {props.addTypes.map(t => (
          <button key={t} className="btn" onClick={() => props.onAdd(t)}>
            ＋ {labelOf(t)}规则
          </button>
        ))}
      </div>

      {filtered.length === 0 && <div className="empty">暂无规则，点击右上角新建</div>}
      {filtered.map(rule => (
        <RuleCard
          key={rule.id}
          rule={rule}
          typeLabel={labelOf(rule.type)}
          onEdit={() => props.onEdit(rule)}
          onDelete={() => props.onDelete(rule.id)}
          onRun={() => props.onRun(rule.id)}
          onToggle={v => props.onToggle(rule.id, v)}
          onDragStart={() => { dragId.current = rule.id }}
          onDropOn={() => {
            if (dragId.current) props.onMove(dragId.current, rule.id)
            dragId.current = null
          }}
        />
      ))}
    </div>
  )
}
