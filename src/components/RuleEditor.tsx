import { useState, type ReactNode } from 'react'
import type { EnvOp, EnvScope, ImportMode, JsonOp, PathPosition, Person, Rule, RunShell } from '@shared/types'
import Modal from './Modal'
import TagInput from './TagInput'
import VarReference from './VarReference'
import KeyPathList from './KeyPathList'

interface Props {
  rule: Rule
  isNew: boolean
  typeLabel: string
  people: Person[]
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
  pick?: 'file' | 'dir' | 'both' | 'packageFile'
  placeholder?: string
}) {
  const choose = async (kind: 'file' | 'dir' | 'packageFile'): Promise<void> => {
    // Windows 上一个原生对话框无法同时选文件和文件夹，故 both 时分两个按钮
    const p = kind === 'dir' ? await window.api.pickDir()
      : kind === 'packageFile' ? await window.api.pickPackageFile()
      : await window.api.pickFile()
    if (p) onChange(p)
  }
  return (
    <div className="path-row">
      <input value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
      {pick === 'both' ? (
        <>
          <button className="btn" onClick={() => void choose('file')}>文件…</button>
          <button className="btn" onClick={() => void choose('dir')}>文件夹…</button>
        </>
      ) : pick ? (
        <button className="btn" onClick={() => void choose(pick === 'dir' ? 'dir' : pick === 'packageFile' ? 'packageFile' : 'file')}>浏览…</button>
      ) : null}
    </div>
  )
}

export default function RuleEditor({ rule, isNew, typeLabel, people, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<Rule>(() => structuredClone(rule))
  const [jsonText, setJsonText] = useState(() =>
    rule.type === 'json' ? JSON.stringify(rule.data, null, 2) : '',
  )
  const [errors, setErrors] = useState<string[]>([])
  const [showVars, setShowVars] = useState(false)

  const patch = (p: object): void => setDraft(d => ({ ...d, ...p }) as Rule)

  const save = (): void => {
    const errs: string[] = []
    const final = structuredClone(draft)
    if (!final.name.trim()) errs.push('名称不能为空')
    if (!final.common && (final.people ?? []).length === 0) {
      errs.push('请勾选「通用」或至少指定一个人员')
    }
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
        if (final.op === 'delete') {
          final.keys = (final.keys ?? []).map(s => s.trim()).filter(Boolean)
          if (!final.keys.length) errs.push('请至少指定一个要删除的 key')
        } else {
          try {
            const d: unknown = JSON.parse(jsonText.trim() || '{}')
            if (typeof d !== 'object' || d === null || Array.isArray(d)) errs.push('数据必须是 JSON 对象')
            else final.data = d as Record<string, unknown>
          } catch {
            errs.push('JSON 数据格式错误')
          }
          final.preserve = (final.preserve ?? []).map(s => s.trim()).filter(Boolean)
        }
        break
      }
      case 'env':
        if (!final.key.trim()) errs.push('变量名不能为空')
        break
      case 'run':
        if (!final.command.trim()) errs.push('命令不能为空')
        break
      case 'download':
        if (!final.url.trim()) errs.push('下载地址不能为空')
        else if (!/^https?:\/\//i.test(final.url.trim())) errs.push('仅支持 http/https 地址')
        if (!final.target.trim()) errs.push('保存路径不能为空')
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
          <button className="btn" type="button" onClick={() => setShowVars(true)}>查看可用变量 {'${VAR}'}</button>
          <div className="spacer" />
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={save}>保存</button>
        </>
      }
    >
      <Field label="名称">
        <input value={draft.name} placeholder="给这条规则起个名字" onChange={e => patch({ name: e.target.value })} />
      </Field>

      <Field label="部署对象">
        <div className="chip-group">
          <button
            type="button"
            className={draft.common ? 'chip chip-on' : 'chip'}
            onClick={() => patch({ common: true, people: [] })}
          >
            通用（所有人员）
          </button>
          {people.map(p => {
            const on = !draft.common && (draft.people ?? []).includes(p.id)
            return (
              <button
                key={p.id}
                type="button"
                className={on ? 'chip chip-on' : 'chip'}
                onClick={() =>
                  patch({
                    common: false,
                    people: on
                      ? (draft.people ?? []).filter(x => x !== p.id)
                      : [...(draft.people ?? []), p.id],
                  })
                }
              >
                {p.name}
              </button>
            )
          })}
        </div>
        {people.length === 0 && <div className="dim">尚未创建人员，可在顶部「管理人员」添加</div>}
      </Field>

      {draft.type === 'pack' && (
        <>
          <Field label="源路径（目录或文件，支持 ${VAR} 环境变量）">
            <PathRow value={draft.source} onChange={v => patch({ source: v })} pick="both" placeholder="${USERPROFILE}/.claude" />
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
            <PathRow value={draft.zip} onChange={v => patch({ zip: v })} pick="packageFile" placeholder="claude.zip" />
          </Field>
          <Field label="目标目录（支持 ${VAR} 环境变量）">
            <PathRow value={draft.target} onChange={v => patch({ target: v })} pick="dir" placeholder="${USERPROFILE}/.claude" />
          </Field>
          <Field label="写入方式">
            <select value={draft.mode ?? 'replace'} onChange={e => patch({ mode: e.target.value as ImportMode })}>
              <option value="replace">替换 — 清空目标后解压（默认）</option>
              <option value="merge">叠加 — 不清空，覆盖同名、保留其余（多个 zip 合并到同一文件夹）</option>
            </select>
          </Field>
          <Field label="重命名（仅非 zip 单文件生效，留空保持原名）">
            <input value={draft.rename} onChange={e => patch({ rename: e.target.value })} />
          </Field>
          <Field label="保留（导入时保留目标目录中匹配的文件/目录，优先于 zip 内容）">
            <TagInput value={draft.preserve} onChange={v => patch({ preserve: v })} placeholder="输入后回车添加" />
          </Field>
          <label className="check-item">
            <input type="checkbox" checked={draft.backup ?? true} onChange={e => patch({ backup: e.target.checked })} />
            <span>导入前备份到 exe 目录 backups/（多次备份自动加时间戳，不勾则直接覆盖）</span>
          </label>
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
              <option value="delete">delete — 删除指定 key（点路径）</option>
            </select>
          </Field>
          {draft.op === 'delete' ? (
            <Field label="要删除的 key（点路径如 a.b.c，逐条回车添加；不存在的会自动跳过）">
              <KeyPathList value={draft.keys ?? []} onChange={v => patch({ keys: v })} placeholder="a.b.c" />
            </Field>
          ) : (
            <>
              {(draft.op === 'overwrite' || draft.op === 'upsert') && (
                <Field label="保留（覆盖/合并时保持原文件的这些 key，点路径如 a.b.c）">
                  <KeyPathList value={draft.preserve ?? []} onChange={v => patch({ preserve: v })} placeholder="a.b.c" />
                </Field>
              )}
              <Field label="数据（JSON 对象，嵌套对象逐层合并）">
                <textarea rows={10} value={jsonText} spellCheck={false} onChange={e => setJsonText(e.target.value)} />
              </Field>
            </>
          )}
        </>
      )}

      {draft.type === 'env' && (
        <>
          <Field label="作用域">
            <select value={draft.scope ?? 'user'} onChange={e => patch({ scope: e.target.value as EnvScope })}>
              <option value="user">用户级（HKCU，免管理员）</option>
              <option value="machine">机器级（HKLM，需管理员）</option>
            </select>
          </Field>
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
              <option value="remove">remove — 删除变量 / 从 PATH 移除该值</option>
            </select>
          </Field>
          {draft.op === 'append_path' && (
            <Field label="插入位置">
              <select value={draft.pathPosition ?? 'append'} onChange={e => patch({ pathPosition: e.target.value as PathPosition })}>
                <option value="append">追加到末尾</option>
                <option value="prepend">插入到最前（优先生效）</option>
              </select>
            </Field>
          )}
        </>
      )}

      {draft.type === 'run' && (
        <>
          <Field label="Shell">
            <select value={draft.shell} onChange={e => patch({ shell: e.target.value as RunShell })}>
              <option value="powershell">PowerShell</option>
              <option value="cmd">CMD</option>
            </select>
          </Field>
          <Field label="命令（多行脚本，支持 ${VAR} 环境变量）">
            <textarea rows={8} value={draft.command} spellCheck={false} onChange={e => patch({ command: e.target.value })} />
          </Field>
          <Field label="工作目录（可选，支持 ${VAR}）">
            <PathRow value={draft.cwd} onChange={v => patch({ cwd: v })} pick="dir" />
          </Field>
          <label className="check-item">
            <input type="checkbox" checked={draft.elevated} onChange={e => patch({ elevated: e.target.checked })} />
            <span>以管理员身份运行（非管理员时会弹 UAC）</span>
          </label>
        </>
      )}

      {draft.type === 'download' && (
        <>
          <Field label="下载地址（http/https）">
            <input value={draft.url} placeholder="https://example.com/tool.zip" onChange={e => patch({ url: e.target.value })} />
          </Field>
          <Field label="保存到（支持 ${VAR} 环境变量）">
            <PathRow value={draft.target} onChange={v => patch({ target: v })} pick="file" placeholder="${USERPROFILE}/Downloads/tool.zip" />
          </Field>
          <label className="check-item">
            <input type="checkbox" checked={draft.overwrite} onChange={e => patch({ overwrite: e.target.checked })} />
            <span>已存在时覆盖重新下载</span>
          </label>
        </>
      )}

      {errors.length > 0 && (
        <div className="form-errors">
          {errors.map((e, i) => (
            <div key={i}>• {e}</div>
          ))}
        </div>
      )}

      {showVars && <VarReference onClose={() => setShowVars(false)} />}
    </Modal>
  )
}
