import { useEffect, useMemo, useState } from 'react'
import Modal from './Modal'

/** 常用变量候选（大小写不敏感匹配实际 key，按此顺序置顶） */
const COMMON = [
  'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA',
  'PROGRAMFILES', 'PROGRAMFILES(X86)', 'PUBLIC', 'TEMP', 'TMP', 'SYSTEMROOT',
  'WINDIR', 'SYSTEMDRIVE', 'USERNAME', 'COMPUTERNAME', 'USERDOMAIN',
]

interface Props {
  onClose(): void
}

interface Row {
  name: string
  value: string
}

export default function VarReference({ onClose }: Props) {
  const [vars, setVars] = useState<Record<string, string> | null>(null)
  const [q, setQ] = useState('')
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    void window.api.envVars().then(setVars)
  }, [])

  const { common, rest } = useMemo(() => {
    if (!vars) return { common: [] as Row[], rest: [] as Row[] }
    const lookup = new Map<string, string>() // 大写名 → 实际 key
    for (const k of Object.keys(vars)) lookup.set(k.toUpperCase(), k)
    const used = new Set<string>()
    const common: Row[] = []
    for (const name of COMMON) {
      const actual = lookup.get(name.toUpperCase())
      if (actual && !used.has(actual)) {
        common.push({ name: actual, value: vars[actual] })
        used.add(actual)
      }
    }
    const rest: Row[] = Object.keys(vars)
      .filter(k => !used.has(k))
      .sort((a, b) => a.localeCompare(b))
      .map(k => ({ name: k, value: vars[k] }))
    return { common, rest }
  }, [vars])

  const kw = q.trim().toLowerCase()
  const match = (r: Row): boolean =>
    !kw || r.name.toLowerCase().includes(kw) || r.value.toLowerCase().includes(kw)
  const fCommon = common.filter(match)
  const fRest = rest.filter(match)

  const copy = (name: string): void => {
    navigator.clipboard.writeText('${' + name + '}').then(() => setCopied(name), () => {})
  }

  const renderRow = (r: Row) => (
    <div className="var-row" key={r.name}>
      <code className="var-name">{'${' + r.name + '}'}</code>
      <code className="var-value" title={r.value}>{r.value}</code>
      <button className="btn var-copy" onClick={() => copy(r.name)}>
        {copied === r.name ? '已复制' : '复制'}
      </button>
    </div>
  )

  return (
    <Modal title={'可用环境变量（${VAR}）'} onClose={onClose}>
      <input
        className="var-search"
        placeholder="搜索变量名或值…"
        value={q}
        onChange={e => setQ(e.target.value)}
        autoFocus
      />
      <div className="var-ref">
        {!vars && <div className="dim">加载中…</div>}
        {vars && fCommon.length > 0 && (
          <>
            <div className="var-group">常用</div>
            {fCommon.map(renderRow)}
          </>
        )}
        {vars && fRest.length > 0 && (
          <>
            <div className="var-group">全部</div>
            {fRest.map(renderRow)}
          </>
        )}
        {vars && fCommon.length === 0 && fRest.length === 0 && <div className="dim">无匹配变量</div>}
      </div>
    </Modal>
  )
}
