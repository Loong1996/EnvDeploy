import { describe, expect, it } from 'vitest'
import {
  ENV_KEY, buildReadScript, buildSetScript, mergePath, psQuote,
} from '../electron/core/executors/env'

describe('psQuote', () => {
  it('单引号包裹并转义内部单引号', () => {
    expect(psQuote("a'b")).toBe("'a''b'")
    expect(psQuote('plain')).toBe("'plain'")
  })
})

describe('mergePath', () => {
  it('追加新路径', () => {
    expect(mergePath('C:\\a;C:\\b', 'C:\\c')).toEqual({ value: 'C:\\a;C:\\b;C:\\c', changed: true })
  })
  it('大小写与尾斜杠不敏感去重', () => {
    expect(mergePath('C:\\Tools\\;D:\\x', 'c:\\tools').changed).toBe(false)
  })
  it('空当前值直接成为唯一项', () => {
    expect(mergePath('', 'C:\\c')).toEqual({ value: 'C:\\c', changed: true })
  })
  it('清理空段', () => {
    expect(mergePath('C:\\a;;C:\\b;', 'C:\\c').value).toBe('C:\\a;C:\\b;C:\\c')
  })
})

describe('buildSetScript', () => {
  it('普通值用 String 类型并包含广播', () => {
    const s = buildSetScript('MY_VAR', 'hello')
    expect(s).toContain('Set-ItemProperty')
    expect(s).toContain("-Type String")
    expect(s).toContain(ENV_KEY)
    expect(s).toContain('SendMessageTimeout')
  })
  it('含 % 的值用 ExpandString', () => {
    expect(buildSetScript('P', '%SystemRoot%\\bin')).toContain('-Type ExpandString')
  })
})

describe('buildReadScript', () => {
  it('读原始值不展开', () => {
    const s = buildReadScript('Path')
    expect(s).toContain('DoNotExpandEnvironmentNames')
    expect(s).toContain("'Path'")
  })
})
