import { useMemo, useRef, useState } from 'react'
import type { Person, Rule, RuleType, RuleTypeInfo } from '@shared/types'
import { ruleMatchesPerson } from '@shared/people'
import RuleCard from './RuleCard'
import { ruleSummary } from '../utils/rules'

interface Props {
  rules: Rule[]
  types: RuleTypeInfo[]
  showTypeFilter: boolean
  addTypes: RuleType[]
  people: Person[]
  personId: string | null
  onSelectPerson(id: string | null): void
  onAdd(type: RuleType): void
  onEdit(rule: Rule): void
  onDelete(id: string): void
  onRun(id: string): void
  onToggle(id: string, enabled: boolean): void
  onMove(draggedId: string, targetId: string): void
  onImport?(): void
  onImportExample?(): void
}

export default function RuleList(props: Props) {
  const [typeFilter, setTypeFilter] = useState<RuleType | 'all'>('all')
  const [search, setSearch] = useState('')
  const dragId = useRef<string | null>(null)

  const labelOf = (t: RuleType): string => props.types.find(x => x.type === t)?.label ?? t

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase()
    return props.rules.filter(r => {
      if (!ruleMatchesPerson(r, props.personId)) return false
      if (typeFilter !== 'all' && r.type !== typeFilter) return false
      if (kw && !r.name.toLowerCase().includes(kw) && !ruleSummary(r).toLowerCase().includes(kw)) return false
      return true
    })
  }, [props.rules, props.personId, typeFilter, search])

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
        <select
          className="person-select"
          value={props.personId ?? ''}
          onChange={e => props.onSelectPerson(e.target.value === '' ? null : e.target.value)}
        >
          <option value="">👥 全部人员</option>
          {props.people.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
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

      {filtered.length === 0 && (
        <div className="empty">
          <div>暂无规则</div>
          <div className="empty-actions">
            {props.addTypes[0] && (
              <button className="btn" onClick={() => props.onAdd(props.addTypes[0])}>＋ 新建规则</button>
            )}
            {props.onImport && <button className="btn" onClick={props.onImport}>导入规则集</button>}
            {props.onImportExample && <button className="btn" onClick={props.onImportExample}>导入 AI 示例</button>}
          </div>
        </div>
      )}
      {filtered.map(rule => (
        <RuleCard
          key={rule.id}
          rule={rule}
          typeLabel={labelOf(rule.type)}
          people={props.people}
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
