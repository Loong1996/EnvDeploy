import { describe, expect, it } from 'vitest'
import { isExcluded, normalizePatterns } from '../electron/core/match'

describe('normalizePatterns', () => {
  it('清洗模式列表', () => {
    expect(normalizePatterns([' plugins/ ', 'a\\b\\', '', '  '])).toEqual(['plugins', 'a/b'])
  })
  it('空输入返回空数组', () => {
    expect(normalizePatterns(undefined)).toEqual([])
    expect(normalizePatterns([])).toEqual([])
  })
})

describe('isExcluded', () => {
  it('纯名字模式匹配任意层级的文件名', () => {
    expect(isExcluded('a/b/node_modules', 'node_modules', ['node_modules'])).toBe(true)
    expect(isExcluded('a/b/keep.txt', 'keep.txt', ['node_modules'])).toBe(false)
  })
  it('含斜杠的模式匹配相对路径', () => {
    expect(isExcluded('src/tmp/x.txt', 'x.txt', ['src/tmp/*'])).toBe(true)
    expect(isExcluded('other/tmp/x.txt', 'x.txt', ['src/tmp/*'])).toBe(false)
  })
  it('反斜杠相对路径也能匹配', () => {
    expect(isExcluded('src\\tmp\\x.txt', 'x.txt', ['src/tmp/*'])).toBe(true)
  })
  it('dot 文件可被通配符匹配', () => {
    expect(isExcluded('.claude.json', '.claude.json', ['*.json'])).toBe(true)
  })
  it('大小写不敏感', () => {
    expect(isExcluded('README.MD', 'README.MD', ['*.md'])).toBe(true)
  })
  it('空模式列表永远不匹配', () => {
    expect(isExcluded('a.txt', 'a.txt', [])).toBe(false)
  })

  describe('./ 锚定到根', () => {
    it('./ 前缀只匹配根层文件，不波及子目录同名', () => {
      expect(isExcluded('foo.log', 'foo.log', ['./foo.log'])).toBe(true)
      expect(isExcluded('sub/foo.log', 'foo.log', ['./foo.log'])).toBe(false)
    })
    it('裸名字仍匹配所有层级同名（保持原行为）', () => {
      expect(isExcluded('foo.log', 'foo.log', ['foo.log'])).toBe(true)
      expect(isExcluded('sub/foo.log', 'foo.log', ['foo.log'])).toBe(true)
    })
    it('./ 前缀锚定根层目录，不波及子目录同名', () => {
      expect(isExcluded('logs', 'logs', ['./logs'])).toBe(true)
      expect(isExcluded('sub/logs', 'logs', ['./logs'])).toBe(false)
    })
    it('./ 后接多段路径等价于该相对路径', () => {
      expect(isExcluded('a/b.txt', 'b.txt', ['./a/b.txt'])).toBe(true)
      expect(isExcluded('x/a/b.txt', 'b.txt', ['./a/b.txt'])).toBe(false)
    })
    it('./ 前缀支持通配符', () => {
      expect(isExcluded('a.log', 'a.log', ['./*.log'])).toBe(true)
      expect(isExcluded('sub/a.log', 'a.log', ['./*.log'])).toBe(false)
    })
  })
})
