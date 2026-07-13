import { useState } from 'react'
import type { Person, Rule } from '@shared/types'
import { addPerson, removePerson, renamePerson } from '@shared/people'
import Modal from './Modal'

interface Props {
  people: Person[]
  rules: Rule[]
  onChange(people: Person[], rules: Rule[]): void
  onClose(): void
}

export default function PeopleManager({ people, rules, onChange, onClose }: Props) {
  const [name, setName] = useState('')

  const add = (): void => {
    const next = addPerson(people, crypto.randomUUID(), name)
    if (next !== people) { onChange(next, rules); setName('') }
  }
  const rename = (id: string, v: string): void => onChange(renamePerson(people, id, v), rules)
  const remove = (id: string): void => {
    const tagged = rules.filter(r => (r.people ?? []).includes(id))
    // 唯一归属:删除后 people 变空且非通用 → 规则变「未指派」,仅「全部」下可见
    const orphan = tagged.filter(r => !r.common && (r.people ?? []).every(x => x === id)).length
    const extra = orphan > 0 ? `，其中 ${orphan} 条将变为「未指派」（仅「全部」下可见）` : ''
    if (!confirm(`删除该人员将从 ${tagged.length} 条规则移除其标签${extra}。确定删除？`)) return
    const out = removePerson(people, rules, id)
    onChange(out.people, out.rules)
  }

  return (
    <Modal
      title="管理人员"
      onClose={onClose}
      footer={<><div className="spacer" /><button className="btn btn-primary" onClick={onClose}>完成</button></>}
    >
      <div className="people-add">
        <input
          value={name}
          placeholder="输入人员名称"
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add() }}
        />
        <button className="btn" onClick={add} disabled={!name.trim()}>添加</button>
      </div>
      {people.length === 0 && <div className="empty">尚无人员，先在上方添加</div>}
      <div className="people-list">
        {people.map(p => (
          <div key={p.id} className="people-row">
            <input value={p.name} onChange={e => rename(p.id, e.target.value)} />
            <button className="btn btn-danger" onClick={() => remove(p.id)}>删除</button>
          </div>
        ))}
      </div>
    </Modal>
  )
}
