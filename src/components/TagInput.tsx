import { useState } from 'react'

interface Props {
  value: string[]
  onChange(v: string[]): void
  placeholder?: string
}

export default function TagInput({ value, onChange, placeholder }: Props) {
  const [text, setText] = useState('')

  const add = (): void => {
    const t = text.trim()
    if (t && !value.includes(t)) onChange([...value, t])
    setText('')
  }

  return (
    <div className="tag-input">
      {value.map(t => (
        <span className="tag" key={t}>
          {t}
          <button onClick={() => onChange(value.filter(x => x !== t))}>×</button>
        </span>
      ))}
      <input
        value={text}
        placeholder={placeholder}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault()
            add()
          }
        }}
        onBlur={add}
      />
    </div>
  )
}
