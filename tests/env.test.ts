import { describe, expect, it } from 'vitest'
import {
  ENV_KEY, ENV_USER_KEY, regRoot, isProtectedVar,
  buildReadScript, buildWriteScript, buildDeleteScript,
  mergePath, removePath, psQuote,
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

describe('regRoot', () => {
  it('user→HKCU，machine→HKLM', () => {
    expect(regRoot('user')).toBe(ENV_USER_KEY)
    expect(regRoot('machine')).toBe(ENV_KEY)
  })
})

describe('mergePath 位置', () => {
  it('prepend 插到最前', () => {
    expect(mergePath('C:\\a;C:\\b', 'C:\\c', 'prepend'))
      .toEqual({ value: 'C:\\c;C:\\a;C:\\b', changed: true })
  })
  it('append 追加到末尾（默认）', () => {
    expect(mergePath('C:\\a', 'C:\\c').value).toBe('C:\\a;C:\\c')
  })
})

describe('removePath', () => {
  it('大小写/尾斜杠不敏感移除', () => {
    expect(removePath('C:\\a;C:\\Tools\\;D:\\x', 'c:\\tools'))
      .toEqual({ value: 'C:\\a;D:\\x', changed: true })
  })
  it('不含则不变', () => {
    expect(removePath('C:\\a;C:\\b', 'C:\\z').changed).toBe(false)
  })
})

describe('isProtectedVar', () => {
  it('保护重要系统变量（大小写不敏感）', () => {
    expect(isProtectedVar('Path')).toBe(true)
    expect(isProtectedVar('PATH')).toBe(true)
    expect(isProtectedVar('TEMP')).toBe(true)
    expect(isProtectedVar('USERPROFILE')).toBe(true)
  })
  it('普通变量不受保护', () => {
    expect(isProtectedVar('MY_VAR')).toBe(false)
    expect(isProtectedVar('ENVDEPLOY_X')).toBe(false)
  })
})

describe('buildWriteScript', () => {
  it('常规值用 REG_SZ 写入，并用非阻塞 SendNotifyMessage 广播（不用阻塞的 SendMessageTimeout）', () => {
    const s = buildWriteScript('user', 'MY_VAR', 'hello')
    expect(s).toContain('Set-ItemProperty')
    expect(s).toContain('-Type String')
    expect(s).toContain(ENV_USER_KEY)
    expect(s).toContain('SendNotifyMessage')
    expect(s).not.toContain('SendMessageTimeout')
  })
  it('机器级写入 HKLM root', () => {
    expect(buildWriteScript('machine', 'MY_VAR', 'hello')).toContain(ENV_KEY)
  })
  it('含 % 的值用 ExpandString 保留展开语义', () => {
    expect(buildWriteScript('user', 'P', '%SystemRoot%\\bin')).toContain('-Type ExpandString')
  })
})

describe('buildDeleteScript', () => {
  it('用 Remove-ItemProperty 删除并非阻塞广播', () => {
    const s = buildDeleteScript('user', 'MY_VAR')
    expect(s).toContain('Remove-ItemProperty')
    expect(s).toContain('MY_VAR')
    expect(s).toContain(ENV_USER_KEY)
    expect(s).toContain('SendNotifyMessage')
    expect(s).not.toContain('SendMessageTimeout')
  })
})

describe('buildReadScript(root,...)', () => {
  it('读原始值不展开', () => {
    const s = buildReadScript(ENV_KEY, 'Path')
    expect(s).toContain('DoNotExpandEnvironmentNames')
    expect(s).toContain("'Path'")
  })
})
