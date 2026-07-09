import { describe, expect, it } from 'vitest'
import { expandVars } from '../electron/core/vars'

describe('expandVars', () => {
  it('展开已定义的变量', () => {
    expect(expandVars('${HOME}/x', { HOME: 'C:\\Users\\a' })).toBe('C:\\Users\\a/x')
  })
  it('同一字符串支持多个变量', () => {
    expect(expandVars('${A}-${B}', { A: '1', B: '2' })).toBe('1-2')
  })
  it('未定义变量抛出错误', () => {
    expect(() => expandVars('${NOPE}', {})).toThrow('未定义的环境变量: NOPE')
  })
  it('无占位符原样返回', () => {
    expect(expandVars('plain/path', {})).toBe('plain/path')
  })
  it('默认使用 process.env', () => {
    process.env.__VARS_TEST__ = 'ok'
    expect(expandVars('${__VARS_TEST__}')).toBe('ok')
    delete process.env.__VARS_TEST__
  })
})
