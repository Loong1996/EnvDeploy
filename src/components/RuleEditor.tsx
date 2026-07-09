import { useState, type ReactNode } from 'react'
import type { EnvOp, JsonOp, Rule } from '@shared/types'
import Modal from './Modal'
import TagInput from './TagInput'

interface Props {
  rule: Rule
  isNew: boolean
  typeLabel: string
  onSave(r: Rule): void
  onClose(): void
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      {children}
    </div>
  )
}

function PathRow({ value, onChange, pick, placeholder }: {
  value: string
  onChange(v: string): void
  pick?: 'file' | 'dir'
  placeholder?: string
}) {
  const browse = async (): Promise<void> => {
    const p = pick === 'dir' ? await window.api.pickDir() : await window.api.pickFile()
    if (p) onChange(p)
  }
  return (
    <div className="path-row">
      <input value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
      {pick && <button className="btn" onClick={() => void browse()}>浏览…</button>}
    </div>
  )
}

export default function RuleEditor({ rule, isNew, typeLabel, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<Rule>(() => structuredClone(rule))
  const [jsonText, setJsonText] = useState(() =>
    rule.type === 'json' ? JSON.stringify(rule.data, null, 2) : '',
  )
  const [errors, setErrors] = useState<string[]>([])

  const patch = (p: object): void => setDraft(d => ({ ...d, ...p }) as Rule)

  const save = (): void => {
    const errs: string[] = []
    const final = structuredClone(draft)
    if (!final.name.trim()) errs.push('名称不能为空')
    switch (final.type) {
      case 'pack':
        if (!final.source.trim()) errs.push('源路径不能为空')
        if (!final.output.trim()) errs.push('输出文件不能为空')
        break
      case 'import':
        if (!final.zip.trim()) errs.push('源文件不能为空')
        if (!final.target.trim()) errs.push('目标目录不能为空')
        break
      case 'json': {
        if (!final.file.trim()) errs.push('文件路径不能为空')
        try {
          const d: unknown = JSON.parse(jsonText.trim() || '{}')
          if (typeof d !== 'object' || d === null || Array.isArray(d)) errs.push('数据必须是 JSON 对象')
          else final.data = d as Record<string, unknown>
        } catch {
          errs.push('JSON 数据格式错误')
        }
        break
      }
      case 'env':
        if (!final.key.trim()) errs.push('变量名不能为空')
        break
    }
    if (errs.length) {
      setErrors(errs)
      return
    }
    onSave(final)
  }

  return (
    <Modal
      title={`${isNew ? '新建' : '编辑'}${typeLabel}规则`}
      onClose={onClose}
      footer={
        <>
          <div className="spacer" />
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={save}>保存</button>
        </>
      }
    >
      <Field label="名称">
        <input value={draft.name} placeholder="给这条规则起个名字" onChange={e => patch({ name: e.target.value })} />
      </Field>

      {draft.type === 'pack' && (
        <>
          <Field label="源路径（目录或文件，支持 ${VAR} 环境变量）">
            <PathRow value={draft.source} onChange={v => patch({ source: v })} pick="dir" placeholder="${USERPROFILE}/.claude" />
          </Field>
          <Field label="输出文件（相对路径存入 packages/，.zip 打包、其它后缀单文件直拷）">
            <PathRow value={draft.output} onChange={v => patch({ output: v })} placeholder="claude.zip" />
          </Field>
          <Field label="排除（文件/目录名或相对路径，支持 * 通配符）">
            <TagInput value={draft.excludes} onChange={v => patch({ excludes: v })} placeholder="输入后回车添加" />
          </Field>
        </>
      )}

      {draft.type === 'import' && (
        <>
          <Field label="源文件（zip 或任意文件，相对路径从 packages/ 查找）">
            <PathRow value={draft.zip} onChange={v => patch({ zip: v })} pick="file" placeholder="claude.zip" />
          </Field>
          <Field label="目标目录（支持 ${VAR} 环境变量）">
            <PathRow value={draft.target} onChange={v => patch({ target: v })} pick="dir" placeholder="${USERPROFILE}/.claude" />
          </Field>
          <Field label="重命名（仅非 zip 单文件生效，留空保持原名）">
            <input value={draft.rename} onChange={e => patch({ rename: e.target.value })} />
          </Field>
          <Field label="保留（导入时保留目标目录中匹配的文件/目录，优先于 zip 内容）">
            <TagInput value={draft.preserve} onChange={v => patch({ preserve: v })} placeholder="输入后回车添加" />
          </Field>
        </>
      )}

      {draft.type === 'json' && (
        <>
          <Field label="JSON 文件路径（支持 ${VAR} 环境变量）">
            <PathRow value={draft.file} onChange={v => patch({ file: v })} pick="file" />
          </Field>
          <Field label="操作">
            <select value={draft.op} onChange={e => patch({ op: e.target.value as JsonOp })}>
              <option value="upsert">upsert — 有则改、无则加</option>
              <option value="append">append — 仅新增，key 已存在则报错</option>
              <option value="modify">modify — 仅修改，key 不存在则报错</option>
              <option value="overwrite">overwrite — 全量覆盖整个文件</option>
            </select>
          </Field>
          <Field label="数据（JSON 对象，嵌套对象逐层合并）">
            <textarea rows={10} value={jsonText} spellCheck={false} onChange={e => setJsonText(e.target.value)} />
          </Field>
        </>
      )}

      {draft.type === 'env' && (
        <>
          <Field label="变量名">
            <input value={draft.key} placeholder="PYTHONUTF8 / Path" onChange={e => patch({ key: e.target.value })} />
          </Field>
          <Field label="值（支持 ${VAR} 环境变量；含 % 时按可展开字符串写入）">
            <input value={draft.value} onChange={e => patch({ value: e.target.value })} />
          </Field>
          <Field label="操作">
            <select value={draft.op} onChange={e => patch({ op: e.target.value as EnvOp })}>
              <option value="set">set — 直接设置变量值</option>
              <option value="append_path">append_path — 追加到分号分隔列表（自动去重）</option>
            </select>
          </Field>
        </>
      )}

      {errors.length > 0 && (
        <div className="form-errors">
          {errors.map((e, i) => (
            <div key={i}>• {e}</div>
          ))}
        </div>
      )}
    </Modal>
  )
}
