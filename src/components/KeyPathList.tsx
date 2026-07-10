interface Props {
  value: string[]
  onChange(v: string[]): void
  placeholder?: string
}

/** 逐行点路径编辑器：每条路径一行（输入框 + 删除），底部「＋ 添加」新增空行。 */
export default function KeyPathList({ value, onChange, placeholder }: Props) {
  const rows = value.length ? value : ['']

  const setAt = (i: number, v: string): void => {
    const next = rows.slice()
    next[i] = v
    onChange(next)
  }
  const removeAt = (i: number): void => onChange(rows.filter((_, j) => j !== i))
  const add = (): void => onChange([...rows, ''])

  return (
    <div className="keypath-list">
      {rows.map((p, i) => (
        <div className="keypath-row" key={i}>
          <input value={p} placeholder={placeholder} onChange={e => setAt(i, e.target.value)} />
          <button className="btn" type="button" onClick={() => removeAt(i)}>删除</button>
        </div>
      ))}
      <button className="btn keypath-add" type="button" onClick={add}>＋ 添加</button>
    </div>
  )
}
